-- LOCAL TESTING ONLY.
\set ON_ERROR_STOP on
\set A '00000000-0000-0000-0000-00000000000a'
-- Lemons: an old imported price, the sheet price, then a CIF and a FOB version for the same packing (no variety)
insert into public.product_prices (product_id, net_weight_kg, sell_currency, price_per_ton, source, notes)
select id, 1, 'USD', 900, 'imported', 'old' from public.products where name = 'Lemons' and product_type = 'fresh';
insert into public.product_prices (product_id, net_weight_kg, sell_currency, price_per_ton, incoterm, source, created_by, created_at)
select id, 1, 'EGP', 60000, 'CIF', 'app', :'A', now() + interval '1 minute' from public.products where name = 'Lemons' and product_type = 'fresh';
insert into public.product_prices (product_id, net_weight_kg, sell_currency, price_per_ton, incoterm, source, created_by, created_at)
select id, 1, 'EGP', 55000, 'FOB', 'app', :'A', now() + interval '2 minutes' from public.products where name = 'Lemons' and product_type = 'fresh';
set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false);
do $$ begin
  assert (select count(*) from public.product_price_list l join public.products p on p.id = l.product_id
           where p.name = 'Lemons' and l.packaging_id is null and l.variety is null) = 1, 'one row per product + packing + variety';
  assert (select price_per_ton from public.product_price_list l join public.products p on p.id = l.product_id
           where p.name = 'Lemons' and l.packaging_id is null and l.variety is null) = 55000, 'newest wins';
  assert not exists (select 1 from public.product_price_list where source = 'imported'
                      and product_id in (select product_id from public.product_prices where source <> 'imported')), 'imported hidden when a new price exists';
  assert (select count(*) from public.product_price_list l join public.products p on p.id = l.product_id where p.name = 'Avocado') = 3, 'avocado: one per variety';
  raise notice 'PASS clean price list';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.product_prices p join public.products x on x.id = p.product_id where x.name = 'Lemons') >= 3, 'history kept';
  raise notice 'PASS history untouched';
end $$;
do $$ begin
  assert (select count(*) from public.products where name like 'Lemons (from CRM%' and archived_at is not null and notes like '%Merged into Lemons%') = 1, 'duplicate merged once, archived';
  assert (select count(*) from public.products where product_type = 'fresh' and archived_at is null and public.app_product_key(name) = 'lemon') = 1, 'one active Lemons';
  assert exists (select 1 from public.products where legacy_key = 'p99'), 'old CRM link kept (re-import will not recreate it)';
  raise notice 'PASS duplicates merged automatically, nothing deleted';
end $$;
