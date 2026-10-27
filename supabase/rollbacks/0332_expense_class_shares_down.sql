-- Reversión de 0332 (reparto de un gasto entre varias clasificaciones). OJO: borra los repartos guardados; cada gasto conserva su clasificación principal
-- (expenses.product_classification). Restaura la versión de 0322 de link_purchase_to_bank_expense.

drop trigger if exists expense_class_shares_sync on public.expenses;
drop trigger if exists expense_class_shares_archive_delete on public.expenses;
drop trigger if exists expense_class_shares_restore on public.expenses;
drop function if exists private.expense_class_shares_sync();
drop function if exists private.expense_class_shares_archive_delete();
drop function if exists private.expense_class_shares_restore();
drop function if exists public.set_expense_classes(uuid, jsonb);
drop table if exists public.expense_class_shares_archive;
drop table if exists public.expense_class_shares;

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
  v_copy boolean := false;
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
  v_copy := v_keep.tag_id is null
        and not exists (select 1 from public.expense_tag_shares s where s.expense_id = p_purchase_expense)
        and exists (select 1 from public.expense_tag_shares s where s.expense_id = p_bank_expense)
        and round(v_bank.amount * 100) = round(v_keep.amount * 100);
  insert into public.purchase_audit_log (family_id, kind, summary, snapshot)
  values (v_family, 'bank_expense_merged',
          jsonb_build_object('store', coalesce(v_keep.store, v_bank.store), 'amount', v_bank.amount, 'date', v_bank.expense_date),
          jsonb_build_object('retired_expense', to_jsonb(v_bank), 'bank_transaction_id', v_bt, 'kept_expense_id', p_purchase_expense,
                             'kept_prev_source', v_keep.source, 'kept_prev_owner', v_keep.owner_member_id, 'payment_id', v_pay.id,
                             'kept_prev_tag', v_keep.tag_id, 'kept_prev_fixed', v_keep.is_fixed_override, 'kept_prev_class', v_keep.product_classification))
  returning id into v_log;
  update public.bank_transactions set matched_expense_id = p_purchase_expense where id = v_bt;
  if v_pay.id is not null then update public.purchase_payments set bank_transaction_id = v_bt where id = v_pay.id; end if;
  update public.expenses set source = 'ticket_banco', owner_member_id = coalesce(v_bank.owner_member_id, v_keep.owner_member_id),
         tag_id = coalesce(tag_id, v_bank.tag_id), is_fixed_override = coalesce(is_fixed_override, v_bank.is_fixed_override),
         product_classification = coalesce(product_classification, v_bank.product_classification)
   where id = p_purchase_expense;
  if v_copy then
    insert into public.expense_tag_shares (expense_id, tag_id, family_id, amount, position)
    select p_purchase_expense, s.tag_id, s.family_id, s.amount, s.position from public.expense_tag_shares s where s.expense_id = p_bank_expense;
  end if;
  delete from public.expenses where id = p_bank_expense;
  return v_log;
end;
$$;

revoke all on function public.link_purchase_to_bank_expense(uuid, uuid, uuid) from public, anon;
grant execute on function public.link_purchase_to_bank_expense(uuid, uuid, uuid) to authenticated;
