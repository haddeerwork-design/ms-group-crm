-- =====================================================================
-- MS El-brancy Group platform — Migration 0015: Prime Roots terms
-- ---------------------------------------------------------------------
-- WHAT THIS DOES (additive only):
--   Prime Roots quotations get their own default "Terms & Conditions"
--   (sections: Terms & Conditions · Bulk Discounts & Packaging · Special
--   Offer), in English and Arabic, and their own default validity (5 days).
--   All editable in Company Settings. A line starting with "## " is printed
--   as a section heading.
--   {currency} and {validity_days} are filled in for each quotation.
--
-- Requires 0014_quote_language_fx. Safe to run more than once.
-- =====================================================================

begin;

do $$ begin
  if not exists (select 1 from public.app_migrations where version = '0014_quote_language_fx') then
    raise exception 'Run 0014_quote_language_fx first.';
  end if;
end $$;

alter table public.company_settings add column if not exists prime_roots_terms text[];
alter table public.company_settings add column if not exists prime_roots_terms_ar text[];
alter table public.company_settings add column if not exists prime_roots_validity_days int check (prime_roots_validity_days between 1 and 365);

update public.company_settings set
  prime_roots_terms = coalesce(prime_roots_terms, array[
    '## Terms & Conditions',
    'All prices are in {currency}, including standard packaging.',
    'Quotation is valid for {validity_days} days.',
    'Delivery fees depend on quantity and location.',
    'Lead time: 7–10 working days from order confirmation.',
    'Payment terms are subject to mutual agreement.',
    '## Bulk Discounts & Packaging',
    'Special discounts available for bulk orders.',
    'Shrink packs of 12 jars of the same flavor are available.',
    '## Special Offer',
    'Prime Roots Assorted Box – Includes all 4 flavors.',
    'EGP 750 instead of EGP 800.'
  ]),
  -- Arabic translation of the same terms
  prime_roots_terms_ar = coalesce(prime_roots_terms_ar, array[
    '## الشروط والأحكام',
    'جميع الأسعار بـ {currency} وتشمل التعبئة القياسية.',
    'عرض السعر ساري لمدة {validity_days} أيام.',
    'رسوم التوصيل حسب الكمية والمكان.',
    'مدة التوريد: من 7 إلى 10 أيام عمل من تأكيد الطلب.',
    'شروط الدفع حسب الاتفاق بين الطرفين.',
    '## خصومات الكميات والتعبئة',
    'تتوفر خصومات خاصة للطلبات بالجملة.',
    'متاح عبوات شرنك 12 برطمان من نفس النكهة.',
    '## عرض خاص',
    'بوكس Prime Roots المتنوع – يضم النكهات الأربعة.',
    '750 جنيه بدلاً من 800 جنيه.'
  ]),
  prime_roots_validity_days = coalesce(prime_roots_validity_days, 5)
where id = 1;

insert into public.app_migrations (version) values ('0015_prime_roots_terms') on conflict do nothing;

commit;

select 'Prime Roots terms installed' as status;
