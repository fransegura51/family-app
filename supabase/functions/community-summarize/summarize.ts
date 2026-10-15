import type { AiPart } from '../_shared/ai/types.ts'
import { asRecord, parseJsonLoose } from '../_shared/ai/validate.ts'
import { type CommunityAi, DATA_NOTICE, cleanAiText, dataBlock, sanitizeForPrompt, trimToSentence } from '../_shared/communityAi.ts'
import { CORS_HEADERS, type DbResult, type ServiceClient, UUID_RE, jsonResponse } from '../_shared/communityServer.ts'

// «Resumen de Pepa» de una conversación con muchos comentarios (a partir de 15; se actualiza tras 10 nuevos o a petición).
// La llama la APP con el JWT de una persona con alias. Si la IA falla, la conversación sigue accesible: se responde {ok:false} sin lanzar nada.
//
// Lo que viaja a la IA: título y texto de la publicación y los comentarios SIN nombres, alias ni ids (la función SQL
// community_service_summary_input ya los entrega numerados y sin autores). Lo que vuelve: JSON con esquema estricto → texto validado.

export const SUMMARY_MAX_CHARS = 900
const SUMMARY_MIN_CHARS = 60
// Si el modelo se pasa un poco de largo se corta en el último final de frase; si se pasa mucho, se descarta.
const SUMMARY_HARD_MAX = 1500
const SUMMARY_MIN_KEEP = 200
// Reutilizar un resumen recién hecho: dos personas que pulsan «actualizar» a la vez, o alguien que insiste, no generan dos llamadas de IA.
export const SUMMARY_COOLDOWN_MS = 120_000
// Tope de texto de comentarios que viaja a la IA (control de coste): cada comentario se recorta de forma proporcional.
const PROMPT_COMMENTS_BUDGET = 30_000
const PROMPT_COMMENT_MAX = 600

export const SUMMARY_SCHEMA = {
  type: 'OBJECT',
  properties: { summary: { type: 'STRING' } },
  required: ['summary'],
}

export interface SummaryComment {
  n: number
  replyTo: number | null
  text: string
}
export interface SummaryInput {
  title: string
  body: string
  commentCount: number
  comments: SummaryComment[]
}

export function readSummarizeBody(body: unknown): { ok: true; postId: string; force: boolean } | { ok: false } {
  const rec = asRecord(body)
  if (!rec || typeof rec.post_id !== 'string' || !UUID_RE.test(rec.post_id)) return { ok: false }
  return { ok: true, postId: rec.post_id, force: rec.force === true }
}

// Convierte la respuesta de community_service_summary_input en la entrada tipada (null si no hay nada que resumir o no tiene sentido).
export function parseSummaryInput(data: unknown): SummaryInput | null {
  const rec = asRecord(data)
  if (!rec || rec.needed !== true || !Array.isArray(rec.comments)) return null
  const comments: SummaryComment[] = []
  for (const c of rec.comments) {
    const r = asRecord(c)
    if (!r || typeof r.text !== 'string' || !r.text.trim()) continue
    comments.push({ n: Number(r.n), replyTo: typeof r.reply_to === 'number' ? r.reply_to : null, text: r.text })
  }
  if (comments.length === 0) return null
  return {
    title: typeof rec.title === 'string' ? rec.title : '',
    body: typeof rec.body === 'string' ? rec.body : '',
    commentCount: Number(rec.comment_count) || comments.length,
    comments,
  }
}

const INSTRUCTIONS = [
  'Eres Pepa, la ayudante de una comunidad de familias. Escribe un RESUMEN breve, equilibrado e inteligente de los comentarios de una conversación, en español claro y cercano.',
  'Reglas:',
  '- Resume SOLO lo que dicen los comentarios: ideas principales, acuerdos, desacuerdos y consejos repetidos. No inventes conclusiones, cifras ni hechos que no estén escritos.',
  '- Si hay opiniones distintas, preséntalas con equilibrio, sin decantarte por ninguna.',
  '- NO menciones nombres de personas, alias ni usuarios; habla de «algunas personas», «otra persona», «varias familias»...',
  '- Sin enlaces, sin HTML, sin direcciones de correo ni teléfonos. No des consejos médicos, legales ni financieros.',
  `- Máximo ${SUMMARY_MAX_CHARS} caracteres, en uno o dos párrafos cortos y sin listas largas.`,
  'Devuelve únicamente un JSON con el campo "summary".',
  DATA_NOTICE,
].join('\n')

