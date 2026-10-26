-- 0322 · Varias etiquetas por movimiento, con reparto opcional del importe (ETQ-1)
--
-- Una categoría contable por movimiento (como siempre). Etiquetas: hasta ahora UNA (expenses.tag_id). Ahora un movimiento puede repartirse entre varias, con
-- importes que SUMAN exactamente el del movimiento. Diseño que no rompe nada:
--   · expenses.tag_id se conserva y pasa a ser la ETIQUETA PRINCIPAL (la de mayor parte). Un movimiento con una sola etiqueta funciona exactamente como antes
--     y NO tiene filas de reparto: las etiquetas actuales se conservan tal cual (no hay migración de datos).
--   · expense_tag_shares guarda el reparto SOLO cuando hay dos o más etiquetas.
--   · El movimiento se cuenta una sola vez en los totales; cada etiqueta recibe solo su parte.
-- Escribir el reparto solo se puede con set_expense_tags (valida permisos, etiquetas de la familia y que la suma sea exacta). Aditiva: sin DROP ni cambios de datos.

create table if not exists public.expense_tag_shares (
  expense_id uuid not null references public.expenses(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  position smallint not null default 0,
  primary key (expense_id, tag_id)
);
create index if not exists expense_tag_shares_tag_idx on public.expense_tag_shares (tag_id);
create index if not exists expense_tag_shares_family_idx on public.expense_tag_shares (family_id);

-- Copia de seguridad de un reparto cuando se borra el movimiento: «Deshacer» (borrar compra, apunte duplicado retirado, vínculo con el banco) vuelve a insertar el
-- gasto y el reparto vuelve con él, sin tocar esas funciones.
create table if not exists public.expense_tag_shares_archive (
  expense_id uuid not null,
  tag_id uuid not null,
  family_id uuid not null,
  amount numeric(12,2) not null,
  position smallint not null default 0,
  archived_at timestamptz not null default now(),
  primary key (expense_id, tag_id)
);

alter table public.expense_tag_shares enable row level security;
alter table public.expense_tag_shares_archive enable row level security;

-- Lectura: solo el reparto de movimientos que quien consulta ya puede ver (la política de expenses decide, incluidas las cuentas separadas).
drop policy if exists "expense_tag_shares: read" on public.expense_tag_shares;
create policy "expense_tag_shares: read" on public.expense_tag_shares
  for select to authenticated
  using (family_id = (select private.current_family_id()) and exists (select 1 from public.expenses e where e.id = expense_id));

revoke all on public.expense_tag_shares from public, anon, authenticated;
grant select on public.expense_tag_shares to authenticated;
revoke all on public.expense_tag_shares_archive from public, anon, authenticated;

-- ─── Fijar el reparto de un movimiento ───
-- p_shares: [{"tag_id":"…","amount":60}, …]. Vacío = sin etiqueta. Una sola = etiqueta única (sin filas de reparto). Varias = reparto; la suma debe ser el importe
-- del movimiento al céntimo. La etiqueta principal (expenses.tag_id) es la de mayor parte (a igualdad, la primera).
create or replace function public.set_expense_tags(p_expense uuid, p_shares jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family uuid := private.current_family_id();
  v_exp public.expenses;
  v_item jsonb;
  v_tag uuid;
  v_amount numeric;
  v_sum numeric := 0;
  v_seen uuid[] := '{}';
  v_main uuid;
  v_main_amount numeric := -1;
  v_pos smallint := 0;
  v_n integer;
begin
  if v_family is null or not private.has_section_access('dinero') then raise exception 'set_expense_tags: sin acceso' using errcode = '42501'; end if;
  if jsonb_typeof(p_shares) is distinct from 'array' then raise exception 'set_expense_tags: reparto no válido' using errcode = '22023'; end if;
  select * into v_exp from public.expenses e where e.id = p_expense and e.family_id = v_family;
  if not found or not private.expense_touchable(p_expense) then raise exception 'set_expense_tags: el movimiento no existe' using errcode = '42501'; end if;
  v_n := jsonb_array_length(p_shares);
  if v_n > 12 then raise exception 'set_expense_tags: demasiadas etiquetas' using errcode = '22023'; end if;
  -- Validar todo antes de escribir.
  for v_item in select * from jsonb_array_elements(p_shares) loop
    v_tag := (v_item ->> 'tag_id')::uuid;
    v_amount := round((v_item ->> 'amount')::numeric, 2);
    if v_tag is null or v_amount is null or v_amount <= 0 then raise exception 'set_expense_tags: cada etiqueta necesita un importe mayor que cero' using errcode = '22023'; end if;
    if v_tag = any (v_seen) then raise exception 'set_expense_tags: una etiqueta solo puede aparecer una vez' using errcode = '22023'; end if;
    if not exists (select 1 from public.tags t where t.id = v_tag and t.family_id = v_family) then raise exception 'set_expense_tags: esa etiqueta no es de tu familia' using errcode = '42501'; end if;
    v_seen := v_seen || v_tag;
    v_sum := v_sum + v_amount;
    if v_amount > v_main_amount then v_main := v_tag; v_main_amount := v_amount; end if;
  end loop;
  if v_n > 0 and round(v_sum * 100) <> round(v_exp.amount * 100) then
    raise exception 'set_expense_tags: el reparto (%) no suma el importe del movimiento (%)', v_sum, v_exp.amount using errcode = '22023';
  end if;
  perform set_config('pepa.tag_shares_rpc', '1', true);
  delete from public.expense_tag_shares where expense_id = p_expense;
  if v_n >= 2 then
    for v_item in select * from jsonb_array_elements(p_shares) loop
      insert into public.expense_tag_shares (expense_id, tag_id, family_id, amount, position)
      values (p_expense, (v_item ->> 'tag_id')::uuid, v_family, round((v_item ->> 'amount')::numeric, 2), v_pos);
      v_pos := v_pos + 1;
    end loop;
  end if;
  update public.expenses set tag_id = case when v_n = 0 then null else v_main end where id = p_expense;
  perform set_config('pepa.tag_shares_rpc', '0', true);
end;
$$;

-- ─── Coherencia cuando el movimiento cambia por otra vía ───
--   · Cambia el importe (una edición, una vinculación): el reparto se reescala en proporción, al céntimo (el resto va a la parte mayor).
--   · Se cambia la etiqueta con el selector sencillo de siempre (tag_id): manda esa etiqueta y el reparto se retira.
create or replace function private.expense_tag_shares_sync()
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
  if coalesce(current_setting('pepa.tag_shares_rpc', true), '0') = '1' then return null; end if;
  if not exists (select 1 from public.expense_tag_shares s where s.expense_id = new.id) then return null; end if;
  if old.tag_id is distinct from new.tag_id then
    delete from public.expense_tag_shares where expense_id = new.id;
    return null;
  end if;
  v_old_cents := round(old.amount * 100);
  v_new_cents := round(new.amount * 100);
  if v_old_cents = v_new_cents or v_old_cents = 0 then return null; end if;
  select coalesce(sum(round(s.amount * 100)), 0)::bigint into v_total from public.expense_tag_shares s where s.expense_id = new.id;
  if v_total = 0 then return null; end if;
  for v_r in select s.tag_id, round(s.amount * 100)::bigint as cents from public.expense_tag_shares s where s.expense_id = new.id order by s.position loop
    v_part := round(v_r.cents::numeric * v_new_cents / v_total);
    v_assigned := v_assigned + v_part;
    update public.expense_tag_shares set amount = v_part / 100.0 where expense_id = new.id and tag_id = v_r.tag_id;
  end loop;
  select s.tag_id into v_big from public.expense_tag_shares s where s.expense_id = new.id order by s.amount desc, s.position limit 1;
  if v_assigned <> v_new_cents then
    update public.expense_tag_shares set amount = amount + (v_new_cents - v_assigned) / 100.0 where expense_id = new.id and tag_id = v_big.tag_id;
  end if;
  -- Una parte que quede a cero no tiene sentido: se retira (las demás siguen sumando el nuevo importe).
  delete from public.expense_tag_shares where expense_id = new.id and amount <= 0;
  return null;
end;
$$;

drop trigger if exists expense_tag_shares_sync on public.expenses;
create trigger expense_tag_shares_sync
  after update of amount, tag_id on public.expenses
  for each row
  when (old.amount is distinct from new.amount or old.tag_id is distinct from new.tag_id)
  execute function private.expense_tag_shares_sync();

-- ─── Borrar un movimiento guarda su reparto; volver a insertarlo (Deshacer) lo recupera ───
create or replace function private.expense_tag_shares_archive_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.expense_tag_shares_archive (expense_id, tag_id, family_id, amount, position)
  select s.expense_id, s.tag_id, s.family_id, s.amount, s.position from public.expense_tag_shares s where s.expense_id = old.id
  on conflict do nothing;
  return old;
end;
$$;

-- AFTER DELETE no sirve (el ON DELETE CASCADE ya habría borrado las filas): BEFORE DELETE las copia antes.
drop trigger if exists expense_tag_shares_archive_delete on public.expenses;
create trigger expense_tag_shares_archive_delete
  before delete on public.expenses
  for each row execute function private.expense_tag_shares_archive_delete();

create or replace function private.expense_tag_shares_restore()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.expense_tag_shares_archive a where a.expense_id = new.id) then
    insert into public.expense_tag_shares (expense_id, tag_id, family_id, amount, position)
    select a.expense_id, a.tag_id, a.family_id, a.amount, a.position
      from public.expense_tag_shares_archive a
     where a.expense_id = new.id and exists (select 1 from public.tags t where t.id = a.tag_id)
    on conflict do nothing;
    -- Solo se conserva si sigue sumando el importe del movimiento (si no, queda la etiqueta principal que trae el propio gasto).
    if (select coalesce(sum(round(s.amount * 100)), 0) from public.expense_tag_shares s where s.expense_id = new.id) <> round(new.amount * 100) then
      delete from public.expense_tag_shares where expense_id = new.id;
    end if;
    delete from public.expense_tag_shares_archive where expense_id = new.id;
  end if;
  return null;
end;
$$;

drop trigger if exists expense_tag_shares_restore on public.expenses;
create trigger expense_tag_shares_restore
  after insert on public.expenses
  for each row execute function private.expense_tag_shares_restore();

create index if not exists expense_tag_shares_archive_expense_idx on public.expense_tag_shares_archive (expense_id);

-- ─── Vincular una compra con su cargo del banco: si el cargo tenía un reparto de etiquetas y la compra no tenía ninguna, el reparto pasa a la compra ───
-- (igual que en 0318 con la etiqueta única). Se reescribe la función de 0318 con ese único añadido.
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

revoke all on function public.set_expense_tags(uuid, jsonb) from public, anon;
grant execute on function public.set_expense_tags(uuid, jsonb) to authenticated;
revoke all on function public.link_purchase_to_bank_expense(uuid, uuid, uuid) from public, anon;
grant execute on function public.link_purchase_to_bank_expense(uuid, uuid, uuid) to authenticated;
revoke all on function private.expense_tag_shares_sync(), private.expense_tag_shares_archive_delete(), private.expense_tag_shares_restore() from public, anon, authenticated;
