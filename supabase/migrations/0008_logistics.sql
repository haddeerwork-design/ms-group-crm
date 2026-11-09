-- =====================================================================
-- MS El-brancy Group platform — Migration 0008: Suppliers, shipping, proforma
-- ---------------------------------------------------------------------
-- WHAT THIS DOES (additive only, nothing is deleted):
--   1. suppliers + supplier_prices (each supplier quote is kept, so you can
--      compare suppliers and see price history).
--   2. freight_forwarders + shipping_rates (sea per container, air per kg),
--      each rate with its source and validity.
--   3. proforma_invoices (PI-2026-0001 …) made from an accepted quotation.
--      Issued proformas are locked; changes need a revision, and every
--      issued version is kept.
--   4. Copies suppliers and shipping companies from the current CRM, and
--      ONLY the shipping rates that have a real price. The 4 sample routes
--      in the current CRM have no price and unconfirmed transit times, so
--      they are not copied.
--   5. company_settings gets an empty "bank details" field for proformas.
--
-- WHO CAN DO WHAT
--   Suppliers (directory): everyone reads; Super Admin / Sales Manager edit.
--   Supplier prices (costs): Super Admin, Sales Manager, Finance.
--   Forwarders & shipping rates: everyone reads; Super Admin, Sales Manager
--     and Logistics edit.
--   Proformas: same as quotations (own for Sales Officers, all for managers,
--     Finance reads all).
--
-- Requires 0007_sales. Safe to run more than once.
-- =====================================================================

begin;

do $$ begin
  if not exists (select 1 from public.app_migrations where version = '0007_sales') then
    raise exception 'Run 0007_sales first.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Suppliers
-- ---------------------------------------------------------------------
create table if not exists public.suppliers (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(trim(name)) between 1 and 200),
  category        text,                -- Fresh / Frozen / Jam / Packaging / Transport / Other
  country         text default 'Egypt',
  city            text,
  address         text,
  website         text,
  contact_name    text,
  job_title       text,
  email           text,
  phone           text,
  whatsapp        text,
  products_text   text,
  payment_terms   text,
  delivery_terms  text,
  lead_time       text,
  certifications  text,
  notes           text,
  legacy_key      text unique,
  legacy_data     jsonb,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users(id) on delete set null
);
create unique index if not exists suppliers_name_uq on public.suppliers (lower(trim(name))) where archived_at is null;
alter table public.suppliers enable row level security;
drop policy if exists suppliers_select on public.suppliers;
create policy suppliers_select on public.suppliers for select to authenticated using (public.app_is_member());
drop policy if exists suppliers_insert on public.suppliers;
create policy suppliers_insert on public.suppliers for insert to authenticated with check (public.app_edits_all_plans());
drop policy if exists suppliers_update on public.suppliers;
create policy suppliers_update on public.suppliers for update to authenticated
  using (public.app_edits_all_plans()) with check (public.app_edits_all_plans());

create table if not exists public.supplier_prices (
  id                 uuid primary key default gen_random_uuid(),
  supplier_id        uuid not null references public.suppliers(id),
  product_id         uuid references public.products(id),
  product_text       text,
  packaging          text,
  price              numeric not null check (price > 0),
  unit               text not null check (unit in ('kg', 'ton', 'carton', 'piece')),
  currency           text not null check (currency ~ '^[A-Z]{3}$'),
  quantity_available text,
  valid_from         date not null default current_date,
  valid_until        date,
  notes              text,
  created_at         timestamptz not null default now(),
  created_by         uuid default auth.uid() references auth.users(id) on delete set null,
  check (product_id is not null or product_text is not null),
  check (valid_until is null or valid_until >= valid_from)
);
create index if not exists supplier_prices_product_idx on public.supplier_prices (product_id, created_at desc);
create index if not exists supplier_prices_supplier_idx on public.supplier_prices (supplier_id, created_at desc);
alter table public.supplier_prices enable row level security;
drop policy if exists supplier_prices_select on public.supplier_prices;
create policy supplier_prices_select on public.supplier_prices for select to authenticated using (public.app_can_view_costs());
drop policy if exists supplier_prices_insert on public.supplier_prices;
create policy supplier_prices_insert on public.supplier_prices for insert to authenticated
  with check (public.app_can_view_costs() and created_by = auth.uid());
-- no update/delete: history

