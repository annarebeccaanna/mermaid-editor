-- Wer darf neue Personen einladen? Die Liste der Administratoren.
--
-- Die Tabelle ist von der Browser-Schnittstelle aus weder les- noch schreibbar. Nur die Funktion is_admin()
-- (für die Oberfläche: soll der Menüpunkt "Person einladen" erscheinen?) und die Server-Funktion
-- "invite-user" (mit dem Service-Schlüssel) sehen hinein. Den ersten Administrator trägt man einmalig im
-- SQL-Editor ein, siehe supabase/README.md.

create table public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security; -- bewusst ohne Policies: über die API kommt niemand heran
revoke all on public.admins from anon, authenticated;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
$$;

revoke execute on function public.is_admin() from public, anon;
grant  execute on function public.is_admin() to authenticated;
