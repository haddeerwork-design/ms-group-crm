-- =====================================================================
-- MS El-brancy Group platform — Migration 0012: Product specs & packing
-- ---------------------------------------------------------------------
-- WHAT THIS DOES (additive only, nothing is deleted or overwritten):
--   1. Packaging gets: which variety it is for, units per pack (e.g. 14
--      bunches, 12 punnets), the unit and its weight, and packs per
--      container.
--   2. Fills product data from "MS_Elbrancy_Product_Price_Specs.xlsx"
--      and the Spring Onions offer (6 packing models):
--        varieties, storage temperature, season, sizes, packing notes.
--      A field that already has a value in the app is NOT changed.
--      Varieties are added to the existing list, never removed.
--   3. Adds the packaging options from those files. An option whose label
--      already exists for that product is skipped.
--   4. Creates a product only if it does not exist yet (Fresh Strawberries).
--
--   PRICES ARE NOT IMPORTED: the sheet does not say if they are cost or
--   selling prices. They can be entered in Pricing once confirmed.
--   Unclear values in the sheet are written as notes to confirm, not used.
--
-- Requires 0011_production. Safe to run more than once.
-- =====================================================================

begin;

do $$ begin
  if not exists (select 1 from public.app_migrations where version = '0011_production') then
    raise exception 'Run 0011_production first.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. New packaging fields
-- ---------------------------------------------------------------------
alter table public.product_packaging
  add column if not exists variety             text,
  add column if not exists units_per_pack      int     check (units_per_pack > 0),
  add column if not exists unit_name           text,
  add column if not exists unit_weight_g       numeric check (unit_weight_g > 0),
  add column if not exists packs_per_container int     check (packs_per_container > 0);

comment on column public.product_packaging.units_per_pack is 'e.g. 14 (bunches), 12 (punnets)';
comment on column public.product_packaging.packs_per_container is 'Packs per container as given by the source (container noted in notes)';

-- ---------------------------------------------------------------------
-- 2. Product data (from the specs sheet)
-- ---------------------------------------------------------------------
create temp table spec_products (
  key text primary key, candidates text[], category text, new_name text, varieties text[],
  temp text, s_start int, s_end int, size text, spec text, notes text
) on commit drop;

