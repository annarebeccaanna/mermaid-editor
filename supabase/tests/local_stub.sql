-- Nur für lokale Tests auf einem leeren Postgres: bildet die Teile von Supabase nach,
-- auf die sich die Migration stützt (Rollen, auth.users, auth.uid()).
-- NICHT in einem echten Supabase-Projekt ausführen.

do $$
begin
  if not exists (select from pg_roles where rolname = 'anon')          then create role anon          nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'service_role')  then create role service_role  nologin bypassrls; end if;
end $$;

create schema auth;
create table auth.users (
  id    uuid primary key,
  email text
);

create function auth.uid() returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

grant usage on schema auth   to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Speicher (Supabase Storage), soweit die Migration ihn braucht: Buckets, Objekte und storage.foldername().
create schema storage;
create table storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name      text,
  owner     uuid default auth.uid(),
  metadata  jsonb
);
alter table storage.objects enable row level security;

-- wie bei Supabase: die Ordner eines Pfads ohne den Dateinamen
create function storage.foldername(name text) returns text[]
language sql immutable
as $$
  select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)]
$$;

grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
