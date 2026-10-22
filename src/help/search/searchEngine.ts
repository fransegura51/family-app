import type { HelpAccessResult } from '@/help/access'
import type { HelpCard, HelpDocEntry, HelpModuleId } from '@/help/types'
import { editDistance, root, significantTokens, stem } from '@/help/search/normalize'
import { SYNONYMS } from '@/help/search/synonyms'

// Buscador LOCAL de la Ayuda (sin llamadas a ningún servidor): busca primero en la documentación verificada de PEPA. Reconoce sinónimos y expresiones habituales, plurales y
// pequeños errores de escritura, y puntúa más lo que está en el título y en los sinónimos de una ficha que en su cuerpo. Antes de puntuar descarta lo que la persona no puede ver
// (permisos, Comunidad, plataforma). Si el resultado no es claro, el que llama decide si ayudarse de la IA (solo para ELEGIR entre estas mismas fichas, nunca para escribir).

export type SearchDoc =
  | { kind: 'card'; id: string; module: HelpModuleId; card: HelpCard }
  | { kind: 'legacy'; id: string; module: HelpModuleId; entry: HelpDocEntry }

interface IndexedDoc {
  doc: SearchDoc
  fields: { title: string[]; synonyms: string[]; body: string[] }
}

export function buildIndex(cards: HelpCard[], legacy: HelpDocEntry[]): IndexedDoc[] {
  const out: IndexedDoc[] = []
  for (const card of cards) {
    out.push({
      doc: { kind: 'card', id: card.id, module: card.module, card },
      fields: {
        title: significantTokens(card.title),
        synonyms: significantTokens(card.synonyms.join(' ')),
        body: significantTokens([card.quick, ...(card.steps ?? []), card.more ?? '', card.limits ?? ''].join(' ')),
      },
    })
  }
  for (const entry of legacy) {
    out.push({
      doc: { kind: 'legacy', id: entry.id, module: entry.module, entry },
      fields: { title: significantTokens(entry.title), synonyms: [], body: significantTokens(entry.text) },
    })
  }
  return out
}

// Parecido entre una palabra de la pregunta y una del texto (0 = nada, 1 = igual).
export function tokenSimilarity(q: string, d: string): number {
  if (q === d) return 1
  const sq = stem(q)
  const sd = stem(d)
  if (sq === sd) return 0.95
  if (q.length >= 5 && d.length >= 5 && root(q) === root(d)) return 0.85
  if (q.length >= 4 && d.length >= 4 && (d.startsWith(q) || q.startsWith(d))) return 0.8
  // Los errores de escritura casi siempre conservan la primera letra: así «apunto» no se confunde con «puntos».
  if (q.length >= 5 && d.length >= 5 && q[0] === d[0]) {
    const max = q.length >= 9 ? 2 : 1
    if (editDistance(sq, sd, max) <= max) return 0.7
  }
  return 0
}

const FIELD_WEIGHT = { title: 3, synonyms: 2.8, body: 1 } as const
const EXPANSION_WEIGHT = 0.65
const CARD_BONUS = 1.35

function bestMatch(tokens: string[], q: string): number {
  let best = 0
  for (const d of tokens) {
    const s = tokenSimilarity(q, d)
    if (s > best) best = s
    if (best === 1) break
  }
  return best
}

export interface SearchHit {
  doc: SearchDoc
  /** 0..1: cuánto de la pregunta explica este resultado (ponderado por dónde aparece cada palabra). */
  score: number
  /** 0..1: proporción de palabras de la pregunta que aparecen (o tienen sinónimo) en el resultado. */
  coverage: number
  /** Puntuación para ordenar (sin tope): premia las fichas curadas y las palabras que están en el título. */
  rank: number
}

export type SearchConfidence = 'clear' | 'weak' | 'none'

export interface SearchResponse {
  hits: SearchHit[]
  confidence: SearchConfidence
  /** Palabras significativas de la pregunta (para que la IA, si se usa, sepa qué se buscó). */
  tokens: string[]
}

export interface SearchOptions {
  /** Decide si la persona puede ver ese resultado: 'hidden' lo descarta, 'restricted' lo deja (con explicación). */
  access: (doc: SearchDoc) => HelpAccessResult
  limit?: number
}

const CLEAR_SCORE = 0.5
const MIN_COVERAGE = 0.5

export function searchHelp(index: IndexedDoc[], query: string, options: SearchOptions): SearchResponse {
  const tokens = significantTokens(query)
  if (tokens.length === 0) return { hits: [], confidence: 'none', tokens }
  const maxPerToken = FIELD_WEIGHT.title
  const hits: SearchHit[] = []
  for (const item of index) {
    if (options.access(item.doc).status === 'hidden') continue
    let total = 0
    let covered = 0
    let inTitle = 0
    for (const q of tokens) {
      if (bestMatch(item.fields.title, q) >= 0.85) inTitle++
      const variants: [string, number][] = [[q, 1], ...((SYNONYMS.get(q) ?? []).map((s) => [s, EXPANSION_WEIGHT]) as [string, number][])]
      let tokenBest = 0
      for (const [word, w] of variants) {
        for (const field of ['title', 'synonyms', 'body'] as const) {
          const sim = bestMatch(item.fields[field], word)
          if (sim > 0) tokenBest = Math.max(tokenBest, sim * FIELD_WEIGHT[field] * w)
        }
      }
      if (tokenBest > 0) covered++
      total += tokenBest
    }
    const coverage = covered / tokens.length
    if (coverage < MIN_COVERAGE) continue
    const raw = total / (tokens.length * maxPerToken)
    // Desempate: a igualdad de puntos gana la ficha cuyo título es más «justo» para la pregunta (menos palabras de título que no se han preguntado).
    const titleSlack = Math.max(0, item.fields.title.length - inTitle)
    const rank = raw * (item.doc.kind === 'card' ? CARD_BONUS : 1) + 0.08 * (inTitle / tokens.length) - 0.02 * titleSlack
    hits.push({ doc: item.doc, score: Math.min(1, raw * (item.doc.kind === 'card' ? CARD_BONUS : 1)), coverage, rank })
  }
  hits.sort((a, b) => b.rank - a.rank || b.coverage - a.coverage || (a.doc.kind === 'card' ? -1 : 1))
  const limited = hits.slice(0, options.limit ?? 8)
  const top = limited[0]
  const confidence: SearchConfidence = !top ? 'none' : top.score >= CLEAR_SCORE && top.coverage >= 0.99 ? 'clear' : 'weak'
  return { hits: limited, confidence, tokens }
}
