// ¿Esta línea extraída de un ticket es un PRODUCTO o una línea estructural (no producto)?
//
// Capa explícita y determinista, sin IA y sin heurísticas: una lista de REGLAS verificadas con datos reales, cada una atada a una
// CADENA concreta y a un texto exacto. Nada de "cualquier texto PARKING de cualquier comercio": PARKING solo es una línea informativa
// en los tickets de Mercadona.
//
// Se aplica ANTES de persistir: una línea no-producto no crea `products` ni `product_prices`, no llega a resolver clase, no consulta el
// aprendizaje compartido y no entra en estadísticas por producto. El ticket (foto/archivo y su total) se conserva íntegro.
// La decisión pertenece al extractor/pipeline, NO al clasificador de productos: no es una clase, ni una ambigüedad.
//
// Para añadir una regla nueva hay que aportar EVIDENCIA real (campo `evidence`) y un test; hoy solo hay reglas confirmadas.
//
// ¡Este fichero es autocontenido a propósito (sin imports)! Se copia tal cual a supabase/functions/mercadona-ticket-webhook/ticketLines.ts
// y un test comprueba que ambos son idénticos. La gemela SQL es public.is_non_product_line (migración 0145), verificada con los mismos casos.

export type TicketLineKind = 'product' | 'non_product'

export interface NonProductRule {
  /** Identificador estable de la regla. */
  id: string
  /** Cadena a la que aplica (la misma clave estable que las cadenas comerciales registradas). */
  chain: string
  /** Cómo se reconoce la tienda: mismos alias y modos que los alias de cadenas de la base de datos (exact = igual; word_prefix = empieza por palabras completas). */
  storeAliases: readonly { alias: string; mode: 'exact' | 'word_prefix' }[]
  /** Textos exactos (ya normalizados como text_key) que son esta línea estructural. */
  textKeys: readonly string[]
  reason: string
  /** Datos reales que justifican la regla. */
  evidence: string
}

export const NON_PRODUCT_RULES: readonly NonProductRule[] = [
  {
    id: 'mercadona.parking',
    chain: 'mercadona',
    storeAliases: [{ alias: 'mercadona', mode: 'word_prefix' }],
    textKeys: ['parking'],
    reason: 'Línea informativa del aparcamiento de Mercadona (siempre 1 ud. a 0,00 €): no es un producto.',
    evidence: '8 líneas históricas (2026-06 a 2026-09) en 8 tickets de Mercadona de 17 a 46 líneas: siempre cantidad 1 y precio 0,00 €; la suma de líneas coincide con el total del ticket con y sin ellas.',
  },
]

export interface TicketLineDecision {
  kind: TicketLineKind
  ruleId: string | null
  reason: string | null
}

const PRODUCT: TicketLineDecision = { kind: 'product', ruleId: null, reason: null }

const STORE_ACCENTS_FROM = 'ÁÉÍÓÚÜÑáéíóúüñ'
const STORE_ACCENTS_TO = 'AEIOUUNaeiouun'

// Igual que normalizeStoreName (domain/storeChains.ts) y la normalización de nombres del servidor.
function normalizeStore(raw: string): string {
  let out = ''
  for (const ch of raw) {
    const i = STORE_ACCENTS_FROM.indexOf(ch)
    out += i >= 0 ? STORE_ACCENTS_TO[i] : ch
  }
  return out
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Igual que productTextKey (domain/productText.ts) y product_text_key (SQL).
function normalizeText(raw: string): string {
  return raw
    .normalize('NFKC')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

// Solo texto latino (más signos generales) en el nombre de la tienda: con otros alfabetos o emojis no se adivina nada (igual que
// la resolución de cadenas del servidor).
const UNSUPPORTED_STORE = /[^\u0001-\u024F\u2000-\u206F]/

function storeMatches(rule: NonProductRule, storeNorm: string): boolean {
  return rule.storeAliases.some((a) => storeNorm === a.alias || (a.mode === 'word_prefix' && storeNorm.startsWith(`${a.alias} `)))
}

/** Decide sobre UNA línea (tienda del ticket + texto tal como se leyó). Sin tienda o sin regla que aplique: es un producto. */
export function classifyTicketLine(store: string | null | undefined, text: string | null | undefined): TicketLineDecision {
  if (store == null || text == null) return PRODUCT
  if (UNSUPPORTED_STORE.test(store)) return PRODUCT
  const storeNorm = normalizeStore(store)
  if (storeNorm === '') return PRODUCT
  const textKey = normalizeText(text)
  if (textKey === '') return PRODUCT
  for (const rule of NON_PRODUCT_RULES) {
    if (rule.textKeys.includes(textKey) && storeMatches(rule, storeNorm)) return { kind: 'non_product', ruleId: rule.id, reason: rule.reason }
  }
  return PRODUCT
}

export function isProductLine(store: string | null | undefined, text: string | null | undefined): boolean {
  return classifyTicketLine(store, text).kind === 'product'
}

export interface SkippedTicketLine<T> {
  line: T
  ruleId: string
  reason: string
}

/** Separa las líneas de un ticket: solo `products` debe persistirse; `skipped` se descarta (y se puede avisar al usuario). Idempotente. */
export function partitionTicketLines<T extends { name: string }>(store: string | null | undefined, lines: readonly T[]): { products: T[]; skipped: SkippedTicketLine<T>[] } {
  const products: T[] = []
  const skipped: SkippedTicketLine<T>[] = []
  for (const line of lines) {
    const decision = classifyTicketLine(store, line.name)
    if (decision.kind === 'product') products.push(line)
    else skipped.push({ line, ruleId: decision.ruleId as string, reason: decision.reason as string })
  }
  return { products, skipped }
}
