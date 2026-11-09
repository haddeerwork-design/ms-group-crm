-- LOCAL TESTING ONLY.
\set ON_ERROR_STOP on
\set A '00000000-0000-0000-0000-00000000000a'
\set S '00000000-0000-0000-0000-00000000000b'

-- 1. new login gets a profile without a role
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000e1', 'new.hire@msgroup-egy.com', '{"full_name":"New Hire"}');
do $$ begin
  assert (select full_name from public.profiles where email = 'new.hire@msgroup-egy.com') = 'New Hire', 'profile not created';
  assert not exists (select 1 from public.user_roles where user_id = '00000000-0000-0000-0000-0000000000e1'), 'got a role';
  raise notice 'PASS new login gets a profile, no role';
end $$;
-- the quality user from the stub had no profile: backfilled by the migration
do $$ begin assert exists (select 1 from public.profiles where email = 'quality@msgroup-egy.com'); raise notice 'PASS missing profiles backfilled'; end $$;

-- 2. archive
insert into public.crm_records (record_type, record_key, data, owner_legacy_id) values
 ('documents', 'd1', '{"type":"QUOTE","number":"Q-0001","customerName":"Gulf Fresh","total":1000}', 'u2'),
 ('documents', 'd2', '{"type":"INVOICE","number":"INV-0001","customerName":"Other","total":5}', 'u1'),
 ('users', 'u9', '{"name":"x","password":"secret"}', null);
set role authenticated;
select set_config('request.jwt.claim.sub', :'S', false);
do $$ begin
  begin perform public.refresh_legacy_archive(); raise exception 'FAIL sales refreshed';
  exception when insufficient_privilege then raise notice 'PASS only super admin refreshes'; end;
  begin insert into public.legacy_archive (record_type, record_key, data) values ('x','y','{}'); raise exception 'FAIL insert';
  exception when insufficient_privilege then raise notice 'PASS archive is read-only'; end;
end $$;
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false);
select * from public.refresh_legacy_archive();
do $$ begin
  assert (select count(*) from public.legacy_archive where record_type = 'documents') = 2;
  assert not exists (select 1 from public.legacy_archive where record_type = 'users'), 'users copied';
  raise notice 'PASS archive copies documents, never users';
end $$;
update public.legacy_archive set data = '{}' where record_key = 'd1';
delete from public.legacy_archive;
do $$ begin assert (select data->>'number' from public.legacy_archive where record_key = 'd1') = 'Q-0001'; raise notice 'PASS archive cannot be edited or deleted'; end $$;
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :'S', false);
do $$ begin
  assert (select array_agg(record_key) from public.legacy_archive where record_type = 'documents') = array['d1'], 'sales sees other docs';
  raise notice 'PASS sales sees only own old documents';
  begin perform * from public.app_security_report(); raise exception 'FAIL report';
  exception when insufficient_privilege then raise notice 'PASS security report is super admin only'; end;
end $$;

-- 3. security report: nothing high/medium in our own objects
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false);
do $$ declare r record; n int := 0; begin
  for r in select * from public.app_security_report() where severity <> 'legacy' loop
    raise notice 'FINDING % % %', r.severity, r.kind, r.object; n := n + 1;
  end loop;
  assert n = 0, 'security findings';
  raise notice 'PASS security report clean (legacy items only)';
end $$;
reset role;
set role anon;
do $$ begin
  begin perform public.app_is_member(); raise exception 'FAIL anon call';
  exception when insufficient_privilege then raise notice 'PASS anonymous users cannot call privileged functions'; end;
end $$;
reset role;
