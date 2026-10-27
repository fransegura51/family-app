// Informe de normalización de una familia: la prueba limpia no usa clases ni grupos ya guardados, no inventa cifras y la muestra es reproducible.
import { describe, expect, it } from 'vitest'
import type { CommonMember } from '../commonProducts'
import type { CmpPrice } from '../priceComparison'
import { buildFamilyReport, measure, reportToMarkdown, sampleRows, type ReportProduct, type RowReview } from './familyReport'

const NAMES = ['LECHE SEMI P-6', 'LECHE SEMIDESNATADA PASCUAL 1L', 'PATATA 3 KG', 'PATATA 5 KG', 'PAÑALES T3', 'PAÑALES T4', 'QUESADILLA POLLO', 'PECHUGA POLLO', 'XILOFON AZUL', 'ACEITE O.V.E.', 'ACEITE OLIVA VIRGEN EXTRA 5L', 'DETERGENTE LIQUIDO']
const products = (over: Partial<ReportProduct> = {}): ReportProduct[] => NAMES.map((n, i) => ({ id: `p${i}`, displayName: n, brand: null, ...over }))
const prices = (): CmpPrice[] =>
  NAMES.map((_, i) => ({ productId: `p${i}`, price: 2 + i, store: i % 2 === 0 ? 'Mercadona' : 'Consum', unit: 'ud', recordedDate: '2026-10-01' }))

describe('informe sobre todos los artículos', () => {
  const { rows, summary } = buildFamilyReport({ products: products(), prices: prices() })

  it('cuenta lo identificado, lo probable y lo que no se reconoce', () => {
    expect(summary.products).toBe(NAMES.length)
    expect(summary.withPurchases).toBe(NAMES.length)
    expect(summary.identification.dudoso).toBe(1) // XILOFON AZUL
    expect(summary.identification.seguro).toBeGreaterThanOrEqual(9)
    expect(summary.identification.completa).toBeLessThanOrEqual(summary.identification.seguro)
  })
  it('compara la clase con el clasificador anterior', () => {
    const quesadilla = rows.find((r) => r.text === 'QUESADILLA POLLO')
    expect(quesadilla?.classChange).toBe('distinta') // antes Carne por llevar «pollo»; ahora Platos preparados
    const panales = rows.find((r) => r.text === 'PAÑALES T4')
    expect(panales?.classChange).toBe('nueva') // antes sin clase
    expect(summary.classes.distinta + summary.classes.nueva + summary.classes.igual + summary.classes.solo_antigua + summary.classes.ninguna).toBe(NAMES.length)
  })
  it('propone los grupos que el catálogo permite y ninguno donde difiere (T3 ≠ T4)', () => {
    expect(summary.grouping.groups).toBeGreaterThanOrEqual(3) // leche, patata, aceite
    const grouped = rows.filter((r) => r.text.startsWith('PAÑALES'))
    expect(grouped).toHaveLength(2)
    expect(summary.grouping.notGrouped).toBeGreaterThan(0)
  })
  it('el formato se lee del nombre y no se inventa', () => {
    expect(rows.find((r) => r.text === 'PATATA 5 KG')?.format).toBe('reconocido')
    expect(rows.find((r) => r.text === 'ACEITE O.V.E.')?.format).toBe('falta')
  })
})

describe('prueba limpia: lo ya guardado no responde por el catálogo', () => {
  it('una clase puesta a mano no cambia lo que entiende el catálogo, solo se cuenta aparte como intervención', () => {
    const clean = buildFamilyReport({ products: products(), prices: prices() })
    const dirty = buildFamilyReport({ products: products({ category: 'Mascotas', classConfirmedAt: '2026-09-01' }), prices: prices() })
    expect(dirty.rows.map((r) => r.identity.classKey)).toEqual(clean.rows.map((r) => r.identity.classKey))
    expect(dirty.summary.identification).toEqual(clean.summary.identification)
    expect(dirty.summary.interventions.classByPerson).toBe(NAMES.length)
    expect(clean.summary.interventions.classByPerson).toBe(0)
  })
  it('los grupos ya existentes no cambian lo que PEPA agruparía partiendo de cero', () => {
    const members: CommonMember[] = [{ productId: 'p0', commonId: 'c', source: 'manual' }, { productId: 'p1', commonId: 'c', source: 'pepa' }]
    const clean = buildFamilyReport({ products: products(), prices: prices() })
    const withGroups = buildFamilyReport({ products: products(), prices: prices(), members })
    expect(withGroups.summary.grouping).toEqual(clean.summary.grouping)
    expect(withGroups.summary.interventions.groupedByPerson).toBe(1)
    expect(withGroups.summary.interventions.groupedByPepa).toBe(1)
  })
  it('no usa ningún dato de otra familia ni del aprendizaje compartido: el módulo es puro', () => {
    const src = import.meta.glob('/src/domain/catalog/familyReport.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    const text = Object.values(src)[0]
    expect(text).not.toMatch(/supabase|@\/data|@\/ui|sharedClass|resolve_shared/)
  })
})

describe('muestra revisada a mano', () => {
  const { rows } = buildFamilyReport({ products: products(), prices: prices() })
  it('es reproducible (misma semilla, misma muestra), sin repetidos y solo con artículos identificados', () => {
    const a = sampleRows(rows, 5, 7).map((r) => r.id)
    expect(sampleRows(rows, 5, 7).map((r) => r.id)).toEqual(a)
    expect(new Set(a).size).toBe(a.length)
    expect(sampleRows(rows, 5, 8).map((r) => r.id)).not.toEqual(a)
    for (const r of sampleRows(rows, 50, 1)) expect(r.identity.entry).not.toBeNull()
  })
  it('sin revisar no hay cifras de aciertos: no se estiman', () => {
    const sample = sampleRows(rows, 5, 1)
    const m = measure(sample, new Map())
    expect(m.reviewed).toBe(0)
    const md = reportToMarkdown(buildFamilyReport({ products: products(), prices: prices() }).summary, m, sample.length)
    expect(md).toMatch(/Sin revisar todavía/)
    expect(md).not.toMatch(/Producto correcto:/)
  })
  it('una clase acertada no cuenta como identificación completa', () => {
    const sample = sampleRows(rows, 4, 1)
    const reviews = new Map<string, RowReview>([
      [sample[0].id, { product: 'ok', klass: 'ok', format: null }],
      [sample[1].id, { product: 'bad', klass: 'ok', format: null }],
      [sample[2].id, { product: 'ok', klass: 'bad', format: 'ok' }],
    ])
    const m = measure(sample, reviews)
    expect(m.reviewed).toBe(3)
    expect(m.klass.ok).toBe(2)
    expect(m.complete).toBe(1) // solo el primero: producto Y clase bien
    expect(m.wrongProduct).toBe(1)
    const md = reportToMarkdown(buildFamilyReport({ products: products(), prices: prices() }).summary, m, sample.length)
    expect(md).toMatch(/Revisados 3 de 4/)
    expect(md).toMatch(/Identificación completa \(producto y clase\): 1 de 3/)
  })
})
