// INFORME DE NORMALIZACIÓN de una familia (Centro de Administración → Sistema → «Evaluación del catálogo de productos»). Puro: solo lee lo que se le pasa.
//
// Sirve para la PRUEBA LIMPIA: una familia nueva, sin historial, registra los mismos tickets y aquí se ve, sin consultar el aprendizaje compartido, sin usar sus clases
// guardadas ni sus grupos y sin ningún dato de otra familia, qué entiende el catálogo maestro de cada artículo. Es seguro con familias que ya tienen historial: no
// escribe nada y las clases o grupos que ya tienen NO se usan para responder (solo se cuentan aparte como «intervenciones de la persona»).
//
// Qué es MEDIDO y qué no:
//   · medido sobre TODOS los artículos (no necesita juicio humano): cuántos se identifican, con qué confianza, cuántos no, formato leído del nombre, grupos que PEPA propondría,
//     diferencia con el clasificador por palabras clave anterior, intervenciones de la persona ya hechas.
//   · medido sobre una MUESTRA que revisa una persona (aciertos de producto, de clase y de formato): el resultado dice cuántos se han revisado; nunca se extrapola como si
//     fuera de todos. Una clase acertada NO cuenta como identificación completa.
import type { AutoCommon } from '../autoGrouping'
import { planAutoGrouping } from '../autoGrouping'
import { commonResult, type CommonMember } from '../commonProducts'
import { formatStatus } from '../packFormat'
import type { CmpPrice, CmpProduct } from '../priceComparison'
import { CATALOG_ENTRIES, CATALOG_VERSION } from './catalogData'
import { catalogClass } from './classes'
import { oldRuleClassKey } from './evaluate'
import { identifyProduct, type ProductIdentity } from './identify'

export interface ReportProduct extends CmpProduct {
  category?: string | null
  classConfirmedAt?: string | null
}

export type ClassChange = 'igual' | 'nueva' | 'distinta' | 'ninguna' | 'solo_antigua'
export type FormatKind = 'peso' | 'reconocido' | 'falta'

export interface ReportRow {
  id: string
  text: string
  store: string | null
  identity: ProductIdentity
  oldClassKey: string | null
  classChange: ClassChange
  format: FormatKind
  /** Una persona ya fijó la clase a mano: no cuenta como resultado automático. */
  classByPerson: boolean
  /** Está en un grupo puesto por la persona (no propuesto por PEPA). */
  groupedByPerson: boolean
  groupedByPepa: boolean
}

export interface ReportSummary {
  catalogVersion: number
  catalogEntries: number
  products: number
  /** Artículos con alguna compra (los que cuentan para comparar). */
  withPurchases: number
  identification: { seguro: number; probable: number; dudoso: number; soloClase: number; completa: number }
  classes: Record<ClassChange, number>
  format: Record<FormatKind, number>
  grouping: { groups: number; articles: number; multiStoreGroups: number; usefulComparisons: number; pendingToConfirm: number; notGrouped: number }
  interventions: { classByPerson: number; groupedByPerson: number; groupedByPepa: number }
}

export interface FamilyReport {
  rows: ReportRow[]
  summary: ReportSummary
}

export interface ReportInput {
  products: readonly ReportProduct[]
  prices: readonly CmpPrice[]
  commons?: readonly AutoCommon[]
  members?: readonly CommonMember[]
}

