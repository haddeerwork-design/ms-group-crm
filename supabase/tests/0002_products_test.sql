-- LOCAL TESTING ONLY. Run after 00_local_supabase_stub.sql, 0001, 0002_products_legacy_fixture.sql, 0002.
\set ON_ERROR_STOP on
\set A '00000000-0000-0000-0000-00000000000a'
\set S '00000000-0000-0000-0000-00000000000b'

do $$ begin
  assert (select count(*) from public.product_categories) = 6;
  -- 47 seeded + "Keitt Mango" and a duplicate "Lemon" imported as new products
  assert (select count(*) from public.products) = 50 /* 47 seed + 2 legacy + fresh Strawberries from 0012 */, (select count(*)::text from public.products);
  raise notice 'PASS seed counts';
end $$;

do $$ begin
  -- legacy "Frozen Mangoes" merged into seeded IQF Mango, with its packaging
  assert (select legacy_key from public.products where name='Mango' and product_type='frozen') = 'p20';
  assert (select net_weight_kg from public.product_packaging pp join public.products p on p.id=pp.product_id
           where p.name='Mango' and p.product_type='frozen') = 10;
  assert (select cartons_per_pallet from public.product_packaging pp join public.products p on p.id=pp.product_id
           where p.name='Mango' and p.product_type='frozen') = 100;
  -- legacy "Strawberries" (Fresh Fruits) has no seeded fresh match -> new product
  assert exists (select 1 from public.products where name='Keitt Mango' and product_type='fresh' and legacy_key='p13');
  -- legacy price kept untouched for the pricing step
  assert (select legacy_data->>'price' from public.products where legacy_key='p20') = '1200';
  -- bad gross weight (below net) not copied
  assert (select gross_weight_kg from public.product_packaging pp join public.products p on p.id=pp.product_id where p.legacy_key='p20') is null;
  -- empty legacy item: linked, no packaging created
  assert (select count(*) from public.product_packaging pp join public.products p on p.id=pp.product_id where p.legacy_key='p12' and pp.label <> 'Carton or crate 15 kg' /* added by 0012 */) = 0;
  assert exists (select 1 from public.products where legacy_key='p99' and name like 'Lemons (from CRM%' or legacy_key='p99' and name like 'Lemon%');
  -- current CRM data untouched
  assert (select count(*) from public.crm_records where record_type='products') = 5;
  raise notice 'PASS legacy import';
end $$;

-- ===== SALES: read only =====
set role authenticated;
select set_config('request.jwt.claim.sub', :'S', false);
do $$ begin
  assert (select count(*) from public.products) = 50 /* 47 seed + 2 legacy + fresh Strawberries from 0012 */, 'sales should read products';
  raise notice 'PASS sales reads catalog';
end $$;
update public.products set name='HACK' where name='Okra';
do $$ begin
  assert not exists (select 1 from public.products where name='HACK'), 'sales edited product';
  begin
    insert into public.products (category_id, name, product_type)
    select id, 'Sneaky', 'fresh' from public.product_categories limit 1;
    raise exception 'FAIL sales inserted product';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.product_packaging (product_id, label)
    select id, 'x' from public.products limit 1;
    raise exception 'FAIL sales inserted packaging';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS sales cannot write catalog';
end $$;
delete from public.products;
do $$ begin assert (select count(*) from public.products) = 50 /* 47 seed + 2 legacy + fresh Strawberries from 0012 */; raise notice 'PASS nobody hard-deletes'; end $$;

-- ===== user with no role sees nothing =====
reset role;
delete from public.user_roles where user_id = '00000000-0000-0000-0000-00000000000c';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$ begin assert (select count(*) from public.products) = 0; raise notice 'PASS no-role user sees nothing'; end $$;

-- ===== SUPER ADMIN =====
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false);
insert into public.product_packaging (product_id, label, net_weight_kg, gross_weight_kg, cartons_per_pallet, is_default)
select id, '4 kg carton', 4, 4.5, 240, true from public.products where name='Okra';
update public.products set season_start_month=11, season_end_month=3, availability='available' where name='Okra';
update public.products set archived_at=now() where name='Garlic';
do $$ begin
  assert (select updated_by from public.products where name='Okra') = '00000000-0000-0000-0000-00000000000a';
  assert (select count(*) from public.audit_logs where table_name in ('products','product_packaging')) >= 3;
  raise notice 'PASS admin edits, archives, audited';
end $$;
do $$ begin
  begin
    insert into public.product_packaging (product_id, label, is_default)
    select id, 'second default', true from public.products where name='Okra';
    raise exception 'FAIL two defaults';
  exception when unique_violation then raise notice 'PASS one default packaging per product'; end;
  begin
    insert into public.product_packaging (product_id, label, net_weight_kg, gross_weight_kg)
    select id, 'bad', 10, 9 from public.products where name='Okra';
    raise exception 'FAIL gross < net accepted';
  exception when check_violation then raise notice 'PASS gross >= net enforced'; end;
  begin
    update public.products set season_start_month=13 where name='Okra';
    raise exception 'FAIL month 13';
  exception when check_violation then raise notice 'PASS season month checked'; end;
end $$;
reset role;