-- ---------------------------------------------------------------------
-- Forwarders & shipping rates
-- ---------------------------------------------------------------------
create table if not exists public.freight_forwarders (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) between 1 and 200),
  company_type text,       -- Freight Forwarder / Shipping Line / Airline / Customs Broker / Transport
  services     text,
  country      text default 'Egypt',
  city         text,
  ports        text,
  contact_name text,
  job_title    text,
  email        text,
  phone        text,
  website      text,
  notes        text,
  legacy_key   text unique,
  legacy_data  jsonb,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users(id) on delete set null
);
create unique index if not exists freight_forwarders_name_uq on public.freight_forwarders (lower(trim(name))) where archived_at is null;

create table if not exists public.shipping_rates (
  id                  uuid primary key default gen_random_uuid(),
  mode                text not null check (mode in ('sea', 'air', 'inland')),
  forwarder_id        uuid references public.freight_forwarders(id),
  carrier             text,          -- shipping line / airline
  origin_country      text not null default 'Egypt',
  origin_port         text,
  destination_country text not null,
  destination_port    text,
  container_type      text,          -- sea / inland: e.g. 40' Reefer
  rate_per_container  numeric check (rate_per_container >= 0),
  rate_per_kg         numeric check (rate_per_kg >= 0),
  min_charge          numeric check (min_charge >= 0),
  additional_fees     numeric check (additional_fees >= 0),
  fees_note           text,
  currency            text not null check (currency ~ '^[A-Z]{3}$'),
  transit_time        text,
  valid_from          date,
  valid_until         date,
  source              text,          -- who quoted it, e.g. "Email from X, 05/11/2026"
  notes               text,
  legacy_key          text unique,
  legacy_data         jsonb,
  archived_at         timestamptz,
  created_at          timestamptz not null default now(),
  created_by          uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users(id) on delete set null,
  check (valid_until is null or valid_from is null or valid_until >= valid_from),
  check (mode <> 'air' or rate_per_kg is not null),
  check (mode = 'air' or rate_per_container is not null or rate_per_kg is not null)
);
create index if not exists shipping_rates_dest_idx on public.shipping_rates (destination_country, mode);

