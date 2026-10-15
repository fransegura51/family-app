import type { AiPart } from '../_shared/ai/types.ts'
import { asRecord, parseJsonLoose } from '../_shared/ai/validate.ts'
import { type CommunityAi, type CommunityAiPurpose, DATA_NOTICE, cleanAiText, dataBlock, sanitizeForPrompt } from '../_shared/communityAi.ts'
import { type ServiceClient, UUID_RE, asRows, authorizeCron, jsonResponse, madridDate } from '../_shared/communityServer.ts'

// Pepa responde en Comunidad (la llama el cron cada 10 minutos con la cabecera x-cron-secret):
//   (a) menciones directas «@pepa» en un comentario (antes que nada: la persona las ha pedido);
//   (b) preguntas SIN respuesta humana tras 6 horas, con un presupuesto de 3 por hora móvil (lo aplica la base de datos: community_service_pepa_candidates
//       solo devuelve las que caben; la cuarta posible avisa a los dos administradores desde SQL).
// Las respuestas se publican con la identidad oficial «Pepa» (community_service_pepa_comment), que además limpia el texto como a cualquier comentario.
//
// Garantías: respeta el tope diario de IA, cuenta cada llamada, un fallo de IA NO para el resto ni se reintenta dentro de la ejecución, y el texto de la
// IA se valida (longitud, sin enlaces/HTML/correos/teléfonos). El aviso de que es una ayuda de Pepa lo añade el CÓDIGO, no el modelo.

export const ANSWER_MIN_CHARS = 20
export const ANSWER_MAX_CHARS = 1200
// Cierre fijo de toda respuesta: avisa de que es una ayuda de Pepa y de que otras familias pueden aportar (lo exige la especificación).
export const ANSWER_CLOSING = '— Esto es una ayuda de Pepa. Otras familias de la comunidad también pueden aportar su experiencia.'
// Si el modelo marca la pregunta como delicada (salud, leyes, dinero con riesgo...) NO se publica su consejo: se publica este texto fijo.
export const SENSITIVE_REPLY =
  'Gracias por preguntar. Es un tema delicado y no quiero darte un consejo que no encaje con tu caso: lo mejor es consultarlo con un profesional (médico, abogado o asesor, según corresponda). Mientras tanto, otras familias pueden contarte su experiencia.'

// Cuántos errores de IA de respuestas espontáneas se toleran en un día antes de dejar de intentarlo (freno contra bucles: una pregunta cuya respuesta falla
// sigue «candidata» y volvería a intentarse en cada ejecución).
export const MAX_UNANSWERED_ERRORS_PER_DAY = 6
const MENTION_CONCURRENCY = 4
// Tiempo máximo de una ejecución: pasado esto no se empiezan respuestas nuevas (las funciones de servidor tienen un límite de duración).
const DEFAULT_DEADLINE_MS = 100_000

export const ANSWER_SCHEMA = {
  type: 'OBJECT',
  properties: {
    answer: { type: 'STRING' },
    sensitive: { type: 'BOOLEAN' },
  },
  required: ['answer', 'sensitive'],
}

export interface Candidate {
  postId: string
  title: string
  body: string
}
export interface Mention {
  commentId: string
  postId: string
  text: string
  title: string
  postBody: string
}

export function parseCandidates(data: unknown): Candidate[] {
  const out: Candidate[] = []
  for (const r of asRows(data)) {
    if (typeof r.post_id !== 'string' || !UUID_RE.test(r.post_id)) continue
    out.push({ postId: r.post_id, title: typeof r.title === 'string' ? r.title : '', body: typeof r.body === 'string' ? r.body : '' })
  }
  return out
}

export function parseMentions(data: unknown): Mention[] {
  const out: Mention[] = []
  for (const r of asRows(data)) {
    if (typeof r.comment_id !== 'string' || !UUID_RE.test(r.comment_id) || typeof r.post_id !== 'string' || !UUID_RE.test(r.post_id)) continue
    out.push({
      commentId: r.comment_id,
      postId: r.post_id,
      text: typeof r.text === 'string' ? r.text : '',
      title: typeof r.title === 'string' ? r.title : '',
      postBody: typeof r.post_body === 'string' ? r.post_body : '',
    })
  }
  return out
}

