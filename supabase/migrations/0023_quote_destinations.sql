-- =====================================================================
-- MS El-brancy Group platform — Migration 0023: one quotation, many destinations
-- ---------------------------------------------------------------------
-- WHAT THIS DOES (additive only, nothing is deleted):
--   A quotation can price the same products for more than one port or
--   airport. The first destination stays on the quotation itself (as
--   before); every OTHER destination is a row in quotation_destinations,
--   each with its own Incoterm, shipping mode and freight.
--     freight_per_ton = that destination's freight per net ton in the
--                       quotation currency (worked out by the app), added
--                       to each product's price for that destination.
--   quotations.destinations_layout = how the PDF shows them:
--     'columns' = one table, a price column per destination
--     'tables'  = one table section per destination
--   Sent versions keep their destinations (set_quotation_status updated).
--
-- Security: same rules as quotation lines — read if you can read the
-- quotation, change only while it is a draft/revision you may edit.
--
-- Requires 0022_quote_shipping. Safe to run more than once.
-- =====================================================================

begin;

do $$ begin
  if not exists (select 1 from public.app_migrations where version = '0022_quote_shipping') then
    raise exception 'Run 0022_quote_shipping first.';
  end if;
end $$;

alter table public.quotations add column if not exists destinations_layout text not null default 'columns';
alter table public.quotations drop constraint if exists quotations_dest_layout_chk;
alter table public.quotations add constraint quotations_dest_layout_chk check (destinations_layout in ('columns', 'tables'));

create table if not exists public.quotation_destinations (
  id                 uuid primary key default gen_random_uuid(),
  quotation_id       uuid not null references public.quotations(id) on delete cascade,
  sort_order         int not null default 0,
  destination        text not null check (length(trim(destination)) > 0),
  incoterm           public.app_incoterm,
  shipping_mode      text check (shipping_mode in ('sea', 'air', 'land')),
  freight_basis      text check (freight_basis in ('per_kg', 'per_container', 'total')),
  freight_rate       numeric check (freight_rate > 0),
  freight_currency   text check (freight_currency ~ '^[A-Z]{3}$'),
  freight_fx         numeric check (freight_fx > 0),
  freight_containers numeric check (freight_containers > 0),
  freight_total      numeric check (freight_total >= 0),
  freight_per_ton    numeric check (freight_per_ton >= 0),
  shipping_rate_id   uuid references public.shipping_rates(id) on delete set null,
  check (freight_basis is null or (freight_rate is not null and freight_currency is not null)),
  check (freight_basis is distinct from 'per_container' or freight_containers is not null)
);
create index if not exists quotation_destinations_quote_idx on public.quotation_destinations (quotation_id, sort_order);

alter table public.quotation_destinations enable row level security;
drop policy if exists quotation_destinations_select on public.quotation_destinations;
create policy quotation_destinations_select on public.quotation_destinations for select to authenticated using (public.app_can_read_quote(quotation_id));
drop policy if exists quotation_destinations_insert on public.quotation_destinations;
create policy quotation_destinations_insert on public.quotation_destinations for insert to authenticated with check (public.app_can_edit_quote(quotation_id));
drop policy if exists quotation_destinations_update on public.quotation_destinations;
create policy quotation_destinations_update on public.quotation_destinations for update to authenticated
  using (public.app_can_edit_quote(quotation_id)) with check (public.app_can_edit_quote(quotation_id));
drop policy if exists quotation_destinations_delete on public.quotation_destinations;
create policy quotation_destinations_delete on public.quotation_destinations for delete to authenticated using (public.app_can_edit_quote(quotation_id));

-- Sent versions now include the destinations (same function, one addition).
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
         from public.quotation_items i where i.quotation_id = qid),
      -- 0023: the other destinations are kept with the sent version too
      'destinations',
      (select coalesce(jsonb_agg(to_jsonb(d) order by d.sort_order), '[]'::jsonb)
         from public.quotation_destinations d where d.quotation_id = qid));
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

insert into public.app_migrations (version) values ('0023_quote_destinations') on conflict do nothing;

commit;

select 'Several destinations per quotation installed' as status;
