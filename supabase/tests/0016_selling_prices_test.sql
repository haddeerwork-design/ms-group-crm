-- LOCAL TESTING ONLY.
\set ON_ERROR_STOP on
\set A '00000000-0000-0000-0000-00000000000a'
do $$ begin
  assert (select count(*) from public.product_prices where notes like 'Selling price from the specs sheet%') = 16, 'sheet prices';
  assert (select unit_price || ' ' || unit_label from public.product_prices r join public.products p on p.id = r.product_id
           where p.name = 'Spring Onions') = '148 carton';
  assert (select price_per_ton from public.product_prices r join public.products p on p.id = r.product_id where p.name = 'Spring Onions') = 70476.19;
  assert (select price_per_ton from public.product_prices r join public.products p on p.id = r.product_id where p.name = 'Mango' and r.variety = 'Keitt') = 49000;
  raise notice 'PASS selling prices imported (per kg / per carton)';
end $$;
-- admin can save a quick price without Incoterm
set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false);
insert into public.product_prices (product_id, net_weight_kg, sell_currency, price_per_ton, price_basis, unit_price, unit_label, source, created_by)
select id, 1, 'EGP', 52000, 'unit', 52, 'kg', 'app', :'A' from public.products where name = 'Lemons' and product_type = 'fresh';
do $$ begin
  assert (select unit_price from public.product_price_list l join public.products p on p.id = l.product_id where p.name = 'Lemons' and l.packaging_id is null) = 52, 'latest version wins';
  raise notice 'PASS quick edit saves a new version without Incoterm';
end $$;
reset role;