insert into spec_products values
 ('mango',     array['Mango','Keitt Mango','Mangoes'], 'Fresh Citrus & Other Fruits', 'Mango', array['Keitt'],
  '7–12 °C (depends on ripeness)', 9, 11, '6, 8, 9, 10 or 12 pcs per box', 'Plastic crates 6 kg; cartons 4, 5, 6 or 10 kg.',
  'Specs sheet: 4,620 cartons per container (carton size not stated — confirm).'),
 ('pomegranate', array['Pomegranates','Pomegranate'], 'Fresh Citrus & Other Fruits', 'Pomegranates', array['116','Wonderful'],
  '5–7 °C', 7, 12, '116: 10–18 · Wonderful: 5–12', '116: July–August · Wonderful: September–December. 20 pallets per 40ft container.',
  'Wonderful: the sheet gives both 180 and 170 boxes per pallet (3,600 vs 3,400 per container) — confirm.'),
 ('lemons',    array['Lemons','Lemon'], 'Fresh Citrus & Other Fruits', 'Lemons', array['Eureka','Adalia'],
  '6–8 °C', 11, 3, '80 / 88 / 100 / 113 / 125 / 138', 'Plastic crates or cartons, 15 kg net (16 kg gross).', null),
 ('avocado',   array['Avocado','Avocados'], 'Fresh Tropical Fruits', 'Avocado', array['Hass','Fuerte','Ettinger'],
  '5–7 °C', 10, 2, null, 'Ettinger & Fuerte: October–February · Hass: November–February. Telescopic cartons 4 or 5 kg.', null),
 ('guava',     array['Guava'], 'Fresh Citrus & Other Fruits', 'Guava', array[]::text[],
  '5–8 °C', 8, 11, null, 'Punnets or cartons, 2 kg or 5 kg.', 'Specs sheet lists 1.75 kg net weight without saying which pack — confirm.'),
 ('strawberry', array['Strawberries','Strawberry','Fresh Strawberries'], 'Fresh Tropical Fruits', 'Strawberries', array[]::text[],
  '0–1 °C', 11, 4, '25–35 mm per piece', 'High punnet and flat punnet cartons (see packaging).', null),
 ('cherimoya', array['Cherimoya'], 'Fresh Tropical Fruits', 'Cherimoya', array[]::text[],
  '8–10 °C', 10, 12, null, 'Cartons with dividers, 3 or 5 kg.', null),
 ('barhi',     array['Barhi Dates','Barhi'], 'Fresh Citrus & Other Fruits', 'Barhi Dates', array[]::text[],
  '0–4 °C', 9, 10, null, 'Open-top carton 5 kg loose, or flat carton with 10 × 500 g punnets.', null),
 ('dragon',    array['Dragon Fruit'], 'Fresh Tropical Fruits', 'Dragon Fruit', array['Red/White'],
  '8–10 °C', 10, 1, null, null, null),
 ('passion',   array['Passion Fruit'], 'Fresh Tropical Fruits', 'Passion Fruit', array[]::text[],
  '7–10 °C', 11, 2, null, null, null),
 ('lychee',    array['Lychee'], 'Fresh Tropical Fruits', 'Lychee', array[]::text[],
  '2–5 °C', 6, 8, null, null, null),
 ('papaya',    array['Papaya'], 'Fresh Tropical Fruits', 'Papaya', array[]::text[],
  '10–13 °C', null, null, null, 'Available all year round.', null),
 ('blackberry', array['Blackberries','Blackberry'], 'Fresh Tropical Fruits', 'Blackberries', array[]::text[],
  '0–0.5 °C', 8, 10, null, null, null),
 ('blueberry', array['Blueberries','Blueberry'], 'Fresh Tropical Fruits', 'Blueberries', array[]::text[],
  '0–1 °C', 1, 5, '14 up, 16 up', 'Carton with 12 punnets × 125 g, 170 cartons per pallet.', 'Specs sheet mentions loads of 3 or 6 pallets.'),
 ('raspberry', array['Raspberries','Raspberry'], 'Fresh Tropical Fruits', 'Raspberries', array[]::text[],
  '0–0.5 °C', 5, 7, null, null, null),
 ('valencia',  array['Valencia Oranges','Valencia Orange'], 'Fresh Citrus & Other Fruits', 'Valencia Oranges', array[]::text[],
  '4–6 °C', 12, 3, '42 / 48 / 56 / 64 / 72 / 80 / 88 / 100 / 113', 'Telescopic: 24 t on 20 pallets per 40ft (1,600 boxes) · Open top: 19.5 t on 20 pallets (1,300 boxes).', null),
 ('navel',     array['Navel Oranges','Navel Orange'], 'Fresh Citrus & Other Fruits', 'Navel Oranges', array[]::text[],
  '3–5 °C', 11, 2, '36 / 40 / 42 / 48 / 56 / 64 / 72 / 80 / 88 / 100 / 113', 'Telescopic: 24 t on 20 pallets per 40ft (1,600 boxes) · Open top: 19.5 t on 20 pallets (1,300 boxes).', null),
 ('sweetpotato', array['Sweet Potatoes','Sweet Potato'], 'Fresh Vegetables', 'Sweet Potatoes', array['Beauregard','Bellevue'],
  '13–15 °C', 7, 2, 'S 80–150 g · M 150–300 g · L1 300–450 g · L2 450–600 g · XL 600–800 g · Jumbo 800 g+',
  'Beauregard: July–October · Bellevue: August–February.', null),
 ('iceberg',   array['Iceberg Lettuce','Iceberg','Lettuce'], 'Fresh Vegetables', 'Iceberg Lettuce', array[]::text[],
  '0–1 °C', 10, 7, '7 to 9 heads per carton', 'Carton about 6 kg (depends on head size).', null),
 ('habanero',  array['Habanero Peppers','Habanero'], 'Fresh Vegetables', 'Habanero Peppers', array[]::text[],
  '7–10 °C', null, null, null, 'Carton 3 kg.', null),
 ('springonion', array['Spring Onions','Spring Onion','Green Onions'], 'Fresh Vegetables', 'Spring Onions', array[]::text[],
  null, null, null, 'Bunch 120–160 g', 'Six packing models (see packaging). Bunch length 35, 38, 40 or 45 cm depending on the model and buyer. 21 pallets per container.', null),
 ('garlic',    array['Garlic'], 'Fresh Vegetables', 'Garlic', array['White','Purple'],
  null, 2, 10, '30–40 / 40–50 / 50–60 / 60+ mm', 'Fresh: February–April · Dried: May–October. A 40ft container takes 20 MT.', null),
 ('onion',     array['Dry Onions','Onion','Onions'], 'Fresh Vegetables', 'Dry Onions', array['Golden','White','Red'],
  null, null, null, null, null, null);

