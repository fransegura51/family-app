import type { AiPart } from '../_shared/ai/types.ts'
import { parseJsonLoose } from '../_shared/ai/validate.ts'
import { cleanAiText } from '../_shared/communityAi.ts'
import { type Budget, type Validation, generateWithRetry } from './attempt.ts'
import { ARTICLE_CRITERIA_TEXT, DATA_NOTICE, FORBIDDEN_RULES, THANKS_MARKER, VOICE, hasStatClaim, untrusted } from './prompts.ts'
import { RECIPE_SCHEMA, cleanPostRecipes } from './recipes.ts'
import { type GenContext, type KindResult, asArray, asRecord, asStrings, callRpc, normKey, pool, rpcErrorCode, statusFor } from './util.ts'

// ARTÍCULOS de la semana: 7 huecos (uno por día), un artículo por hueco. Cada artículo es un BORRADOR («proposed»): esta función nunca aprueba ni publica.

export const ARTICLE_INTRO_MAX = 420
export const ARTICLE_BODY_MIN = 800
export const ARTICLE_BODY_MIN_WITH_RECIPES = 400
export const ARTICLE_BODY_MAX = 4500
export const ARTICLE_TITLE_MIN = 10
export const ARTICLE_TITLE_MAX = 120
export const MAX_ATTEMPTS_PER_SLOT = 2
export const MAX_AI_CALLS_PER_RUN = 14
const SLOT_CONCURRENCY = 3

export interface ArticleSlot {
  slotDate: string
  topicId: string
  section: string
  label: string
  tier: number
  publishedN: number
  pendingN: number
  groupKey: string | null
  proposalTexts: string[]
  proposalPeople: number
  topicRecentTitles: string[]
}

export interface ArticlePlan {
  slots: ArticleSlot[]
  avoidTitles: string[]
}

// Interpreta la respuesta de community_service_editorial_plan_articles (descarta lo que no tiene la forma esperada).
export function parsePlan(data: unknown): ArticlePlan | null {
  const rec = asRecord(data)
  if (!rec || !Array.isArray(rec.slots)) return null
  const slots: ArticleSlot[] = []
  for (const s of rec.slots) {
    const r = asRecord(s)
    if (!r || typeof r.slot_date !== 'string' || typeof r.topic_id !== 'string') continue
    slots.push({
      slotDate: r.slot_date,
      topicId: r.topic_id,
      section: typeof r.section === 'string' ? r.section : '',
      label: typeof r.label === 'string' ? r.label : r.topic_id,
      tier: typeof r.tier === 'number' ? r.tier : 4,
      publishedN: Number(r.published_n) || 0,
      pendingN: Number(r.pending_n) || 0,
      groupKey: typeof r.group_key === 'string' && r.group_key ? r.group_key : null,
      proposalTexts: asStrings(r.proposal_texts),
      proposalPeople: Number(r.proposal_people) || 0,
      topicRecentTitles: asStrings(r.topic_recent_titles),
    })
  }
  return { slots, avoidTitles: asStrings(rec.avoid_titles) }
}

export const ARTICLE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    body: { type: 'STRING' },
    recipes: { type: 'ARRAY', nullable: true, items: RECIPE_SCHEMA },
  },
  required: ['title', 'body'],
}

// Esquema de la rectificación de un artículo (añade las notas).
export const ARTICLE_REVISION_SCHEMA = {
  type: 'OBJECT',
  properties: { ...ARTICLE_SCHEMA.properties, notes: { type: 'STRING' } },
  required: ['title', 'body', 'notes'],
}

