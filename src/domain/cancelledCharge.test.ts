import { describe, expect, it } from 'vitest'
import { CANCELLED_CHARGE_CATALOG_KEY, isCancelledChargeCategory, incomeSelectableCategories } from './cancelledCharge'
import type { BudgetCategory } from './types'

// FASE CA-3 — identidad de «Cobro anulado» SIEMPRE por catalogKey (g.movimientos_internos.cobro_anulado), nunca por el nombre visible.
function cat(name: string, catalogKey: string | null, over: Partial<BudgetCategory> = {}): BudgetCategory {
  return { id: name, familyId: 'f', name, icon: '', budgetGroup: 'ingresos', sortOrder: 0, parentId: null, necessity: null, isFixed: null, catalogKey, ...over }
}
const CATEGORIES: BudgetCategory[] = [
  cat('Sueldo', 'i.sueldo'),
  cat('Movimientos internos', 'i.movimientos_internos'),
  cat('Devoluciones', 'i.ingreso.devoluciones'),
  cat('Movimientos internos', 'g.movimientos_internos', { id: 'mi-generales', budgetGroup: 'generales' }),
  cat('Cobro anulado', CANCELLED_CHARGE_CATALOG_KEY, { id: 'cobro-anulado', parentId: 'mi-generales', budgetGroup: 'generales' }),
]

describe('isCancelledChargeCategory — por catalogKey, nunca por nombre', () => {
  it('la categoría estándar «Cobro anulado» (catalogKey g.movimientos_internos.cobro_anulado) se identifica', () => {
    expect(isCancelledChargeCategory('Cobro anulado', CATEGORIES)).toBe(true)
  })

  it('renombrar la categoría (mismo catalogKey) no rompe la detección', () => {
    const renamed = CATEGORIES.map((c) => (c.catalogKey === CANCELLED_CHARGE_CATALOG_KEY ? { ...c, name: 'Reversión de cargo' } : c))
    expect(isCancelledChargeCategory('Reversión de cargo', renamed)).toBe(true)
  })

  it('un nombre "Cobro anulado" con OTRO catalogKey (o sin catalogKey) NO cuenta', () => {
    const personal = CATEGORIES.map((c) => (c.catalogKey === CANCELLED_CHARGE_CATALOG_KEY ? { ...c, catalogKey: 'g.otros' } : c))
    expect(isCancelledChargeCategory('Cobro anulado', personal)).toBe(false)
    const sinClave = CATEGORIES.map((c) => (c.catalogKey === CANCELLED_CHARGE_CATALOG_KEY ? { ...c, catalogKey: null } : c))
    expect(isCancelledChargeCategory('Cobro anulado', sinClave)).toBe(false)
  })

  it('categoría inexistente o NULL → no es Cobro anulado', () => {
    expect(isCancelledChargeCategory('Categoría que no existe', CATEGORIES)).toBe(false)
    expect(isCancelledChargeCategory(null, CATEGORIES)).toBe(false)
    expect(isCancelledChargeCategory(undefined, CATEGORIES)).toBe(false)
  })

  it('la categoría "Movimientos internos" (padre) NO es en sí misma «Cobro anulado» — solo la hija', () => {
    expect(isCancelledChargeCategory('Movimientos internos', CATEGORIES)).toBe(false)
  })
})

describe('incomeSelectableCategories — fuente única para los 3 selectores de un INGRESO', () => {
  it('incluye las de budgetGroup ingresos de siempre', () => {
    const names = incomeSelectableCategories(CATEGORIES).map((c) => c.name)
    expect(names).toContain('Sueldo')
    expect(names).toContain('Devoluciones')
  })

  it('incluye «Cobro anulado» aunque sea de budgetGroup generales', () => {
    const names = incomeSelectableCategories(CATEGORIES).map((c) => c.name)
    expect(names).toContain('Cobro anulado')
  })

  it('NO duplica «Movimientos internos» — solo añade la hija «Cobro anulado», no el padre de generales', () => {
    const result = incomeSelectableCategories(CATEGORIES)
    const movimientosInternos = result.filter((c) => c.name === 'Movimientos internos')
    // Solo la fila del lado 'ingresos' (que ya pasaba el filtro budgetGroup==='ingresos' de por sí) — no se añade la de 'generales'.
    expect(movimientosInternos).toHaveLength(1)
    expect(movimientosInternos[0].budgetGroup).toBe('ingresos')
  })

  it('no cambia budgetGroup, parentId ni catalogKey de la categoría — solo filtra, no modifica', () => {
    const cobroAnulado = incomeSelectableCategories(CATEGORIES).find((c) => c.name === 'Cobro anulado')
    expect(cobroAnulado?.budgetGroup).toBe('generales')
    expect(cobroAnulado?.parentId).toBe('mi-generales')
    expect(cobroAnulado?.catalogKey).toBe(CANCELLED_CHARGE_CATALOG_KEY)
  })

  it('una categoría personal cualquiera de generales (sin catalogKey de Cobro anulado) NO se cuela', () => {
    const withExtra = [...CATEGORIES, cat('Ropa y accesorios', 'g.ropa', { id: 'ropa', budgetGroup: 'generales' })]
    const names = incomeSelectableCategories(withExtra).map((c) => c.name)
    expect(names).not.toContain('Ropa y accesorios')
  })
})
