-- 0332 · Reparto de un gasto entre varias CLASIFICACIONES de Compras, con importes (CLASIF-1)
--
-- Una categoría contable por movimiento (como siempre) y una o varias clasificaciones. Hasta ahora UNA (expenses.product_classification). Ahora un gasto SIN desglose de
-- ticket puede repartirse entre varias clasificaciones, con importes que SUMAN exactamente el del gasto (ejemplo real: Amazon 47,97 € = Ropa y calzado 40,98 € + otra
-- clasificación 6,99 €). Mismo diseño que las etiquetas con reparto (0322) y por la misma razón: no rompe nada.
--   · expenses.product_classification se conserva y pasa a ser la CLASIFICACIÓN PRINCIPAL (la de mayor parte). Un gasto con una sola clasificación funciona exactamente
--     como antes y NO tiene filas de reparto: las clasificaciones actuales se conservan tal cual (no hay migración de datos ni se reclasifica nada del histórico).
--   · expense_class_shares guarda el reparto SOLO cuando hay dos o más clasificaciones.
--   · El gasto se cuenta una sola vez en los totales; cada clasificación recibe solo su parte. La categoría contable y las etiquetas son conceptos distintos y no se tocan.
--   · Si el gasto ya tiene un ticket con productos clasificados línea a línea, ese desglose manda y NO se admite el reparto manual (así no se cuenta dos veces).
-- Escribir el reparto solo se puede con set_expense_classes (valida permisos, clasificaciones de la familia y que la suma sea exacta). Aditiva: sin DROP ni cambios de datos.

