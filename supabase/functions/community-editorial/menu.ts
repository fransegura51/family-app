import type { AiPart } from '../_shared/ai/types.ts'
import { parseJsonLoose } from '../_shared/ai/validate.ts'
import { type CommunityAi, cleanAiText } from '../_shared/communityAi.ts'
import { type Budget, type Validation, generateWithRetry } from './attempt.ts'
import { DATA_NOTICE, VOICE, hasNutritionClaim, untrusted } from './prompts.ts'
import { MENU_SERVINGS, RECIPE_SCHEMA, cleanRecipe } from './recipes.ts'
import { type GenContext, type KindResult, asArray, asRecord, asStrings, callRpc, menuTitle, monthNameEs, normKey, pool, rpcErrorCode } from './util.ts'

// MENÚ SEMANAL (uno, lunes→domingo). Primero UNA llamada corta de PLAN (los 14 títulos de plato principal), después los 7 DÍAS EN PARALELO (concurrencia 4;
// una llamada de IA por día, para no pasar los límites de salida ni el tiempo máximo de la función) y por último se ensambla y se valida entero con
// community_service_validate_menu_item. Siempre un borrador «proposed».

export const DAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'] as const
export const MEALS = ['comida', 'cena'] as const
export type MealName = (typeof MEALS)[number]
export const MENU_TOPIC = 'menus-planificacion'
export const MENU_SOURCE = 'Pepa (IA), revisado por una persona'
export const MENU_DAY_ATTEMPTS = 2
export const MENU_MAX_REPEATS = 2

export interface Meal {
  title: string
  side: string
  recipes: Record<string, unknown>[]
}
export type Day = Record<MealName, Meal>

export const MEAL_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    side: { type: 'STRING' },
    recipes: { type: 'ARRAY', items: RECIPE_SCHEMA },
  },
  required: ['title', 'side', 'recipes'],
}
export const DAY_SCHEMA = {
  type: 'OBJECT',
  properties: { comida: MEAL_SCHEMA, cena: MEAL_SCHEMA },
  required: ['comida', 'cena'],
}

const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason })

// Un plato (comida o cena): título, acompañamiento breve y de 1 a 6 recetas (la primera es el plato principal).
export function cleanMeal(raw: unknown, label: string): Validation<Meal> {
  const r = asRecord(raw)
  if (!r) return fail(`${label}: falta el plato`)
  const title = cleanAiText(r.title, { min: 1, max: 120 })
  if (!title) return fail(`${label}: el plato necesita un título limpio (1-120 letras)`)
  let side = ''
  if (typeof r.side === 'string' && r.side.trim() !== '') {
    const s = cleanAiText(r.side, { min: 1, max: 120 })
    if (!s) return fail(`${label}: el acompañamiento debe ser un texto breve (hasta 120 letras) sin enlaces`)
    side = s
  }
  if (hasNutritionClaim(`${title} ${side}`)) return fail(`${label}: no afirmes validación nutricional`)
  const list = asArray(r.recipes)
  if (list.length < 1 || list.length > 6) return fail(`${label}: el plato debe tener de 1 a 6 recetas`)
  const recipes: Record<string, unknown>[] = []
  for (const item of list) {
    const c = cleanRecipe(item, 'menu')
    if (!c.ok) return fail(`${label}: ${c.reason}`)
    recipes.push(c.value)
  }
  // La primera receta es el plato principal: no puede ser un «elemento sencillo».
  if (recipes[0].simple === true) return fail(`${label}: la primera receta (plato principal) no puede ser un elemento sencillo`)
  return { ok: true, value: { title, side, recipes } }
}

export function cleanDay(raw: unknown, dayName: string): Validation<Day> {
  const r = asRecord(raw)
  if (!r) return fail(`${dayName}: no tiene el formato esperado`)
  const comida = cleanMeal(r.comida, `${dayName} (comida)`)
  if (!comida.ok) return comida
  const cena = cleanMeal(r.cena, `${dayName} (cena)`)
  if (!cena.ok) return cena
  if (normKey(comida.value.title) === normKey(cena.value.title) || normKey(String(comida.value.recipes[0].title)) === normKey(String(cena.value.recipes[0].title))) {
    return fail(`${dayName}: la comida y la cena no pueden ser el mismo plato`)
  }
  return { ok: true, value: { comida: comida.value, cena: cena.value } }
}

