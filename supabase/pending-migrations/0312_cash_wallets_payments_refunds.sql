-- EFECTIVO, PAGOS MIXTOS, DEVOLUCIONES Y VINCULACIÓN COMPRAS–ECONOMÍA — aditiva; no modifica ni borra ningún dato existente.
-- Depende de 0310 (receipts.payment_method / is_manual) y de 0308 (shared_family_hash no se usa aquí). Orden de aplicación: 0310 → 0311 → 0312.
--
-- Piezas:
--   * expenses.payment_method        — cómo se pagó ese gasto (efectivo / tarjeta / ... / mixto). El sincronizador del banco NO une nunca un
--                                      gasto pagado en efectivo (ni mixto, por el total) con un movimiento bancario del mismo importe.
--   * cash_wallets / cash_movements  — carteras de efectivo OPCIONALES (personal = owner_member_id, familiar = sin dueño). Saldo = saldo
--                                      inicial + suma de movimientos; puede ser negativo (diferencia pendiente de regularizar, no una deuda).
--                                      Un traspaso NO es ingreso ni gasto: son dos movimientos de cartera emparejados (transfer_id); el
--                                      traspaso con el banco reutiliza «Movimientos internos» (la misma categoría que ya excluye de gastos
--                                      e ingresos todo Economía).
--   * purchase_payments              — una compra, un solo gasto total, varios medios de pago (suma = total).
--   * purchase_refunds               — devoluciones totales o parciales vinculadas a la compra original; su fila de Economía usa la categoría
--                                      estándar «Devoluciones» (Modelo C: resta del gasto bruto, no es ingreso ordinario).
--   * purchase_duplicate_decisions   — pares que la familia ha dicho que NO son duplicados (para no volver a preguntar).
-- Seguridad: RLS por familia en todas las tablas; las carteras respetan la sección «dinero» y el modo de cuentas (compartido / privado) igual
-- que bank_accounts; las operaciones multi-fila son funciones que comprueban permisos explícitamente.
--
-- ROLLBACK: supabase/rollbacks/0312_cash_wallets_payments_refunds_down.sql

-- 0310 admite «mixto» en receipts.payment_method (se amplía la lista cerrada).
alter table public.receipts drop constraint if exists receipts_payment_method_check;
alter table public.receipts add constraint receipts_payment_method_check
  check (payment_method is null or payment_method in ('efectivo', 'tarjeta', 'bizum', 'transferencia', 'otro', 'mixto'));

alter table public.expenses add column payment_method text;
alter table public.expenses add constraint expenses_payment_method_check
  check (payment_method is null or payment_method in ('efectivo', 'tarjeta', 'bizum', 'transferencia', 'otro', 'mixto'));

-- ─── Carteras de efectivo ───
create table public.cash_wallets (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  owner_member_id uuid references public.family_members (id) on delete set null,
  opening_balance numeric(12, 2) not null default 0,
  archived_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint cash_wallets_name_uidx unique (family_id, name)
);
-- Como mucho una cartera personal activa por persona.
create unique index cash_wallets_one_personal_uidx on public.cash_wallets (owner_member_id) where owner_member_id is not null and archived_at is null;

create or replace function public.cash_wallets_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_member_id is not null
     and not exists (select 1 from public.family_members m where m.id = new.owner_member_id and m.family_id = new.family_id) then
    raise exception 'cash_wallets: la persona dueña debe ser de la misma familia' using errcode = '23514';
  end if;
  -- Si la persona dueña deja de existir, la cartera NO pasa a ser familiar (sería enseñar su efectivo): se archiva.
  if tg_op = 'UPDATE' and old.owner_member_id is not null and new.owner_member_id is null and new.archived_at is null then
    new.archived_at := now();
  end if;
  return new;
end;
$$;
create trigger cash_wallets_guard before insert or update on public.cash_wallets
  for each row execute function public.cash_wallets_guard();

