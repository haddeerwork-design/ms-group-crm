-- LOCAL TESTING ONLY.
\set ON_ERROR_STOP on
do $$ begin
  assert array_length((select prime_roots_terms from public.company_settings where id = 1), 1) = 12;
  assert array_length((select prime_roots_terms_ar from public.company_settings where id = 1), 1) = 12;
  assert (select prime_roots_validity_days from public.company_settings where id = 1) = 5;
  assert (select prime_roots_terms[1] from public.company_settings where id = 1) = '## Terms & Conditions';
  raise notice 'PASS Prime Roots default terms';
end $$;
-- user edits survive a re-run
update public.company_settings set prime_roots_validity_days = 7 where id = 1;
\i migrations/0015_prime_roots_terms.sql
do $$ begin assert (select prime_roots_validity_days from public.company_settings where id = 1) = 7; raise notice 'PASS re-run keeps edits'; end $$;
