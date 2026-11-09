-- =====================================================================
-- MS El-brancy Group platform — Migration 0009: Orders, shipments, documents, payments
-- ---------------------------------------------------------------------
-- WHAT THIS DOES (additive only, nothing is deleted):
--   1. sales_orders (SO-2026-0001 …) with items, shipment details and an
--      automatic stage history (Confirmed → … → Completed).
--   2. A PRIVATE file store "order-documents" for commercial invoices,
--      packing lists, phytosanitary certificates, B/L / AWB, etc.
--      Files are opened only through short-lived signed links.
--   3. payments: money in (from customers) and out (suppliers, freight,
--      other shipment expenses). A payment is only marked as received when
--      Finance (or a manager) records the amount, date and reference.
--
-- WHO CAN DO WHAT
--   Orders: Sales Officer — own orders; Super Admin / Sales Manager — all;
--           Finance — read all; Logistics — read all and update ONLY the
--           shipment fields and stage (not prices or buyer).
--   Documents: whoever can read the order can download; owner, managers
--              and Logistics upload; only managers delete.
--   Payments: Finance, Super Admin, Sales Manager record and confirm;
--             the order owner can see the payment status of their orders.
--
-- Requires 0008_logistics. Safe to run more than once.
-- =====================================================================

begin;

do $$ begin
  if not exists (select 1 from public.app_migrations where version = '0008_logistics') then
    raise exception 'Run 0008_logistics first.';
  end if;
end $$;

do $$ begin
  create type public.app_order_stage as enum ('confirmed', 'awaiting_advance', 'preparing', 'packing', 'ready',
    'booked', 'shipped', 'arrived', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

create or replace function public.app_try_uuid(t text)
returns uuid language plpgsql immutable as $$
begin return t::uuid; exception when others then return null; end $$;

create or replace function public.app_is_logistics()
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_has_role('logistics_officer')
$$;
create or replace function public.app_is_finance_or_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_has_any_role(array['super_admin', 'sales_manager', 'finance_officer']::public.app_role[])
$$;
revoke all on function public.app_is_logistics() from public, anon;
revoke all on function public.app_is_finance_or_manager() from public, anon;
grant execute on function public.app_is_logistics() to authenticated;
grant execute on function public.app_is_finance_or_manager() to authenticated;

-- ---------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------
create table if not exists public.order_counters (year int primary key, last int not null default 0);
alter table public.order_counters enable row level security;

create table if not exists public.sales_orders (
  id                uuid primary key default gen_random_uuid(),
  number            text unique,
  stage             public.app_order_stage not null default 'confirmed',
  company_id        uuid references public.companies(id) on delete set null,
  quotation_id      uuid references public.quotations(id) on delete set null,
  proforma_id       uuid references public.proforma_invoices(id) on delete set null,
  order_date        date not null default current_date,
  customer_company  text,
  customer_name     text,
  customer_country  text,
  currency          text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  incoterm          public.app_incoterm,
  payment_terms     text,
  other_charges     numeric not null default 0,
  -- shipment
  shipping_method   text check (shipping_method in ('sea', 'air', 'land')),
  forwarder_id      uuid references public.freight_forwarders(id) on delete set null,
  carrier           text,
  origin            text,
  port_of_loading   text,
  destination       text,
  port_of_discharge text,
  departure_date    date,
  eta               date,
  arrival_date      date,
  bl_awb_number     text,
  container_numbers text,
  booking_number    text,
  shipment_notes    text,
  notes             text,
  created_at        timestamptz not null default now(),
  created_by        uuid not null default auth.uid() references auth.users(id),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users(id) on delete set null
);
create index if not exists sales_orders_owner_idx on public.sales_orders (created_by, created_at desc);
create index if not exists sales_orders_stage_idx on public.sales_orders (stage);

create table if not exists public.order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.sales_orders(id) on delete cascade,
  product_id  uuid references public.products(id),
  description text not null check (length(trim(description)) > 0),
  packing     text,
  quantity    numeric not null check (quantity > 0),
  unit        text not null check (unit in ('tons', 'cartons', 'kg', 'pieces')),
  net_weight_kg numeric check (net_weight_kg > 0),
  unit_price  numeric not null check (unit_price >= 0),
  price_unit  text not null default 'ton' check (price_unit in ('ton', 'kg', 'carton', 'piece')),
  line_total  numeric not null check (line_total >= 0),
  sort_order  int not null default 0
);
create index if not exists order_items_order_idx on public.order_items (order_id, sort_order);

