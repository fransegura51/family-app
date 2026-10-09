import { describe, expect, it } from 'vitest'

// Bug real reportado (Parte B, Fase 3): un encargo resuelto con proveedor y 100€ (p. ej. "Flores") no
// aparecía en Presupuesto aunque sí estaba en "🧾 Pagos y fianzas" — resolveEventTaskGroup crea el
// event_payment pero a propósito nunca toca event_budget_items (son conceptos distintos: una oferta, un
// contrato y un pago parcial no son la misma cifra). Fix: BudgetSection enseña "Comprometido vía
// encargos" aparte de "Planeado" y "Gastado en Economía", sumando event_payments.totalAmount — nunca
// fusionado con las otras dos cifras.
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const BUDGET_SECTION = window_(UI, 'function BudgetSection(', '\nfunction AddBudgetItemModal')

describe('BudgetSection — "Comprometido vía encargos" se calcula y muestra aparte de Planeado/Gastado', () => {
  it('carga event_payments y suma totalAmount de TODOS los pagos (se hayan pagado ya o no)', () => {
    expect(BUDGET_SECTION).toContain('listEventPayments(event.id)')
    expect(BUDGET_SECTION).toContain('setCommitted(payments.reduce((sum, p) => sum + p.totalAmount, 0))')
  })
  it('se enseña en su propia línea, nunca sumado al <strong>{planned...}</strong> ni al <strong>{spent...}</strong>', () => {
    expect(BUDGET_SECTION).toContain('Comprometido vía encargos: <strong>{committed.toFixed(2)} €</strong>')
    const committedLine = window_(BUDGET_SECTION, 'Comprometido vía encargos: <strong>', '</p>')
    expect(committedLine).not.toContain('planned')
    expect(committedLine).not.toContain('spent')
  })
  it('nunca escribe en event_budget_items al calcular lo comprometido — solo lee event_payments', () => {
    const reloadFn = window_(BUDGET_SECTION, 'function reload(', '\n  useEffect(reload')
    expect(reloadFn).not.toContain('addEventBudgetItem')
    expect(reloadFn).not.toContain('updateEventBudgetItem')
  })
})
