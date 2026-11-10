-- =====================================================================
-- MS El-brancy Group platform — Migration 0016: Selling prices from the specs sheet
-- ---------------------------------------------------------------------
-- WHAT THIS DOES (additive only):
--   1. A selling price can be saved without an Incoterm (shown as
--      "Not set"), so prices can be entered quickly and edited later.
--   2. Adds the SELLING prices from "MS_Elbrancy_Product_Price_Specs.xlsx"
--      (confirmed by Haddeer on 10 Nov 2026), in EGP:
--        per kg as in the sheet; Spring Onions per carton (148 EGP,
--        carton of 14 bunches, 2.1 kg = Model 05); Habanero also per 3 kg carton.
--      Each price is a version: editing later saves a new version and the
--      old one stays in the history.
--
-- Requires 0015_prime_roots_terms. Safe to run more than once.
-- =====================================================================

begin;

do $$ begin
  if not exists (select 1 from public.app_migrations where version = '0015_prime_roots_terms') then
    raise exception 'Run 0015_prime_roots_terms first.';
  end if;
end $$;

-- 1. Incoterm optional --------------------------------------------------
do $$ declare c record; begin
  for c in select conname from pg_constraint
            where conrelid = 'public.product_prices'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%incoterm IS NOT NULL%'
  loop
    execute format('alter table public.product_prices drop constraint %I', c.conname);
  end loop;
end $$;

-- 2. Prices from the sheet --------------------------------------------------
create temp table sheet_prices (product text, variety text, pack_label text, per text, price numeric) on commit drop;
insert into sheet_prices values
  ('Mango',           'Keitt',      null, 'kg', 49),
  ('Pomegranates',    'Wonderful',  null, 'kg', 45),
  ('Lemons',          null,         null, 'kg', 40),
  ('Avocado',         'Ettinger',   null, 'kg', 150),
  ('Avocado',         'Fuerte',     null, 'kg', 150),
  ('Avocado',         'Hass',       null, 'kg', 160),
  ('Guava',           null,         null, 'kg', 65),
  ('Cherimoya',       null,         null, 'kg', 170),
  ('Barhi Dates',     null,         null, 'kg', 70),
  ('Dragon Fruit',    'Red/White',  null, 'kg', 200),
  ('Passion Fruit',   null,         null, 'kg', 250),
  ('Sweet Potatoes',  'Beauregard', null, 'kg', 21),
  ('Iceberg Lettuce', null,         null, 'kg', 135),
  ('Habanero Peppers', null,        null, 'kg', 120),
  ('Habanero Peppers', null,        'Carton 3 kg', 'pack', 385),
  ('Spring Onions',   null,         'Model 05 · Carton 14 bunches', 'pack', 148);

insert into public.product_prices (product_id, packaging_id, variety, net_weight_kg, cartons_per_pallet, sell_currency,
  price_per_ton, price_basis, unit_price, unit_label, source, notes, valid_from)
select p.id, k.id, s.variety,
       case when s.per = 'kg' then 1 else k.net_weight_kg end,
       case when s.per = 'kg' then null else k.cartons_per_pallet end,
       'EGP',
       case when s.per = 'kg' then s.price * 1000 else round(s.price / k.net_weight_kg * 1000, 2) end,
       'unit', s.price,
       case when s.per = 'kg' then 'kg' else 'carton' end,
       'imported', 'Selling price from the specs sheet (confirmed 10 Nov 2026). Incoterm not set.', date '2026-11-10'
  from sheet_prices s
  join public.products p on lower(p.name) = lower(s.product) and p.product_type = 'fresh' and p.archived_at is null
  left join public.product_packaging k on k.product_id = p.id and s.pack_label is not null
        and lower(k.label) = lower(s.pack_label) and k.archived_at is null
 where (s.per = 'kg' or k.net_weight_kg > 0)
   and not exists (select 1 from public.product_prices x
                    where x.product_id = p.id and x.price_basis = 'unit' and x.unit_price = s.price and x.sell_currency = 'EGP'
                      and coalesce(x.variety, '') = coalesce(s.variety, '') and x.packaging_id is not distinct from k.id);

insert into public.app_migrations (version) values ('0016_selling_prices') on conflict do nothing;

commit;

select count(*) as sheet_prices_added from public.product_prices where notes like 'Selling price from the specs sheet%';
