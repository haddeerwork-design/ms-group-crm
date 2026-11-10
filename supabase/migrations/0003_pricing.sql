-- =====================================================================
-- MS El-brancy Group platform — Migration 0003: Pricing & exchange rates
-- ---------------------------------------------------------------------
-- WHAT THIS DOES (additive only, nothing is deleted):
--   1. exchange_rates: every rate is saved with its source and time.
--      Rates are never edited or deleted, a new rate is added instead,
--      so old quotations can always show the rate they used.
--   2. product_prices: price VERSIONS. Saving a price always adds a new
--      version; old versions stay as history and cannot be edited.
--   3. product_price_list: a safe list of the latest selling prices
--      (no costs, no margins) that every employee can read.
--   4. Copies the selling price you saved per product in the current CRM
--      (price / currency) as a first version, marked "Imported". Costs are
--      only copied into the notes, because their unit was never recorded.
--
-- WHO CAN DO WHAT
--   Selling prices (product_price_list): every employee with a role.
--   Costs, margins, full history:  Super Admin, Sales Manager, Finance Officer.
--   Save new prices:               Super Admin, Sales Manager.
--   Add exchange rates:            Super Admin, Sales Manager, Finance Officer.
--
-- Requires 0002_products. Safe to run more than once.
-- =====================================================================

begin;

do $$ begin
  if not exists (select 1 from public.app_migrations where version = '0002_products') then
    raise exception 'Run 0002_products first.';
  end if;
end $$;

do $$ begin
  create type public.app_incoterm as enum ('EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DDP');
exception when duplicate_object then null; end $$;

create or replace function public.app_can_manage_prices()
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_has_any_role(array['super_admin', 'sales_manager']::public.app_role[])
$$;
create or replace function public.app_can_view_costs()
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_has_any_role(array['super_admin', 'sales_manager', 'finance_officer']::public.app_role[])
$$;
revoke all on function public.app_can_manage_prices() from anon;
revoke all on function public.app_can_view_costs() from anon;

-- ---------------------------------------------------------------------
-- Exchange rates (append-only)
-- ---------------------------------------------------------------------
create table if not exists public.exchange_rates (
  id             bigint generated always as identity primary key,
  base_currency  text not null check (base_currency ~ '^[A-Z]{3}$'),
  quote_currency text not null check (quote_currency ~ '^[A-Z]{3}$'),
  rate           numeric not null check (rate > 0),          -- 1 base = rate quote
  source         text not null check (length(trim(source)) > 0),
  rate_at        timestamptz not null,                        -- when the source published it
  notes          text,
  created_at     timestamptz not null default now(),
  created_by     uuid default auth.uid() references auth.users(id) on delete set null,
  check (base_currency <> quote_currency),
  check (rate_at <= now() + interval '1 day')
);
create index if not exists exchange_rates_pair_idx
  on public.exchange_rates (base_currency, quote_currency, rate_at desc, id desc);
alter table public.exchange_rates enable row level security;

drop policy if exists exchange_rates_select on public.exchange_rates;
create policy exchange_rates_select on public.exchange_rates for select to authenticated
  using (public.app_is_member());
drop policy if exists exchange_rates_insert on public.exchange_rates;
create policy exchange_rates_insert on public.exchange_rates for insert to authenticated
  with check (public.app_has_any_role(array['super_admin', 'sales_manager', 'finance_officer']::public.app_role[])
              and created_by = auth.uid());
-- no update / delete policies: history is permanent

create or replace view public.exchange_rates_latest with (security_invoker = true) as
select distinct on (base_currency, quote_currency) *
  from public.exchange_rates
 order by base_currency, quote_currency, rate_at desc, id desc;

drop trigger if exists exchange_rates_audit on public.exchange_rates;
create trigger exchange_rates_audit after insert on public.exchange_rates
  for each row execute function public.app_audit();

