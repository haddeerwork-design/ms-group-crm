-- LOCAL TESTING ONLY.
\set ON_ERROR_STOP on
\set A '00000000-0000-0000-0000-00000000000a'
do $$ begin
  assert (select count(*) from public.product_prices where price_basis = 'unit' and sell_currency = 'EGP') = 4, 'jam prices';
  assert (select unit_price from public.product_prices r join public.products p on p.id = r.product_id where p.name = 'Lychee Jam') = 245;
  assert (select price_per_ton from public.product_prices r join public.products p on p.id = r.product_id where p.name = 'Passion Fruit Jam') = 1156250;
  assert (select count(*) from public.product_packaging k join public.products p on p.id = k.product_id where p.product_type = 'jam' and k.label = 'Jar 160 g' and k.is_default) = 4;
  raise notice 'PASS jam jar packaging and per-jar prices';
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false);
do $$ declare q uuid; begin
  assert (select unit_price from public.product_price_list l join public.products p on p.id = l.product_id where p.name = 'Lychee Jam') = 245, 'view';
  insert into public.quotations (brand, currency) values ('prime_roots', 'EGP') returning id into q;
  insert into public.quotation_items (quotation_id, description, quantity, quantity_unit, net_weight_kg, price_per_ton, price_basis, unit_price, unit_label, line_total)
    values (q, 'Lychee Jam', 500, 'units', 0.16, 1531250, 'unit', 245, 'jar', 122500);
  begin
    insert into public.quotation_items (quotation_id, description, price_per_ton, price_basis) values (q, 'x', 1, 'unit');
    raise exception 'FAIL unit line without unit price';
  exception when check_violation then null; end;
  begin
    update public.quotations set brand = 'other' where id = q;
    raise exception 'FAIL bad brand';
  exception when check_violation then null; end;
  raise notice 'PASS prime roots quotation with per-jar line';
end $$;
reset role;
