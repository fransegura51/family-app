import type { AiPart } from '../_shared/ai/types.ts'
import { parseJsonLoose } from '../_shared/ai/validate.ts'
import { type CommunityAi, cleanAiText } from '../_shared/communityAi.ts'
import { ARTICLE_INTRO_MAX, ARTICLE_REVISION_SCHEMA, checkArticleText } from './articles.ts'
import { type AttemptResult, type Validation, generateWithRetry } from './attempt.ts'
import {
  DAY_NAMES,
  type MealName,
  MEAL_SCHEMA,
  cleanMeal,
  MEALS,
  type Meal,
  dayFromError,
  validateMenuPayload,
} from './menu.ts'
import { validatePollFields } from './poll.ts'
import { DATA_NOTICE, FORBIDDEN_RULES, VOICE, splitThanks, untrusted } from './prompts.ts'
import { RECIPE_SCHEMA, cleanPostRecipes } from './recipes.ts'
import { type GenContext, asArray, asRecord, pool } from './util.ts'

// RECTIFICAR un borrador con IA a petición de un administrador. NUNCA modifica el elemento: devuelve una PROPUESTA ({title, body, payload}) que el
// servidor guarda con community_service_editorial_save_revision y que la persona acepta o rechaza en el panel.

export interface ItemContent {
  id: string
  kind: string
  section: string
  topicId: string
  topicLabel: string
  status: string
  version: number
  title: string
  body: string
  payload: Record<string, unknown>
}

export interface Content {
  title: string
  body: string
  payload: Record<string, unknown>
}

export interface ReviseRequest {
  itemId: string
  instruction: string
  scope: 'item' | 'dish'
  target: { day: number; meal: MealName } | null
}

export type ReviseFailure = 'ai_not_allowed' | 'ai_failed' | 'invalid_output' | 'bad_request'
export type ReviseOutcome = { ok: true; result: Content; notes: string; quality?: unknown[] } | { ok: false; error: ReviseFailure }

export const REVISE_MAX_ATTEMPTS = 2
export const NO_CHANGE_NOTE = 'La instrucción no ha supuesto ningún cambio en el contenido.'

export function parseItem(data: unknown): ItemContent | null {
  const r = asRecord(data)
  if (!r || typeof r.id !== 'string' || typeof r.kind !== 'string') return null
  return {
    id: r.id,
    kind: r.kind,
    section: typeof r.section === 'string' ? r.section : '',
    topicId: typeof r.topic_id === 'string' ? r.topic_id : '',
    topicLabel: typeof r.topic_label === 'string' ? r.topic_label : '',
    status: typeof r.status === 'string' ? r.status : '',
    version: Number(r.version) || 1,
    title: typeof r.title === 'string' ? r.title : '',
    body: typeof r.body === 'string' ? r.body : '',
    payload: asRecord(r.payload) ?? {},
  }
}

// Lee la petición de rectificar (null = petición mal formada).
export function parseReviseRequest(body: Record<string, unknown>): ReviseRequest | null {
  const itemId = body.item_id
  if (typeof itemId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(itemId)) return null
  const instruction = typeof body.instruction === 'string' ? body.instruction.trim() : ''
  if (instruction.length < 3 || instruction.length > 1000) return null
  const scope = body.scope
  if (scope !== 'item' && scope !== 'dish') return null
  let target: ReviseRequest['target'] = null
  if (scope === 'dish') {
    const t = asRecord(body.target)
    if (!t || typeof t.day !== 'number' || !Number.isInteger(t.day) || t.day < 0 || t.day > 6 || (t.meal !== 'comida' && t.meal !== 'cena')) return null
    target = { day: t.day, meal: t.meal }
  }
  return { itemId, instruction, scope, target }
}

const NOTES_SCHEMA = { type: 'STRING' }

function cleanNotes(value: unknown): string {
  return cleanAiText(value, { min: 3, max: 500 }) ?? 'Cambios aplicados según la instrucción.'
}

