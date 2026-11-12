-- LOCAL TESTING ONLY.
\set ON_ERROR_STOP on
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
-- two versions of one line (Lemons, no packing, no variety) and another line with a variety
insert into public.product_prices (product_id, net_weight_kg, sell_currency, price_per_ton, incoterm, source, created_by, created_at)
select id, 1, 'USD', 800, 'FOB', 'app', :'A', now() from public.products where name = 'Lemons' and product_type = 'fresh' and archived_at is null;
insert into public.product_prices (product_id, net_weight_kg, sell_currency, price_per_ton, incoterm, source, created_by, created_at)
select id, 1, 'USD', 850, 'CIF', 'app', :'A', now() + interval '1 minute' from public.products where name = 'Lemons' and product_type = 'fresh' and archived_at is null;
insert into public.product_prices (product_id, variety, net_weight_kg, sell_currency, price_per_ton, incoterm, source, created_by)
select id, 'Eureka', 1, 'USD', 900, 'FOB', 'app', :'A' from public.products where name = 'Lemons' and product_type = 'fresh' and archived_at is null;

set role authenticated;
-- a Sales Officer cannot remove prices
select set_config('request.jwt.claim.sub', :'B', false);
do $$ begin
  begin
    perform public.remove_price_line((select id from public.products where name = 'Lemons' and product_type = 'fresh' and archived_at is null), null, null);
    raise exception 'should be blocked';
  exception when insufficient_privilege then raise notice 'PASS sales officer cannot remove prices';
  end;
end $$;

-- the Super Admin removes the line: both versions go, the variety line stays
select set_config('request.jwt.claim.sub', :'A', false);
create temp table removed as select unnest(public.remove_price_line(
  (select id from public.products where name = 'Lemons' and product_type = 'fresh' and archived_at is null), null, '  ')) as id;
do $$
declare lemons uuid := (select id from public.products where name = 'Lemons' and product_type = 'fresh' and archived_at is null);
begin
  assert (select count(*) from removed) >= 2, 'all versions of the line removed';
  assert not exists (select 1 from public.product_price_list where product_id = lemons and variety is null and packaging_id is null), 'line gone from the list';
  assert exists (select 1 from public.product_price_list where product_id = lemons and variety = 'Eureka'), 'other line untouched';
  raise notice 'PASS remove price line';
end $$;
select public.restore_prices(array(select id from removed));
do $$
declare lemons uuid := (select id from public.products where name = 'Lemons' and product_type = 'fresh' and archived_at is null);
begin
  assert (select price_per_ton from public.product_price_list where product_id = lemons and variety is null and packaging_id is null) = 850, 'undo brings the newest back';
  raise notice 'PASS restore prices';
end $$;
reset role;
do $$ begin
  assert exists (select 1 from public.audit_logs where table_name = 'product_prices' and action = 'UPDATE'), 'removal is in the activity log';
  raise notice 'PASS activity log';
end $$;
