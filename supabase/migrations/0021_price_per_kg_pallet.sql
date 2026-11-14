-- =====================================================================
-- MS El-brancy Group platform — Migration 0021: prices per kg and per pallet
-- ---------------------------------------------------------------------
-- WHAT THIS DOES (additive only):
--   A quotation line (and a saved price) can now be priced
--     per ton  (as before)         price_basis = 'ton'
--     per carton / jar / pack      price_basis = 'unit'   (as before)
--     per kg                       price_basis = 'kg'     (new)
--     per pallet                   price_basis = 'pallet' (new, needs kg per carton + cartons per pallet)
--   The per-ton equivalent is still saved on every line, so totals,
--   orders and reports keep working exactly as before.
--
-- Requires 0020_remove_prices. Safe to run more than once.
-- =====================================================================

begin;

do $$ begin
  if not exists (select 1 from public.app_migrations where version = '0020_remove_prices') then
    raise exception 'Run 0020_remove_prices first.';
  end if;
end $$;

alter table public.quotation_items drop constraint if exists quotation_items_basis_chk;
alter table public.quotation_items add constraint quotation_items_basis_chk check (
  price_basis in ('ton', 'unit', 'kg', 'pallet') and (
    price_basis = 'ton'
    or (price_basis = 'kg' and coalesce(unit_price, 0) > 0)
    or (price_basis = 'unit' and coalesce(unit_price, 0) > 0 and coalesce(net_weight_kg, 0) > 0)
    or (price_basis = 'pallet' and coalesce(unit_price, 0) > 0 and coalesce(net_weight_kg, 0) > 0 and coalesce(cartons_per_pallet, 0) > 0)));

alter table public.product_prices drop constraint if exists product_prices_basis_chk;
alter table public.product_prices add constraint product_prices_basis_chk check (
  price_basis in ('ton', 'unit', 'kg', 'pallet') and (
    price_basis = 'ton'
    or (price_basis = 'kg' and coalesce(unit_price, 0) > 0)
    or (price_basis = 'unit' and coalesce(unit_price, 0) > 0 and coalesce(net_weight_kg, 0) > 0)
    or (price_basis = 'pallet' and coalesce(unit_price, 0) > 0 and coalesce(net_weight_kg, 0) > 0 and coalesce(cartons_per_pallet, 0) > 0)));

insert into public.app_migrations (version) values ('0021_price_per_kg_pallet') on conflict do nothing;

commit;
