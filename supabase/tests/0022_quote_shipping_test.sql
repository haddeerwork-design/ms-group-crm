-- LOCAL TESTING ONLY.
\set ON_ERROR_STOP on
do $$
declare q uuid;
begin
  insert into public.quotations (currency, created_by, incoterm, shipping_mode, freight_basis, freight_rate, freight_currency, freight_containers, freight_total)
    values ('USD', '00000000-0000-0000-0000-00000000000a', 'CIF', 'sea', 'per_container', 3000, 'USD', 2, 6000) returning id into q;
  insert into public.quotation_items (quotation_id, description, price_per_ton, freight_per_ton, sort_order)
    values (q, 'with freight', 1300, 300, 0);
  update public.quotations set shipping_mode = 'air', freight_basis = 'per_kg', freight_rate = 1.2, freight_containers = null where id = q;
  begin
    update public.quotations set freight_basis = 'per_container', freight_containers = null where id = q;
    raise exception 'should be refused: per container needs a number of containers';
  exception when check_violation then null;
  end;
  begin
    update public.quotations set shipping_mode = 'rail' where id = q;
    raise exception 'should be refused: unknown mode';
  exception when check_violation then null;
  end;
  begin
    update public.quotations set freight_rate = null where id = q;
    raise exception 'should be refused: basis without a rate';
  exception when check_violation then null;
  end;
  -- clearing everything (EXW) is allowed
  update public.quotations set shipping_mode = null, freight_basis = null, freight_rate = null, freight_currency = null, freight_total = null where id = q;
  raise notice 'PASS shipping on quotations';
end $$;
