-- LOCAL TESTING ONLY.
\set ON_ERROR_STOP on
\set A '00000000-0000-0000-0000-00000000000a'
\set S '00000000-0000-0000-0000-00000000000b'
\set Q '00000000-0000-0000-0000-00000000000c'

do $$ begin
  assert (select count(*) from public.suppliers) = 1, 'supplier imported, empty skipped';
  assert (select contact_name from public.suppliers) = 'Karim';
  assert (select count(*) from public.freight_forwarders) = 1;
  assert (select count(*) from public.shipping_rates) = 1, 'only priced rate imported';
  assert (select rate_per_container from public.shipping_rates) = 2350;
  assert (select valid_until from public.shipping_rates) = '2026-12-31';
  raise notice 'PASS legacy suppliers, forwarders, priced rates imported; samples skipped';
end $$;

insert into public.user_roles (user_id, role) values (:'Q', 'logistics_officer') on conflict do nothing;

-- ===== SALES: reads directory and rates, not supplier prices =====
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false);
insert into public.supplier_prices (supplier_id, product_text, price, unit, currency)
select id, 'Mango Keitt', 18, 'kg', 'EGP' from public.suppliers;
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :'S', false);
do $$ begin
  assert (select count(*) from public.suppliers) = 1;
  assert (select count(*) from public.shipping_rates) = 1;
  assert (select count(*) from public.supplier_prices) = 0, 'sales sees supplier costs';
  begin
    insert into public.shipping_rates (mode, destination_country, rate_per_container, currency) values ('sea', 'X', 1, 'USD');
    raise exception 'FAIL sales added rate';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.suppliers (name) values ('x');
    raise exception 'FAIL sales added supplier';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS sales reads suppliers & rates, no costs, no edits';
end $$;

-- ===== LOGISTICS adds rates =====
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :'Q', false);
insert into public.shipping_rates (mode, destination_country, destination_port, rate_per_kg, min_charge, currency, source)
values ('air', 'UK', 'LHR', 1.85, 150, 'USD', 'Test quote');
do $$ begin
  begin
    insert into public.shipping_rates (mode, destination_country, rate_per_container, currency) values ('air', 'X', 100, 'USD');
    raise exception 'FAIL air without per-kg';
  exception when check_violation then null; end;
  assert (select count(*) from public.supplier_prices) = 0, 'logistics sees supplier costs';
  raise notice 'PASS logistics adds rates; air needs rate per kg';
end $$;

-- ===== PROFORMA: S creates from scratch, issue, lock, revise =====
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :'S', false);
insert into public.proforma_invoices (number, status, customer_company, incoterm) values ('X', 'issued', 'Saudi Foods Co.', 'CIF');
insert into public.proforma_items (proforma_id, description, quantity, unit, unit_price, line_total)
select id, 'Okra IQF', 20, 'tons', 900, 18000 from public.proforma_invoices;
do $$ begin
  assert (select number from public.proforma_invoices) = 'PI-' || extract(year from current_date) || '-0001';
  assert (select status from public.proforma_invoices) = 'draft';
  raise notice 'PASS PI numbering forced, starts as draft';
end $$;
select status from public.set_proforma_status((select id from public.proforma_invoices), 'issued');
do $$ begin
  begin
    update public.proforma_invoices set customer_company = 'changed';
    raise exception 'FAIL edited issued PI';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'PASS issued proforma locked'; end;
  begin
    insert into public.proforma_items (proforma_id, description, quantity, unit, unit_price, line_total)
    select id, 'x', 1, 'tons', 1, 1 from public.proforma_invoices;
    raise exception 'FAIL';
  exception when insufficient_privilege then raise notice 'PASS cannot add items to issued proforma'; end;
end $$;
select status, version from public.set_proforma_status((select id from public.proforma_invoices), 'revised');
update public.proforma_items set unit_price = 950, line_total = 19000;
select status from public.set_proforma_status((select id from public.proforma_invoices), 'issued');
delete from public.proforma_invoices;
do $$ begin
  assert (select count(*) from public.proforma_versions) = 2;
  assert (select (snapshot->'items'->0->>'unit_price')::numeric from public.proforma_versions where version = 1) = 900;
  assert (select count(*) from public.proforma_invoices) = 1, 'issued PI deleted';
  raise notice 'PASS revision keeps v1, issued cannot be deleted';
end $$;

-- ===== another sales officer =====
reset role;
insert into public.user_roles (user_id, role) values (:'Q', 'sales_officer') on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub', :'Q', false);
do $$ begin
  assert (select count(*) from public.proforma_invoices) = 0;
  assert (select count(*) from public.proforma_versions) = 0;
  raise notice 'PASS other sales officer cannot see the proforma';
end $$;
reset role;
