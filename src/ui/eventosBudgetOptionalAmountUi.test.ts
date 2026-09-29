import { describe, expect, it } from 'vitest'

// Cola nocturna, Bloque 11 — Presupuesto general de Eventos admite "concepto sin importe todavía"
// (plannedAmount: number | null), en vez de colar un 0,00 € silencioso cuando el campo se deja en blanco.
// PEPA ("Organízamelo Pepa") aplica sus propuestas con plannedAmount:null — el importe real lo pone la
// familia. Se añade edición en línea (EditBudgetItemInline) para poder ponerle cifra después sin borrar y
// rehacer la partida.
const SRC = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function slice(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('AddBudgetItemModal — un importe en blanco es plannedAmount:null, nunca 0 silencioso', () => {
  const fn = slice(SRC, 'function AddBudgetItemModal(', '\n// Bloque 11')

  it('ya no usa Number(amount) || 0 (colaba un cero cuando se dejaba en blanco)', () => {
    expect(fn).not.toContain('Number(amount) || 0')
  })

  it('un campo vacío pasa null explícitamente', () => {
    expect(fn).toContain("amount.trim() === '' ? null : Number(amount)")
  })
})

describe('"Organízamelo Pepa" — aplica los conceptos propuestos sin inventar un importe', () => {
  it('addEventBudgetItem se llama con null, no con ningún b.plannedAmount (ya no existe en la propuesta)', () => {
    expect(SRC).toContain('addEventBudgetItem(event.id, b.category, null)')
  })

  it('la vista previa de la propuesta ya no muestra un importe (b.plannedAmount.toFixed) — dice que falta ponerlo', () => {
    const previewBlock = slice(SRC, '💰 Presupuesto</strong>\n            <div className="event-list" style={{ marginTop: 4 }}>\n              {plan.budgetItems.map', '</>\n        )}\n\n        {plan.menuItems')
    expect(previewBlock).not.toContain('b.plannedAmount')
    expect(previewBlock).toContain('Sin importe todavía')
  })
})

describe('BudgetSection — una partida sin importe se distingue claramente de una a 0,00 €', () => {
  const fn = slice(SRC, 'function BudgetSection(', '\nfunction AddBudgetItemModal')

  it('todas las sumas de plannedAmount usan (i.plannedAmount ?? 0), nunca lo suman directo (rompería con null)', () => {
    const sums = fn.match(/reduce\(\(sum, i\) => sum \+ i\.plannedAmount, 0\)/g) ?? []
    expect(sums.length).toBe(0)
    expect(fn).toContain('items.reduce((sum, i) => sum + (i.plannedAmount ?? 0), 0)')
  })

  it('una partida sin importe se enseña como "Sin importe todavía" (atenuada), no como "0.00 €"', () => {
    expect(fn).toContain("i.plannedAmount == null ? 'Sin importe todavía' : `${i.plannedAmount.toFixed(2)} €`")
    expect(fn).toContain("i.plannedAmount == null ? 'muted' : undefined")
  })

  it('tocar la fila la abre para editar (EditBudgetItemInline), reutilizando el mismo patrón que Movimientos (<div onClick>, nunca un <button> anidando otro botón)', () => {
    expect(fn).toContain('onClick={() => setEditingItemId(i.id)}')
    expect(fn).toContain('<EditBudgetItemInline')
  })

  it('el botón de borrar dentro de la fila no dispara también la edición (stopPropagation)', () => {
    const rowBlock = slice(fn, 'onClick={() => setEditingItemId(i.id)}', '</div>\n          ),')
    expect(rowBlock).toContain('onClick={(e) => e.stopPropagation()}')
  })
})

describe('EditBudgetItemInline — permite poner importe real a un concepto que llegó sin él, sin borrar la partida', () => {
  const fn = slice(SRC, 'function EditBudgetItemInline(', '\n// ---------------------------------------------------------------------\n// Menú y compra.')

  it('reutiliza updateEventBudgetItem, no crea una partida nueva', () => {
    expect(fn).toContain('updateEventBudgetItem(item.id, { category, plannedAmount: amount.trim() === \'\' ? null : Number(amount) })')
  })

  it('el formulario no propaga el click a la fila (evita reabrirse a sí mismo)', () => {
    expect(fn).toContain('onClick={(e) => e.stopPropagation()}')
  })
})
