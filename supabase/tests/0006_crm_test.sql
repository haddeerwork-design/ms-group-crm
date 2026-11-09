-- LOCAL TESTING ONLY.
\set ON_ERROR_STOP on
\set A '00000000-0000-0000-0000-00000000000a'
\set S '00000000-0000-0000-0000-00000000000b'
\set Q '00000000-0000-0000-0000-00000000000c'

do $$ begin
  -- stub customer "Existing Co" (u2) + c1, c2, c3 + lead l1; empty-name lead skipped
  assert (select count(*) from public.companies) = 5, (select count(*)::text from public.companies);
  assert (select owner_id from public.companies where legacy_key='customers:c1') = '00000000-0000-0000-0000-00000000000a';
  assert (select owner_id from public.companies where legacy_key='leads:l1') = '00000000-0000-0000-0000-00000000000b';
  assert (select owner_id from public.companies where legacy_key='customers:c3') is null, 'unknown owner -> null';
  assert (select lead_status from public.companies where legacy_key='customers:c1') = 'quotation_sent';
  assert (select lead_status from public.companies where legacy_key='customers:c2') = 'new_lead';
  assert (select company_type from public.companies where legacy_key='customers:c2') = 'horeca';
  assert (select next_follow_up_date from public.companies where legacy_key='customers:c2') is null, 'bad date -> null';
  assert (select count(*) from public.company_contacts) = 2, 'contacts from Ahmed + Omar';
  assert (select count(*) from public.crm_records where record_type in ('customers','leads')) = 6, 'legacy untouched';
  raise notice 'PASS legacy customers and leads imported';
end $$;

do $$ begin
  assert public.app_norm_company('Gulf Fresh Trading LLC') = public.app_norm_company('gulf-fresh  trading co.');
  assert public.app_web_domain('https://www.GulfFresh.ae/contact') = 'gulffresh.ae';
  assert public.app_norm_phone('+971 50 123 4567') = public.app_norm_phone('050-123-4567');
  raise notice 'PASS normalisers';
end $$;

insert into public.user_roles (user_id, role) values (:'Q', 'sales_officer') on conflict do nothing;

-- ===== SALES S: sees own only, duplicate check sees others =====
set role authenticated;
select set_config('request.jwt.claim.sub', :'S', false);
do $$ begin
  assert (select count(*) from public.companies) = 3, 'S owns Existing Co, Euro Frozen, Saudi Foods';
  assert not exists (select 1 from public.companies where legacy_key='customers:c1'), 'S sees admin customer';
  raise notice 'PASS sales sees own companies only';
end $$;
do $$ declare r record; begin
  select * into r from public.find_company_duplicates('[{"name":"GULF FRESH trading","country":"uae"}]'::jsonb) limit 1;
  assert r.company_name = 'Gulf Fresh Trading LLC';
  assert r.can_open = false;
  assert 'same company name' = any(r.reasons) and 'same country' = any(r.reasons);
  assert r.owner_name = 'Admin';
  select * into r from public.find_company_duplicates('[{"name":"x"},{"email":"OMAR@saudifoods.sa"},{"website":"http://gulffresh.ae"}]'::jsonb) where idx = 1;
  assert r.company_name = 'Saudi Foods Co.' and r.can_open, 'email via contact';
  raise notice 'PASS duplicate check across all companies, minimal details';
end $$;
insert into public.companies (name, country) values ('S New Co', 'Egypt');
do $$ begin assert (select owner_id from public.companies where name='S New Co') = '00000000-0000-0000-0000-00000000000b'; raise notice 'PASS new company owned by creator'; end $$;
do $$ begin
  begin
    insert into public.companies (name, owner_id) values ('For admin', '00000000-0000-0000-0000-00000000000a');
    raise exception 'FAIL sales created company for someone else';
  exception when insufficient_privilege then raise notice 'PASS sales cannot create for others'; end;
  begin
    update public.companies set owner_id = '00000000-0000-0000-0000-00000000000c' where name='S New Co';
    raise exception 'FAIL sales reassigned';
  exception when insufficient_privilege then raise notice 'PASS sales cannot reassign'; end;
end $$;
-- S's insert left owner null? must be self
do $$ begin
  begin
    insert into public.companies (name, owner_id) values ('Ownerless by sales', null);
    raise exception 'FAIL ownerless insert';
  exception when insufficient_privilege then raise notice 'PASS sales must own what they create'; end;
end $$;
insert into public.activities (company_id, kind, summary) select id, 'call', 'Called Omar' from public.companies where name='Saudi Foods Co.';
update public.activities set summary='rewritten';
delete from public.activities;
delete from public.companies where name='S New Co';
do $$ begin
  assert (select summary from public.activities) = 'Called Omar', 'activity changed';
  assert exists (select 1 from public.companies where name='S New Co'), 'company hard-deleted';
  raise notice 'PASS activities immutable, companies not deletable';
end $$;

-- ===== SALES Q sees nothing of S =====
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :'Q', false);
do $$ begin
  assert (select count(*) from public.companies) = 0;
  assert (select count(*) from public.company_contacts) = 0;
  assert (select count(*) from public.activities) = 0;
  assert (select count(*) from public.find_company_duplicates('[{"name":"Saudi Foods"}]'::jsonb)) = 1, 'Q still warned';
  raise notice 'PASS other sales sees nothing but is warned about duplicates';
end $$;
reset role;
do $$ declare cid uuid := (select id from public.companies where name='Saudi Foods Co.'); begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
  execute 'set role authenticated';
  begin
    insert into public.company_contacts (company_id, name) values (cid, 'intruder');
    raise exception 'FAIL Q added contact';
  exception when insufficient_privilege then raise notice 'PASS cannot add contacts to others'' companies'; end;
  execute 'reset role';
end $$;

-- ===== ADMIN reassigns =====
set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false);
update public.companies set owner_id = '00000000-0000-0000-0000-00000000000c' where name='Saudi Foods Co.';
do $$ begin
  assert (select count(*) from public.companies) = 6;
  assert (select owner_id from public.companies where name='Saudi Foods Co.') = '00000000-0000-0000-0000-00000000000c';
  assert (select count(*) from public.list_sales_team()) >= 2;
  raise notice 'PASS manager sees all and reassigns';
end $$;
reset role;

-- anon
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  assert (select count(*) from public.companies) = 0;
  begin perform public.find_company_duplicates('[{"name":"Saudi Foods"}]'::jsonb); raise exception 'FAIL anon dup';
  exception when insufficient_privilege then raise notice 'PASS anon blocked'; end;
end $$;
reset role;