-- ---------------------------------------------------------------------
-- Product price versions (immutable)
-- ---------------------------------------------------------------------
create table if not exists public.product_prices (
  id                         uuid primary key default gen_random_uuid(),
  product_id                 uuid not null references public.products(id),
  packaging_id               uuid references public.product_packaging(id),
  variety                    text,
  incoterm                   public.app_incoterm,           -- null only for imported prices
  destination                text,
  -- packaging snapshot used for this price
  net_weight_kg              numeric check (net_weight_kg > 0),
  cartons_per_pallet         int check (cartons_per_pallet > 0),
  -- costs in cost_currency
  cost_currency              text check (cost_currency ~ '^[A-Z]{3}$'),
  cost_per_kg                numeric check (cost_per_kg >= 0),
  packaging_cost_per_carton  numeric check (packaging_cost_per_carton >= 0),
  handling_cost_per_carton   numeric check (handling_cost_per_carton >= 0),
  inland_transport_per_ton   numeric check (inland_transport_per_ton >= 0),
  documentation_per_ton      numeric check (documentation_per_ton >= 0),
  other_costs_per_ton        numeric check (other_costs_per_ton >= 0),
  -- costs after the port, in sell_currency (used only by the Incoterms that include them)
  freight_per_ton            numeric check (freight_per_ton >= 0),
  insurance_per_ton          numeric check (insurance_per_ton >= 0),
  destination_costs_per_ton  numeric check (destination_costs_per_ton >= 0),
  duties_per_ton             numeric check (duties_per_ton >= 0),
  -- exchange rate used: 1 cost_currency = fx_rate sell_currency
  fx_rate                    numeric check (fx_rate > 0),
  fx_source                  text,
  fx_rate_at                 timestamptz,
  -- result
  sell_currency              text not null check (sell_currency ~ '^[A-Z]{3}$'),
  total_cost_per_ton         numeric check (total_cost_per_ton >= 0),   -- in sell_currency
  margin_pct                 numeric check (margin_pct < 100),
  price_per_ton              numeric not null check (price_per_ton > 0), -- in sell_currency
  valid_from                 date not null default current_date,
  valid_until                date,
  notes                      text,
  source                     text not null default 'app' check (source in ('app', 'imported')),
  created_at                 timestamptz not null default now(),
  created_by                 uuid default auth.uid() references auth.users(id) on delete set null,
  check (valid_until is null or valid_until >= valid_from),
  check (source = 'imported' or incoterm is not null)
);
create index if not exists product_prices_product_idx on public.product_prices (product_id, created_at desc);
alter table public.product_prices enable row level security;

drop policy if exists product_prices_select on public.product_prices;
create policy product_prices_select on public.product_prices for select to authenticated
  using (public.app_can_view_costs());
drop policy if exists product_prices_insert on public.product_prices;
create policy product_prices_insert on public.product_prices for insert to authenticated
  with check (public.app_can_manage_prices() and created_by = auth.uid() and source = 'app');
-- no update / delete: a correction is a new version

drop trigger if exists product_prices_audit on public.product_prices;
create trigger product_prices_audit after insert on public.product_prices
  for each row execute function public.app_audit();

-- Latest selling price per product / packaging / Incoterm / variety.
-- Runs with the owner's rights so Sales Officers can read selling prices
-- WITHOUT seeing costs; the WHERE clause still limits it to employees.
-- Created only once: later migrations (0013) add columns to this view, and
-- re-running this file must not try to remove them.
do $v$ begin
  if not exists (select 1 from pg_views where schemaname = 'public' and viewname = 'product_price_list') then
    execute $sql$
create view public.product_price_list as
select distinct on (product_id, packaging_id, incoterm, coalesce(variety, ''))
       id, product_id, packaging_id, variety, incoterm, destination,
       net_weight_kg, cartons_per_pallet, sell_currency, price_per_ton,
       valid_from, valid_until, source, created_at
  from public.product_prices
 where public.app_is_member()
 order by product_id, packaging_id, incoterm, coalesce(variety, ''), created_at desc
    $sql$;
  end if;
end $v$;

revoke all on public.product_price_list from anon;
grant select on public.product_price_list to authenticated;

-- ---------------------------------------------------------------------
-- Import selling prices saved in the current CRM
-- ---------------------------------------------------------------------
insert into public.product_prices
  (product_id, packaging_id, net_weight_kg, cartons_per_pallet, sell_currency, price_per_ton,
   source, notes, created_by)
select p.id, pk.id, pk.net_weight_kg, pk.cartons_per_pallet,
       case when coalesce(p.legacy_data->>'priceCur', '') ~ '^[A-Z]{3}$' then p.legacy_data->>'priceCur' else 'USD' end,
       public.app_num_or_null(p.legacy_data->>'price'),
       'imported',
       concat_ws(' · ',
         'Imported from the current CRM — set the Incoterm and costs, then save a new version',
         case when public.app_num_or_null(p.legacy_data->>'cost') is not null
              then 'old CRM cost: ' || (p.legacy_data->>'cost') || ' ' || coalesce(p.legacy_data->>'costCur', '') || ' (unit not recorded)' end,
         case when public.app_num_or_null(p.legacy_data->>'pack') is not null
              then 'old CRM packaging: ' || (p.legacy_data->>'pack') || ' ' || coalesce(p.legacy_data->>'packCur', '') || ' per carton' end),
       null
  from public.products p
  left join public.product_packaging pk on pk.product_id = p.id and pk.is_default and pk.archived_at is null
 where public.app_num_or_null(p.legacy_data->>'price') is not null
   and not exists (select 1 from public.product_prices x where x.product_id = p.id);

insert into public.app_migrations (version) values ('0003_pricing') on conflict do nothing;

commit;

-- After running: how many prices were imported from the current CRM.
select count(*) filter (where source = 'imported') as imported_prices,
       count(*) as all_prices
  from public.product_prices;
