import type { AiPurposeSpec } from '../types.ts'
import { asRecord, parseJsonLoose } from '../validate.ts'

// IA de la Ayuda «Pepa te acompaña»: SOLO ELIGE entre fichas de Ayuda ya verificadas. La app manda la pregunta y la lista de fichas que esa persona puede ver (identificador +
// título corto, texto fijo del catálogo de la app); el modelo devuelve identificadores de ESA lista (nunca texto libre) y la app enseña siempre el texto de la ficha. Un
// identificador que no esté en la lista se descarta: el modelo no puede inventar funciones, botones, rutas ni permisos. No se envían datos de la familia ni de las pantallas;
// los nombres de personas que la pregunta pudiera llevar viajan como alias (lo hace el cliente, igual que el resto de la IA de PEPA). Solo cuentas adultas (ai_gate).
export interface HelpSearchCandidate {
  id: string
  title: string
}

export interface HelpSearchInput {
  query: string
  candidates: HelpSearchCandidate[]
  /** Últimas preguntas de esta misma consulta (solo texto, para entender el hilo). */
  recent: string[]
}

export interface HelpSearchOutput {
  ids: string[]
}

const MAX_QUERY = 300
const MAX_CANDIDATES = 140
const MAX_RESULTS = 3
const ID_RE = /^[a-z0-9:-]{3,60}$/

// Tope diario de llamadas de ESTE propósito por familia (control de coste propio de la Ayuda, además del tope general de la pasarela).
export const HELP_SEARCH_DAILY_CAP = 40

export const helpSearchSpec: AiPurposeSpec<HelpSearchInput, HelpSearchOutput> & { purposeDailyCap: number } = {
  purpose: 'help-search',
  purposeDailyCap: HELP_SEARCH_DAILY_CAP,
  maxOutputTokens: 120,

  readInput(body) {
    const { query, candidates, recent } = body
    if (typeof query !== 'string' || !query.trim()) return { ok: false, error: 'missing query' }
    if (query.length > MAX_QUERY) return { ok: false, error: 'query too long' }
    if (!Array.isArray(candidates) || candidates.length === 0 || candidates.length > MAX_CANDIDATES) return { ok: false, error: 'bad candidates' }
    const clean: HelpSearchCandidate[] = []
    const seen = new Set<string>()
    for (const c of candidates) {
      const r = asRecord(c)
      if (!r || typeof r.id !== 'string' || !ID_RE.test(r.id) || typeof r.title !== 'string' || !r.title.trim() || r.title.length > 120) return { ok: false, error: 'bad candidate' }
      if (seen.has(r.id)) continue
      seen.add(r.id)
      clean.push({ id: r.id, title: r.title.trim() })
    }
    const rec = Array.isArray(recent) ? recent.filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, MAX_QUERY)).slice(-3) : []
    return { ok: true, input: { query: query.trim(), candidates: clean, recent: rec } }
  },

  buildParts({ query, candidates, recent }) {
    const list = candidates.map((c) => `${c.id}: ${c.title}`).join('\n')
    const prompt =
      'Eres el buscador de la Ayuda de "PEPA", una app familiar en español. Una persona ha escrito lo que quiere hacer o saber. ' +
      'Tu ÚNICO trabajo es elegir, de la lista de fichas de Ayuda de abajo, las que mejor respondan (como mucho 3, de la más a la menos adecuada). ' +
      'NO escribas respuestas, NO inventes fichas y usa SOLO identificadores que aparezcan en la lista. Si ninguna ficha encaja, devuelve una lista vacía.\n\n' +
      (recent.length > 0 ? `Preguntas anteriores de esta misma consulta: ${recent.map((r) => `"${r}"`).join(' | ')}\n` : '') +
      `Pregunta: "${query}"\n\n` +
      `Fichas disponibles (identificador: título):\n${list}\n\n` +
      'Responde ÚNICAMENTE un objeto JSON, sin texto adicional ni markdown, con esta forma exacta: {"ids": ["id-1", "id-2"]}'
    return [{ text: prompt }]
  },

  parseOutput(rawText, input) {
    const parsed = asRecord(parseJsonLoose(rawText))
    const raw = parsed && Array.isArray(parsed.ids) ? parsed.ids : []
    const allowed = new Set(input.candidates.map((c) => c.id))
    const ids: string[] = []
    for (const id of raw) {
      if (typeof id === 'string' && allowed.has(id) && !ids.includes(id)) ids.push(id)
      if (ids.length >= MAX_RESULTS) break
    }
    return { ids }
  },
}
