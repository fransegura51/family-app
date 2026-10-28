import { describe, expect, it } from 'vitest'
import { frequentCategoryNames, searchCategories } from './categorySearch'
import { otrosReclassificationProposals, similarPastMovements } from './similarMovements'
import type { BudgetCategory, Expense } from './types'

let n = 0
const cat = (name: string, catalogKey: string | null, o: Partial<BudgetCategory> = {}): BudgetCategory => ({
  id: `c${++n}`,
  familyId: 'f',
  name,
  icon: '•',
  budgetGroup: 'generales',
  sortOrder: n,
  parentId: null,
  necessity: null,
  isFixed: null,
  catalogKey,
  ...o,
})
const vivienda = cat('Vivienda y hogar', 'g.vivienda_hogar')
const transporte = cat('Transporte y vehículo', 'g.transporte_vehiculo')
const ocio = cat('Ocio y viajes', 'g.ocio_viajes')
const CATS: BudgetCategory[] = [
  vivienda,
  cat('Electricidad', 'g.vivienda_hogar.electricidad', { parentId: vivienda.id }),
  cat('Suministros', 'g.vivienda_hogar.suministros', { parentId: vivienda.id }),
  transporte,
  cat('Combustible', 'g.transporte_vehiculo.combustible', { parentId: transporte.id }),
  ocio,
  cat('Suscripciones y entretenimiento', 'g.ocio_viajes.suscripciones_entretenimiento', { parentId: ocio.id }),
  cat('Otros', 'g.otros'),
  cat('Mi huerto', null), // personal, sin equivalente en el catálogo
  cat('Sueldo', 'i.sueldo', { budgetGroup: 'ingresos' }),
  cat('Ingreso', 'i.ingreso', { budgetGroup: 'ingresos' }),
]

describe('buscador de categorías', () => {
  it('encuentra por el nombre, sin acentos ni mayúsculas, y enseña de qué categoría principal cuelga', () => {
    const r = searchCategories(CATS, 'ELECTRICIDAD', 'gasto')
    expect(r[0].category.name).toBe('Electricidad')
    expect(r[0].path).toBe('Vivienda y hogar › Electricidad')
    expect(searchCategories(CATS, 'transporte', 'gasto')[0].category.name).toBe('Transporte y vehículo')
  })
  it('encuentra por concepto con el mismo reconocimiento que clasifica el banco', () => {
    const net = searchCategories(CATS, 'netflix', 'gasto')
    expect(net[0]).toMatchObject({ via: 'concepto' })
    expect(net[0].category.name).toBe('Suscripciones y entretenimiento')
    expect(searchCategories(CATS, 'endesa', 'gasto')[0].category.name).toBe('Electricidad')
    expect(searchCategories(CATS, 'gasolinera', 'gasto')[0].category.name).toBe('Combustible')
  })
  it('una categoría personal sin catalog_key también se encuentra por su nombre', () => {
    expect(searchCategories(CATS, 'huerto', 'gasto')[0].category.name).toBe('Mi huerto')
  })
  it('separa gastos e ingresos', () => {
    expect(searchCategories(CATS, 'sueldo', 'gasto')).toEqual([])
    expect(searchCategories(CATS, 'sueldo', 'ingreso')[0].category.name).toBe('Sueldo')
  })
  it('sin texto o sin coincidencias no devuelve nada (el selector ofrece crear la categoría)', () => {
    expect(searchCategories(CATS, '   ', 'gasto')).toEqual([])
    expect(searchCategories(CATS, 'zzzz', 'gasto')).toEqual([])
  })
  it('no repite una categoría que ya salió por el nombre', () => {
    const r = searchCategories(CATS, 'suscripciones', 'gasto')
    expect(r.filter((h) => h.category.name === 'Suscripciones y entretenimiento')).toHaveLength(1)
  })
  it('las más usadas, sin «Otros» ni categorías que ya no existen', () => {
    const rows = [...Array(5).fill({ category: 'Combustible' }), ...Array(3).fill({ category: 'Electricidad' }), ...Array(9).fill({ category: 'Otros' }), { category: 'Borrada' }, { category: null }]
    expect(frequentCategoryNames(rows, new Set(['Combustible', 'Electricidad', 'Otros']), 2)).toEqual(['Combustible', 'Electricidad'])
  })
})

const exp = (o: Partial<Expense>): Expense => ({
  id: `e${++n}`,
  familyId: 'f',
  expenseDate: '2026-10-01',
  amount: 10,
  category: 'Otros',
  store: null,
  kind: 'real',
  notes: null,
  isIncome: false,
  budgetGroup: 'generales',
  tagId: null,
  source: 'banco',
  isFixedOverride: null,
  ownerMemberId: null,
  shared: true,
  sharedFromExpenseId: null,
  productClassification: null,
  ...o,
})

describe('cambiar también los movimientos anteriores del comercio (opcional)', () => {
  const changed = exp({ id: 'X', store: 'ENDESA ENERGIA S.A.' })
  it('solo propone los del banco del mismo comercio y sentido con otra categoría, nunca los decididos a mano', () => {
    const all = [
      changed,
      exp({ id: 'A', store: 'ENDESA ENERGIA S.A.' }),
      exp({ id: 'B', store: 'ENDESA ENERGIA SA-MADRID' }), // misma identidad aunque lo escriba distinto
      exp({ id: 'C', store: 'ENDESA ENERGIA S.A.', categorySource: 'manual' }),
      exp({ id: 'D', store: 'ENDESA ENERGIA S.A.', category: 'Electricidad' }), // ya está
      exp({ id: 'E', store: 'ENDESA ENERGIA S.A.', source: 'ticket_banco' }), // tiene ticket: su desglose manda
      exp({ id: 'F', store: 'ENDESA ENERGIA S.A.', source: 'manual' }),
      exp({ id: 'G', store: 'ENDESA ENERGIA S.A.', isIncome: true }),
      exp({ id: 'H', store: 'ENDESA ENERGIA S.A.', category: 'Cobro anulado' }),
      exp({ id: 'I', store: 'LIDL' }),
    ]
    expect(similarPastMovements(all, changed, 'Electricidad').map((e) => e.id).sort()).toEqual(['A', 'B'])
  })
  it('sin comercio no propone nada', () => {
    expect(similarPastMovements([exp({ id: 'A', store: null })], exp({ store: null }), 'Electricidad')).toEqual([])
  })
})

describe('«Otros» que ahora PEPA sabe situar (revisión voluntaria)', () => {
  const refs = [...CATS, cat('Farmacia', 'g.salud_bienestar.salud_farmacia')]
  it('propone lo que reconoce con fundamento y deja lo dudoso, lo manual y lo que ya tiene categoría', () => {
    const all = [
      exp({ id: 'A', store: 'ENDESA ENERGIA S.A.' }),
      exp({ id: 'B', store: 'WWW.AMAZON-LUXEMBOURG' }), // dudoso: no se propone
      exp({ id: 'C', store: 'IBERDROLA CLIENTES', categorySource: 'manual' }), // la familia lo dejó en «Otros» a propósito: no se toca
      exp({ id: 'D', store: 'ENDESA ENERGIA S.A.', category: 'Combustible' }),
      exp({ id: 'E', store: 'REPSOL' }),
      exp({ id: 'F', store: 'ENDESA', isIncome: true, category: 'Ingreso' }),
    ]
    const r = otrosReclassificationProposals(all, refs)
    expect(r.map((p) => [p.expense.id, p.category, p.confidence])).toEqual([
      ['A', 'Electricidad', 'alta'],
      ['E', 'Combustible', 'media'],
    ])
  })
})
