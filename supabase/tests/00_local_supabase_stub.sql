-- LOCAL TESTING ONLY. Never run this on the real Supabase project.
-- Mimics the parts of Supabase the migrations rely on, plus the legacy
-- schema as reconstructed in the handover.
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;

-- minimal Supabase Storage
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text not null, owner uuid default auth.uid(), created_at timestamptz default now());
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant all on storage.objects to anon, authenticated;
grant select on storage.buckets to anon, authenticated;

-- legacy schema
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text, email text unique,
  role text check (role = any (array['ADMIN','SALES','QUALITY'])),
  legacy_id text unique, created_at timestamptz default now());
create table public.crm_records (
  id uuid primary key default gen_random_uuid(), record_type text, record_key text, data jsonb,
  owner_legacy_id text, updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  unique (record_type, record_key));
alter table public.profiles enable row level security;
alter table public.crm_records enable row level security;
create function public.current_crm_role() returns text language sql stable security definer set search_path to 'public'
  as $$ select role from public.profiles where id = auth.uid() $$;
create function public.current_crm_legacy_id() returns text language sql stable security definer set search_path to 'public'
  as $$ select legacy_id from public.profiles where id = auth.uid() $$;
create function public.is_crm_admin() returns boolean language sql stable security definer set search_path to 'public'
  as $$ select coalesce(public.current_crm_role() = 'ADMIN', false) $$;
create policy profiles_select_self_or_admin on public.profiles for select to authenticated using ((id = auth.uid()) or is_crm_admin());
create policy profiles_admin_update on public.profiles for update to authenticated using (is_crm_admin()) with check (is_crm_admin());

insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-00000000000a','admin@msgroup-egy.com'),
 ('00000000-0000-0000-0000-00000000000b','test.sales@msgroup-egy.com'),
 ('00000000-0000-0000-0000-00000000000c','quality@msgroup-egy.com');
insert into public.profiles (id, full_name, email, role, legacy_id) values
 ('00000000-0000-0000-0000-00000000000a','Admin','admin@msgroup-egy.com','ADMIN','u1'),
 ('00000000-0000-0000-0000-00000000000b','Test Sales','test.sales@msgroup-egy.com','SALES','u2');
insert into public.crm_records (record_type, record_key, data, owner_legacy_id)
values ('customers','1','{"company":"Existing Co"}','u2');
