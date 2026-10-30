// FORMATO DEL ENVASE al registrar una compra (COMP-2). Lógica pura.
//
// Para comparar precios entre tiendas hace falta saber cuánto contiene lo comprado. En vez de preguntarlo todo, se decide línea a línea:
//   · Vendido por peso (kg)            → ya es €/kg: no hay nada que preguntar.
//   · El nombre lo dice claro          → se reconoce solo («Leche 1 L», «Cerveza 6x330 ml»).
//   · Compras anteriores coinciden     → se recuerda solo (el mismo producto con el mismo formato en las dos últimas compras y un precio parecido).
//   · Hay un dato previo pero no seguro→ se propone y la persona confirma.
//   · No se sabe                       → se pregunta, y solo si de verdad sirve para comparar (hay precio en otra tienda); lo demás queda opcional.
// Nunca se inventa un tamaño: sin evidencia, el formato queda vacío y la compra se guarda igual.
import { normalizeMeasurementUnit } from './measurementUnit'
import { equivalentGroup, type CmpPrice, type CmpProduct, type RelationContext } from './priceComparison'
import { describePackInput, normalizePrice, packTotalSize, parseProductPack, type NormalizedPrice, type PackInput } from './productSize'

export type PackSource = 'ticket' | 'nombre' | 'recordado' | 'manual'
export interface PackFormat extends PackInput {
  source: PackSource
}

export const PACK_SOURCE_LABELS: Record<PackSource, string> = {
  ticket: 'del ticket',
  nombre: 'reconocido del nombre',
  recordado: 'recordado de compras anteriores',
  manual: 'indicado por ti',
}

export function samePack(a: PackInput | null | undefined, b: PackInput | null | undefined): boolean {
  if (!a || !b) return false
  const ta = packTotalSize(a)
  const tb = packTotalSize(b)
  return !!ta && !!tb && ta.magnitude === tb.magnitude && Math.abs(ta.amount - tb.amount) < 1e-6 && a.count === b.count
}

/** Texto corto del formato: «6 × 330 ml = 1,98 l». */
export function describePack(pack: PackInput): string {
  return describePackInput(pack)
}

/** Una compra anterior del mismo producto (solo lo necesario para recordar su formato). */
export interface PackHistoryLine {
  price: number
  pack: PackFormat | null
  recordedDate: string
}

export type FormatStatus =
  | { kind: 'peso' }
  | { kind: 'nombre'; pack: PackFormat }
  | { kind: 'recordado'; pack: PackFormat }
  | { kind: 'confirmar'; pack: PackFormat; reason: string }
  | { kind: 'falta' }

/** Un precio parecido (±40 %) al de la compra anterior es la misma presentación; muy distinto sugiere otro formato (pack de 6 frente a pack de 12). */
const SIMILAR_PRICE_LOW = 0.6
const SIMILAR_PRICE_HIGH = 1.6
const MANUAL_SAME_LOW = 0.85
const MANUAL_SAME_HIGH = 1 / 0.85

export function formatStatus(line: { name: string; unit: string | null; price: number }, history: readonly PackHistoryLine[]): FormatStatus {
  if (normalizeMeasurementUnit(line.unit) === 'kg') return { kind: 'peso' }
  const fromName = parseProductPack(line.name)
  if (fromName) return { kind: 'nombre', pack: { ...fromName, source: 'nombre' } }
  const known = history
    .filter((h): h is PackHistoryLine & { pack: PackFormat } => h.pack != null && h.pack.source !== 'nombre')
    .sort((a, b) => b.recordedDate.localeCompare(a.recordedDate))
  if (known.length === 0 || !(line.price > 0)) return { kind: 'falta' }
  const latest = known[0]
  const ratio = latest.price > 0 ? line.price / latest.price : NaN
  if (!(ratio >= SIMILAR_PRICE_LOW && ratio <= SIMILAR_PRICE_HIGH)) return { kind: 'falta' }
  // Se recuerda solo si las dos últimas compras coinciden, o si la persona lo indicó ella misma (manual) y el precio es casi el mismo (±15 %): un paquete cuyo contenido ya se
  // confirmó a mano no se vuelve a preguntar en cada compra; un precio muy distinto sí (puede ser otro tamaño de paquete).
  const sure = (known.length >= 2 && samePack(known[0].pack, known[1].pack)) || (latest.pack.source === 'manual' && ratio >= MANUAL_SAME_LOW && ratio <= MANUAL_SAME_HIGH)
  if (sure) return { kind: 'recordado', pack: { count: latest.pack.count, amount: latest.pack.amount, unit: latest.pack.unit, source: 'recordado' } }
  return {
    kind: 'confirmar',
    pack: { count: latest.pack.count, amount: latest.pack.amount, unit: latest.pack.unit, source: 'recordado' },
    reason: `La última vez indicaste ${describePack(latest.pack)}. ¿Es el mismo?`,
  }
}