create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  wallet_id uuid not null references public.cash_wallets (id) on delete cascade,
  kind text not null check (kind in ('in', 'out', 'adjust', 'transfer_in', 'transfer_out', 'payment', 'refund')),
  -- Variación del saldo, con signo: entra (+) o sale (−).
  amount numeric(12, 2) not null check (amount <> 0),
  occurred_on date not null default current_date,
  note text,
  transfer_id uuid,
  expense_id uuid references public.expenses (id) on delete set null,
  payment_id uuid,
  -- Solo traspasos con el banco: la categoría que tenía el apunte antes de marcarlo como movimiento interno (para poder deshacerlo).
  previous_category text,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint cash_movements_sign check (
    (kind in ('in', 'transfer_in', 'refund') and amount > 0) or (kind in ('out', 'transfer_out', 'payment') and amount < 0) or kind = 'adjust'
  )
);
create index cash_movements_wallet_idx on public.cash_movements (wallet_id, occurred_on desc);
create index cash_movements_expense_idx on public.cash_movements (expense_id) where expense_id is not null;
-- Un apunte bancario solo puede ser el traspaso de UNA cartera.
create unique index cash_movements_bank_transfer_uidx on public.cash_movements (expense_id) where kind in ('transfer_in', 'transfer_out') and expense_id is not null;

create or replace function public.cash_movements_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.cash_wallets w where w.id = new.wallet_id and w.family_id = new.family_id) then
    raise exception 'cash_movements: la cartera debe ser de la misma familia' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger cash_movements_guard before insert or update on public.cash_movements
  for each row execute function public.cash_movements_guard();

alter table public.cash_wallets enable row level security;
alter table public.cash_movements enable row level security;

-- Ver: como bank_accounts/expenses — con acceso a «dinero», y si hay modo privado, solo las carteras propias y las familiares.
create policy "cash_wallets: select" on public.cash_wallets for select to authenticated
  using (
    family_id = (select private.current_family_id())
    and (select private.has_section_access('dinero'))
    and (owner_member_id is null or owner_member_id = (select private.current_member_id()) or (select private.current_accounts_mode()) = 'compartido')
  );
-- Escribir: la cartera familiar cualquiera con acceso; la personal, solo su dueña.
create policy "cash_wallets: insert" on public.cash_wallets for insert to authenticated
  with check (
    family_id = (select private.current_family_id())
    and (select private.has_section_access('dinero'))
    and (owner_member_id is null or owner_member_id = (select private.current_member_id()))
  );
create policy "cash_wallets: update" on public.cash_wallets for update to authenticated
  using (family_id = (select private.current_family_id()) and (select private.has_section_access('dinero'))
         and (owner_member_id is null or owner_member_id = (select private.current_member_id())))
  with check (family_id = (select private.current_family_id()) and (select private.has_section_access('dinero'))
              and (owner_member_id is null or owner_member_id = (select private.current_member_id())));

create policy "cash_movements: select" on public.cash_movements for select to authenticated
  using (family_id = (select private.current_family_id()) and exists (select 1 from public.cash_wallets w where w.id = cash_movements.wallet_id));
-- Altas manuales (entrada / salida / ajuste) en carteras que se pueden escribir; el resto (pagos, devoluciones, traspasos) lo hacen las funciones.
create policy "cash_movements: insert manual" on public.cash_movements for insert to authenticated
  with check (
    family_id = (select private.current_family_id())
    and kind in ('in', 'out', 'adjust')
    and exists (select 1 from public.cash_wallets w where w.id = cash_movements.wallet_id and (w.owner_member_id is null or w.owner_member_id = (select private.current_member_id())))
  );
create policy "cash_movements: delete manual" on public.cash_movements for delete to authenticated
  using (
    family_id = (select private.current_family_id())
    and kind in ('in', 'out', 'adjust')
    and exists (select 1 from public.cash_wallets w where w.id = cash_movements.wallet_id and (w.owner_member_id is null or w.owner_member_id = (select private.current_member_id())))
  );

grant select, insert, update on public.cash_wallets to authenticated;
grant select, insert, delete on public.cash_movements to authenticated;

create view public.cash_wallet_balances with (security_invoker = true) as
  select w.id as wallet_id, w.family_id, w.opening_balance + coalesce(sum(m.amount), 0) as balance
  from public.cash_wallets w
  left join public.cash_movements m on m.wallet_id = w.id
  group by w.id, w.family_id, w.opening_balance;
grant select on public.cash_wallet_balances to authenticated;

-- ─── Pagos de una compra (pagos mixtos) ───
create table public.purchase_payments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  receipt_id uuid not null references public.receipts (id) on delete cascade,
  method text not null check (method in ('efectivo', 'tarjeta', 'bizum', 'transferencia', 'otro')),
  amount numeric(12, 2) not null check (amount > 0),
  wallet_id uuid references public.cash_wallets (id) on delete set null,
  paid_by_member_id uuid references public.family_members (id) on delete set null,
  bank_transaction_id uuid references public.bank_transactions (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint purchase_payments_wallet_only_cash check (wallet_id is null or method = 'efectivo'),
  constraint purchase_payments_bank_uidx unique (bank_transaction_id)
);
create index purchase_payments_receipt_idx on public.purchase_payments (receipt_id);