function header(kindText: string, instruction: string): string {
  return [
    VOICE,
    `Rectificas un borrador existente (${kindText}) según la instrucción de una persona administradora, que te damos como DATOS.`,
    'REGLA CLAVE: cambia SOLO lo que la instrucción afecte y conserva TODO lo demás LITERALMENTE (mismas palabras, mismo orden, mismas cifras y mismas fichas). No reescribas lo que no te piden.',
    FORBIDDEN_RULES,
    '"notes": resume en 1 o 2 frases lo que has cambiado (o di que no hacía falta cambiar nada, dejando el contenido igual).',
    DATA_NOTICE,
    untrusted('INSTRUCCION', instruction, 1000),
  ].join('\n')
}

const hintLine = (hint: string | null): string => (hint ? `\nTu intento anterior se rechazó por este motivo: ${hint}. Corrígelo.` : '')

// ---- artículo ------------------------------------------------------------------------------------------------------------------------
async function reviseArticle(ctx: GenContext, item: ItemContent, req: ReviseRequest): Promise<ReviseOutcome> {
  const ai = await ctx.getAi()
  if (!ai) return { ok: false, error: 'ai_not_allowed' }
  // La línea de agradecimiento a las familias NO viaja a la IA: se quita antes y se vuelve a añadir tal cual.
  const { text, thanks } = splitThanks(item.body)
  const originalRecipes = Array.isArray(item.payload.recipes) && item.payload.recipes.length > 0 ? (item.payload.recipes as Record<string, unknown>[]) : null
  const canHaveRecipes = originalRecipes !== null || item.section === 'recetas'
  const hasSources = asArray(item.payload.sources).length > 0
  const originalIntro = (text.split(/\n\s*\n/)[0] ?? '').length
  const bodyMax = Math.max(5000, text.length)

  const validate = (raw: string): Validation<{ title: string; body: string; recipes: Record<string, unknown>[] | null; notes: string }> => {
    const rec = asRecord(parseJsonLoose(raw))
    if (!rec) return { ok: false, reason: 'no era un JSON válido' }
    const title = cleanAiText(rec.title, { min: 3, max: 140 })
    if (!title) return { ok: false, reason: 'el título no es válido (3-140 letras, sin enlaces)' }
    let recipes = originalRecipes
    if (canHaveRecipes && Array.isArray(rec.recipes) && rec.recipes.length > 0) {
      const r = cleanPostRecipes(rec.recipes)
      if (!r.ok) return { ok: false, reason: r.reason }
      recipes = r.value
    }
    const body = cleanAiText(rec.body, { min: 200, max: bodyMax, multiline: true })
    if (!body) return { ok: false, reason: `el cuerpo debe tener de 200 a ${bodyMax} letras y no llevar enlaces, HTML, correos ni teléfonos` }
    const bad = checkArticleText(title, body, { hasRecipes: recipes !== null, introMax: Math.max(ARTICLE_INTRO_MAX, originalIntro), allowStats: hasSources })
    if (bad) return { ok: false, reason: bad }
    return { ok: true, value: { title, body, recipes, notes: cleanNotes(rec.notes) } }
  }

  const current = [`Título: ${item.title}`, '', text, ...(originalRecipes ? ['', 'Fichas de recetas (JSON):', JSON.stringify(originalRecipes)] : [])].join('\n')
  const res = await generateWithRetry(
    ai,
    'editorial_revise',
    (hint) => {
      const parts: AiPart[] = [
        {
          text:
            header('un artículo', req.instruction) +
            '\nDevuelve un JSON con "title", "body", "notes" y, SOLO si la instrucción afecta a las recetas, "recipes" con TODAS las fichas (si no se tocan, omítelo y se conservan las actuales).' +
            hintLine(hint),
        },
        { text: untrusted('CONTENIDO_ACTUAL', current, 30000) },
      ]
      return { parts, responseSchema: { ...ARTICLE_REVISION_SCHEMA, properties: { ...ARTICLE_REVISION_SCHEMA.properties, recipes: { type: 'ARRAY', nullable: true, items: RECIPE_SCHEMA } } }, maxOutputTokens: 10000 }
    },
    validate,
    { maxAttempts: REVISE_MAX_ATTEMPTS },
  )
  if (!res.ok) return failure(res.code)
  const v = res.value
  const body = thanks ? `${v.body}\n\n${thanks}` : v.body
  const payload = { ...item.payload }
  if (v.recipes) payload.recipes = v.recipes
  const result: Content = { title: v.title, body, payload }
  const same = JSON.stringify(result) === JSON.stringify({ title: item.title, body: item.body, payload: item.payload })
  return { ok: true, result, notes: same ? NO_CHANGE_NOTE : v.notes }
}

