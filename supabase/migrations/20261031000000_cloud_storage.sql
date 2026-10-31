-- Cloud-Speicher für den Mermaid Editor: Profile, Ordner, Diagramme und Freigaben.
--
-- Rechte-Modell (alles wird in der Datenbank per Row-Level-Security erzwungen):
--   owner  – darf alles: ansehen, ändern, verschieben, löschen, teilen
--   editor – darf Inhalt und Namen eines Diagramms ändern
--   viewer – darf ansehen
-- Eine Freigabe auf einen Ordner gilt für alles darin (Unterordner und Diagramme).
-- Ordner anlegen, Verschieben und Löschen darf nur der Besitzer. Bearbeiter eines Ordners
-- dürfen darin neue Diagramme anlegen; diese gehören dem Besitzer des Ordners
-- (created_by hält fest, wer sie angelegt hat).

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  display_name text,
  created_at   timestamptz not null default now()
);

create table public.folders (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  parent_id  uuid references public.folders (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index folders_owner_idx  on public.folders (owner_id);
create index folders_parent_idx on public.folders (parent_id);

create table public.diagrams (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  folder_id  uuid references public.folders (id) on delete cascade,  -- null = oberste Ebene des Besitzers
  name       text not null check (char_length(btrim(name)) between 1 and 200),
  content    text not null default '' check (octet_length(content) <= 2000000),
  version    integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);
create index diagrams_owner_idx  on public.diagrams (owner_id);
create index diagrams_folder_idx on public.diagrams (folder_id);

create table public.shares (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  folder_id  uuid references public.folders (id) on delete cascade,
  diagram_id uuid references public.diagrams (id) on delete cascade,
  grantee_id uuid not null references auth.users (id) on delete cascade,
  role       text not null check (role in ('viewer', 'editor')),
  created_at timestamptz not null default now(),
  check ((folder_id is null) <> (diagram_id is null)),  -- genau eines von beiden
  check (grantee_id <> owner_id),
  unique (folder_id, grantee_id),
  unique (diagram_id, grantee_id)
);
create index shares_grantee_idx on public.shares (grantee_id);

-- ---------------------------------------------------------------------------
-- Rechte-Funktionen: Rolle des angemeldeten Nutzers für einen Ordner / ein Diagramm.
-- Sie nehmen bewusst keine Nutzer-ID entgegen, sonst ließen sich damit die
-- Freigaben anderer Nutzer ausforschen. Ergebnis: 'owner' | 'editor' | 'viewer' | null
-- ---------------------------------------------------------------------------

create function public.folder_role(fid uuid) returns text
language sql stable security definer set search_path = ''
as $$
  with recursive up (id, parent_id, owner_id) as (
    select f.id, f.parent_id, f.owner_id from public.folders f where f.id = fid
    union  -- (nicht "union all": beendet auch eine fehlerhafte, zyklische Kette)
    select f.id, f.parent_id, f.owner_id
    from public.folders f join up on f.id = up.parent_id
  )
  select case
    when bool_or(up.owner_id = (select auth.uid())) then 'owner'
    when bool_or(s.role = 'editor')                  then 'editor'
    when bool_or(s.role = 'viewer')                  then 'viewer'
  end
  from up
  left join public.shares s
    on s.folder_id = up.id and s.grantee_id = (select auth.uid())
$$;

create function public.diagram_role(did uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when d.owner_id = (select auth.uid()) then 'owner'
    else (
      select case
        when 'owner'  = any (r.roles) then 'owner'
        when 'editor' = any (r.roles) then 'editor'
        when 'viewer' = any (r.roles) then 'viewer'
      end
      from (
        select array[
          (select s.role from public.shares s
            where s.diagram_id = d.id and s.grantee_id = (select auth.uid())),
          public.folder_role(d.folder_id)
        ] as roles
      ) r
    )
  end
  from public.diagrams d
  where d.id = did
$$;

-- Nutzer per exakter E-Mail-Adresse finden (zum Teilen). Kein Durchsuchen aller Konten.
create function public.find_user_by_email(p_email text)
returns table (id uuid, email text, display_name text)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.email, p.display_name
  from public.profiles p
  where (select auth.uid()) is not null
    and lower(p.email) = lower(btrim(p_email))
    and p.id <> (select auth.uid())
$$;

-- ---------------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------------

-- Profil automatisch anlegen, sobald ein Konto entsteht (Einladung angenommen).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, coalesce(new.email, ''));
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Diagramme in einem Ordner gehören immer dem Besitzer des Ordners, auch wenn ein
-- Bearbeiter sie anlegt. Ob er das darf, prüft die Insert-Policy.
create function public.diagrams_before_insert() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.folder_id is not null then
    select f.owner_id into new.owner_id from public.folders f where f.id = new.folder_id;
  end if;
  return new;
end
$$;

create trigger diagrams_before_insert
  before insert on public.diagrams
  for each row execute function public.diagrams_before_insert();

-- Diagramme: Besitzer und ID sind fix; nur der Besitzer verschiebt; Version zählt hoch.
create function public.diagrams_before_update() returns trigger
language plpgsql set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if new.id is distinct from old.id or new.owner_id is distinct from old.owner_id then
    raise exception 'id und owner_id lassen sich nicht ändern' using errcode = '42501';
  end if;
  if uid is not null and uid is distinct from old.owner_id
     and new.folder_id is distinct from old.folder_id then
    raise exception 'Nur der Besitzer darf ein Diagramm verschieben' using errcode = '42501';
  end if;
  new.created_at := old.created_at;
  new.version    := old.version + 1;
  new.updated_at := now();
  new.updated_by := uid;
  return new;
end
$$;

create trigger diagrams_before_update
  before update on public.diagrams
  for each row execute function public.diagrams_before_update();

-- Ordner: Besitzer fix, keine Zyklen, Zeitstempel.
create function public.folders_before_update() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.owner_id is distinct from old.owner_id then
    raise exception 'id und owner_id lassen sich nicht ändern' using errcode = '42501';
  end if;
  if new.parent_id is not null and new.parent_id is distinct from old.parent_id then
    if new.parent_id = new.id or exists (
      with recursive up (id, parent_id) as (
        select f.id, f.parent_id from public.folders f where f.id = new.parent_id
        union
        select f.id, f.parent_id from public.folders f join up on f.id = up.parent_id
      )
      select 1 from up where up.id = new.id
    ) then
      raise exception 'Ein Ordner kann nicht in sich selbst oder einen Unterordner verschoben werden'
        using errcode = '23514';
    end if;
  end if;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end
$$;

create trigger folders_before_update
  before update on public.folders
  for each row execute function public.folders_before_update();

-- ---------------------------------------------------------------------------
-- Row-Level-Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.folders  enable row level security;
alter table public.diagrams enable row level security;
alter table public.shares   enable row level security;

-- Profile: das eigene sowie die von Personen, mit denen man etwas teilt oder die etwas mit einem teilen.
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.shares s
      where (s.owner_id = (select auth.uid()) and s.grantee_id = profiles.id)
         or (s.grantee_id = (select auth.uid()) and s.owner_id = profiles.id)
    )
  );
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Ordner
create policy folders_select on public.folders for select to authenticated
  using (public.folder_role(id) is not null);
