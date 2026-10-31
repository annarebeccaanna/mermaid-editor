-- Tests für Rechte und Freigaben (siehe supabase/migrations).
-- Läuft in einer Transaktion und wird am Ende zurückgerollt; bricht beim ersten Fehler ab.
-- Lokal: supabase/tests/run-local.sh

begin;

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function tests.anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
end $$;

create function tests.logout() returns void language plpgsql as $$
begin
  execute 'reset role';
end $$;

create function tests.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FEHLGESCHLAGEN: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;

create function tests.rows(q text) returns integer language plpgsql as $$
declare n integer;
begin
  execute 'select count(*) from (' || q || ') t' into n;
  return n;
end $$;

-- Anzahl der Zeilen, die ein insert/update/delete tatsächlich betrifft (RLS blendet Zeilen still aus).
create function tests.affected(q text) returns integer language plpgsql as $$
declare n integer;
begin
  execute q;
  get diagnostics n = row_count;
  return n;
end $$;

-- Die Anweisung muss mit einem Fehler scheitern.
create function tests.denied(q text, msg text) returns void language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    raise notice 'ok - % [%]', msg, sqlerrm;
    return;
  end;
  raise exception 'FEHLGESCHLAGEN (kein Fehler): %', msg;
end $$;

grant execute on all functions in schema tests to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Testdaten: drei Nutzer
--   A = Besitzerin, B und C = eingeladene Personen
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'c@example.com');

do $t$ begin
  perform tests.ok((select count(*) from public.profiles) = 3, 'Profile werden automatisch angelegt');
end $t$;

-- ---------------------------------------------------------------------------
-- Profile und Nutzersuche
-- ---------------------------------------------------------------------------
do $t$ begin
  perform tests.login('00000000-0000-0000-0000-00000000000a');
  perform tests.ok(tests.rows('select 1 from public.profiles') = 1, 'Ohne Freigaben sieht A nur das eigene Profil');
  perform tests.ok(
    (select id from public.find_user_by_email(' B@Example.com ')) = '00000000-0000-0000-0000-00000000000b',
    'Suche per exakter E-Mail findet B (Groß-/Kleinschreibung egal)');
  perform tests.ok(tests.rows($q$select 1 from public.find_user_by_email('nobody@example.com')$q$) = 0, 'Unbekannte E-Mail liefert nichts');
  perform tests.ok(tests.rows($q$select 1 from public.find_user_by_email('a@example.com')$q$) = 0, 'Die eigene Adresse wird nicht gefunden');
  perform tests.logout();

  perform tests.anon();
  perform tests.denied($q$select * from public.find_user_by_email('b@example.com')$q$, 'Anonym darf nicht suchen');
  perform tests.denied($q$select * from public.folders$q$, 'Anonym hat keinen Zugriff auf Ordner');
  perform tests.denied($q$select * from public.diagrams$q$, 'Anonym hat keinen Zugriff auf Diagramme');
  perform tests.denied($q$select * from public.profiles$q$, 'Anonym hat keinen Zugriff auf Profile');
  perform tests.logout();
end $t$;

