import { describe, expect, it } from 'vitest'

// Bug real reportado (Parte B, Fase 3): un encargo resuelto con proveedor y 100€ (p. ej. "Flores") no
// aparecía en Presupuesto aunque sí estaba en "🧾 Pagos y fianzas" — resolveEventTaskGroup crea el
// event_payment pero a propósito nunca toca event_budget_items (son conceptos distintos: una oferta, un
// contrato y un pago parcial no son la misma cifra). Fix: BudgetSection enseña "Comprometido" aparte de
// "Planificado" y "Gastado en Economía", sumando event_payments.totalAmount — nunca fusionado con las
// otras dos cifras. Punto 3.4 (prompt de correcciones) — ya no se llama "vía encargos": un pago puede
// registrarse sin pasar por ningún encargo, así que el nombre reflejaba mal su origen real.
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
    expect(BUDGET_SECTION).toContain('listEventPayments(event.id).then(setPayments)')
    expect(BUDGET_SECTION).toContain('const committed = payments.length > 0 ? payments.reduce((sum, p) => sum + p.totalAmount, 0) : null')
  })
  it('se enseña en su propio indicador compacto ("Comprometido", ya no "vía encargos"), nunca sumado con Planificado ni con Gastado en Economía', () => {
    expect(BUDGET_SECTION).toContain('label="Comprometido"')
    expect(BUDGET_SECTION).not.toContain('vía encargos')
    const tile = window_(BUDGET_SECTION, 'label="Comprometido"', '/>')
    expect(tile).toContain('value={committed ?? 0}')
  })
  it('nunca escribe en event_budget_items al calcular lo comprometido — solo lee event_payments', () => {
    const reloadFn = window_(BUDGET_SECTION, 'function reload(', '\n  useEffect(reload')
    expect(reloadFn).not.toContain('addEventBudgetItem')
    expect(reloadFn).not.toContain('updateEventBudgetItem')
  })
})
