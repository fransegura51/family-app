// Tipos y utilidades que comparten las vistas del Comparador (Resultados, Emparejar, Revisar PEPA). Sin pantallas ni datos: así ninguna vista importa a otra.
import type { CommonMember, CommonProduct } from '@/domain/commonProducts'
import type { DecisionRelation, FamilyDecision, RelationContext, SharedEquivalence } from '@/domain/priceComparison'
import type { PackFormat } from '@/domain/packFormat'
import { basisLabel } from '@/domain/productSize'
import type { Product, ProductPrice } from '@/domain/types'

export interface CompareDataset {
  products: Product[]
  prices: ProductPrice[]
  commons: CommonProduct[]
  members: CommonMember[]
  skipped: string[]
  /** Artículos que la familia sacó de una propuesta de PEPA (no se vuelven a proponer). */
  rejected?: string[]
  decisions: FamilyDecision[]
  shared: SharedEquivalence[]
  /** false = la base aún no tiene los productos comunes (migración sin aplicar). */
  available: boolean
}

export interface CompareActions {
  assign: (productId: string, commonId: string, source: CommonMember['source']) => Promise<void>
  unassign: (productId: string) => Promise<void>
  createCommon: (name: string) => Promise<CommonProduct>
  rename: (commonId: string, name: string) => Promise<void>
  remove: (commonId: string) => Promise<void>
  skip: (productId: string) => Promise<void>
  /** Acepta un grupo propuesto por PEPA. */
  confirmGroup: (commonId: string) => Promise<void>
  /** Descarta un grupo propuesto por PEPA (y PEPA no lo vuelve a proponer). */
  discardGroup: (commonId: string, productIds: string[]) => Promise<void>
  /** Saca un artículo de un grupo propuesto por PEPA (y PEPA no vuelve a proponérselo). */
  separatePepa: (productId: string) => Promise<void>
  unskip: (productId: string) => Promise<void>
  decide: (a: string, b: string, relation: DecisionRelation | null) => Promise<void>
  setPack: (priceId: string, pack: PackFormat) => Promise<void>
  /** Cambia el producto (o la variante) del catálogo de un artículo ya guardado. No toca su nombre ni sus compras. */
  setCatalogKey?: (productId: string, key: string) => Promise<void>
}

export interface Notice {
  text: string
  undo?: () => Promise<void>
}

export const eur = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
export const eur3 = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 3 })
export const shortDate = (d: string) => {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}
const unitOf = (basis: Parameters<typeof basisLabel>[0]) => basisLabel(basis).replace('€', '')
/** «0,953 €/l». */
export const perUnit = (value: number, basis: Parameters<typeof basisLabel>[0]) => `${(value >= 1 ? eur : eur3)(value).replace(' €', '')} €${unitOf(basis)}`

export function relationContext(data: Pick<CompareDataset, 'decisions' | 'shared' | 'members'>): RelationContext {
  return { decisions: data.decisions, shared: data.shared, commonOf: new Map(data.members.map((m) => [m.productId, m.commonId])) }
}
