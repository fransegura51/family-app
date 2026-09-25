import { describe, expect, it } from 'vitest'

// FASE CA-3 — «Cobro anulado» (vive en budgetGroup 'generales', hija de «Movimientos internos» — ver
// 0115_cancelled_charge_category) debe poder elegirse a mano tanto en un GASTO (ya funcionaba: CategorySelect
// filtra por 'generales' sin más) como en un INGRESO. Los 3 selectores de un ingreso usaban
// `categories.filter(c => c.budgetGroup === 'ingresos')`, que la excluía por completo. No se renderiza el
// componente (este proyecto no tiene react-testing-library/jsdom, ver financeUiRefunds.test.ts) — se
// audita por texto que los 3 sitios usan la MISMA fuente de verdad (incomeSelectableCategories), en vez de
// repetir el filtro (o arreglarlo) tres veces por separado.
const FILES = import.meta.glob(['/src/ui/FinanceScreen.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const FS = FILES['/src/ui/FinanceScreen.tsx']

describe('FinanceScreen importa la fuente única de dominio, no reimplementa el filtro', () => {
  it('importa incomeSelectableCategories de domain/cancelledCharge', () => {
    expect(FS).toContain("import { incomeSelectableCategories } from '@/domain/cancelledCharge'")
  })

  it('ya no queda ningún "const incomeCategories = categories.filter(...)" suelto', () => {
    // El único filtro por budgetGroup==='ingresos' para INCOME_CATEGORIES debe vivir dentro de
    // incomeSelectableCategories (domain/cancelledCharge.ts), no repetido en FinanceScreen. (Otros usos de
    // "categories.filter(c => c.budgetGroup === 'ingresos')", como el listado de gestión de categorías en
    // CategoriesModal, son un caso distinto — gestionar categorías, no elegir la de un movimiento — y no
    // forman parte de este arreglo.)
    expect(FS).not.toMatch(/const incomeCategories = categories\.filter\(/)
  })

  it('los 3 sitios de incomeCategories usan incomeSelectableCategories(categories)', () => {
    const occurrences = [...FS.matchAll(/const incomeCategories = incomeSelectableCategories\(categories\)/g)]
    expect(occurrences).toHaveLength(3)
  })
})

describe('domain/cancelledCharge.ts: única fuente de verdad, por catalogKey', () => {
  const DOMAIN = import.meta.glob('/src/domain/cancelledCharge.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  const CC = DOMAIN['/src/domain/cancelledCharge.ts']

  it('identidad de «Cobro anulado» por catalogKey, mismo patrón que REFUND_CATALOG_KEY', () => {
    expect(CC).toContain("export const CANCELLED_CHARGE_CATALOG_KEY = 'g.movimientos_internos.cobro_anulado'")
    expect(CC).toMatch(/categories\.find\(\(c\) => c\.name === category\)\?\.catalogKey === CANCELLED_CHARGE_CATALOG_KEY/)
  })

  it('incomeSelectableCategories no muta la categoría ni cambia budgetGroup/parentId/catalogKey — solo filtra', () => {
    expect(CC).not.toMatch(/budgetGroup:\s*'ingresos'/)
    expect(CC).not.toMatch(/\.map\(/) // ningún reescrito de campos, solo .filter
  })
})

describe('el lado de GASTO sigue igual: CategorySelect (generales) ya incluía Cobro anulado, no se toca', () => {
  it('CategorySelect sigue filtrando por generales sin más, sin excluir Cobro anulado', () => {
    const start = FS.indexOf('function CategorySelect(')
    const end = FS.indexOf('function ReceiptRow(', start)
    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    const body = FS.slice(start, end)
    expect(body).toContain("categories.filter((c) => c.budgetGroup === 'generales')")
    expect(body).not.toMatch(/Cobro anulado/)
  })
})
