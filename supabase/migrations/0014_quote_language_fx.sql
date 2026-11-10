-- =====================================================================
-- MS El-brancy Group platform — Migration 0014: Quotation language & currency
-- ---------------------------------------------------------------------
-- WHAT THIS DOES (additive only, nothing is deleted):
--   1. A quotation can be printed in English or Arabic.
--      Arabic default policy lines and production time are added to
--      Company Settings (editable there). Products can have an Arabic name.
--   2. Each quotation line remembers the price as it was typed and in which
--      currency (e.g. 9,000 EGP per ton), plus the exchange rate used to show
--      it in the quotation's currency (e.g. USD). Rates come from Pricing →
--      Exchange rates, or are typed by the user; none are invented here.
--
-- Requires 0013_brands_unit_prices. Safe to run more than once.
-- =====================================================================

begin;

do $$ begin
  if not exists (select 1 from public.app_migrations where version = '0013_brands_unit_prices') then
    raise exception 'Run 0013_brands_unit_prices first.';
  end if;
end $$;

-- 1. Language ------------------------------------------------------------
alter table public.quotations add column if not exists language text not null default 'en';
do $$ begin
  alter table public.quotations add constraint quotations_language_chk check (language in ('en', 'ar'));
exception when duplicate_object then null; end $$;

alter table public.products add column if not exists name_ar text check (name_ar is null or length(trim(name_ar)) between 1 and 120);

alter table public.company_settings add column if not exists quotation_policy_ar text[];
alter table public.company_settings add column if not exists quotation_production_time_ar text;
update public.company_settings set
  -- Arabic translation of the default English policy lines (same placeholders)
  quotation_policy_ar = coalesce(quotation_policy_ar, array[
    'هذه الأسعار شاملة (الأكياس - الكراتين - الشهادات والتحاليل الخاصة بالشحنة).',
    'عرض السعر هذا ساري لمدة {validity_days} أيام.',
    'أسعار الشحن غير ثابتة، لذلك عرض السعر هذا {incoterm} حتى تأكيد الطلب.',
    'يتم التنفيذ خلال {production_time} من تاريخ سداد الدفعة الأولى.'
  ]),
  quotation_production_time_ar = coalesce(quotation_production_time_ar, 'من 7 إلى 10 أيام')
where id = 1;

-- 2. Price as typed + exchange rate ------------------------------------------
alter table public.quotation_items
  add column if not exists input_currency text check (input_currency ~ '^[A-Z]{3}$'),
  add column if not exists input_price    numeric check (input_price > 0),
  add column if not exists fx_rate        numeric check (fx_rate > 0),   -- 1 input_currency = fx_rate quotation currency
  add column if not exists fx_source      text,
  add column if not exists fx_rate_at     timestamptz;

insert into public.app_migrations (version) values ('0014_quote_language_fx') on conflict do nothing;

commit;

select 'Quotation language and currency installed' as status;
