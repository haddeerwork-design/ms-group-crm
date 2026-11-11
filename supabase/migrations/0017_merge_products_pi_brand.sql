-- =====================================================================
-- MS El-brancy Group platform — Migration 0017: Merge duplicate products,
-- Prime Roots letterhead on proforma invoices
-- ---------------------------------------------------------------------
-- WHAT THIS DOES (additive only — nothing is deleted):
--   1. merge_products(keep, others[]): moves everything that points to the
--      duplicate products (packaging, prices, plans, quotation / proforma /
--      order lines, supplier prices, deals) to the product you keep, adds
--      their varieties to it, fills its empty fields, then ARCHIVES the
--      duplicates with a note "Merged into …". Price history stays complete.
--      Only the Super Admin or the Sales Manager can run it.
--   2. proforma_invoices.brand: a proforma can be printed on the
--      MS El-brancy Group or the Prime Roots letterhead (like quotations).
--
-- Requires 0016_selling_prices. Safe to run more than once.
-- =====================================================================

begin;

do $$ begin
  if not exists (select 1 from public.app_migrations where version = '0016_selling_prices') then
    raise exception 'Run 0016_selling_prices first.';
  end if;
end $$;

-- 1. Merge duplicate products ---------------------------------------------
create or replace function public.merge_products(keep uuid, others uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare
  k public.products%rowtype;
  o public.products%rowtype;
  n integer := 0;
begin
  if not (public.app_is_super_admin() or public.app_can_manage_prices()) then
    raise exception 'Only the Super Admin or the Sales Manager can merge products.' using errcode = '42501';
  end if;
  select * into k from public.products where id = keep and archived_at is null;
  if not found then raise exception 'The product to keep was not found (or is archived).'; end if;
  if others is null or array_length(others, 1) is null then raise exception 'Choose at least one duplicate.'; end if;
  if keep = any(others) then raise exception 'The product to keep cannot also be a duplicate.'; end if;

  for o in select * from public.products where id = any(others) loop
    if o.archived_at is not null then continue; end if;
    -- packaging moves over; the kept product's default stays the default
    update public.product_packaging set product_id = keep, is_default = false where product_id = o.id;
    update public.product_prices        set product_id = keep where product_id = o.id;
    update public.container_plan_items  set product_id = keep where product_id = o.id;
    update public.quotation_items       set product_id = keep where product_id = o.id;
    update public.proforma_items        set product_id = keep where product_id = o.id;
    update public.order_items           set product_id = keep where product_id = o.id;
    update public.supplier_prices       set product_id = keep where product_id = o.id;
    update public.opportunities         set product_id = keep where product_id = o.id;

    update public.products p set
      varieties = (select coalesce(array_agg(v order by ord), '{}') from (
                     select distinct on (lower(v)) v, ord from (
                       select v, ord from unnest(p.varieties) with ordinality a(v, ord)
                       union all select v, 1000 + ord from unnest(o.varieties) with ordinality b(v, ord)) x
                     order by lower(v), ord) y),
      name_ar             = coalesce(nullif(trim(p.name_ar), ''), o.name_ar),
      specifications      = coalesce(nullif(trim(p.specifications), ''), o.specifications),
      size_caliber        = coalesce(nullif(trim(p.size_caliber), ''), o.size_caliber),
      storage_temperature = coalesce(nullif(trim(p.storage_temperature), ''), o.storage_temperature),
      shelf_life          = coalesce(nullif(trim(p.shelf_life), ''), o.shelf_life),
      season_start_month  = coalesce(p.season_start_month, o.season_start_month),
      season_end_month    = case when p.season_start_month is null then o.season_end_month else p.season_end_month end,
      availability        = coalesce(p.availability, o.availability),
      legacy_key          = coalesce(p.legacy_key, o.legacy_key)
    where p.id = keep;

    update public.products
       set archived_at = now(),
           legacy_key  = null,
           notes = concat_ws(' · ', nullif(trim(notes), ''), 'Merged into ' || k.name || ' on ' || to_char(now(), 'YYYY-MM-DD'))
     where id = o.id;
    n := n + 1;
  end loop;

  -- keep exactly one default packaging on the kept product
  if not exists (select 1 from public.product_packaging where product_id = keep and is_default and archived_at is null) then
    update public.product_packaging set is_default = true
     where id = (select id from public.product_packaging where product_id = keep and archived_at is null order by created_at limit 1);
  end if;
  return n;
end $$;

revoke all on function public.merge_products(uuid, uuid[]) from public, anon;
grant execute on function public.merge_products(uuid, uuid[]) to authenticated;

-- 2. Letterhead on proforma invoices --------------------------------------
alter table public.proforma_invoices add column if not exists brand text not null default 'ms_elbrancy';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'proforma_invoices_brand_chk') then
    alter table public.proforma_invoices add constraint proforma_invoices_brand_chk check (brand in ('ms_elbrancy', 'prime_roots'));
  end if;
end $$;
-- proformas made from a Prime Roots quotation keep its letterhead (also issued ones: only the letterhead changes)
select set_config('app.pi_status_change', 'on', true);
update public.proforma_invoices pi set brand = q.brand
  from public.quotations q
 where pi.quotation_id = q.id and q.brand = 'prime_roots' and pi.brand <> 'prime_roots';
select set_config('app.pi_status_change', 'off', true);

insert into public.app_migrations (version) values ('0017_merge_products_pi_brand') on conflict do nothing;

commit;
