-- LOCAL TESTING ONLY.
\set ON_ERROR_STOP on
\set A '00000000-0000-0000-0000-00000000000a'
\set S '00000000-0000-0000-0000-00000000000b'
\set Q '00000000-0000-0000-0000-00000000000c'

do $$ begin
  assert (select count(*) from public.pipeline_stages) = 11;
  assert (select count(*) from public.pipeline_stages where is_won) = 1 and (select count(*) from public.pipeline_stages where is_lost) = 1;
  raise notice 'PASS 11 stages seeded (names only)';
end $$;
insert into public.user_roles (user_id, role) values (:'Q', 'sales_officer') on conflict do nothing;

-- ===== SALES S: deal on own company =====
set role authenticated;
select set_config('request.jwt.claim.sub', :'S', false);
insert into public.opportunities (company_id, title, stage_id, expected_revenue, probability)
select c.id, 'Okra 2 containers', s.id, 40000, 50 from public.companies c, public.pipeline_stages s where c.name='Saudi Foods Co.' and s.name='New Lead';
do $$ begin
  assert (select owner_id from public.opportunities) = '00000000-0000-0000-0000-00000000000b';
  assert (select count(*) from public.opportunity_stage_history) = 1;
  raise notice 'PASS sales creates deal, history started';
end $$;
reset role;
do $$ declare cid uuid := (select id from public.companies where legacy_key='customers:c1'); sid uuid := (select id from public.pipeline_stages limit 1); begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
  execute 'set role authenticated';
  begin
    insert into public.opportunities (company_id, title, stage_id) values (cid, 'steal', sid);
    raise exception 'FAIL deal on unseen company';
  exception when insufficient_privilege then raise notice 'PASS cannot open a deal on an unseen company'; end;
  execute 'reset role';
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', :'S', false);
update public.opportunities set stage_id = (select id from public.pipeline_stages where is_won);
do $$ begin
  assert (select closed_at from public.opportunities) is not null, 'closed_at not set';
  assert (select count(*) from public.opportunity_stage_history) = 2;
  raise notice 'PASS won sets closed_at, history recorded';
end $$;
update public.opportunities set stage_id = (select id from public.pipeline_stages where name='Negotiation');
do $$ begin assert (select closed_at from public.opportunities) is null; raise notice 'PASS reopening clears closed_at'; end $$;
do $$ begin
  begin
    update public.opportunities set owner_id = '00000000-0000-0000-0000-00000000000c';
    raise exception 'FAIL sales reassigned deal';
  exception when insufficient_privilege then raise notice 'PASS sales cannot reassign deals'; end;
end $$;

-- tasks: own only, cannot assign to others
insert into public.tasks (title, due_date) values ('Call Omar', current_date);
do $$ begin
  begin
    insert into public.tasks (title, assignee_id) values ('For Q', '00000000-0000-0000-0000-00000000000c');
    raise exception 'FAIL sales assigned task to Q';
  exception when insufficient_privilege then raise notice 'PASS sales cannot give tasks to others'; end;
end $$;
update public.tasks set status='done';
do $$ begin assert (select completed_at from public.tasks) is not null; raise notice 'PASS done sets completed_at'; end $$;
do $$ begin
  begin
    insert into public.notifications (user_id, kind, title) values (auth.uid(), 'x', 'fake');
    raise exception 'FAIL user inserted notification';
  exception when insufficient_privilege then raise notice 'PASS users cannot create notifications'; end;
end $$;

-- ===== Q sees nothing of S =====
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :'Q', false);
do $$ begin
  assert (select count(*) from public.opportunities) = 0;
  assert (select count(*) from public.opportunity_stage_history) = 0;
  assert (select count(*) from public.tasks) = 0;
  raise notice 'PASS other sales sees no deals, history or tasks';
end $$;

-- ===== ADMIN assigns a task and a company → notifications =====
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false);
insert into public.tasks (title, assignee_id, due_date) values ('Send samples', '00000000-0000-0000-0000-00000000000c', current_date + 1);
update public.companies set owner_id = '00000000-0000-0000-0000-00000000000c' where name='Euro Frozen BV';
insert into public.tasks (title) values ('Self task');
do $$ begin
  assert (select count(*) from public.tasks) = 3, 'admin sees all tasks';
  assert (select count(*) from public.notifications) = 0, 'admin should see only own notifications (none)';
  raise notice 'PASS admin sees all tasks';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.notifications where user_id='00000000-0000-0000-0000-00000000000c') = 2, 'Q should have 2 notifications';
  assert (select count(*) from public.notifications where user_id='00000000-0000-0000-0000-00000000000a') = 0, 'no self notifications';
  raise notice 'PASS notifications created for assignee only';
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', :'Q', false);
update public.notifications set read_at = now();
do $$ begin
  assert (select count(*) from public.notifications where read_at is not null) = 2;
  assert (select count(*) from public.tasks) = 1, 'Q sees the task given to them';
  raise notice 'PASS assignee sees task and marks notifications read';
end $$;
reset role;
