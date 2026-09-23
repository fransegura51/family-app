import { describe, expect, it } from 'vitest'

// Guardas de la FASE 1D-e — conciliación bancaria (migración 0157). Comprueban lo que un test de dominio
// puro no puede: la protección real contra duplicados/carreras vive en la base de datos (índice único +
// RPC atómica), no en React — así que se verifica leyendo el SQL real, igual que classifyPurchaseMigration.test.ts.
const FILES = import.meta.glob(['/supabase/migrations/0157_forecast_reconciliation.sql', '/supabase/rollbacks/0157_forecast_reconciliation_down.sql'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
const MIGRATION = FILES['/supabase/migrations/0157_forecast_reconciliation.sql']
const ROLLBACK = FILES['/supabase/rollbacks/0157_forecast_reconciliation_down.sql']
const SQL = MIGRATION.replace(/--[^\n]*/g, '')
const APP = import.meta.glob(['/src/**/*.ts', '/src/**/*.tsx', '!/src/**/*.test.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const DATA_FORECAST = APP['/src/data/forecast.ts']
const ALL_MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const FORECAST_PAYMENTS_MIGRATION = ALL_MIGRATIONS['/supabase/migrations/0155_forecast_payments.sql']

describe('11/12) un mismo expense no puede conciliar dos ocurrencias — protección real en la base de datos, nunca solo en React', () => {
  it('índice único parcial sobre matched_expense_id (WHERE not null) — no existía antes de esta fase', () => {
    expect(SQL).toContain('create unique index forecast_occurrences_matched_expense_unique')
    expect(SQL).toMatch(/on forecast_occurrences \(matched_expense_id\)\s*where matched_expense_id is not null/)
  })

  it('el rollback deshace exactamente lo que crea la migración, en orden inverso', () => {
    expect(ROLLBACK).toContain('drop function if exists match_forecast_occurrence')
    expect(ROLLBACK).toContain('drop index if exists forecast_occurrences_matched_expense_unique')
  })
})

describe('13) doble confirmación idempotente / conciliar una ocurrencia ya conciliada con OTRO expense nunca la pisa en silencio', () => {
  it('match_forecast_occurrence es una función atómica (INSERT ... ON CONFLICT), nunca dos sentencias sueltas desde el cliente', () => {
    expect(SQL).toContain('create or replace function match_forecast_occurrence(')
    expect(SQL).toContain('on conflict (forecast_payment_id, occurrence_date, installment_sequence_index)')
  })

  it('el UPDATE del conflicto solo se aplica si la fila está libre o ya era EL MISMO expense — nunca sobrescribe una conciliación distinta en silencio', () => {
    expect(SQL).toContain('where forecast_occurrences.matched_expense_id is null or forecast_occurrences.matched_expense_id = excluded.matched_expense_id')
  })

  it('si la fila ya estaba conciliada con OTRO expense, lanza una excepción explícita (nunca un error genérico ni un éxito silencioso)', () => {
    expect(SQL).toContain("raise exception 'forecast_occurrence_already_matched'")
  })

  it('data/forecast.ts traduce esa excepción a un mensaje humano, nunca deja pasar el error crudo de Postgres', () => {
    expect(DATA_FORECAST).toContain("supabase.rpc('match_forecast_occurrence'")
    expect(DATA_FORECAST).toContain('forecast_occurrence_already_matched')
    expect(DATA_FORECAST).toContain('ya se había conciliado con otro movimiento distinto')
  })
})

describe('17) el snapshot del importe esperado nunca se pisa una vez conciliado', () => {
  it('amount_status/amount/amount_estimated_basis solo se escriben cuando la fila se crea de cero (coalesce con el valor YA existente, nunca lo reemplaza)', () => {
    expect(SQL).toContain('amount_status = coalesce(forecast_occurrences.amount_status, excluded.amount_status)')
    expect(SQL).toMatch(/amount = case when forecast_occurrences\.amount_status is null then excluded\.amount else forecast_occurrences\.amount end/)
  })

  it('nunca toca due_date_override/expected_payment_date_override — conciliar no reescribe fechas', () => {
    const insertClause = SQL.slice(SQL.indexOf('do update set'), SQL.indexOf('where forecast_occurrences.matched_expense_id is null'))
    expect(insertClause).not.toContain('due_date_override')
    expect(insertClause).not.toContain('expected_payment_date_override')
  })
})

describe('14) desconciliar restaura el estado pendiente sin borrar nada más', () => {
  it('unmatchForecastOccurrence solo hace UPDATE matched_expense_id=null — nunca DELETE de la fila, nunca toca bank_transactions/expenses/forecast_payments', () => {
    const fnIdx = DATA_FORECAST.indexOf('export async function unmatchForecastOccurrence')
    const fnBody = DATA_FORECAST.slice(fnIdx, DATA_FORECAST.indexOf('\n}', fnIdx))
    expect(fnBody).toContain("update({ matched_expense_id: null")
    expect(fnBody).not.toMatch(/\.delete\(/)
    expect(fnBody).not.toContain("from('bank_transactions')")
    expect(fnBody).not.toContain("from('expenses')")
    expect(fnBody).not.toContain("from('forecast_payments')")
  })

  it('condicionado al expense que se cree desconciliar — idempotente: reintentar o desconciliar algo ya desconciliado no falla ni afecta a otra fila', () => {
    const fnIdx = DATA_FORECAST.indexOf('export async function unmatchForecastOccurrence')
    const fnBody = DATA_FORECAST.slice(fnIdx, DATA_FORECAST.indexOf('\n}', fnIdx))
    expect(fnBody).toContain(".eq('matched_expense_id', expenseId)")
  })
})

describe('replaceForecastPlanOverrides nunca pierde una conciliación al reeditar el plan (riesgo real detectado en la auditoría de esta fase)', () => {
  it('nunca borra una fila con matched_expense_id no nulo', () => {
    const fnIdx = DATA_FORECAST.indexOf('export async function replaceForecastPlanOverrides')
    const fnBody = DATA_FORECAST.slice(fnIdx, DATA_FORECAST.indexOf('\nexport ', fnIdx + 10))
    expect(fnBody).toContain(".is('matched_expense_id', null)")
  })

  it('nunca intenta reinsertar una fecha que ya está conciliada (evita el choque con la fila que se conservó)', () => {
    const fnIdx = DATA_FORECAST.indexOf('export async function replaceForecastPlanOverrides')
    const fnBody = DATA_FORECAST.slice(fnIdx, DATA_FORECAST.indexOf('\nexport ', fnIdx + 10))
    expect(fnBody).toContain('matchedDates.has(o.occurrenceDate)')
  })
})

describe('21) RLS — una familia jamás puede conciliar contra movimientos de otra familia', () => {
  it('match_forecast_occurrence es SECURITY INVOKER (nunca DEFINER): hereda la RLS real de quien llama, no se salta nada', () => {
    expect(SQL).toContain('security invoker')
    expect(SQL).not.toMatch(/security definer/i)
  })

  it('permiso restringido a authenticated — nunca ejecutable por anon/public', () => {
    expect(SQL).toContain('revoke all on function match_forecast_occurrence')
    expect(SQL).toMatch(/grant execute on function match_forecast_occurrence\([^)]*\) to authenticated;/)
  })

  it('la RLS real que protege forecast_occurrences (family crud, ya existente desde 0155) sigue intacta — esta migración no la toca ni la redefine', () => {
    expect(SQL).not.toMatch(/create policy/i)
    expect(SQL).not.toMatch(/alter policy/i)
    expect(FORECAST_PAYMENTS_MIGRATION).toContain('create policy "forecast_occurrences: family crud" on forecast_occurrences for all')
  })

  it('la función escribe en forecast_occurrences con un INSERT/UPDATE normal — la RLS de esa tabla se aplica exactamente igual que si el cliente hiciera el upsert directamente', () => {
    expect(SQL).toContain('insert into forecast_occurrences (')
    expect(SQL).not.toMatch(/set role/i)
    expect(SQL).not.toMatch(/bypass/i)
  })
})

describe('listAllMatchedForecastExpenseIds — nunca expone más que los expense_id ya usados (RLS acota a la familia)', () => {
  it('lee matched_expense_id de forecast_occurrences a través del cliente normal (RLS), nunca con service role ni una función sin restricción', () => {
    const fnIdx = DATA_FORECAST.indexOf('export async function listAllMatchedForecastExpenseIds')
    const fnBody = DATA_FORECAST.slice(fnIdx, DATA_FORECAST.indexOf('\n}', fnIdx))
    expect(fnBody).toContain("supabase.from('forecast_occurrences')")
    expect(fnBody).not.toContain('service_role')
  })
})