alter table public.freight_forwarders enable row level security;
alter table public.shipping_rates enable row level security;
do $$
declare t text;
begin
  foreach t in array array['freight_forwarders', 'shipping_rates'] loop
    execute format('drop policy if exists %1$s_select on public.%1$s', t);
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (public.app_is_member())', t);
    execute format('drop policy if exists %1$s_insert on public.%1$s', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (public.app_can_manage_containers())', t);
    execute format('drop policy if exists %1$s_update on public.%1$s', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (public.app_can_manage_containers()) with check (public.app_can_manage_containers())', t);
  end loop;
  foreach t in array array['suppliers', 'freight_forwarders', 'shipping_rates'] loop
    execute format('drop trigger if exists %1$s_updated_at on public.%1$s', t);
    execute format('create trigger %1$s_updated_at before update on public.%1$s for each row execute function public.app_set_updated_at()', t);
    execute format('drop trigger if exists %1$s_audit on public.%1$s', t);
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$s for each row execute function public.app_audit()', t);
  end loop;
end $$;
drop trigger if exists supplier_prices_audit on public.supplier_prices;
create trigger supplier_prices_audit after insert on public.supplier_prices for each row execute function public.app_audit();

-- ---------------------------------------------------------------------
-- Proforma invoices
-- ---------------------------------------------------------------------
alter table public.company_settings add column if not exists bank_details text;

do $$ begin
  create type public.app_pi_status as enum ('draft', 'issued', 'revised', 'cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.proforma_counters (year int primary key, last int not null default 0);
alter table public.proforma_counters enable row level security;

create table if not exists public.proforma_invoices (
  id                 uuid primary key default gen_random_uuid(),
  number             text unique,
  status             public.app_pi_status not null default 'draft',
  version            int not null default 1,
  quotation_id       uuid references public.quotations(id) on delete set null,
  company_id         uuid references public.companies(id) on delete set null,
  issue_date         date not null default current_date,
  customer_name      text,
  customer_company   text,
  customer_address   text,
  customer_country   text,
  customer_email     text,
  customer_phone     text,
  incoterm           public.app_incoterm,
  currency           text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  port_of_loading    text,
  port_of_discharge  text,
  destination        text,
  shipment_mode      text check (shipment_mode in ('sea', 'air', 'land')),
  container_details  text,
  estimated_shipment date,
  payment_terms      text,
  other_charges_label text,
  other_charges      numeric,
  bank_details       text,
  terms              text,
  notes              text,      -- internal
  issued_at          timestamptz,
  created_at         timestamptz not null default now(),
  created_by         uuid not null default auth.uid() references auth.users(id),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references auth.users(id) on delete set null
);
create index if not exists proforma_owner_idx on public.proforma_invoices (created_by, created_at desc);

create table if not exists public.proforma_items (
  id             uuid primary key default gen_random_uuid(),
  proforma_id    uuid not null references public.proforma_invoices(id) on delete cascade,
  product_id     uuid references public.products(id),
  description    text not null check (length(trim(description)) > 0),
  packing        text,
  quantity       numeric not null check (quantity > 0),
  unit           text not null check (unit in ('tons', 'cartons', 'pallets', 'kg', 'pieces')),
  net_weight_kg  numeric check (net_weight_kg > 0),
  unit_price     numeric not null check (unit_price >= 0),
  price_unit     text not null default 'ton' check (price_unit in ('ton', 'kg', 'carton', 'piece')),
  line_total     numeric not null check (line_total >= 0),
  sort_order     int not null default 0
);
create index if not exists proforma_items_pi_idx on public.proforma_items (proforma_id, sort_order);

create table if not exists public.proforma_versions (
  id          bigint generated always as identity primary key,
  proforma_id uuid not null references public.proforma_invoices(id) on delete cascade,
  version     int not null,
  snapshot    jsonb not null,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  unique (proforma_id, version)
);

alter table public.proforma_invoices enable row level security;
alter table public.proforma_items enable row level security;
alter table public.proforma_versions enable row level security;

create or replace function public.app_proforma_number()
returns trigger language plpgsql security definer set search_path = public as $$
declare yr int := extract(year from coalesce(new.issue_date, current_date))::int; n int;
begin
  insert into public.proforma_counters as c (year, last) values (yr, 1)
  on conflict (year) do update set last = c.last + 1 returning last into n;
  new.number := 'PI-' || yr || '-' || lpad(n::text, 4, '0');
  new.status := 'draft'; new.version := 1; new.issued_at := null;
  return new;
end $$;
drop trigger if exists proforma_number on public.proforma_invoices;
create trigger proforma_number before insert on public.proforma_invoices
  for each row execute function public.app_proforma_number();

create or replace function public.app_proforma_guard()
returns trigger language plpgsql as $$
declare via_fn boolean := coalesce(current_setting('app.pi_status_change', true), '') = 'on';
begin
  new.number := old.number; new.created_by := old.created_by; new.created_at := old.created_at;
  if not via_fn then
    new.status := old.status; new.version := old.version; new.issued_at := old.issued_at;
    if old.status not in ('draft', 'revised') then
      raise exception 'Proforma % is %. Use "Revise" to change it.', old.number, old.status;
    end if;
  end if;
  new.updated_at := now(); new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists proforma_guard on public.proforma_invoices;
create trigger proforma_guard before update on public.proforma_invoices
  for each row execute function public.app_proforma_guard();

create or replace function public.app_can_edit_pi(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_can_plan() and exists (select 1 from public.proforma_invoices p
    where p.id = pid and p.status in ('draft', 'revised') and (p.created_by = auth.uid() or public.app_edits_all_plans()))
$$;
create or replace function public.app_can_read_pi(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_is_member() and exists (select 1 from public.proforma_invoices p
    where p.id = pid and (p.created_by = auth.uid() or public.app_sees_all_quotes()))
$$;
revoke all on function public.app_can_edit_pi(uuid) from public, anon;
revoke all on function public.app_can_read_pi(uuid) from public, anon;
grant execute on function public.app_can_edit_pi(uuid) to authenticated;
grant execute on function public.app_can_read_pi(uuid) to authenticated;

drop policy if exists proforma_select on public.proforma_invoices;
create policy proforma_select on public.proforma_invoices for select to authenticated
  using (public.app_is_member() and (created_by = auth.uid() or public.app_sees_all_quotes()));
drop policy if exists proforma_insert on public.proforma_invoices;
create policy proforma_insert on public.proforma_invoices for insert to authenticated
  with check (public.app_can_plan() and created_by = auth.uid());
drop policy if exists proforma_update on public.proforma_invoices;
create policy proforma_update on public.proforma_invoices for update to authenticated
  using (public.app_can_plan() and (created_by = auth.uid() or public.app_edits_all_plans()))
  with check (public.app_can_plan() and (created_by = auth.uid() or public.app_edits_all_plans()));
drop policy if exists proforma_delete on public.proforma_invoices;
create policy proforma_delete on public.proforma_invoices for delete to authenticated
  using (public.app_can_plan() and status = 'draft' and version = 1 and (created_by = auth.uid() or public.app_edits_all_plans()));

drop policy if exists proforma_items_select on public.proforma_items;
create policy proforma_items_select on public.proforma_items for select to authenticated using (public.app_can_read_pi(proforma_id));
drop policy if exists proforma_items_insert on public.proforma_items;
create policy proforma_items_insert on public.proforma_items for insert to authenticated with check (public.app_can_edit_pi(proforma_id));
drop policy if exists proforma_items_update on public.proforma_items;
create policy proforma_items_update on public.proforma_items for update to authenticated
  using (public.app_can_edit_pi(proforma_id)) with check (public.app_can_edit_pi(proforma_id));
drop policy if exists proforma_items_delete on public.proforma_items;
create policy proforma_items_delete on public.proforma_items for delete to authenticated using (public.app_can_edit_pi(proforma_id));
drop policy if exists proforma_versions_select on public.proforma_versions;
create policy proforma_versions_select on public.proforma_versions for select to authenticated using (public.app_can_read_pi(proforma_id));

create or replace function public.set_proforma_status(pid uuid, new_status public.app_pi_status)
returns public.proforma_invoices language plpgsql security definer set search_path = public as $$
declare p public.proforma_invoices; snap jsonb;
begin
  select * into p from public.proforma_invoices where id = pid for update;
  if not found then raise exception 'Proforma not found'; end if;
  if not (public.app_can_plan() and (p.created_by = auth.uid() or public.app_edits_all_plans())) then
    raise exception 'You are not allowed to change this proforma' using errcode = '42501';
  end if;
  if not ((p.status in ('draft', 'revised') and new_status = 'issued')
       or (p.status = 'issued' and new_status in ('revised', 'cancelled'))
       or (p.status in ('draft', 'revised') and new_status = 'cancelled' and p.version > 1)) then
    raise exception 'Cannot change a % proforma to %', p.status, new_status;
  end if;
  if new_status = 'issued' then
    if not exists (select 1 from public.proforma_items where proforma_id = pid) then
      raise exception 'Add at least one product before issuing.';
    end if;
    snap := to_jsonb(p) || jsonb_build_object('items',
      (select coalesce(jsonb_agg(to_jsonb(i) order by i.sort_order), '[]'::jsonb) from public.proforma_items i where i.proforma_id = pid));
    insert into public.proforma_versions (proforma_id, version, snapshot) values (pid, p.version, snap)
    on conflict (proforma_id, version) do update set snapshot = excluded.snapshot, created_at = now();
  end if;
  perform set_config('app.pi_status_change', 'on', true);
  update public.proforma_invoices set status = new_status,
    version = case when new_status = 'revised' then p.version + 1 else p.version end,
    issued_at = case when new_status = 'issued' then now() else p.issued_at end
  where id = pid returning * into p;
  perform set_config('app.pi_status_change', 'off', true);
  insert into public.audit_logs (table_name, record_id, action, new_data)
  values ('proforma_invoices', pid::text, 'UPDATE', jsonb_build_object('status', new_status, 'version', p.version));
  return p;
end $$;
revoke all on function public.set_proforma_status(uuid, public.app_pi_status) from public, anon;
grant execute on function public.set_proforma_status(uuid, public.app_pi_status) to authenticated;

drop trigger if exists proforma_audit on public.proforma_invoices;
create trigger proforma_audit after insert or delete on public.proforma_invoices
  for each row execute function public.app_audit();

-- ---------------------------------------------------------------------
-- Import from the current CRM
-- ---------------------------------------------------------------------
insert into public.suppliers (name, category, country, city, address, website, contact_name, job_title, email, phone,
                              products_text, payment_terms, lead_time, notes, legacy_key, legacy_data)
select trim(r.data->>'name'), nullif(r.data->>'category', ''), coalesce(nullif(trim(r.data->>'country'), ''), 'Egypt'),
       nullif(trim(r.data->>'city'), ''), nullif(trim(r.data->>'address'), ''), nullif(trim(r.data->>'website'), ''),
       nullif(trim(r.data->>'contact'), ''), nullif(trim(r.data->>'job'), ''), nullif(trim(r.data->>'email'), ''),
       nullif(trim(r.data->>'phone'), ''), nullif(trim(r.data->>'products'), ''), nullif(trim(r.data->>'payment'), ''),
       nullif(trim(r.data->>'leadTime'), ''), nullif(trim(r.data->>'notes'), ''), 'suppliers:' || r.record_key, r.data
  from public.crm_records r
 where r.record_type = 'suppliers' and coalesce(trim(r.data->>'name'), '') <> ''
   and not exists (select 1 from public.suppliers s where lower(trim(s.name)) = lower(trim(r.data->>'name')) and s.archived_at is null)
on conflict (legacy_key) do nothing;

insert into public.freight_forwarders (name, company_type, services, country, city, ports, contact_name, job_title, email, phone, website, notes, legacy_key, legacy_data)
select trim(r.data->>'name'), nullif(r.data->>'type', ''), nullif(r.data->>'services', ''), coalesce(nullif(trim(r.data->>'country'), ''), 'Egypt'),
       nullif(trim(r.data->>'city'), ''), nullif(trim(r.data->>'ports'), ''), nullif(trim(r.data->>'contact'), ''), nullif(trim(r.data->>'job'), ''),
       nullif(trim(r.data->>'email'), ''), nullif(trim(r.data->>'phone'), ''), nullif(trim(r.data->>'website'), ''), nullif(trim(r.data->>'notes'), ''),
       'shippingCompanies:' || r.record_key, r.data
  from public.crm_records r
 where r.record_type = 'shippingCompanies' and coalesce(trim(r.data->>'name'), '') <> ''
   and not exists (select 1 from public.freight_forwarders f where lower(trim(f.name)) = lower(trim(r.data->>'name')) and f.archived_at is null)
on conflict (legacy_key) do nothing;

insert into public.shipping_rates (mode, carrier, origin_country, origin_port, destination_country, destination_port, container_type,
                                   rate_per_container, rate_per_kg, currency, transit_time, valid_until, source, notes, legacy_key, legacy_data)
select case lower(coalesce(r.data->>'mode', '')) when 'air' then 'air' when 'inland' then 'inland' else 'sea' end,
       nullif(trim(r.data->>'carrier'), ''), coalesce(nullif(trim(r.data->>'fromCountry'), ''), 'Egypt'), nullif(trim(r.data->>'fromPort'), ''),
       coalesce(nullif(trim(r.data->>'toCountry'), ''), 'Unknown'), nullif(trim(r.data->>'toPort'), ''), nullif(r.data->>'container', ''),
       case when lower(coalesce(r.data->>'mode', '')) <> 'air' then public.app_num_or_null(r.data->>'rate') end,
       case when lower(coalesce(r.data->>'mode', '')) = 'air' then public.app_num_or_null(r.data->>'rate') end,
       case when coalesce(r.data->>'currency', '') ~ '^[A-Z]{3}$' then r.data->>'currency' else 'USD' end,
       nullif(trim(r.data->>'transit'), ''), public.app_legacy_date(r.data->>'validUntil'),
       'Current CRM', nullif(trim(r.data->>'notes'), ''), 'shippingRates:' || r.record_key, r.data
  from public.crm_records r
 where r.record_type = 'shippingRates' and public.app_num_or_null(r.data->>'rate') is not null
on conflict (legacy_key) do nothing;

insert into public.app_migrations (version) values ('0008_logistics') on conflict do nothing;

commit;

select (select count(*) from public.suppliers where legacy_key is not null) as suppliers_from_crm,
       (select count(*) from public.freight_forwarders where legacy_key is not null) as forwarders_from_crm,
       (select count(*) from public.shipping_rates where legacy_key is not null) as rates_from_crm,
       (select count(*) from public.crm_records where record_type = 'shippingRates'
          and public.app_num_or_null(data->>'rate') is null) as rates_skipped_no_price;