export function buildArticleParts(slot: ArticleSlot, avoid: string[], hint: string | null): AiPart[] {
  const isRecipes = slot.section === 'recetas'
  const lines = [
    VOICE,
    `Escribe UN artículo PRÁCTICO para la sección «${isRecipes ? 'Recetas y cocina' : 'Hogar y familia'}», subtema «${slot.label}».`,
    'Criterios editoriales (obligatorios):',
    ...ARTICLE_CRITERIA_TEXT.map((c) => `- ${c}`),
    '- Concreto y útil de verdad: cantidades, pasos, ejemplos, alternativas. Nada de obviedades ni relleno.',
    `- "title": título claro y atractivo (de ${ARTICLE_TITLE_MIN} a ${ARTICLE_TITLE_MAX} letras), distinto de los títulos a evitar.`,
    `- "body": el artículo, de ${ARTICLE_BODY_MIN} a ${ARTICLE_BODY_MAX} letras, en párrafos cortos (cómodo en el móvil) separados por una línea en blanco. El PRIMER párrafo es la introducción: breve (hasta ${ARTICLE_INTRO_MAX} letras). Texto plano: sin Markdown con enlaces, sin HTML.`,
    FORBIDDEN_RULES,
    'Es un artículo práctico: NO cites datos externos, estudios ni cifras estadísticas.',
    `No escribas la frase «${THANKS_MARKER}…»: la añade el sistema si procede.`,
  ]
  if (isRecipes) {
    lines.push(
      `- Si el tema encaja, puedes incluir "recipes": de 1 a 6 fichas de receta COMPLETAS. Cada ficha: key (minúsculas, números y guiones), title, servings (entero o null si no lo sabes), ingredients [{name, quantity, unit}] sin repetir ningún nombre y sin comas en los nombres, steps (de 1 a 30 pasos), y opcionalmente tip (hasta 400 letras), time {active, total} en minutos, freeze {ideal, note}, tags. No uses "simple".`,
      '- Si incluyes "recipes", el "body" es SOLO la introducción y por qué interesan esas recetas (de 400 a 1500 letras): NO repitas ingredientes ni pasos en el texto (viven solo en las fichas) y no numeres pasos.',
    )
  } else {
    lines.push('- No incluyas "recipes".')
  }
  lines.push('Devuelve únicamente un JSON con "title", "body"' + (isRecipes ? ' y, si procede, "recipes".' : '.'))
  if (slot.proposalTexts.length > 0) {
    lines.push('El tema del artículo ES la idea que han propuesto las familias (te la damos como DATOS): desarróllala de forma útil y original; no copies su redacción.', DATA_NOTICE)
  }
  if (hint) lines.push(`Tu intento anterior se rechazó por este motivo: ${hint}. Corrígelo.`)
  const parts: AiPart[] = [{ text: lines.join('\n') }]
  if (slot.proposalTexts.length > 0) {
    parts.push({ text: untrusted('IDEA_DE_LAS_FAMILIAS', slot.proposalTexts.map((t) => `- ${t}`).join('\n'), 1500) })
  }
  const avoidTitles = [...slot.topicRecentTitles, ...avoid]
  if (avoidTitles.length > 0) parts.push({ text: untrusted('TITULOS_A_EVITAR (no repitas ni parafrasees ninguno)', avoidTitles.slice(0, 90).map((t) => `- ${t}`).join('\n'), 5000) })
  return parts
}

export interface ArticleDraft {
  title: string
  body: string
  recipes: Record<string, unknown>[] | null
}

// Normas del cuerpo comunes a generar y rectificar.
export function checkArticleText(
  title: string,
  body: string,
  opts: { hasRecipes: boolean; introMax?: number; allowStats?: boolean },
): string | null {
  if (!opts.allowStats && hasStatClaim(title + '\n' + body)) return 'no puede haber porcentajes, estadísticas ni estudios'
  if (body.includes(THANKS_MARKER)) return 'no escribas la línea de agradecimiento'
  const first = body.split(/\n\s*\n/)[0] ?? ''
  const introMax = opts.introMax ?? ARTICLE_INTRO_MAX
  if (first.length > introMax) return `la introducción (primer párrafo) tiene ${first.length} letras y el máximo es ${introMax}`
  if (opts.hasRecipes) {
    const numbered = body.split('\n').filter((l) => /^\s*\d+[.)]\s+\S/.test(l)).length
    if (numbered >= 3) return 'hay pasos numerados en el texto y las recetas ya van en sus fichas'
  }
  return null
}

// Valida el JSON de un artículo nuevo. `usedTitles` = títulos prohibidos (ya existentes o ya generados).
export function validateArticle(raw: string, slot: ArticleSlot, usedTitles: Set<string>): Validation<ArticleDraft> {
  const rec = asRecord(parseJsonLoose(raw))
  if (!rec) return { ok: false, reason: 'no era un JSON válido' }
  const title = cleanAiText(rec.title, { min: ARTICLE_TITLE_MIN, max: ARTICLE_TITLE_MAX })
  if (!title) return { ok: false, reason: `el título debe tener de ${ARTICLE_TITLE_MIN} a ${ARTICLE_TITLE_MAX} letras y no llevar enlaces` }
  if (usedTitles.has(normKey(title))) return { ok: false, reason: 'el título repite uno que ya existe' }
  let recipes: Record<string, unknown>[] | null = null
  // Solo la sección de recetas lleva fichas; en otras secciones se ignoran.
  if (slot.section === 'recetas' && rec.recipes != null && asArray(rec.recipes).length > 0) {
    const r = cleanPostRecipes(rec.recipes)
    if (!r.ok) return { ok: false, reason: r.reason }
    recipes = r.value
  }
  const minBody = recipes ? ARTICLE_BODY_MIN_WITH_RECIPES : ARTICLE_BODY_MIN
  const body = cleanAiText(rec.body, { min: minBody, max: ARTICLE_BODY_MAX, multiline: true })
  if (!body) return { ok: false, reason: `el cuerpo debe tener de ${minBody} a ${ARTICLE_BODY_MAX} letras y no llevar enlaces, HTML, correos ni teléfonos` }
  const bad = checkArticleText(title, body, { hasRecipes: recipes !== null })
  if (bad) return { ok: false, reason: bad }
  return { ok: true, value: { title, body, recipes } }
}

