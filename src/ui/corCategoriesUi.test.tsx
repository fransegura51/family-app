// @vitest-environment jsdom
// COR-05 (categoría siempre visible en cada movimiento), COR-06 (catálogo: bebé, muebles, manualidades) y COR-07 (ningún destino genérico automático).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { identifyProduct } from '@/domain/catalog/identify'
import { resolveProductClass } from '@/domain/productClass'
import type { BudgetCategory, Expense } from '@/domain/types'

const empty = (): unknown => ({ then: (r: (v: unknown) => unknown) => r({ data: [], error: null }), eq: empty, order: empty, select: empty, in: empty, limit: empty, maybeSingle: empty, single: empty, gte: empty, lte: empty, is: empty, not: empty, or: empty, range: empty })
vi.mock('@/data/supabaseClient', () => ({ supabase: new Proxy({}, { get: (_t, p) => (p === 'auth' ? { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) } : p === 'channel' ? () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }) : () => empty()) }) }))

const ex = (o: Partial<Expense> & Pick<Expense, 'id'>): Expense =>
  ({ familyId: 'f', expenseDate: '2026-10-16', amount: 12.5, category: 'Vivienda y hogar', store: 'Comercio', kind: 'real', notes: null, isIncome: false, budgetGroup: 'generales', tagId: null, source: 'banco', isFixedOverride: null, ownerMemberId: 'm1', shared: false, sharedFromExpenseId: null, productClassification: null, paymentMethod: null, ...o }) as Expense
const cat = (id: string, name: string, icon: string, group = 'generales') => ({ id, familyId: 'f', name, icon, budgetGroup: group, sortOrder: 1, parentId: null, necessity: null, isFixed: null, catalogKey: null }) as unknown as BudgetCategory
const categories = [
  cat('viv', 'Vivienda y hogar', '🏠'),
  cat('bel', 'Belleza y cuidado personal', '💅'),
  cat('fer', 'Ferretería y bricolaje', '🔧'),
  cat('mue', 'Muebles y organización', '🏠'),
  cat('sue', 'Sueldo', '💶', 'ingresos'),
]

const data = vi.hoisted(() => ({ expenses: [] as unknown[] }))
vi.mock('@/data/finance', async (o) => ({ ...(await o<typeof import('@/data/finance')>()), listExpenses: async () => data.expenses, listBudgetCategories: async () => categories, listTags: async () => [], listTagSharesSafe: async () => new Map(), listClassSharesSafe: async () => new Map(), listResolvedInternalTransferDestinations: async () => [] }))
vi.mock('@/data/family', async (o) => ({ ...(await o<typeof import('@/data/family')>()), getFinanceMonthStartDay: async () => 31, listFamilyMembers: async () => [{ id: 'm1', name: 'Jennifer', color: '#f06595', linkedProfileId: 'p1' }] }))
vi.mock('@/data/products', async (o) => ({ ...(await o<typeof import('@/data/products')>()), listAllProductPrices: async () => [], listProducts: async () => [] }))
vi.mock('@/data/receipts', async (o) => ({ ...(await o<typeof import('@/data/receipts')>()), listReceipts: async () => [] }))
vi.mock('@/data/bank', async (o) => ({ ...(await o<typeof import('@/data/bank')>()), listBankAccounts: async () => [], listBankTransactions: async () => [], listBankConnections: async () => [] }))
vi.mock('@/data/cash', async (o) => ({ ...(await o<typeof import('@/data/cash')>()), listWalletsSafe: async () => [], listAllMovementsSafe: async () => [] }))

const { ExpensesTab } = await import('@/ui/FinanceScreen')
const css = readFileSync(join(process.cwd(), 'src/ui/styles.css'), 'utf8')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-25T10:00:00'))
  data.expenses = [
    ex({ id: 'a', store: 'Comercio A', category: 'Vivienda y hogar' }),
    ex({ id: 'b', store: 'Comercio B', category: 'Belleza y cuidado personal' }),
    ex({ id: 'c', store: 'Comercio C', category: 'Ferretería y bricolaje', amount: 1234.56 }),
    ex({ id: 'd', store: 'Comercio D', category: 'Muebles y organización', categorySource: 'sugerida' }),
  ]
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('COR-05 · la categoría se ve siempre con su nombre', () => {
  async function openList() {
    render(
      <MemoryRouter>
        <ExpensesTab onClearFilter={() => undefined} myMemberId="m1" />
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText(/Comercio A/)).toBeTruthy())
  }
  const rowOf = (store: string) => screen.getByText(new RegExp(store)).closest('.movement-row') as HTMLElement

  it('cada tarjeta lleva el icono y el NOMBRE COMPLETO de la categoría en su propio elemento (el recorte con «…» lo hace el diseño, nunca se sustituye el nombre)', async () => {
    await openList()
    for (const [store, name, icon] of [['Comercio A', 'Vivienda y hogar', '🏠'], ['Comercio B', 'Belleza y cuidado personal', '💅'], ['Comercio C', 'Ferretería y bricolaje', '🔧'], ['Comercio D', 'Muebles y organización', '🏠']]) {
      const row = rowOf(store)
      expect(row.querySelector('.movement-row-category-name')?.textContent, store).toBe(name)
      expect(row.querySelector('.movement-row-category-icon')?.textContent, store).toBe(icon)
    }
  })

  it('el importe, la fecha, el comercio y el indicador de origen siguen en la fila y no entran en el elemento del nombre', async () => {
    await openList()
    const row = rowOf('Comercio C')
    expect(row.querySelector('.price-row-price')?.textContent).toContain('1234.56 €')
    expect(row.querySelector('.movement-row-category-name')?.textContent).not.toContain('€')
    expect(row.textContent).toContain('Comercio C')
    expect(row.querySelector('.movement-row-meta')).toBeTruthy()
  })

  it('la etiqueta «sugerida» convive con el nombre sin quitarle sitio al icono ni al importe', async () => {
    await openList()
    const row = rowOf('Comercio D')
    expect(row.querySelector('.suggested-tag')?.textContent).toBe('sugerida')
    expect(row.querySelector('.movement-row-category-name')?.textContent).toBe('Muebles y organización')
  })

  it('diseño: el nombre cede (min-width 0 + puntos suspensivos) y el importe no se encoge; la fila no crece en altura', () => {
    expect(css).toMatch(/\.movement-row-line > \.movement-row-category \{[^}]*flex: 1 1 0;[^}]*min-width: 0;/)
    expect(css).toMatch(/\.movement-row-category-name \{[^}]*min-width: 0;[^}]*overflow: hidden;[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/)
    expect(css).toMatch(/\.movement-row-line > \.price-row-price \{[^}]*flex: none;[^}]*white-space: nowrap;/)
    expect(css).toMatch(/\.movement-row-category-icon \{[^}]*flex: none;/)
    expect(css).toMatch(/\.movement-row-category \.suggested-tag,\s*\.movement-row-category \.pending-tag \{[^}]*flex: none;/)
  })
})

