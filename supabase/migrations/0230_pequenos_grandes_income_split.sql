-- Pequeños Grandes (prompt maestro) — Fase 7: ingresos con reparto automático 60/20/20. Aditiva sobre
-- kid_wallet_transactions/kid_goals (migración 0009, RLS reconstruida en 0097) — nunca un sistema
-- paralelo. "Disponible" sigue siendo 100% derivado (walletBalance en domain/finance.ts no cambia): un
-- ingreso ahora puede generar, en la MISMA transacción, un movimiento de ahorro y uno de impuesto —
-- nunca una cuarta cifra guardada aparte que pudiera desincronizarse.

-- Traza qué movimientos de ahorro/impuesto vienen del reparto automático de un ingreso concreto — un
-- movimiento manual de siempre (p. ej. un adulto apuntando un ahorro a mano) sigue con esto en null.
alter table kid_wallet_transactions add column source_income_id uuid null references kid_wallet_transactions(id) on delete set null;
create index idx_kid_wallet_transactions_source_income on kid_wallet_transactions(source_income_id) where source_income_id is not null;

-- Configuración de reparto por niño — "disponible" nunca se guarda aquí: es siempre
-- 100 - ahorro_pct - impuesto_pct, para que no pueda desincronizarse de las otras dos. Un niño sin fila
-- aquí usa el 60/20/20 obligatorio por defecto (se aplica en la propia función, no hace falta sembrar una
-- fila por cada niño ya existente ni para cada niño nuevo).
create table kid_income_split_configs (
  member_id uuid primary key references family_members(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  ahorro_pct integer not null default 60 check (ahorro_pct >= 0 and ahorro_pct <= 100),
  impuesto_pct integer not null default 20 check (impuesto_pct >= 0 and impuesto_pct <= 100),
  updated_at timestamptz not null default now(),
  check (ahorro_pct + impuesto_pct <= 100)
);
create index idx_kid_income_split_configs_family on kid_income_split_configs(family_id);

alter table kid_income_split_configs enable row level security;

-- Cualquiera de la familia puede LEER el reparto (para que el propio niño entienda por qué solo una
-- parte de lo que recibe queda disponible) — solo un adulto puede cambiarlo (petición real del prompt
-- maestro: "adulto-configurable por niño").
create policy "kid_income_split_configs: family select" on kid_income_split_configs for select
  using (family_id = private.current_family_id());
create policy "kid_income_split_configs: adult insert" on kid_income_split_configs for insert
  with check (family_id = private.current_family_id() and private.member_in_current_family(member_id) and private.current_role_in_family() in ('admin', 'adult'));
create policy "kid_income_split_configs: adult update" on kid_income_split_configs for update
  using (family_id = private.current_family_id() and private.current_role_in_family() in ('admin', 'adult'))
  with check (family_id = private.current_family_id());

-- RPC — registra un ingreso y reparte ahorro/impuesto en la MISMA transacción (atómico: o se crean las
-- 2-3 filas o ninguna). "security invoker": las propias políticas de kid_wallet_transactions (0097) son
-- la única autorización real — un niño solo puede registrarse ingresos a sí mismo, un adulto a cualquier
-- hijo de su familia; esta función no añade ni repite ninguna comprobación de permisos aparte, para que
-- nunca puedan desincronizarse. Redondea ahorro/impuesto al céntimo y dispensa de que "disponible" sea
-- siempre el resto (nunca un tercer redondeo aparte) — mismo criterio que domain/finance.ts#splitKidIncome
-- en el cliente (solo para la vista previa; el cálculo que de verdad cuenta es este).
create or replace function register_kid_income(p_member_id uuid, p_amount numeric, p_description text)
returns kid_wallet_transactions
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  v_family_id uuid := private.current_family_id();
  v_ahorro_pct integer;
  v_impuesto_pct integer;
  v_ahorro_amount numeric(10, 2);
  v_impuesto_amount numeric(10, 2);
  v_income kid_wallet_transactions;
begin
  if not exists (select 1 from family_members m where m.id = p_member_id and m.family_id = v_family_id) then
    raise exception 'member_not_found';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  select ahorro_pct, impuesto_pct into v_ahorro_pct, v_impuesto_pct
  from kid_income_split_configs where member_id = p_member_id;

  if not found then
    v_ahorro_pct := 60;
    v_impuesto_pct := 20;
  end if;

  v_ahorro_amount := round(p_amount * v_ahorro_pct / 100.0, 2);
  v_impuesto_amount := round(p_amount * v_impuesto_pct / 100.0, 2);

  insert into kid_wallet_transactions (family_id, member_id, type, amount, description)
  values (v_family_id, p_member_id, 'ingreso', p_amount, p_description)
  returning * into v_income;

  if v_ahorro_amount > 0 then
    insert into kid_wallet_transactions (family_id, member_id, type, amount, description, source_income_id)
    values (v_family_id, p_member_id, 'ahorro', v_ahorro_amount, 'Reparto automático', v_income.id);
  end if;

  if v_impuesto_amount > 0 then
    insert into kid_wallet_transactions (family_id, member_id, type, amount, description, source_income_id)
    values (v_family_id, p_member_id, 'impuesto', v_impuesto_amount, 'Reparto automático', v_income.id);
  end if;

  return v_income;
end;
$function$;

revoke all on function register_kid_income(uuid, numeric, text) from public, anon;
grant execute on function register_kid_income(uuid, numeric, text) to authenticated;