// Veces que aparece cada plato (por título) en los días dados.
export function dishCounts(days: (Day | null)[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const d of days) {
    if (!d) continue
    for (const m of MEALS) counts.set(normKey(d[m].title), (counts.get(normKey(d[m].title)) ?? 0) + 1)
  }
  return counts
}

// Plan de la semana: los 14 platos principales (comida y cena de lunes a domingo).
export interface PlanDay {
  comida: string
  cena: string
}

export const PLAN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    days: { type: 'ARRAY', items: { type: 'OBJECT', properties: { day: { type: 'STRING' }, comida: { type: 'STRING' }, cena: { type: 'STRING' } }, required: ['day', 'comida', 'cena'] } },
  },
  required: ['days'],
}

// Valida el plan: 7 días, títulos limpios, comida y cena distintas y ningún plato más de 2 veces.
export function validatePlan(raw: string): Validation<PlanDay[]> {
  const rec = asRecord(parseJsonLoose(raw))
  const list = asArray(rec?.days)
  if (list.length !== 7) return fail('el plan debe tener exactamente 7 días, de lunes a domingo')
  const plan: PlanDay[] = []
  const counts = new Map<string, number>()
  for (let i = 0; i < 7; i++) {
    const d = asRecord(list[i])
    const comida = cleanAiText(d?.comida, { min: 1, max: 120 })
    const cena = cleanAiText(d?.cena, { min: 1, max: 120 })
    if (!comida || !cena) return fail(`${DAY_NAMES[i]}: faltan títulos de plato limpios (1-120 letras, sin enlaces)`)
    if (hasNutritionClaim(`${comida} ${cena}`)) return fail('no afirmes validación nutricional')
    if (normKey(comida) === normKey(cena)) return fail(`${DAY_NAMES[i]}: la comida y la cena no pueden ser el mismo plato`)
    for (const t of [comida, cena]) counts.set(normKey(t), (counts.get(normKey(t)) ?? 0) + 1)
    plan.push({ comida, cena })
  }
  for (const [k, n] of counts) if (n > MENU_MAX_REPEATS) return fail(`el plato «${k.slice(0, 60)}» sale más de ${MENU_MAX_REPEATS} veces`)
  return { ok: true, value: plan }
}

// Valida el día `index` sabiendo qué hay ya en los demás (ningún plato más de 2 veces en la semana) y, si hay plan, que conserva los títulos que le tocan.
export function validateDay(raw: string, index: number, others: (Day | null)[], planned: PlanDay | null = null): Validation<Day> {
  const rec = parseJsonLoose(raw)
  const day = cleanDay(rec, DAY_NAMES[index])
  if (!day.ok) return day
  if (planned) {
    for (const m of MEALS) {
      if (normKey(day.value[m].title) !== normKey(planned[m])) return fail(`${DAY_NAMES[index]} (${m}): el título del plato debe ser exactamente «${planned[m]}»`)
    }
  }
  const counts = dishCounts(others)
  for (const m of MEALS) {
    const k = normKey(day.value[m].title)
    const extra = MEALS.filter((x) => normKey(day.value[x].title) === k).length
    if ((counts.get(k) ?? 0) + extra > MENU_MAX_REPEATS) return fail(`${DAY_NAMES[index]}: el plato «${day.value[m].title.slice(0, 60)}» saldría más de ${MENU_MAX_REPEATS} veces en la semana`)
  }
  return day
}

// Glosario de ingredientes ya usados (nombre → unidad) para que el mismo ingrediente se llame y se mida igual en todo el menú.
export function ingredientGlossary(days: (Day | null)[]): Map<string, string> {
  const g = new Map<string, string>()
  for (const d of days) {
    if (!d) continue
    for (const m of MEALS) {
      for (const rec of d[m].recipes) {
        for (const ing of asArray(rec.ingredients)) {
          const i = asRecord(ing)
          if (i && typeof i.name === 'string' && !g.has(normKey(i.name))) g.set(normKey(i.name), `${i.name} (${String(i.unit || 'sin unidad')})`)
        }
      }
    }
  }
  return g
}