// Prompt: la publicación y los comentarios (numerados, con a quién responden) como DATOS delimitados.
export function buildSummaryParts(input: SummaryInput): AiPart[] {
  const perComment = Math.max(120, Math.min(PROMPT_COMMENT_MAX, Math.floor(PROMPT_COMMENTS_BUDGET / Math.max(input.comments.length, 1))))
  const lines = input.comments.map((c) => `#${c.n}${c.replyTo ? ` (responde a #${c.replyTo})` : ''}: ${sanitizeForPrompt(c.text, perComment).replace(/\n+/g, ' ')}`)
  return [
    { text: INSTRUCTIONS },
    { text: dataBlock('PUBLICACION', `Título: ${sanitizeForPrompt(input.title, 200)}\n${sanitizeForPrompt(input.body, 1200)}`) },
    { text: dataBlock(`COMENTARIOS (${input.commentCount})`, lines.join('\n')) },
  ]
}

// Valida lo que devuelve el modelo: JSON {summary}, texto sin enlaces/HTML, sin @, longitud razonable.
export function validateSummary(rawText: string): string | null {
  const rec = asRecord(parseJsonLoose(rawText))
  if (!rec || typeof rec.summary !== 'string') return null
  if (rec.summary.includes('@')) return null // un @ delata un alias o una mención: el resumen no lleva nombres
  const cleaned = cleanAiText(rec.summary, { min: SUMMARY_MIN_CHARS, max: SUMMARY_HARD_MAX, multiline: true })
  if (cleaned === null) return null
  return trimToSentence(cleaned, SUMMARY_MAX_CHARS, SUMMARY_MIN_KEEP)
}

export interface UserSession {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<DbResult>
}

export interface SummarizeDeps {
  // Comprueba el JWT de la persona y devuelve un acceso con SU sesión (las funciones SQL de lectura aplican sus propias reglas), o null.
  authenticate(authorization: string): Promise<UserSession | null>
  admin: ServiceClient
  getAi(): Promise<CommunityAi | null>
  now?: () => number
}

const NOT_OK = { ok: false }

// Persona con alias, normas aceptadas y sin sanción (los mismos requisitos que para comentar).
function canParticipate(profile: unknown): boolean {
  const p = asRecord(profile)
  return !!p && p.has_profile === true && p.rules_accepted === true && p.ban_state === 'ok'
}

export async function handleSummarize(req: Request, deps: SummarizeDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST') return jsonResponse({ ...NOT_OK, error: 'method_not_allowed' }, 405, true)
  const now = deps.now ?? Date.now
  try {
    const authorization = req.headers.get('Authorization')
    if (!authorization) return jsonResponse({ ...NOT_OK, error: 'unauthorized' }, 401, true)

    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch {
      return jsonResponse({ ...NOT_OK, error: 'invalid_body' }, 400, true)
    }
    const read = readSummarizeBody(rawBody)
    if (!read.ok) return jsonResponse({ ...NOT_OK, error: 'invalid_body' }, 400, true)

    const session = await deps.authenticate(authorization)
    if (!session) return jsonResponse({ ...NOT_OK, error: 'unauthorized' }, 401, true)

    // Solo personas con alias y sin sanción (si no, cualquiera con cuenta podría gastar IA).
    const profile = await session.rpc('community_get_my_profile')
    if (profile.error || !canParticipate(profile.data)) return jsonResponse({ ...NOT_OK, error: 'alias_required' }, 403, true)

    // Estado actual del resumen (lo calcula la base de datos con sus umbrales: 15 comentarios, 10 nuevos...).
    const state = await session.rpc('community_get_summary', { p_post: read.postId })
    const st = asRecord(state.data)
    if (state.error || !st) return jsonResponse({ ...NOT_OK, error: 'not_found' }, 404, true)
    const existing = typeof st.summary === 'string' && st.summary ? st.summary : null
    const generatedMs = typeof st.generated_at === 'string' ? Date.parse(st.generated_at) : NaN

    // Sin nada que hacer: devolver el resumen que ya hay (no es un fallo).
    if (st.eligible !== true) return jsonResponse({ ok: true, summary: existing, reason: 'not_eligible' }, 200, true)
    if (existing && Number.isFinite(generatedMs) && now() - generatedMs < SUMMARY_COOLDOWN_MS) {
      return jsonResponse({ ok: true, summary: existing, reason: 'recent' }, 200, true)
    }
    if (!read.force && st.stale !== true) return jsonResponse({ ok: true, summary: existing, reason: 'fresh' }, 200, true)

    const inputRes = await deps.admin.rpc('community_service_summary_input', { p_post: read.postId, p_force: read.force })
    if (inputRes.error) return jsonResponse({ ...NOT_OK, error: 'unavailable' }, 200, true)
    const input = parseSummaryInput(inputRes.data)
    if (!input) return jsonResponse({ ok: true, summary: existing, reason: 'not_needed' }, 200, true)

    const ai = await deps.getAi()
    if (!ai) return jsonResponse({ ...NOT_OK, reason: 'ai_unavailable' }, 200, true)

    // La IA comprueba el presupuesto, cuenta la llamada y valida el texto; si falla, la conversación sigue accesible sin resumen nuevo.
    const result = await ai.generate('summary', { parts: buildSummaryParts(input), responseSchema: SUMMARY_SCHEMA, maxOutputTokens: 700 }, validateSummary)
    if (!result.ok) return jsonResponse({ ...NOT_OK, reason: result.reason }, 200, true)

    const saved = await deps.admin.rpc('community_service_save_summary', { p_post: read.postId, p_summary: result.value, p_comment_count: input.commentCount })
    if (saved.error) return jsonResponse({ ...NOT_OK, reason: 'not_saved' }, 200, true)
    return jsonResponse({ ok: true, summary: result.value }, 200, true)
  } catch (err) {
    console.error('[community-summarize] error inesperado:', String(err))
    return jsonResponse({ ...NOT_OK, error: 'internal_error' }, 200, true)
  }
}
