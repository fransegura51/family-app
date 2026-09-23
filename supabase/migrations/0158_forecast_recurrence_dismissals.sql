-- Previsión de pagos — Fase 1D-g: detección de posibles pagos recurrentes desde el histórico bancario.
-- Auditoría previa (sin código): no existe en todo el repositorio ningún mecanismo "PEPA propone → la
-- familia descarta → se recuerda" (el único "buzón de sugerencias" es feedback familia→admin, no
-- aplica; shared_product_learning es aprendizaje GLOBAL sin family_id, sin concepto de rechazo, y el
-- encargo prohíbe explícitamente compartir patrones financieros entre familias). Hace falta una tabla
-- nueva, mínima, de un solo propósito.
--
-- merchant_key es la MISMA clave de agrupación que usa el detector (domain/forecastRecurrenceDetection.ts:
-- normalizeMerchantKey — la descripción bancaria recortada y en mayúsculas, sin normalización agresiva
-- que pudiera fusionar comercios distintos). No se guarda ningún importe ni fecha: descartar un patrón
-- no es un dato financiero sensible en sí mismo, solo una preferencia de la familia sobre qué avisos
-- quiere seguir viendo.
--
-- RLS: mismo patrón que forecast_payments/forecast_occurrences (family_id + has_section_access('dinero')),
-- reforzado con una comprobación real de que account_id pertenece de verdad a esa familia (igual
-- comprobación que ya usa la policy de bank_transactions) — nunca basta con que el cliente mande un
-- family_id que "diga" ser el suyo.
create table forecast_recurrence_dismissals (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  account_id uuid not null references bank_accounts(id) on delete cascade,
  merchant_key text not null check (btrim(merchant_key) <> ''),
  dismissed_at timestamptz not null default now(),
  dismissed_by uuid null references profiles(id) on delete set null,
  -- Descartar el mismo patrón dos veces es idempotente (mismo criterio que match_forecast_occurrence,
  -- Fase 1D-e): el cliente hace upsert por esta misma clave, nunca inserta una fila duplicada.
  unique (family_id, account_id, merchant_key)
);

create index forecast_recurrence_dismissals_family_idx on forecast_recurrence_dismissals(family_id);
create index forecast_recurrence_dismissals_account_idx on forecast_recurrence_dismissals(account_id);

alter table forecast_recurrence_dismissals enable row level security;

create policy "forecast_recurrence_dismissals: family crud" on forecast_recurrence_dismissals for all
  using (
    family_id = private.current_family_id()
    and private.has_section_access('dinero')
    and exists (
      select 1 from bank_accounts a
      join bank_connections c on c.id = a.connection_id
      where a.id = account_id and c.family_id = family_id
    )
  )
  with check (
    family_id = private.current_family_id()
    and private.has_section_access('dinero')
    and exists (
      select 1 from bank_accounts a
      join bank_connections c on c.id = a.connection_id
      where a.id = account_id and c.family_id = family_id
    )
  );