function failure(code: string): ReviseOutcome {
  if (code === 'AI_NOT_ALLOWED') return { ok: false, error: 'ai_not_allowed' }
  return { ok: false, error: code === 'AI_FAILED' ? 'ai_failed' : 'invalid_output' }
}

// ---- encuesta ------------------------------------------------------------------------------------------------------------------------
async function revisePoll(ctx: GenContext, item: ItemContent, req: ReviseRequest): Promise<ReviseOutcome> {
  const ai = await ctx.getAi()
  if (!ai) return { ok: false, error: 'ai_not_allowed' }
  const options = asArray(item.payload.options).filter((o): o is string => typeof o === 'string')
  const current = [`Pregunta: ${item.title}`, `Introducción: ${item.body}`, ...options.map((o, i) => `Opción ${i + 1}: ${o}`)].join('\n')
  const schema = {
    type: 'OBJECT',
    properties: { title: { type: 'STRING' }, body: { type: 'STRING' }, options: { type: 'ARRAY', items: { type: 'STRING' } }, notes: NOTES_SCHEMA },
    required: ['title', 'body', 'options', 'notes'],
  }
  const res = await generateWithRetry(
    ai,
    'editorial_revise',
    (hint) => ({
      parts: [
        {
          text:
            header('una encuesta', req.instruction) +
            '\nDevuelve un JSON con "title" (la pregunta, hasta 120 letras), "body" (la introducción, hasta 250), "options" (de 2 a 6 opciones distintas, hasta 60 letras) y "notes". Nunca política, religión ni salud.' +
            hintLine(hint),
        },
        { text: untrusted('CONTENIDO_ACTUAL', current, 3000) },
      ],
      responseSchema: schema,
      maxOutputTokens: 1500,
    }),
    (raw) => {
      const rec = asRecord(parseJsonLoose(raw))
      if (!rec) return { ok: false, reason: 'no era un JSON válido' }
      const f = validatePollFields(rec, new Set(), 2, 6)
      return f.ok ? { ok: true, value: { ...f.value, notes: cleanNotes(rec.notes) } } : f
    },
    { maxAttempts: REVISE_MAX_ATTEMPTS },
  )
  if (!res.ok) return failure(res.code)
  const v = res.value
  const result: Content = { title: v.title, body: v.body, payload: { ...item.payload, options: v.options } }
  const same = JSON.stringify(result) === JSON.stringify({ title: item.title, body: item.body, payload: item.payload })
  return { ok: true, result, notes: same ? NO_CHANGE_NOTE : v.notes }
}

// ---- menú ----------------------------------------------------------------------------------------------------------------------------
// Rectificar un menú nunca reescribe el menú entero en una sola llamada (salida enorme y lenta):
//   · scope «dish»: la IA devuelve SOLO ese plato.
//   · scope «item»: una llamada corta decide QUÉ platos cambiar (y, si la instrucción solo toca el texto, el título/la introducción nuevos); después se
//     regeneran SOLO esos platos en paralelo, cada uno con el mismo mecanismo que «dish». Todo lo demás queda idéntico byte a byte.
export const MAX_DISH_CHANGES = 8
export const DISH_CONCURRENCY = 4

interface DishRef {
  day: number
  meal: MealName
}

const mealOf = (days: unknown[], d: DishRef): Record<string, unknown> | null => asRecord(asRecord(asRecord(days[d.day])?.meals)?.[d.meal])

