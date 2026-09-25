-- FASE CA-4 — Corrección histórica de UNA pareja comisión+bonificación bancaria (Familia Hepburn), verificada con evidencia conjunta:
-- mismo importe (60,00 €), misma cuenta, mismo día (2026-09-24), conceptos compatibles («INTERESES Y/O COMISIONES CUENTA» /
-- «BONIFIC. COMISION MANT. CUENTA») y sin ninguna otra pareja candidata en el histórico. Mismo caso real que 0152 (2026-06-24), pero esa
-- migración no automatizó nada (a propósito) — el sync sí gana una regla general en la Fase CA-1, pero esa regla solo actúa sobre
-- movimientos NUEVOS (matched_expense_id IS NULL); esta pareja ya estaba sincronizada y emparejada antes de esa fase, así que se corrige
-- aquí puntualmente, igual que se hizo con la de junio.
--
-- Cambia ÚNICAMENTE la columna category de esas DOS filas, por id exacto: no toca importes, fechas, cuentas, conceptos, owner_member_id,
-- budget_group, tag_id ni ninguna otra columna; no borra nada; no crea categoría nueva (reutiliza la categoría estándar «Cobro anulado»,
-- catalog_key g.movimientos_internos.cobro_anulado, la misma que usó 0152). NO automatiza la detección de este patrón ni toca el sync
-- bancario ni domain/. Ninguna otra fila de «Otros» ni de «Devoluciones» se toca. Aborta si cualquier precondición no coincide exactamente.
-- NO toca Familia Demo, el catálogo, create_family ni ninguna otra familia. La categoría «Devoluciones» del abono la puso Paco a mano
-- (no fue una detección automática) — se sustituye por «Cobro anulado» exactamente igual que se hizo con el cargo.
-- ROLLBACK: supabase/rollbacks/0167_reclassify_commission_reversal_pair_202609_down.sql (restaura ambas categorías originales, mismos ids).

-- La tabla ya existe desde 0152 (misma pareja de junio) — se reutiliza, nunca se recrea ni se duplica.
create table if not exists public.commission_reversal_reclass_log (
  id bigint generated always as identity primary key,
  entity_id uuid not null,
  before jsonb not null,
  after jsonb not null,
  created_at timestamptz not null default now()
);
comment on table public.commission_reversal_reclass_log is
  'Copia de los gastos reclasificados a «Cobro anulado» (pares comisión de mantenimiento + su bonificación, uno por migración puntual), para poder restaurarlos exactamente.';
alter table public.commission_reversal_reclass_log enable row level security;
revoke all on public.commission_reversal_reclass_log from public, anon, authenticated;

do $$
declare
  c_family constant uuid := '011429a4-4fd8-4341-9c04-ec6b2f585196';
  c_charge constant uuid := '9d2747d2-9857-4f50-9728-34a4141039aa';
  c_bonus constant uuid := 'df534f42-198c-445b-9d61-bdc734faf56c';
  c_account constant uuid := 'e1cab8aa-9209-40cf-ab66-b85fc5afba1c';
  c_cobro_anulado constant uuid := '482cdfb3-1cde-422e-aa92-2104729df931';
  v_charge public.expenses;
  v_bonus public.expenses;
  v_bt_charge public.bank_transactions;
  v_bt_bonus public.bank_transactions;
  v_exp_h_others text;
  v_exp_n integer;
  v_exp_sum numeric;
  v_rec_h text;
  v_prod_h text;
  v_prices_h text;
  v_budgets_h text;
  v_bcats_h text;
  v_types_h text;
  v_shared_h text;
  v_chains_h text;
  v_families_h text;
