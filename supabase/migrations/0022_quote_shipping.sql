-- =====================================================================
-- MS El-brancy Group platform — Migration 0022: shipping on quotations
-- ---------------------------------------------------------------------
-- WHAT THIS DOES (additive only, nothing is deleted):
--   A quotation can now say HOW it ships and WHAT the freight costs:
--     shipping_mode      sea / air / land            (any Incoterm except EXW)
--     freight_basis      per_kg / per_container / total
--     freight_rate       the amount typed, in freight_currency
--     freight_currency   e.g. USD
--     freight_fx         1 freight_currency = ? quotation currency (when different)
--     freight_containers how many containers (per_container only)
--     freight_display    'line'      = printed as its own line, added to the total
--                        'in_prices' = spread into each product's price
--     freight_total      the freight in the quotation currency (worked out by the app)
--     shipping_rate_id   the saved rate it came from (Shipping & Logistics), if any
--   quotation_items.freight_per_ton = the freight share already inside
--   that line's price (only when freight_display = 'in_prices'), so the
--   app can show the product price and the freight separately again.
--
-- Security: these are new columns on existing tables, so the existing
-- quotation RLS policies (owner / managers) protect them already.
--
-- Requires 0021_price_per_kg_pallet. Safe to run more than once.
-- =====================================================================

begin;

do $$ begin
  if not exists (select 1 from public.app_migrations where version = '0021_price_per_kg_pallet') then
    raise exception 'Run 0021_price_per_kg_pallet first.';
  end if;
end $$;

alter table public.quotations
  add column if not exists shipping_mode      text,
  add column if not exists freight_basis      text,
  add column if not exists freight_rate       numeric,
  add column if not exists freight_currency   text,
  add column if not exists freight_fx         numeric,
  add column if not exists freight_containers numeric,
  add column if not exists freight_display    text not null default 'line',
  add column if not exists freight_total      numeric,
  add column if not exists shipping_rate_id   uuid references public.shipping_rates(id) on delete set null;

alter table public.quotations drop constraint if exists quotations_shipping_chk;
alter table public.quotations add constraint quotations_shipping_chk check (
  (shipping_mode is null or shipping_mode in ('sea', 'air', 'land'))
  and (freight_basis is null or freight_basis in ('per_kg', 'per_container', 'total'))
  and freight_display in ('line', 'in_prices')
  and (freight_rate is null or freight_rate > 0)
  and (freight_fx is null or freight_fx > 0)
  and (freight_total is null or freight_total >= 0)
  and (freight_currency is null or freight_currency ~ '^[A-Z]{3}$')
  and (freight_containers is null or freight_containers > 0)
  -- a freight amount always says what it is per, and in which currency
  and (freight_basis is null or (freight_rate is not null and freight_currency is not null))
  and (freight_basis is distinct from 'per_container' or freight_containers is not null)
);

alter table public.quotation_items
  add column if not exists freight_per_ton numeric;
alter table public.quotation_items drop constraint if exists quotation_items_freight_chk;
alter table public.quotation_items add constraint quotation_items_freight_chk check (freight_per_ton is null or freight_per_ton >= 0);

insert into public.app_migrations (version) values ('0022_quote_shipping') on conflict do nothing;

commit;

select 'Shipping on quotations installed' as status;
