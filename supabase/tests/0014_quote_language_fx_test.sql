-- LOCAL TESTING ONLY.
\set ON_ERROR_STOP on
\set A '00000000-0000-0000-0000-00000000000a'
do $$ begin
  assert array_length((select quotation_policy_ar from public.company_settings where id = 1), 1) = 4;
  assert (select quotation_production_time_ar from public.company_settings where id = 1) = 'من 7 إلى 10 أيام';
  raise notice 'PASS Arabic defaults';
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false);
do $$ declare q uuid; begin
  insert into public.quotations (language, currency) values ('ar', 'USD') returning id into q;
  insert into public.quotation_items (quotation_id, description, price_per_ton, input_currency, input_price, fx_rate, fx_source)
    values (q, 'برتقال', 183.67, 'EGP', 9000, 0.020408, 'Pricing');
  begin update public.quotations set language = 'fr' where id = q; raise exception 'FAIL language';
  exception when check_violation then null; end;
  begin insert into public.quotation_items (quotation_id, description, price_per_ton, input_currency) values (q, 'x', 1, 'usd'); raise exception 'FAIL ccy';
  exception when check_violation then null; end;
  update public.products set name_ar = 'مانجو' where name = 'Mango' and product_type = 'fresh';
  assert (select name_ar from public.products where name = 'Mango' and product_type = 'fresh') = 'مانجو', 'name_ar edit';
  raise notice 'PASS Arabic quotation with converted price';
end $$;
reset role;
