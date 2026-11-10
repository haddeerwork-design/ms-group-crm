-- (jam per-jar prices added by 0013 are excluded with price_basis = 'ton')
-- LOCAL TESTING ONLY. Run after stub, 0001, 0002 fixture, 0002, 0003.
\set ON_ERROR_STOP on
\set A '00000000-0000-0000-0000-00000000000a'
\set S '00000000-0000-0000-0000-00000000000b'
\set Q '00000000-0000-0000-0000-00000000000c'

do $$ begin
  -- fixture p20 (Frozen Mangoes) had price 1200 USD
  assert (select count(*) from public.product_prices where source='imported' and price_basis = 'ton') = 1;
  assert (select price_per_ton from public.product_prices where source='imported' and price_basis = 'ton') = 1200;
  assert (select net_weight_kg from public.product_prices where source='imported' and price_basis = 'ton') = 10;
  raise notice 'PASS legacy price imported';
end $$;

-- make Q a finance officer
insert into public.user_roles (user_id, role) values (:'Q', 'finance_officer') on conflict do nothing;

-- ===== SUPER ADMIN saves a price and a rate =====
set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false);
insert into public.exchange_rates (base_currency, quote_currency, rate, source, rate_at)
values ('USD', 'EGP', 48.5, 'manual', now());
insert into public.product_prices (product_id, incoterm, sell_currency, cost_currency, cost_per_kg, fx_rate,
  total_cost_per_ton, margin_pct, price_per_ton, net_weight_kg)
select id, 'FOB', 'USD', 'EGP', 30, 0.0206, 700, 20, 875, 10 from public.products where name='Okra';
do $$ begin
  assert (select count(*) from public.product_prices where incoterm='FOB') = 1;
  raise notice 'PASS admin saves price + rate';
end $$;
do $$ begin
  -- (since 0016 an Incoterm is optional, so a price without one is allowed)
  begin
    insert into public.product_prices (product_id, incoterm, sell_currency, price_per_ton, created_by)
    select id, 'FOB', 'USD', 900, '00000000-0000-0000-0000-00000000000b' from public.products where name='Okra';
    raise exception 'FAIL spoofed created_by';
  exception when insufficient_privilege then raise notice 'PASS cannot spoof created_by'; end;
end $$;
update public.product_prices set price_per_ton = 1 where incoterm='FOB';
delete from public.product_prices;
update public.exchange_rates set rate = 1;
delete from public.exchange_rates;
do $$ begin
  assert (select price_per_ton from public.product_prices where incoterm='FOB') = 875, 'price edited';
  assert (select count(*) from public.product_prices where price_basis = 'ton') = 2, 'price deleted';
  assert (select rate from public.exchange_rates) = 48.5, 'rate edited';
  raise notice 'PASS prices and rates are immutable';
end $$;
-- new version supersedes in the price list
insert into public.product_prices (product_id, incoterm, sell_currency, price_per_ton)
select id, 'FOB', 'USD', 910 from public.products where name='Okra';
do $$ begin
  assert (select price_per_ton from public.product_price_list l join public.products p on p.id=l.product_id
           where p.name='Okra' and l.incoterm='FOB') = 910;
  assert (select count(*) from public.product_prices p join public.products x on x.id=p.product_id where x.name='Okra') = 2;
  raise notice 'PASS new version shows in price list, old kept';
end $$;

-- ===== SALES OFFICER: selling prices only =====
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :'S', false);
do $$ begin
  assert (select count(*) from public.product_prices) = 0, 'sales sees costs';
  assert (select count(*) from public.product_price_list where price_basis = 'ton') = 2, 'sales should see price list';
  assert (select count(*) from public.exchange_rates_latest) = 1;
  raise notice 'PASS sales sees selling prices, not costs';
end $$;
do $$ begin
  begin
    insert into public.product_prices (product_id, incoterm, sell_currency, price_per_ton)
    select id, 'FOB', 'USD', 1 from public.products where name='Okra';
    raise exception 'FAIL sales saved price';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.exchange_rates (base_currency, quote_currency, rate, source, rate_at) values ('USD','EUR',0.9,'manual',now());
    raise exception 'FAIL sales saved rate';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS sales cannot save prices or rates';
end $$;

-- ===== FINANCE: sees costs, adds rates, cannot set prices =====
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :'Q', false);
insert into public.exchange_rates (base_currency, quote_currency, rate, source, rate_at) values ('USD','EUR',0.92,'open.er-api.com', now() - interval '2 hours');
do $$ begin
  assert (select count(*) from public.product_prices where price_basis = 'ton') = 3, 'finance should see costs';
  assert (select count(*) from public.exchange_rates_latest) = 2;
  begin
    insert into public.product_prices (product_id, incoterm, sell_currency, price_per_ton)
    select id, 'FOB', 'USD', 1 from public.products where name='Okra';
    raise exception 'FAIL finance saved price';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS finance reads costs, adds rates, cannot set prices';
end $$;

-- ===== anon =====
reset role; set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  begin
    perform count(*) from public.product_price_list;
    raise exception 'FAIL anon read price list';
  exception when insufficient_privilege then raise notice 'PASS anon blocked from price list'; end;
  assert (select count(*) from public.exchange_rates) = 0;
end $$;
reset role;