create or replace function public.purchase_payments_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.receipts r where r.id = new.receipt_id and r.family_id = new.family_id) then
    raise exception 'purchase_payments: la compra debe ser de la misma familia' using errcode = '23514';
  end if;
  if new.paid_by_member_id is not null and not exists (select 1 from public.family_members m where m.id = new.paid_by_member_id and m.family_id = new.family_id) then
    raise exception 'purchase_payments: quien pagó debe ser de la misma familia' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger purchase_payments_guard before insert or update on public.purchase_payments
  for each row execute function public.purchase_payments_guard();

alter table public.purchase_payments enable row level security;
create policy "purchase_payments: family crud" on public.purchase_payments for all to authenticated
  using (family_id = (select private.current_family_id()))
  with check (family_id = (select private.current_family_id()));
grant select, insert, update, delete on public.purchase_payments to authenticated;

alter table public.cash_movements add constraint cash_movements_payment_fk foreign key (payment_id) references public.purchase_payments (id) on delete cascade;

-- ─── Devoluciones vinculadas a su compra ───
create table public.purchase_refunds (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  receipt_id uuid not null references public.receipts (id) on delete cascade,
  expense_id uuid references public.expenses (id) on delete set null,
  amount numeric(12, 2) not null check (amount > 0),
  destination text not null check (destination in ('efectivo', 'tarjeta', 'bizum', 'transferencia', 'otro')),
  wallet_id uuid references public.cash_wallets (id) on delete set null,
  note text,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint purchase_refunds_wallet_only_cash check (wallet_id is null or destination = 'efectivo')
);
create index purchase_refunds_receipt_idx on public.purchase_refunds (receipt_id);
alter table public.purchase_refunds enable row level security;
create policy "purchase_refunds: family select" on public.purchase_refunds for select to authenticated
  using (family_id = (select private.current_family_id()));
grant select on public.purchase_refunds to authenticated;

-- ─── Duplicados descartados por la familia ───
create table public.purchase_duplicate_decisions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  expense_a uuid not null references public.expenses (id) on delete cascade,
  expense_b uuid not null references public.expenses (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint purchase_duplicate_decisions_order check (expense_a < expense_b),
  constraint purchase_duplicate_decisions_uidx unique (expense_a, expense_b)
);
alter table public.purchase_duplicate_decisions enable row level security;
create policy "purchase_duplicate_decisions: family crud" on public.purchase_duplicate_decisions for all to authenticated
  using (family_id = (select private.current_family_id()))
  with check (family_id = (select private.current_family_id()) and (select count(*) from public.expenses e where e.id in (purchase_duplicate_decisions.expense_a, purchase_duplicate_decisions.expense_b) and e.family_id = purchase_duplicate_decisions.family_id) = 2);
grant select, insert, delete on public.purchase_duplicate_decisions to authenticated;

-- ─── Funciones ───

-- Permisos de una cartera para quien llama: puede escribir si es familiar o suya.
create or replace function private.cash_wallet_writable(p_wallet uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.cash_wallets w
    where w.id = p_wallet and w.family_id = private.current_family_id() and w.archived_at is null
      and private.has_section_access('dinero')
      and (w.owner_member_id is null or w.owner_member_id = private.current_member_id())
  )
$$;

-- Un apunte de Economía solo se puede tocar si es visible para quien llama (misma regla que la política de expenses: en modo privado, solo los suyos y los sin dueño).
create or replace function private.expense_touchable(p_expense uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.expenses e
    where e.id = p_expense and e.family_id = private.current_family_id()
      and (e.budget_group = 'alimentacion' or private.has_section_access('dinero'))
      and (private.current_accounts_mode() = 'compartido' or e.owner_member_id is null or e.owner_member_id = private.current_member_id() or e.shared)
  )
$$;

