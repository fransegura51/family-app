import { describe, expect, it } from 'vitest'

// Punto 3.1 (prompt de correcciones) — "Por categoría" agrupaba casi una partida por categoría porque
// usaba el nombre propio de la partida. Ahora hay un campo "Categoría" aparte (categoryGroup), que PEPA
// sugiere sola a partir del Concepto mientras la familia no la haya tocado a mano, y que alimenta el
// agrupador real (ver eventBudgetTracking.ts/eventBudgetTracking.test.ts).
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const ADD_MODAL = window_(UI, 'function AddBudgetItemModal(', '\n// Bloque 11 (cola nocturna) — edita una partida ya creada')
const EDIT_INLINE = window_(UI, 'function EditBudgetItemInline(', '\n// EVT-D3 — desglose de conceptos dentro de una partida')

describe.each([
  ['AddBudgetItemModal', () => ADD_MODAL],
  ['EditBudgetItemInline', () => EDIT_INLINE],
])('%s — campo "Categoría" (categoryGroup), separado del Concepto', (_name, getBlock) => {
  it('tiene su propio CategoryInputWithSuggestions, con las sugerencias de categoryGroupSuggestions', () => {
    const block = getBlock()
    expect(block).toContain('categoryGroupSuggestions')
    expect(block.match(/<CategoryInputWithSuggestions/g)?.length).toBe(2) // Concepto + Categoría
  })
  it('sigue la sugerencia de PEPA mientras no se haya tocado a mano (useEffect sobre category)', () => {
    const block = getBlock()
    expect(block).toContain('suggestBudgetCategoryGroup(category)')
    expect(block).toContain('if (!categoryGroupTouched)')
  })
  it('en cuanto se edita a mano, deja de seguir al Concepto (setCategoryGroupTouched(true) en su onChange)', () => {
    const block = getBlock()
    expect(block).toContain('setCategoryGroupTouched(true)')
  })
})

describe('AddBudgetItemModal — categoría nueva, PEPA sugiere desde cero', () => {
  it('empieza sin tocar (categoryGroupTouched arranca en false, sigue siempre al Concepto hasta que se edite)', () => {
    expect(ADD_MODAL).toContain('useState(false)')
  })
  it('envía la categoría al crear la partida', () => {
    expect(ADD_MODAL).toContain('categoryGroup: categoryGroup || null')
  })
})

describe('EditBudgetItemInline — una partida que YA tenía categoría nunca se re-sugiere sola al retocar el Concepto', () => {
  it('arranca "tocada" si item.categoryGroup ya existe (!= null) — solo una histórica sin categoría sigue la sugerencia en vivo', () => {
    expect(EDIT_INLINE).toContain('useState(item.categoryGroup != null)')
  })
  it('envía la categoría al guardar', () => {
    expect(EDIT_INLINE).toContain('categoryGroup: categoryGroup || null')
  })
})
