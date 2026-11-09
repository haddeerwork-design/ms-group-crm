-- =====================================================================
-- MS El-brancy Group platform — Migration 0010: Market research
-- ---------------------------------------------------------------------
-- WHAT THIS DOES (additive only, nothing is deleted):
--   1. research_leads: potential buyers found while researching markets,
--      each with a source and a verification status:
--        Unverified lead  → Potential buyer → Verified importer
--      "Verified importer" REQUIRES a source link (evidence), so
--      unverified research is never shown as confirmed import activity.
--   2. A research lead can be converted into a CRM company; the link is kept.
--
--   The "market research" in the current CRM only saved search logs over
--   built-in sample data that was never verified, so nothing is copied.
--
-- WHO CAN DO WHAT
--   Sales Officers, Sales Manager, Super Admin: read all research (shared
--   market intelligence) and add new; edit their own (managers edit all).
--   Nobody hard-deletes; archive instead.
--
-- Requires 0009_operations. Safe to run more than once.
-- =====================================================================

begin;

do $$ begin
  if not exists (select 1 from public.app_migrations where version = '0009_operations') then
    raise exception 'Run 0009_operations first.';
  end if;
end $$;

create table if not exists public.research_leads (
  id                   uuid primary key default gen_random_uuid(),
  company_name         text not null check (length(trim(company_name)) between 1 and 200),
  country              text,
  market               text,              -- e.g. GCC, EU, West Africa
  website              text,
  email                text,
  phone                text,
  whatsapp             text,
  linkedin             text,
  products_imported    text,
  product_origin       text,              -- where they import from today
  source_url           text,
  research_date        date not null default current_date,
  verification_status  text not null default 'unverified' check (verification_status in ('unverified', 'potential_buyer', 'verified_importer')),
  shortlisted          boolean not null default false,
  notes                text,
  researcher_id        uuid default auth.uid() references auth.users(id) on delete set null,
  converted_company_id uuid references public.companies(id) on delete set null,
  converted_at         timestamptz,
  archived_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  updated_by           uuid references auth.users(id) on delete set null,
  check (verification_status <> 'verified_importer' or coalesce(trim(source_url), '') <> ''),
  check (source_url is null or source_url ~* '^https?://')
);
create index if not exists research_leads_country_idx on public.research_leads (country);
create index if not exists research_leads_status_idx on public.research_leads (verification_status) where archived_at is null;
alter table public.research_leads enable row level security;

drop policy if exists research_leads_select on public.research_leads;
create policy research_leads_select on public.research_leads for select to authenticated using (public.app_can_plan());
drop policy if exists research_leads_insert on public.research_leads;
create policy research_leads_insert on public.research_leads for insert to authenticated
  with check (public.app_can_plan() and researcher_id = auth.uid());
drop policy if exists research_leads_update on public.research_leads;
create policy research_leads_update on public.research_leads for update to authenticated
  using (public.app_can_plan() and (researcher_id = auth.uid() or public.app_edits_all_plans()))
  with check (public.app_can_plan() and (researcher_id = auth.uid() or public.app_edits_all_plans()));

create or replace function public.app_research_guard()
returns trigger language plpgsql as $$
begin
  new.created_at := old.created_at;
  if new.researcher_id is distinct from old.researcher_id and not public.app_edits_all_plans() then
    raise exception 'Only a manager can change the researcher.' using errcode = '42501';
  end if;
  if new.converted_company_id is not null and old.converted_company_id is null then new.converted_at := now(); end if;
  return new;
end $$;
drop trigger if exists research_leads_guard on public.research_leads;
create trigger research_leads_guard before update on public.research_leads
  for each row execute function public.app_research_guard();
drop trigger if exists research_leads_updated_at on public.research_leads;
create trigger research_leads_updated_at before update on public.research_leads
  for each row execute function public.app_set_updated_at();
drop trigger if exists research_leads_audit on public.research_leads;
create trigger research_leads_audit after insert or update or delete on public.research_leads
  for each row execute function public.app_audit();

insert into public.app_migrations (version) values ('0010_research') on conflict do nothing;

commit;

select 'Market research installed' as status;
