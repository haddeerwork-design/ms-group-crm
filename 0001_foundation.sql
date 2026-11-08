-- =====================================================================
-- MS El-brancy Group platform — Migration 0001: Foundation
-- ---------------------------------------------------------------------
-- WHAT THIS DOES (additive only, nothing is deleted):
--   1. New role system (app_role + user_roles) that lives NEXT TO the old
--      profiles.role column. The old CRM keeps working exactly as before.
--   2. Copies every existing employee's old role into the new system:
--        ADMIN -> super_admin, SALES -> sales_officer, QUALITY -> quality_officer
--      and keeps it in sync when the old app changes a role.
--   3. company_settings (one row: name, slogan, contacts) editable by Super Admin.
--   4. audit_logs: automatic history of sensitive changes (Super Admin can read,
--      nobody can edit or delete).
--
-- WHAT THIS DOES NOT TOUCH: crm_records, its policies, profiles policies,
-- current_crm_role(), is_crm_admin(), current_crm_legacy_id().
--
-- Safe to run more than once.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Roles
-- ---------------------------------------------------------------------
do $$ begin
  create type public.app_role as enum (
    'super_admin', 'sales_manager', 'sales_officer',
    'logistics_officer', 'finance_officer', 'quality_officer', 'viewer'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.user_roles (
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       public.app_role not null,
  source     text not null default 'manual' check (source in ('manual', 'legacy')),
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);
create index if not exists user_roles_role_idx on public.user_roles (role);
alter table public.user_roles enable row level security;

-- Helper functions. SECURITY DEFINER so policies can call them without
-- recursion; they only ever look at the CURRENT user (auth.uid()).
create or replace function public.app_has_role(r public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = r)
$$;

create or replace function public.app_has_any_role(rs public.app_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = any (rs))
$$;

create or replace function public.app_is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_has_role('super_admin')
$$;

revoke all on function public.app_has_role(public.app_role) from anon;
revoke all on function public.app_has_any_role(public.app_role[]) from anon;
revoke all on function public.app_is_super_admin() from anon;

drop policy if exists user_roles_select on public.user_roles;
create policy user_roles_select on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.app_has_any_role(array['super_admin', 'sales_manager']::public.app_role[]));

drop policy if exists user_roles_insert on public.user_roles;
create policy user_roles_insert on public.user_roles for insert to authenticated
  with check (public.app_is_super_admin());

drop policy if exists user_roles_update on public.user_roles;
create policy user_roles_update on public.user_roles for update to authenticated
  using (public.app_is_super_admin()) with check (public.app_is_super_admin());

drop policy if exists user_roles_delete on public.user_roles;
create policy user_roles_delete on public.user_roles for delete to authenticated
  using (public.app_is_super_admin());

-- Never allow the company to end up with zero Super Admins.
create or replace function public.app_keep_one_super_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'super_admin'
     and (tg_op = 'DELETE' or new.role <> 'super_admin')
     and not exists (select 1 from public.user_roles
                     where role = 'super_admin' and user_id <> old.user_id) then
    raise exception 'Cannot remove the last Super Admin.';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists user_roles_keep_one_super_admin on public.user_roles;
create trigger user_roles_keep_one_super_admin
  before update or delete on public.user_roles
  for each row execute function public.app_keep_one_super_admin();

-- ---------------------------------------------------------------------
-- 2. Bridge from the old profiles.role
-- ---------------------------------------------------------------------
create or replace function public.app_map_legacy_role(legacy text)
returns public.app_role language sql immutable as $$
  select case upper(coalesce(legacy, ''))
    when 'ADMIN'   then 'super_admin'::public.app_role
    when 'SALES'   then 'sales_officer'::public.app_role
    when 'QUALITY' then 'quality_officer'::public.app_role
    else null end
$$;