create table if not exists public.expense_class_shares (
  expense_id uuid not null references public.expenses(id) on delete cascade,
  class_name text not null,
  family_id uuid not null references public.families(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  position smallint not null default 0,
  primary key (expense_id, class_name)
);
create index if not exists expense_class_shares_family_idx on public.expense_class_shares (family_id);

-- Copia de seguridad de un reparto cuando se borra el gasto: «Deshacer» (borrar compra, apunte duplicado retirado, vínculo con el banco) vuelve a insertar el gasto y el
-- reparto vuelve con él, sin tocar esas funciones.
create table if not exists public.expense_class_shares_archive (
  expense_id uuid not null,
  class_name text not null,
  family_id uuid not null,
  amount numeric(12,2) not null,
  position smallint not null default 0,
  archived_at timestamptz not null default now(),
  primary key (expense_id, class_name)
);
create index if not exists expense_class_shares_archive_expense_idx on public.expense_class_shares_archive (expense_id);

alter table public.expense_class_shares enable row level security;
alter table public.expense_class_shares_archive enable row level security;

-- Lectura: solo el reparto de gastos que quien consulta ya puede ver (la política de expenses decide, incluidas las cuentas separadas).
drop policy if exists "expense_class_shares: read" on public.expense_class_shares;
create policy "expense_class_shares: read" on public.expense_class_shares
  for select to authenticated
  using (family_id = (select private.current_family_id()) and exists (select 1 from public.expenses e where e.id = expense_id));

revoke all on public.expense_class_shares from public, anon, authenticated;
grant select on public.expense_class_shares to authenticated;
revoke all on public.expense_class_shares_archive from public, anon, authenticated;

-- ─── Fijar el reparto de un gasto ───
-- p_shares: [{"class_name":"Ropa y calzado","amount":40.98}, …]. Vacío = sin clasificación. Una sola = clasificación única (sin filas de reparto). Varias = reparto; la suma
-- debe ser el importe del gasto al céntimo. La clasificación principal (expenses.product_classification) es la de mayor parte (a igualdad, la primera).
create or replace function public.set_expense_classes(p_expense uuid, p_shares jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family uuid := private.current_family_id();
  v_exp public.expenses;
  v_item jsonb;
  v_name text;
  v_amount numeric;
  v_sum numeric := 0;
  v_seen text[] := '{}';
  v_main text;
  v_main_amount numeric := -1;
  v_pos smallint := 0;
  v_n integer;
begin
  if v_family is null or not private.has_section_access('dinero') then raise exception 'set_expense_classes: sin acceso' using errcode = '42501'; end if;
  if jsonb_typeof(p_shares) is distinct from 'array' then raise exception 'set_expense_classes: reparto no válido' using errcode = '22023'; end if;
  select * into v_exp from public.expenses e where e.id = p_expense and e.family_id = v_family;
  if not found or not private.expense_touchable(p_expense) then raise exception 'set_expense_classes: el movimiento no existe' using errcode = '42501'; end if;
  v_n := jsonb_array_length(p_shares);
  if v_n > 12 then raise exception 'set_expense_classes: demasiadas clasificaciones' using errcode = '22023'; end if;
  -- Un ticket con productos ya clasificados línea a línea manda: el reparto manual contaría el mismo importe dos veces.
  if v_n >= 2 and exists (
    select 1 from public.receipts r join public.product_prices pr on pr.receipt_id = r.id where r.expense_id = p_expense
  ) then
    raise exception 'set_expense_classes: esta compra ya tiene sus productos clasificados en el ticket' using errcode = '22023';
  end if;
  -- Validar todo antes de escribir.
  for v_item in select * from jsonb_array_elements(p_shares) loop
    v_name := nullif(btrim(v_item ->> 'class_name'), '');
    v_amount := round((v_item ->> 'amount')::numeric, 2);
    if v_name is null or v_amount is null or v_amount <= 0 then raise exception 'set_expense_classes: cada clasificación necesita un importe mayor que cero' using errcode = '22023'; end if;
    if v_name = any (v_seen) then raise exception 'set_expense_classes: una clasificación solo puede aparecer una vez' using errcode = '22023'; end if;
    if not exists (select 1 from public.family_food_types t where t.family_id = v_family and t.name = v_name) then raise exception 'set_expense_classes: esa clasificación no es de tu familia' using errcode = '42501'; end if;
    v_seen := v_seen || v_name;
    v_sum := v_sum + v_amount;
    if v_amount > v_main_amount then v_main := v_name; v_main_amount := v_amount; end if;
  end loop;
  if v_n > 0 and round(v_sum * 100) <> round(v_exp.amount * 100) then
    raise exception 'set_expense_classes: el reparto (%) no suma el importe del movimiento (%)', v_sum, v_exp.amount using errcode = '22023';
  end if;
  perform set_config('pepa.class_shares_rpc', '1', true);
  delete from public.expense_class_shares where expense_id = p_expense;
  if v_n >= 2 then
    for v_item in select * from jsonb_array_elements(p_shares) loop
      insert into public.expense_class_shares (expense_id, class_name, family_id, amount, position)
      values (p_expense, btrim(v_item ->> 'class_name'), v_family, round((v_item ->> 'amount')::numeric, 2), v_pos);
      v_pos := v_pos + 1;
    end loop;
  end if;
  update public.expenses set product_classification = case when v_n = 0 then null else v_main end where id = p_expense;
  perform set_config('pepa.class_shares_rpc', '0', true);
end;
$$;

-- ─── Coherencia cuando el gasto cambia por otra vía ───
--   · Cambia el importe (una edición, una vinculación): el reparto se reescala en proporción, al céntimo (el resto va a la parte mayor).
--   · Se cambia la clasificación con el selector sencillo de siempre (product_classification): manda esa clasificación y el reparto se retira.
create or replace function private.expense_class_shares_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_cents bigint;
  v_new_cents bigint;
  v_total bigint;
  v_assigned bigint := 0;
  v_big record;
  v_r record;
  v_part bigint;
begin
  if coalesce(current_setting('pepa.class_shares_rpc', true), '0') = '1' then return null; end if;
  if not exists (select 1 from public.expense_class_shares s where s.expense_id = new.id) then return null; end if;
  if old.product_classification is distinct from new.product_classification then
    delete from public.expense_class_shares where expense_id = new.id;
    return null;
  end if;
  v_old_cents := round(old.amount * 100);
  v_new_cents := round(new.amount * 100);
  if v_old_cents = v_new_cents or v_old_cents = 0 then return null; end if;
  select coalesce(sum(round(s.amount * 100)), 0)::bigint into v_total from public.expense_class_shares s where s.expense_id = new.id;
  if v_total = 0 then return null; end if;
  for v_r in select s.class_name, round(s.amount * 100)::bigint as cents from public.expense_class_shares s where s.expense_id = new.id order by s.position loop
    v_part := round(v_r.cents::numeric * v_new_cents / v_total);
    v_assigned := v_assigned + v_part;
    update public.expense_class_shares set amount = v_part / 100.0 where expense_id = new.id and class_name = v_r.class_name;
  end loop;
  select s.class_name into v_big from public.expense_class_shares s where s.expense_id = new.id order by s.amount desc, s.position limit 1;
  if v_assigned <> v_new_cents then
    update public.expense_class_shares set amount = amount + (v_new_cents - v_assigned) / 100.0 where expense_id = new.id and class_name = v_big.class_name;
  end if;
  -- Una parte que quede a cero no tiene sentido: se retira (las demás siguen sumando el nuevo importe).
  delete from public.expense_class_shares where expense_id = new.id and amount <= 0;
  return null;
end;
$$;

drop trigger if exists expense_class_shares_sync on public.expenses;
create trigger expense_class_shares_sync
  after update of amount, product_classification on public.expenses
  for each row
  when (old.amount is distinct from new.amount or old.product_classification is distinct from new.product_classification)
  execute function private.expense_class_shares_sync();

-- ─── Borrar un gasto guarda su reparto; volver a insertarlo (Deshacer) lo recupera ───
create or replace function private.expense_class_shares_archive_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.expense_class_shares_archive (expense_id, class_name, family_id, amount, position)
  select s.expense_id, s.class_name, s.family_id, s.amount, s.position from public.expense_class_shares s where s.expense_id = old.id
  on conflict do nothing;
  return old;
end;
$$;

-- AFTER DELETE no sirve (el ON DELETE CASCADE ya habría borrado las filas): BEFORE DELETE las copia antes.
drop trigger if exists expense_class_shares_archive_delete on public.expenses;
create trigger expense_class_shares_archive_delete
  before delete on public.expenses
  for each row execute function private.expense_class_shares_archive_delete();

create or replace function private.expense_class_shares_restore()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.expense_class_shares_archive a where a.expense_id = new.id) then
    insert into public.expense_class_shares (expense_id, class_name, family_id, amount, position)
    select a.expense_id, a.class_name, a.family_id, a.amount, a.position
      from public.expense_class_shares_archive a
     where a.expense_id = new.id
    on conflict do nothing;
    -- Solo se conserva si sigue sumando el importe del gasto (si no, queda la clasificación principal que trae el propio gasto).
    if (select coalesce(sum(round(s.amount * 100)), 0) from public.expense_class_shares s where s.expense_id = new.id) <> round(new.amount * 100) then
      delete from public.expense_class_shares where expense_id = new.id;
    end if;
    delete from public.expense_class_shares_archive where expense_id = new.id;
  end if;
  return null;
end;
$$;

drop trigger if exists expense_class_shares_restore on public.expenses;
create trigger expense_class_shares_restore
  after insert on public.expenses
  for each row execute function private.expense_class_shares_restore();

-- ─── Vincular una compra con su cargo del banco: si el cargo tenía un reparto de clasificaciones y la compra no tenía ninguna, el reparto pasa a la compra ───
-- (igual que con las etiquetas en 0322). Se reescribe la función de 0322 con ese único añadido; el resto es idéntico.
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
  v_copy_cls boolean := false;
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
  -- Reparto de CLASIFICACIONES: solo si la compra no tiene clasificación ni reparto, ni un ticket con productos clasificados (que mandaría), y el importe coincide al céntimo.
  v_copy_cls := v_keep.product_classification is null
        and not exists (select 1 from public.expense_class_shares s where s.expense_id = p_purchase_expense)
        and exists (select 1 from public.expense_class_shares s where s.expense_id = p_bank_expense)
        and not exists (select 1 from public.receipts r join public.product_prices pr on pr.receipt_id = r.id where r.expense_id = p_purchase_expense)
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
  if v_copy_cls then
    insert into public.expense_class_shares (expense_id, class_name, family_id, amount, position)
    select p_purchase_expense, s.class_name, s.family_id, s.amount, s.position from public.expense_class_shares s where s.expense_id = p_bank_expense;
  end if;
  delete from public.expenses where id = p_bank_expense;
  return v_log;
end;
$$;

revoke all on function public.set_expense_classes(uuid, jsonb) from public, anon;
grant execute on function public.set_expense_classes(uuid, jsonb) to authenticated;
revoke all on function public.link_purchase_to_bank_expense(uuid, uuid, uuid) from public, anon;
grant execute on function public.link_purchase_to_bank_expense(uuid, uuid, uuid) to authenticated;
revoke all on function private.expense_class_shares_sync(), private.expense_class_shares_archive_delete(), private.expense_class_shares_restore() from public, anon, authenticated;
