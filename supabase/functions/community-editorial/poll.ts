import type { AiPart } from '../_shared/ai/types.ts'
import { parseJsonLoose } from '../_shared/ai/validate.ts'
import { cleanAiText } from '../_shared/communityAi.ts'
import { generateWithRetry, type Validation } from './attempt.ts'
import { DATA_NOTICE, FORBIDDEN_RULES, VOICE, untrusted } from './prompts.ts'
import { type GenContext, type KindResult, asArray, asRecord, asStrings, callRpc, normKey, rpcErrorCode } from './util.ts'

// ENCUESTA de la semana (una, abre el sábado): pregunta sencilla y neutra sobre el hogar. Siempre un borrador «proposed».

export const POLL_QUESTION_MAX = 120
export const POLL_INTRO_MAX = 250
export const POLL_OPTION_MAX = 60
export const POLL_MAX_ATTEMPTS = 2

export interface PollContext {
  slotDate: string
  exists: boolean
  recentQuestions: string[]
  topics: { id: string; label: string }[]
}

export function parsePollContext(data: unknown): PollContext | null {
  const rec = asRecord(data)
  if (!rec || typeof rec.slot_date !== 'string') return null
  const topics: { id: string; label: string }[] = []
  for (const t of asArray(rec.hogar_topics)) {
    const r = asRecord(t)
    if (r && typeof r.id === 'string') topics.push({ id: r.id, label: typeof r.label === 'string' ? r.label : r.id })
  }
  return { slotDate: rec.slot_date, exists: rec.exists === true, recentQuestions: asStrings(rec.recent_questions), topics }
}

export function pollSchema(topicIds: string[]): unknown {
  return {
    type: 'OBJECT',
    properties: {
      question: { type: 'STRING' },
      intro: { type: 'STRING' },
      topic_id: { type: 'STRING', format: 'enum', enum: topicIds },
      options: { type: 'ARRAY', items: { type: 'STRING' } },
    },
    required: ['question', 'intro', 'topic_id', 'options'],
  }
}

// Temas que una encuesta de Pepa nunca toca.
const SENSITIVE_RE = /pol[ií]tic|partido|elecciones|\bvot[oa]|religi|iglesia|\bdios\b|enfermedad|medicina|m[eé]dic|vacun|\bsalud\b|\bdiagn[oó]stic/i
const POLL_STAT_RE = /%|\bestudios?\b|\bestad[ií]stic/i

export interface PollFields {
  title: string
  body: string
  options: string[]
}

// Valida pregunta, introducción y opciones (comunes a generar y rectificar). `minOptions`/`maxOptions`: 3-5 al generar, 2-6 al rectificar.
export function validatePollFields(rec: Record<string, unknown>, recent: Set<string>, minOptions = 3, maxOptions = 5): Validation<PollFields> {
  const title = cleanAiText(rec.question ?? rec.title, { min: 10, max: POLL_QUESTION_MAX })
  if (!title) return { ok: false, reason: `la pregunta debe tener de 10 a ${POLL_QUESTION_MAX} letras y no llevar enlaces` }
  const introRaw = rec.intro ?? rec.body
  const body = cleanAiText(introRaw, { min: 5, max: POLL_INTRO_MAX })
  if (!body) return { ok: false, reason: `la introducción debe tener de 5 a ${POLL_INTRO_MAX} letras y no llevar enlaces` }
  const options: string[] = []
  for (const o of asArray(rec.options)) {
    const opt = cleanAiText(o, { min: 1, max: POLL_OPTION_MAX })
    if (!opt) return { ok: false, reason: `cada opción debe tener de 1 a ${POLL_OPTION_MAX} letras y no llevar enlaces` }
    if (options.some((x) => normKey(x) === normKey(opt))) return { ok: false, reason: 'las opciones deben ser distintas' }
    options.push(opt)
  }
  if (options.length < minOptions || options.length > maxOptions) return { ok: false, reason: `debe haber de ${minOptions} a ${maxOptions} opciones` }
  const all = [title, body, ...options].join('\n')
  if (POLL_STAT_RE.test(all)) return { ok: false, reason: 'sin estadísticas ni estudios' }
  if (SENSITIVE_RE.test(all)) return { ok: false, reason: 'nada de política, religión ni salud' }
  if (recent.has(normKey(title))) return { ok: false, reason: 'la pregunta repite una reciente' }
  return { ok: true, value: { title, body, options } }
}

export interface PollDraft extends PollFields {
  topicId: string
}