create or replace function public.app_sync_legacy_role()
returns trigger language plpgsql security definer set search_path = public as $$
declare mapped public.app_role := public.app_map_legacy_role(new.role);
begin
  -- Replace only the role that came from the old app; manual roles stay.
  delete from public.user_roles
   where user_id = new.id and source = 'legacy'
     and (mapped is null or role <> mapped)
     -- keep the safety rule: do not drop the last super admin here either
     and not (role = 'super_admin' and not exists (
       select 1 from public.user_roles r2 where r2.role = 'super_admin' and r2.user_id <> new.id));
  if mapped is not null then
    insert into public.user_roles (user_id, role, source)
    values (new.id, mapped, 'legacy')
    on conflict (user_id, role) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists profiles_sync_app_role on public.profiles;
create trigger profiles_sync_app_role
  after insert or update of role on public.profiles
  for each row execute function public.app_sync_legacy_role();

-- One-time copy for employees that already exist.
insert into public.user_roles (user_id, role, source)
select p.id, public.app_map_legacy_role(p.role), 'legacy'
  from public.profiles p
 where public.app_map_legacy_role(p.role) is not null
on conflict (user_id, role) do nothing;

-- ---------------------------------------------------------------------
-- 3. Shared helpers
-- ---------------------------------------------------------------------
create or replace function public.app_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 4. Audit log (append-only)
-- ---------------------------------------------------------------------
create table if not exists public.audit_logs (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  actor      uuid default auth.uid(),
  table_name text not null,
  record_id  text,
  action     text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data   jsonb,
  new_data   jsonb
);
create index if not exists audit_logs_table_idx on public.audit_logs (table_name, record_id);
create index if not exists audit_logs_at_idx on public.audit_logs (at desc);
alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (public.app_is_super_admin());
-- No insert/update/delete policies: only the trigger below can write.

create or replace function public.app_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare rid text;
begin
  rid := coalesce(
    to_jsonb(coalesce(new, old)) ->> 'id',
    to_jsonb(coalesce(new, old)) ->> 'user_id');
  insert into public.audit_logs (table_name, record_id, action, old_data, new_data)
  values (tg_table_name, rid, tg_op,
          case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

drop trigger if exists user_roles_audit on public.user_roles;
create trigger user_roles_audit
  after insert or update or delete on public.user_roles
  for each row execute function public.app_audit();

-- ---------------------------------------------------------------------
-- 5. Company settings (exactly one row)
-- ---------------------------------------------------------------------
create table if not exists public.company_settings (
  id           smallint primary key default 1 check (id = 1),
  company_name text not null,
  slogan       text,
  website      text,
  email        text,
  phone        text,
  whatsapp     text,
  address      text,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users(id) on delete set null
);
alter table public.company_settings enable row level security;

-- Only values you gave in the MASTER PROMPT. Phone / WhatsApp / address are
-- left empty on purpose: your files show two different sets, you choose.
insert into public.company_settings (id, company_name, slogan, website, email)
values (1, 'MS El-brancy Group', 'Rooted in Egypt, Reaching the World.',
        'https://msgroup-egy.com/', 'sales@msgroup-egy.com')
on conflict (id) do nothing;

drop policy if exists company_settings_select on public.company_settings;
create policy company_settings_select on public.company_settings for select to authenticated
  using (true);

drop policy if exists company_settings_update on public.company_settings;
create policy company_settings_update on public.company_settings for update to authenticated
  using (public.app_is_super_admin()) with check (public.app_is_super_admin());

drop trigger if exists company_settings_updated_at on public.company_settings;
create trigger company_settings_updated_at
  before update on public.company_settings
  for each row execute function public.app_set_updated_at();

drop trigger if exists company_settings_audit on public.company_settings;
create trigger company_settings_audit
  after update on public.company_settings
  for each row execute function public.app_audit();

-- ---------------------------------------------------------------------
-- 6. Migration bookkeeping
-- ---------------------------------------------------------------------
create table if not exists public.app_migrations (
  version    text primary key,
  applied_at timestamptz not null default now()
);
alter table public.app_migrations enable row level security;
drop policy if exists app_migrations_select on public.app_migrations;
create policy app_migrations_select on public.app_migrations for select to authenticated using (true);
insert into public.app_migrations (version) values ('0001_foundation') on conflict do nothing;

commit;

-- After running, this should show your employees and their new roles:
select p.email, p.role as old_role, r.role as new_role, r.source
  from public.profiles p
  left join public.user_roles r on r.user_id = p.id
 order by p.email;
