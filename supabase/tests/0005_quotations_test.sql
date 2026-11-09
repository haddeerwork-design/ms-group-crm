-- LOCAL TESTING ONLY.
\set ON_ERROR_STOP on
\set A '00000000-0000-0000-0000-00000000000a'
\set S '00000000-0000-0000-0000-00000000000b'
\set Q '00000000-0000-0000-0000-00000000000c'

do $$ begin
  assert (select quotation_validity_days from public.company_settings) = 3;
  assert (select array_length(quotation_policy,1) from public.company_settings) = 4;
  raise notice 'PASS quotation defaults from PDF';
end $$;
insert into public.user_roles (user_id, role) values (:'Q', 'sales_officer') on conflict do nothing;

-- ===== SALES S creates two quotations: numbers are sequential and forced =====
set role authenticated;
select set_config('request.jwt.claim.sub', :'S', false);
insert into public.quotations (number, status, customer_name, incoterm) values ('HACK-1', 'accepted', 'Buyer 1', 'CIF');
insert into public.quotations (customer_name, incoterm) values ('Buyer 2', 'FOB');
do $$ begin
  assert (select array_agg(number order by number) from public.quotations)
         = array['QTN-' || extract(year from current_date) || '-0001', 'QTN-' || extract(year from current_date) || '-0002'], 'numbering';
  assert (select status from public.quotations where customer_name='Buyer 1') = 'draft', 'status forced to draft';
  raise notice 'PASS numbers sequential, cannot be chosen, new = draft';
end $$;
insert into public.quotation_items (quotation_id, description, price_per_ton, quantity, quantity_unit, line_total)
select id, 'Okra IQF', 900, 10, 'tons', 9000 from public.quotations where customer_name='Buyer 1';
update public.quotations set status='accepted', number='X' where customer_name='Buyer 1';
do $$ begin
  assert (select status from public.quotations where customer_name='Buyer 1') = 'draft', 'status changed directly';
  assert (select number from public.quotations where customer_name='Buyer 1') like 'QTN-%', 'number changed';
  raise notice 'PASS status and number cannot be edited directly';
end $$;

-- send → locked
select status, version from public.set_quotation_status((select id from public.quotations where customer_name='Buyer 1'), 'sent');
do $$ begin
  begin
    update public.quotations set customer_name='Changed' where customer_name='Buyer 1';
    raise exception 'FAIL edited a sent quotation';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS sent quotation is locked';
  end;
  begin
    insert into public.quotation_items (quotation_id, description, price_per_ton)
    select id, 'extra', 1 from public.quotations where customer_name='Buyer 1';
    raise exception 'FAIL added item to sent quotation';
  exception when insufficient_privilege then raise notice 'PASS cannot add items to a sent quotation'; end;
  assert (select count(*) from public.quotation_versions) = 1;
  assert (select snapshot->'items'->0->>'description' from public.quotation_versions) = 'Okra IQF';
end $$;
update public.quotation_items set price_per_ton = 1;
do $$ begin assert (select price_per_ton from public.quotation_items) = 900, 'sent item changed'; raise notice 'PASS sent items unchanged'; end $$;

-- invalid transitions
do $$ begin
  begin
    perform public.set_quotation_status((select id from public.quotations where customer_name='Buyer 2'), 'accepted');
    raise exception 'FAIL draft -> accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'PASS invalid transition blocked'; end;
  begin
    perform public.set_quotation_status((select id from public.quotations where customer_name='Buyer 2'), 'sent');
    raise exception 'FAIL sent without items';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'PASS cannot send without products'; end;
end $$;

-- revise → version 2 editable, version 1 kept
select status, version from public.set_quotation_status((select id from public.quotations where customer_name='Buyer 1'), 'revised');
update public.quotation_items set price_per_ton = 950, line_total = 9500;
select status, version from public.set_quotation_status((select id from public.quotations where customer_name='Buyer 1'), 'sent');
do $$ begin
  assert (select version from public.quotations where customer_name='Buyer 1') = 2;
  assert (select count(*) from public.quotation_versions) = 2;
  assert (select (snapshot->'items'->0->>'price_per_ton')::numeric from public.quotation_versions where version=1) = 900, 'v1 overwritten';
  assert (select (snapshot->'items'->0->>'price_per_ton')::numeric from public.quotation_versions where version=2) = 950;
  raise notice 'PASS revision keeps the old version';
end $$;
-- only draft v1 can be deleted
delete from public.quotations where customer_name='Buyer 1';
do $$ begin assert (select count(*) from public.quotations where customer_name='Buyer 1') = 1, 'sent quotation deleted'; raise notice 'PASS sent quotation cannot be deleted'; end $$;

-- ===== another sales officer =====
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :'Q', false);
do $$ begin
  assert (select count(*) from public.quotations) = 0, 'Q sees S quotes';
  assert (select count(*) from public.quotation_versions) = 0, 'Q sees S versions';
  begin
    perform public.set_quotation_status('00000000-0000-0000-0000-000000000000', 'sent');
  exception when raise_exception then null; end;
  raise notice 'PASS other sales officer sees nothing';
end $$;
reset role;
do $$ declare qid uuid := (select id from public.quotations where customer_name='Buyer 1'); begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
  execute 'set role authenticated';
  begin
    perform public.set_quotation_status(qid, 'accepted');
    raise exception 'FAIL Q changed S quote status';
  exception when insufficient_privilege then raise notice 'PASS cannot change someone else''s status'; end;
  execute 'reset role';
end $$;

-- ===== finance reads, cannot write =====
insert into public.user_roles (user_id, role) values (:'Q', 'finance_officer') on conflict do nothing;
delete from public.user_roles where user_id = :'Q' and role = 'sales_officer';
set role authenticated;
select set_config('request.jwt.claim.sub', :'Q', false);
do $$ begin
  assert (select count(*) from public.quotations) = 2, 'finance should read all';
  begin
    insert into public.quotations (customer_name) values ('x');
    raise exception 'FAIL finance created quote';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS finance reads all, cannot create';
end $$;

-- ===== admin: sees all, accepts =====
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false);
select status from public.set_quotation_status((select id from public.quotations where customer_name='Buyer 1'), 'accepted');
do $$ begin
  assert (select status from public.quotations where customer_name='Buyer 1') = 'accepted';
  assert (select created_by from public.quotations where customer_name='Buyer 1') = '00000000-0000-0000-0000-00000000000b';
  raise notice 'PASS manager accepts, owner kept';
end $$;
reset role;
