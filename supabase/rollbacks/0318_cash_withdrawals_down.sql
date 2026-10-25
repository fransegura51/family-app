-- Deshace 0318 (retiradas de efectivo). Antes de ejecutarlo:
--   · Si alguna retirada se repartió entre varias carteras, volver a un índice de «una cartera por retirada» falla: primero deshacer esas partes
--     (cash_unlink_bank_expense) o aceptar borrarlas a mano.
--   · Las entradas adoptadas (adopted_from) vuelven a ser entradas libres antes de quitar la columna (el saldo de la cartera no cambia).
--   · La categoría «Retirada de efectivo» solo se borra si NINGÚN gasto la usa; las que se usan se quedan (son movimientos internos, no cuentan como gasto).
update public.cash_movements set kind = adopted_from, expense_id = null, previous_category = null,
       note = nullif(replace(coalesce(note, ''), ' (vinculada a la retirada del banco)', ''), '')
 where adopted_from is not null;
update public.expenses e set category = 'Transferencias entre cuentas propias'
 where e.category = 'Retirada de efectivo'
   and exists (select 1 from public.budget_categories c where c.family_id = e.family_id and c.catalog_key = 'g.movimientos_internos.transferencias_propias');
delete from public.budget_categories c where c.catalog_key = 'g.movimientos_internos.retirada_efectivo'
   and not exists (select 1 from public.expenses e where e.family_id = c.family_id and e.category = c.name);
delete from public.catalog_categories where key = 'g.movimientos_internos.retirada_efectivo'
   and not exists (select 1 from public.budget_categories c where c.catalog_key = 'g.movimientos_internos.retirada_efectivo');

drop function if exists public.cash_assign_withdrawal(uuid, jsonb);
drop function if exists public.cash_adopt_entry_as_withdrawal(uuid, uuid);

drop index if exists public.cash_movements_bank_transfer_uidx;
create unique index cash_movements_bank_transfer_uidx on public.cash_movements (expense_id) where kind in ('transfer_in', 'transfer_out') and expense_id is not null;
alter table public.cash_movements drop column if exists adopted_from;

-- Versiones de 0312 (siempre «Transferencias entre cuentas propias», una sola cartera).
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
  select c.name into v_cat from public.budget_categories c
   where c.family_id = v_family and c.catalog_key = case when v_exp.is_income then 'i.movimientos_internos' else 'g.movimientos_internos.transferencias_propias' end;
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
  update public.expenses set category = v_m.previous_category where id = v_m.expense_id;
  delete from public.cash_movements where id = p_movement;
end;
$$;

drop function if exists private.internal_move_category(uuid, boolean);

-- Versiones de 0312 de la vinculación compra ↔ banco y de «Deshacer» (sin herencia de etiqueta). Las vinculaciones hechas con la versión nueva siguen siendo válidas;
-- su «Deshacer» con la versión antigua no devuelve la etiqueta heredada (queda en la compra).
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
     or exists (select 1 from public.purchase_refunds f where f.expense_id = p_bank_expense) then
    raise exception 'link_purchase_to_bank_expense: ese apunte tiene otros datos vinculados; no se puede retirar' using errcode = '22023';
  end if;
  insert into public.purchase_audit_log (family_id, kind, summary, snapshot)
  values (v_family, 'bank_expense_merged',
          jsonb_build_object('store', coalesce(v_keep.store, v_bank.store), 'amount', v_bank.amount, 'date', v_bank.expense_date),
          jsonb_build_object('retired_expense', to_jsonb(v_bank), 'bank_transaction_id', v_bt, 'kept_expense_id', p_purchase_expense,
                             'kept_prev_source', v_keep.source, 'kept_prev_owner', v_keep.owner_member_id, 'payment_id', v_pay.id))
  returning id into v_log;
  update public.bank_transactions set matched_expense_id = p_purchase_expense where id = v_bt;
  if v_pay.id is not null then update public.purchase_payments set bank_transaction_id = v_bt where id = v_pay.id; end if;
  update public.expenses set source = 'ticket_banco', owner_member_id = coalesce(v_bank.owner_member_id, v_keep.owner_member_id) where id = p_purchase_expense;
  delete from public.expenses where id = p_bank_expense;
  return v_log;
end;
$$;

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
    update public.expenses set source = v_s ->> 'kept_prev_source', owner_member_id = nullif(v_s ->> 'kept_prev_owner', '')::uuid where id = (v_s ->> 'kept_expense_id')::uuid;
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
