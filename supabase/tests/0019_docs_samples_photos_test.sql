-- LOCAL TESTING ONLY.
\set ON_ERROR_STOP on
\set A '00000000-0000-0000-0000-00000000000a'
do $$ begin
  assert exists (select 1 from storage.buckets where id = 'product-images' and public), 'public photo bucket';
  assert exists (select 1 from information_schema.columns where table_name = 'products' and column_name = 'image_path'), 'image column';
  raise notice 'PASS product photos';
end $$;
-- samples follow the company: the owner can add, others cannot see
insert into public.companies (id, name, owner_id, created_by) values ('11111111-2222-3333-4444-555555555555', 'Sample Test Co', :'A', :'A') on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false);
insert into public.samples (company_id, product_name, courier, tracking_no) values ('11111111-2222-3333-4444-555555555555', 'Keitt Mango', 'DHL', '123');
do $$ begin
  assert (select count(*) from public.samples where company_id = '11111111-2222-3333-4444-555555555555') = 1, 'owner sees the sample';
  raise notice 'PASS samples insert by owner';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ff', false);
do $$ begin
  assert (select count(*) from public.samples) = 0, 'viewer without access sees nothing';
  begin
    insert into public.samples (company_id, product_name) values ('11111111-2222-3333-4444-555555555555', 'x');
    raise exception 'should be blocked';
  exception when insufficient_privilege then raise notice 'PASS samples blocked for others';
  end;
end $$;
reset role;
do $$ begin
  assert exists (select 1 from information_schema.tables where table_name = 'order_doc_waivers'), 'waivers table';
  raise notice 'PASS document waivers';
end $$;