create table if not exists public.order_stage_history (
  id         bigint generated always as identity primary key,
  order_id   uuid not null references public.sales_orders(id) on delete cascade,
  from_stage public.app_order_stage,
  to_stage   public.app_order_stage not null,
  changed_at timestamptz not null default now(),
  changed_by uuid default auth.uid() references auth.users(id) on delete set null
);
create index if not exists order_stage_history_idx on public.order_stage_history (order_id, changed_at);

alter table public.sales_orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_stage_history enable row level security;

create or replace function public.app_order_number()
returns trigger language plpgsql security definer set search_path = public as $$
declare yr int := extract(year from coalesce(new.order_date, current_date))::int; n int;
begin
  insert into public.order_counters as c (year, last) values (yr, 1)
  on conflict (year) do update set last = c.last + 1 returning last into n;
  new.number := 'SO-' || yr || '-' || lpad(n::text, 4, '0');
  return new;
end $$;
drop trigger if exists sales_orders_number on public.sales_orders;
create trigger sales_orders_number before insert on public.sales_orders
  for each row execute function public.app_order_number();

create or replace function public.app_can_read_order(oid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_is_member() and exists (select 1 from public.sales_orders o where o.id = oid
    and (o.created_by = auth.uid() or public.app_sees_all_quotes() or public.app_is_logistics()))
$$;
create or replace function public.app_can_edit_order(oid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_can_plan() and exists (select 1 from public.sales_orders o where o.id = oid
    and o.stage not in ('completed', 'cancelled') and (o.created_by = auth.uid() or public.app_edits_all_plans()))
$$;
revoke all on function public.app_can_read_order(uuid) from public, anon;
revoke all on function public.app_can_edit_order(uuid) from public, anon;
grant execute on function public.app_can_read_order(uuid) to authenticated;
grant execute on function public.app_can_edit_order(uuid) to authenticated;

drop policy if exists sales_orders_select on public.sales_orders;
create policy sales_orders_select on public.sales_orders for select to authenticated
  using (public.app_is_member() and (created_by = auth.uid() or public.app_sees_all_quotes() or public.app_is_logistics()));
drop policy if exists sales_orders_insert on public.sales_orders;
create policy sales_orders_insert on public.sales_orders for insert to authenticated
  with check (public.app_can_plan() and created_by = auth.uid());
drop policy if exists sales_orders_update on public.sales_orders;
create policy sales_orders_update on public.sales_orders for update to authenticated
  using (public.app_is_member() and ((public.app_can_plan() and (created_by = auth.uid() or public.app_edits_all_plans())) or public.app_is_logistics()))
  with check (public.app_is_member() and ((public.app_can_plan() and (created_by = auth.uid() or public.app_edits_all_plans())) or public.app_is_logistics()));
-- no delete: cancel instead

drop policy if exists order_items_select on public.order_items;
create policy order_items_select on public.order_items for select to authenticated using (public.app_can_read_order(order_id));
drop policy if exists order_items_insert on public.order_items;
create policy order_items_insert on public.order_items for insert to authenticated with check (public.app_can_edit_order(order_id));
drop policy if exists order_items_update on public.order_items;
create policy order_items_update on public.order_items for update to authenticated
  using (public.app_can_edit_order(order_id)) with check (public.app_can_edit_order(order_id));
drop policy if exists order_items_delete on public.order_items;
create policy order_items_delete on public.order_items for delete to authenticated using (public.app_can_edit_order(order_id));

drop policy if exists order_stage_history_select on public.order_stage_history;
create policy order_stage_history_select on public.order_stage_history for select to authenticated using (public.app_can_read_order(order_id));

-- Guard: number/owner fixed; Logistics may only change shipment fields and stage;
-- a completed or cancelled order is read-only (except by managers re-opening it).
create or replace function public.app_order_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare full_editor boolean := public.app_can_plan() and (old.created_by = auth.uid() or public.app_edits_all_plans());
        allowed text[] := array['stage', 'shipping_method', 'forwarder_id', 'carrier', 'origin', 'port_of_loading', 'destination',
          'port_of_discharge', 'departure_date', 'eta', 'arrival_date', 'bl_awb_number', 'container_numbers', 'booking_number',
          'shipment_notes', 'updated_at', 'updated_by'];
        k text;
begin
  new.number := old.number; new.created_by := old.created_by; new.created_at := old.created_at;
  if old.stage in ('completed', 'cancelled') and not public.app_edits_all_plans() then
    raise exception 'Order % is %; only a manager can change it.', old.number, old.stage using errcode = '42501';
  end if;
  if not full_editor then
    for k in select key from jsonb_each(to_jsonb(new)) loop
      if not (k = any (allowed)) and (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then
        raise exception 'Logistics can only change shipment details and the stage (tried to change %).', k using errcode = '42501';
      end if;
    end loop;
  end if;
  new.updated_at := now(); new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists sales_orders_guard on public.sales_orders;
create trigger sales_orders_guard before update on public.sales_orders
  for each row execute function public.app_order_guard();

create or replace function public.app_order_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or old.stage is distinct from new.stage then
    insert into public.order_stage_history (order_id, from_stage, to_stage)
    values (new.id, case when tg_op = 'UPDATE' then old.stage end, new.stage);
    if tg_op = 'UPDATE' then
      perform public.app_notify(new.created_by, 'order_stage', 'Order ' || new.number || ': ' || replace(new.stage::text, '_', ' '),
        public.app_actor_name() || ' updated the shipment stage', '/orders/' || new.id);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists sales_orders_history on public.sales_orders;
create trigger sales_orders_history after insert or update of stage on public.sales_orders
  for each row execute function public.app_order_history();
drop trigger if exists sales_orders_audit on public.sales_orders;
create trigger sales_orders_audit after insert or update or delete on public.sales_orders
  for each row execute function public.app_audit();

-- ---------------------------------------------------------------------
-- Documents (metadata table + private storage bucket)
-- ---------------------------------------------------------------------
create table if not exists public.order_documents (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.sales_orders(id) on delete cascade,
  doc_type     text not null check (doc_type in ('commercial_invoice', 'packing_list', 'phytosanitary', 'certificate_of_origin',
                                                 'bl_awb', 'quality_certificate', 'health_certificate', 'other')),
  file_path    text not null unique,         -- <order_id>/<uuid>-<file name>
  file_name    text not null,
  size_bytes   bigint,
  mime_type    text,
  notes        text,
  uploaded_at  timestamptz not null default now(),
  uploaded_by  uuid default auth.uid() references auth.users(id) on delete set null,
  check (split_part(file_path, '/', 1) = order_id::text)
);
create index if not exists order_documents_order_idx on public.order_documents (order_id, doc_type);
alter table public.order_documents enable row level security;

create or replace function public.app_can_upload_order_doc(oid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_can_read_order(oid) and (public.app_is_logistics() or exists (
    select 1 from public.sales_orders o where o.id = oid and public.app_can_plan() and (o.created_by = auth.uid() or public.app_edits_all_plans())))
$$;
revoke all on function public.app_can_upload_order_doc(uuid) from public, anon;
grant execute on function public.app_can_upload_order_doc(uuid) to authenticated;

drop policy if exists order_documents_select on public.order_documents;
create policy order_documents_select on public.order_documents for select to authenticated using (public.app_can_read_order(order_id));
drop policy if exists order_documents_insert on public.order_documents;
create policy order_documents_insert on public.order_documents for insert to authenticated
  with check (public.app_can_upload_order_doc(order_id) and uploaded_by = auth.uid());
drop policy if exists order_documents_delete on public.order_documents;
create policy order_documents_delete on public.order_documents for delete to authenticated using (public.app_edits_all_plans() and public.app_can_read_order(order_id));
drop trigger if exists order_documents_audit on public.order_documents;
create trigger order_documents_audit after insert or delete on public.order_documents
  for each row execute function public.app_audit();

-- Private bucket: 25 MB per file, common document/image types only.
insert into storage.buckets (id, name, public) values ('order-documents', 'order-documents', false)
on conflict (id) do update set public = false;
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
    execute $q$update storage.buckets set file_size_limit = 26214400,
      allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword']
      where id = 'order-documents'$q$;
  end if;
end $$;

drop policy if exists order_docs_read on storage.objects;
create policy order_docs_read on storage.objects for select to authenticated
  using (bucket_id = 'order-documents' and public.app_can_read_order(public.app_try_uuid(split_part(name, '/', 1))));
drop policy if exists order_docs_upload on storage.objects;
create policy order_docs_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'order-documents' and public.app_can_upload_order_doc(public.app_try_uuid(split_part(name, '/', 1))));
drop policy if exists order_docs_delete on storage.objects;
create policy order_docs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'order-documents' and public.app_edits_all_plans() and public.app_can_read_order(public.app_try_uuid(split_part(name, '/', 1))));
-- no update policy: replace a file by uploading a new one

-- ---------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------
create table if not exists public.payments (
  id              uuid primary key default gen_random_uuid(),
  direction       text not null check (direction in ('in', 'out')),
  kind            text not null check (kind in ('advance', 'balance', 'full', 'installment', 'supplier', 'freight', 'customs', 'expense', 'other')),
  order_id        uuid references public.sales_orders(id) on delete set null,
  company_id      uuid references public.companies(id) on delete set null,
  supplier_id     uuid references public.suppliers(id) on delete set null,
  forwarder_id    uuid references public.freight_forwarders(id) on delete set null,
  description     text,
  amount_due      numeric not null check (amount_due > 0),
  currency        text not null check (currency ~ '^[A-Z]{3}$'),
  due_date        date,
  amount_paid     numeric not null default 0 check (amount_paid >= 0),
  paid_date       date,
  method          text check (method in ('bank_transfer', 'letter_of_credit', 'cash', 'cheque', 'card', 'other')),
  reference       text,
  confirmed_by    uuid references auth.users(id) on delete set null,
  confirmed_at    timestamptz,
  cancelled_at    timestamptz,
  notes           text,
  created_at      timestamptz not null default now(),
  created_by      uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users(id) on delete set null,
  check (amount_paid = 0 or (paid_date is not null and reference is not null and method is not null))
);
create index if not exists payments_order_idx on public.payments (order_id);
create index if not exists payments_due_idx on public.payments (direction, due_date) where cancelled_at is null;
alter table public.payments enable row level security;

drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select to authenticated
  using (public.app_is_finance_or_manager()
         or (order_id is not null and exists (select 1 from public.sales_orders o where o.id = order_id and o.created_by = auth.uid())));
drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments for insert to authenticated with check (public.app_is_finance_or_manager());
drop policy if exists payments_update on public.payments;
create policy payments_update on public.payments for update to authenticated
  using (public.app_is_finance_or_manager()) with check (public.app_is_finance_or_manager());
-- no delete: cancel instead

create or replace function public.app_payment_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then new.created_by := old.created_by; new.created_at := old.created_at; end if;
  if new.amount_paid > 0 and (tg_op = 'INSERT' or new.amount_paid is distinct from old.amount_paid or new.paid_date is distinct from old.paid_date) then
    new.confirmed_by := auth.uid(); new.confirmed_at := now();
  elsif new.amount_paid = 0 then
    new.confirmed_by := null; new.confirmed_at := null; new.paid_date := null;
  end if;
  new.updated_at := now(); new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists payments_guard on public.payments;
create trigger payments_guard before insert or update on public.payments
  for each row execute function public.app_payment_guard();
drop trigger if exists payments_audit on public.payments;
create trigger payments_audit after insert or update or delete on public.payments
  for each row execute function public.app_audit();

insert into public.app_migrations (version) values ('0009_operations') on conflict do nothing;

commit;

select id, public from storage.buckets where id = 'order-documents';
