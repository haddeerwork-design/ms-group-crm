-- LOCAL TESTING ONLY.
\set ON_ERROR_STOP on
\set S '00000000-0000-0000-0000-00000000000b'
\set Q '00000000-0000-0000-0000-00000000000c'
insert into public.user_roles (user_id, role) values (:'Q', 'sales_officer') on conflict do nothing;

set role authenticated;
select set_config('request.jwt.claim.sub', :'S', false);
insert into public.quotations (customer_name, incoterm, destination, destinations_layout) values ('Multi', 'CIF', 'Jeddah', 'tables');
insert into public.quotation_items (quotation_id, description, price_per_ton, quantity, quantity_unit)
select id, 'Oranges', 600, 24, 'tons' from public.quotations where customer_name = 'Multi';
insert into public.quotation_destinations (quotation_id, sort_order, destination, incoterm, shipping_mode, freight_basis, freight_rate, freight_currency, freight_containers, freight_total, freight_per_ton)
select id, 1, 'Dubai', 'CIF', 'sea', 'per_container', 2400, 'USD', 1, 2400, 100 from public.quotations where customer_name = 'Multi';
do $$ begin
  assert (select count(*) from public.quotation_destinations) = 1, 'owner adds a destination';
  begin
    insert into public.quotation_destinations (quotation_id, destination, freight_basis)
    select id, 'Doha', 'total' from public.quotations where customer_name = 'Multi';
    raise exception 'FAIL freight basis without a rate';
  exception when check_violation then null;
  end;
  update public.quotation_destinations set country = 'AE';
  begin
    update public.quotation_destinations set country = 'Emirates';
    raise exception 'FAIL country must be a 2-letter code';
  exception when check_violation then null;
  end;
  raise notice 'PASS owner adds destinations; bad freight refused';
end $$;

-- another sales officer cannot see or change them
select set_config('request.jwt.claim.sub', :'Q', false);
do $$ begin
  assert (select count(*) from public.quotation_destinations) = 0, 'other officer sees destinations';
  update public.quotation_destinations set destination = 'Hacked';
  delete from public.quotation_destinations;
  raise notice 'PASS other sales officer cannot read or change';
end $$;

-- sent: the version keeps the destinations, and they are locked
select set_config('request.jwt.claim.sub', :'S', false);
select status from public.set_quotation_status((select id from public.quotations where customer_name = 'Multi'), 'sent');
do $$ begin
  assert (select destination from public.quotation_destinations) = 'Dubai', 'changed by another user';
  assert (select jsonb_array_length(snapshot->'destinations') from public.quotation_versions) = 1, 'snapshot without destinations';
  assert (select snapshot->>'destinations_layout' from public.quotation_versions) = 'tables', 'snapshot without layout';
  begin
    insert into public.quotation_destinations (quotation_id, destination)
    select id, 'Doha' from public.quotations where customer_name = 'Multi';
    raise exception 'FAIL added a destination to a sent quotation';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS sent versions keep destinations; sent quotation locked';
end $$;
reset role;