create policy folders_insert on public.folders for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (parent_id is null or public.folder_role(parent_id) = 'owner')
  );
create policy folders_update on public.folders for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (parent_id is null or public.folder_role(parent_id) = 'owner')
  );
create policy folders_delete on public.folders for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Diagramme
create policy diagrams_select on public.diagrams for select to authenticated
  using (public.diagram_role(id) is not null);
-- Anlegen: auf der obersten Ebene nur für sich selbst, in einem Ordner mit mindestens Bearbeiter-Rolle
-- (owner_id setzt dann der Trigger auf den Besitzer des Ordners).
create policy diagrams_insert on public.diagrams for insert to authenticated
  with check (
    (folder_id is null and owner_id = (select auth.uid()))
    or (folder_id is not null and public.folder_role(folder_id) in ('owner', 'editor'))
  );
-- Ändern dürfen Besitzer (auch Verschieben) und Bearbeiter (Inhalt/Name; der Trigger sperrt Verschieben).
create policy diagrams_update on public.diagrams for update to authenticated
  using (public.diagram_role(id) in ('owner', 'editor'))
  with check (
    (owner_id = (select auth.uid())
       and (folder_id is null or public.folder_role(folder_id) = 'owner'))
    or public.diagram_role(id) = 'editor'
  );
create policy diagrams_delete on public.diagrams for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Freigaben: Besitzer verwalten sie; Empfänger sehen sie und können sie verlassen.
create policy shares_select on public.shares for select to authenticated
  using (owner_id = (select auth.uid()) or grantee_id = (select auth.uid()));
create policy shares_insert on public.shares for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (
      (folder_id  is not null and public.folder_role(folder_id)   = 'owner')
      or (diagram_id is not null and public.diagram_role(diagram_id) = 'owner')
    )
  );
create policy shares_update on public.shares for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy shares_delete on public.shares for delete to authenticated
  using (owner_id = (select auth.uid()) or grantee_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Berechtigungen: Supabase vergibt standardmäßig alles an anon/authenticated,
-- deshalb zuerst entziehen und dann gezielt vergeben.
-- ---------------------------------------------------------------------------

revoke all on public.profiles, public.folders, public.diagrams, public.shares from anon, authenticated;

grant select                         on public.profiles to authenticated;
grant update (display_name)          on public.profiles to authenticated;
grant select, insert, update, delete on public.folders  to authenticated;
grant select, insert, update, delete on public.diagrams to authenticated;
grant select, insert, delete         on public.shares   to authenticated;
grant update (role)                  on public.shares   to authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.folder_role(uuid),
  public.diagram_role(uuid),
  public.find_user_by_email(text)
to authenticated;