// Ingredientes que aparecen con dos unidades distintas en el menú (aviso para el detalle de la ejecución; no bloquea).
export function unitConflicts(days: Day[]): string[] {
  const units = new Map<string, Set<string>>()
  for (const d of days) {
    for (const m of MEALS) {
      for (const rec of d[m].recipes) {
        for (const ing of asArray(rec.ingredients)) {
          const i = asRecord(ing)
          if (!i || typeof i.name !== 'string') continue
          const k = normKey(i.name)
          if (!units.has(k)) units.set(k, new Set())
          units.get(k)!.add(normKey(String(i.unit ?? '')))
        }
      }
    }
  }
  return [...units.entries()].filter(([, u]) => u.size > 1).map(([k]) => k)
}

const SEASON_BY_MONTH = ['invierno', 'invierno', 'primavera', 'primavera', 'primavera', 'verano', 'verano', 'verano', 'otoño', 'otoño', 'otoño', 'invierno']

export function buildPlanParts(week: string, recentDishes: string[], hint: string | null): AiPart[] {
  const month = Number(week.slice(5, 7))
  const lines = [
    VOICE,
    `Planifica los 14 platos principales (comida y cena de los 7 días, de lunes a domingo) del menú de ${MENU_SERVINGS} raciones de la semana del ${week.slice(8, 10)} de ${monthNameEs(week)}, en España (${SEASON_BY_MONTH[month - 1]}).`,
    'Solo los TÍTULOS de los platos principales (nombres cortos y apetecibles). Variedad de ingredientes, técnicas y grupos de alimentos (legumbres, pescado, verdura, carne, huevo, cereales...); platos prácticos, rápidos, saludables y económicos, de temporada; comidas completas y cenas ligeras.',
    'Ningún plato más de 2 veces en la semana; la comida y la cena del mismo día nunca son el mismo plato; evita los platos de semanas anteriores (te los damos como DATOS) salvo algún favorito puntual. Sin marcas comerciales ni cifras de estudios; NO digas que está validado nutricionalmente.',
    'Devuelve únicamente un JSON {"days":[{"day","comida","cena"} x 7]}.',
    DATA_NOTICE,
  ]
  if (hint) lines.push(`Tu intento anterior se rechazó por este motivo: ${hint}. Corrígelo.`)
  const parts: AiPart[] = [{ text: lines.join('\n') }]
  if (recentDishes.length > 0) parts.push({ text: untrusted('PLATOS_DE_SEMANAS_ANTERIORES (evítalos salvo algún favorito puntual)', recentDishes.slice(0, 80).map((x) => `- ${x}`).join('\n'), 3000) })
  return parts
}