-- ---------------------------------------------------------------------------
-- A legt Ordner und Diagramme an
--   F1 "Kunde X"
--   └─ F2 "Entwürfe"
--      └─ D1 "Ablauf"
--   D2 "Architektur" (oberste Ebene), D3 "Privat" (oberste Ebene)
-- ---------------------------------------------------------------------------
do $t$ begin
  perform tests.login('00000000-0000-0000-0000-00000000000a');
  insert into public.folders (id, name) values ('f1000000-0000-0000-0000-000000000001', 'Kunde X');
  insert into public.folders (id, name, parent_id) values
    ('f2000000-0000-0000-0000-000000000002', 'Entwürfe', 'f1000000-0000-0000-0000-000000000001');
  insert into public.diagrams (id, name, content, folder_id) values
    ('d1000000-0000-0000-0000-000000000001', 'Ablauf',      E'flowchart TD\n A-->B', 'f2000000-0000-0000-0000-000000000002'),
    ('d2000000-0000-0000-0000-000000000002', 'Architektur', 'flowchart TD', null),
    ('d3000000-0000-0000-0000-000000000003', 'Privat',      'flowchart TD', null);
  perform tests.ok(tests.rows('select 1 from public.diagrams') = 3, 'A sieht ihre drei Diagramme');
  perform tests.ok((select owner_id from public.diagrams where id = 'd1000000-0000-0000-0000-000000000001') = '00000000-0000-0000-0000-00000000000a',
    'owner_id wird automatisch gesetzt');
  perform tests.logout();

  perform tests.login('00000000-0000-0000-0000-00000000000b');
  perform tests.ok(tests.rows('select 1 from public.folders') = 0, 'B sieht ohne Freigabe keine Ordner');
  perform tests.ok(tests.rows('select 1 from public.diagrams') = 0, 'B sieht ohne Freigabe keine Diagramme');
  perform tests.denied(
    $q$insert into public.diagrams (name, owner_id) values ('Fremd', '00000000-0000-0000-0000-00000000000a')$q$,
    'B kann kein Diagramm im Namen von A anlegen');
  perform tests.denied(
    $q$insert into public.diagrams (name, folder_id) values ('Reinschmuggeln', 'f1000000-0000-0000-0000-000000000001')$q$,
    'B kann nichts in As Ordner anlegen');
  perform tests.logout();
end $t$;