/** ¿Hay que pedir algo a la persona? (los formatos reconocidos o recordados no se preguntan) */
export function needsAnswer(status: FormatStatus): boolean {
  return status.kind === 'falta' || status.kind === 'confirmar'
}

/** Formato válido escrito a mano en el formulario (texto → número). null si falta algo o no es válido. */
export function parsePackInput(count: string, amount: string, unit: string): PackFormat | null {
  const c = Number(count.trim().replace(',', '.'))
  const a = Number(amount.trim().replace(',', '.'))
  if (!Number.isFinite(c) || !Number.isFinite(a) || c <= 0 || a <= 0) return null
  if (unit !== 'g' && unit !== 'kg' && unit !== 'ml' && unit !== 'l' && unit !== 'ud') return null
  const pack: PackFormat = { count: c, amount: a, unit, source: 'manual' }
  return packTotalSize(pack) ? pack : null
}

/** Precio normalizado de una compra con su formato, para enseñarlo al lado del formato («2,50 €/l»). */
export function unitPriceText(price: number, pack: PackInput): string | null {
  const size = packTotalSize(pack)
  if (!size || !(price >= 0)) return null
  const f = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (size.magnitude === 'peso') return `${f(price / (size.amount / 1000))} €/kg`
  if (size.magnitude === 'volumen') return `${f(price / (size.amount / 1000))} €/l`
  return `${f(price / size.amount)} €/ud`
}

// ─── Línea de un ticket en revisión ───

export interface DraftPackLine {
  name: string
  unit: string | null
  /** Precio por unidad tal cual se escribe en el formulario. */
  unitPrice: string
  /** undefined = la persona no ha decidido (se aplica lo reconocido solo); null = «Ahora no»; un formato = elegido o confirmado. */
  pack?: PackFormat | null
}

/** Estado de la línea y el formato que se guardará con ella (null = ninguno). Lo que la persona decidió manda; lo reconocido solo se aplica sin preguntar. */
export function resolveLinePack(line: DraftPackLine, history: readonly PackHistoryLine[]): { status: FormatStatus; pack: PackFormat | null } {
  const status = formatStatus({ name: line.name, unit: line.unit, price: Number(line.unitPrice) }, history)
  if (status.kind === 'peso') return { status, pack: null }
  if (line.pack !== undefined) return { status, pack: line.pack }
  if (status.kind === 'nombre' || status.kind === 'recordado') return { status, pack: status.pack }
  return { status, pack: null }
}

// ─── ¿Sirve preguntar? Solo si ese producto (o uno equivalente) ya se compró en OTRA tienda ───
export interface OtherStorePrice {
  store: string
  date: string
  price: number
  productName: string
  priceId: string | null
  pack: PackInput | null
  normalized: NormalizedPrice
}

/** Último precio del producto (y de sus equivalentes) en cada tienda DISTINTA de `store`. Vacío = no hay con qué comparar todavía. */
export function otherStorePrices(
  target: CmpProduct | null,
  store: string,
  products: readonly CmpProduct[],
  prices: readonly CmpPrice[],
  ctx: RelationContext = {},
): OtherStorePrice[] {
  if (!target) return []
  const mine = store.trim().toLowerCase()
  const { members } = equivalentGroup(target, products, ctx, 'equivalent')
  const ids = new Map(members.map((m) => [m.product.id, m.product.displayName]))
  const latest = new Map<string, OtherStorePrice>()
  for (const p of prices) {
    const name = ids.get(p.productId)
    const s = p.store?.trim()
    if (name == null || !s || s.toLowerCase() === mine) continue
    const prev = latest.get(s.toLowerCase())
    if (prev && prev.date >= p.recordedDate) continue
    latest.set(s.toLowerCase(), { store: s, date: p.recordedDate, price: p.price, productName: name, priceId: p.id ?? null, pack: p.pack ?? null, normalized: normalizePrice(p, name) })
  }
  return [...latest.values()].sort((a, b) => b.date.localeCompare(a.date))
}
