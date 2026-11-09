-- =====================================================================
-- MS El-brancy Group platform — Migration 0006: CRM & importers
-- ---------------------------------------------------------------------
-- WHAT THIS DOES (additive only, nothing is deleted):
--   1. companies (importers / customers / leads), company_contacts
--      (several people per company) and activities (timeline).
--   2. Duplicate check across ALL companies — even ones you cannot see —
--      that only tells you the company name, country and which colleague
--      owns it (the current CRM could only check your own customers).
--   3. Copies every customer AND lead from the current CRM (crm_records)
--      with its owner. The current CRM's data is NOT changed.
--   4. Activities cannot be edited or deleted (the current CRM allowed
--      people to edit their own log).
--   5. quotations get a company link.
--
-- WHO CAN DO WHAT
--   Sales Officer: own companies only; new companies are always theirs;
--                  cannot hand a company to someone else.
--   Super Admin, Sales Manager: all companies; assign / reassign owners.
--   Finance Officer: read all.
--   Nobody hard-deletes a company: archive and restore instead.
--
-- Requires 0005_quotations. Safe to run more than once.
-- =====================================================================

begin;

do $$ begin
  if not exists (select 1 from public.app_migrations where version = '0005_quotations') then
    raise exception 'Run 0005_quotations first.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Normalisers used for duplicate detection
-- ---------------------------------------------------------------------
create or replace function public.app_norm_company(n text)
returns text language sql immutable as $$
  select nullif(regexp_replace(
           regexp_replace(lower(coalesce(n, '')),
             '\m(co|company|ltd|llc|inc|gmbh|sarl|sa|srl|bv|fze|fzco|fzc|trading|est|establishment|corp|corporation|limited|plc|for|and|the|import|export|imports|exports|group)\M', ' ', 'g'),
           '[^[:alnum:]]+', '', 'g'), '')
$$;
create or replace function public.app_web_domain(u text)
returns text language sql immutable as $$
  select nullif(regexp_replace(regexp_replace(lower(trim(coalesce(u, ''))), '^[a-z]+://', ''), '^www\.|[/?#].*$', '', 'g'), '')
$$;
create or replace function public.app_norm_phone(p text)
returns text language sql immutable as $$
  select case when length(regexp_replace(coalesce(p, ''), '\D', '', 'g')) >= 7
              then right(regexp_replace(p, '\D', '', 'g'), 9) end
$$;
create or replace function public.app_norm_email(e text)
returns text language sql immutable as $$
  select nullif(lower(trim(coalesce(e, ''))), '')
$$;

create or replace function public.app_sees_all_companies()
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_has_any_role(array['super_admin', 'sales_manager', 'finance_officer']::public.app_role[])
$$;
revoke all on function public.app_sees_all_companies() from anon;

-- ---------------------------------------------------------------------
-- Companies
-- ---------------------------------------------------------------------
create table if not exists public.companies (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null check (length(trim(name)) between 1 and 200),
  country                  text,
  city                     text,
  address                  text,
  website                  text,
  company_type             text check (company_type in ('importer', 'distributor', 'wholesaler', 'retailer', 'horeca', 'other')),
  business_description     text,
  email                    text,
  phone                    text,
  whatsapp                 text,
  linkedin                 text,
  preferred_contact        text check (preferred_contact in ('email', 'whatsapp', 'phone', 'linkedin', 'other')),
  products_interested      text,
  product_category         text,
  current_supplier         text,
  current_supplier_country text,
  estimated_volume         text,
  packaging_requirements   text,
  target_market            text,
  preferred_incoterm       public.app_incoterm,
  preferred_payment_terms  text,
  lead_source              text,
  lead_status              text not null default 'new_lead' check (lead_status in
    ('new_lead', 'contacted', 'interested', 'quotation_sent', 'sample_requested', 'negotiating', 'active_customer', 'inactive', 'lost')),
  priority                 text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  last_contact_date        date,
  next_follow_up_date      date,
  notes                    text,
  tags                     text[] not null default '{}',
  owner_id                 uuid default auth.uid() references auth.users(id) on delete set null,
  legacy_key               text unique,            -- e.g. customers:1712345678
  legacy_data              jsonb,
  name_norm                text generated always as (public.app_norm_company(name)) stored,
  domain                   text generated always as (public.app_web_domain(website)) stored,
  email_norm               text generated always as (public.app_norm_email(email)) stored,
  phone_norm               text generated always as (public.app_norm_phone(coalesce(nullif(phone, ''), whatsapp))) stored,
  archived_at              timestamptz,
  created_at               timestamptz not null default now(),
  created_by               uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at               timestamptz not null default now(),
  updated_by               uuid references auth.users(id) on delete set null
);
alter table public.companies alter column owner_id set default auth.uid();
create index if not exists companies_owner_idx on public.companies (owner_id);
create index if not exists companies_name_norm_idx on public.companies (name_norm);
create index if not exists companies_domain_idx on public.companies (domain);
create index if not exists companies_email_idx on public.companies (email_norm);
create index if not exists companies_phone_idx on public.companies (phone_norm);
create index if not exists companies_follow_up_idx on public.companies (next_follow_up_date) where archived_at is null;

