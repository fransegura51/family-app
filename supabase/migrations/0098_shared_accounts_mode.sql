-- Petición real: "para la implementación de Piso compartido/cuentas
-- separadas primero tendremos que dejar Movimientos preparado", seguido
-- de varias rondas de diseño en chat: la familia quiere poder elegir, al
-- añadir un segundo miembro, entre "Cuentas Compartidas" (todos ven todo,
-- comportamiento actual) o "Cuentas Separadas" (cada uno ve solo lo suyo,
-- con un bote común aparte) — cambiable más adelante desde Configuración.

-- 'compartido' = comportamiento de hoy (todo el mundo ve todo); nuevo
-- ajuste único por familia, mismo patrón que finance_month_start_day.
alter table families
  add column accounts_mode text not null default 'compartido'
    check (accounts_mode in ('compartido', 'separado'));

create or replace function private.current_accounts_mode()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select accounts_mode from families where id = private.current_family_id()
$$;

revoke execute on function private.current_accounts_mode() from public, anon, authenticated;
grant execute on function private.current_accounts_mode() to authenticated;

-- Ningún gasto tiene hoy "de quién es" — bank_accounts.owner_member_id
-- (0095) sí, pero expenses no tiene vínculo directo a la cuenta bancaria
-- (solo indirecto vía bank_transactions.matched_expense_id). NULL = gasto
-- de una cuenta/bolsillo Común, visible para todos siempre (misma
-- convención que bank_accounts.owner_member_id). `shared` marca si el
-- gasto entra en el bote común aunque tenga dueño (copia explícita, o
-- gasto apuntado directamente en la pestaña Común); `shared_from_expense_id`
-- solo es informativo (evita copias duplicadas y permite "✓ Ya en Común"),
-- nunca sincroniza cambios — la copia es independiente de verdad.
alter table expenses
  add column owner_member_id uuid references family_members(id) on delete set null,
  add column shared boolean not null default false,
  add column shared_from_expense_id uuid references expenses(id) on delete set null;

create index if not exists expenses_owner_member_id_idx on expenses(owner_member_id);
create index if not exists expenses_shared_from_expense_id_idx on expenses(shared_from_expense_id);

-- Una cuenta Común (sin dueño) siempre es compartida, tenga o no
-- owner_member_id resuelto en el propio gasto.
update expenses set shared = true where owner_member_id is null;

-- Backfill: de quién es cada gasto YA existente, cuando se puede saber
-- (llegó del banco, cuya cuenta sí tiene owner_member_id desde 0095).
-- Todo lo demás (manual, ticket sin banco) se queda en NULL — visible
-- para todos, coherente con "el historial se queda tal cual" (y con
-- accounts_mode = 'compartido' por defecto, que ignora esta columna).
update expenses e
set owner_member_id = a.owner_member_id
from bank_transactions bt
join bank_accounts a on a.id = bt.account_id
where bt.matched_expense_id = e.id
  and a.owner_member_id is not null;

-- budgets: mismo NULL = Común. Sin columna `shared` — un presupuesto no
-- se copia, se crea directamente en la pestaña que corresponda.
alter table budgets
  add column owner_member_id uuid references family_members(id) on delete set null;

create index if not exists budgets_owner_member_id_idx on budgets(owner_member_id);

-- Mes contable por persona (pedido al revisar el plan): antes era un
-- único ajuste por familia (families.finance_month_start_day). Cada
-- usuario logueado lo define ahora en su propio perfil, sin depender de
-- nadie — profiles YA deja a cualquiera tocar SOLO su propia fila
-- ("profiles: update own row", 0001_init.sql), a diferencia de
-- family_members (UPDATE ahí es solo para el admin).
alter table profiles
  add column finance_month_start_day integer not null default 1;

update profiles p
set finance_month_start_day = f.finance_month_start_day
from families f
where f.id = p.family_id;

alter table families drop column finance_month_start_day;