-- Traspaso entre carteras (personal ↔ familiar, entre miembros): dos movimientos emparejados. NO es ingreso ni gasto.
-- Sale de una cartera que puedes escribir; entra en cualquier cartera de la familia que puedas ver. Puede dejar la de origen en negativo.
create or replace function public.cash_transfer(p_from uuid, p_to uuid, p_amount numeric, p_date date default current_date, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family uuid := private.current_family_id();
  v_transfer uuid := gen_random_uuid();
begin
  if v_family is null or not private.has_section_access('dinero') then raise exception 'cash_transfer: sin acceso' using errcode = '42501'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'cash_transfer: el importe debe ser mayor que 0' using errcode = '22023'; end if;
  if p_from = p_to then raise exception 'cash_transfer: origen y destino son la misma cartera' using errcode = '22023'; end if;
  if not private.cash_wallet_writable(p_from) then raise exception 'cash_transfer: no puedes sacar dinero de esa cartera' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.cash_wallets w
    where w.id = p_to and w.family_id = v_family and w.archived_at is null
      and (w.owner_member_id is null or w.owner_member_id = private.current_member_id() or private.current_accounts_mode() = 'compartido')
  ) then raise exception 'cash_transfer: la cartera de destino no existe o no es visible' using errcode = '42501'; end if;
  insert into public.cash_movements (family_id, wallet_id, kind, amount, occurred_on, note, transfer_id)
  values (v_family, p_from, 'transfer_out', -round(p_amount, 2), p_date, p_note, v_transfer),
         (v_family, p_to, 'transfer_in', round(p_amount, 2), p_date, p_note, v_transfer);
  return v_transfer;
end;
$$;

-- Traspaso con el banco: marca un apunte bancario YA sincronizado como movimiento interno (no gasto/ingreso) y lo refleja en la cartera.
--  retirada (cargo del banco) → entra efectivo;  ingreso de efectivo en el banco (abono) → sale efectivo.
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
  -- Misma comprobación de privacidad que la edición normal de gastos: debe poder verlo y modificarlo (RLS de expenses).
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

-- Deshace el vínculo: la cartera pierde el movimiento y el apunte recupera su categoría.
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

