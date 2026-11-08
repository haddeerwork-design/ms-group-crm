-- LOCAL TESTING ONLY. Each block prints PASS or raises an error.
\set ON_ERROR_STOP on
\set A '00000000-0000-0000-0000-00000000000a'
\set S '00000000-0000-0000-0000-00000000000b'
\set Q '00000000-0000-0000-0000-00000000000c'

-- existing data untouched
do $$ begin assert (select count(*) from public.crm_records) = 1; raise notice 'PASS crm_records untouched'; end $$;

-- mapping
do $$ begin
  assert (select role from public.user_roles where user_id='00000000-0000-0000-0000-00000000000a') = 'super_admin';
  assert (select role from public.user_roles where user_id='00000000-0000-0000-0000-00000000000b') = 'sales_officer';
  raise notice 'PASS legacy roles mapped';
end $$;

-- new profile created by the old app gets a role automatically
insert into public.profiles (id, full_name, email, role, legacy_id)
values (:'Q','Quality','quality@msgroup-egy.com','QUALITY','u3');
do $$ begin
  assert (select role from public.user_roles where user_id='00000000-0000-0000-0000-00000000000c') = 'quality_officer';
  raise notice 'PASS new profile synced';
end $$;

-- role change in old app replaces the legacy role
update public.profiles set role='SALES' where id=:'Q';
do $$ begin
  assert (select array_agg(role) from public.user_roles where user_id='00000000-0000-0000-0000-00000000000c') = array['sales_officer']::public.app_role[];
  raise notice 'PASS legacy role change synced';
end $$;

-- ===== as SALES =====
set role authenticated;
select set_config('request.jwt.claim.sub', :'S', false);
do $$ begin
  assert (select count(*) from public.user_roles) = 1, 'sales should see only own role';
  assert (select company_name from public.company_settings) = 'MS El-brancy Group';
  raise notice 'PASS sales reads own role + settings';
end $$;
do $$ begin
  begin
    insert into public.user_roles (user_id, role) values (auth.uid(), 'super_admin');
    raise exception 'FAIL sales granted itself super_admin';
  exception when insufficient_privilege then raise notice 'PASS sales cannot self-promote';
  end;
end $$;
update public.company_settings set company_name='HACKED';
do $$ begin
  assert (select company_name from public.company_settings) = 'MS El-brancy Group', 'sales changed settings';
  assert (select count(*) from public.audit_logs) = 0, 'sales can read audit';
  raise notice 'PASS sales cannot edit settings or read audit';
end $$;
do $$ begin
  begin
    insert into public.audit_logs (table_name, action) values ('x','INSERT');
    raise exception 'FAIL sales wrote audit';
  exception when insufficient_privilege then raise notice 'PASS sales cannot write audit';
  end;
end $$;

-- ===== anon =====
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  assert (select count(*) from public.company_settings) = 0, 'anon sees settings';
  assert (select count(*) from public.user_roles) = 0, 'anon sees roles';
  raise notice 'PASS anon sees nothing';
end $$;

-- ===== as SUPER ADMIN =====
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false);
update public.company_settings set phone='+20 000';
do $$ begin
  assert (select phone from public.company_settings) = '+20 000';
  assert (select updated_by from public.company_settings) = '00000000-0000-0000-0000-00000000000a';
  assert (select count(*) from public.audit_logs where table_name='company_settings') = 1;
  assert (select count(*) from public.user_roles) = 3;
  raise notice 'PASS admin edits settings, audited';
end $$;
insert into public.user_roles (user_id, role) values (:'S', 'sales_manager');
delete from public.user_roles where user_id=:'S' and role='sales_manager';
do $$ begin
  begin
    delete from public.user_roles where role='super_admin';
    raise exception 'FAIL last super admin removed';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS last super admin protected';
  end;
end $$;
do $$ begin
  begin
    update public.audit_logs set action='DELETE';
    delete from public.audit_logs;
    assert (select count(*) from public.audit_logs) >= 3, 'admin deleted audit';
    raise notice 'PASS audit is append-only';
  end;
end $$;
reset role;
