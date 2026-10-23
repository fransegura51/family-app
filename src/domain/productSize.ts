// TAMAÑO DEL ENVASE y PRECIO NORMALIZADO (€/kg, €/l, €/ud, €/envase).
//
// product_prices.price es siempre el precio POR MAGNITUD de la línea (por unidad comprada, o por kg si unit='kg'). El contenido del envase
// (500 g, 1,5 l, 12 huevos) NO se guarda en ningún sitio: solo puede salir del NOMBRE del producto. Por eso este módulo lee el nombre, y
// cuando no hay un tamaño claro NO inventa: devuelve «no se puede calcular una comparación exacta» (basis 'envase').
//
// Importante: «unidades compradas» (quantity) y «contenido del envase» (size) son cosas distintas. Aquí solo se usa el contenido.
import { normalizeMeasurementUnit } from './measurementUnit'

export type SizeMagnitude = 'peso' | 'volumen' | 'unidades'

export interface ParsedSize {
  magnitude: SizeMagnitude
  /** g para peso, ml para volumen, unidades para recuento. */
  amount: number
  /** Texto exacto del nombre del que sale (para depurar y para quitarlo del nombre). */
  raw: string
}

const NUM = '(\\d+(?:[.,]\\d+)?)'
const WEIGHT_VOLUME_UNITS = 'kg|kgs|g|gr|grs|gramos?|ml|cl|l|lt|lts|litros?'
const MULTIPACK = new RegExp(`(?<![\\p{L}\\d])(\\d{1,3})\\s*[x×]\\s*${NUM}\\s*(${WEIGHT_VOLUME_UNITS})(?![\\p{L}\\d])`, 'iu')
const SINGLE = new RegExp(`(?<![\\p{L}\\d.,])${NUM}\\s*(${WEIGHT_VOLUME_UNITS})(?![\\p{L}\\d])`, 'iu')
const COUNT_PATTERNS: RegExp[] = [
  /(?<![\p{L}\d])(\d{1,3})\s*(?:uds?|unid(?:ades?)?|u)(?![\p{L}\d])/iu,
  /(?<![\p{L}\d])pack\s*(?:de\s*)?(\d{1,3})(?![\p{L}\d])/iu,
  /(?<![\p{L}\d])p-(\d{1,3})(?![\p{L}\d])/iu,
  /(?<![\p{L}\d])x\s?(\d{1,3})(?![\p{L}\d])/iu,
]

function toNumber(text: string): number {
  return Number(text.replace(',', '.'))
}

function unitFactor(unit: string): { magnitude: 'peso' | 'volumen'; perUnit: number } {
  const u = unit.toLowerCase()
  if (u === 'kg' || u === 'kgs') return { magnitude: 'peso', perUnit: 1000 }
  if (u === 'g' || u === 'gr' || u === 'grs' || u.startsWith('gramo')) return { magnitude: 'peso', perUnit: 1 }
  if (u === 'ml') return { magnitude: 'volumen', perUnit: 1 }
  if (u === 'cl') return { magnitude: 'volumen', perUnit: 10 }
  return { magnitude: 'volumen', perUnit: 1000 } // l, lt, lts, litro(s)
}

/**
 * Tamaño del envase que dice el nombre, o null si no hay uno CLARO. Con dos tamaños distintos en el mismo nombre («LECHE 1L 6X1L» no, pero
 * «CREMA 200G 250ML») se considera ambiguo y no se adivina. Un multipack («6x125 g») es el total (750 g).
 */
export function parseProductSize(name: string): ParsedSize | null {
  const text = name ?? ''
  const found: ParsedSize[] = []

  const multi = text.match(MULTIPACK)
  let rest = text
  if (multi) {
    const f = unitFactor(multi[3])
    found.push({ magnitude: f.magnitude, amount: Number(multi[1]) * toNumber(multi[2]) * f.perUnit, raw: multi[0] })
    rest = text.replace(multi[0], ' ')
  }
  const single = rest.match(SINGLE)
  if (single) {
    const f = unitFactor(single[2])
    found.push({ magnitude: f.magnitude, amount: toNumber(single[1]) * f.perUnit, raw: single[0] })
    rest = rest.replace(single[0], ' ')
    if (SINGLE.test(rest)) return null // un segundo tamaño distinto: ambiguo
  }
  if (found.length === 0) {
    if (/\bmedia\s+docena\b/iu.test(text)) found.push({ magnitude: 'unidades', amount: 6, raw: 'media docena' })
    else if (/\bdocena\b/iu.test(text)) found.push({ magnitude: 'unidades', amount: 12, raw: 'docena' })
    else {
      for (const re of COUNT_PATTERNS) {
        const m = text.match(re)
        if (m && Number(m[1]) > 0) {
          found.push({ magnitude: 'unidades', amount: Number(m[1]), raw: m[0] })
          break
        }
      }
    }
  }
  if (found.length !== 1) return null // ninguno, o varios: no se adivina
  const only = found[0]
  return Number.isFinite(only.amount) && only.amount > 0 ? only : null
}

/** El nombre sin la parte del tamaño («Leche entera 1 L» → «Leche entera»). */
export function stripSize(name: string): string {
  const size = parseProductSize(name)
  let out = name
  if (size) out = out.replace(size.raw, ' ')
  return out.replace(/\s+/g, ' ').trim()
}

export type UnitPriceBasis = 'kg' | 'l' | 'ud' | 'envase'

export interface NormalizedPrice {
  /** Precio en la base indicada (€/kg, €/l, €/ud) o, con basis 'envase', el precio de UN envase tal cual. */
  value: number
  basis: UnitPriceBasis
  /** true = comparable con otros precios de la misma base; false = solo precio de envase (no hay tamaño fiable). */
  exact: boolean
  /** Precio de un envase/unidad comprada (el que sale en el ticket), si aplica. */
  packagePrice: number | null
  /** Contenido usado para el cálculo, si lo hubo. */
  size: ParsedSize | null
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000
}

/**
 * Normaliza UN registro de product_prices:
 *  · unit='kg' (vendido por peso): ya es €/kg.
 *  · unit='ud' (o legado seguro) con tamaño en el nombre: peso → €/kg, volumen → €/l, recuento → €/ud (cada huevo).
 *  · sin tamaño fiable: precio del envase, NO comparable de forma exacta con otros formatos.
 */
export function normalizePrice(record: { price: number; unit: string | null }, productName: string): NormalizedPrice {
  const unit = normalizeMeasurementUnit(record.unit)
  if (unit === 'kg') return { value: round(record.price), basis: 'kg', exact: true, packagePrice: null, size: null }
  const size = parseProductSize(productName)
  if (!size) return { value: round(record.price), basis: 'envase', exact: false, packagePrice: round(record.price), size: null }
  if (size.magnitude === 'peso') return { value: round(record.price / (size.amount / 1000)), basis: 'kg', exact: true, packagePrice: round(record.price), size }
  if (size.magnitude === 'volumen') return { value: round(record.price / (size.amount / 1000)), basis: 'l', exact: true, packagePrice: round(record.price), size }
  return { value: round(record.price / size.amount), basis: 'ud', exact: true, packagePrice: round(record.price), size }
}

export function basisLabel(basis: UnitPriceBasis): string {
  return basis === 'kg' ? '€/kg' : basis === 'l' ? '€/l' : basis === 'ud' ? '€/ud' : '€/envase'
}

/** Dos precios normalizados se pueden comparar de forma exacta solo si ambos son exactos y con la MISMA base. */
export function comparableNormalized(a: NormalizedPrice, b: NormalizedPrice): boolean {
  return a.exact && b.exact && a.basis === b.basis
}
