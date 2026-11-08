-- =====================================================================
-- MS El-brancy Group platform — Migration 0002: Products catalog
-- ---------------------------------------------------------------------
-- WHAT THIS DOES (additive only, nothing is deleted):
--   1. product_categories, products, product_packaging tables.
--   2. Adds the product names and categories from the MASTER PROMPT.
--      NO weights, prices, seasons or availability are filled in: you
--      enter those yourself in the app.
--   3. Copies products you saved in the current CRM (crm_records,
--      record_type = 'products') into the new catalog, including any
--      kg / gross kg / cartons per pallet / packing / spec you entered.
--      Prices and costs are kept untouched in legacy_data for the Pricing
--      step. The current CRM's own data is NOT changed.
--   4. Security: every employee with a role can read; only Super Admin
--      and Sales Manager can add or edit; nobody can hard-delete
--      (products are archived instead). All changes go to audit_logs.
--
-- Requires 0001_foundation. Safe to run more than once.
-- =====================================================================

begin;

do $$ begin
  if not exists (select 1 from public.app_migrations where version = '0001_foundation') then
    raise exception 'Run 0001_foundation first.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Types and helpers
-- ---------------------------------------------------------------------
do $$ begin
  create type public.app_product_type as enum ('fresh', 'frozen', 'jam');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.app_availability as enum
    ('available', 'coming_soon', 'out_of_season', 'limited', 'discontinued');
exception when duplicate_object then null; end $$;

-- Any employee that has at least one role in the new platform.
create or replace function public.app_is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid())
$$;

create or replace function public.app_can_manage_catalog()
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_has_any_role(array['super_admin', 'sales_manager']::public.app_role[])
$$;

revoke all on function public.app_is_member() from anon;
revoke all on function public.app_can_manage_catalog() from anon;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table if not exists public.product_categories (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) between 2 and 80),
  product_type public.app_product_type not null,
  sort_order   int not null default 100,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users(id) on delete set null
);
create unique index if not exists product_categories_name_uq on public.product_categories (lower(name));

create table if not exists public.products (
  id                  uuid primary key default gen_random_uuid(),
  category_id         uuid not null references public.product_categories(id),
  name                text not null check (length(trim(name)) between 2 and 120),
  product_type        public.app_product_type not null,
  varieties           text[] not null default '{}',
  origin              text default 'Egypt',
  season_start_month  smallint check (season_start_month between 1 and 12),
  season_end_month    smallint check (season_end_month between 1 and 12),
  availability        public.app_availability,
  specifications      text,
  size_caliber        text,
  storage_temperature text,
  shelf_life          text,
  moq_quantity        numeric check (moq_quantity > 0),
  moq_unit            text,
  notes               text,
  image_path          text,
  legacy_key          text unique,      -- id of the item in the current CRM
  legacy_data         jsonb,            -- untouched copy of the current CRM item
  archived_at         timestamptz,
  created_at          timestamptz not null default now(),
  created_by          uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users(id) on delete set null,
  check ((season_start_month is null) = (season_end_month is null))
);
create unique index if not exists products_name_type_uq
  on public.products (lower(name), product_type) where archived_at is null;
create index if not exists products_category_idx on public.products (category_id);

create table if not exists public.product_packaging (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid not null references public.products(id) on delete cascade,
  label             text not null check (length(trim(label)) between 1 and 120),
  packaging_type    text,
  net_weight_kg     numeric check (net_weight_kg > 0),
  gross_weight_kg   numeric check (gross_weight_kg > 0),
  length_cm         numeric check (length_cm > 0),
  width_cm          numeric check (width_cm > 0),
  height_cm         numeric check (height_cm > 0),
  cartons_per_pallet int check (cartons_per_pallet > 0),
  is_default        boolean not null default false,
  notes             text,
  archived_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users(id) on delete set null,
  check (gross_weight_kg is null or net_weight_kg is null or gross_weight_kg >= net_weight_kg)
);
create index if not exists product_packaging_product_idx on public.product_packaging (product_id);
create unique index if not exists product_packaging_one_default
  on public.product_packaging (product_id) where is_default and archived_at is null;