-- Which product each row means (an existing fresh product, first matching name wins).
create temp table spec_map (key text primary key, product_id uuid) on commit drop;
insert into spec_map
select s.key, (
  select p.id from public.products p, unnest(s.candidates) with ordinality as c(name, ord)
   where lower(p.name) = lower(c.name) and p.product_type = 'fresh' and p.archived_at is null
   order by c.ord limit 1)
from spec_products s;

-- Create the ones that do not exist yet.
with created as (
  insert into public.products (category_id, name, product_type, varieties)
  select c.id, s.new_name, 'fresh', s.varieties
    from spec_products s join spec_map m using (key)
    join public.product_categories c on lower(c.name) = lower(s.category)
   where m.product_id is null
  returning id, name
)
update spec_map m set product_id = cr.id
  from created cr, spec_products s
 where s.key = m.key and lower(s.new_name) = lower(cr.name) and m.product_id is null;

-- Fill only empty fields; add varieties without duplicates.
update public.products p set
  varieties = (select coalesce(array_agg(v order by o), '{}') from (
                 select distinct on (lower(v)) v, o from (
                   select v, ord o from unnest(p.varieties) with ordinality x(v, ord)
                   union all select v, 1000 + ord from unnest(s.varieties) with ordinality y(v, ord)) z
                 order by lower(v), o) w),
  storage_temperature = coalesce(nullif(trim(p.storage_temperature), ''), s.temp),
  season_start_month  = case when p.season_start_month is null and s.s_start is not null then s.s_start else p.season_start_month end,
  season_end_month    = case when p.season_start_month is null and s.s_start is not null then s.s_end   else p.season_end_month end,
  size_caliber        = coalesce(nullif(trim(p.size_caliber), ''), s.size),
  specifications      = coalesce(nullif(trim(p.specifications), ''), s.spec),
  notes               = coalesce(nullif(trim(p.notes), ''), s.notes)
from spec_products s join spec_map m using (key)
where p.id = m.product_id;

-- ---------------------------------------------------------------------
-- 3. Packaging options
-- ---------------------------------------------------------------------
create temp table spec_packs (
  key text, sort int, label text, variety text, ptype text, net numeric, gross numeric,
  l numeric, w numeric, h numeric, cpp int, units int, unit text, unit_g numeric, per_cont int, notes text
) on commit drop;

