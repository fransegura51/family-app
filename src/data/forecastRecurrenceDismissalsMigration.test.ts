import { describe, expect, it } from 'vitest'

// Guardas de la FASE 1D-g — "No me interesa" (migración 0158). Mismo patrón que
// forecastReconciliationMigration.test.ts: lo que un test de dominio puro no puede comprobar (RLS,
// unicidad real, FK) se verifica leyendo el SQL real de la migración.
const FILES = import.meta.glob(['/supabase/migrations/0158_forecast_recurrence_dismissals.sql', '/supabase/rollbacks/0158_forecast_recurrence_dismissals_down.sql'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
const MIGRATION = FILES['/supabase/migrations/0158_forecast_recurrence_dismissals.sql']
const ROLLBACK = FILES['/supabase/rollbacks/0158_forecast_recurrence_dismissals_down.sql']
const SQL = MIGRATION.replace(/--[^\n]*/g, '')
const APP = import.meta.glob(['/src/**/*.ts', '/src/**/*.tsx', '!/src/**/*.test.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const DATA_FORECAST = APP['/src/data/forecast.ts']

describe('12/13/15) forecast_recurrence_dismissals — RLS por familia, sin aprendizaje compartido', () => {
  it('family_id + account_id + merchant_key, con restricción única — descartar dos veces es idempotente (upsert), nunca una fila duplicada', () => {
    expect(SQL).toContain('family_id uuid not null references families(id) on delete cascade')
    expect(SQL).toContain('account_id uuid not null references bank_accounts(id) on delete cascade')
    expect(SQL).toContain("merchant_key text not null check (btrim(merchant_key) <> '')")
    expect(SQL).toContain('unique (family_id, account_id, merchant_key)')
  })

  it('RLS habilitada con una policy real (nunca una tabla "enable row level security" sin ninguna policy)', () => {
    expect(SQL).toContain('alter table forecast_recurrence_dismissals enable row level security')
    expect(SQL).toContain('create policy "forecast_recurrence_dismissals: family crud" on forecast_recurrence_dismissals for all')
  })

  it('la policy exige family_id = la familia real de quien llama — nunca se confía en un family_id que mande el cliente', () => {
    expect(SQL).toContain('family_id = private.current_family_id()')
    expect(SQL).toContain("private.has_section_access('dinero')")
  })

  // Fase 1E.0 — esta versión de la policy (0158, tal como se aplicó de verdad) tenía un bug real: el
  // `family_id` sin cualificar dentro del EXISTS se resolvía a bank_connections.family_id (sombreado de
  // nombre en el subquery correlacionado), no al family_id de la propia fila — quedaba
  // "c.family_id = c.family_id", una tautología que nunca protegía nada. El texto de ESTE archivo es
  // historia inmutable (la migración ya se aplicó tal cual) — la comprobación real de que account_id
  // pertenece de verdad a la familia vive ahora en la policy corregida de la migración 0159, ver
  // forecastRecurrenceDismissalsRlsFixMigration.test.ts.
  it('el join bank_accounts→bank_connections existe en el texto original de 0158, aunque su condición de family_id tenía el bug corregido en 0159', () => {
    const policyIdx = SQL.indexOf('create policy "forecast_recurrence_dismissals: family crud"')
    const policyBody = SQL.slice(policyIdx)
    expect(policyBody).toContain('join bank_connections c on c.id = a.connection_id')
    expect(policyBody).toContain('where a.id = account_id and c.family_id = family_id')
  })

  it('nunca SECURITY DEFINER, nunca una función que se salte la RLS — solo tabla + policy normales', () => {
    expect(SQL).not.toMatch(/security definer/i)
    expect(SQL).not.toMatch(/create (or replace )?function/i)
  })

  it('no se guarda ningún dato financiero sensible (importe, fecha del cargo, IBAN) — solo la clave de agrupación y quién/cuándo descartó', () => {
    expect(SQL).not.toMatch(/amount|iban|transaction_date/i)
  })

  it('el rollback deshace exactamente la tabla creada', () => {
    expect(ROLLBACK).toContain('drop table if exists forecast_recurrence_dismissals')
  })
})

describe('data/forecast.ts — listForecastRecurrenceDismissals/dismissForecastRecurrence', () => {
  it('la clave leída (accountId::merchantKey) es la MISMA forma que usa domain/forecastRecurrenceDetection.ts — nunca dos transformaciones que puedan desincronizarse', () => {
    const idx = DATA_FORECAST.indexOf('export async function listForecastRecurrenceDismissals')
    const body = DATA_FORECAST.slice(idx, DATA_FORECAST.indexOf('\n}', idx))
    expect(body).toContain('`${r.account_id}::${r.merchant_key}`')
  })

  it('dismissForecastRecurrence hace upsert (idempotente) por la clave única real de la migración — nunca un insert plano que fallaría al repetir', () => {
    const idx = DATA_FORECAST.indexOf('export async function dismissForecastRecurrence')
    const body = DATA_FORECAST.slice(idx, DATA_FORECAST.indexOf('\n}', idx))
    expect(body).toContain(".upsert(")
    expect(body).toContain("onConflict: 'family_id,account_id,merchant_key'")
  })

  it('el family_id nunca lo manda quien llama (mismo criterio que createForecastPayment) — se resuelve siempre en el servidor/cliente autenticado, nunca un parámetro de fuera', () => {
    const idx = DATA_FORECAST.indexOf('export async function dismissForecastRecurrence')
    const signatureLine = DATA_FORECAST.slice(idx, DATA_FORECAST.indexOf(')', idx))
    expect(signatureLine).not.toMatch(/familyId/)
    expect(DATA_FORECAST.slice(idx, DATA_FORECAST.indexOf('\n}', idx))).toContain('currentFamilyAndUser()')
  })
})