const PERSONA = [
  'Eres Pepa, una ayudante cálida y cercana de una comunidad de familias (cocina, hogar, crianza, ahorro). Escribes en español claro, con frases cortas, como una vecina amable con experiencia.',
  'Reglas:',
  `- Respuesta breve (de 3 a 6 frases, máximo ${ANSWER_MAX_CHARS} caracteres), útil y práctica. Si no estás segura de algo, dilo con naturalidad; no inventes datos, cifras ni recetas dudosas.`,
  '- Sin enlaces, sin HTML, sin direcciones de correo ni teléfonos. No menciones nombres de personas ni alias.',
  '- NO des consejos médicos, legales ni financieros que puedan ser peligrosos (diagnósticos, dosis, medicación, impuestos, inversiones, contratos...). En ese caso marca "sensitive": true.',
  '- NO escribas tú el aviso final de que eres una ayuda de Pepa: lo añade el sistema.',
  'Devuelve únicamente un JSON con "answer" (tu respuesta) y "sensitive" (true si el tema es médico, legal, financiero o peligroso).',
  DATA_NOTICE,
].join('\n')

export function buildUnansweredParts(c: Candidate): AiPart[] {
  return [
    { text: `${PERSONA}\n\nTarea: una persona hizo una pregunta y nadie le ha respondido en varias horas. Respóndele tú.` },
    { text: dataBlock('PREGUNTA', `Título: ${sanitizeForPrompt(c.title, 200)}\n${sanitizeForPrompt(c.body, 2000)}`) },
  ]
}

export function buildMentionParts(m: Mention): AiPart[] {
  return [
    { text: `${PERSONA}\n\nTarea: una persona te ha mencionado con @pepa en un comentario. Responde a lo que te pide o pregunta, teniendo en cuenta la publicación.` },
    { text: dataBlock('PUBLICACION', `Título: ${sanitizeForPrompt(m.title, 200)}\n${sanitizeForPrompt(m.postBody, 1500)}`) },
    { text: dataBlock('COMENTARIO_QUE_TE_MENCIONA', sanitizeForPrompt(m.text, 1000)) },
  ]
}

// Valida lo que devuelve el modelo y construye el texto FINAL que se publicará (respuesta + cierre fijo). null = no publicar.
export function validateAnswer(rawText: string): string | null {
  const rec = asRecord(parseJsonLoose(rawText))
  if (!rec || typeof rec.answer !== 'string') return null
  if (rec.sensitive === true) return `${SENSITIVE_REPLY}\n\n${ANSWER_CLOSING}`
  const cleaned = cleanAiText(rec.answer, { min: ANSWER_MIN_CHARS, max: ANSWER_MAX_CHARS, multiline: true })
  if (cleaned === null || cleaned.includes('@')) return null
  return `${cleaned}\n\n${ANSWER_CLOSING}`
}

export interface PepaDeps {
  admin: ServiceClient
  getAi(): Promise<CommunityAi | null>
  now?: () => Date
  deadlineMs?: number
}

export interface PepaReport {
  skipped?: 'ai_not_allowed' | 'ai_unavailable'
  mentions: { received: number; answered: number; failed: number }
  unanswered: { received: number; answered: number; failed: number; paused?: boolean }
}

// Procesa con un máximo de `limit` tareas a la vez (ni una sola fallida detiene a las demás).
async function mapLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]
      try {
        await fn(item)
      } catch (err) {
        console.error('[community-pepa] tarea fallida:', String(err))
      }
    }
  })
  await Promise.all(workers)
}

// Errores de IA de respuestas espontáneas ya contados hoy (día de Madrid). Si no se puede leer, no se frena.
async function unansweredErrorsToday(admin: ServiceClient, now: Date): Promise<number> {
  try {
    const { data, error } = await admin.from('community_ai_usage').select('purpose,errors').eq('day', madridDate(now))
    if (error) return 0
    return asRows(data)
      .filter((r) => r.purpose === 'pepa_answer')
      .reduce((sum, r) => sum + (Number(r.errors) || 0), 0)
  } catch {
    return 0
  }
}