create table if not exists public.company_contacts (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 120),
  job_title   text,
  email       text,
  phone       text,
  whatsapp    text,
  linkedin    text,
  is_primary  boolean not null default false,
  notes       text,
  email_norm  text generated always as (public.app_norm_email(email)) stored,
  phone_norm  text generated always as (public.app_norm_phone(coalesce(nullif(phone, ''), whatsapp))) stored,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);
create index if not exists company_contacts_company_idx on public.company_contacts (company_id);
create index if not exists company_contacts_email_idx on public.company_contacts (email_norm);
create index if not exists company_contacts_phone_idx on public.company_contacts (phone_norm);

create table if not exists public.activities (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  kind         text not null check (kind in ('note', 'call', 'email', 'whatsapp', 'meeting', 'quotation', 'sample', 'status', 'other')),
  summary      text not null check (length(trim(summary)) between 1 and 4000),
  happened_at  timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  created_by   uuid default auth.uid() references auth.users(id) on delete set null
);
create index if not exists activities_company_idx on public.activities (company_id, happened_at desc);

alter table public.companies enable row level security;
alter table public.company_contacts enable row level security;
alter table public.activities enable row level security;

-- ---------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------
create or replace function public.app_can_read_company(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_is_member() and exists (
    select 1 from public.companies c where c.id = cid and (c.owner_id = auth.uid() or public.app_sees_all_companies()))
$$;
create or replace function public.app_can_edit_company(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_can_plan() and exists (
    select 1 from public.companies c where c.id = cid and (c.owner_id = auth.uid() or public.app_edits_all_plans()))
$$;
revoke all on function public.app_can_read_company(uuid) from anon;
revoke all on function public.app_can_edit_company(uuid) from anon;

-- companies
drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies for select to authenticated
  using (public.app_is_member() and (owner_id = auth.uid() or public.app_sees_all_companies()));
drop policy if exists companies_insert on public.companies;
create policy companies_insert on public.companies for insert to authenticated
  with check (public.app_can_plan() and (owner_id = auth.uid() or public.app_edits_all_plans()));
drop policy if exists companies_update on public.companies;
create policy companies_update on public.companies for update to authenticated
  using (public.app_can_plan() and (owner_id = auth.uid() or public.app_edits_all_plans()))
  with check (public.app_can_plan() and (owner_id = auth.uid() or public.app_edits_all_plans()));
-- no delete policy: archive instead

-- contacts follow their company
drop policy if exists company_contacts_select on public.company_contacts;
create policy company_contacts_select on public.company_contacts for select to authenticated using (public.app_can_read_company(company_id));
drop policy if exists company_contacts_insert on public.company_contacts;
create policy company_contacts_insert on public.company_contacts for insert to authenticated with check (public.app_can_edit_company(company_id));
drop policy if exists company_contacts_update on public.company_contacts;
create policy company_contacts_update on public.company_contacts for update to authenticated
  using (public.app_can_edit_company(company_id)) with check (public.app_can_edit_company(company_id));
drop policy if exists company_contacts_delete on public.company_contacts;
create policy company_contacts_delete on public.company_contacts for delete to authenticated using (public.app_can_edit_company(company_id));

-- activities: add only
drop policy if exists activities_select on public.activities;
create policy activities_select on public.activities for select to authenticated using (public.app_can_read_company(company_id));
drop policy if exists activities_insert on public.activities;
create policy activities_insert on public.activities for insert to authenticated
  with check (public.app_can_edit_company(company_id) and created_by = auth.uid());

-- owner / creator protection
create or replace function public.app_company_guard()
returns trigger language plpgsql as $$
begin
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.legacy_key := old.legacy_key;
  new.legacy_data := old.legacy_data;
  if new.owner_id is distinct from old.owner_id and not public.app_edits_all_plans() then
    raise exception 'Only the Sales Manager or Super Admin can change who owns a company.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists companies_guard on public.companies;
create trigger companies_guard before update on public.companies
  for each row execute function public.app_company_guard();

do $$
declare t text;
begin
  foreach t in array array['companies', 'company_contacts'] loop
    execute format('drop trigger if exists %1$s_updated_at on public.%1$s', t);
    execute format('create trigger %1$s_updated_at before update on public.%1$s for each row execute function public.app_set_updated_at()', t);
    execute format('drop trigger if exists %1$s_audit on public.%1$s', t);
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$s for each row execute function public.app_audit()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Duplicate check (one or many candidates). Sees ALL companies but
-- returns only name, country, owner and the reasons for the match.
-- candidates: [{"name":..,"website":..,"email":..,"phone":..,"country":..,"exclude_id":..}, ...]
-- ---------------------------------------------------------------------
create or replace function public.find_company_duplicates(candidates jsonb)
returns table (idx int, company_id uuid, company_name text, country text, owner_name text, reasons text[], can_open boolean, archived boolean)
language sql stable security definer set search_path = public as $$
  with cand as (
    select (e.ord - 1)::int as idx,
           public.app_norm_company(e.v->>'name') as n,
           public.app_web_domain(e.v->>'website') as d,
           public.app_norm_email(e.v->>'email') as em,
           public.app_norm_phone(e.v->>'phone') as ph,
           lower(trim(coalesce(e.v->>'country', ''))) as ct,
           nullif(e.v->>'exclude_id', '')::uuid as ex
      from jsonb_array_elements(case when public.app_is_member() then candidates else '[]'::jsonb end) with ordinality as e(v, ord)
  ),
  hits as (
    select c.idx, co.id, co.name, co.country, co.owner_id, co.archived_at,
           array_remove(array[
             case when c.n is not null and co.name_norm = c.n then 'same company name' end,
             case when c.d is not null and co.domain = c.d then 'same website' end,
             case when c.em is not null and (co.email_norm = c.em or exists (
               select 1 from public.company_contacts cc where cc.company_id = co.id and cc.email_norm = c.em)) then 'same email' end,
             case when c.ph is not null and (co.phone_norm = c.ph or exists (
               select 1 from public.company_contacts cc where cc.company_id = co.id and cc.phone_norm = c.ph)) then 'same phone' end
           ], null) as reasons,
           c.ct
      from cand c
      join public.companies co on (c.ex is null or co.id <> c.ex)
       and ((c.n is not null and co.name_norm = c.n) or (c.d is not null and co.domain = c.d)
            or (c.em is not null and co.email_norm = c.em) or (c.ph is not null and co.phone_norm = c.ph)
            or exists (select 1 from public.company_contacts cc where cc.company_id = co.id
                        and ((c.em is not null and cc.email_norm = c.em) or (c.ph is not null and cc.phone_norm = c.ph))))
  )
  select h.idx, h.id, h.name, h.country,
         coalesce(p.full_name, p.email, 'Unassigned'),
         h.reasons || case when h.ct <> '' and lower(coalesce(h.country, '')) = h.ct then array['same country'] else '{}'::text[] end,
         (h.owner_id = auth.uid() or public.app_sees_all_companies()),
         h.archived_at is not null
    from hits h left join public.profiles p on p.id = h.owner_id
   order by h.idx, cardinality(h.reasons) desc
$$;
revoke all on function public.find_company_duplicates(jsonb) from public, anon;
grant execute on function public.find_company_duplicates(jsonb) to authenticated;

-- Names of employees who can own companies (for the "Owner" picker).
create or replace function public.list_sales_team()
returns table (id uuid, name text, email text) language sql stable security definer set search_path = public as $$
  select p.id, coalesce(p.full_name, p.email), p.email
    from public.profiles p
   where public.app_is_member()
     and exists (select 1 from public.user_roles r where r.user_id = p.id and r.role in ('super_admin', 'sales_manager', 'sales_officer'))
   order by 2
$$;
revoke all on function public.list_sales_team() from public, anon;
grant execute on function public.list_sales_team() to authenticated;

-- ---------------------------------------------------------------------
-- Quotations link to a company
-- ---------------------------------------------------------------------
alter table public.quotations add column if not exists company_id uuid references public.companies(id) on delete set null;
create index if not exists quotations_company_idx on public.quotations (company_id);

-- ---------------------------------------------------------------------
-- Import customers and leads from the current CRM
-- ---------------------------------------------------------------------
create or replace function public.app_legacy_date(v text)
returns date language plpgsql immutable as $$
begin
  if v is null or trim(v) = '' then return null; end if;
  return v::date;
exception when others then return null;
end $$;

insert into public.companies
  (name, country, city, company_type, email, phone, linkedin, products_interested, product_category,
   current_supplier, estimated_volume, packaging_requirements, target_market, lead_status, priority,
   owner_id, last_contact_date, next_follow_up_date, notes, legacy_key, legacy_data, created_by)
select
  trim(r.data->>'company'),
  nullif(trim(r.data->>'country'), ''), nullif(trim(r.data->>'city'), ''),
  case r.data->>'type' when 'Importer' then 'importer' when 'Distributor' then 'distributor' when 'Wholesaler' then 'wholesaler'
                       when 'Retailer' then 'retailer' when 'Food Service' then 'horeca' else null end,
  nullif(trim(r.data->>'email'), ''), nullif(trim(r.data->>'phone'), ''), nullif(trim(r.data->>'linkedin'), ''),
  nullif(trim(r.data->>'products'), ''), nullif(trim(r.data->>'category'), ''),
  nullif(trim(r.data->>'supplier'), ''), nullif(trim(r.data->>'volume'), ''),
  nullif(trim(r.data->>'packaging'), ''), nullif(trim(r.data->>'market'), ''),
  case r.data->>'status'
    when 'Contacted' then 'contacted' when 'Interested' then 'interested' when 'Quotation Sent' then 'quotation_sent'
    when 'Sample Requested' then 'sample_requested' when 'Negotiating' then 'negotiating'
    when 'Active Customer' then 'active_customer' when 'Lost' then 'lost' else 'new_lead' end,
  case lower(coalesce(r.data->>'priority', '')) when 'high' then 'high' when 'low' then 'low' else 'medium' end,
  p.id,
  public.app_legacy_date(r.data->>'last'), public.app_legacy_date(r.data->>'next'),
  case when r.record_type = 'leads' then 'Imported from the current CRM (lead)' else 'Imported from the current CRM' end,
  r.record_type || ':' || r.record_key, r.data, null
from public.crm_records r
left join public.profiles p on p.legacy_id = r.owner_legacy_id
where r.record_type in ('customers', 'leads')
  and coalesce(trim(r.data->>'company'), '') <> ''
on conflict (legacy_key) do nothing;

-- the contact person of each imported record becomes a contact
insert into public.company_contacts (company_id, name, job_title, email, phone, linkedin, is_primary)
select c.id, trim(c.legacy_data->>'contact'), nullif(trim(c.legacy_data->>'job'), ''),
       nullif(trim(c.legacy_data->>'email'), ''), nullif(trim(c.legacy_data->>'phone'), ''),
       nullif(trim(c.legacy_data->>'linkedin'), ''), true
  from public.companies c
 where c.legacy_key is not null and coalesce(trim(c.legacy_data->>'contact'), '') <> ''
   and not exists (select 1 from public.company_contacts x where x.company_id = c.id);

insert into public.app_migrations (version) values ('0006_crm') on conflict do nothing;

commit;

-- After running: what was imported from the current CRM.
select split_part(legacy_key, ':', 1) as from_current_crm, count(*) as companies,
       count(owner_id) as with_owner, count(*) - count(owner_id) as without_owner
  from public.companies where legacy_key is not null group by 1;