-- Medios de pago de una compra: una sola compra, un solo gasto total, varios pagos (suma = total). Reemplaza los pagos anteriores.
-- p_payments: [{"method":"efectivo","amount":20,"wallet_id":"…"|null,"paid_by_member_id":"…"|null}, …]
create or replace function public.set_purchase_payments(p_receipt uuid, p_payments jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family uuid := private.current_family_id();
  v_r public.receipts;
  v_total numeric;
  v_sum numeric := 0;
  v_item jsonb;
  v_method text;
  v_amount numeric;
  v_wallet uuid;
  v_payer uuid;
  v_pid uuid;
  v_n integer;
  v_single text;
begin
  select * into v_r from public.receipts r where r.id = p_receipt and r.family_id = v_family;
  if not found then raise exception 'set_purchase_payments: la compra no existe' using errcode = '42501'; end if;
  if jsonb_typeof(p_payments) is distinct from 'array' or jsonb_array_length(p_payments) = 0 then raise exception 'set_purchase_payments: faltan los pagos' using errcode = '22023'; end if;
  select coalesce((select e.amount from public.expenses e where e.id = v_r.expense_id), v_r.total_amount) into v_total;
  if v_total is null then raise exception 'set_purchase_payments: la compra no tiene importe' using errcode = '22023'; end if;
  for v_item in select * from jsonb_array_elements(p_payments) loop
    v_amount := (v_item ->> 'amount')::numeric;
    if v_amount is null or v_amount <= 0 then raise exception 'set_purchase_payments: cada pago debe ser mayor que 0' using errcode = '22023'; end if;
    v_sum := v_sum + v_amount;
  end loop;
  if abs(v_sum - v_total) > 0.005 then
    raise exception 'set_purchase_payments: los pagos suman % y la compra son %', v_sum, v_total using errcode = '22023';
  end if;
  -- Se retiran los pagos anteriores y sus movimientos de cartera (los vínculos bancarios de esos pagos quedan libres).
  delete from public.purchase_payments where receipt_id = p_receipt;
  v_n := 0;
  for v_item in select * from jsonb_array_elements(p_payments) loop
    v_method := v_item ->> 'method';
    v_amount := round((v_item ->> 'amount')::numeric, 2);
    v_wallet := nullif(v_item ->> 'wallet_id', '')::uuid;
    v_payer := nullif(v_item ->> 'paid_by_member_id', '')::uuid;
    if v_wallet is not null and not private.cash_wallet_writable(v_wallet) then raise exception 'set_purchase_payments: no puedes usar esa cartera' using errcode = '42501'; end if;
    insert into public.purchase_payments (family_id, receipt_id, method, amount, wallet_id, paid_by_member_id)
    values (v_family, p_receipt, v_method, v_amount, v_wallet, v_payer) returning id into v_pid;
    if v_wallet is not null then
      insert into public.cash_movements (family_id, wallet_id, kind, amount, occurred_on, note, expense_id, payment_id)
      values (v_family, v_wallet, 'payment', -v_amount, v_r.receipt_date, coalesce(v_r.store, 'Compra'), v_r.expense_id, v_pid);
    end if;
    v_n := v_n + 1;
    v_single := v_method;
  end loop;
  update public.receipts set payment_method = case when v_n = 1 then v_single else 'mixto' end where id = p_receipt;
  if v_r.expense_id is not null then
    update public.expenses set payment_method = case when v_n = 1 then v_single else 'mixto' end where id = v_r.expense_id;
  end if;
end;
$$;

-- Devolución (total o parcial) de una compra: crea su fila en Economía con la categoría estándar «Devoluciones» (resta del gasto bruto,
-- no cuenta como ingreso ordinario) y, si el dinero vuelve a una cartera, el movimiento correspondiente.
create or replace function public.register_purchase_refund(
  p_receipt uuid, p_amount numeric, p_date date, p_destination text, p_wallet uuid default null, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family uuid := private.current_family_id();
  v_r public.receipts;
  v_exp public.expenses;
  v_total numeric;
  v_refunded numeric;
  v_cat text;
  v_exp_id uuid;
  v_refund_id uuid;
begin
  select * into v_r from public.receipts r where r.id = p_receipt and r.family_id = v_family;
  if not found then raise exception 'register_purchase_refund: la compra no existe' using errcode = '42501'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'register_purchase_refund: el importe debe ser mayor que 0' using errcode = '22023'; end if;
  if v_r.expense_id is not null then select * into v_exp from public.expenses e where e.id = v_r.expense_id and e.family_id = v_family; end if;
  v_total := coalesce(v_exp.amount, v_r.total_amount);
  if v_total is null then raise exception 'register_purchase_refund: la compra no tiene importe' using errcode = '22023'; end if;
  select coalesce(sum(amount), 0) into v_refunded from public.purchase_refunds where receipt_id = p_receipt;
  if p_amount > v_total - v_refunded + 0.005 then
    raise exception 'register_purchase_refund: solo quedan % por devolver de esta compra', round(v_total - v_refunded, 2) using errcode = '22023';
  end if;
  if p_wallet is not null and (p_destination <> 'efectivo' or not private.cash_wallet_writable(p_wallet)) then
    raise exception 'register_purchase_refund: cartera no válida para esta devolución' using errcode = '42501';
  end if;
  select c.name into v_cat from public.budget_categories c where c.family_id = v_family and c.catalog_key = 'i.ingreso.devoluciones';
  if v_cat is null then raise exception 'register_purchase_refund: la familia no tiene la categoría Devoluciones' using errcode = '22023'; end if;
  insert into public.expenses (family_id, expense_date, amount, category, store, kind, notes, is_income, budget_group, source, owner_member_id, shared, payment_method)
  values (v_family, p_date, round(p_amount, 2), v_cat, v_r.store, 'real', coalesce(p_note, 'Devolución de la compra del ' || v_r.receipt_date), true, 'ingresos', 'manual',
          v_exp.owner_member_id, coalesce(v_exp.shared, false), p_destination)
  returning id into v_exp_id;
  insert into public.purchase_refunds (family_id, receipt_id, expense_id, amount, destination, wallet_id, note)
  values (v_family, p_receipt, v_exp_id, round(p_amount, 2), p_destination, p_wallet, p_note) returning id into v_refund_id;
  if p_wallet is not null then
    insert into public.cash_movements (family_id, wallet_id, kind, amount, occurred_on, note, expense_id)
    values (v_family, p_wallet, 'refund', round(p_amount, 2), p_date, coalesce(v_r.store, 'Devolución'), v_exp_id);
  end if;
  return v_refund_id;
end;
$$;

-- ─── Registro de operaciones que retiran registros económicos (trazabilidad + deshacer) ───
-- Cada borrado de una compra, cada retirada de un apunte duplicado y cada vínculo con el banco que retira un apunte guarda aquí una foto de lo que
-- había, para poder DESHACERLO (restore_economy_log). Los movimientos bancarios originales (bank_transactions) NUNCA se borran.
-- No tiene políticas de escritura: solo lo rellenan las funciones de más abajo. Lectura: familia con acceso a «dinero».
create table public.purchase_audit_log (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  kind text not null check (kind in ('purchase_deleted', 'duplicate_removed', 'bank_expense_merged')),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  restored_at timestamptz,
  restored_by uuid references public.profiles (id) on delete set null,
  -- Resumen legible (tienda, importe, fecha, efecto en carteras...), sin nada que no se vea ya en la app.
  summary jsonb not null default '{}'::jsonb,
  snapshot jsonb not null
);
create index purchase_audit_log_family_idx on public.purchase_audit_log (family_id, created_at desc);
alter table public.purchase_audit_log enable row level security;
create policy "purchase_audit_log: select" on public.purchase_audit_log for select to authenticated
  using (family_id = (select private.current_family_id()) and (select private.has_section_access('dinero')));
grant select on public.purchase_audit_log to authenticated;

-- Vincula una compra con el apunte del banco que la pagó (decisión EXPLÍCITA de la familia; nunca automática por coincidencia aproximada).
-- Mueve el movimiento bancario al gasto de la compra y retira SOLO el apunte económico duplicado (nunca el movimiento bancario importado, que se
-- conserva). Queda anotado en purchase_audit_log y se puede deshacer. Devuelve el id de esa anotación.
-- Con p_payment, solo un pago concreto (p. ej. la parte de tarjeta de un pago mixto): el importe debe ser el de ese pago.
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

-- Retira un apunte duplicado (la misma compra apuntada dos veces). SOLO apuntes propios (manual/ticket) sin compra, cartera, devolución ni movimiento
-- bancario enlazados; nunca un apunte del banco. Anotado y reversible. Devuelve el id de la anotación.
create or replace function public.remove_duplicate_expense(p_keep uuid, p_remove uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family uuid := private.current_family_id();
  v_keep public.expenses;
  v_rm public.expenses;
  v_log uuid;
begin
  select * into v_keep from public.expenses e where e.id = p_keep and e.family_id = v_family;
  select * into v_rm from public.expenses e where e.id = p_remove and e.family_id = v_family;
  if v_keep.id is null or v_rm.id is null or v_keep.id = v_rm.id or not private.expense_touchable(p_keep) or not private.expense_touchable(p_remove) then
    raise exception 'remove_duplicate_expense: apuntes no válidos' using errcode = '42501';
  end if;
  if v_rm.source not in ('manual', 'ticket') or v_rm.is_income or v_keep.is_income or abs(v_rm.amount - v_keep.amount) > 0.01 then
    raise exception 'remove_duplicate_expense: solo se retira un gasto propio del mismo importe, nunca un apunte del banco' using errcode = '22023';
  end if;
  if exists (select 1 from public.bank_transactions bt where bt.matched_expense_id = p_remove)
     or exists (select 1 from public.receipts r where r.expense_id = p_remove)
     or exists (select 1 from public.cash_movements m where m.expense_id = p_remove)
     or exists (select 1 from public.purchase_refunds f where f.expense_id = p_remove) then
    raise exception 'remove_duplicate_expense: ese apunte tiene datos vinculados; no se puede retirar' using errcode = '22023';
  end if;
  insert into public.purchase_audit_log (family_id, kind, summary, snapshot)
  values (v_family, 'duplicate_removed', jsonb_build_object('store', v_rm.store, 'amount', v_rm.amount, 'date', v_rm.expense_date),
          jsonb_build_object('expense', to_jsonb(v_rm), 'kept_expense_id', p_keep))
  returning id into v_log;
  delete from public.expenses where id = p_remove;
  return v_log;
end;
$$;

-- Borrado seguro de una compra (ECO-1j). Deja todo coherente y anota una foto para poder deshacerlo:
--   · el dinero de las carteras vuelve a donde estaba: los pagos en efectivo de la compra se anulan (la cartera los recupera) y las devoluciones
--     que entraron en una cartera se anulan (la cartera los pierde); ningún movimiento queda huérfano; el saldo puede quedar negativo (no se bloquea);
--   · las devoluciones de esa compra se retiran con ella (su fila de «Devoluciones» y su vínculo);
--   · los movimientos bancarios originales NUNCA se borran: lo que el banco ya cobró o abonó vuelve a ser un apunte económico del banco
--     (con la categoría que tenía la compra), para que Economía siga reflejando el dinero real.
-- Si la compra toca carteras de otra persona o el banco hace falta acceso a «dinero» y poder escribir en esas carteras.
create or replace function public.delete_purchase(p_receipt uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family uuid := private.current_family_id();
  v_r public.receipts;
  v_exp public.expenses;
  v_refund_exp_ids uuid[];
  v_cash jsonb;
  v_cash_ids uuid[];
  v_links jsonb := '[]'::jsonb;
  v_tx record;
  v_new uuid;
  v_wallets jsonb;
  v_w uuid;
  v_log uuid;
  v_refund_cat text;
begin
  select * into v_r from public.receipts r where r.id = p_receipt and r.family_id = v_family;
  if not found then raise exception 'delete_purchase: la compra no existe' using errcode = '42501'; end if;
  if v_r.expense_id is not null then
    select * into v_exp from public.expenses e where e.id = v_r.expense_id and e.family_id = v_family;
    if v_exp.id is not null and not private.expense_touchable(v_exp.id) then raise exception 'delete_purchase: no puedes borrar esta compra' using errcode = '42501'; end if;
  end if;
  select coalesce(array_agg(f.expense_id) filter (where f.expense_id is not null), '{}') into v_refund_exp_ids from public.purchase_refunds f where f.receipt_id = p_receipt;
  select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb), coalesce(array_agg(m.id), '{}') into v_cash, v_cash_ids
    from public.cash_movements m
   where m.payment_id in (select p.id from public.purchase_payments p where p.receipt_id = p_receipt) or m.expense_id = any (v_refund_exp_ids);
  -- Efecto en carteras (para el resumen) y permisos: cada cartera afectada debe poder escribirla quien borra.
  select coalesce(jsonb_agg(jsonb_build_object('wallet_id', t.wallet_id, 'delta', t.delta)), '[]'::jsonb) into v_wallets
    from (select m.wallet_id, -sum(m.amount) as delta from public.cash_movements m where m.id = any (v_cash_ids) group by m.wallet_id) t;
  for v_w in select (x ->> 'wallet_id')::uuid from jsonb_array_elements(v_wallets) x loop
    if not private.cash_wallet_writable(v_w) then raise exception 'delete_purchase: la compra mueve efectivo de una cartera que no puedes modificar' using errcode = '42501'; end if;
  end loop;
  -- Movimientos bancarios enlazados: se conservan; el apunte económico pasa a ser el del banco.
  for v_tx in
    select bt.id, bt.amount, bt.transaction_date, bt.description, bt.credit_debit, bt.matched_expense_id
      from public.bank_transactions bt
     where bt.matched_expense_id = v_r.expense_id or bt.matched_expense_id = any (v_refund_exp_ids)
  loop
    if not private.has_section_access('dinero') then raise exception 'delete_purchase: esta compra está enlazada al banco; hace falta acceso a Economía' using errcode = '42501'; end if;
    if v_tx.matched_expense_id = v_r.expense_id then
      insert into public.expenses (family_id, expense_date, amount, category, store, kind, notes, is_income, budget_group, source, owner_member_id, shared)
      values (v_family, v_tx.transaction_date, v_tx.amount, v_exp.category, coalesce(v_r.store, v_exp.store), 'real', v_tx.description, v_tx.credit_debit = 'CRDT',
              v_exp.budget_group, 'banco', v_exp.owner_member_id, v_exp.shared)
      returning id into v_new;
    else
      select c.name into v_refund_cat from public.budget_categories c where c.family_id = v_family and c.catalog_key = 'i.ingreso.devoluciones';
      insert into public.expenses (family_id, expense_date, amount, category, store, kind, notes, is_income, budget_group, source, owner_member_id, shared)
      values (v_family, v_tx.transaction_date, v_tx.amount, coalesce(v_refund_cat, 'Ingreso'), v_r.store, 'real', v_tx.description, true, 'ingresos', 'banco',
              (select e.owner_member_id from public.expenses e where e.id = v_tx.matched_expense_id), false)
      returning id into v_new;
    end if;
    update public.bank_transactions set matched_expense_id = v_new where id = v_tx.id;
    v_links := v_links || jsonb_build_array(jsonb_build_object('bank_transaction_id', v_tx.id, 'original_expense_id', v_tx.matched_expense_id, 'created_expense_id', v_new));
  end loop;
  insert into public.purchase_audit_log (family_id, kind, summary, snapshot)
  values (v_family, 'purchase_deleted',
          jsonb_build_object('store', v_r.store, 'amount', coalesce(v_exp.amount, v_r.total_amount), 'date', v_r.receipt_date,
                             'wallet_effects', v_wallets, 'refunds', cardinality(v_refund_exp_ids), 'bank_originals_kept', jsonb_array_length(v_links)),
          jsonb_build_object(
            'receipt', to_jsonb(v_r),
            'expense', case when v_exp.id is null then null else to_jsonb(v_exp) end,
            'payments', coalesce((select jsonb_agg(to_jsonb(p)) from public.purchase_payments p where p.receipt_id = p_receipt), '[]'::jsonb),
            'refunds', coalesce((select jsonb_agg(to_jsonb(f)) from public.purchase_refunds f where f.receipt_id = p_receipt), '[]'::jsonb),
            'refund_expenses', coalesce((select jsonb_agg(to_jsonb(e)) from public.expenses e where e.id = any (v_refund_exp_ids)), '[]'::jsonb),
            'cash_movements', v_cash,
            'prices', coalesce((select jsonb_agg(to_jsonb(pp)) from public.product_prices pp where pp.receipt_id = p_receipt), '[]'::jsonb),
            'bank_links', v_links))
  returning id into v_log;
  delete from public.cash_movements where id = any (v_cash_ids);
  delete from public.receipts where id = p_receipt;                       -- también borra sus pagos, devoluciones y líneas de producto
  delete from public.expenses where id = any (v_refund_exp_ids);
  if v_exp.id is not null then delete from public.expenses where id = v_exp.id; end if;
  return v_log;
end;
$$;

-- Deshace una anotación de purchase_audit_log (borrado de compra, apunte duplicado retirado o vínculo con el banco). La foto del ticket, si la hubo, no
-- se recupera (se borra al eliminar la compra, como siempre). Lo que ya no se puede restaurar (cartera archivada o borrada, producto desaparecido) se
-- omite y se cuenta en la respuesta. Solo se puede deshacer una vez.
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

revoke all on function private.cash_wallet_writable(uuid), private.expense_touchable(uuid) from public, anon;
grant execute on function private.cash_wallet_writable(uuid), private.expense_touchable(uuid) to authenticated;
revoke all on function public.cash_wallets_guard(), public.cash_movements_guard(), public.purchase_payments_guard() from public, anon, authenticated;
revoke all on function public.cash_transfer(uuid, uuid, numeric, date, text), public.cash_link_bank_expense(uuid, uuid), public.cash_unlink_bank_expense(uuid),
  public.set_purchase_payments(uuid, jsonb), public.register_purchase_refund(uuid, numeric, date, text, uuid, text),
  public.link_purchase_to_bank_expense(uuid, uuid, uuid), public.remove_duplicate_expense(uuid, uuid), public.delete_purchase(uuid), public.restore_economy_log(uuid) from public, anon;
grant execute on function public.cash_transfer(uuid, uuid, numeric, date, text), public.cash_link_bank_expense(uuid, uuid), public.cash_unlink_bank_expense(uuid),
  public.set_purchase_payments(uuid, jsonb), public.register_purchase_refund(uuid, numeric, date, text, uuid, text),
  public.link_purchase_to_bank_expense(uuid, uuid, uuid), public.remove_duplicate_expense(uuid, uuid), public.delete_purchase(uuid), public.restore_economy_log(uuid) to authenticated;

-- ─── Privilegios mínimos (en producción se aplicó aparte, el 24/10/2026, como «0312b_least_privilege_new_tables»; aquí va para que una instalación nueva quede igual) ───
-- Supabase concede por defecto TODOS los privilegios (también el de vaciar tablas) a anon y authenticated en tablas nuevas; la seguridad por filas (RLS) ya impide leer o
-- escribir filas sin política, pero se deja además solo lo necesario (defensa en profundidad). Solo quita permisos; no toca datos.
revoke all on public.cash_wallets, public.cash_movements, public.cash_wallet_balances, public.purchase_payments, public.purchase_refunds,
  public.purchase_duplicate_decisions, public.purchase_audit_log from anon, authenticated;
grant select, insert, update on public.cash_wallets to authenticated;
grant select, insert, delete on public.cash_movements to authenticated;
grant select on public.cash_wallet_balances to authenticated;
grant select, insert, update, delete on public.purchase_payments to authenticated;
grant select on public.purchase_refunds to authenticated;
grant select, insert, delete on public.purchase_duplicate_decisions to authenticated;
grant select on public.purchase_audit_log to authenticated;
-- Los dos ayudantes privados solo los usan funciones SECURITY DEFINER (que se ejecutan con el dueño): los usuarios no necesitan ejecutarlos.
revoke execute on function private.cash_wallet_writable(uuid), private.expense_touchable(uuid) from authenticated;
