-- LOCAL TESTING ONLY.
\set ON_ERROR_STOP on
\set A '00000000-0000-0000-0000-00000000000a'
\set S '00000000-0000-0000-0000-00000000000b'
\set Q '00000000-0000-0000-0000-00000000000c'
insert into public.user_roles (user_id, role) values (:'Q', 'sales_officer') on conflict do nothing;

set role authenticated;
select set_config('request.jwt.claim.sub', :'S', false);
insert into public.research_leads (company_name, country, products_imported) values ('Lagos Fresh Imports', 'Nigeria', 'Citrus');
do $$ begin
  begin
    update public.research_leads set verification_status = 'verified_importer';
    raise exception 'FAIL verified without source';
  exception when check_violation then raise notice 'PASS verified importer needs a source link'; end;
  begin
    update public.research_leads set source_url = 'javascript:alert(1)';
    raise exception 'FAIL bad url accepted';
  exception when check_violation then raise notice 'PASS source must be http(s)'; end;
end $$;
update public.research_leads set source_url = 'https://example.com/importers', verification_status = 'verified_importer';
do $$ begin assert (select verification_status from public.research_leads) = 'verified_importer'; raise notice 'PASS verified with evidence'; end $$;

-- Q reads shared research but cannot edit S's lead
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :'Q', false);
update public.research_leads set notes = 'hijack';
do $$ begin
  assert (select count(*) from public.research_leads) = 1, 'shared research visible';
  assert (select notes from public.research_leads) is null, 'Q edited S lead';
  begin
    insert into public.research_leads (company_name, researcher_id) values ('x', '00000000-0000-0000-0000-00000000000b');
    raise exception 'FAIL spoof researcher';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS shared read, own edits only';
end $$;

-- finance / logistics do not see research
reset role;
delete from public.user_roles where user_id = :'Q';
insert into public.user_roles (user_id, role) values (:'Q', 'finance_officer');
set role authenticated;
select set_config('request.jwt.claim.sub', :'Q', false);
do $$ begin assert (select count(*) from public.research_leads) = 0; raise notice 'PASS finance does not see research'; end $$;

-- admin converts it
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false);
update public.research_leads set converted_company_id = (select id from public.companies limit 1);
do $$ begin assert (select converted_at from public.research_leads) is not null; raise notice 'PASS conversion timestamped'; end $$;
reset role;