export function validatePoll(raw: string, topicIds: string[], recent: Set<string>): Validation<PollDraft> {
  const rec = asRecord(parseJsonLoose(raw))
  if (!rec) return { ok: false, reason: 'no era un JSON válido' }
  const topicId = typeof rec.topic_id === 'string' ? rec.topic_id : ''
  if (!topicIds.includes(topicId)) return { ok: false, reason: 'el tema debe ser uno de la lista' }
  const f = validatePollFields(rec, recent)
  return f.ok ? { ok: true, value: { ...f.value, topicId } } : f
}

export function buildPollParts(ctx: PollContext, hint: string | null): AiPart[] {
  const lines = [
    VOICE,
    'Prepara UNA encuesta para la comunidad, sobre un tema de familia u hogar.',
    `- "question": pregunta sencilla y neutra (hasta ${POLL_QUESTION_MAX} letras). Nunca política, religión ni salud.`,
    `- "intro": introducción breve y cercana (hasta ${POLL_INTRO_MAX} letras).`,
    `- "options": de 3 a 5 opciones distintas y cortas (hasta ${POLL_OPTION_MAX} letras cada una).`,
    `- "topic_id": uno de estos temas: ${ctx.topics.map((t) => `${t.id} (${t.label})`).join('; ')}.`,
    '- Distinta de las preguntas recientes que te damos como DATOS.',
    FORBIDDEN_RULES,
    'Devuelve únicamente un JSON con "question", "intro", "topic_id" y "options".',
    DATA_NOTICE,
  ]
  if (hint) lines.push(`Tu intento anterior se rechazó por este motivo: ${hint}. Corrígelo.`)
  const parts: AiPart[] = [{ text: lines.join('\n') }]
  if (ctx.recentQuestions.length > 0) parts.push({ text: untrusted('PREGUNTAS_RECIENTES', ctx.recentQuestions.map((q) => `- ${q}`).join('\n'), 3000) })
  return parts
}

export async function generatePoll(ctx: GenContext, runId: string, week: string): Promise<KindResult> {
  const c = await callRpc(ctx.admin, 'community_service_editorial_context', { p_kind: 'poll', p_week: week })
  const pc = c.error ? null : parsePollContext(c.data)
  if (!pc) return { status: 'error', created: 0, expected: 1, itemIds: [], errors: ['CONTEXT_FAILED'], detail: {} }
  if (pc.exists) return { status: 'skipped', created: 0, expected: 0, itemIds: [], errors: [], detail: { reason: 'EXISTS' } }
  if (pc.topics.length === 0) return { status: 'error', created: 0, expected: 1, itemIds: [], errors: ['NO_TOPICS'], detail: {} }

  const ai = await ctx.getAi()
  if (!ai) return { status: 'skipped', created: 0, expected: 1, itemIds: [], errors: ['AI_NOT_ALLOWED'], detail: {} }
  const topicIds = pc.topics.map((t) => t.id)
  const recent = new Set(pc.recentQuestions.map(normKey))
  const res = await generateWithRetry(
    ai,
    'editorial_poll',
    (hint) => ({ parts: buildPollParts(pc, hint), responseSchema: pollSchema(topicIds), maxOutputTokens: 1000 }),
    (raw) => validatePoll(raw, topicIds, recent),
    { maxAttempts: POLL_MAX_ATTEMPTS },
  )
  if (!res.ok) {
    return { status: res.code === 'AI_NOT_ALLOWED' ? 'skipped' : 'error', created: 0, expected: 1, itemIds: [], errors: [res.code], detail: { ai_calls: res.calls } }
  }
  const d = res.value
  const created = await callRpc(ctx.admin, 'community_service_editorial_create_item', {
    p_run: runId,
    p_item: { kind: 'poll', slot_date: pc.slotDate, topic_id: d.topicId, title: d.title, body: d.body, payload: { options: d.options } },
  })
  if (created.error) return { status: 'error', created: 0, expected: 1, itemIds: [], errors: [rpcErrorCode(created.error)], detail: { ai_calls: res.calls } }
  if (typeof created.data !== 'string' || !created.data) {
    // Hueco ocupado o pregunta repetida: no es un error (no se duplica).
    return { status: 'ok', created: 0, expected: 1, itemIds: [], errors: [], detail: { ai_calls: res.calls, taken: true } }
  }
  return { status: 'ok', created: 1, expected: 1, itemIds: [created.data], errors: [], detail: { ai_calls: res.calls } }
}
