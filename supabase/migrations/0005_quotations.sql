-- =====================================================================
-- MS El-brancy Group platform — Migration 0005: Quotations
-- ---------------------------------------------------------------------
-- WHAT THIS DOES (additive only, nothing is deleted):
--   1. quotations + quotation_items. Numbers are given by the database
--      (QTN-2026-0001, QTN-2026-0002 …), so two people saving at the same
--      moment can never get the same number.
--   2. Status flow: Draft → Sent → Accepted / Rejected / Expired.
--      A sent quotation is LOCKED. To change it, click "Revise": the sent
--      version is kept in quotation_versions and a new version opens.
--   3. company_settings gets the quotation defaults taken from your PDF
--      (policy lines, 3 days validity, "7 days to 10 days" production).
--      You can change them in Company Settings.
--   4. Quotations in the CURRENT CRM are not moved; they stay there.
--
-- WHO CAN DO WHAT
--   Sales Officer: own quotations only.
--   Super Admin, Sales Manager: all quotations.
--   Finance Officer: read all (for invoices later).
--
-- Requires 0004_containers. Safe to run more than once.
-- =====================================================================

begin;

do $$ begin
  if not exists (select 1 from public.app_migrations where version = '0004_containers') then
    raise exception 'Run 0004_containers first.';
  end if;
end $$;

do $$ begin
  create type public.app_quote_status as enum ('draft', 'sent', 'accepted', 'rejected', 'expired', 'revised');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Quotation defaults in company settings (from MS_Group_Quotation.pdf)
-- ---------------------------------------------------------------------
alter table public.company_settings add column if not exists quotation_policy text[];
alter table public.company_settings add column if not exists quotation_validity_days int check (quotation_validity_days between 1 and 365);
alter table public.company_settings add column if not exists quotation_production_time text;

update public.company_settings set
  quotation_policy = coalesce(quotation_policy, array[
    'These prices are inclusive (bags - cartons - certificates and analyzes for the shipment)',
    'This quotation available for {validity_days} days.',
    'Shipping Price is unstable so this quotation is {incoterm} until order.',
    'The application is completed from {production_time} from the date of payment of first batch.'
  ]),
  quotation_validity_days = coalesce(quotation_validity_days, 3),
  quotation_production_time = coalesce(quotation_production_time, '7 days to 10 days')
where id = 1;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function public.app_sees_all_quotes()
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_has_any_role(array['super_admin', 'sales_manager', 'finance_officer']::public.app_role[])
$$;
revoke all on function public.app_sees_all_quotes() from anon;
-- writers reuse app_can_plan() (super_admin, sales_manager, sales_officer)
-- and app_edits_all_plans() (super_admin, sales_manager) from 0004.

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table if not exists public.quotation_counters (
  year int primary key,
  last int not null default 0
);
alter table public.quotation_counters enable row level security; -- no policies: only the trigger uses it

create table if not exists public.quotations (
  id               uuid primary key default gen_random_uuid(),
  number           text unique,
  status           public.app_quote_status not null default 'draft',
  version          int not null default 1,
  issue_date       date not null default current_date,
  validity_days    int check (validity_days between 1 and 365),
  valid_until      date,
  customer_name    text,
  customer_company text,
  customer_country text,
  customer_email   text,
  customer_phone   text,
  destination      text,
  incoterm         public.app_incoterm,
  currency         text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  payment_terms    text,
  production_time  text,
  policy_lines     text[] not null default '{}',
  show_quantities  boolean not null default false,
  plan_id          uuid references public.container_plans(id) on delete set null,
  notes            text,               -- internal, never printed
  sent_at          timestamptz,
  created_at       timestamptz not null default now(),
  created_by       uuid not null default auth.uid() references auth.users(id),
  updated_at       timestamptz not null default now(),
  updated_by       uuid references auth.users(id) on delete set null,
  check (valid_until is null or valid_until >= issue_date)
);
create index if not exists quotations_owner_idx on public.quotations (created_by, created_at desc);

