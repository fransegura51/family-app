-- RETIRADAS DE EFECTIVO: subcategoría «Retirada de efectivo» dentro de «Movimientos internos», reparto de una retirada entre varias carteras y vínculo con
-- una entrada de efectivo ya registrada a mano (para no duplicarla). APLICADA en producción el 25/10/2026 (autorización expresa; ensayada antes en transacciones revertidas).
--
-- Reutiliza lo que ya hay (0312): cash_movements, cash_link_bank_expense, cash_unlink_bank_expense y la categoría «Movimientos internos», que ya queda fuera
-- de gastos e ingresos en toda la app. NO toca bank_transactions ni la sincronización: el movimiento bancario original no se modifica nunca.
--
-- Qué cambia:
--   1. Categoría «Retirada de efectivo» (catálogo + cada familia que ya existe + familias nuevas, que la copian del catálogo).
--   2. Un apunte del banco puede repartirse entre VARIAS carteras (una fila de traspaso por cartera, suma ≤ importe de la retirada):
--      el índice único pasa de (expense_id) a (expense_id, wallet_id). La parte sin asignar es efectivo sin cartera (no se inventa ningún saldo).
--   3. cash_assign_withdrawal(): confirma una retirada (reparto o «sin cartera») y la clasifica como «Retirada de efectivo».
--   4. cash_adopt_entry_as_withdrawal(): si la persona ya había apuntado a mano esa entrada de efectivo, el cargo del banco se VINCULA a ella
--      (no se crea una segunda entrada) y se puede desvincular sin perder la entrada original.
--   5. cash_link_bank_expense / cash_unlink_bank_expense: usan la nueva categoría y respetan el reparto y las entradas adoptadas.
--   6. link_purchase_to_bank_expense / restore_economy_log: al vincular una compra con su cargo del banco, la compra hereda la etiqueta (y fijo/variable y clasificación) que ya tuviera el apunte
--      del banco si ella no tiene, para no perder datos; «Deshacer» lo devuelve todo a como estaba.
-- ROLLBACK: supabase/rollbacks/0318_cash_withdrawals_down.sql

-- ─── 1. Categoría ───
insert into public.catalog_categories (key, budget_group, parent_key, name, icon, necessity, is_fixed, sort_order, protected, catalog_version)
select 'g.movimientos_internos.retirada_efectivo', 'generales', 'g.movimientos_internos', 'Retirada de efectivo', '🏧', null, null, 73, true, 1
where not exists (select 1 from public.catalog_categories where key = 'g.movimientos_internos.retirada_efectivo');

insert into public.budget_categories (family_id, name, icon, budget_group, parent_id, sort_order, necessity, is_fixed, catalog_key)
select p.family_id, 'Retirada de efectivo', '🏧', 'generales', p.id,
       (select coalesce(max(x.sort_order), 0) + 1 from public.budget_categories x where x.family_id = p.family_id),
       null, null, 'g.movimientos_internos.retirada_efectivo'
from public.budget_categories p
where p.catalog_key = 'g.movimientos_internos'
  and not exists (select 1 from public.budget_categories c where c.family_id = p.family_id and c.catalog_key = 'g.movimientos_internos.retirada_efectivo')
  and not exists (select 1 from public.budget_categories c where c.family_id = p.family_id and c.budget_group = 'generales' and lower(c.name) = 'retirada de efectivo');

-- ─── 2. Varias carteras por retirada ───
alter table public.cash_movements add column if not exists adopted_from text check (adopted_from in ('in'));
drop index if exists public.cash_movements_bank_transfer_uidx;
create unique index cash_movements_bank_transfer_uidx on public.cash_movements (expense_id, wallet_id) where kind in ('transfer_in', 'transfer_out') and expense_id is not null;

-- Categoría destino de un apunte del banco marcado como movimiento interno: la retirada de efectivo si la familia la tiene; si no, la de siempre.
create or replace function private.internal_move_category(p_family uuid, p_is_income boolean)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select c.name from public.budget_categories c
   where c.family_id = p_family
     and c.catalog_key = case when p_is_income then 'i.movimientos_internos' else 'g.movimientos_internos.retirada_efectivo' end
  union all
  select c.name from public.budget_categories c
   where c.family_id = p_family and not p_is_income and c.catalog_key = 'g.movimientos_internos.transferencias_propias'
  limit 1
$$;