-- ---------------------------------------------------------------------
-- Security
-- ---------------------------------------------------------------------
alter table public.product_categories enable row level security;
alter table public.products           enable row level security;
alter table public.product_packaging  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['product_categories', 'products', 'product_packaging'] loop
    execute format('drop policy if exists %1$s_select on public.%1$s', t);
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (public.app_is_member())', t);
    execute format('drop policy if exists %1$s_insert on public.%1$s', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (public.app_can_manage_catalog())', t);
    execute format('drop policy if exists %1$s_update on public.%1$s', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (public.app_can_manage_catalog()) with check (public.app_can_manage_catalog())', t);
    -- no delete policy: archive instead

    execute format('drop trigger if exists %1$s_updated_at on public.%1$s', t);
    execute format('create trigger %1$s_updated_at before update on public.%1$s for each row execute function public.app_set_updated_at()', t);
    execute format('drop trigger if exists %1$s_audit on public.%1$s', t);
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$s for each row execute function public.app_audit()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Seed: categories and product names from the MASTER PROMPT
-- ---------------------------------------------------------------------
insert into public.product_categories (name, product_type, sort_order) values
  ('Fresh Tropical Fruits',          'fresh',  10),
  ('Fresh Citrus & Other Fruits',    'fresh',  20),
  ('Fresh Vegetables',               'fresh',  30),
  ('IQF Frozen Fruits',              'frozen', 40),
  ('IQF Frozen Vegetables',          'frozen', 50),
  ('Jams — Prime Roots',             'jam',    60)
on conflict do nothing;

with seed(cat, name, varieties, spec) as (values
  ('Fresh Tropical Fruits', 'Dragon Fruit',  array['Red/White','Red/Red','Yellow/Yellow'], null),
  ('Fresh Tropical Fruits', 'Passion Fruit', array['Purple','Yellow'], null),
  ('Fresh Tropical Fruits', 'Avocado',       array['Hass','Fuerte','Ettinger'], null),
  ('Fresh Tropical Fruits', 'Lychee',        array[]::text[], null),
  ('Fresh Tropical Fruits', 'Papaya',        array[]::text[], null),
  ('Fresh Tropical Fruits', 'Cherimoya',     array[]::text[], null),
  ('Fresh Tropical Fruits', 'Blueberries',   array[]::text[], null),
  ('Fresh Tropical Fruits', 'Raspberries',   array[]::text[], null),
  ('Fresh Tropical Fruits', 'Blackberries',  array[]::text[], null),
  ('Fresh Citrus & Other Fruits', 'Valencia Oranges', array[]::text[], null),
  ('Fresh Citrus & Other Fruits', 'Navel Oranges',    array[]::text[], null),
  ('Fresh Citrus & Other Fruits', 'Mandarins',        array[]::text[], null),
  ('Fresh Citrus & Other Fruits', 'Lemons',           array[]::text[], null),
  ('Fresh Citrus & Other Fruits', 'Grapefruit',       array[]::text[], null),
  ('Fresh Citrus & Other Fruits', 'Pomegranates',     array[]::text[], null),
  ('Fresh Citrus & Other Fruits', 'Guava',            array[]::text[], null),
  ('Fresh Citrus & Other Fruits', 'Mango',            array[]::text[], null),
  ('Fresh Citrus & Other Fruits', 'Barhi Dates',      array[]::text[], null),
  ('Fresh Vegetables', 'Iceberg Lettuce',  array[]::text[], null),
  ('Fresh Vegetables', 'Habanero Peppers', array[]::text[], null),
  ('Fresh Vegetables', 'Spring Onions',    array[]::text[], null),
  ('Fresh Vegetables', 'Dry Onions',       array[]::text[], null),
  ('Fresh Vegetables', 'Garlic',           array[]::text[], null),
  ('Fresh Vegetables', 'Sweet Potatoes',   array[]::text[], null),
  ('Fresh Vegetables', 'Capsicum',         array[]::text[], null),
  ('Fresh Vegetables', 'Potatoes',         array[]::text[], null),
  ('IQF Frozen Fruits', 'Dragon Fruit',  array[]::text[], null),
  ('IQF Frozen Fruits', 'Passion Fruit', array[]::text[], null),
  ('IQF Frozen Fruits', 'Mango',         array[]::text[], null),
  ('IQF Frozen Fruits', 'Lychee',        array[]::text[], null),
  ('IQF Frozen Fruits', 'Avocado',       array[]::text[], null),
  ('IQF Frozen Fruits', 'Blueberry',     array[]::text[], null),
  ('IQF Frozen Fruits', 'Raspberry',     array[]::text[], null),
  ('IQF Frozen Fruits', 'Strawberry',    array[]::text[], null),
  ('IQF Frozen Vegetables', 'Broccoli',         array[]::text[], null),
  ('IQF Frozen Vegetables', 'Cauliflower',      array[]::text[], null),
  ('IQF Frozen Vegetables', 'Green Beans',      array[]::text[], null),
  ('IQF Frozen Vegetables', 'Green Peas',       array[]::text[], null),
  ('IQF Frozen Vegetables', 'Spinach',          array[]::text[], null),
  ('IQF Frozen Vegetables', 'Artichoke',        array[]::text[], null),
  ('IQF Frozen Vegetables', 'Mixed Vegetables', array[]::text[], null),
  ('IQF Frozen Vegetables', 'Okra',             array[]::text[], null),
  ('IQF Frozen Vegetables', 'Molokhia',         array[]::text[], null),
  ('Jams — Prime Roots', 'Dragon Fruit & Strawberry Jam', array[]::text[], 'Standard jar: 160 g'),
  ('Jams — Prime Roots', 'Lychee Jam',                    array[]::text[], 'Standard jar: 160 g'),
  ('Jams — Prime Roots', 'Passion Fruit Jam',             array[]::text[], 'Standard jar: 160 g'),
  ('Jams — Prime Roots', 'Passion Lemon Jam',             array[]::text[], 'Standard jar: 160 g')
)
insert into public.products (category_id, name, product_type, varieties, specifications)
select c.id, s.name, c.product_type, s.varieties, s.spec
  from seed s join public.product_categories c on lower(c.name) = lower(s.cat)
 where not exists (select 1 from public.products p
                    where lower(p.name) = lower(s.name) and p.product_type = c.product_type);

-- ---------------------------------------------------------------------
-- Import products saved in the current CRM (crm_records)
-- ---------------------------------------------------------------------
create or replace function public.app_norm_product_name(n text)
returns text language sql immutable as $$
  select regexp_replace(regexp_replace(regexp_replace(
           trim(regexp_replace(regexp_replace(lower(coalesce(n, '')), '^frozen\s+', ''), '\s+jam$', '')),
         'ies$', 'y'), 'oes$', 'o'), 's$', '')
$$;

create or replace function public.app_num_or_null(v text)
returns numeric language plpgsql immutable as $$
begin
  if v is null or trim(v) = '' then return null; end if;
  return case when v::numeric > 0 then v::numeric end;
exception when others then return null;
end $$;

do $$
declare
  r record; t public.app_product_type; cat_id uuid; pid uuid;
  kg numeric; gkg numeric; cpp int; packing text;
begin
  for r in
    select record_key, data from public.crm_records
     where record_type = 'products' and data ? 'name' and coalesce(trim(data->>'name'), '') <> ''
  loop
    if exists (select 1 from public.products where legacy_key = r.record_key) then continue; end if;

    t := case
      when r.data->>'category' ilike 'frozen%' then 'frozen'
      when r.data->>'category' ilike '%jam%'   then 'jam'
      else 'fresh' end;

    select p.id into pid from public.products p
     where p.product_type = t and p.archived_at is null and p.legacy_key is null
       and public.app_norm_product_name(p.name) = public.app_norm_product_name(r.data->>'name')
     limit 1;

    if pid is null then
      select id into cat_id from public.product_categories where lower(name) = lower(
        case
          when r.data->>'category' = 'Frozen Vegetables' then 'IQF Frozen Vegetables'
          when t = 'frozen'                              then 'IQF Frozen Fruits'
          when t = 'jam'                                 then 'Jams — Prime Roots'
          when r.data->>'category' = 'Tropical'          then 'Fresh Tropical Fruits'
          else 'Fresh Citrus & Other Fruits' end);
      insert into public.products (category_id, name, product_type, notes)
      values (cat_id,
              case when exists (select 1 from public.products x
                                 where lower(x.name) = lower(trim(r.data->>'name'))
                                   and x.product_type = t and x.archived_at is null)
                   then trim(r.data->>'name') || ' (from CRM ' || r.record_key || ')'
                   else trim(r.data->>'name') end,
              t, 'Imported from the current CRM')
      returning id into pid;
    end if;

    update public.products
       set legacy_key = r.record_key,
           legacy_data = r.data,
           specifications = coalesce(specifications, nullif(trim(r.data->>'spec'), ''))
     where id = pid;

    kg := public.app_num_or_null(r.data->>'kg');
    gkg := public.app_num_or_null(r.data->>'grossKg');
    cpp := floor(public.app_num_or_null(r.data->>'cpp'))::int;
    packing := nullif(trim(r.data->>'packing'), '');
    if (kg is not null or gkg is not null or cpp is not null or packing is not null)
       and not exists (select 1 from public.product_packaging where product_id = pid) then
      insert into public.product_packaging
        (product_id, label, net_weight_kg, gross_weight_kg, cartons_per_pallet, is_default, notes)
      values (pid,
              coalesce(packing, case when kg is not null then kg::text || ' kg carton' else 'Carton' end),
              kg, case when gkg >= coalesce(kg, 0) then gkg end, nullif(cpp, 0), true,
              'Imported from the current CRM');
    end if;
  end loop;
end $$;

insert into public.app_migrations (version) values ('0002_products') on conflict do nothing;

commit;

-- After running, this shows how many products each category has:
select c.name as category, count(p.id) as products,
       count(p.legacy_key) as from_current_crm,
       count(pp.id) as with_packaging
  from public.product_categories c
  left join public.products p on p.category_id = c.id and p.archived_at is null
  left join public.product_packaging pp on pp.product_id = p.id and pp.is_default
 group by c.name, c.sort_order order by c.sort_order;
