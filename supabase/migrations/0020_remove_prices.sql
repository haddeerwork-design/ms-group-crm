-- =====================================================================
-- MS El-brancy Group platform — Migration 0020: Remove prices from the list
-- ---------------------------------------------------------------------
-- WHAT THIS DOES (nothing is really deleted):
--   1. product_prices.removed_at / removed_by: a removed price disappears
--      from the price list, the calculator and new quotations, but quotations
--      already made with it keep working, and it can be brought back (Undo).
--   2. remove_price_line(product, packaging, variety): removes every version
--      of that one line of the price list. Super Admin / Sales Manager only.
--   3. restore_prices(ids): brings removed prices back (the Undo button).
--   4. The price list view ignores removed prices.
--   5. Removing / restoring is written to the Activity log.
--
-- Requires 0019_docs_samples_photos. Safe to run more than once.
-- =====================================================================

begin;

do $$ begin
  if not exists (select 1 from public.app_migrations where version = '0019_docs_samples_photos') then
    raise exception 'Run 0019_docs_samples_photos first.';
  end if;
end $$;

-- 1. Columns ------------------------------------------------------------------
alter table public.product_prices add column if not exists removed_at timestamptz;
alter table public.product_prices add column if not exists removed_by uuid references auth.users(id) on delete set null;

-- 2. Remove one line of the price list (all its versions) ----------------------
create or replace function public.remove_price_line(p_product uuid, p_packaging uuid, p_variety text)
returns uuid[] language plpgsql security definer set search_path = public as $$
declare ids uuid[];
begin
  if not public.app_can_manage_prices() then
    raise exception 'Only the Super Admin or the Sales Manager can remove prices.' using errcode = '42501';
  end if;
  with r as (
    update public.product_prices
       set removed_at = now(), removed_by = auth.uid()
     where product_id = p_product
       and coalesce(packaging_id::text, '') = coalesce(p_packaging::text, '')
       and lower(trim(coalesce(variety, ''))) = lower(trim(coalesce(p_variety, '')))
       and removed_at is null
    returning id)
  select coalesce(array_agg(id), '{}') into ids from r;
  return ids;
end $$;

-- 3. Undo ------------------------------------------------------------------------
create or replace function public.restore_prices(p_ids uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.app_can_manage_prices() then
    raise exception 'Only the Super Admin or the Sales Manager can restore prices.' using errcode = '42501';
  end if;
  update public.product_prices set removed_at = null, removed_by = null where id = any(p_ids) and removed_at is not null;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.remove_price_line(uuid, uuid, text) from public, anon;
revoke all on function public.restore_prices(uuid[]) from public, anon;
grant execute on function public.remove_price_line(uuid, uuid, text) to authenticated;
grant execute on function public.restore_prices(uuid[]) to authenticated;

-- 4. The price list without removed prices (same columns as before) -------------
create or replace view public.product_price_list as
select l.id, l.product_id, l.packaging_id, l.variety, l.incoterm, l.destination,
       l.net_weight_kg, l.cartons_per_pallet, l.sell_currency, l.price_per_ton,
       l.valid_from, l.valid_until, l.source, l.created_at,
       l.price_basis, l.unit_price, l.unit_label
  from (select distinct on (p.product_id, coalesce(p.packaging_id::text, ''), lower(trim(coalesce(p.variety, ''))))
               p.*
          from public.product_prices p
         where public.app_is_member() and p.removed_at is null
         order by p.product_id, coalesce(p.packaging_id::text, ''), lower(trim(coalesce(p.variety, ''))), p.created_at desc) l
 where not (l.source = 'imported'
            and exists (select 1 from public.product_prices x
                         where x.product_id = l.product_id and x.source <> 'imported' and x.removed_at is null));
revoke all on public.product_price_list from anon;
grant select on public.product_price_list to authenticated;

-- 5. Activity log: removing / restoring are updates ---------------------------------
drop trigger if exists product_prices_audit on public.product_prices;
create trigger product_prices_audit after insert or update on public.product_prices
  for each row execute function public.app_audit();

insert into public.app_migrations (version) values ('0020_remove_prices') on conflict do nothing;

commit;
