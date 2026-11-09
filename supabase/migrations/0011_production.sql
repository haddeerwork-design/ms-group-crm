-- =====================================================================
-- MS El-brancy Group platform — Migration 0011: Production readiness
-- ---------------------------------------------------------------------
-- WHAT THIS DOES (additive only, nothing is deleted):
--   1. New logins get an employee profile automatically (no role yet).
--      The Super Admin then gives them a role in Team & Roles.
--      Existing logins without a profile get one now.
--   2. legacy_archive: a frozen, read-only copy of the current CRM data
--      (old quotations & invoices, activity log, customers, leads…), so the
--      history stays safe after the old CRM is switched off.
--      The Super Admin can refresh the copy from the app until then.
--      The old CRM's "users" records are NOT copied.
--   3. app_security_report(): a check the Super Admin can run from the app
--      to see any table without row-level security or any function that
--      someone who is not logged in could call.
--
-- WHAT THIS DOES NOT TOUCH: crm_records, profiles policies, the old CRM.
-- Requires 0010_research. Safe to run more than once.
-- =====================================================================

begin;

do $$ begin
  if not exists (select 1 from public.app_migrations where version = '0010_research') then
    raise exception 'Run 0010_research first.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Profile for every login
-- ---------------------------------------------------------------------
-- Runs last (name starts with zz_) and never blocks creating a user:
-- if anything goes wrong the login is still created and the Super Admin
-- sees it as "no profile" in the app.
create or replace function public.app_profile_on_signup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    insert into public.profiles (id, email, full_name)
    values (new.id, new.email, nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''))
    on conflict do nothing;
  exception when others then
    raise warning 'app_profile_on_signup skipped for %: %', new.email, sqlerrm;
  end;
  return new;
end $$;
revoke all on function public.app_profile_on_signup() from public, anon, authenticated;

drop trigger if exists zz_app_profile_on_signup on auth.users;
create trigger zz_app_profile_on_signup after insert on auth.users
  for each row execute function public.app_profile_on_signup();

do $$ begin
  insert into public.profiles (id, email)
  select u.id, u.email from auth.users u
   where not exists (select 1 from public.profiles p where p.id = u.id)
     and not exists (select 1 from public.profiles p where lower(p.email) = lower(u.email))
  on conflict do nothing;
exception when others then
  raise warning 'Profile backfill skipped: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- 2. Frozen copy of the current CRM
-- ---------------------------------------------------------------------
create table if not exists public.legacy_archive (
  record_type     text not null,
  record_key      text not null,
  data            jsonb not null,
  owner_legacy_id text,
  source_updated_at timestamptz,
  archived_at     timestamptz not null default now(),
  primary key (record_type, record_key)
);
create index if not exists legacy_archive_owner_idx on public.legacy_archive (owner_legacy_id);
alter table public.legacy_archive enable row level security;

-- Managers & finance see everything; others see only records they owned in the old CRM.
drop policy if exists legacy_archive_select on public.legacy_archive;
create policy legacy_archive_select on public.legacy_archive for select to authenticated using (
  public.app_has_any_role(array['super_admin', 'sales_manager', 'finance_officer']::public.app_role[])
  or (public.app_is_member() and owner_legacy_id is not null
      and owner_legacy_id = (select p.legacy_id from public.profiles p where p.id = auth.uid()))
);
-- No insert/update/delete policies: only refresh_legacy_archive() writes.

create or replace function public.refresh_legacy_archive()
returns table (record_type text, copied integer)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.app_is_super_admin() then
    raise exception 'Only the Super Admin can refresh the archive.' using errcode = '42501';
  end if;
  return query
  with up as (
    insert into public.legacy_archive as a (record_type, record_key, data, owner_legacy_id, source_updated_at, archived_at)
    select r.record_type, r.record_key, r.data, r.owner_legacy_id, r.updated_at, now()
      from public.crm_records r
     where r.record_type is not null and r.record_key is not null and r.data is not null
       and r.record_type <> 'users'
    on conflict on constraint legacy_archive_pkey do update
      set data = excluded.data, owner_legacy_id = excluded.owner_legacy_id,
          source_updated_at = excluded.source_updated_at, archived_at = now()
      where a.data is distinct from excluded.data
    returning a.record_type
  )
  select up.record_type, count(*)::int from up group by up.record_type order by 1;
end $$;
revoke all on function public.refresh_legacy_archive() from public, anon;
grant execute on function public.refresh_legacy_archive() to authenticated;

select * from public.refresh_legacy_archive();

-- ---------------------------------------------------------------------
-- 3. Lock privileged functions to logged-in users
-- ---------------------------------------------------------------------
-- Postgres lets everyone call a new function by default. Our privileged
-- (SECURITY DEFINER) helpers already refuse to do anything useful without a
-- login, but numbering functions could still be called to skip numbers.
-- Remove that door for people who are not logged in. The old CRM's own
-- functions are left exactly as they are.
do $$ declare f record; begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and p.proname not in ('current_crm_role', 'current_crm_legacy_id', 'is_crm_admin', 'app_profile_on_signup')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f.sig);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. Security self-check
-- ---------------------------------------------------------------------
create or replace function public.app_security_report()
returns table (severity text, kind text, object text, detail text)
language plpgsql stable security definer set search_path = public as $$
declare
  legacy text[] := array['profiles', 'crm_records', 'current_crm_role', 'current_crm_legacy_id', 'is_crm_admin'];
begin
  if not public.app_is_super_admin() then
    raise exception 'Only the Super Admin can run the security check.' using errcode = '42501';
  end if;
  return query
  -- tables without row-level security
  select case when c.relname = any(legacy) then 'legacy' else 'high' end, 'table without RLS', c.relname::text,
         'Anyone with the public key could read or change it.'
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  union all
  -- policies that apply to people who are not logged in
  select case when p.tablename = any(legacy) then 'legacy' else 'high' end, 'policy for anonymous users', p.tablename || ' / ' || p.policyname,
         'Applies to: ' || array_to_string(p.roles, ', ')
    from pg_policies p
   where p.schemaname = 'public' and (p.roles && array['anon', 'public']::name[])
  union all
  -- privileged functions callable without logging in
  select case when f.proname = any(legacy) then 'legacy' else 'medium' end, 'function callable without login', f.proname::text,
         'SECURITY DEFINER function executable by anon.'
    from pg_proc f join pg_namespace n on n.oid = f.pronamespace
   where n.nspname = 'public' and f.prosecdef and has_function_privilege('anon', f.oid, 'execute')
  order by 1, 2, 3;
end $$;
revoke all on function public.app_security_report() from public, anon;
grant execute on function public.app_security_report() to authenticated;

insert into public.app_migrations (version) values ('0011_production') on conflict do nothing;

commit;

select 'Production readiness installed' as status;
