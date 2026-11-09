-- =====================================================================
-- MS El-brancy Group platform — Migration 0004: Container planner
-- ---------------------------------------------------------------------
-- WHAT THIS DOES (additive only, nothing is deleted):
--   1. container_types: your container sizes with THEIR limits (pallets,
--      payload, pallet type, empty pallet weight). The table starts EMPTY:
--      capacities depend on your shipping line / forwarder, so you enter
--      them yourself. Nothing is guessed.
--   2. container_plans + container_plan_items: saved loading plans
--      (single or mixed products, by pallets, cartons or tons).
--
-- WHO CAN DO WHAT
--   Container types: everyone reads; Super Admin, Sales Manager and
--                    Logistics Officer add / edit / archive.
--   Plans:           Sales Officers see and edit only their OWN plans;
--                    Super Admin and Sales Manager see and edit all;
--                    Logistics Officer can read all plans.
--
-- Requires 0003_pricing. Safe to run more than once.
-- =====================================================================

begin;

do $$ begin
  if not exists (select 1 from public.app_migrations where version = '0003_pricing') then
    raise exception 'Run 0003_pricing first.';
  end if;
end $$;

do $$ begin
  create type public.app_qty_unit as enum ('pallets', 'cartons', 'tons');
exception when duplicate_object then null; end $$;

create or replace function public.app_can_manage_containers()
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_has_any_role(array['super_admin', 'sales_manager', 'logistics_officer']::public.app_role[])
$$;
create or replace function public.app_can_plan()
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_has_any_role(array['super_admin', 'sales_manager', 'sales_officer']::public.app_role[])
$$;
create or replace function public.app_sees_all_plans()
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_has_any_role(array['super_admin', 'sales_manager', 'logistics_officer']::public.app_role[])
$$;
create or replace function public.app_edits_all_plans()
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_has_any_role(array['super_admin', 'sales_manager']::public.app_role[])
$$;
revoke all on function public.app_can_manage_containers() from anon;
revoke all on function public.app_can_plan() from anon;
revoke all on function public.app_sees_all_plans() from anon;
revoke all on function public.app_edits_all_plans() from anon;

-- ---------------------------------------------------------------------
-- Container types
-- ---------------------------------------------------------------------
create table if not exists public.container_types (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (length(trim(name)) between 2 and 60),
  is_reefer          boolean not null default true,
  max_pallets        int not null check (max_pallets > 0),
  max_payload_kg     numeric not null check (max_payload_kg > 0),
  pallet_type        text,
  empty_pallet_kg    numeric not null default 0 check (empty_pallet_kg >= 0),
  internal_volume_cbm numeric check (internal_volume_cbm > 0),
  notes              text,
  sort_order         int not null default 100,
  archived_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references auth.users(id) on delete set null
);
create unique index if not exists container_types_name_uq on public.container_types (lower(name)) where archived_at is null;
alter table public.container_types enable row level security;

drop policy if exists container_types_select on public.container_types;
create policy container_types_select on public.container_types for select to authenticated using (public.app_is_member());
drop policy if exists container_types_insert on public.container_types;
create policy container_types_insert on public.container_types for insert to authenticated with check (public.app_can_manage_containers());
drop policy if exists container_types_update on public.container_types;
create policy container_types_update on public.container_types for update to authenticated
  using (public.app_can_manage_containers()) with check (public.app_can_manage_containers());

drop trigger if exists container_types_updated_at on public.container_types;
create trigger container_types_updated_at before update on public.container_types
  for each row execute function public.app_set_updated_at();
drop trigger if exists container_types_audit on public.container_types;
create trigger container_types_audit after insert or update or delete on public.container_types
  for each row execute function public.app_audit();

-- ---------------------------------------------------------------------
-- Plans
-- ---------------------------------------------------------------------
create table if not exists public.container_plans (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (length(trim(name)) between 1 and 120),
  container_type_id uuid references public.container_types(id),
  container_count   int not null default 1 check (container_count between 1 and 100),
  -- snapshot of the container limits used, so old plans keep their numbers
  max_pallets       int check (max_pallets > 0),
  max_payload_kg    numeric check (max_payload_kg > 0),
  empty_pallet_kg   numeric check (empty_pallet_kg >= 0),
  customer_name     text,
  destination       text,
  incoterm          public.app_incoterm,
  currency          text check (currency ~ '^[A-Z]{3}$'),
  notes             text,
  created_at        timestamptz not null default now(),
  created_by        uuid not null default auth.uid() references auth.users(id),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users(id) on delete set null
);
create index if not exists container_plans_owner_idx on public.container_plans (created_by, updated_at desc);

