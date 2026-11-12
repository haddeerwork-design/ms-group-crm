-- LOCAL TESTING ONLY.
\set ON_ERROR_STOP on
do $$
declare q uuid; pid uuid := (select id from public.products where archived_at is null limit 1);
begin
  select id into q from public.quotations limit 1;
  if q is null then
    insert into public.quotations (currency, created_by) values ('USD', '00000000-0000-0000-0000-00000000000a') returning id into q;
  end if;
  insert into public.quotation_items (quotation_id, description, price_per_ton, price_basis, unit_price, unit_label, sort_order)
    values (q, 'per kg', 1250, 'kg', 1.25, 'kg', 90);
  insert into public.quotation_items (quotation_id, description, price_per_ton, price_basis, unit_price, unit_label, net_weight_kg, cartons_per_pallet, sort_order)
    values (q, 'per pallet', 1250, 'pallet', 1250, 'pallet', 10, 100, 91);
  begin
    insert into public.quotation_items (quotation_id, description, price_per_ton, price_basis, unit_price, unit_label, net_weight_kg, sort_order)
      values (q, 'pallet without cartons per pallet', 1250, 'pallet', 1250, 'pallet', 10, 92);
    raise exception 'should be refused';
  exception when check_violation then null;
  end;
  insert into public.product_prices (product_id, sell_currency, price_per_ton, price_basis, unit_price, unit_label, source, created_by)
    values (pid, 'USD', 1250, 'kg', 1.25, 'kg', 'app', '00000000-0000-0000-0000-00000000000a');
  raise notice 'PASS prices per kg and per pallet';
end $$;
