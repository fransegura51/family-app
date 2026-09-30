import { describe, expect, it } from 'vitest'

// Guardas de "No es este" persistido (migración 0174, 2026-09-30). Mismo patrón que
// forecastRecurrenceDismissalsMigration.test.ts: lo que un test de dominio puro no puede comprobar (RLS,
// unicidad real, FK) se verifica leyendo el SQL real de la migración.
//
// Deliberadamente NO reutiliza forecast_recurrence_dismissals (0158): esa tabla descarta un PATRÓN de
// comercio recurrente (accountId + merchantKey, sin previsión concreta) — semántica distinta de descartar
// una PAREJA exacta previsión↔movimiento.
const FILES = import.meta.glob('/supabase/migrations/0174_forecast_reconciliation_dismissals.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const MIGRATION = FILES['/supabase/migrations/0174_forecast_reconciliation_dismissals.sql']
const SQL = MIGRATION.replace(/--[^\n]*/g, '')
const APP = import.meta.glob(['/src/**/*.ts', '!/src/**/*.test.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const DATA_FORECAST = APP['/src/data/forecast.ts']
const DOMAIN_RECONCILIATION = APP['/src/domain/forecastReconciliation.ts']

describe('forecast_reconciliation_dismissals — identidad de la pareja completa, nunca un lado solo', () => {
  it('las 4 columnas de identidad (previsión + fecha + cuota + movimiento) + family_id, con restricción única — descartar dos veces es idempotente, nunca una fila duplicada', () => {
    expect(SQL).toContain('family_id uuid not null references families(id) on delete cascade')
    expect(SQL).toContain('forecast_payment_id uuid not null references forecast_payments(id) on delete cascade')
    expect(SQL).toContain('occurrence_date date not null')
    expect(SQL).toContain('installment_sequence_index int not null default 0')
    expect(SQL).toContain('bank_transaction_id uuid not null references bank_transactions(id) on delete cascade')
    expect(SQL).toContain('unique (forecast_payment_id, occurrence_date, installment_sequence_index, bank_transaction_id)')
  })

  it('RLS habilitada con una policy real (nunca una tabla "enable row level security" sin ninguna policy)', () => {
    expect(SQL).toContain('alter table forecast_reconciliation_dismissals enable row level security')
    expect(SQL).toContain('create policy "forecast_reconciliation_dismissals: family crud" on forecast_reconciliation_dismissals for all')
  })

  it('la policy comprueba de verdad que AMBOS lados pertenecen a la familia — nunca se confía en el family_id que mande el cliente (mismo criterio reforzado que forecast_occurrences y forecast_recurrence_dismissals ya corregida en 0159)', () => {
    expect(SQL).toContain('family_id = private.current_family_id()')
    expect(SQL).toContain("private.has_section_access('dinero')")
    const policyIdx = SQL.indexOf('create policy "forecast_reconciliation_dismissals: family crud"')
    const policyBody = SQL.slice(policyIdx)
    expect(policyBody).toContain('exists (select 1 from forecast_payments fp where fp.id = forecast_payment_id and fp.family_id = family_id)')
    expect(policyBody).toContain('join bank_accounts a on a.id = bt.account_id')
    expect(policyBody).toContain('join bank_connections c on c.id = a.connection_id')
    expect(policyBody).toContain('where bt.id = bank_transaction_id and c.family_id = family_id')
  })

  it('nunca SECURITY DEFINER, nunca una función que se salte la RLS — solo tabla + policy normales', () => {
    expect(SQL).not.toMatch(/security definer/i)
    expect(SQL).not.toMatch(/create (or replace )?function/i)
  })
})

describe('data/forecast.ts — listForecastReconciliationDismissals/dismissForecastReconciliationCandidate', () => {
  it('la clave leída es la MISMA forma que domain/forecastReconciliation.ts (reconciliationPairKey) — nunca dos transformaciones que puedan desincronizarse', () => {
    const idx = DATA_FORECAST.indexOf('export async function listForecastReconciliationDismissals')
    const body = DATA_FORECAST.slice(idx, DATA_FORECAST.indexOf('\n}', idx))
    expect(body).toContain('`${r.forecast_payment_id}:${r.occurrence_date}:${r.installment_sequence_index}:${r.bank_transaction_id}`')
    expect(DOMAIN_RECONCILIATION).toContain(
      "`${occurrence.forecastPaymentId}:${occurrence.occurrenceDate}:${occurrence.installmentSequenceIndex ?? 0}:${movement.bankTransactionId}`",
    )
  })

  it('dismissForecastReconciliationCandidate hace upsert (idempotente) por la clave única real de la migración — nunca un insert plano que fallaría al repetir', () => {
    const idx = DATA_FORECAST.indexOf('export async function dismissForecastReconciliationCandidate')
    const body = DATA_FORECAST.slice(idx, DATA_FORECAST.indexOf('\n}', idx))
    expect(body).toContain('.upsert(')
    expect(body).toContain("onConflict: 'forecast_payment_id,occurrence_date,installment_sequence_index,bank_transaction_id'")
  })

  it('el family_id nunca lo manda quien llama — se resuelve siempre con currentFamilyAndUser(), nunca un parámetro de fuera', () => {
    const idx = DATA_FORECAST.indexOf('export async function dismissForecastReconciliationCandidate')
    const signatureEnd = DATA_FORECAST.indexOf('): Promise<void> {', idx)
    const signature = DATA_FORECAST.slice(idx, signatureEnd)
    expect(signature).not.toMatch(/familyId/)
    expect(DATA_FORECAST.slice(idx, DATA_FORECAST.indexOf('\n}', idx))).toContain('currentFamilyAndUser()')
  })
})