// Genera los artículos que faltan de la semana. NUNCA publica: solo crea borradores con community_service_editorial_create_item.
export async function generateArticles(ctx: GenContext, runId: string, week: string): Promise<KindResult> {
  const plan = await callRpc(ctx.admin, 'community_service_editorial_plan_articles', { p_week: week })
  const parsed = plan.error ? null : parsePlan(plan.data)
  if (!parsed) return { status: 'error', created: 0, expected: 0, itemIds: [], errors: ['PLAN_FAILED'], detail: {} }
  const { slots } = parsed
  if (slots.length === 0) return { status: 'ok', created: 0, expected: 0, itemIds: [], errors: [], detail: { nothing_missing: true } }

  const ai = await ctx.getAi()
  if (!ai) return { status: 'skipped', created: 0, expected: slots.length, itemIds: [], errors: ['AI_NOT_ALLOWED'], detail: {} }

  const used = new Set<string>(parsed.avoidTitles.map(normKey))
  for (const s of slots) for (const t of s.topicRecentTitles) used.add(normKey(t))
  const budget: Budget = { used: 0, max: MAX_AI_CALLS_PER_RUN }
  let blocked = false
  const itemIds: string[] = []
  const errors: string[] = []
  const outcomes: { slot_date: string; topic_id: string; outcome: string }[] = []
  let taken = 0

  await pool(slots, SLOT_CONCURRENCY, async (slot) => {
    const note = (outcome: string): void => {
      outcomes.push({ slot_date: slot.slotDate, topic_id: slot.topicId, outcome })
    }
    if (blocked) return note('AI_NOT_ALLOWED')
    const res = await generateWithRetry(
      ai,
      'editorial_article',
      (hint) => ({ parts: buildArticleParts(slot, parsed.avoidTitles, hint), responseSchema: ARTICLE_SCHEMA, maxOutputTokens: 8000 }),
      (raw) => {
        const v = validateArticle(raw, slot, used)
        // Reserva el título EN EL ACTO (los huecos van en paralelo: otro no puede repetirlo).
        if (v.ok) used.add(normKey(v.value.title))
        return v
      },
      { maxAttempts: MAX_ATTEMPTS_PER_SLOT, budget },
    )
    if (!res.ok) {
      if (res.code === 'AI_NOT_ALLOWED') blocked = true
      errors.push(res.code)
      return note(res.code)
    }
    const draft = res.value
    const payload: Record<string, unknown> = { editorial: true }
    if (draft.recipes) payload.recipes = draft.recipes
    const created = await callRpc(ctx.admin, 'community_service_editorial_create_item', {
      p_run: runId,
      p_item: { kind: 'article', slot_date: slot.slotDate, topic_id: slot.topicId, title: draft.title, body: draft.body, payload, group_key: slot.groupKey, tier: slot.tier },
    })
    if (created.error) {
      const code = rpcErrorCode(created.error)
      errors.push(code)
      return note(code)
    }
    if (typeof created.data === 'string' && created.data) {
      itemIds.push(created.data)
      return note('created')
    }
    // Hueco ocupado o título duplicado: no es un error.
    taken++
    return note('SLOT_TAKEN')
  })

  outcomes.sort((a, b) => a.slot_date.localeCompare(b.slot_date))
  const created = itemIds.length
  let status = statusFor(created, slots.length, taken)
  const onlyBlocked = created === 0 && taken === 0 && errors.length > 0 && errors.every((e) => e === 'AI_NOT_ALLOWED')
  if (onlyBlocked) status = 'skipped'
  return { status, created, expected: slots.length, itemIds, errors, detail: { slots: outcomes, ai_calls: budget.used, taken } }
}
