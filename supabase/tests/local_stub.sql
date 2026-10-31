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
