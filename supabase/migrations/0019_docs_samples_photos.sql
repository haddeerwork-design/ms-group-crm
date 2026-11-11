-- =====================================================================
-- MS El-brancy Group platform — Migration 0019: Shipment document checklist,
-- samples, product photos
-- ---------------------------------------------------------------------
-- WHAT THIS DOES (additive only):
--   1. order_doc_waivers: mark a document as "not needed" for one order
--      (e.g. no health certificate for this market). Everything else on the
--      checklist comes from the documents already uploaded to the order.
--   2. samples: samples sent to customers — what, when, courier/tracking,
--      and the customer's feedback. Same visibility as the company.
--   3. products.image_path + a public "product-images" bucket (photos for the
--      product catalog; 5 MB, JPG/PNG/WebP). Only catalog managers upload.
--
-- Requires 0018_clean_price_list. Safe to run more than once.
-- =====================================================================

begin;

do $$ begin
  if not exists (select 1 from public.app_migrations where version = '0018_clean_price_list') then
    raise exception 'Run 0018_clean_price_list first.';
  end if;
end $$;

-- 1. Documents that are not needed for an order ---------------------------
create table if not exists public.order_doc_waivers (
  order_id   uuid not null references public.sales_orders(id) on delete cascade,
  doc_type   text not null check (doc_type in ('commercial_invoice', 'packing_list', 'phytosanitary', 'certificate_of_origin',
                                               'bl_awb', 'quality_certificate', 'health_certificate', 'other')),
  waived_by  uuid not null default auth.uid() references auth.users(id),
  waived_at  timestamptz not null default now(),
  primary key (order_id, doc_type)
);
alter table public.order_doc_waivers enable row level security;
drop policy if exists order_doc_waivers_select on public.order_doc_waivers;
create policy order_doc_waivers_select on public.order_doc_waivers for select to authenticated using (public.app_can_read_order(order_id));
drop policy if exists order_doc_waivers_insert on public.order_doc_waivers;
create policy order_doc_waivers_insert on public.order_doc_waivers for insert to authenticated
  with check (public.app_can_upload_order_doc(order_id) and waived_by = auth.uid());
drop policy if exists order_doc_waivers_delete on public.order_doc_waivers;
create policy order_doc_waivers_delete on public.order_doc_waivers for delete to authenticated using (public.app_can_upload_order_doc(order_id));
drop trigger if exists order_doc_waivers_audit on public.order_doc_waivers;
create trigger order_doc_waivers_audit after insert or delete on public.order_doc_waivers
  for each row execute function public.app_audit();

-- 2. Samples ----------------------------------------------------------------
create table if not exists public.samples (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  product_id     uuid references public.products(id),
  product_name   text not null check (length(trim(product_name)) between 1 and 200),
  quantity       text,
  sent_date      date not null default current_date,
  courier        text,
  tracking_no    text,
  status         text not null default 'sent' check (status in ('preparing', 'sent', 'delivered', 'feedback_positive', 'feedback_negative', 'no_answer')),
  feedback       text,
  feedback_date  date,
  notes          text,
  created_by     uuid not null default auth.uid() references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists samples_company_idx on public.samples (company_id, sent_date desc);
alter table public.samples enable row level security;
drop policy if exists samples_select on public.samples;
create policy samples_select on public.samples for select to authenticated using (public.app_can_read_company(company_id));
drop policy if exists samples_insert on public.samples;
create policy samples_insert on public.samples for insert to authenticated
  with check (public.app_can_edit_company(company_id) and created_by = auth.uid());
drop policy if exists samples_update on public.samples;
create policy samples_update on public.samples for update to authenticated
  using (public.app_can_edit_company(company_id)) with check (public.app_can_edit_company(company_id));
drop policy if exists samples_delete on public.samples;
create policy samples_delete on public.samples for delete to authenticated
  using (public.app_can_edit_company(company_id) and (created_by = auth.uid() or public.app_edits_all_plans()));
drop trigger if exists samples_touch on public.samples;
create trigger samples_touch before update on public.samples for each row execute function public.app_set_updated_at();
drop trigger if exists samples_audit on public.samples;
create trigger samples_audit after insert or update or delete on public.samples for each row execute function public.app_audit();

-- 3. Product photos ----------------------------------------------------------
alter table public.products add column if not exists image_path text;

insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
    execute $q$update storage.buckets set file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
      where id = 'product-images'$q$;
  end if;
end $$;
drop policy if exists product_images_read on storage.objects;
create policy product_images_read on storage.objects for select to authenticated using (bucket_id = 'product-images');
drop policy if exists product_images_insert on storage.objects;
create policy product_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.app_can_manage_catalog());
drop policy if exists product_images_update on storage.objects;
create policy product_images_update on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.app_can_manage_catalog());
drop policy if exists product_images_delete on storage.objects;
create policy product_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.app_can_manage_catalog());

insert into public.app_migrations (version) values ('0019_docs_samples_photos') on conflict do nothing;

commit;