insert into spec_packs values
 ('mango', 1, 'Plastic crate 6 kg', 'Keitt', 'Plastic crate', 6, null, null, null, null, null, null, null, null, null, null),
 ('mango', 2, 'Carton 4 kg', 'Keitt', 'Carton', 4, null, null, null, null, null, null, null, null, null, null),
 ('mango', 3, 'Carton 5 kg', 'Keitt', 'Carton', 5, null, null, null, null, null, null, null, null, null, null),
 ('mango', 4, 'Carton 6 kg', 'Keitt', 'Carton', 6, null, null, null, null, null, null, null, null, null, null),
 ('mango', 5, 'Carton 10 kg', 'Keitt', 'Carton', 10, null, null, null, null, null, null, null, null, null, null),
 ('pomegranate', 1, '116 · Open-top carton 4 kg', '116', 'Open-top carton', 4, null, null, null, null, null, null, null, null, null, '180–210 cartons per pallet; 20 pallets per 40ft.'),
 ('pomegranate', 2, '116 · Plastic tray 15 kg', '116', 'Plastic tray', 15, null, null, null, null, 60, null, null, null, null, '60 trays per pallet; 20 pallets per 40ft.'),
 ('pomegranate', 3, 'Wonderful · Open-top carton 4.5 kg', 'Wonderful', 'Open-top carton', 4.5, null, null, null, null, null, null, null, null, null, 'With label, tray and MA bag available. 170 or 180 boxes per pallet — confirm.'),
 ('pomegranate', 4, 'Wonderful · Plastic tray 4.5 kg', 'Wonderful', 'Plastic tray', 4.5, null, null, null, null, null, null, null, null, null, null),
 ('lemons', 1, 'Carton or crate 15 kg', null, 'Carton or plastic crate', 15, 16, null, null, null, null, null, null, null, null, null),
 ('avocado', 1, 'Telescopic carton 4 kg', null, 'Telescopic carton', 3.5, 4, null, null, null, null, null, null, null, null, null),
 ('avocado', 2, 'Telescopic carton 5 kg', null, 'Telescopic carton', 4.5, 5, null, null, null, null, null, null, null, null, null),
 ('guava', 1, 'Punnets / carton 2 kg', null, 'Punnets or carton', null, null, null, null, null, null, null, null, null, null, 'Net weight to confirm (sheet says 1.75 kg).'),
 ('guava', 2, 'Punnets / carton 5 kg', null, 'Punnets or carton', null, null, null, null, null, null, null, null, null, null, null),
 ('strawberry', 1, 'High punnet 20 × 225 g', null, 'Carton', 4.5, null, null, null, null, null, 20, 'punnet', 225, null, null),
 ('strawberry', 2, 'High punnet 12 × 400 g', null, 'Carton', 4.8, null, null, null, null, null, 12, 'punnet', 400, null, null),
 ('strawberry', 3, 'Flat clamshell 10 × 250 g', null, 'Flat carton', 2.5, null, null, null, null, null, 10, 'punnet', 250, null, null),
 ('strawberry', 4, 'Flat punnet 8 × 250 g', null, 'Flat carton', 2.0, null, null, null, null, null, 8, 'punnet', 250, null, null),
 ('strawberry', 5, 'Flat carton K37 10 × 225 g', null, 'Flat carton K37', 2.25, null, null, null, null, null, 10, 'punnet', 225, null, null),
 ('strawberry', 6, 'Flat carton K62 6 × 400 g', null, 'Flat carton K62', 2.4, null, null, null, null, null, 6, 'punnet', 400, null, null),
 ('strawberry', 7, 'Double carton K62 12 × 400 g', null, 'Double carton K62', 4.8, null, null, null, null, null, 12, 'punnet', 400, null, null),
 ('cherimoya', 1, 'Carton with dividers 3 kg', null, 'Carton with dividers', 3, 3.2, 30, 40, 12, 111, null, null, null, null, '111 boxes per air pallet.'),
 ('cherimoya', 2, 'Carton with dividers 5 kg', null, 'Carton with dividers', 5, null, null, null, null, null, null, null, null, null, null),
 ('barhi', 1, 'Open-top carton 5 kg (loose)', null, 'Open-top carton', 5, 5.2, null, null, null, null, null, null, null, null, null),
 ('barhi', 2, 'Flat carton 10 × 500 g', null, 'Flat carton', 5, null, null, null, null, null, 10, 'punnet', 500, null, null),
 ('blueberry', 1, 'Carton 12 × 125 g', null, 'Carton', 1.5, null, null, null, null, 170, 12, 'punnet', 125, null, null),
 ('valencia', 1, 'Telescopic carton 15 kg', null, 'Telescopic carton', 15, 16, null, null, null, 80, null, null, null, 1600, '40ft: 24 t on 20 pallets.'),
 ('valencia', 2, 'Open-top carton 15 kg', null, 'Open-top carton', 15, 16, null, null, null, 65, null, null, null, 1300, '40ft: 19.5 t on 20 pallets.'),
 ('navel', 1, 'Telescopic carton 15 kg', null, 'Telescopic carton', 15, 16, null, null, null, 80, null, null, null, 1600, '40ft: 24 t on 20 pallets.'),
 ('navel', 2, 'Open-top carton 15 kg', null, 'Open-top carton', 15, 16, null, null, null, 65, null, null, null, 1300, '40ft: 19.5 t on 20 pallets.'),
 ('sweetpotato', 1, 'Plastic crate 6 kg', null, 'Plastic crate', 6, null, null, null, null, null, null, null, null, 3600, 'Per container.'),
 ('sweetpotato', 2, 'Carton 5 kg', null, 'Carton', 5, null, null, null, null, null, null, null, null, 3744, 'Per container.'),
 ('iceberg', 1, 'Carton 6 kg (7–9 heads)', null, 'Carton', 6, null, null, null, null, null, null, 'head', null, null, 'Weight depends on head size.'),
 ('habanero', 1, 'Carton 3 kg', null, 'Carton', 3, null, null, null, null, null, null, null, null, null, null),
 ('springonion', 1, 'Model 01 · Carton 14 bunches', null, 'Carton', 1.82, null, 30, 40, 9.5, null, 14, 'bunch', 130, 4992, '9.085 MT per container. Bunch length on buyer request.'),
 ('springonion', 2, 'Model 02 · Plastic basket 28 bunches', null, 'Plastic basket', 4.48, null, 30, 50, 15, null, 28, 'bunch', 160, 2304, '10.322 MT per container.'),
 ('springonion', 3, 'Model 03 · Plastic basket 35 bunches', null, 'Plastic basket', 5.25, null, 30, 40, 22, null, 35, 'bunch', 150, 2080, '10.920 MT per container.'),
 ('springonion', 4, 'Model 04 · Plastic basket 36 bunches', null, 'Plastic basket', 4.32, null, 30, 40, 20, null, 36, 'bunch', 120, 2280, '9.850 MT per container.'),
 ('springonion', 5, 'Model 05 · Carton 14 bunches', null, 'Carton', 2.10, null, 30, 50, 9.5, 192, 14, 'bunch', 150, 3984, '8.366 MT per container: 20 pallets × 192 + 1 pallet × 144.'),
 ('springonion', 6, 'Model 06 · Plastic basket 40 bunches', null, 'Plastic basket', 6.00, null, 30, 40, 22, null, 40, 'bunch', 150, 2080, '12.480 MT per container.'),
 ('garlic', 1, 'Mesh bag 250 g', null, 'Mesh bag', 0.25, null, null, null, null, null, null, null, null, null, null),
 ('garlic', 2, 'Mesh bag 1 kg', null, 'Mesh bag', 1, null, null, null, null, null, null, null, null, null, null),
 ('garlic', 3, 'Carton / plastic box 10 kg (loose)', null, 'Carton or plastic box', 10, null, null, null, null, null, null, null, null, null, null),
 ('garlic', 4, 'Mesh bag 25 kg', null, 'Mesh bag', 25, null, null, null, null, null, null, null, null, null, null);

insert into public.product_packaging (product_id, label, variety, packaging_type, net_weight_kg, gross_weight_kg,
  length_cm, width_cm, height_cm, cartons_per_pallet, units_per_pack, unit_name, unit_weight_g, packs_per_container, notes, is_default)
select m.product_id, k.label, k.variety, k.ptype, k.net, k.gross, k.l, k.w, k.h, k.cpp, k.units, k.unit, k.unit_g, k.per_cont, k.notes,
       -- first new option becomes the default only if the product has none
       k.sort = (select min(k2.sort) from spec_packs k2 where k2.key = k.key)
       and not exists (select 1 from public.product_packaging d where d.product_id = m.product_id and d.is_default and d.archived_at is null)
  from spec_packs k join spec_map m using (key)
 where m.product_id is not null
   and not exists (select 1 from public.product_packaging x
                    where x.product_id = m.product_id and lower(x.label) = lower(k.label) and x.archived_at is null)
 order by k.key, k.sort;

insert into public.app_migrations (version) values ('0012_product_specs') on conflict do nothing;

commit;

select 'Product specs installed' as status;
