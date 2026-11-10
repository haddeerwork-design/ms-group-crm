-- =====================================================================
-- MS El-brancy Group platform — Migration 0013: Brands & unit prices
-- ---------------------------------------------------------------------
-- WHAT THIS DOES (additive only, nothing is deleted):
--   1. Each quotation is printed under a brand: MS El-brancy Group (default)
--      or Prime Roots (own letterhead).
--   2. A price can be per ton (as before) or per unit (e.g. per 160 g jar).
--      Quotation lines and price-list prices keep both: the unit price as
--      given, and the per-ton equivalent the rest of the system uses.
--      Quantities can be entered in units (jars, bunches…).
--   3. Prime Roots jams get the 160 g jar packaging and the prices given by
--      Haddeer on 10 Nov 2026 (EGP per jar):
--        Dragon Fruit & Strawberry 185 · Passion Fruit 185 ·
--        Passion Lemon 185 · Lychee 245
--      Incoterm was not stated, so it is left empty (shown as "Imported").
--
-- Requires 0012_product_specs. Safe to run more than once.
-- =====================================================================

-- New enum value must be added outside the main transaction.
alter type public.app_qty_unit add value if not exists 'units';

begin;

do $$ begin
  if not exists (select 1 from public.app_migrations where version = '0012_product_specs') then
    raise exception 'Run 0012_product_specs first.';
  end if;
end $$;

-- 1. Brand on quotations -----------------------------------------------
alter table public.quotations
  add column if not exists brand text not null default 'ms_elbrancy';
do $$ begin
  alter table public.quotations add constraint quotations_brand_chk check (brand in ('ms_elbrancy', 'prime_roots'));
exception when duplicate_object then null; end $$;

-- 2. Unit prices -------------------------------------------------------
alter table public.quotation_items
  add column if not exists price_basis text not null default 'ton',
  add column if not exists unit_price  numeric,
  add column if not exists unit_label  text;
do $$ begin
  alter table public.quotation_items add constraint quotation_items_basis_chk
    check (price_basis in ('ton', 'unit') and (price_basis = 'ton' or (coalesce(unit_price, 0) > 0 and coalesce(net_weight_kg, 0) > 0)));
exception when duplicate_object then null; end $$;

alter table public.product_prices
  add column if not exists price_basis text not null default 'ton',
  add column if not exists unit_price  numeric,
  add column if not exists unit_label  text;
do $$ begin
  alter table public.product_prices add constraint product_prices_basis_chk
    check (price_basis in ('ton', 'unit') and (price_basis = 'ton' or (coalesce(unit_price, 0) > 0 and coalesce(net_weight_kg, 0) > 0)));
exception when duplicate_object then null; end $$;

-- Price list view: same columns as before, unit price added at the end.
create or replace view public.product_price_list as
select distinct on (product_id, packaging_id, incoterm, coalesce(variety, ''))
       id, product_id, packaging_id, variety, incoterm, destination,
       net_weight_kg, cartons_per_pallet, sell_currency, price_per_ton,
       valid_from, valid_until, source, created_at,
       price_basis, unit_price, unit_label
  from public.product_prices
 where public.app_is_member()
 order by product_id, packaging_id, incoterm, coalesce(variety, ''), created_at desc;
revoke all on public.product_price_list from anon;
grant select on public.product_price_list to authenticated;

-- 3. Prime Roots jams ----------------------------------------------------
create temp table jam_prices (name text, price numeric) on commit drop;
insert into jam_prices values
  ('Dragon Fruit & Strawberry Jam', 185), ('Passion Fruit Jam', 185), ('Passion Lemon Jam', 185), ('Lychee Jam', 245);

insert into public.product_packaging (product_id, label, packaging_type, net_weight_kg, units_per_pack, unit_name, unit_weight_g, is_default)
select p.id, 'Jar 160 g', 'Glass jar', 0.16, 1, 'jar', 160,
       not exists (select 1 from public.product_packaging d where d.product_id = p.id and d.is_default and d.archived_at is null)
  from public.products p join jam_prices j on lower(p.name) = lower(j.name)
 where p.product_type = 'jam' and p.archived_at is null
   and not exists (select 1 from public.product_packaging x where x.product_id = p.id and lower(x.label) = 'jar 160 g' and x.archived_at is null);

insert into public.product_prices (product_id, packaging_id, net_weight_kg, sell_currency, price_per_ton,
  price_basis, unit_price, unit_label, source, notes, valid_from)
select p.id, k.id, 0.16, 'EGP', round(j.price / 0.16 * 1000, 2), 'unit', j.price, 'jar', 'imported',
       'Prime Roots price per 160 g jar, given by Haddeer on 10 Nov 2026. Incoterm not stated.', date '2026-11-10'
  from public.products p
  join jam_prices j on lower(p.name) = lower(j.name)
  join public.product_packaging k on k.product_id = p.id and lower(k.label) = 'jar 160 g' and k.archived_at is null
 where p.product_type = 'jam' and p.archived_at is null
   and not exists (select 1 from public.product_prices x where x.product_id = p.id and x.price_basis = 'unit'
                    and x.unit_price = j.price and x.sell_currency = 'EGP');

insert into public.app_migrations (version) values ('0013_brands_unit_prices') on conflict do nothing;

commit;

select 'Brands and unit prices installed' as status;
