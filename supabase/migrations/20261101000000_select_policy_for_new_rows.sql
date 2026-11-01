-- Fix: "new row violates row-level security policy for table diagrams" beim Anlegen.
--
-- Der Client legt mit insert ... returning an. Dabei prüft Postgres die SELECT-Policy
-- auch für die neue Zeile. diagram_role(id) / folder_role(id) schlagen die Zeile aber in
-- der Tabelle nach, und dort ist sie im Snapshot desselben Statements noch nicht sichtbar.
-- Deshalb prüft die Policy zuerst Spalten der Zeile selbst (owner_id, folder_id), die
-- Funktionen bleiben für Freigaben zuständig. Die Rechte ändern sich dadurch nicht:
-- Besitzer und Empfänger einer Ordnerfreigabe hatten das Lesen schon vorher.

drop policy diagrams_select on public.diagrams;
create policy diagrams_select on public.diagrams for select to authenticated
  using (
    owner_id = (select auth.uid())
    or (folder_id is not null and public.folder_role(folder_id) is not null)
    or public.diagram_role(id) is not null
  );

drop policy folders_select on public.folders;
create policy folders_select on public.folders for select to authenticated
  using (
    owner_id = (select auth.uid())
    or public.folder_role(id) is not null
  );