describe('COR-06 · el catálogo reconoce los casos reales', () => {
  const classOf = (name: string) => identifyProduct(name, null).classKey
  it('chupetero / cadenas para chupetes / mordedor → clase de bebé que YA existía («Higiene y cuidado del bebé»), no una nueva', () => {
    expect(classOf('ZOCONE 8 Piezas Cadenas para Chupetes Bebe, Chupete Cuerda Tela Suave Cadena para Chupete con Clip Reutilizable Chupetero de Cinta')).toBe('other.cuidado_bebe')
    expect(classOf('Mordedor de silicona')).toBe('other.cuidado_bebe')
    expect(classOf('Biberón anticólicos 240 ml')).toBe('other.cuidado_bebe')
  })
  it('archivador móvil de 5 cajones, cajonera, estantería → Muebles y organización; carpetas y archivadores de oficina siguen en Papelería', () => {
    expect(classOf('BEWISHOME Archivador MóViles con 5 Cajones Y Cerradura | Moderno Archivador MóVil con Cerradura, Cajonera Oficina, 78X40X65.5cm, Blanco')).toBe('other.muebles_organizacion')
    expect(classOf('Estantería metálica 5 baldas')).toBe('other.muebles_organizacion')
    expect(classOf('Archivador palanca A4')).toBe('other.papeleria_oficina')
    expect(classOf('Carpeta anillas')).toBe('other.papeleria_oficina')
  })
  it('kit de tubos de ensayo → Manualidades y creatividad; un juego educativo sigue siendo un juguete y un colorante de cocina, comida', () => {
    expect(classOf('Tubos de Ensayo Niños, 11 Tubos de Plástico y El Gotero Kit de Fabricación Farmacéutica')).toBe('other.manualidades_creatividad')
    expect(classOf('Euakee 36 Piezas Montessori Juguetes de Educativos, Animales Contando')).toBe('other.juguetes')
    expect(identifyProduct('Colorantes Alimentarios, 18 Colores x 10ML Grado Alimenticio Comestible', null).kind).toBe('alimentacion')
  })
})

describe('COR-07 · ni «Otros» ni «Otros alimentos» son el destino automático de lo desconocido', () => {
  const classes = [
    { name: 'Otros alimentos', kind: 'alimentacion' as const, catalogKey: 'food.otros_alimentos' },
    { name: 'Otros', kind: 'no_alimentos' as const, catalogKey: 'other.otros' },
    { name: 'Manualidades y creatividad', kind: 'no_alimentos' as const, catalogKey: 'other.manualidades_creatividad' },
  ]
  it('un producto desconocido en el conjunto «Otros» queda «Sin clasificar» (nunca «Otros»)', () => {
    const r = resolveProductClass({ name: 'Zorgblat XJ-9000', product: null, kind: 'no_alimentos', familyClasses: classes })
    expect(r.className).toBe('')
  })
  it('un desconocido cuyo conjunto es solo una suposición por defecto queda «Sin clasificar», no «Otros alimentos»', () => {
    const r = resolveProductClass({ name: 'Zorgblat XJ-9000', product: null, kind: 'alimentacion', kindIsDefault: true, familyClasses: classes })
    expect(r.className).toBe('')
  })
  it('una clase confirmada a mano se respeta y NO se extiende a otro producto de nombre parecido', () => {
    const colorantes = { category: 'Manualidades y creatividad', classConfirmedAt: '2026-10-29', nonFood: true }
    const confirmed = resolveProductClass({ name: 'Colorantes alimentarios 18 colores slime', product: colorantes, kind: 'no_alimentos', familyClasses: classes })
    expect(confirmed.className).toBe('Manualidades y creatividad')
    const similar = resolveProductClass({ name: 'Colorante alimentario en gel rojo', product: null, kind: 'alimentacion', kindIsDefault: true, familyClasses: classes })
    expect(similar.className).not.toBe('Manualidades y creatividad')
  })
})