// Revisa UN plato: devuelve el plato nuevo ya limpio (cleanMeal) y las notas de la IA.
function reviseOneDish(ai: CommunityAi, days: unknown[], dish: DishRef, instruction: string, hint: string | null, attempts: number): Promise<AttemptResult<{ meal: Meal; notes: string }>> {
  const meal = mealOf(days, dish)
  const others = days
    .map((d, i) => {
      const m = asRecord(asRecord(d)?.meals)
      return `- ${DAY_NAMES[i]}: comida «${asRecord(m?.comida)?.title ?? ''}»; cena «${asRecord(m?.cena)?.title ?? ''}»`
    })
    .join('\n')
  const current = [`Plato a rectificar: ${DAY_NAMES[dish.day]}, ${dish.meal}.`, JSON.stringify(meal), '', 'Resto de la semana (solo para no repetir platos más de 2 veces):', others].join('\n')
  const schema = { type: 'OBJECT', properties: { ...MEAL_SCHEMA.properties, notes: NOTES_SCHEMA }, required: ['title', 'side', 'recipes', 'notes'] }
  const extra =
    '\nDevuelve SOLO ese plato como JSON {title, side, recipes, notes}: "recipes" con TODAS sus recetas completas (la primera es el plato principal; servings 4; ingredientes con cantidad numérica y sin comas en los nombres; 1-30 pasos). Mantén lo que la instrucción no toque.'
  return generateWithRetry(
    ai,
    'editorial_revise',
    (h) => ({
      parts: [{ text: header(`un plato de un menú semanal: ${DAY_NAMES[dish.day]}, ${dish.meal}`, instruction) + extra + hintLine(h) }, { text: untrusted('CONTENIDO_ACTUAL', current, 30000) }],
      responseSchema: schema,
      maxOutputTokens: 12000,
    }),
    (raw) => {
      const rec = asRecord(parseJsonLoose(raw))
      if (!rec) return { ok: false, reason: 'no era un JSON válido' }
      const m = cleanMeal(rec, `${DAY_NAMES[dish.day]} (${dish.meal})`)
      return m.ok ? { ok: true, value: { meal: m.value, notes: cleanNotes(rec.notes) } } : m
    },
    { maxAttempts: attempts, initialHint: hint },
  )
}

// Copia del payload con los platos sustituidos: todo lo demás se conserva tal cual (byte a byte).
function applyDishes(payload: Record<string, unknown>, changes: { dish: DishRef; meal: Meal }[]): Record<string, unknown> | null {
  const copy = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>
  for (const c of changes) {
    const meals = asRecord(asRecord(asArray(asRecord(copy.menu)?.days)[c.dish.day])?.meals)
    if (!meals) return null
    meals[c.dish.meal] = c.meal
  }
  return copy
}

const TRIAGE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    changes: { type: 'ARRAY', items: { type: 'OBJECT', properties: { day: { type: 'INTEGER' }, meal: { type: 'STRING', format: 'enum', enum: ['comida', 'cena'] }, instruction_for_this_dish: { type: 'STRING' } }, required: ['day', 'meal', 'instruction_for_this_dish'] } },
    title: { type: 'STRING', nullable: true },
    body: { type: 'STRING', nullable: true },
    notes: NOTES_SCHEMA,
  },
  required: ['changes', 'notes'],
}

interface Triage {
  changes: { dish: DishRef; instruction: string }[]
  title: string | null
  body: string | null
  notes: string
  dropped: number
}