export function buildDayParts(opts: {
  week: string
  index: number
  others: (Day | null)[]
  recentDishes: string[]
  hint: string | null
  // Plan: los platos que le tocan a este día y los de la semana entera (contexto de variedad).
  planned?: PlanDay | null
  plan?: PlanDay[] | null
}): AiPart[] {
  const { index, others } = opts
  const month = Number(opts.week.slice(5, 7))
  const done = others
    .map((d, i) => (d ? `- ${DAY_NAMES[i]}: comida «${d.comida.title}»; cena «${d.cena.title}»` : null))
    .filter((x): x is string => x !== null)
  const glossary = [...ingredientGlossary(others).values()].slice(0, 120)
  const lines = [
    VOICE,
    `Estás preparando el MENÚ SEMANAL de ${MENU_SERVINGS} raciones, semana del ${opts.week.slice(8, 10)} de ${monthNameEs(opts.week)}, en España (${SEASON_BY_MONTH[month - 1]}). Ahora toca el día: ${DAY_NAMES[index]}.`,
    'Devuelve la COMIDA y la CENA de ese día. Cada una: {title, side, recipes}. "title" = nombre del plato; "side" = acompañamiento breve en texto (puede ser ""); "recipes" = de 1 a 6 recetas, la PRIMERA es el plato principal y las demás, acompañamientos.',
    `Cada receta COMPLETA: title; servings ${MENU_SERVINGS}; ingredients [{name, quantity, unit}] con cantidad numérica (por ejemplo "250" y "g"), sin repetir nombre y SIN comas en los nombres; steps de 1 a 30 pasos; opcionalmente tip (hasta 400 letras), time {active, total} en minutos enteros y freeze {ideal, note}. Un acompañamiento muy simple (fruta, tostada) puede llevar simple:true y no necesitar pasos (nunca el plato principal).`,
    'Criterios permanentes del menú: platos prácticos, rápidos, saludables y económicos; comidas completas y cenas no pesadas; de temporada en España; variedad de ingredientes y de técnicas; ningún plato más de 2 veces en toda la semana; la comida y la cena del mismo día nunca son el mismo plato; sin marcas comerciales; sin porcentajes ni cifras de estudios; sin enlaces ni HTML; NO digas que está validado nutricionalmente ni des consejos médicos.',
    'Usa nombres y unidades habituales y coherentes (el mismo ingrediente siempre con el mismo nombre y la misma unidad; respeta el glosario si lo hay).',
    'Devuelve únicamente un JSON con "comida" y "cena".',
    DATA_NOTICE,
  ]
  if (opts.planned) {
    lines.push('Los platos principales de este día YA están decididos (bloque PLATOS_DE_ESTE_DIA): conserva esos títulos EXACTAMENTE en "title" y cocina esos platos. Los de los demás días (bloque PLAN_DE_LA_SEMANA) son solo contexto: elige acompañamientos distintos y no repitas su ingrediente principal.')
  }
  if (opts.hint) lines.push(`Tu intento anterior se rechazó por este motivo: ${opts.hint}. Corrígelo.`)
  const parts: AiPart[] = [{ text: lines.join('\n') }]
  if (opts.planned) parts.push({ text: untrusted('PLATOS_DE_ESTE_DIA', `comida: ${opts.planned.comida}\ncena: ${opts.planned.cena}`, 400) })
  if (opts.plan) {
    const rest = opts.plan.map((p, i) => (i === index ? null : `- ${DAY_NAMES[i]}: comida «${p.comida}»; cena «${p.cena}»`)).filter((x): x is string => x !== null)
    if (rest.length > 0) parts.push({ text: untrusted('PLAN_DE_LA_SEMANA (otros días, para variar)', rest.join('\n'), 3000) })
  }
  if (done.length > 0) parts.push({ text: untrusted('DIAS_YA_PREPARADOS (para variar y no pasar de 2 repeticiones)', done.join('\n'), 3000) })
  if (opts.recentDishes.length > 0) parts.push({ text: untrusted('PLATOS_DE_SEMANAS_ANTERIORES (evítalos salvo algún favorito puntual)', opts.recentDishes.slice(0, 80).map((d) => `- ${d}`).join('\n'), 3000) })
  if (glossary.length > 0) parts.push({ text: untrusted('GLOSARIO_DE_INGREDIENTES (nombre y unidad ya usados)', glossary.map((g) => `- ${g}`).join('\n'), 5000) })
  return parts
}

export function assembleMenu(days: Day[]): Record<string, unknown> {
  return { version: 1, servings: MENU_SERVINGS, days: days.map((d, i) => ({ day: DAY_NAMES[i], meals: { comida: d.comida, cena: d.cena } })) }
}

// Lee un menú completo (los 7 días en orden) devuelto por la IA al rectificar. La IA no decide el nombre del día: va por posición.
export function cleanMenu(raw: unknown): Validation<Record<string, unknown>> {
  const r = asRecord(raw)
  const list = asArray(r?.days)
  if (list.length !== 7) return fail('el menú debe tener exactamente 7 días, de lunes a domingo')
  const days: Day[] = []
  for (let i = 0; i < 7; i++) {
    const d = asRecord(list[i])
    const c = cleanDay(d?.meals ?? d, DAY_NAMES[i])
    if (!c.ok) return c
    days.push(c.value)
  }
  const counts = dishCounts(days)
  for (const [k, n] of counts) if (n > MENU_MAX_REPEATS) return fail(`un plato («${k.slice(0, 60)}») sale más de ${MENU_MAX_REPEATS} veces`)
  return { ok: true, value: assembleMenu(days) }
}

// Día al que se refiere el mensaje de validación del servidor («martes (cena), receta…»), o -1.
export function dayFromError(message: string): number {
  const m = normKey(message.slice(0, 40))
  return DAY_NAMES.findIndex((d) => m.startsWith(normKey(d)))
}

