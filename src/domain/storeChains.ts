// Cadenas comerciales: reconoce a qué cadena pertenece un ticket a partir del nombre de tienda / origen.
// Espejo puro de la función SQL public.resolve_store_chain (mismos alias, misma normalización, mismas razones) para que el
// clasificador del cliente no dependa de una consulta por línea. Los alias viven en la base de datos (store_chain_aliases).
//
// PRINCIPIO: una cadena NUNCA determina la categoría ni la clase de un producto (Repsol != Combustible, Mercadona != Alimentación).
// La cadena solo da contexto para interpretar el texto comercial. Por eso aquí no existe ningún campo ni función que devuelva una
// clase o una categoría a partir de una cadena.

export type StoreChainKind = 'supermarket' | 'marketplace' | 'fuel_retail' | 'local_shop'

export interface StoreChainRow {
  key: string
  name: string
  kind: StoreChainKind
  learnable: boolean
  status: 'active' | 'inactive'
}

export interface StoreChainAliasRow {
  chain_key: string
  alias_norm: string
  match_mode: 'exact' | 'word_prefix'
}

export type StoreChainUnresolvedReason = 'empty' | 'unsupported_characters' | 'unknown' | 'ambiguous'

export type StoreChainResolution =
  | { status: 'resolved'; chainKey: string; learnable: boolean }
  | { status: 'unresolved'; reason: StoreChainUnresolvedReason }

const ACCENT_FROM = 'ÁÉÍÓÚÜÑáéíóúüñ'
const ACCENT_TO = 'AEIOUUNaeiouun'

/** Igual que la normalización de nombres del servidor (Fase 1): quita las tildes españolas, minúsculas, todo lo que no sea a-z/0-9 pasa a un espacio, sin bordes. */
export function normalizeStoreName(raw: string): string {
  let out = ''
  for (const ch of raw) {
    const i = ACCENT_FROM.indexOf(ch)
    out += i >= 0 ? ACCENT_TO[i] : ch
  }
  return out
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Solo texto latino (más signos generales): con otros alfabetos o emojis no se adivina nada.
const UNSUPPORTED = /[^-ɏ -⁯]/

/** Devuelve la cadena solo cuando es segura; si falta, es desconocida o ambigua, devuelve "sin resolver" (nunca adivina). */
export function resolveStoreChain(
  rawStore: string | null | undefined,
  chains: readonly StoreChainRow[],
  aliases: readonly StoreChainAliasRow[],
): StoreChainResolution {
  if (rawStore == null || rawStore.trim() === '') return { status: 'unresolved', reason: 'empty' }
  if (UNSUPPORTED.test(rawStore)) return { status: 'unresolved', reason: 'unsupported_characters' }
  const norm = normalizeStoreName(rawStore)
  if (norm === '') return { status: 'unresolved', reason: 'empty' }

  const active = new Map(chains.filter((c) => c.status === 'active').map((c) => [c.key, c]))
  const matched = new Set<string>()
  for (const alias of aliases) {
    if (!active.has(alias.chain_key)) continue
    const hit = alias.alias_norm === norm || (alias.match_mode === 'word_prefix' && norm.startsWith(`${alias.alias_norm} `))
    if (hit) matched.add(alias.chain_key)
  }
  if (matched.size === 0) return { status: 'unresolved', reason: 'unknown' }
  if (matched.size > 1) return { status: 'unresolved', reason: 'ambiguous' }
  const chain = active.get([...matched][0])!
  return { status: 'resolved', chainKey: chain.key, learnable: chain.learnable }
}