function validateTriage(raw: string): Validation<Triage> {
  const rec = asRecord(parseJsonLoose(raw))
  if (!rec) return { ok: false, reason: 'no era un JSON válido' }
  const changes: Triage['changes'] = []
  const seen = new Set<string>()
  for (const c of asArray(rec.changes)) {
    const r = asRecord(c)
    if (!r || typeof r.day !== 'number' || !Number.isInteger(r.day) || r.day < 0 || r.day > 6 || (r.meal !== 'comida' && r.meal !== 'cena')) return { ok: false, reason: 'cada cambio necesita day (0 a 6) y meal (comida o cena)' }
    const instruction = cleanAiText(r.instruction_for_this_dish, { min: 3, max: 500 })
    if (!instruction) return { ok: false, reason: 'cada cambio necesita una instrucción breve para ese plato (3-500 letras, sin enlaces)' }
    const key = `${r.day}:${r.meal}`
    if (seen.has(key)) continue
    seen.add(key)
    changes.push({ dish: { day: r.day, meal: r.meal }, instruction })
  }
  let title: string | null = null
  if (typeof rec.title === 'string' && rec.title.trim() !== '') {
    title = cleanAiText(rec.title, { min: 3, max: 140 })
    if (!title) return { ok: false, reason: 'el título nuevo no es válido (3-140 letras, sin enlaces)' }
  }
  let body: string | null = null
  if (typeof rec.body === 'string' && rec.body.trim() !== '') {
    body = cleanAiText(rec.body, { min: 5, max: 3000, multiline: true })
    if (!body) return { ok: false, reason: 'la introducción nueva no es válida (5-3000 letras, sin enlaces)' }
  }
  // Los más relevantes primero (la IA los ordena por relevancia): se rectifican como máximo MAX_DISH_CHANGES.
  const kept = changes.slice(0, MAX_DISH_CHANGES)
  return { ok: true, value: { changes: kept, title, body, notes: cleanNotes(rec.notes), dropped: changes.length - kept.length } }
}

