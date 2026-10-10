import { describe, expect, it } from 'vitest'

// Punto 3.5 (prompt de correcciones) — 4 indicadores compactos (Planificado/Comprometido/Pagado/Gastado en
// Economía), dos filas, en vez de párrafos de explicación siempre visibles ocupando media pantalla. Cada
// uno lleva su explicación detrás de un icono ⓘ (<details>/<summary>, mismo patrón que el resto de la
// app). Punto 3.6 — un valor null (p. ej. Gastado en Economía sin etiqueta todavía) se ve como "—", nunca
// como "0,00 €" (eso sería inventar que no se ha gastado nada, cuando en realidad no se sabe).
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const BUDGET_SECTION = window_(UI, 'function BudgetSection(', '\nfunction CategoryInputWithSuggestions')
const TILE = window_(UI, 'function BudgetSummaryTile(', '\nfunction BudgetSection(')

describe('BudgetSummaryTile — indicador compacto con ⓘ, nunca un párrafo fijo', () => {
  it('un value null se ve como "—", nunca como 0,00 € (importe desconocido ≠ cero, Punto 3.6)', () => {
    expect(TILE).toContain("value == null ? '—' :")
  })
  it('la explicación vive detrás de <details>/<summary>, plegada por defecto', () => {
    expect(TILE).toContain('<details>')
    expect(TILE).toContain('<summary')
  })
})

describe('BudgetSection — 4 indicadores (Planificado/Comprometido/Pagado/Gastado en Economía) en grid de 2 columnas', () => {
  it('los 4 usan BudgetSummaryTile, ninguno un párrafo de texto fijo como antes', () => {
    expect((BUDGET_SECTION.match(/<BudgetSummaryTile/g) ?? []).length).toBe(4)
    expect(BUDGET_SECTION).toContain("gridTemplateColumns: 'repeat(2, 1fr)'")
  })
  it('Planificado siempre tiene un número real (reduce con 0 por defecto, nunca null)', () => {
    expect(BUDGET_SECTION).toContain('label="Planificado"')
    expect(BUDGET_SECTION).toContain('const planned = items.reduce((sum, i) => sum + (i.plannedAmount ?? 0), 0)')
  })
  it('Comprometido y Pagado caen a 0 cuando no hay pagos todavía (cero real, no "no lo sé")', () => {
    expect(BUDGET_SECTION).toContain('value={committed ?? 0}')
    expect(BUDGET_SECTION).toContain('value={paidOfCommitted ?? 0}')
  })
  it('Gastado en Economía se deja en null (nunca forzado a 0) cuando el evento no tiene etiqueta todavía', () => {
    expect(BUDGET_SECTION).toContain('label="Gastado en Economía"')
    expect(BUDGET_SECTION).toContain('value={spent}')
  })
})

describe('Punto 3.6 — el subtotal de un grupo avisa de las partidas sin importe, nunca las suma como 0€', () => {
  it('usa budgetGroupSubtotal (dominio puro) en vez de reducir plannedAmount ?? 0 directamente', () => {
    expect(BUDGET_SECTION).toContain('const { known: subtotalPlanned, unknownCount } = budgetGroupSubtotal(groupItems)')
  })
  it('el aviso compacto solo aparece si hay alguna partida sin importe en el grupo', () => {
    expect(BUDGET_SECTION).toContain("unknownCount > 0 && ` + ${unknownCount} sin importe`")
  })
})