create table if not exists public.quotation_items (
  id                 uuid primary key default gen_random_uuid(),
  quotation_id       uuid not null references public.quotations(id) on delete cascade,
  product_id         uuid references public.products(id),
  packaging_id       uuid references public.product_packaging(id),
  description        text not null check (length(trim(description)) > 0),
  packing            text,
  product_type_label text,
  quantity           numeric check (quantity > 0),
  quantity_unit      public.app_qty_unit,
  net_weight_kg      numeric check (net_weight_kg > 0),
  cartons_per_pallet int check (cartons_per_pallet > 0),
  price_per_ton      numeric not null check (price_per_ton > 0),
  line_total         numeric check (line_total >= 0),
  price_id           uuid references public.product_prices(id),
  sort_order         int not null default 0
);
create index if not exists quotation_items_quote_idx on public.quotation_items (quotation_id, sort_order);

create table if not exists public.quotation_versions (
  id           bigint generated always as identity primary key,
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  version      int not null,
  status       public.app_quote_status not null,
  snapshot     jsonb not null,
  created_at   timestamptz not null default now(),
  created_by   uuid default auth.uid() references auth.users(id) on delete set null,
  unique (quotation_id, version)
);

alter table public.quotations enable row level security;
alter table public.quotation_items enable row level security;
alter table public.quotation_versions enable row level security;

-- ---------------------------------------------------------------------
-- Numbering (safe under concurrent saves)
-- ---------------------------------------------------------------------
create or replace function public.app_quotation_number()
returns trigger language plpgsql security definer set search_path = public as $$
declare yr int := extract(year from coalesce(new.issue_date, current_date))::int; n int;
begin
  insert into public.quotation_counters as c (year, last) values (yr, 1)
  on conflict (year) do update set last = c.last + 1
  returning last into n;
  new.number := 'QTN-' || yr || '-' || lpad(n::text, 4, '0');
  new.status := 'draft';
  new.version := 1;
  new.sent_at := null;
  return new;
end $$;

drop trigger if exists quotations_number on public.quotations;
create trigger quotations_number before insert on public.quotations
  for each row execute function public.app_quotation_number();

-- ---------------------------------------------------------------------
-- Locks: number/owner never change; status/version only via the
-- function below; a quotation that is not draft/revised is read-only.
-- ---------------------------------------------------------------------
create or replace function public.app_quotation_guard()
returns trigger language plpgsql as $$
declare via_fn boolean := coalesce(current_setting('app.quote_status_change', true), '') = 'on';
begin
  new.number := old.number;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  if not via_fn then
    new.status := old.status;
    new.version := old.version;
    new.sent_at := old.sent_at;
    if old.status not in ('draft', 'revised') then
      raise exception 'Quotation % is %. Click "Revise" to change it.', old.number, old.status;
    end if;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists quotations_guard on public.quotations;
create trigger quotations_guard before update on public.quotations
  for each row execute function public.app_quotation_guard();

