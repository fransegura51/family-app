import { describe, expect, it } from 'vitest'

// Fase 1D-c — Edge Functions y cobro fraccionado por ciclo. Hallazgo real de esta fase: NI
// send-due-reminders NI sync-calendar-to-google-cron necesitan ningún cambio de código, porque las dos
// piezas que tocan Previsión ya eran "cycle-only" por diseño desde Fases 1B/1B.1 — exactamente el
// comportamiento pedido aquí (avisos y proyección de Calendario a nivel de la OBLIGACIÓN/renovación,
// nunca uno por cada cargo). Esto se demuestra leyendo el código real desplegado (mismo patrón que
// forecastGoogleSyncCertification.test.ts), no solo afirmándolo.
const FUNCTIONS = import.meta.glob('/supabase/functions/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const SEND_DUE_REMINDERS = FUNCTIONS['/supabase/functions/send-due-reminders/index.ts']
const SYNC_GOOGLE_CRON = FUNCTIONS['/supabase/functions/sync-calendar-to-google-cron/index.ts']

describe('send-due-reminders sigue siendo cycle-only — ningún drift con domain/forecast.ts al añadir cargos', () => {
  it('no consulta forecast_payment_installments en absoluto — los avisos siguen siendo por ciclo, no por cargo', () => {
    expect(SEND_DUE_REMINDERS).not.toContain('forecast_payment_installments')
  })

  it('collectDueForecastReminders sigue calculando UNA fecha de aviso por ciclo (occurrenceForCycle, sin fan-out)', () => {
    const idx = SEND_DUE_REMINDERS.indexOf('function collectDueForecastReminders')
    expect(idx).toBeGreaterThan(-1)
    const body = SEND_DUE_REMINDERS.slice(idx, SEND_DUE_REMINDERS.indexOf('\n}', idx))
    expect(body).toContain('occurrenceForCycle(payment.due_date, rule, n)')
    expect(body).not.toContain('installment')
  })

  it('advanceForecastCalendarProjections sigue moviendo la proyección visual SOLO a la siguiente renovación — nunca a un cargo', () => {
    const idx = SEND_DUE_REMINDERS.indexOf('function advanceForecastCalendarProjections')
    expect(idx).toBeGreaterThan(-1)
    const body = SEND_DUE_REMINDERS.slice(idx, SEND_DUE_REMINDERS.indexOf('async function sendDueForecastReminders', idx))
    expect(body).not.toContain('installment')
    expect(body).not.toContain('forecast_payment_installments')
  })
})

describe('sync-calendar-to-google-cron: sin relación con Previsión, confirmado — no puede haber drift de algo que no toca', () => {
  it('no referencia ninguna tabla forecast_* — el único punto de contacto es sync_to_google en calendar_events, ajeno a los cargos', () => {
    expect(SYNC_GOOGLE_CRON).not.toMatch(/forecast_/)
  })
})

describe('la proyección visual de Calendario nunca genera un evento por cada cargo (data/forecast.ts)', () => {
  const APP = import.meta.glob(['/src/data/forecast.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  const CLIENT_DATA_FORECAST = APP['/src/data/forecast.ts']

  it('syncForecastCalendarProjection nunca recibe installments — sigue siendo cycle-only por diseño', () => {
    const idx = CLIENT_DATA_FORECAST.indexOf('async function syncForecastCalendarProjection')
    expect(idx).toBeGreaterThan(-1)
    const body = CLIENT_DATA_FORECAST.slice(idx, CLIENT_DATA_FORECAST.indexOf('\n}', idx + 200))
    expect(body).not.toContain('installment')
  })
})