export function buildFamilyReport(input: ReportInput): FamilyReport {
  const byProduct = new Map<string, CmpPrice[]>()
  for (const p of input.prices) {
    const list = byProduct.get(p.productId) ?? []
    list.push(p)
    byProduct.set(p.productId, list)
  }
  const memberOf = new Map((input.members ?? []).map((m) => [m.productId, m]))

  const rows: ReportRow[] = input.products.map((p) => {
    const identity = identifyProduct(p.displayName, p.brand)
    const prices = (byProduct.get(p.id) ?? []).slice().sort((a, b) => b.recordedDate.localeCompare(a.recordedDate))
    const last = prices[0]
    const status = last ? formatStatus({ name: p.displayName, unit: last.unit, price: last.price }, []) : null
    const format: FormatKind = status?.kind === 'peso' ? 'peso' : status?.kind === 'nombre' ? 'reconocido' : 'falta'
    const oldKey = oldRuleClassKey(p.displayName)
    const newKey = identity.confidence !== 'dudoso' ? identity.classKey : null
    let classChange: ClassChange
    if (newKey && oldKey) classChange = newKey === oldKey ? 'igual' : 'distinta'
    else if (newKey) classChange = 'nueva'
    else if (oldKey) classChange = 'solo_antigua'
    else classChange = 'ninguna'
    const m = memberOf.get(p.id)
    return {
      id: p.id,
      text: p.displayName,
      store: last?.store?.trim() || null,
      identity,
      oldClassKey: oldKey,
      classChange,
      format,
      classByPerson: !!p.classConfirmedAt,
      groupedByPerson: !!m && (m.source === 'manual' || m.source === 'sugerido'),
      groupedByPepa: !!m && (m.source === 'pepa' || m.source === 'auto'),
    }
  })

  const withPurchases = rows.filter((r) => byProduct.has(r.id))
  // Prueba limpia: lo que PEPA agruparía partiendo de cero, ignorando los grupos que ya existan.
  const plan = planAutoGrouping({ products: input.products, prices: input.prices, commons: [], members: [], skippedIds: new Set(), rejectedIds: new Set() })
  let useful = 0
  for (const g of plan.groups) {
    const members = input.products.filter((p) => g.productIds.includes(p.id))
    const r = commonResult({ id: 'x', name: g.name, normalizedName: g.name.toLowerCase() }, members, input.prices.filter((x) => g.productIds.includes(x.productId)))
    if (r.offers.length >= 2 && r.reliable && r.storeCount >= 1) useful += 1
  }
  const grouped = new Set(plan.groups.flatMap((g) => g.productIds))

  const count = <K extends string>(keys: readonly K[], pick: (r: ReportRow) => K): Record<K, number> => {
    const out = Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>
    for (const r of rows) out[pick(r)] += 1
    return out
  }
  const summary: ReportSummary = {
    catalogVersion: CATALOG_VERSION,
    catalogEntries: CATALOG_ENTRIES.length,
    products: rows.length,
    withPurchases: withPurchases.length,
    identification: {
      seguro: rows.filter((r) => r.identity.entry && r.identity.confidence === 'seguro' && !r.identity.entry.broad).length,
      probable: rows.filter((r) => r.identity.entry && r.identity.confidence === 'probable' && !r.identity.entry.broad).length,
      dudoso: rows.filter((r) => !r.identity.entry || r.identity.confidence === 'dudoso').length,
      soloClase: rows.filter((r) => r.identity.entry?.broad && r.identity.confidence !== 'dudoso').length,
      completa: rows.filter((r) => r.identity.identityKey != null).length,
    },
    classes: count(['igual', 'nueva', 'distinta', 'ninguna', 'solo_antigua'] as const, (r) => r.classChange),
    format: count(['peso', 'reconocido', 'falta'] as const, (r) => r.format),
    grouping: {
      groups: plan.groups.length,
      articles: grouped.size,
      multiStoreGroups: plan.groups.filter((g) => g.stores.length > 1).length,
      usefulComparisons: useful,
      pendingToConfirm: plan.groups.length,
      notGrouped: withPurchases.filter((r) => !grouped.has(r.id)).length,
    },
    interventions: {
      classByPerson: rows.filter((r) => r.classByPerson).length,
      groupedByPerson: rows.filter((r) => r.groupedByPerson).length,
      groupedByPepa: rows.filter((r) => r.groupedByPepa).length,
    },
  }
  return { rows, summary }
}

// ─── Muestra revisable por una persona ───

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Muestra reproducible (la misma semilla da la misma muestra) de artículos con compras, sin repetir, para que una persona confirme si PEPA acertó. */
export function sampleRows(rows: readonly ReportRow[], size: number, seed = 1): ReportRow[] {
  const pool = rows.filter((r) => r.identity.entry != null && r.identity.confidence !== 'dudoso')
  const rnd = mulberry32(seed)
  const order = pool.map((r, i) => ({ r, k: rnd() + i * 1e-9 })).sort((a, b) => a.k - b.k)
  return order.slice(0, Math.max(0, size)).map((x) => x.r)
}

export type Judgement = 'ok' | 'bad' | null
export interface RowReview {
  /** ¿Es de verdad ese producto? */
  product: Judgement
  /** ¿La clase es la correcta? */
  klass: Judgement
  /** ¿El formato que leyó PEPA es el correcto? (solo si leyó alguno) */
  format: Judgement
}

