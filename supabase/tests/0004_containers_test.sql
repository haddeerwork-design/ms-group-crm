-- LOCAL TESTING ONLY.
\set ON_ERROR_STOP on
\set A '00000000-0000-0000-0000-00000000000a'
\set S '00000000-0000-0000-0000-00000000000b'
\set Q '00000000-0000-0000-0000-00000000000c'

do $$ begin assert (select count(*) from public.container_types) = 0, 'no seeded capacities'; raise notice 'PASS no invented container data'; end $$;

-- Q becomes a second sales officer
insert into public.user_roles (user_id, role) values (:'Q', 'sales_officer') on conflict do nothing;

-- ===== SALES cannot create container types =====
set role authenticated;
select set_config('request.jwt.claim.sub', :'S', false);
do $$ begin
  begin
    insert into public.container_types (name, max_pallets, max_payload_kg) values ('X', 1, 1);
    raise exception 'FAIL sales created container type';
  exception when insufficient_privilege then raise notice 'PASS sales cannot add container types'; end;
end $$;

-- ===== ADMIN adds a type =====
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false);
insert into public.container_types (name, max_pallets, max_payload_kg, empty_pallet_kg) values ('Test 40 reefer', 20, 26000, 20);

-- ===== SALES S creates a plan with an item =====
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :'S', false);
insert into public.container_plans (name, container_type_id) select 'S plan', id from public.container_types;
insert into public.container_plan_items (plan_id, product_id, qty_unit, quantity)
select p.id, x.id, 'pallets', 10 from public.container_plans p, public.products x where x.name='Okra';
do $$ begin
  assert (select count(*) from public.container_plans) = 1;
  assert (select count(*) from public.container_plan_items) = 1;
  raise notice 'PASS sales creates own plan';
end $$;
do $$ begin
  begin
    insert into public.container_plans (name, created_by) values ('spoof', '00000000-0000-0000-0000-00000000000c');
    raise exception 'FAIL spoofed plan owner';
  exception when insufficient_privilege then raise notice 'PASS cannot create plan for someone else'; end;
end $$;
update public.container_plans set created_by = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  assert (select created_by from public.container_plans) = '00000000-0000-0000-0000-00000000000b', 'owner changed';
  raise notice 'PASS owner cannot be changed';
end $$;

-- ===== SALES Q cannot see or touch S's plan =====
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :'Q', false);
update public.container_plans set name = 'hacked';
delete from public.container_plans;
do $$ begin
  assert (select count(*) from public.container_plans) = 0, 'Q sees S plan';
  assert (select count(*) from public.container_plan_items) = 0, 'Q sees S items';
  begin
    insert into public.container_plan_items (plan_id, product_id, qty_unit, quantity)
    select id, (select id from public.products limit 1), 'tons', 1 from public.container_plans;
    -- select returns no rows for Q, so try with the id directly:
    perform 1;
  end;
  raise notice 'PASS other sales cannot read or change the plan';
end $$;
reset role;
do $$ begin
  assert (select name from public.container_plans) = 'S plan', 'plan was changed by Q';
  assert (select count(*) from public.container_plans) = 1, 'plan was deleted by Q';
end $$;
-- direct insert into S's plan by Q
do $$ declare pid uuid := (select id from public.container_plans); begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
  execute 'set role authenticated';
  begin
    insert into public.container_plan_items (plan_id, product_id, qty_unit, quantity)
    values (pid, (select id from public.products limit 1), 'tons', 1);
    raise exception 'FAIL Q added item to S plan';
  exception when insufficient_privilege then raise notice 'PASS cannot add items to someone else''s plan'; end;
  execute 'reset role';
end $$;

-- ===== ADMIN sees and edits all =====
set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false);
update public.container_plans set notes = 'checked by admin';
do $$ begin
  assert (select count(*) from public.container_plans) = 1;
  assert (select notes from public.container_plans) = 'checked by admin';
  assert (select created_by from public.container_plans) = '00000000-0000-0000-0000-00000000000b';
  raise notice 'PASS admin sees and edits all plans';
end $$;
do $$ begin
  begin
    insert into public.container_types (name, max_pallets, max_payload_kg) values ('Bad', 0, 1);
    raise exception 'FAIL zero pallets';
  exception when check_violation then raise notice 'PASS container limits validated'; end;
end $$;
reset role;