-- RLS: expenses/budgets ganan la condición de modo, igual patrón que
-- 0097_child_section_restrictions.sql añadió budget_group. Alimentación
-- queda FUERA a propósito (no es parte de este modo, se sigue viendo
-- entera por todos). bank_transactions gana el mismo añadido mirando el
-- dueño de la cuenta bancaria a través del join que ya usaba.
-- bank_accounts/bank_connections NO cambian (hace falta poder ver y
-- desconectar cualquier cuenta como admin en cualquier modo); la
-- privacidad del saldo vive solo en la vista de abajo.
drop policy "expenses: family crud" on expenses;
create policy "expenses: family crud" on expenses for all
  using (
    family_id = private.current_family_id()
    and (budget_group = 'alimentacion' or private.has_section_access('dinero'))
    and (
      budget_group = 'alimentacion'
      or private.current_accounts_mode() = 'compartido'
      or owner_member_id is null
      or shared
      or owner_member_id = private.current_member_id()
    )
  )
  with check (
    family_id = private.current_family_id()
    and (budget_group = 'alimentacion' or private.has_section_access('dinero'))
    and (
      budget_group = 'alimentacion'
      or private.current_accounts_mode() = 'compartido'
      or owner_member_id is null
      or shared
      or owner_member_id = private.current_member_id()
    )
  );

drop policy "budgets: family crud" on budgets;
create policy "budgets: family crud" on budgets for all
  using (
    family_id = private.current_family_id()
    and (budget_group = 'alimentacion' or private.has_section_access('dinero'))
    and (
      budget_group = 'alimentacion'
      or private.current_accounts_mode() = 'compartido'
      or owner_member_id is null
      or owner_member_id = private.current_member_id()
    )
  )
  with check (
    family_id = private.current_family_id()
    and (budget_group = 'alimentacion' or private.has_section_access('dinero'))
    and (
      budget_group = 'alimentacion'
      or private.current_accounts_mode() = 'compartido'
      or owner_member_id is null
      or owner_member_id = private.current_member_id()
    )
  );

drop policy "bank_transactions: family crud" on bank_transactions;
create policy "bank_transactions: family crud" on bank_transactions for all
  using (
    exists (
      select 1 from bank_accounts a join bank_connections c on c.id = a.connection_id
      where a.id = bank_transactions.account_id
        and c.family_id = private.current_family_id()
        and private.has_section_access('dinero')
        and (
          private.current_accounts_mode() = 'compartido'
          or a.owner_member_id is null
          or a.owner_member_id = private.current_member_id()
        )
    )
  )
  with check (
    exists (
      select 1 from bank_accounts a join bank_connections c on c.id = a.connection_id
      where a.id = bank_transactions.account_id
        and c.family_id = private.current_family_id()
        and private.has_section_access('dinero')
        and (
          private.current_accounts_mode() = 'compartido'
          or a.owner_member_id is null
          or a.owner_member_id = private.current_member_id()
        )
    )
  );

-- Vista para el "candado" de saldo en Banco: bank_accounts en sí se
-- sigue viendo entera (nombre, IBAN, dueño, conexión) para poder
-- gestionar/desconectar cualquier cuenta como admin — Postgres RLS es
-- por fila, no por columna, así que ocultar SOLO el saldo de una fila
-- por lo demás visible necesita una vista aparte. security_invoker para
-- que evalúe con los permisos/RLS de quien consulta, no del dueño de la
-- vista.
create view bank_accounts_with_visibility
with (security_invoker = on)
as
select
  a.id, a.connection_id, a.account_uid, a.iban, a.name, a.currency,
  a.balance_currency, a.balance_updated_at, a.owner_member_id,
  case
    when private.current_accounts_mode() = 'compartido' then true
    when a.owner_member_id is null then true
    when a.owner_member_id = private.current_member_id() then true
    else false
  end as balance_visible,
  case
    when private.current_accounts_mode() = 'compartido' then a.balance
    when a.owner_member_id is null then a.balance
    when a.owner_member_id = private.current_member_id() then a.balance
    else null
  end as balance
from bank_accounts a;

grant select on bank_accounts_with_visibility to authenticated;
