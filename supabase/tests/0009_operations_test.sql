-- LOCAL TESTING ONLY.
\set ON_ERROR_STOP on
\set A '00000000-0000-0000-0000-00000000000a'
\set S '00000000-0000-0000-0000-00000000000b'
\set Q '00000000-0000-0000-0000-00000000000c'

do $$ begin assert (select public from storage.buckets where id='order-documents') = false; raise notice 'PASS private documents bucket'; end $$;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000d','logistics@msgroup-egy.com');
insert into public.profiles (id, full_name, email, legacy_id) values ('00000000-0000-0000-0000-00000000000d','Logi','logistics@msgroup-egy.com','u4')
  on conflict (id) do update set full_name = excluded.full_name, legacy_id = excluded.legacy_id;
insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-00000000000d','logistics_officer');
insert into public.user_roles (user_id, role) values (:'Q', 'finance_officer') on conflict do nothing;

-- ===== SALES S creates an order =====
set role authenticated;
select set_config('request.jwt.claim.sub', :'S', false);
insert into public.sales_orders (number, customer_company, currency) values ('HACK', 'Saudi Foods Co.', 'USD');
insert into public.order_items (order_id, description, quantity, unit, unit_price, line_total)
select id, 'IQF Okra', 20, 'tons', 950, 19000 from public.sales_orders;
do $$ begin
  assert (select number from public.sales_orders) = 'SO-' || extract(year from current_date) || '-0001';
  assert (select count(*) from public.order_stage_history) = 1;
  raise notice 'PASS order number forced, history started';
end $$;
-- upload a document into own order folder
insert into storage.objects (bucket_id, name) select 'order-documents', id || '/phyto.pdf' from public.sales_orders;
insert into public.order_documents (order_id, doc_type, file_path, file_name) select id, 'phytosanitary', id || '/phyto.pdf', 'phyto.pdf' from public.sales_orders;
do $$ begin
  begin
    insert into storage.objects (bucket_id, name) values ('order-documents', gen_random_uuid() || '/x.pdf');
    raise exception 'FAIL uploaded into a random folder';
  exception when insufficient_privilege then raise notice 'PASS cannot upload outside own orders'; end;
  begin
    insert into public.payments (direction, kind, amount_due, currency) values ('in', 'advance', 100, 'USD');
    raise exception 'FAIL sales recorded payment';
  exception when insufficient_privilege then raise notice 'PASS sales cannot record payments'; end;
end $$;

-- ===== LOGISTICS: reads, updates shipment only =====
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
update public.sales_orders set stage = 'booked', bl_awb_number = 'MSCU123', eta = current_date + 10;
do $$ begin
  assert (select stage from public.sales_orders) = 'booked';
  assert (select count(*) from storage.objects) = 1, 'logistics reads docs';
  begin
    update public.sales_orders set currency = 'EUR';
    raise exception 'FAIL logistics changed currency';
  exception when insufficient_privilege then raise notice 'PASS logistics limited to shipment fields'; end;
  begin
    update public.order_items set unit_price = 1;
    if (select unit_price from public.order_items) = 1 then raise exception 'FAIL logistics changed price'; end if;
  end;
  raise notice 'PASS logistics updates stage and B/L';
end $$;
insert into storage.objects (bucket_id, name) select 'order-documents', id || '/bl.pdf' from public.sales_orders;
reset role;
do $$ begin
  assert (select count(*) from public.notifications where user_id='00000000-0000-0000-0000-00000000000b' and kind='order_stage') = 1, 'owner notified of stage';
  assert (select count(*) from public.order_stage_history) = 2;
  raise notice 'PASS owner notified, history recorded';
end $$;

-- ===== FINANCE records payments =====
set role authenticated;
select set_config('request.jwt.claim.sub', :'Q', false);
insert into public.payments (direction, kind, order_id, amount_due, currency, due_date)
select 'in', 'advance', id, 9500, 'USD', current_date from public.sales_orders;
do $$ begin
  begin
    update public.payments set amount_paid = 9500;
    raise exception 'FAIL paid without reference';
  exception when check_violation then raise notice 'PASS payment needs date, method and reference'; end;
end $$;
update public.payments set amount_paid = 9500, paid_date = current_date, method = 'bank_transfer', reference = 'SWIFT-TEST-1';
do $$ begin
  assert (select confirmed_by from public.payments) = '00000000-0000-0000-0000-00000000000c';
  assert (select count(*) from public.sales_orders) = 1, 'finance reads orders';
  raise notice 'PASS finance confirms payment, confirmed_by recorded';
end $$;

-- ===== owner sees payment status, other sales sees nothing =====
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :'S', false);
do $$ begin
  assert (select amount_paid from public.payments) = 9500, 'owner sees payment';
  begin
    update public.payments set amount_paid = 0;
  end;
  assert (select amount_paid from public.payments) = 9500, 'owner changed payment';
  raise notice 'PASS owner sees but cannot change payments';
end $$;
reset role;
delete from public.user_roles where user_id = :'Q' and role = 'finance_officer';
insert into public.user_roles (user_id, role) values (:'Q', 'sales_officer') on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub', :'Q', false);
do $$ begin
  assert (select count(*) from public.sales_orders) = 0;
  assert (select count(*) from public.order_documents) = 0;
  assert (select count(*) from storage.objects) = 0, 'other sales sees files';
  assert (select count(*) from public.payments) = 0;
  raise notice 'PASS other sales sees no orders, files or payments';
end $$;

-- ===== completed orders locked for non-managers =====
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :'S', false);
update public.sales_orders set stage = 'completed';
do $$ begin
  begin
    update public.sales_orders set notes = 'late edit';
    raise exception 'FAIL edited completed order';
  exception when insufficient_privilege then raise notice 'PASS completed order locked'; end;
  begin
    delete from storage.objects;
    if (select count(*) from storage.objects) = 0 then raise exception 'FAIL sales deleted files'; end if;
  end;
end $$;
reset role;
do $$ begin assert (select count(*) from storage.objects) = 2; raise notice 'PASS only managers delete files'; end $$;