begin
  if not exists (select 1 from public.families where id = c_family and name = 'Familia Hepburn') then
    raise exception 'CA-4: no existe la familia esperada';
  end if;

  -- ── La categoría destino es la estándar existente, por id + catalog_key + padre (nunca un nombre inventado) — la misma que 0152 ──
  if not exists (
    select 1 from public.budget_categories
    where id = c_cobro_anulado and family_id = c_family and name = 'Cobro anulado'
      and catalog_key = 'g.movimientos_internos.cobro_anulado'
      and parent_id = (select id from public.budget_categories where family_id = c_family and name = 'Movimientos internos' and budget_group = 'generales' and parent_id is null)
  ) then
    raise exception 'CA-4: «Cobro anulado» no es la categoría estándar esperada';
  end if;

  -- ── Las dos filas exactas: TODOS los campos relevantes, no solo el importe ──
  select * into v_charge from public.expenses where id = c_charge;
  if v_charge.id is null or v_charge.family_id is distinct from c_family or v_charge.expense_date is distinct from date '2026-09-24'
     or v_charge.amount <> 60.00 or v_charge.is_income is distinct from false or v_charge.category is distinct from 'Otros'
     or v_charge.source is distinct from 'banco' or v_charge.notes is distinct from 'INTERESES Y/O COMISIONES CUENTA' then
    raise exception 'CA-4: el cargo de comisión no es exactamente el esperado';
  end if;

  select * into v_bonus from public.expenses where id = c_bonus;
  if v_bonus.id is null or v_bonus.family_id is distinct from c_family or v_bonus.expense_date is distinct from date '2026-09-24'
     or v_bonus.amount <> 60.00 or v_bonus.is_income is distinct from true or v_bonus.category is distinct from 'Devoluciones'
     or v_bonus.source is distinct from 'banco' or v_bonus.notes is distinct from 'BONIFIC. COMISION MANT. CUENTA' then
    raise exception 'CA-4: la bonificación no es exactamente la esperada (recuerda: su categoría «Devoluciones» la puso Paco a mano)';
  end if;

  -- ── Evidencia conjunta en el movimiento bancario de origen: misma cuenta, mismo día, importe y signos opuestos, sin ambigüedad ──
  select * into v_bt_charge from public.bank_transactions bt
    where bt.matched_expense_id = c_charge and bt.account_id = c_account and bt.transaction_date = date '2026-09-24'
      and bt.amount = 60.00 and bt.credit_debit = 'DBIT';
  if v_bt_charge.id is null then raise exception 'CA-4: el movimiento bancario del cargo no coincide (cuenta/fecha/importe/signo)'; end if;

  select * into v_bt_bonus from public.bank_transactions bt
    where bt.matched_expense_id = c_bonus and bt.account_id = c_account and bt.transaction_date = date '2026-09-24'
      and bt.amount = 60.00 and bt.credit_debit = 'CRDT';
  if v_bt_bonus.id is null then raise exception 'CA-4: el movimiento bancario de la bonificación no coincide (cuenta/fecha/importe/signo)'; end if;

  if (select count(*) from public.bank_transactions bt where bt.account_id = c_account and bt.amount = 60.00
        and bt.transaction_date between date '2026-09-17' and date '2026-10-01') <> 2 then
    raise exception 'CA-4: existe alguna otra pareja candidata de 60 € en esa cuenta y ventana temporal: se aborta por ambigüedad';
  end if;

  -- ── Alcance exacto: «Otros» debe tener hoy exactamente 2 filas / 100,00 €; «Devoluciones», 6 filas / 179,25 € ──
  if (select count(*) from public.expenses where family_id = c_family and category = 'Otros') <> 2
     or (select round(sum(amount), 2) from public.expenses where family_id = c_family and category = 'Otros') <> 100.00 then
    raise exception 'CA-4: «Otros» no tiene el estado auditado (2 filas, 100,00 €)';
  end if;
  if (select count(*) from public.expenses where family_id = c_family and category = 'Devoluciones') <> 6
     or (select round(sum(amount), 2) from public.expenses where family_id = c_family and category = 'Devoluciones') <> 179.25 then
    raise exception 'CA-4: «Devoluciones» no tiene el estado auditado (6 filas, 179,25 €)';
  end if;

  -- ── Huellas ANTES: nada fuera de estas 2 filas debe cambiar ──
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_exp_h_others from public.expenses x where x.id not in (c_charge, c_bonus);
  select count(*), sum(amount) into v_exp_n, v_exp_sum from public.expenses;
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_rec_h from public.receipts x;
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_prod_h from public.products x;
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_prices_h from public.product_prices x;
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_budgets_h from public.budgets x;
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_bcats_h from public.budget_categories x;
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_types_h from public.family_food_types x;
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_shared_h from public.shared_product_learning x;
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_chains_h from public.store_chains x;
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_families_h from public.families x;

  -- ── El cambio: SOLO category, en las 2 filas exactas ──
  insert into public.commission_reversal_reclass_log (entity_id, before, after)
  values (c_charge, to_jsonb(v_charge), to_jsonb(v_charge) || jsonb_build_object('category', 'Cobro anulado'));
  update public.expenses set category = 'Cobro anulado' where id = c_charge;

  insert into public.commission_reversal_reclass_log (entity_id, before, after)
  values (c_bonus, to_jsonb(v_bonus), to_jsonb(v_bonus) || jsonb_build_object('category', 'Cobro anulado'));
  update public.expenses set category = 'Cobro anulado' where id = c_bonus;

  -- ── Comprobación DESPUÉS: importes, huellas ajenas y recuentos exactos; si algo falla, se revierte todo ──
  if (select category from public.expenses where id = c_charge) is distinct from 'Cobro anulado'
     or (select category from public.expenses where id = c_bonus) is distinct from 'Cobro anulado'
     or (select amount from public.expenses where id = c_charge) <> 60.00
     or (select amount from public.expenses where id = c_bonus) <> 60.00
     or (select expense_date from public.expenses where id = c_charge) is distinct from date '2026-09-24'
     or (select expense_date from public.expenses where id = c_bonus) is distinct from date '2026-09-24'
     or (select is_income from public.expenses where id = c_charge) is distinct from false
     or (select is_income from public.expenses where id = c_bonus) is distinct from true
     or (select notes from public.expenses where id = c_charge) is distinct from 'INTERESES Y/O COMISIONES CUENTA'
     or (select notes from public.expenses where id = c_bonus) is distinct from 'BONIFIC. COMISION MANT. CUENTA'
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.expenses x where x.id not in (c_charge, c_bonus)) is distinct from v_exp_h_others
     or (select count(*) from public.expenses) <> v_exp_n
     or (select sum(amount) from public.expenses) <> v_exp_sum
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.receipts x) is distinct from v_rec_h
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.products x) is distinct from v_prod_h
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.product_prices x) is distinct from v_prices_h
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.budgets x) is distinct from v_budgets_h
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.budget_categories x) is distinct from v_bcats_h
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.family_food_types x) is distinct from v_types_h
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.shared_product_learning x) is distinct from v_shared_h
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.store_chains x) is distinct from v_chains_h
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.families x) is distinct from v_families_h
     or (select count(*) from public.expenses where family_id = c_family and category = 'Otros') <> 1
     or (select round(sum(amount), 2) from public.expenses where family_id = c_family and category = 'Otros') <> 40.00
     or (select count(*) from public.expenses where family_id = c_family and category = 'Devoluciones') <> 5
     or (select round(sum(amount), 2) from public.expenses where family_id = c_family and category = 'Devoluciones') <> 119.25 then
    raise exception 'CA-4: el resultado no coincide con lo esperado: se revierte todo';
  end if;
end $$;