-- ---------------------------------------------------------------------------
-- Diagramm teilen (D2): erst Betrachter, dann Bearbeiter
-- ---------------------------------------------------------------------------
do $t$ begin
  perform tests.login('00000000-0000-0000-0000-00000000000a');
  insert into public.shares (diagram_id, grantee_id, role)
    values ('d2000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', 'viewer');
  perform tests.denied(
    $q$insert into public.shares (diagram_id, grantee_id, role) values ('d2000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', 'editor')$q$,
    'Dieselbe Person lässt sich nicht doppelt einladen');
  perform tests.denied(
    $q$insert into public.shares (diagram_id, grantee_id, role) values ('d2000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'editor')$q$,
    'Man kann nicht mit sich selbst teilen');
  perform tests.logout();

  perform tests.login('00000000-0000-0000-0000-00000000000b');
  perform tests.ok(tests.rows('select 1 from public.diagrams') = 1, 'B sieht genau das geteilte Diagramm');
  perform tests.ok(tests.rows($q$select 1 from public.diagrams where id = 'd3000000-0000-0000-0000-000000000003'$q$) = 0, 'B sieht das private Diagramm nicht');
  perform tests.ok(tests.rows('select 1 from public.profiles') = 2, 'B sieht sein Profil und das der Besitzerin');
  perform tests.ok(
    tests.affected($q$update public.diagrams set content = 'x' where id = 'd2000000-0000-0000-0000-000000000002'$q$) = 0,
    'Betrachter B kann den Inhalt nicht ändern');
  perform tests.ok(
    tests.affected($q$delete from public.diagrams where id = 'd2000000-0000-0000-0000-000000000002'$q$) = 0,
    'Betrachter B kann nicht löschen');
  perform tests.denied(
    $q$insert into public.shares (diagram_id, grantee_id, role) values ('d2000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000c', 'viewer')$q$,
    'Betrachter B kann nicht weiterteilen');
  perform tests.logout();

  perform tests.login('00000000-0000-0000-0000-00000000000a');
  perform tests.ok(
    tests.affected($q$update public.shares set role = 'editor' where diagram_id = 'd2000000-0000-0000-0000-000000000002'$q$) = 1,
    'A macht B zum Bearbeiter');
  perform tests.denied(
    $q$update public.shares set grantee_id = '00000000-0000-0000-0000-00000000000c' where diagram_id = 'd2000000-0000-0000-0000-000000000002'$q$,
    'Am Freigabe-Eintrag lässt sich nur die Rolle ändern');
  perform tests.logout();
end $t$;

-- ---------------------------------------------------------------------------
-- Bearbeiter B: Inhalt ja, alles andere nein; Versionsprüfung
-- ---------------------------------------------------------------------------
do $t$ begin
  perform tests.login('00000000-0000-0000-0000-00000000000b');
  perform tests.ok(
    tests.affected($q$update public.diagrams set content = 'flowchart LR' where id = 'd2000000-0000-0000-0000-000000000002' and version = 1$q$) = 1,
    'Bearbeiter B kann den Inhalt ändern');
  perform tests.ok((select version from public.diagrams where id = 'd2000000-0000-0000-0000-000000000002') = 2, 'Die Version steigt bei jedem Speichern');
  perform tests.ok((select updated_by from public.diagrams where id = 'd2000000-0000-0000-0000-000000000002') = '00000000-0000-0000-0000-00000000000b',
    'updated_by hält fest, wer gespeichert hat');
  perform tests.ok(
    tests.affected($q$update public.diagrams set content = 'veraltet' where id = 'd2000000-0000-0000-0000-000000000002' and version = 1$q$) = 0,
    'Speichern mit veraltetem Stand trifft keine Zeile (Konflikt)');
  perform tests.ok(
    tests.affected($q$update public.diagrams set name = 'Neu benannt' where id = 'd2000000-0000-0000-0000-000000000002' and version = 2$q$) = 1,
    'Bearbeiter B kann umbenennen');
  perform tests.denied(
    $q$update public.diagrams set folder_id = 'f1000000-0000-0000-0000-000000000001' where id = 'd2000000-0000-0000-0000-000000000002'$q$,
    'Bearbeiter B kann nicht verschieben');
  perform tests.denied(
    $q$update public.diagrams set owner_id = '00000000-0000-0000-0000-00000000000b' where id = 'd2000000-0000-0000-0000-000000000002'$q$,
    'Bearbeiter B kann sich nicht zum Besitzer machen');
  perform tests.ok(
    tests.affected($q$delete from public.diagrams where id = 'd2000000-0000-0000-0000-000000000002'$q$) = 0,
    'Bearbeiter B kann nicht löschen');
  perform tests.ok(
    tests.affected($q$update public.shares set role = 'viewer'$q$) = 0,
    'Bearbeiter B kann keine Freigaben ändern');
  perform tests.logout();
end $t$;

-- ---------------------------------------------------------------------------
-- Ordner teilen (F1) mit Vererbung: C bekommt F1, sieht auch F2 und D1
-- ---------------------------------------------------------------------------
do $t$ begin
  perform tests.login('00000000-0000-0000-0000-00000000000a');
  insert into public.shares (folder_id, grantee_id, role)
    values ('f1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'viewer');
  perform tests.logout();

  perform tests.login('00000000-0000-0000-0000-00000000000c');
  perform tests.ok(tests.rows('select 1 from public.folders') = 2, 'C sieht F1 und den Unterordner F2');
  perform tests.ok(tests.rows('select 1 from public.diagrams') = 1, 'C sieht das Diagramm im Unterordner, aber keine anderen');
  perform tests.ok(
    tests.affected($q$update public.diagrams set content = 'x' where id = 'd1000000-0000-0000-0000-000000000001'$q$) = 0,
    'Betrachter C kann das geerbte Diagramm nicht ändern');
  perform tests.denied(
    $q$insert into public.diagrams (name, folder_id) values ('Neu', 'f2000000-0000-0000-0000-000000000002')$q$,
    'Betrachter C kann im geteilten Ordner nichts anlegen');
  perform tests.logout();

  perform tests.login('00000000-0000-0000-0000-00000000000a');
  update public.shares set role = 'editor' where folder_id = 'f1000000-0000-0000-0000-000000000001';
  perform tests.logout();

  perform tests.login('00000000-0000-0000-0000-00000000000c');
  perform tests.ok(
    tests.affected($q$update public.diagrams set content = 'geerbt' where id = 'd1000000-0000-0000-0000-000000000001'$q$) = 1,
    'Bearbeiter C kann das geerbte Diagramm ändern');
  insert into public.diagrams (id, name, content, folder_id)
    values ('d4000000-0000-0000-0000-000000000004', 'Von C', 'flowchart TD', 'f2000000-0000-0000-0000-000000000002');
  perform tests.ok(
    (select owner_id from public.diagrams where id = 'd4000000-0000-0000-0000-000000000004') = '00000000-0000-0000-0000-00000000000a',
    'Bearbeiter C legt im geteilten Ordner ein Diagramm an; es gehört der Ordner-Besitzerin A');
  perform tests.ok(
    (select created_by from public.diagrams where id = 'd4000000-0000-0000-0000-000000000004') = '00000000-0000-0000-0000-00000000000c',
    'created_by hält fest, dass C es angelegt hat');
  perform tests.ok(
    tests.affected($q$update public.diagrams set content = 'weiter' where id = 'd4000000-0000-0000-0000-000000000004'$q$) = 1,
    'C kann das selbst angelegte Diagramm weiter bearbeiten');
  perform tests.ok(
    tests.affected($q$delete from public.diagrams where id = 'd4000000-0000-0000-0000-000000000004'$q$) = 0,
    'C kann das selbst angelegte Diagramm nicht löschen (nur der Besitzer)');
  insert into public.diagrams (id, name, folder_id, owner_id)
    values ('d5000000-0000-0000-0000-000000000005', 'Besitz erschleichen', 'f2000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000c');
  perform tests.ok(
    (select owner_id from public.diagrams where id = 'd5000000-0000-0000-0000-000000000005') = '00000000-0000-0000-0000-00000000000a',
    'Ein mitgegebenes owner_id im Ordner wird auf den Ordner-Besitzer zurückgesetzt');
  perform tests.denied(
    $q$insert into public.diagrams (name, owner_id) values ('Im Namen von A', '00000000-0000-0000-0000-00000000000a')$q$,
    'C kann auf oberster Ebene nichts im Namen von A anlegen');
  perform tests.ok(
    (select count(*) from public.diagrams where owner_id = '00000000-0000-0000-0000-00000000000c') = 0,
    'C besitzt keine Diagramme');
  perform tests.ok(
    tests.affected($q$update public.folders set name = 'Umbenannt' where id = 'f2000000-0000-0000-0000-000000000002'$q$) = 0,
    'Bearbeiter C kann Ordner nicht umbenennen');
  perform tests.ok(
    tests.affected($q$delete from public.diagrams where id = 'd1000000-0000-0000-0000-000000000001'$q$) = 0,
    'Bearbeiter C kann nicht löschen');
  perform tests.logout();
end $t$;

-- ---------------------------------------------------------------------------
-- Höchste Rolle gewinnt: direkt Betrachter, über den Ordner Bearbeiter
-- ---------------------------------------------------------------------------
do $t$ begin
  perform tests.login('00000000-0000-0000-0000-00000000000a');
  insert into public.shares (diagram_id, grantee_id, role)
    values ('d1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'viewer');
  perform tests.logout();

  perform tests.login('00000000-0000-0000-0000-00000000000c');
  perform tests.ok(public.diagram_role('d1000000-0000-0000-0000-000000000001') = 'editor', 'Höchste Rolle gewinnt (Ordner-Bearbeiter vor Diagramm-Betrachter)');
  perform tests.logout();

  perform tests.login('00000000-0000-0000-0000-00000000000a');
  delete from public.shares where diagram_id = 'd1000000-0000-0000-0000-000000000001';
  perform tests.logout();
end $t$;

-- ---------------------------------------------------------------------------
-- Ordnerstruktur: Zyklen verboten; Verschieben ändert die geerbten Rechte
-- ---------------------------------------------------------------------------
do $t$ begin
  perform tests.login('00000000-0000-0000-0000-00000000000a');
  perform tests.denied(
    $q$update public.folders set parent_id = 'f2000000-0000-0000-0000-000000000002' where id = 'f1000000-0000-0000-0000-000000000001'$q$,
    'Ein Ordner lässt sich nicht in seinen Unterordner verschieben');
  perform tests.denied(
    $q$update public.folders set parent_id = id where id = 'f1000000-0000-0000-0000-000000000001'$q$,
    'Ein Ordner lässt sich nicht in sich selbst verschieben');
  perform tests.ok(
    tests.affected($q$update public.folders set parent_id = null where id = 'f2000000-0000-0000-0000-000000000002'$q$) = 1,
    'A verschiebt F2 auf die oberste Ebene');
  perform tests.logout();

  perform tests.login('00000000-0000-0000-0000-00000000000c');
  perform tests.ok(tests.rows('select 1 from public.diagrams') = 0, 'C verliert den Zugriff, sobald F2 nicht mehr unter F1 liegt');
  perform tests.logout();

  perform tests.login('00000000-0000-0000-0000-00000000000a');
  update public.folders set parent_id = 'f1000000-0000-0000-0000-000000000001' where id = 'f2000000-0000-0000-0000-000000000002';
  perform tests.logout();
  perform tests.login('00000000-0000-0000-0000-00000000000c');
  perform tests.ok(tests.rows('select 1 from public.diagrams') = 3, 'C hat den Zugriff wieder (auch auf die selbst angelegten), nachdem F2 zurückverschoben wurde');
  perform tests.logout();
end $t$;

-- ---------------------------------------------------------------------------
-- Freigabe beenden: Besitzer entzieht, Empfänger verlässt
-- ---------------------------------------------------------------------------
do $t$ begin
  perform tests.login('00000000-0000-0000-0000-00000000000a');
  perform tests.ok(
    tests.affected($q$delete from public.shares where folder_id = 'f1000000-0000-0000-0000-000000000001'$q$) = 1,
    'A entzieht C die Ordner-Freigabe');
  perform tests.logout();
  perform tests.login('00000000-0000-0000-0000-00000000000c');
  perform tests.ok(tests.rows('select 1 from public.folders') = 0 and tests.rows('select 1 from public.diagrams') = 0,
    'C sieht danach nichts mehr');
  perform tests.logout();

  perform tests.login('00000000-0000-0000-0000-00000000000b');
  perform tests.ok(
    tests.affected($q$delete from public.shares where diagram_id = 'd2000000-0000-0000-0000-000000000002'$q$) = 1,
    'B verlässt das geteilte Diagramm selbst');
  perform tests.ok(tests.rows('select 1 from public.diagrams') = 0, 'B sieht es danach nicht mehr');
  perform tests.logout();
end $t$;

-- ---------------------------------------------------------------------------
-- Löschen: Ordner löschen entfernt Inhalt und Freigaben
-- ---------------------------------------------------------------------------
do $t$ begin
  perform tests.login('00000000-0000-0000-0000-00000000000a');
  insert into public.shares (diagram_id, grantee_id, role)
    values ('d1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'viewer');
  perform tests.ok(
    tests.affected($q$delete from public.folders where id = 'f1000000-0000-0000-0000-000000000001'$q$) = 1,
    'A löscht den Ordner F1');
  perform tests.logout();

  perform tests.ok((select count(*) from public.folders where id in ('f1000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000002')) = 0,
    'Auch der Unterordner ist weg');
  perform tests.ok((select count(*) from public.diagrams where id in ('d1000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000004', 'd5000000-0000-0000-0000-000000000005')) = 0, 'Die Diagramme darin sind weg');
  perform tests.ok((select count(*) from public.shares where diagram_id = 'd1000000-0000-0000-0000-000000000001') = 0, 'Die Freigabe darauf ist weg');
  perform tests.ok((select count(*) from public.diagrams) = 2, 'Die übrigen Diagramme bleiben');
end $t$;

rollback;
