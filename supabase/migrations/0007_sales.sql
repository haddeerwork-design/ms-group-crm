-- =====================================================================
-- MS El-brancy Group platform — Migration 0007: Pipeline, tasks, notifications
-- ---------------------------------------------------------------------
-- WHAT THIS DOES (additive only, nothing is deleted):
--   1. pipeline_stages: the 11 stages from the MASTER PROMPT (names only;
--      no probabilities are invented). Super Admin / Sales Manager can
--      rename, reorder or add stages.
--   2. opportunities (deals) linked to a company, with automatic stage
--      history for conversion reports.
--   3. tasks & follow-ups linked to a company and/or opportunity.
--   4. notifications: created automatically when someone gives you a task,
--      a company or a deal. Reminders for due tasks, follow-ups and
--      expiring quotations are calculated live in the app.
--
-- WHO CAN DO WHAT
--   Opportunities: same rule as companies (own vs. all for managers,
--                  finance reads all).
--   Tasks: you see tasks assigned to you or created by you; managers see
--          all. Only managers can give a task to someone else.
--   Notifications: each person sees and marks only their own.
--
-- Requires 0006_crm. Safe to run more than once.
-- =====================================================================

begin;

do $$ begin
  if not exists (select 1 from public.app_migrations where version = '0006_crm') then
    raise exception 'Run 0006_crm first.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Stages
-- ---------------------------------------------------------------------
create table if not exists public.pipeline_stages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 60),
  sort_order  int not null,
  is_won      boolean not null default false,
  is_lost     boolean not null default false,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  check (not (is_won and is_lost))
);
create unique index if not exists pipeline_stages_name_uq on public.pipeline_stages (lower(name)) where archived_at is null;
alter table public.pipeline_stages enable row level security;
drop policy if exists pipeline_stages_select on public.pipeline_stages;
create policy pipeline_stages_select on public.pipeline_stages for select to authenticated using (public.app_is_member());
drop policy if exists pipeline_stages_insert on public.pipeline_stages;
create policy pipeline_stages_insert on public.pipeline_stages for insert to authenticated with check (public.app_edits_all_plans());
drop policy if exists pipeline_stages_update on public.pipeline_stages;
create policy pipeline_stages_update on public.pipeline_stages for update to authenticated
  using (public.app_edits_all_plans()) with check (public.app_edits_all_plans());

insert into public.pipeline_stages (name, sort_order, is_won, is_lost)
select v.name, v.ord, v.won, v.lost
  from (values ('New Lead', 10, false, false), ('Contacted', 20, false, false), ('Interested', 30, false, false),
               ('Product Inquiry', 40, false, false), ('Quotation Requested', 50, false, false), ('Quotation Sent', 60, false, false),
               ('Negotiation', 70, false, false), ('Sample Requested', 80, false, false), ('Order Confirmed', 90, false, false),
               ('Won', 100, true, false), ('Lost', 110, false, true)) as v(name, ord, won, lost)
 where not exists (select 1 from public.pipeline_stages);

-- ---------------------------------------------------------------------
-- Opportunities
-- ---------------------------------------------------------------------
create table if not exists public.opportunities (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id),
  title               text not null check (length(trim(title)) between 1 and 200),
  stage_id            uuid not null references public.pipeline_stages(id),
  product_id          uuid references public.products(id),
  product_text        text,
  expected_quantity   numeric check (expected_quantity > 0),
  quantity_unit       public.app_qty_unit,
  expected_revenue    numeric check (expected_revenue >= 0),
  currency            text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  probability         int check (probability between 0 and 100),
  expected_close_date date,
  next_action         text,
  notes               text,
  quotation_id        uuid references public.quotations(id) on delete set null,
  lost_reason         text,
  closed_at           timestamptz,
  owner_id            uuid default auth.uid() references auth.users(id) on delete set null,
  archived_at         timestamptz,
  created_at          timestamptz not null default now(),
  created_by          uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users(id) on delete set null
);
create index if not exists opportunities_owner_idx on public.opportunities (owner_id);
create index if not exists opportunities_company_idx on public.opportunities (company_id);
create index if not exists opportunities_stage_idx on public.opportunities (stage_id);