export async function runPepa(deps: PepaDeps): Promise<PepaReport> {
  const { admin } = deps
  const now = deps.now ?? (() => new Date())
  const startedAt = now().getTime()
  const deadlineMs = deps.deadlineMs ?? DEFAULT_DEADLINE_MS
  const report: PepaReport = { mentions: { received: 0, answered: 0, failed: 0 }, unanswered: { received: 0, answered: 0, failed: 0 } }
  const overDeadline = () => now().getTime() - startedAt > deadlineMs

  // Antes de consumir nada (las menciones se «gastan» al pedirlas): ¿Comunidad lanzada y sin llegar al tope diario de IA?
  const allowed = await admin.rpc('community_service_ai_allowed')
  if (allowed.error || allowed.data !== true) return { ...report, skipped: 'ai_not_allowed' }

  const [mentionsRes, candidatesRes] = await Promise.all([admin.rpc('community_service_pepa_mentions'), admin.rpc('community_service_pepa_candidates')])
  const mentions = mentionsRes.error ? [] : parseMentions(mentionsRes.data)
  let candidates = candidatesRes.error ? [] : parseCandidates(candidatesRes.data)
  report.mentions.received = mentions.length
  report.unanswered.received = candidates.length
  if (mentions.length === 0 && candidates.length === 0) return report

  // Freno de bucles: demasiados fallos de IA hoy en respuestas espontáneas → hoy no se insiste (las menciones ya se han pedido y se responden igualmente).
  if (candidates.length > 0 && (await unansweredErrorsToday(admin, now())) >= MAX_UNANSWERED_ERRORS_PER_DAY) {
    candidates = []
    report.unanswered.paused = true
  }
  if (mentions.length === 0 && candidates.length === 0) return report

  const ai = await deps.getAi()
  if (!ai) return { ...report, skipped: 'ai_unavailable' }
  const aiClient: CommunityAi = ai

  let stop = false // tope de IA alcanzado a mitad de ejecución: no se llama más
  async function answer(purpose: CommunityAiPurpose, parts: AiPart[], post: string, kind: 'mention' | 'unanswered', replyTo: string | null, counter: { answered: number; failed: number }) {
    if (stop || overDeadline()) {
      counter.failed++
      return
    }
    const result = await aiClient.generate(purpose, { parts, responseSchema: ANSWER_SCHEMA, maxOutputTokens: 700 }, validateAnswer)
    if (!result.ok) {
      if (result.reason === 'not_allowed') stop = true
      counter.failed++
      return
    }
    const posted = await admin.rpc('community_service_pepa_comment', { p_post: post, p_body: result.value, p_kind: kind, p_reply_to: replyTo })
    if (posted.error) {
      counter.failed++
      // La publicación falló (por ejemplo, la base de datos rechazó el texto): se anota como error para que el freno diario evite insistir en bucle.
      try {
        await admin.rpc('community_service_record_ai', { p_purpose: purpose, p_error: true })
      } catch {
        /* solo es un contador */
      }
      return
    }
    counter.answered++
  }

  await mapLimited(mentions, MENTION_CONCURRENCY, (m) => answer('pepa_mention', buildMentionParts(m), m.postId, 'mention', m.commentId, report.mentions))
  // Las respuestas espontáneas, de una en una (son pocas: 3 por hora) y sin reintentos.
  for (const c of candidates) {
    try {
      await answer('pepa_answer', buildUnansweredParts(c), c.postId, 'unanswered', null, report.unanswered)
    } catch (err) {
      report.unanswered.failed++
      console.error('[community-pepa] respuesta espontánea fallida:', String(err))
    }
  }
  return report
}

export async function handlePepa(req: Request, deps: PepaDeps): Promise<Response> {
  const denied = await authorizeCron(req, deps.admin)
  if (denied) return denied
  try {
    return jsonResponse({ ok: true, ...(await runPepa(deps)) })
  } catch (err) {
    console.error('[community-pepa] error inesperado:', String(err))
    return jsonResponse({ ok: false, error: 'internal_error' }, 500)
  }
}