async function reviseMenu(ctx: GenContext, item: ItemContent, req: ReviseRequest): Promise<ReviseOutcome> {
  const ai = await ctx.getAi()
  if (!ai) return { ok: false, error: 'ai_not_allowed' }
  const menu = asRecord(item.payload.menu)
  const days = asArray(menu?.days)
  if (!menu || days.length !== 7) return { ok: false, error: 'invalid_output' }
  const dish = req.scope === 'dish' ? req.target : null
  if (req.scope === 'dish' && !dish) return { ok: false, error: 'bad_request' }
  const original = { title: item.title, body: item.body, payload: item.payload }
  const finish = (result: Content, notes: string, quality?: unknown[]): ReviseOutcome => ({
    ok: true,
    result,
    notes: JSON.stringify(result) === JSON.stringify(original) ? NO_CHANGE_NOTE : notes,
    ...(quality ? { quality } : {}),
  })

  // ---- un plato -------------------------------------------------------------------------------------------------------------------
  if (dish) {
    if (!mealOf(days, dish)) return { ok: false, error: 'invalid_output' }
    // Dos intentos como máximo: el segundo recibe el motivo (de nuestro validador o del servidor) como pista.
    let hint: string | null = null
    let lastError: ReviseFailure = 'invalid_output'
    for (let attempt = 0; attempt < REVISE_MAX_ATTEMPTS; attempt++) {
      const r = await reviseOneDish(ai, days, dish, req.instruction, hint, 1)
      if (!r.ok) {
        if (r.code === 'AI_NOT_ALLOWED') return { ok: false, error: 'ai_not_allowed' }
        lastError = r.code === 'AI_FAILED' ? 'ai_failed' : 'invalid_output'
        hint = r.reason || null
        continue
      }
      const payload = applyDishes(item.payload, [{ dish, meal: r.value.meal }])
      const check = payload ? await validateMenuPayload(ctx, payload) : null
      if (!payload || !check) {
        lastError = 'ai_failed'
        continue
      }
      if (check.error) {
        lastError = 'invalid_output'
        hint = check.error
        continue
      }
      return finish({ title: item.title, body: item.body, payload }, r.value.notes, check.quality)
    }
    return { ok: false, error: lastError }
  }

  // ---- cambios generales: triaje corto + platos en paralelo -----------------------------------------------------------------------
  const list = days
    .flatMap((d, i) => MEALS.map((m) => `${i} (${DAY_NAMES[i]}) ${m}: ${asRecord(asRecord(asRecord(d)?.meals)?.[m])?.title ?? ''}`))
    .join('\n')
  const triage = await generateWithRetry(
    ai,
    'editorial_revise',
    (h) => ({
      parts: [
        {
          text:
            header('un menú semanal', req.instruction) +
            `\nDecide QUÉ platos hay que cambiar para cumplir la instrucción. Devuelve JSON {changes:[{day (0 = lunes ... 6 = domingo), meal ("comida" o "cena"), instruction_for_this_dish}], notes}. Ordena los cambios por relevancia y propón como máximo ${MAX_DISH_CHANGES}. Si la instrucción no pide cambiar platos (por ejemplo solo el texto de presentación), devuelve "changes" vacío y, si procede, "title" y/o "body" nuevos (el título y la introducción actuales están en el bloque de datos).` +
            hintLine(h),
        },
        { text: untrusted('PLATOS_Y_TEXTO_ACTUAL', `Título: ${item.title}\nIntroducción: ${item.body}\nPlatos:\n${list}`, 6000) },
      ],
      responseSchema: TRIAGE_SCHEMA,
      maxOutputTokens: 2000,
    }),
    validateTriage,
    { maxAttempts: REVISE_MAX_ATTEMPTS },
  )
  if (!triage.ok) return failure(triage.code)
  const t = triage.value
  const title = t.title ?? item.title
  const body = t.body ?? item.body
  const droppedNote = t.dropped > 0 ? ` Solo se han rectificado los ${MAX_DISH_CHANGES} platos más relevantes; quedan ${t.dropped} sin tocar.` : ''

  if (t.changes.length === 0) {
    // Solo texto (o nada): el menú queda idéntico.
    const check = await validateMenuPayload(ctx, item.payload)
    return finish({ title, body, payload: item.payload }, t.notes + droppedNote, check?.quality)
  }

  const regenerate = async (list: Triage['changes'], hint: string | null): Promise<AttemptResult<{ meal: Meal; notes: string }>[]> =>
    pool(list, DISH_CONCURRENCY, (c) => reviseOneDish(ai, days, c.dish, c.instruction, hint, hint ? 1 : REVISE_MAX_ATTEMPTS))
  const gather = (list: Triage['changes'], rs: AttemptResult<{ meal: Meal; notes: string }>[]): { dish: DishRef; meal: Meal }[] | ReviseOutcome => {
    const out: { dish: DishRef; meal: Meal }[] = []
    for (let i = 0; i < rs.length; i++) {
      const r = rs[i]
      if (!r.ok) return failure(r.code)
      out.push({ dish: list[i].dish, meal: r.value.meal })
    }
    return out
  }

  let applied = gather(t.changes, await regenerate(t.changes, null))
  if (!Array.isArray(applied)) return applied
  let payload = applyDishes(item.payload, applied)
  let check = payload ? await validateMenuPayload(ctx, payload) : null
  if (!payload || !check) return { ok: false, error: 'ai_failed' }
  if (check.error) {
    // UN reintento de los platos del día afectado, con el motivo del servidor como pista.
    const idx = dayFromError(check.error)
    const again = t.changes.filter((c) => c.dish.day === idx)
    if (idx < 0 || again.length === 0) return { ok: false, error: 'invalid_output' }
    const second = gather(again, await regenerate(again, check.error))
    if (!Array.isArray(second)) return second
    applied = applied.filter((a) => a.dish.day !== idx).concat(second)
    payload = applyDishes(item.payload, applied)
    check = payload ? await validateMenuPayload(ctx, payload) : null
    if (!payload || !check) return { ok: false, error: 'ai_failed' }
    if (check.error) return { ok: false, error: 'invalid_output' }
  }
  return finish({ title, body, payload }, t.notes + droppedNote, check.quality)
}

export async function reviseItem(ctx: GenContext, item: ItemContent, req: ReviseRequest): Promise<ReviseOutcome> {
  if (req.scope === 'dish' && item.kind !== 'menu') return { ok: false, error: 'bad_request' }
  if (item.kind === 'article') return reviseArticle(ctx, item, req)
  if (item.kind === 'poll') return revisePoll(ctx, item, req)
  if (item.kind === 'menu') return reviseMenu(ctx, item, req)
  return { ok: false, error: 'bad_request' }
}