create table if not exists public.opportunity_stage_history (
  id             bigint generated always as identity primary key,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  from_stage_id  uuid references public.pipeline_stages(id),
  to_stage_id    uuid not null references public.pipeline_stages(id),
  changed_at     timestamptz not null default now(),
  changed_by     uuid default auth.uid() references auth.users(id) on delete set null
);
create index if not exists opportunity_stage_history_opp_idx on public.opportunity_stage_history (opportunity_id, changed_at);

alter table public.opportunities enable row level security;
alter table public.opportunity_stage_history enable row level security;

drop policy if exists opportunities_select on public.opportunities;
create policy opportunities_select on public.opportunities for select to authenticated
  using (public.app_is_member() and (owner_id = auth.uid() or public.app_sees_all_companies()));
drop policy if exists opportunities_insert on public.opportunities;
create policy opportunities_insert on public.opportunities for insert to authenticated
  with check (public.app_can_plan() and public.app_can_read_company(company_id)
              and (owner_id = auth.uid() or public.app_edits_all_plans()));
drop policy if exists opportunities_update on public.opportunities;
create policy opportunities_update on public.opportunities for update to authenticated
  using (public.app_can_plan() and (owner_id = auth.uid() or public.app_edits_all_plans()))
  with check (public.app_can_plan() and (owner_id = auth.uid() or public.app_edits_all_plans()));
-- no delete: archive

drop policy if exists opportunity_stage_history_select on public.opportunity_stage_history;
create policy opportunity_stage_history_select on public.opportunity_stage_history for select to authenticated
  using (exists (select 1 from public.opportunities o where o.id = opportunity_id));  -- inherits opportunities RLS

create or replace function public.app_opportunity_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare st public.pipeline_stages;
begin
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.company_id := old.company_id;
    if new.owner_id is distinct from old.owner_id and not public.app_edits_all_plans() then
      raise exception 'Only the Sales Manager or Super Admin can change who owns a deal.' using errcode = '42501';
    end if;
  end if;
  select * into st from public.pipeline_stages where id = new.stage_id;
  if st.is_won or st.is_lost then
    if tg_op = 'INSERT' or old.stage_id is distinct from new.stage_id then new.closed_at := now(); end if;
  else
    new.closed_at := null;
  end if;
  return new;
end $$;
drop trigger if exists opportunities_guard on public.opportunities;
create trigger opportunities_guard before insert or update on public.opportunities
  for each row execute function public.app_opportunity_guard();

create or replace function public.app_opportunity_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or old.stage_id is distinct from new.stage_id then
    insert into public.opportunity_stage_history (opportunity_id, from_stage_id, to_stage_id)
    values (new.id, case when tg_op = 'UPDATE' then old.stage_id end, new.stage_id);
  end if;
  return new;
end $$;
drop trigger if exists opportunities_history on public.opportunities;
create trigger opportunities_history after insert or update of stage_id on public.opportunities
  for each row execute function public.app_opportunity_history();

drop trigger if exists opportunities_updated_at on public.opportunities;
create trigger opportunities_updated_at before update on public.opportunities
  for each row execute function public.app_set_updated_at();
drop trigger if exists opportunities_audit on public.opportunities;
create trigger opportunities_audit after insert or update or delete on public.opportunities
  for each row execute function public.app_audit();

