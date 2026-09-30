-- Previsión de pagos — conciliación bancaria: "No es este" debe persistir.
--
-- Auditoría real (2026-09-30): dismissedCandidateKeys vivía solo en useState de EventosScreen... (en
-- realidad FinanceScreen.tsx) — se perdía al salir de la pantalla, recargar o cerrar la PWA, así que la
-- misma pareja (previsión, movimiento) volvía a proponerse. La identidad ya era correcta en el cliente
-- (candidateKey combina AMBOS lados), solo faltaba persistencia real.
--
-- Deliberadamente NO se reutiliza forecast_recurrence_dismissals (0158): esa tabla descarta un PATRÓN de
-- comercio recurrente detectado en el histórico bancario (accountId + merchantKey, sin ninguna previsión
-- concreta de por medio) — una semántica distinta. Aquí se descarta una PAREJA exacta: una ocurrencia
-- concreta de una previsión concreta ↔ un movimiento bancario concreto. Mezclar las dos convertiría
-- forecast_recurrence_dismissals en dos cosas a la vez — se crea una tabla nueva y mínima, mismo patrón.
--
-- La pareja completa (forecast_payment_id, occurrence_date, installment_sequence_index,
-- bank_transaction_id) es la MISMA clave que ya usa candidateKey en el cliente — nunca se bloquea un lado
-- por separado: el movimiento sigue disponible como candidato de otra previsión, y la previsión sigue
-- pudiendo recibir otro movimiento como candidato.
create table forecast_reconciliation_dismissals (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  forecast_payment_id uuid not null references forecast_payments(id) on delete cascade,
  occurrence_date date not null,
  installment_sequence_index int not null default 0,
  bank_transaction_id uuid not null references bank_transactions(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  dismissed_by uuid null references profiles(id) on delete set null,
  -- Descartar la misma pareja dos veces es idempotente (mismo criterio que match_forecast_occurrence y
  -- forecast_recurrence_dismissals): el cliente hace upsert por esta misma clave.
  unique (forecast_payment_id, occurrence_date, installment_sequence_index, bank_transaction_id)
);

create index forecast_reconciliation_dismissals_family_idx on forecast_reconciliation_dismissals(family_id);
create index forecast_reconciliation_dismissals_payment_idx on forecast_reconciliation_dismissals(forecast_payment_id);
create index forecast_reconciliation_dismissals_transaction_idx on forecast_reconciliation_dismissals(bank_transaction_id);

alter table forecast_reconciliation_dismissals enable row level security;

-- Mismo patrón reforzado que forecast_occurrences (join a forecast_payments) y forecast_recurrence_dismissals
-- (join a bank_accounts/bank_connections) — nunca basta con que el cliente mande un family_id que "diga"
-- ser el suyo: se comprueba de verdad que AMBOS lados de la pareja pertenecen a esa familia.
create policy "forecast_reconciliation_dismissals: family crud" on forecast_reconciliation_dismissals for all
  using (
    family_id = private.current_family_id()
    and private.has_section_access('dinero')
    and exists (select 1 from forecast_payments fp where fp.id = forecast_payment_id and fp.family_id = family_id)
    and exists (
      select 1 from bank_transactions bt
      join bank_accounts a on a.id = bt.account_id
      join bank_connections c on c.id = a.connection_id
      where bt.id = bank_transaction_id and c.family_id = family_id
    )
  )
  with check (
    family_id = private.current_family_id()
    and private.has_section_access('dinero')
    and exists (select 1 from forecast_payments fp where fp.id = forecast_payment_id and fp.family_id = family_id)
    and exists (
      select 1 from bank_transactions bt
      join bank_accounts a on a.id = bt.account_id
      join bank_connections c on c.id = a.connection_id
      where bt.id = bank_transaction_id and c.family_id = family_id
    )
  );