create table if not exists public.container_plan_items (
  id                uuid primary key default gen_random_uuid(),
  plan_id           uuid not null references public.container_plans(id) on delete cascade,
  product_id        uuid not null references public.products(id),
  packaging_id      uuid references public.product_packaging(id),
  variety           text,
  qty_unit          public.app_qty_unit not null,
  quantity          numeric not null check (quantity > 0),
  net_weight_kg     numeric check (net_weight_kg > 0),
  gross_weight_kg   numeric check (gross_weight_kg > 0),
  cartons_per_pallet int check (cartons_per_pallet > 0),
  price_per_ton     numeric check (price_per_ton >= 0),
  price_id          uuid references public.product_prices(id),
  sort_order        int not null default 0
);
create index if not exists container_plan_items_plan_idx on public.container_plan_items (plan_id, sort_order);

alter table public.container_plans enable row level security;
alter table public.container_plan_items enable row level security;

drop policy if exists container_plans_select on public.container_plans;
create policy container_plans_select on public.container_plans for select to authenticated
  using (public.app_is_member() and (created_by = auth.uid() or public.app_sees_all_plans()));
drop policy if exists container_plans_insert on public.container_plans;
create policy container_plans_insert on public.container_plans for insert to authenticated
  with check (public.app_can_plan() and created_by = auth.uid());
drop policy if exists container_plans_update on public.container_plans;
create policy container_plans_update on public.container_plans for update to authenticated
  using (public.app_can_plan() and (created_by = auth.uid() or public.app_edits_all_plans()))
  with check (public.app_can_plan() and (created_by = auth.uid() or public.app_edits_all_plans()));
drop policy if exists container_plans_delete on public.container_plans;
create policy container_plans_delete on public.container_plans for delete to authenticated
  using (public.app_can_plan() and (created_by = auth.uid() or public.app_edits_all_plans()));

-- Items follow their plan.
create or replace function public.app_can_edit_plan(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_can_plan() and exists (
    select 1 from public.container_plans p
     where p.id = pid and (p.created_by = auth.uid() or public.app_edits_all_plans()))
$$;
create or replace function public.app_can_read_plan(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_is_member() and exists (
    select 1 from public.container_plans p
     where p.id = pid and (p.created_by = auth.uid() or public.app_sees_all_plans()))
$$;
revoke all on function public.app_can_edit_plan(uuid) from anon;
revoke all on function public.app_can_read_plan(uuid) from anon;

drop policy if exists container_plan_items_select on public.container_plan_items;
create policy container_plan_items_select on public.container_plan_items for select to authenticated using (public.app_can_read_plan(plan_id));
drop policy if exists container_plan_items_insert on public.container_plan_items;
create policy container_plan_items_insert on public.container_plan_items for insert to authenticated with check (public.app_can_edit_plan(plan_id));
drop policy if exists container_plan_items_update on public.container_plan_items;
create policy container_plan_items_update on public.container_plan_items for update to authenticated
  using (public.app_can_edit_plan(plan_id)) with check (public.app_can_edit_plan(plan_id));
drop policy if exists container_plan_items_delete on public.container_plan_items;
create policy container_plan_items_delete on public.container_plan_items for delete to authenticated using (public.app_can_edit_plan(plan_id));

-- created_by can never be changed after creation
create or replace function public.app_keep_created_by()
returns trigger language plpgsql as $$
begin
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  return new;
end $$;

drop trigger if exists container_plans_keep_owner on public.container_plans;
create trigger container_plans_keep_owner before update on public.container_plans
  for each row execute function public.app_keep_created_by();
drop trigger if exists container_plans_updated_at on public.container_plans;
create trigger container_plans_updated_at before update on public.container_plans
  for each row execute function public.app_set_updated_at();

insert into public.app_migrations (version) values ('0004_containers') on conflict do nothing;

commit;

select 'Container planner installed. Add your container types in the app (Planner → Container types).' as next_step;