-- ---------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------
create table if not exists public.tasks (
  id              uuid primary key default gen_random_uuid(),
  title           text not null check (length(trim(title)) between 1 and 200),
  description     text,
  company_id      uuid references public.companies(id) on delete cascade,
  opportunity_id  uuid references public.opportunities(id) on delete cascade,
  assignee_id     uuid not null default auth.uid() references auth.users(id),
  due_date        date,
  priority        text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  status          text not null default 'open' check (status in ('open', 'in_progress', 'done', 'cancelled')),
  reminder_at     timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  created_by      uuid not null default auth.uid() references auth.users(id),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users(id) on delete set null
);
create index if not exists tasks_assignee_idx on public.tasks (assignee_id, status, due_date);
create index if not exists tasks_company_idx on public.tasks (company_id);
alter table public.tasks enable row level security;

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
  using (public.app_is_member() and (assignee_id = auth.uid() or created_by = auth.uid() or public.app_edits_all_plans()));
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.app_is_member() and created_by = auth.uid()
              and (assignee_id = auth.uid() or public.app_edits_all_plans())
              and (company_id is null or public.app_can_read_company(company_id)));
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated
  using (public.app_is_member() and (assignee_id = auth.uid() or created_by = auth.uid() or public.app_edits_all_plans()))
  with check (public.app_is_member() and (assignee_id = auth.uid() or created_by = auth.uid() or public.app_edits_all_plans()));
drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.app_is_member() and (created_by = auth.uid() or public.app_edits_all_plans()));

create or replace function public.app_task_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    if new.assignee_id is distinct from old.assignee_id and not public.app_edits_all_plans() then
      raise exception 'Only the Sales Manager or Super Admin can give a task to someone else.' using errcode = '42501';
    end if;
  end if;
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then new.completed_at := now();
  elsif new.status <> 'done' then new.completed_at := null; end if;
  return new;
end $$;
drop trigger if exists tasks_guard on public.tasks;
create trigger tasks_guard before insert or update on public.tasks
  for each row execute function public.app_task_guard();
drop trigger if exists tasks_updated_at on public.tasks;
create trigger tasks_updated_at before update on public.tasks
  for each row execute function public.app_set_updated_at();

-- ---------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text,
  link       text,              -- in-app path, e.g. /crm/<id>
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, read_at, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = auth.uid());
-- no insert policy: only the triggers below create notifications

create or replace function public.app_notify(uid uuid, k text, t text, b text, l text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if uid is null or uid = auth.uid() then return; end if;   -- never notify yourself
  insert into public.notifications (user_id, kind, title, body, link) values (uid, k, t, b, l);
end $$;
revoke all on function public.app_notify(uuid, text, text, text, text) from public, anon, authenticated;

create or replace function public.app_actor_name()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select coalesce(full_name, email) from public.profiles where id = auth.uid()), 'Someone')
$$;

create or replace function public.app_notify_task()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id then
    perform public.app_notify(new.assignee_id, 'task_assigned', 'New task: ' || new.title,
      public.app_actor_name() || ' gave you a task' || coalesce(' due ' || to_char(new.due_date, 'DD/MM/YYYY'), ''), '/tasks');
  end if;
  return new;
end $$;
drop trigger if exists tasks_notify on public.tasks;
create trigger tasks_notify after insert or update of assignee_id on public.tasks
  for each row execute function public.app_notify_task();

create or replace function public.app_notify_company_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT' and new.legacy_key is null) or (tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id) then
    perform public.app_notify(new.owner_id, 'company_assigned', 'New assigned company: ' || new.name,
      public.app_actor_name() || ' assigned this company to you', '/crm/' || new.id);
  end if;
  return new;
end $$;
drop trigger if exists companies_notify on public.companies;
create trigger companies_notify after insert or update of owner_id on public.companies
  for each row execute function public.app_notify_company_owner();

create or replace function public.app_notify_opportunity_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.owner_id is distinct from old.owner_id then
    perform public.app_notify(new.owner_id, 'deal_assigned', 'New assigned deal: ' || new.title,
      public.app_actor_name() || ' assigned this deal to you', '/pipeline');
  end if;
  return new;
end $$;
drop trigger if exists opportunities_notify on public.opportunities;
create trigger opportunities_notify after insert or update of owner_id on public.opportunities
  for each row execute function public.app_notify_opportunity_owner();

insert into public.app_migrations (version) values ('0007_sales') on conflict do nothing;

commit;

select name, sort_order from public.pipeline_stages order by sort_order;
