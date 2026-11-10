-- LOCAL TESTING ONLY.
\set ON_ERROR_STOP on
do $$
declare pid uuid;
begin
  -- spring onions: 6 models, numbers from the offer
  select id into pid from public.products where name = 'Spring Onions' and product_type = 'fresh';
  assert (select count(*) from public.product_packaging where product_id = pid) = 6, 'spring onion models';
  assert (select packs_per_container from public.product_packaging where product_id = pid and label like 'Model 05%') = 3984;
  assert (select units_per_pack || ' ' || unit_name from public.product_packaging where product_id = pid and label like 'Model 02%') = '28 bunch';
  assert (select count(*) from public.product_packaging where product_id = pid and is_default) = 1, 'one default';
  raise notice 'PASS spring onion packing models';

  -- varieties added, not duplicated
  assert (select varieties from public.products where name = 'Dry Onions' and product_type = 'fresh') = array['Golden','White','Red'];
  assert (select varieties from public.products where name = 'Avocado' and product_type = 'fresh') = array['Hass','Fuerte','Ettinger'], 'avocado varieties duplicated';
  assert (select varieties from public.products where name = 'Dragon Fruit' and product_type = 'fresh') = array['Red/White','Red/Red','Yellow/Yellow'];
  raise notice 'PASS varieties merged without duplicates';

  -- pomegranate packs tied to variety; fields filled
  assert (select count(*) from public.product_packaging k join public.products p on p.id = k.product_id
           where p.name = 'Pomegranates' and k.variety = 'Wonderful') = 2;
  assert (select season_start_month || '-' || season_end_month from public.products where name = 'Pomegranates') = '7-12';
  assert (select storage_temperature from public.products where name = 'Lemons') = '6–8 °C';
  raise notice 'PASS seasons, temperature and variety packs';

  -- fresh strawberries created once (frozen one untouched)
  assert (select count(*) from public.products where lower(name) = 'strawberries' and product_type = 'fresh') = 1;
  assert (select count(*) from public.products where name = 'Strawberry' and product_type = 'frozen') = 1;
  raise notice 'PASS new product created only when missing';

  -- legacy imported "Frozen Mangoes"/"Keitt Mango" did not get mango packs; catalog Mango did
  assert (select count(*) from public.product_packaging k join public.products p on p.id = k.product_id where p.name = 'Mango' and p.product_type = 'fresh') = 5;
  raise notice 'PASS packs go to the catalog product';
end $$;

-- existing values are never overwritten; rerun adds nothing
update public.products set storage_temperature = 'Set by user' where name = 'Lemons';
\i migrations/0012_product_specs.sql
do $$ begin
  assert (select storage_temperature from public.products where name = 'Lemons') = 'Set by user', 'overwrote user value';
  assert (select count(*) from public.product_packaging k join public.products p on p.id = k.product_id where p.name = 'Spring Onions') = 6, 'rerun duplicated packs';
  raise notice 'PASS rerun keeps user edits and adds no duplicates';
end $$;
