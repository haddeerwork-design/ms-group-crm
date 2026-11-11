-- LOCAL TESTING ONLY.
\set ON_ERROR_STOP on
\set A '00000000-0000-0000-0000-00000000000a'
-- two "Strawberry" products: keep one, merge the other
insert into public.products (category_id, name, product_type, varieties, specifications)
select category_id, 'Strawberry (from CRM x1)', 'fresh', array['Festival', 'Fortuna'], 'Class I'
  from public.products where name = 'Strawberries' and product_type = 'fresh';
insert into public.product_packaging (product_id, label, net_weight_kg, is_default)
select id, 'Punnet 250 g x 8', 2, true from public.products where name = 'Strawberry (from CRM x1)';
insert into public.product_prices (product_id, net_weight_kg, sell_currency, price_per_ton, price_basis, unit_price, unit_label, source, created_by)
select id, 1, 'EGP', 90000, 'unit', 90, 'kg', 'app', :'A' from public.products where name = 'Strawberry (from CRM x1)';

-- a viewer may not merge
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ff', false);
do $$ begin
  begin
    perform public.merge_products((select id from public.products where name = 'Strawberries' and product_type = 'fresh'),
                                  array[(select id from public.products where name = 'Strawberry (from CRM x1)')]);
    raise exception 'should not be allowed';
  exception when insufficient_privilege then raise notice 'PASS only managers can merge';
  end;
end $$;
-- super admin merges
select set_config('request.jwt.claim.sub', :'A', false);
select public.merge_products((select id from public.products where name = 'Strawberries' and product_type = 'fresh'),
                             array[(select id from public.products where name = 'Strawberry (from CRM x1)')]) as merged \gset
reset role;
do $$ declare k uuid := (select id from public.products where name = 'Strawberries' and product_type = 'fresh' and archived_at is null); begin
  assert (select archived_at is not null and notes like '%Merged into Strawberries%' from public.products where name = 'Strawberry (from CRM x1)'), 'duplicate archived, not deleted';
  assert (select count(*) from public.product_packaging where product_id = k and label = 'Punnet 250 g x 8') = 1, 'packaging moved';
  assert (select count(*) from public.product_prices where product_id = k and unit_price = 90) = 1, 'price history moved';
  assert (select count(*) from public.product_packaging where product_id = k and is_default and archived_at is null) = 1, 'one default';
  assert (select 'Fortuna' = any(varieties) from public.products where id = k), 'varieties merged';
  raise notice 'PASS merge keeps everything on the kept product';
end $$;
do $$ begin
  assert (select column_default from information_schema.columns where table_name = 'proforma_invoices' and column_name = 'brand') like '%ms_elbrancy%';
  raise notice 'PASS proforma letterhead column';
end $$;
