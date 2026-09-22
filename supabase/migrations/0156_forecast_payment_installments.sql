-- Previsión de pagos — Fase 1D-c: cobro fraccionado POR CICLO (una obligación que se renueva y cada
-- renovación genera varios cargos — p. ej. un seguro anual pagado en 2 plazos). Arquitectura ya cerrada
-- en la auditoría previa: tabla hija aditiva "plantilla por ciclo", nunca materializa ocurrencias
-- futuras. Distinto del plan finito de Fase 1D-b (forecast_payments.recurrence_rule con UNTIL, sin
-- tabla nueva) — aquí la obligación puede seguir siendo indefinida (FREQ=YEARLY sin UNTIL) y lo que se
-- fracciona es CADA renovación, no el número total de renovaciones.
--
-- 100% aditivo: ninguna fila existente se modifica. El único pago real (Seguro Coche Ibiza) no tendrá
-- ninguna fila aquí, así que su comportamiento queda exactamente igual (verificado por regresión).

create table forecast_payment_installments (
  id uuid primary key default gen_random_uuid(),
  forecast_payment_id uuid not null references forecast_payments(id) on delete cascade,

  -- Posición del cargo dentro del ciclo (1, 2, 3...) — "1/2", "2/2" en la UI. Nunca se recalcula al
  -- omitir un cargo: es la posición de diseño de la plantilla, no un contador de ocurrencias reales.
  sequence_index integer not null check (sequence_index >= 1),

  -- Días desde el due_date del CICLO (la renovación) hasta este cargo concreto — nunca negativo en esta
  -- fase (un cargo antes de la renovación no es un caso pedido; se puede ampliar más adelante sin
  -- migración destructiva, solo relajando este check). La UI nunca pide un "offset": recoge una fecha
  -- humana y el formulario lo calcula (ver domain/forecastInstallmentSplitForm.ts).
  offset_days integer not null default 0 check (offset_days >= 0),

  amount_status text not null default 'known' check (amount_status in ('known', 'estimated', 'unknown')),
  amount numeric(12,2) null check (amount is null or amount >= 0),
  amount_estimated_basis text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (forecast_payment_id, sequence_index),
  constraint forecast_payment_installments_amount_matches_status check (
    (amount_status = 'unknown' and amount is null)
    or (amount_status in ('known', 'estimated') and amount is not null)
  ),
  constraint forecast_payment_installments_estimated_needs_basis check (
    amount_status <> 'estimated' or amount_estimated_basis is not null
  )
  -- Sin columna de divisa propia a propósito: un cargo es una fracción de la MISMA obligación que su
  -- forecast_payments.currency — no hay ningún caso real (ni pedido) donde el cargo 1 de un seguro sea
  -- en una divisa distinta al cargo 2. Se hereda siempre de forecast_payments en el dominio
  -- (expandForecastOccurrences), igual que ya hace forecast_occurrences con matched_expense_id/amount
  -- respecto al resto de campos que no repite (categoría, título...).
);

create index forecast_payment_installments_payment_idx on forecast_payment_installments(forecast_payment_id);

alter table forecast_payment_installments enable row level security;
create policy "forecast_payment_installments: family crud" on forecast_payment_installments for all
  using (exists (
    select 1 from forecast_payments fp
    where fp.id = forecast_payment_installments.forecast_payment_id
      and fp.family_id = private.current_family_id() and private.has_section_access('dinero')
  ))
  with check (exists (
    select 1 from forecast_payments fp
    where fp.id = forecast_payment_installments.forecast_payment_id
      and fp.family_id = private.current_family_id() and private.has_section_access('dinero')
  ));

-- ============================================================
-- forecast_occurrences — ampliación ADITIVA para identificar un cargo concreto dentro de un ciclo
-- fraccionado (hallazgo de la auditoría: forecast_payment_id + occurrence_date por sí solos no
-- distinguirían dos cargos que excepcionalmente cayeran el mismo día). 0 = el override es del CICLO
-- completo (comportamiento actual, sin cambios); 1..N = de un cargo concreto (su sequence_index).
--
-- NOT NULL DEFAULT 0 en vez de NULL: un NULL en una constraint UNIQUE no colisiona consigo mismo en
-- Postgres, así que dos filas "sin cargo concreto" para el mismo ciclo NO romperían la unicidad y se
-- perdería la protección que ya existe hoy. Con 0 como valor real, la unicidad queda intacta para el
-- caso sin fraccionar (el 100% de los pagos reales de momento) y se amplía limpiamente para cuando sí
-- hay cargos. El dominio (data/forecast.ts) traduce 0 ↔ null en la frontera TypeScript.
alter table forecast_occurrences add column installment_sequence_index integer not null default 0 check (installment_sequence_index >= 0);

alter table forecast_occurrences drop constraint forecast_occurrences_forecast_payment_id_occurrence_date_key;
alter table forecast_occurrences add constraint forecast_occurrences_payment_occurrence_split_key
  unique (forecast_payment_id, occurrence_date, installment_sequence_index);