create or replace function public.app_can_edit_quote(qid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_can_plan() and exists (
    select 1 from public.quotations q
     where q.id = qid and q.status in ('draft', 'revised')
       and (q.created_by = auth.uid() or public.app_edits_all_plans()))
$$;
create or replace function public.app_can_read_quote(qid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_is_member() and exists (
    select 1 from public.quotations q
     where q.id = qid and (q.created_by = auth.uid() or public.app_sees_all_quotes()))
$$;
revoke all on function public.app_can_edit_quote(uuid) from anon;
revoke all on function public.app_can_read_quote(uuid) from anon;

-- ---------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------
drop policy if exists quotations_select on public.quotations;
create policy quotations_select on public.quotations for select to authenticated
  using (public.app_is_member() and (created_by = auth.uid() or public.app_sees_all_quotes()));
drop policy if exists quotations_insert on public.quotations;
create policy quotations_insert on public.quotations for insert to authenticated
  with check (public.app_can_plan() and created_by = auth.uid());
drop policy if exists quotations_update on public.quotations;
create policy quotations_update on public.quotations for update to authenticated
  using (public.app_can_plan() and (created_by = auth.uid() or public.app_edits_all_plans()))
  with check (public.app_can_plan() and (created_by = auth.uid() or public.app_edits_all_plans()));
drop policy if exists quotations_delete on public.quotations;
create policy quotations_delete on public.quotations for delete to authenticated
  using (public.app_can_plan() and status = 'draft' and version = 1
         and (created_by = auth.uid() or public.app_edits_all_plans()));

drop policy if exists quotation_items_select on public.quotation_items;
create policy quotation_items_select on public.quotation_items for select to authenticated using (public.app_can_read_quote(quotation_id));
drop policy if exists quotation_items_insert on public.quotation_items;
create policy quotation_items_insert on public.quotation_items for insert to authenticated with check (public.app_can_edit_quote(quotation_id));
drop policy if exists quotation_items_update on public.quotation_items;
create policy quotation_items_update on public.quotation_items for update to authenticated
  using (public.app_can_edit_quote(quotation_id)) with check (public.app_can_edit_quote(quotation_id));
drop policy if exists quotation_items_delete on public.quotation_items;
create policy quotation_items_delete on public.quotation_items for delete to authenticated using (public.app_can_edit_quote(quotation_id));

drop policy if exists quotation_versions_select on public.quotation_versions;
create policy quotation_versions_select on public.quotation_versions for select to authenticated using (public.app_can_read_quote(quotation_id));
-- no insert/update/delete policies: only the function below writes versions

-- ---------------------------------------------------------------------
-- Status changes (the only way to change status)
-- ---------------------------------------------------------------------
create or replace function public.set_quotation_status(qid uuid, new_status public.app_quote_status)
returns public.quotations language plpgsql security definer set search_path = public as $$
declare q public.quotations; snap jsonb;
begin
  select * into q from public.quotations where id = qid for update;
  if not found then raise exception 'Quotation not found'; end if;
  if not (public.app_can_plan() and (q.created_by = auth.uid() or public.app_edits_all_plans())) then
    raise exception 'You are not allowed to change this quotation' using errcode = '42501';
  end if;

  if not (
       (q.status in ('draft', 'revised') and new_status = 'sent')
    or (q.status = 'sent' and new_status in ('accepted', 'rejected', 'expired'))
    or (q.status in ('sent', 'accepted', 'rejected', 'expired') and new_status = 'revised')
  ) then
    raise exception 'Cannot change a % quotation to %', q.status, new_status;
  end if;

  if new_status = 'sent' then
    if not exists (select 1 from public.quotation_items where quotation_id = qid) then
      raise exception 'Add at least one product before sending.';
    end if;
    snap := to_jsonb(q) || jsonb_build_object('items',
      (select coalesce(jsonb_agg(to_jsonb(i) order by i.sort_order), '[]'::jsonb)
         from public.quotation_items i where i.quotation_id = qid));
    insert into public.quotation_versions (quotation_id, version, status, snapshot)
    values (qid, q.version, 'sent', snap)
    on conflict (quotation_id, version) do update set snapshot = excluded.snapshot, created_at = now();
  end if;

  perform set_config('app.quote_status_change', 'on', true);
  update public.quotations set
    status  = new_status,
    version = case when new_status = 'revised' then q.version + 1 else q.version end,
    sent_at = case when new_status = 'sent' then now() else q.sent_at end
  where id = qid returning * into q;
  perform set_config('app.quote_status_change', 'off', true);

  insert into public.audit_logs (table_name, record_id, action, old_data, new_data)
  values ('quotations', qid::text, 'UPDATE', null, jsonb_build_object('status', new_status, 'version', q.version));
  return q;
end $$;
revoke all on function public.set_quotation_status(uuid, public.app_quote_status) from anon;
grant execute on function public.set_quotation_status(uuid, public.app_quote_status) to authenticated;

drop trigger if exists quotations_audit on public.quotations;
create trigger quotations_audit after insert or delete on public.quotations
  for each row execute function public.app_audit();

insert into public.app_migrations (version) values ('0005_quotations') on conflict do nothing;

commit;

select quotation_validity_days, quotation_production_time, array_length(quotation_policy, 1) as policy_lines
  from public.company_settings where id = 1;