// Plato repetido más de 2 veces: el mensaje nombra el plato, no el día. Devuelve el último día donde aparece (el que conviene regenerar).
export function dayOfRepeatedDish(message: string, days: Day[]): number {
  const m = /«([^»]+)»/.exec(message)
  if (!m) return -1
  const k = normKey(m[1])
  let last = -1
  days.forEach((d, i) => {
    if (MEALS.some((x) => normKey(d[x].title) === k)) last = i
  })
  return last
}

// Introducción breve y variable del menú (plantillas: no necesita IA y no puede afirmar nada que no deba).
const INTROS: ((dishes: string) => string)[] = [
  (d) => `Esta semana te proponemos ideas para comer y cenar sin complicarte, con platos como ${d}.\n\nSon solo ideas para inspirarte: no es una dieta ni un plan a medida. Cámbialas por lo que tengas en casa y adáptalas a tu familia.`,
  (d) => `¿Sin ganas de pensar qué cocinar? Aquí tienes un menú para toda la semana, con propuestas como ${d}.\n\nTómalo como un punto de partida: son ideas, no una dieta ni un plan personalizado. Cambia lo que quieras.`,
  (d) => `Menú de la semana listo para que organices la compra y los fogones. Algunas ideas: ${d}.\n\nRecuerda que son sugerencias para inspirarte, no una dieta ni un plan hecho a medida para ninguna familia.`,
  (d) => `Una semana de comidas y cenas pensadas para el día a día, con ideas como ${d}.\n\nNo es una dieta ni un plan a medida: son ideas para que cocines con calma. Ajusta las raciones y los ingredientes a tu casa.`,
]

export function menuIntro(week: string, days: Day[]): string {
  const dishes = [days[0].comida.title, days[2].cena.title, days[5].comida.title]
  const list = `${dishes[0]}, ${dishes[1]} o ${dishes[2]}`
  const n = Number(week.slice(5, 7)) + Number(week.slice(8, 10))
  return INTROS[n % INTROS.length](list)
}

export interface MenuContext {
  slotDate: string
  exists: boolean
  recentDishes: string[]
}

export function parseMenuContext(data: unknown): MenuContext | null {
  const rec = asRecord(data)
  if (!rec || typeof rec.slot_date !== 'string') return null
  return { slotDate: rec.slot_date, exists: rec.exists === true, recentDishes: asStrings(rec.recent_dishes) }
}

export interface MenuValidation {
  error: string | null
  quality: unknown[]
}

export async function validateMenuPayload(ctx: GenContext, payload: Record<string, unknown>): Promise<MenuValidation | null> {
  const v = await callRpc(ctx.admin, 'community_service_validate_menu_item', { p_payload: payload })
  const rec = v.error ? null : asRecord(v.data)
  if (!rec) return null
  return { error: typeof rec.error === 'string' && rec.error ? rec.error : null, quality: asArray(rec.quality) }
}

export const menuPayload = (menu: Record<string, unknown>): Record<string, unknown> => ({ menu, schedule: 'saturday', source: MENU_SOURCE })

// Tope de llamadas de la ejecución: 1 plan + 7 días + reintentos <= 14. Concurrencia de los días: 4 (tiempo máximo de la función).
export const MENU_MAX_AI_CALLS = 14
export const MENU_CONCURRENCY = 4

interface DayOpts {
  attempts: number
  hint: string | null
  budget: Budget
  planned?: PlanDay | null
  plan?: PlanDay[] | null
}

// Un día (también lo usa rectificar): con `planned`, conserva los títulos del plan.
export function genDay(ai: CommunityAi, week: string, index: number, others: (Day | null)[], recent: string[], o: DayOpts) {
  return generateWithRetry(
    ai,
    'editorial_menu',
    (h) => ({ parts: buildDayParts({ week, index, others, recentDishes: recent, hint: h, planned: o.planned, plan: o.plan }), responseSchema: DAY_SCHEMA, maxOutputTokens: 12000 }),
    (raw) => validateDay(raw, index, others, o.planned ?? null),
    { maxAttempts: o.attempts, initialHint: o.hint, budget: o.budget },
  )
}