-- ─── 3. Vincular la retirada entera a UNA cartera (como antes, con la categoría nueva) ───
create or replace function public.cash_link_bank_expense(p_wallet uuid, p_expense uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family uuid := private.current_family_id();
  v_exp public.expenses;
  v_cat text;
  v_id uuid;
begin
  if v_family is null or not private.has_section_access('dinero') then raise exception 'cash_link_bank_expense: sin acceso' using errcode = '42501'; end if;
  if not private.cash_wallet_writable(p_wallet) then raise exception 'cash_link_bank_expense: no puedes mover dinero de esa cartera' using errcode = '42501'; end if;
  select * into v_exp from public.expenses e where e.id = p_expense and e.family_id = v_family;
  if not found or not private.expense_touchable(p_expense) then raise exception 'cash_link_bank_expense: el apunte no existe' using errcode = '42501'; end if;
  if v_exp.source not in ('banco', 'ticket_banco') or v_exp.kind <> 'real' then raise exception 'cash_link_bank_expense: solo un apunte del banco' using errcode = '22023'; end if;
  if exists (select 1 from public.cash_movements m where m.expense_id = p_expense and m.kind in ('transfer_in', 'transfer_out')) then
    raise exception 'cash_link_bank_expense: ese apunte ya está vinculado a una cartera' using errcode = '23505';
  end if;
  v_cat := private.internal_move_category(v_family, v_exp.is_income);
  if v_cat is null then raise exception 'cash_link_bank_expense: la familia no tiene la categoría de movimientos internos' using errcode = '22023'; end if;
  insert into public.cash_movements (family_id, wallet_id, kind, amount, occurred_on, note, expense_id, previous_category)
  values (v_family, p_wallet, case when v_exp.is_income then 'transfer_out' else 'transfer_in' end,
          case when v_exp.is_income then -v_exp.amount else v_exp.amount end, v_exp.expense_date,
          case when v_exp.is_income then 'Ingreso de efectivo en el banco' else 'Retirada del banco' end, p_expense, v_exp.category)
  returning id into v_id;
  update public.expenses set category = v_cat where id = p_expense;
  return v_id;
end;
$$;

-- ─── 4. Confirmar una retirada: repartirla entre carteras o dejarla «sin cartera» ───
-- p_parts: [{"wallet_id":"…","amount":40}, …]. Vacío = «sin cartera»: solo se clasifica como retirada de efectivo, sin entrada en ninguna cartera.
-- La suma de las partes no puede superar el importe retirado; lo que no se asigna queda como efectivo sin cartera. Devuelve cuánto queda sin asignar.
create or replace function public.cash_assign_withdrawal(p_expense uuid, p_parts jsonb)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family uuid := private.current_family_id();
  v_exp public.expenses;
  v_cat text;
  v_item jsonb;
  v_wallet uuid;
  v_amount numeric;
  v_sum numeric := 0;
  v_seen uuid[] := '{}';
begin
  if v_family is null or not private.has_section_access('dinero') then raise exception 'cash_assign_withdrawal: sin acceso' using errcode = '42501'; end if;
  if jsonb_typeof(p_parts) is distinct from 'array' then raise exception 'cash_assign_withdrawal: reparto no válido' using errcode = '22023'; end if;
  select * into v_exp from public.expenses e where e.id = p_expense and e.family_id = v_family;
  if not found or not private.expense_touchable(p_expense) then raise exception 'cash_assign_withdrawal: el apunte no existe' using errcode = '42501'; end if;
  if v_exp.source not in ('banco', 'ticket_banco') or v_exp.kind <> 'real' or v_exp.is_income then
    raise exception 'cash_assign_withdrawal: solo un cargo del banco (una retirada)' using errcode = '22023';
  end if;
  if exists (select 1 from public.cash_movements m where m.expense_id = p_expense and m.kind in ('transfer_in', 'transfer_out')) then
    raise exception 'cash_assign_withdrawal: esa retirada ya está asignada a una cartera' using errcode = '23505';
  end if;
  v_cat := private.internal_move_category(v_family, false);
  if v_cat is null then raise exception 'cash_assign_withdrawal: la familia no tiene la categoría de movimientos internos' using errcode = '22023'; end if;
  -- Primero se valida todo: o se asigna todo o no se toca nada.
  for v_item in select * from jsonb_array_elements(p_parts) loop
    v_wallet := (v_item ->> 'wallet_id')::uuid;
    v_amount := round((v_item ->> 'amount')::numeric, 2);
    if v_wallet is null or v_amount is null or v_amount <= 0 then raise exception 'cash_assign_withdrawal: cada parte necesita cartera e importe' using errcode = '22023'; end if;
    if v_wallet = any (v_seen) then raise exception 'cash_assign_withdrawal: una cartera solo puede aparecer una vez' using errcode = '22023'; end if;
    v_seen := v_seen || v_wallet;
    if not private.cash_wallet_writable(v_wallet) then raise exception 'cash_assign_withdrawal: no puedes mover dinero de esa cartera' using errcode = '42501'; end if;
    v_sum := v_sum + v_amount;
  end loop;
  if v_sum > v_exp.amount + 0.001 then raise exception 'cash_assign_withdrawal: el reparto (%) supera lo retirado (%)', v_sum, v_exp.amount using errcode = '22023'; end if;
  for v_item in select * from jsonb_array_elements(p_parts) loop
    insert into public.cash_movements (family_id, wallet_id, kind, amount, occurred_on, note, expense_id, previous_category)
    values (v_family, (v_item ->> 'wallet_id')::uuid, 'transfer_in', round((v_item ->> 'amount')::numeric, 2), v_exp.expense_date, 'Retirada del banco', p_expense, v_exp.category);
  end loop;
  update public.expenses set category = v_cat where id = p_expense;
  return round(v_exp.amount - v_sum, 2);
end;
$$;

-- ─── 5. La entrada ya estaba apuntada a mano: el cargo del banco se vincula a ELLA (sin segunda entrada) ───
create or replace function public.cash_adopt_entry_as_withdrawal(p_expense uuid, p_movement uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family uuid := private.current_family_id();
  v_exp public.expenses;
  v_m public.cash_movements;
  v_cat text;
begin
  if v_family is null or not private.has_section_access('dinero') then raise exception 'cash_adopt_entry_as_withdrawal: sin acceso' using errcode = '42501'; end if;
  select * into v_exp from public.expenses e where e.id = p_expense and e.family_id = v_family;
  if not found or not private.expense_touchable(p_expense) then raise exception 'cash_adopt_entry_as_withdrawal: el apunte no existe' using errcode = '42501'; end if;
  if v_exp.source not in ('banco', 'ticket_banco') or v_exp.kind <> 'real' or v_exp.is_income then
    raise exception 'cash_adopt_entry_as_withdrawal: solo un cargo del banco (una retirada)' using errcode = '22023';
  end if;
  select * into v_m from public.cash_movements m where m.id = p_movement and m.family_id = v_family for update;
  if not found or v_m.kind <> 'in' or v_m.expense_id is not null or v_m.adopted_from is not null then
    raise exception 'cash_adopt_entry_as_withdrawal: esa no es una entrada de efectivo libre' using errcode = '22023';
  end if;
  if not private.cash_wallet_writable(v_m.wallet_id) then raise exception 'cash_adopt_entry_as_withdrawal: no puedes mover dinero de esa cartera' using errcode = '42501'; end if;
  if abs(v_m.amount - v_exp.amount) > 0.01 or abs(v_m.occurred_on - v_exp.expense_date) > 7 then
    raise exception 'cash_adopt_entry_as_withdrawal: la entrada no coincide con la retirada (importe o fecha)' using errcode = '22023';
  end if;
  if exists (select 1 from public.cash_movements m where m.expense_id = p_expense and m.kind in ('transfer_in', 'transfer_out')) then
    raise exception 'cash_adopt_entry_as_withdrawal: esa retirada ya está asignada a una cartera' using errcode = '23505';
  end if;
  v_cat := private.internal_move_category(v_family, false);
  if v_cat is null then raise exception 'cash_adopt_entry_as_withdrawal: la familia no tiene la categoría de movimientos internos' using errcode = '22023'; end if;
  update public.cash_movements
     set kind = 'transfer_in', expense_id = p_expense, previous_category = v_exp.category, adopted_from = 'in',
         note = coalesce(nullif(note, ''), 'Retirada del banco') || ' (vinculada a la retirada del banco)'
   where id = p_movement;
  update public.expenses set category = v_cat where id = p_expense;
  return p_movement;
end;
$$;

-- ─── 6. Desvincular: la cartera pierde la parte (o recupera su entrada manual) y el apunte recupera su categoría cuando no queda ninguna parte ───
create or replace function public.cash_unlink_bank_expense(p_movement uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m public.cash_movements;
begin
  select * into v_m from public.cash_movements m where m.id = p_movement and m.family_id = private.current_family_id() and m.kind in ('transfer_in', 'transfer_out') and m.expense_id is not null;
  if not found or not private.cash_wallet_writable(v_m.wallet_id) then raise exception 'cash_unlink_bank_expense: no se puede deshacer' using errcode = '42501'; end if;
  if v_m.adopted_from is not null then
    -- Era una entrada apuntada a mano antes de llegar el banco: se queda como entrada (el saldo de la cartera no cambia).
    update public.cash_movements set kind = v_m.adopted_from, expense_id = null, previous_category = null, adopted_from = null,
           note = nullif(replace(coalesce(note, ''), ' (vinculada a la retirada del banco)', ''), '')
     where id = p_movement;
  else
    delete from public.cash_movements where id = p_movement;
  end if;
  if not exists (select 1 from public.cash_movements m where m.expense_id = v_m.expense_id and m.kind in ('transfer_in', 'transfer_out')) then
    update public.expenses set category = v_m.previous_category where id = v_m.expense_id;
  end if;
end;
$$;

-- ─── 7. Vincular una compra con su cargo del banco SIN perder lo que ya se había puesto en el apunte del banco ───
-- (Hallazgo al auditar los 15 avisos históricos: 14 de los cargos del banco llevaban la etiqueta «Comun» puesta a mano y los tickets no; al retirar el apunte duplicado se
-- habría perdido.) La compra conserva su categoría, productos, justificante y fecha; hereda etiqueta, fijo/variable y clasificación solo si no tenía; el movimiento bancario
-- original no se borra ni se modifica (solo pasa a apuntar a la compra); y «Deshacer» devuelve la compra a como estaba. Un apunte con previsiones de pago o copias a Común enlazadas no se retira.
create or replace function public.link_purchase_to_bank_expense(p_purchase_expense uuid, p_bank_expense uuid, p_payment uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family uuid := private.current_family_id();
  v_keep public.expenses;
  v_bank public.expenses;
  v_pay public.purchase_payments;
  v_expected numeric;
  v_bt uuid;
  v_log uuid;
begin
  if v_family is null or not private.has_section_access('dinero') then raise exception 'link_purchase_to_bank_expense: sin acceso' using errcode = '42501'; end if;
  select * into v_keep from public.expenses e where e.id = p_purchase_expense and e.family_id = v_family;
  select * into v_bank from public.expenses e where e.id = p_bank_expense and e.family_id = v_family;
  if v_keep.id is null or v_bank.id is null or v_keep.id = v_bank.id or not private.expense_touchable(p_purchase_expense) or not private.expense_touchable(p_bank_expense) then raise exception 'link_purchase_to_bank_expense: apuntes no válidos' using errcode = '42501'; end if;
  if v_bank.source <> 'banco' or v_bank.is_income <> v_keep.is_income or v_keep.source = 'banco' then
    raise exception 'link_purchase_to_bank_expense: hace falta una compra propia y un apunte del banco' using errcode = '22023';
  end if;
  if p_payment is not null then
    select * into v_pay from public.purchase_payments p
     where p.id = p_payment and p.family_id = v_family and p.receipt_id in (select r.id from public.receipts r where r.expense_id = p_purchase_expense);
    if v_pay.id is null then raise exception 'link_purchase_to_bank_expense: el pago no es de esa compra' using errcode = '42501'; end if;
    v_expected := v_pay.amount;
  else
    v_expected := v_keep.amount;
  end if;
  if abs(v_bank.amount - v_expected) > 0.01 then raise exception 'link_purchase_to_bank_expense: los importes no coinciden' using errcode = '22023'; end if;
  select bt.id into v_bt from public.bank_transactions bt where bt.matched_expense_id = p_bank_expense limit 1;
  if v_bt is null then raise exception 'link_purchase_to_bank_expense: el apunte no viene de un movimiento bancario' using errcode = '22023'; end if;
  if exists (select 1 from public.receipts r where r.expense_id = p_bank_expense)
     or exists (select 1 from public.cash_movements m where m.expense_id = p_bank_expense)
     or exists (select 1 from public.purchase_refunds f where f.expense_id = p_bank_expense)
     or exists (select 1 from public.forecast_occurrences o where o.matched_expense_id = p_bank_expense)
     or exists (select 1 from public.expenses s where s.shared_from_expense_id = p_bank_expense) then
    raise exception 'link_purchase_to_bank_expense: ese apunte tiene otros datos vinculados; no se puede retirar' using errcode = '22023';
  end if;
  insert into public.purchase_audit_log (family_id, kind, summary, snapshot)
  values (v_family, 'bank_expense_merged',
          jsonb_build_object('store', coalesce(v_keep.store, v_bank.store), 'amount', v_bank.amount, 'date', v_bank.expense_date),
          jsonb_build_object('retired_expense', to_jsonb(v_bank), 'bank_transaction_id', v_bt, 'kept_expense_id', p_purchase_expense,
                             'kept_prev_source', v_keep.source, 'kept_prev_owner', v_keep.owner_member_id, 'payment_id', v_pay.id,
                             'kept_prev_tag', v_keep.tag_id, 'kept_prev_fixed', v_keep.is_fixed_override, 'kept_prev_class', v_keep.product_classification))
  returning id into v_log;
  update public.bank_transactions set matched_expense_id = p_purchase_expense where id = v_bt;
  if v_pay.id is not null then update public.purchase_payments set bank_transaction_id = v_bt where id = v_pay.id; end if;
  -- La compra conserva SU categoría, tienda, importe, fecha y productos. Lo que la persona ya había puesto en el apunte del banco y la compra aún no tiene
  -- (etiqueta, fijo/variable, clasificación de producto) se hereda para no perderlo al retirar el apunte duplicado; lo que la compra ya tiene no se pisa.
  update public.expenses set source = 'ticket_banco', owner_member_id = coalesce(v_bank.owner_member_id, v_keep.owner_member_id),
         tag_id = coalesce(tag_id, v_bank.tag_id), is_fixed_override = coalesce(is_fixed_override, v_bank.is_fixed_override),
         product_classification = coalesce(product_classification, v_bank.product_classification)
   where id = p_purchase_expense;
  delete from public.expenses where id = p_bank_expense;
  return v_log;
end;
$$;

-- Deshacer (igual que en 0312) y, además, devuelve a la compra su etiqueta / fijo-variable / clasificación anteriores.
create or replace function public.restore_economy_log(p_log uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family uuid := private.current_family_id();
  v_l public.purchase_audit_log;
  v_s jsonb;
  v_item jsonb;
  v_skipped integer := 0;
  v_wallet uuid;
  v_bt uuid;
  v_cur uuid;
begin
  select * into v_l from public.purchase_audit_log l where l.id = p_log and l.family_id = v_family for update;
  if not found then raise exception 'restore_economy_log: no existe' using errcode = '42501'; end if;
  if v_l.restored_at is not null then raise exception 'restore_economy_log: ya se deshizo' using errcode = '22023'; end if;
  v_s := v_l.snapshot;

  if v_l.kind = 'duplicate_removed' then
    insert into public.expenses select * from jsonb_populate_record(null::public.expenses, v_s -> 'expense');

  elsif v_l.kind = 'bank_expense_merged' then
    select bt.matched_expense_id into v_cur from public.bank_transactions bt where bt.id = (v_s ->> 'bank_transaction_id')::uuid;
    if v_cur is distinct from (v_s ->> 'kept_expense_id')::uuid then raise exception 'restore_economy_log: el movimiento bancario ya cambió desde entonces' using errcode = '22023'; end if;
    insert into public.expenses select * from jsonb_populate_record(null::public.expenses, v_s -> 'retired_expense');
    update public.bank_transactions set matched_expense_id = (v_s -> 'retired_expense' ->> 'id')::uuid where id = (v_s ->> 'bank_transaction_id')::uuid;
    update public.expenses set source = v_s ->> 'kept_prev_source', owner_member_id = nullif(v_s ->> 'kept_prev_owner', '')::uuid,
           tag_id = case when v_s ? 'kept_prev_tag' then nullif(v_s ->> 'kept_prev_tag', '')::uuid else tag_id end,
           is_fixed_override = case when v_s ? 'kept_prev_fixed' then (v_s ->> 'kept_prev_fixed')::boolean else is_fixed_override end,
           product_classification = case when v_s ? 'kept_prev_class' then v_s ->> 'kept_prev_class' else product_classification end
     where id = (v_s ->> 'kept_expense_id')::uuid;
    if v_s ->> 'payment_id' is not null then update public.purchase_payments set bank_transaction_id = null where id = (v_s ->> 'payment_id')::uuid; end if;

  elsif v_l.kind = 'purchase_deleted' then
    if (jsonb_array_length(v_s -> 'cash_movements') > 0 or jsonb_array_length(v_s -> 'bank_links') > 0) and not private.has_section_access('dinero') then
      raise exception 'restore_economy_log: hace falta acceso a Economía' using errcode = '42501';
    end if;
    -- 1. Los movimientos bancarios vuelven a su apunte original; se retiran los apuntes del banco que se crearon al borrar.
    for v_item in select * from jsonb_array_elements(v_s -> 'bank_links') loop
      update public.bank_transactions set matched_expense_id = null where id = (v_item ->> 'bank_transaction_id')::uuid;
      delete from public.expenses where id = (v_item ->> 'created_expense_id')::uuid and source = 'banco';
    end loop;
    -- 2. Gastos (compra y devoluciones), compra, pagos, devoluciones.
    if jsonb_typeof(v_s -> 'expense') = 'object' then
      insert into public.expenses select * from jsonb_populate_record(null::public.expenses, v_s -> 'expense');
    end if;
    for v_item in select * from jsonb_array_elements(v_s -> 'refund_expenses') loop
      insert into public.expenses select * from jsonb_populate_record(null::public.expenses, v_item);
    end loop;
    insert into public.receipts select * from jsonb_populate_record(null::public.receipts, (v_s -> 'receipt') || jsonb_build_object('storage_path', null));
    for v_item in select * from jsonb_array_elements(v_s -> 'payments') loop
      v_bt := nullif(v_item ->> 'bank_transaction_id', '')::uuid;
      insert into public.purchase_payments select * from jsonb_populate_record(null::public.purchase_payments,
        v_item || jsonb_build_object('bank_transaction_id', case when v_bt is not null and exists (select 1 from public.bank_transactions where id = v_bt) then v_bt else null end,
                                     'wallet_id', case when exists (select 1 from public.cash_wallets w where w.id = nullif(v_item ->> 'wallet_id', '')::uuid) then v_item -> 'wallet_id' else null end));
    end loop;
    for v_item in select * from jsonb_array_elements(v_s -> 'refunds') loop
      insert into public.purchase_refunds select * from jsonb_populate_record(null::public.purchase_refunds,
        v_item || jsonb_build_object('wallet_id', case when exists (select 1 from public.cash_wallets w where w.id = nullif(v_item ->> 'wallet_id', '')::uuid) then v_item -> 'wallet_id' else null end));
    end loop;
    -- 3. Movimientos de cartera (si la cartera sigue existiendo y activa) y líneas de producto (si el producto sigue existiendo).
    for v_item in select * from jsonb_array_elements(v_s -> 'cash_movements') loop
      v_wallet := (v_item ->> 'wallet_id')::uuid;
      if exists (select 1 from public.cash_wallets w where w.id = v_wallet and w.archived_at is null) then
        insert into public.cash_movements select * from jsonb_populate_record(null::public.cash_movements, v_item);
      else
        v_skipped := v_skipped + 1;
      end if;
    end loop;
    for v_item in select * from jsonb_array_elements(v_s -> 'prices') loop
      if exists (select 1 from public.products p where p.id = (v_item ->> 'product_id')::uuid) then
        insert into public.product_prices select * from jsonb_populate_record(null::public.product_prices, v_item);
      else
        v_skipped := v_skipped + 1;
      end if;
    end loop;
    -- 4. Los movimientos bancarios vuelven a apuntar a la compra / devolución restauradas.
    for v_item in select * from jsonb_array_elements(v_s -> 'bank_links') loop
      update public.bank_transactions set matched_expense_id = (v_item ->> 'original_expense_id')::uuid where id = (v_item ->> 'bank_transaction_id')::uuid;
    end loop;
  end if;

  update public.purchase_audit_log set restored_at = now(), restored_by = auth.uid() where id = p_log;
  return jsonb_build_object('restored', true, 'skipped', v_skipped);
end;
$$;

revoke all on function private.internal_move_category(uuid, boolean) from public, anon;
grant execute on function private.internal_move_category(uuid, boolean) to authenticated;
revoke all on function public.cash_assign_withdrawal(uuid, jsonb), public.cash_adopt_entry_as_withdrawal(uuid, uuid), public.cash_link_bank_expense(uuid, uuid), public.cash_unlink_bank_expense(uuid), public.link_purchase_to_bank_expense(uuid, uuid, uuid), public.restore_economy_log(uuid) from public, anon;
grant execute on function public.cash_assign_withdrawal(uuid, jsonb), public.cash_adopt_entry_as_withdrawal(uuid, uuid), public.cash_link_bank_expense(uuid, uuid), public.cash_unlink_bank_expense(uuid), public.link_purchase_to_bank_expense(uuid, uuid, uuid), public.restore_economy_log(uuid) to authenticated;
-- Igual que en 0312b: solo lo necesario para las funciones internas.
revoke execute on function private.internal_move_category(uuid, boolean) from authenticated;
