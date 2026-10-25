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
