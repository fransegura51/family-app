import { describe, expect, it } from 'vitest'

// PEPA Eventos, prompt maestro — Fase 9: Parte D (Presupuesto: Planeado/Comprometido/PAGADO/Gastado) y
// Parte E (Pagos y fianzas: tarjetas compactas plegables + filtro, "Corregir lo pagado" intacto, nunca
// genera movimientos bancarios).
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const BUDGET_SECTION = window_(UI, 'function BudgetSection(', '\nfunction AddBudgetItemModal')
const PAYMENTS_SECTION = window_(UI, 'function PaymentsSection(', '\nfunction AddPaymentModal(')

describe('Parte D — "Pagado de lo comprometido" es una CUARTA cifra, nunca igualada ni confundida con "Comprometido"', () => {
  it('se calcula a partir de depositPaid de los mismos pagos que ya se leen para "Comprometido" (una sola llamada, nunca una segunda consulta)', () => {
    const reloadFn = window_(BUDGET_SECTION, 'function reload(', '\n  useEffect(reload')
    expect(reloadFn).toContain('listEventPayments(event.id).then(setPayments)')
    expect((reloadFn.match(/listEventPayments\(/g) ?? []).length).toBe(1)
    expect(BUDGET_SECTION).toContain('const paidOfCommitted = payments.length > 0 ? payments.reduce((sum, p) => sum + p.depositPaid, 0) : null')
  })
  it('se muestra junto al total comprometido ("X € de Y €"), nunca como una cifra suelta sin ese contexto', () => {
    expect(BUDGET_SECTION).toContain('Pagado de lo comprometido: <strong>{paidOfCommitted.toFixed(2)} €</strong> de {committed.toFixed(2)} €')
  })
})

describe('Parte E — tarjetas de pago compactas y plegables (mismo patrón ▸/▾ que Ofertas/Servicios)', () => {
  it('la cabecera (siempre visible) resume concepto, proveedor, total y estado — el detalle solo se ve con la tarjeta abierta', () => {
    const headerLine = window_(PAYMENTS_SECTION, "<div key={p.id} className=\"card task-card\">", '{open && (')
    expect(headerLine).toContain('onClick={() => toggleOpen(p.id)}')
    expect(headerLine).toContain('PAYMENT_STATUS_LABELS[p.status]')
  })
  it('"Corregir lo pagado" y "Marcar como pagado del todo" siguen existiendo tal cual, solo movidos dentro del detalle plegable', () => {
    expect(PAYMENTS_SECTION).toContain('✏️ Corregir lo pagado')
    expect(PAYMENTS_SECTION).toContain('label="Marcar como pagado del todo"')
    expect(PAYMENTS_SECTION).toContain('updateEventPayment(p.id, { depositPaid, status: paymentStatusForAmounts(p.totalAmount, depositPaid) })')
  })
  it('nunca se introduce ninguna llamada a un sistema de movimientos bancarios', () => {
    expect(PAYMENTS_SECTION).not.toMatch(/bank|movement|sincroniz/i)
  })
})

describe('Parte E — filtro por estado (Todos/Pendientes/Pagados del todo), sin tocar los datos', () => {
  it('el filtro es puramente de visualización — visiblePayments se deriva de payments, nunca al revés', () => {
    expect(PAYMENTS_SECTION).toContain(
      "const filtered = payments.filter((p) => (filter === 'todos' ? true : filter === 'pagados' ? p.status === 'pagado' : p.status !== 'pagado'))",
    )
    expect(PAYMENTS_SECTION).toContain('const visiblePayments = sortPayments(filtered, sortBy)')
  })
  it('"Pendientes" cuenta parcial y pendiente juntos (todo lo que no está pagado del todo)', () => {
    expect(PAYMENTS_SECTION).toContain("const pendingCount = payments.filter((p) => p.status !== 'pagado').length")
  })
})