export interface Measured {
  reviewed: number
  product: { ok: number; bad: number }
  klass: { ok: number; bad: number }
  format: { ok: number; bad: number }
  /** Producto bien Y clase bien: la identificación completa. */
  complete: number
  /** Artículos de la muestra donde PEPA se equivocó en el producto (agrupaciones en cadena posibles). */
  wrongProduct: number
}

export function measure(sample: readonly ReportRow[], reviews: ReadonlyMap<string, RowReview>): Measured {
  const out: Measured = { reviewed: 0, product: { ok: 0, bad: 0 }, klass: { ok: 0, bad: 0 }, format: { ok: 0, bad: 0 }, complete: 0, wrongProduct: 0 }
  for (const r of sample) {
    const v = reviews.get(r.id)
    if (!v || (v.product == null && v.klass == null && v.format == null)) continue
    out.reviewed += 1
    if (v.product) out.product[v.product] += 1
    if (v.klass) out.klass[v.klass] += 1
    if (v.format) out.format[v.format] += 1
    if (v.product === 'ok' && v.klass === 'ok') out.complete += 1
    if (v.product === 'bad') out.wrongProduct += 1
  }
  return out
}

// ─── Texto del informe ───

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)} %` : '—')
const className = (key: string | null) => (key ? (catalogClass(key)?.name ?? key) : '—')

export function reportToMarkdown(summary: ReportSummary, measured: Measured | null, sampleSize: number, date = new Date()): string {
  const s = summary
  const lines: string[] = []
  lines.push(`# Informe de normalización de productos`)
  lines.push(`Fecha: ${date.toISOString().slice(0, 10)} · Catálogo maestro v${s.catalogVersion} (${s.catalogEntries} productos)`)
  lines.push('')
  lines.push(`## Medido sobre todos los artículos (${s.products}; ${s.withPurchases} con compras)`)
  lines.push(`- Identificados con seguridad: ${s.identification.seguro} (${pct(s.identification.seguro, s.products)})`)
  lines.push(`- Identificados como probables (propuesta, no se agrupan solos): ${s.identification.probable}`)
  lines.push(`- Solo se conoce la clase (producto genérico): ${s.identification.soloClase}`)
  lines.push(`- No identificados: ${s.identification.dudoso} (${pct(s.identification.dudoso, s.products)})`)
  lines.push(`- Identidad completa (pueden agruparse): ${s.identification.completa}`)
  lines.push(`- Clase: igual que antes ${s.classes.igual} · nueva (antes sin clase) ${s.classes.nueva} · distinta de antes ${s.classes.distinta} · solo la regla antigua ${s.classes.solo_antigua} · ninguna ${s.classes.ninguna}`)
  lines.push(`- Formato leído del nombre: ${s.format.reconocido} · vendido al peso: ${s.format.peso} · falta: ${s.format.falta}`)
  lines.push(`- Agrupaciones que PEPA propondría: ${s.grouping.groups} grupos con ${s.grouping.articles} artículos (${s.grouping.multiStoreGroups} con varias tiendas); comparaciones útiles ahora: ${s.grouping.usefulComparisons}; artículos con compras sin agrupar: ${s.grouping.notGrouped}`)
  lines.push(`- Intervenciones de la persona ya hechas (no cuentan como automático): clase fijada a mano ${s.interventions.classByPerson} · en grupo puesto a mano ${s.interventions.groupedByPerson}; en grupo de PEPA ${s.interventions.groupedByPepa}`)
  lines.push('')
  lines.push(`## Medido sobre la muestra revisada a mano`)
  if (!measured || measured.reviewed === 0) {
    lines.push(`Sin revisar todavía (muestra de ${sampleSize}). Estas cifras no se estiman: aparecerán cuando se revisen.`)
  } else {
    const m = measured
    lines.push(`Revisados ${m.reviewed} de ${sampleSize}.`)
    lines.push(`- Producto correcto: ${m.product.ok} de ${m.product.ok + m.product.bad} (${pct(m.product.ok, m.product.ok + m.product.bad)})`)
    lines.push(`- Clase correcta: ${m.klass.ok} de ${m.klass.ok + m.klass.bad} (${pct(m.klass.ok, m.klass.ok + m.klass.bad)})`)
    lines.push(`- Identificación completa (producto y clase): ${m.complete} de ${m.reviewed} (${pct(m.complete, m.reviewed)})`)
    lines.push(`- Formato leído correctamente: ${m.format.ok} de ${m.format.ok + m.format.bad}`)
    lines.push(`- Identificaciones incorrectas: ${m.wrongProduct}`)
  }
  return lines.join('\n')
}

export { className as reportClassName }
