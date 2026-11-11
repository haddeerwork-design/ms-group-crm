-- =====================================================================
-- MS El-brancy Group platform — Migration 0018: A clean price list
-- ---------------------------------------------------------------------
-- WHAT THIS DOES (nothing is deleted):
--   1. Merges duplicate products: same type and the same name once plurals,
--      "(from CRM …)", "Frozen"/"IQF"/"Fresh" and "Jam" are ignored
--      (e.g. "Avocado" + "Avocados" + "Avocado (from CRM p7)").
--      The one kept: no "(from CRM)" in its name, then the most packing.
--      Packing, prices, lines and deals move to it; the others are ARCHIVED
--      with the note "Merged into …" (same as Products → Duplicates).
--   2. The price list shows ONE current price per product + variety + packing
--   (the newest one), instead of one per Incoterm as well. Older and other
--   versions stay in the price history (Pricing → Calculator).
--   3. Prices imported from the old CRM are hidden once the product has a
--   price saved in the new system (they stay in the history).
--
-- Requires 0017_merge_products_pi_brand. Safe to run more than once.
-- =====================================================================

begin;

do $$ begin
  if not exists (select 1 from public.app_migrations where version = '0017_merge_products_pi_brand') then
    raise exception 'Run 0017_merge_products_pi_brand first.';
  end if;
end $$;


-- 1. Merge duplicate products ---------------------------------------------
-- the merge itself, without the role check, so this migration can run it
create or replace function public.app_merge_products_core(keep uuid, others uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare k public.products%rowtype; o public.products%rowtype; n integer := 0;
begin
  select * into k from public.products where id = keep and archived_at is null;
  if not found then raise exception 'The product to keep was not found (or is archived).'; end if;
  for o in select * from public.products where id = any(others) and id <> keep and archived_at is null loop
    -- the old-CRM link moves to the kept product only if it has none; otherwise it stays on the
    -- archived one, so re-running the import never brings the duplicate back
    if o.legacy_key is not null and (select legacy_key from public.products where id = keep) is null then
      update public.products set legacy_key = null where id = o.id;
      update public.products set legacy_key = o.legacy_key where id = keep;
      o.legacy_key := null;
    end if;
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
      availability        = coalesce(p.availability, o.availability)
    where p.id = keep;
    update public.products
       set archived_at = now(),
           notes = concat_ws(' · ', nullif(trim(notes), ''), 'Merged into ' || k.name || ' on ' || to_char(now(), 'YYYY-MM-DD'))
     where id = o.id;
    n := n + 1;
  end loop;
  if not exists (select 1 from public.product_packaging where product_id = keep and is_default and archived_at is null) then
    update public.product_packaging set is_default = true
     where id = (select id from public.product_packaging where product_id = keep and archived_at is null order by created_at limit 1);
  end if;
  return n;
end $$;
revoke all on function public.app_merge_products_core(uuid, uuid[]) from public, anon, authenticated;

-- the button in Products → Duplicates: checks the role, then merges
create or replace function public.merge_products(keep uuid, others uuid[])
returns integer language plpgsql security definer set search_path = public as $$
begin
  if not (public.app_is_super_admin() or public.app_can_manage_prices()) then
    raise exception 'Only the Super Admin or the Sales Manager can merge products.' using errcode = '42501';
  end if;
  if others is null or array_length(others, 1) is null then raise exception 'Choose at least one duplicate.'; end if;
  if keep = any(others) then raise exception 'The product to keep cannot also be a duplicate.'; end if;
  return public.app_merge_products_core(keep, others);
end $$;
revoke all on function public.merge_products(uuid, uuid[]) from public, anon;
grant execute on function public.merge_products(uuid, uuid[]) to authenticated;

-- "Avocados", "avocado (from CRM p7)", "Frozen Avocado" -> "avocado"
create or replace function public.app_product_key(n text)
returns text language sql immutable as $$
  select string_agg(case when w ~ 'ies$' then regexp_replace(w, 'ies$', 'y')
                         when w ~ 'oes$' then regexp_replace(w, 'oes$', 'o')
                         when w ~ '[^s]s$' then regexp_replace(w, 's$', '')
                         else w end, ' ' order by i)
    from unnest(string_to_array(trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
           lower(coalesce(n, '')), '\(from crm[^)]*\)', '', 'g'), '^(frozen|iqf|fresh)\s+', ''), '\s+jam$', ''),
           '[^a-z0-9؀-ۿ]+', ' ', 'g')), ' ')) with ordinality t(w, i)
   where w <> ''
$$;

do $$ declare g record; begin
  for g in
    select (array_agg(p.id order by (p.name ~* '\(from crm') ,
                      (select count(*) from public.product_packaging k where k.product_id = p.id and k.archived_at is null) desc,
                      cardinality(p.varieties) desc, p.created_at))[1] as keep,
           array_agg(p.id) as ids
      from public.products p
     where p.archived_at is null
     group by p.product_type, public.app_product_key(p.name)
    having count(*) > 1
  loop
    perform public.app_merge_products_core(g.keep, array_remove(g.ids, g.keep));
  end loop;
end $$;

-- 2. One current price per product + variety + packing ---------------------
create or replace view public.product_price_list as
select l.id, l.product_id, l.packaging_id, l.variety, l.incoterm, l.destination,
       l.net_weight_kg, l.cartons_per_pallet, l.sell_currency, l.price_per_ton,
       l.valid_from, l.valid_until, l.source, l.created_at,
       l.price_basis, l.unit_price, l.unit_label
  from (select distinct on (p.product_id, coalesce(p.packaging_id::text, ''), lower(trim(coalesce(p.variety, ''))))
               p.*
          from public.product_prices p
         where public.app_is_member()
         order by p.product_id, coalesce(p.packaging_id::text, ''), lower(trim(coalesce(p.variety, ''))), p.created_at desc) l
 where not (l.source = 'imported'
            and exists (select 1 from public.product_prices x where x.product_id = l.product_id and x.source <> 'imported'));
revoke all on public.product_price_list from anon;
grant select on public.product_price_list to authenticated;

insert into public.app_migrations (version) values ('0018_clean_price_list') on conflict do nothing;

commit;

-- What was merged today (archived, not deleted):
select name as merged_product, notes from public.products
 where notes like '%Merged into%' || to_char(now(), 'YYYY-MM-DD') || '%' order by name;
