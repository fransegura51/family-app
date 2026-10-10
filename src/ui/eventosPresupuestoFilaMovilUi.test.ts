import { describe, expect, it } from 'vitest'

// Punto 3.7 (prompt de correcciones) — un Concepto largo ("Ramo de novia con peonías importadas de
// temporada") en una sola fila flex empujaba el importe y el botón de borrar a una posición rara en
// cuanto el nombre envolvía a dos líneas (confirmado en vivo en móvil 390px antes de este cambio). Ahora
// son dos bloques SIEMPRE: el nombre (+ su sub-línea de Comprometido/Pagado) arriba a todo el ancho;
// importe y borrar debajo, en su propia fila con justify-content space-between — su posición nunca
// depende de cuánto envuelva el nombre.
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const ROW = window_(UI, 'function renderRow(i: EventBudgetItem) {', '\n  let listContent: ReactNode')

describe('Punto 3.7 — fila de partida en dos bloques, nunca una sola fila flex que puede desalinearse', () => {
  it('ya no usa la fila flex única "inline-fields" para todo el contenido', () => {
    expect(ROW).not.toContain('className="inline-fields" style={{ alignItems: \'center\', cursor: \'pointer\' }}')
  })
  it('el nombre (categoría) vive en su propio bloque, a todo el ancho, antes del importe', () => {
    const nameBlock = window_(ROW, '<div>\n          {i.category}', '</div>')
    expect(nameBlock).toContain('Comprometido')
  })
  it('importe y borrar comparten una segunda fila con justify-content space-between, siempre en su sitio', () => {
    expect(ROW).toContain("justifyContent: 'space-between'")
    const secondRow = window_(ROW, "justifyContent: 'space-between', marginTop: 4 }}>", '</div>\n      </div>')
    expect(secondRow).toContain('Sin importe todavía')
    expect(secondRow).toContain('ConfirmIconButton')
  })
  it('sigue siendo UN <div> con onClick (nunca un <button> anidando ConfirmIconButton)', () => {
    expect(ROW).toContain("onClick={() => setEditingItemId(i.id)}")
    expect(ROW).toContain('onClick={(e) => e.stopPropagation()}')
  })
})