export async function generateMenu(ctx: GenContext, runId: string, week: string): Promise<KindResult> {
  const c = await callRpc(ctx.admin, 'community_service_editorial_context', { p_kind: 'menu', p_week: week })
  const mc = c.error ? null : parseMenuContext(c.data)
  if (!mc) return { status: 'error', created: 0, expected: 1, itemIds: [], errors: ['CONTEXT_FAILED'], detail: {} }
  if (mc.exists) return { status: 'skipped', created: 0, expected: 0, itemIds: [], errors: [], detail: { reason: 'EXISTS' } }

  const ai = await ctx.getAi()
  if (!ai) return { status: 'skipped', created: 0, expected: 1, itemIds: [], errors: ['AI_NOT_ALLOWED'], detail: {} }

  const budget: Budget = { used: 0, max: MENU_MAX_AI_CALLS }
  const days: (Day | null)[] = Array(7).fill(null)
  const stop = (code: string): KindResult => ({
    status: code === 'AI_NOT_ALLOWED' ? 'skipped' : 'error',
    created: 0,
    expected: 1,
    itemIds: [],
    errors: [code],
    detail: { ai_calls: budget.used, days_done: days.filter(Boolean).length },
  })

  // 1) UNA llamada corta de PLAN: los 14 títulos de plato principal.
  const planRes = await generateWithRetry(ai, 'editorial_menu', (h) => ({ parts: buildPlanParts(mc.slotDate, mc.recentDishes, h), responseSchema: PLAN_SCHEMA, maxOutputTokens: 2000 }), validatePlan, {
    maxAttempts: 2,
    budget,
  })
  if (!planRes.ok) return stop(planRes.code)
  const plan = planRes.value

  // 2) Los 7 días EN PARALELO, cada uno con los títulos que le tocan del plan.
  let blocked = false
  const codes: (string | null)[] = Array(7).fill(null)
  await pool([0, 1, 2, 3, 4, 5, 6], MENU_CONCURRENCY, async (i) => {
    if (blocked) {
      codes[i] = 'AI_NOT_ALLOWED'
      return
    }
    const r = await genDay(ai, mc.slotDate, i, Array(7).fill(null), mc.recentDishes, { attempts: MENU_DAY_ATTEMPTS, hint: null, budget, planned: plan[i], plan })
    if (r.ok) days[i] = r.value
    else {
      if (r.code === 'AI_NOT_ALLOWED') blocked = true
      codes[i] = r.code
    }
  })
  const failed = codes.find((x) => x !== null)
  if (failed) return stop(failed)

  // Ensamblado y validación del menú completo. Si falla, UN reintento del día afectado con el motivo como pista.
  let menu = assembleMenu(days as Day[])
  let v = await validateMenuPayload(ctx, menuPayload(menu))
  if (!v) return stop('VALIDATE_FAILED')
  if (v.error) {
    const idx = dayFromError(v.error) >= 0 ? dayFromError(v.error) : dayOfRepeatedDish(v.error, days as Day[])
    if (idx < 0) return stop('MENU_INVALID')
    const others = days.map((d, i) => (i === idx ? null : d))
    const r = await genDay(ai, mc.slotDate, idx, others, mc.recentDishes, { attempts: 1, hint: v.error, budget })
    if (!r.ok) return stop(r.code === 'AI_NOT_ALLOWED' ? r.code : 'MENU_INVALID')
    days[idx] = r.value
    menu = assembleMenu(days as Day[])
    v = await validateMenuPayload(ctx, menuPayload(menu))
    if (!v || v.error) return stop('MENU_INVALID')
  }

  const created = await callRpc(ctx.admin, 'community_service_editorial_create_item', {
    p_run: runId,
    p_item: {
      kind: 'menu',
      slot_date: mc.slotDate,
      topic_id: MENU_TOPIC,
      title: menuTitle(mc.slotDate),
      body: menuIntro(mc.slotDate, days as Day[]),
      payload: menuPayload(menu),
    },
  })
  const detail = { ai_calls: budget.used, warnings: v.quality.length, unit_conflicts: unitConflicts(days as Day[]).length }
  if (created.error) return { status: 'error', created: 0, expected: 1, itemIds: [], errors: [rpcErrorCode(created.error)], detail }
  if (typeof created.data !== 'string' || !created.data) return { status: 'ok', created: 0, expected: 1, itemIds: [], errors: [], detail: { ...detail, taken: true } }
  return { status: 'ok', created: 1, expected: 1, itemIds: [created.data], errors: [], detail }
}

