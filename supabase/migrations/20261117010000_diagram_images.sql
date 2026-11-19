-- Bilder in Diagrammen: ein privater Speicher-Bucket, dessen Zugriff sich aus den Rechten des Diagramms ergibt.
--
-- Pfad jeder Datei: <diagramm-id>/<zufälliger-name>.<endung>
--   ansehen: alle, die das Diagramm sehen dürfen (Besitzer, Bearbeiter, Betrachter, auch über Ordner)
--   hochladen und löschen: Besitzer und Bearbeiter des Diagramms
-- Überschreiben gibt es nicht; ein ersetztes Bild ist eine neue Datei.
-- Im Diagramm steht das Bild als Verweis "cloud:<diagramm-id>/<name>"; die Anzeige holt eine kurzlebige signierte Adresse.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'diagram-images', 'diagram-images', false,
  5 * 1024 * 1024,
  array['image/png', 'image/jpeg', 'image/gif', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Die erste Pfad-Komponente als Diagramm-ID; null, wenn sie keine ist (statt eines Fehlers in der Policy).
create function public.diagram_id_of_path(object_name text) returns uuid
language plpgsql immutable set search_path = ''
as $$
begin
  return ((storage.foldername(object_name))[1])::uuid;
exception when others then
  return null;
end
$$;

revoke execute on function public.diagram_id_of_path(text) from public, anon;
grant  execute on function public.diagram_id_of_path(text) to authenticated;

create policy diagram_images_select on storage.objects for select to authenticated
  using (bucket_id = 'diagram-images' and public.diagram_role(public.diagram_id_of_path(name)) is not null);

create policy diagram_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'diagram-images' and public.diagram_role(public.diagram_id_of_path(name)) in ('owner', 'editor'));

create policy diagram_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'diagram-images' and public.diagram_role(public.diagram_id_of_path(name)) in ('owner', 'editor'));
