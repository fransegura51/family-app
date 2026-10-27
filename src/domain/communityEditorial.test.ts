// community-editorial: generación de los BORRADORES del programa editorial semanal (artículos, encuesta y menú), cron y contrato HTTP.
// Simulación completa: sin Supabase ni Gemini reales (IA falsa con respuestas predefinidas y RPC simuladas).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateArticles, MAX_AI_CALLS_PER_RUN, validateArticle, type ArticleSlot } from '../../supabase/functions/community-editorial/articles'
import { handleEditorial } from '../../supabase/functions/community-editorial/editorial'
import { cleanRecipe, cleanPostRecipes } from '../../supabase/functions/community-editorial/recipes'
import { ARTICLE_CRITERIA_TEXT } from '../../supabase/functions/community-editorial/prompts'
import { menuTitle } from '../../supabase/functions/community-editorial/util'
import { DATA_NOTICE } from '../../supabase/functions/_shared/communityAi'
import { ARTICLE_CRITERIA } from './communityArticleCriteria'
import { ADMIN_ID, PERSON_SECRET_TEXT, WEEK, adminRequest, articleBody, articleJson, dayJson, harness, ingredient, planJson, recipe, slotLabel, text } from './communityEditorialFakes'
import { RpcFailure, SECRET, cronRequest } from './communityServerFakes'

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined))
afterEach(() => vi.restoreAllMocks())

const call = async (h: ReturnType<typeof harness>, body: unknown, auth: string | null = 'Bearer admin') => {
  const res = await handleEditorial(adminRequest(body, auth), h.deps)
  return { res, json: (await res.json()) as Record<string, unknown> }
}
const cron = async (h: ReturnType<typeof harness>) => {
  const res = await handleEditorial(cronRequest(SECRET, { action: 'cron' }), h.deps)
  return { res, json: (await res.json()) as Record<string, unknown> }
}
const finishArgs = (h: ReturnType<typeof harness>) => h.client.argsOf('community_service_editorial_finish_run')

// =============================================================================================================================
describe('artículos: un borrador por hueco', () => {
  it('genera 7 artículos, cada uno en su día y su tema, con payload editorial y datos del hueco', async () => {
    const h = harness()
    const { json } = await call(h, { action: 'generate', kind: 'articles', week: WEEK })
    expect(json).toMatchObject({ ok: true, status: 'ok', created: 7, expected: 7, errors: [] })
    expect((json.item_ids as string[]).length).toBe(7)
    const items = h.created().sort((a, b) => String(a.slot_date).localeCompare(String(b.slot_date)))
    expect(items.map((i) => i.slot_date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'])
    expect(items.map((i) => i.topic_id)).toEqual(['recetas-faciles', 'trucos-de-cocina', 'ahorro-economia', 'organizacion-familiar', 'limpieza-hogar', 'actividades-familia', 'crianza-educacion'])
    for (const i of items) {
      expect(i.kind).toBe('article')
      expect(i.payload).toEqual({ editorial: true })
    }
    expect(items[0]).toMatchObject({ group_key: 'grupo-1', tier: 2 })
    expect(items[1].group_key).toBeNull()
  })

  it('cada hueco usa su tema y la idea de las familias va en un bloque de DATOS con el aviso', async () => {
    const h = harness()
    await call(h, { action: 'generate', kind: 'articles', week: WEEK })
    const prompts = h.provider.requests.map(text)
    expect(prompts).toHaveLength(7)
    const first = prompts.find((p) => p.includes(`subtema «${slotLabel(0)}»`))!
    expect(first).toContain('<<<IDEA_DE_LAS_FAMILIAS')
    expect(first).toContain(`Cenas rápidas para días de colegio ${PERSON_SECRET_TEXT}`)
    expect(first).toContain(DATA_NOTICE)
    // La idea está DENTRO del bloque, no en las instrucciones.
    const block = first.slice(first.indexOf('<<<IDEA_DE_LAS_FAMILIAS'))
    expect(block.slice(0, block.indexOf('>>>'))).toContain(PERSON_SECRET_TEXT)
    expect(first.slice(0, first.indexOf('<<<IDEA_DE_LAS_FAMILIAS'))).not.toContain(PERSON_SECRET_TEXT)
    const second = prompts.find((p) => p.includes(`subtema «${slotLabel(1)}»`))!
    expect(second).not.toContain('IDEA_DE_LAS_FAMILIAS')
    // Títulos a evitar: los del catálogo y los recientes del subtema.
    expect(second).toContain('Título ya existente en el catálogo')
    expect(second).toContain('Título reciente del subtema')
    // Criterios, voz y límites.
    expect(second).toContain('Introducción breve, atractiva y natural')
    expect(second).toContain('sin porcentajes, estadísticas')
  })

  it('descarta enlaces, estadísticas y títulos duplicados y reintenta con una pista (máx. 2 intentos por hueco)', async () => {
    const bad = (label: string, n: number) => {
      if (label === slotLabel(2)) return n === 0 ? articleJson('Ahorro con enlace', {}, articleBody() + ' Mira www.ejemplo.es para más.') : articleJson('Ahorro bien hecho')
      if (label === slotLabel(3)) return n === 0 ? articleJson('Organizar con cifras', {}, articleBody() + ' El 40% de las familias lo hace.') : articleJson('Organizar sin cifras')
      if (label === slotLabel(1)) return n === 0 ? articleJson('Título reciente del subtema') : articleJson('Truco nuevo de cocina')
      return articleJson(`Artículo práctico sobre ${label.toLowerCase()}`)
    }
    const h = harness({ article: bad })
    const { json } = await call(h, { action: 'generate', kind: 'articles', week: WEEK })
    expect(json).toMatchObject({ status: 'ok', created: 7 })
    expect(h.provider.requests).toHaveLength(10)
    const titles = h.created().map((i) => i.title)
    expect(titles).toEqual(expect.arrayContaining(['Ahorro bien hecho', 'Organizar sin cifras', 'Truco nuevo de cocina']))
    expect(titles).not.toContain('Título reciente del subtema')
    // El reintento lleva el motivo como pista.
    const retry = h.provider.requests.map(text).find((p) => p.includes('Tu intento anterior se rechazó'))!
    expect(retry).toContain('Corrígelo')
  })

  it('tras 2 intentos fallidos el hueco queda sin crear: estado partial con código; sin ninguno, error', async () => {
    const partial = harness({ article: (label, n) => (label === slotLabel(4) ? articleJson('Corto', {}, 'demasiado corto') : articleJson(`Artículo práctico ${label} ${n}`)) })
    const r1 = (await call(partial, { action: 'generate', kind: 'articles', week: WEEK })).json
    expect(r1).toMatchObject({ ok: true, status: 'partial', created: 6, expected: 7, errors: ['INVALID_OUTPUT'] })
    expect(partial.provider.requests.map(text).filter((p) => p.includes(`subtema «${slotLabel(4)}»`))).toHaveLength(2)
    expect(finishArgs(partial)[0]).toMatchObject({ p_status: 'partial', p_created: 6, p_expected: 7, p_error: 'INVALID_OUTPUT' })

    const none = harness({ article: () => 'no es json' })
    const r2 = (await call(none, { action: 'generate', kind: 'articles', week: WEEK })).json
    expect(r2).toMatchObject({ status: 'error', created: 0, expected: 7 })
    // Consumo máximo: 14 llamadas por ejecución de artículos.
    expect(none.provider.requests).toHaveLength(14)
    expect(none.provider.requests.length).toBeLessThanOrEqual(MAX_AI_CALLS_PER_RUN)
    expect(none.created()).toHaveLength(0)
  })

  it('fallos del proveedor → AI_FAILED; las excepciones de create_item se anotan por elemento y el resto sigue', async () => {
    const h = harness({
      article: (label) => (label === slotLabel(0) ? new Error('boom') : articleJson(`Artículo práctico sobre ${label.toLowerCase()}`)),
      rpc: {
        community_service_editorial_create_item: (() => {
          let n = 0
          const items: unknown[] = []
          return (a: Record<string, unknown>) => {
            items.push(a.p_item)
            n++
            if (n === 2) return new RpcFailure('RECIPES_INVALID: algo')
            if (n === 3) return null // hueco ocupado: no es un error
            return `id-${n}`
          }
        })(),
      },
    })
    const { json } = await call(h, { action: 'generate', kind: 'articles', week: WEEK })
    expect(json.errors).toEqual(expect.arrayContaining(['AI_FAILED', 'RECIPES_INVALID']))
    expect(json.status).toBe('partial')
    expect(json.created).toBe(4)
    expect(json.expected).toBe(7)
  })

  it('con recetas (subtema de recetas): fichas válidas en payload.recipes; fichas inválidas se rechazan y se reintenta', async () => {
    const good = [recipe('Tortilla de patata', { key: 'Tortilla de patata' }), recipe('Tortilla de calabacín')]
    const dup = [recipe('Tortilla', { ingredients: [ingredient('Huevo', '4', 'unidad'), ingredient('huevo', '2', 'unidad')] })]
    const h = harness({
      article: (label, n) => (label === slotLabel(0) ? (n === 0 ? articleJson('Tortillas de mil maneras', { recipes: dup }, articleBody(500)) : articleJson('Tortillas de mil maneras', { recipes: good }, articleBody(500))) : articleJson(`Artículo ${label}`)),
    })
    await call(h, { action: 'generate', kind: 'articles', week: WEEK })
    const item = h.created().find((i) => i.slot_date === '2026-11-02')!
    const payload = item.payload as { editorial: boolean; recipes: Record<string, unknown>[] }
    expect(payload.editorial).toBe(true)
    expect(payload.recipes.map((r) => r.key)).toEqual(['tortilla-de-patata', 'tortilla-de-calabacin'])
    expect(payload.recipes[0].servings).toBe(4)
    // En subtemas que no son de recetas, las fichas se ignoran.
    const h2 = harness({ article: (label) => articleJson(`Artículo ${label}`, { recipes: good }) })
    await call(h2, { action: 'generate', kind: 'articles', week: WEEK })
    expect(h2.created().find((i) => i.slot_date === '2026-11-04')!.payload).toEqual({ editorial: true })
  })

  it('nunca genera dos veces el mismo título dentro de la misma ejecución', async () => {
    const h = harness({ article: (label, n) => articleJson(n === 0 ? 'El mismo título para todos' : `Título alternativo de ${label}`) })
    await call(h, { action: 'generate', kind: 'articles', week: WEEK })
    const titles = h.created().map((i) => String(i.title))
    expect(new Set(titles).size).toBe(titles.length)
    expect(titles.filter((t) => t === 'El mismo título para todos')).toHaveLength(1)
  })

  it('si no falta ningún hueco no llama a la IA', async () => {
    const h = harness({ rpc: { community_service_editorial_plan_articles: () => ({ slots: [], avoid_titles: [] }) } })
    const { json } = await call(h, { action: 'generate', kind: 'articles', week: WEEK })
    expect(json).toMatchObject({ ok: true, status: 'ok', created: 0, expected: 0 })
    expect(h.provider.requests).toHaveLength(0)
  })

  it('el validador exige los límites: cuerpo, introducción y prohibiciones', () => {
    const slot = { section: 'hogar' } as ArticleSlot
    const ok = (body: string, title = 'Un título correcto y claro') => validateArticle(articleJson(title, {}, body), slot, new Set()).ok
    expect(ok(articleBody())).toBe(true)
    expect(ok('Texto corto.')).toBe(false)
    expect(ok(articleBody(5000))).toBe(false)
    expect(ok('a'.repeat(450) + '\n\n' + articleBody())).toBe(false) // introducción > 420
    expect(ok(articleBody() + ' Escríbenos a hola@correo.es')).toBe(false)
    expect(ok(articleBody() + ' Según un estudio reciente...')).toBe(false)
    expect(ok(articleBody() + '\n❤️ Este artículo nació de una idea')).toBe(false)
    expect(ok(articleBody(), 'Corto')).toBe(false)
  })

  it('los criterios del prompt son los mismos que ARTICLE_CRITERIA (src/domain)', () => {
    expect([...ARTICLE_CRITERIA_TEXT]).toEqual([...ARTICLE_CRITERIA])
  })
})

// =============================================================================================================================
describe('cron', () => {
  it('con los interruptores apagados NO hace nada: 0 llamadas a la IA y 0 a begin_run', async () => {
    const h = harness({ config: { articles_enabled: false, polls_enabled: false, menu_enabled: false } })
    const { res, json } = await cron(h)
    expect(res.status).toBe(200)
    expect(json).toEqual({ ok: true, ran: [] })
    expect(h.client.count('community_service_editorial_begin_run')).toBe(0)
    expect(h.client.count('community_service_ai_allowed')).toBe(0)
    expect(h.provider.requests).toHaveLength(0)
  })

  it('si no toca todavía (due=false) o no se ha lanzado Comunidad, tampoco', async () => {
    const early = harness({ config: { due: false } })
    expect((await cron(early)).json).toEqual({ ok: true, ran: [] })
    expect(early.client.count('community_service_editorial_begin_run')).toBe(0)
    const notLaunched = harness({ config: { launched: false } })
    expect((await cron(notLaunched)).json).toEqual({ ok: true, skipped: 'not_launched' })
    expect(notLaunched.client.count('community_service_editorial_begin_run')).toBe(0)
    expect(notLaunched.provider.requests).toHaveLength(0)
  })

  it('solo ejecuta los tipos con interruptor activo, con su semana, y devuelve el resumen', async () => {
    const h = harness({ config: { articles_enabled: false, menu_enabled: false } })
    const { json } = await cron(h)
    expect(json).toEqual({ ok: true, ran: [{ kind: 'poll', run_id: 'run-1', status: 'ok', created: 1, expected: 1 }] })
    expect(h.client.argsOf('community_service_editorial_begin_run')).toEqual([{ p_kind: 'poll', p_trigger: 'schedule', p_week: '2026-10-26', p_user: null }])
    expect(h.created()).toHaveLength(1)
  })

  it('con todo activo genera los tres tipos', async () => {
    const h = harness()
    const { json } = await cron(h)
    const ran = json.ran as { kind: string; status: string; created: number }[]
    expect(ran.map((r) => r.kind).sort()).toEqual(['articles', 'menu', 'poll'])
    expect(ran.every((r) => r.status === 'ok')).toBe(true)
    expect(h.created()).toHaveLength(9)
    expect(h.client.argsOf('community_service_editorial_begin_run').every((a) => a.p_trigger === 'schedule')).toBe(true)
  })

  it('si begin_run devuelve null (ya hecho / reintentos agotados) no genera nada', async () => {
    const h = harness({ rpc: { community_service_editorial_begin_run: () => null } })
    const { json } = await cron(h)
    expect(json).toEqual({ ok: true, ran: [] })
    expect(h.client.count('community_service_editorial_begin_run')).toBe(3)
    expect(h.provider.requests).toHaveLength(0)
    expect(h.client.count('community_service_editorial_plan_articles')).toBe(0)
    expect(h.client.count('community_service_editorial_finish_run')).toBe(0)
  })

  it('una IA no permitida cierra la ejecución como «skipped» (no cuenta como fallo)', async () => {
    const h = harness({ allowed: false, config: { articles_enabled: false, menu_enabled: false } })
    const { json } = await cron(h)
    expect((json.ran as { status: string }[])[0].status).toBe('skipped')
    expect(finishArgs(h)[0]).toMatchObject({ p_status: 'skipped', p_error: 'AI_NOT_ALLOWED' })
  })

  it('un error inesperado al generar no deja la ejecución abierta', async () => {
    const h = harness({ config: { articles_enabled: false, menu_enabled: false }, rpc: { community_service_editorial_context: () => { throw new Error('caída') } } })
    const { json } = await cron(h)
    expect((json.ran as { status: string }[])[0].status).toBe('error')
    expect(finishArgs(h)[0]).toMatchObject({ p_status: 'error' })
  })
})

// =============================================================================================================================
describe('generación manual', () => {
  it('IGNORA los interruptores y usa begin_run manual con la persona', async () => {
    const h = harness({ config: { articles_enabled: false, polls_enabled: false, menu_enabled: false, due: false } })
    const { res, json } = await call(h, { action: 'generate', kind: 'poll' })
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ ok: true, run_id: 'run-1', status: 'ok', created: 1, expected: 1, errors: [] })
    expect(h.client.argsOf('community_service_editorial_begin_run')).toEqual([{ p_kind: 'poll', p_trigger: 'manual', p_week: '2026-10-26', p_user: ADMIN_ID }])
  })

  it('409 busy si ya hay una ejecución viva, sin generar nada', async () => {
    const h = harness({ rpc: { community_service_editorial_begin_run: () => null } })
    const { res, json } = await call(h, { action: 'generate', kind: 'articles', week: WEEK })
    expect(res.status).toBe(409)
    expect(json).toEqual({ ok: false, error: 'busy' })
    expect(h.provider.requests).toHaveLength(0)
  })

  it('400 si el tipo no es válido o la semana no es un lunes', async () => {
    const h = harness()
    expect((await call(h, { action: 'generate', kind: 'otra' })).res.status).toBe(400)
    const wed = await call(h, { action: 'generate', kind: 'menu', week: '2026-11-04' })
    expect(wed.res.status).toBe(400)
    expect(wed.json).toEqual({ ok: false, error: 'bad_request' })
    expect((await call(h, { action: 'generate', kind: 'menu', week: 'mañana' })).res.status).toBe(400)
    expect(h.client.count('community_service_editorial_begin_run')).toBe(0)
  })

  it('200 {ok:false, error:ai_not_allowed} con el tope diario alcanzado o la IA apagada', async () => {
    for (const opts of [{ allowed: false }, { aiNull: true }]) {
      const h = harness(opts)
      const { res, json } = await call(h, { action: 'generate', kind: 'poll', week: WEEK })
      expect(res.status).toBe(200)
      expect(json).toMatchObject({ ok: false, error: 'ai_not_allowed' })
      expect(finishArgs(h)[0].p_status).toBe('skipped')
    }
  })

  it('una encuesta o un menú que ya existen cuentan como «skipped» sin llamar a la IA', async () => {
    const h = harness({ rpc: { community_service_editorial_context: (a) => ({ slot_date: '2026-11-02', exists: true, hogar_topics: [], recent_questions: [], recent_dishes: [], kind: a.p_kind }) } })
    for (const kind of ['poll', 'menu']) {
      const { json } = await call(h, { action: 'generate', kind, week: WEEK })
      expect(json).toMatchObject({ ok: true, status: 'skipped', created: 0 })
    }
    expect(h.provider.requests).toHaveLength(0)
  })

  it('NUNCA llama a RPC de aprobar, programar ni publicar', async () => {
    const h = harness()
    await call(h, { action: 'generate', kind: 'articles', week: WEEK })
    await call(h, { action: 'generate', kind: 'poll', week: WEEK })
    await call(h, { action: 'generate', kind: 'menu', week: WEEK })
    await cron(h)
    const allowed = new Set([
      'get_app_secret', 'community_service_ai_allowed', 'community_service_record_ai', 'community_service_editorial_config', 'community_service_editorial_begin_run',
      'community_service_editorial_finish_run', 'community_service_editorial_plan_articles', 'community_service_editorial_context', 'community_service_editorial_create_item',
      'community_service_validate_menu_item',
    ])
    for (const fn of h.rpcNames()) expect(allowed.has(fn), fn).toBe(true)
    expect(h.rpcNames().some((fn) => /approve|publish|schedule|reject/.test(fn))).toBe(false)
    expect(h.client.inserted).toHaveLength(0)
  })

  it('los errores y el detalle de la ejecución no incluyen texto de personas ni de la IA', async () => {
    const h = harness({
      rpc: { community_service_editorial_create_item: () => new RpcFailure(`NO_SOURCES ${PERSON_SECRET_TEXT}`) },
      article: (label) => articleJson(`Título con ${PERSON_SECRET_TEXT} en ${label}`),
    })
    const { json } = await call(h, { action: 'generate', kind: 'articles', week: WEEK })
    expect(json.errors).toEqual(['NO_SOURCES', 'NO_SOURCES', 'NO_SOURCES', 'NO_SOURCES', 'NO_SOURCES', 'NO_SOURCES', 'NO_SOURCES'])
    expect(JSON.stringify(json)).not.toContain(PERSON_SECRET_TEXT)
    expect(JSON.stringify(finishArgs(h))).not.toContain(PERSON_SECRET_TEXT)
    expect(finishArgs(h)[0].p_error).toBe('NO_SOURCES')
  })
})

// =============================================================================================================================
describe('encuesta', () => {
  it('crea la encuesta en el hueco del contexto con las opciones y el tema; la pregunta reciente va en un bloque de datos', async () => {
    const h = harness()
    await call(h, { action: 'generate', kind: 'poll', week: WEEK })
    expect(h.created()[0]).toEqual({
      kind: 'poll', slot_date: '2026-10-31', topic_id: 'organizacion-familiar', title: '¿Cómo organizáis la compra de la semana?',
      body: 'Cuéntanos qué os funciona mejor en casa.', payload: { options: ['Con lista y menú', 'Sobre la marcha', 'Compra en línea'] },
    })
    const prompt = text(h.provider.requests[0])
    expect(prompt).toContain('<<<PREGUNTAS_RECIENTES')
    expect(prompt).toContain(DATA_NOTICE)
  })

  it('rechaza temas delicados, preguntas repetidas, opciones repetidas, estadísticas y temas fuera de la lista; reintenta y avisa', async () => {
    const mk = (patch: Record<string, unknown>) => JSON.stringify({ question: '¿Cómo organizáis la compra de la semana?', intro: 'Cuéntanos qué os funciona.', topic_id: 'organizacion-familiar', options: ['A uno', 'B dos', 'C tres'], ...patch })
    const bads = [
      mk({ question: '¿A qué partido político votáis en casa?' }),
      mk({ question: '¿Qué cenáis los viernes?' }),
      mk({ options: ['Igual', 'igual', 'Otra'] }),
      mk({ intro: 'El 70% de las familias lo hace así.' }),
      mk({ topic_id: 'platos-principales' }),
      mk({ options: ['Solo una', 'Dos'] }),
    ]
    for (const bad of bads) {
      const h = harness({ poll: (n) => (n === 0 ? bad : JSON.stringify({ question: '¿Qué hacéis los domingos por la tarde?', intro: 'Contadnos vuestro plan favorito.', topic_id: 'ahorro-economia', options: ['Paseo', 'Cine en casa', 'Juegos de mesa'] })) })
      const { json } = await call(h, { action: 'generate', kind: 'poll', week: WEEK })
      expect(json).toMatchObject({ status: 'ok', created: 1 })
      expect(h.provider.requests).toHaveLength(2)
    }
    const always = harness({ poll: () => 'nada' })
    expect((await call(always, { action: 'generate', kind: 'poll', week: WEEK })).json).toMatchObject({ status: 'error', errors: ['INVALID_OUTPUT'] })
    expect(always.provider.requests).toHaveLength(2)
  })
})

// =============================================================================================================================
describe('menú semanal', () => {
  const dayPrompts = (h: ReturnType<typeof harness>) => h.provider.requests.map(text).filter((p) => p.includes('Ahora toca el día'))
  const planPrompts = (h: ReturnType<typeof harness>) => h.provider.requests.map(text).filter((p) => p.includes('Planifica los 14 platos'))

  it('1 llamada de PLAN + 7 días en paralelo; ensambla, valida el menú completo y crea el borrador', async () => {
    const h = harness()
    const { json } = await call(h, { action: 'generate', kind: 'menu', week: WEEK })
    expect(json).toMatchObject({ ok: true, status: 'ok', created: 1, expected: 1 })
    expect(h.provider.requests).toHaveLength(8)
    expect(planPrompts(h)).toHaveLength(1)
    expect(dayPrompts(h)).toHaveLength(7)
    // El plan es la primera llamada.
    expect(text(h.provider.requests[0])).toContain('Planifica los 14 platos')
    const validated = h.client.argsOf('community_service_validate_menu_item')
    expect(validated).toHaveLength(1)
    const payload = validated[0].p_payload as { menu: { days: { day: string }[]; version: number; servings: number }; schedule: string; source: string }
    expect(payload.menu.days.map((d) => d.day)).toEqual(['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'])
    expect(payload).toMatchObject({ schedule: 'saturday', source: 'Pepa (IA), revisado por una persona' })
    expect(payload.menu).toMatchObject({ version: 1, servings: 4 })
    const item = h.created()[0] as { kind: string; slot_date: string; topic_id: string; title: string; body: string; payload: unknown }
    expect(item).toMatchObject({ kind: 'menu', slot_date: WEEK, topic_id: 'menus-planificacion', title: 'Menú semanal de Pepa: semana del 2 al 8 de noviembre' })
    expect(item.payload).toEqual(payload)
    expect(item.body).toMatch(/dieta ni un plan/)
    expect(item.body).not.toMatch(/nutricional|validad/i)
  })

  it('el plan recibe los platos recientes; cada día recibe sus títulos del plan y los de los demás días como contexto (bloques de datos)', async () => {
    const h = harness()
    await call(h, { action: 'generate', kind: 'menu', week: WEEK })
    expect(planPrompts(h)[0]).toContain('<<<PLATOS_DE_SEMANAS_ANTERIORES')
    expect(planPrompts(h)[0]).toContain('Paella de marisco')
    const martes = dayPrompts(h).find((p) => p.includes('Ahora toca el día: martes.'))!
    expect(martes).toContain('<<<PLATOS_DE_ESTE_DIA')
    expect(martes).toContain('comida: Comida del día 1')
    expect(martes).toContain('cena: Cena del día 1')
    expect(martes).toContain('<<<PLAN_DE_LA_SEMANA')
    expect(martes).toContain('Comida del día 0')
    expect(martes).toContain('Cena del día 6')
    expect(martes).toContain('conserva esos títulos EXACTAMENTE')
    expect(martes).toContain('ningún plato más de 2 veces')
    expect(martes).toContain(DATA_NOTICE)
  })

  it('un plan inválido (plato 3 veces, comida = cena, menos de 7 días) se reintenta; si persiste: error sin llamar a los días', async () => {
    const bads = [
      planJson((i) => ({ comida: 'Lentejas', cena: `Cena ${i}` })), // «Lentejas» 7 veces
      planJson((i) => ({ comida: `Plato ${i}`, cena: `Plato ${i}` })),
      JSON.stringify({ days: [{ day: 'lunes', comida: 'A', cena: 'B' }] }),
    ]
    for (const bad of bads) {
      const h = harness({ plan: (n) => (n === 0 ? bad : planJson()) })
      const { json } = await call(h, { action: 'generate', kind: 'menu', week: WEEK })
      expect(json).toMatchObject({ status: 'ok', created: 1 })
      expect(planPrompts(h)).toHaveLength(2)
      expect(text(h.provider.requests[1])).toContain('Tu intento anterior se rechazó')
    }
    const never = harness({ plan: () => 'nada' })
    expect((await call(never, { action: 'generate', kind: 'menu', week: WEEK })).json).toMatchObject({ status: 'error', created: 0, errors: ['INVALID_OUTPUT'] })
    expect(never.provider.requests).toHaveLength(2)
    expect(dayPrompts(never)).toHaveLength(0)
  })

  it('un día que no conserva el título del plan, o con comida y cena iguales, se reintenta', async () => {
    const same = JSON.stringify({ comida: { title: 'Lentejas', side: '', recipes: [recipe('Lentejas')] }, cena: { title: 'Lentejas', side: '', recipes: [recipe('Lentejas')] } })
    const h = harness({ day: (i, n) => (n === 0 && i === 3 ? same : n === 0 && i === 4 ? dayJson(5) : dayJson(i)) })
    const { json } = await call(h, { action: 'generate', kind: 'menu', week: WEEK })
    expect(json.status).toBe('ok')
    expect(h.provider.requests).toHaveLength(10)
    expect(dayPrompts(h).filter((p) => p.includes('debe ser exactamente'))).toHaveLength(1)
    expect(dayPrompts(h).filter((p) => p.includes('no pueden ser el mismo plato'))).toHaveLength(1)
  })

  it('los días van en paralelo con concurrencia 4 como máximo', async () => {
    let active = 0
    let peak = 0
    const h = harness()
    const original = h.provider.generate.bind(h.provider)
    h.provider.generate = async (req) => {
      const isDay = text(req).includes('Ahora toca el día')
      if (isDay) {
        active++
        peak = Math.max(peak, active)
        await new Promise((r) => setTimeout(r, 5))
      }
      try {
        return await original(req)
      } finally {
        if (isDay) active--
      }
    }
    await call(h, { action: 'generate', kind: 'menu', week: WEEK })
    expect(peak).toBeGreaterThan(1)
    expect(peak).toBeLessThanOrEqual(4)
  })

  it('tope de llamadas de IA por ejecución de menú: 1 plan + 7 días + reintentos <= 14', async () => {
    const h = harness({ day: () => 'basura' })
    const { json } = await call(h, { action: 'generate', kind: 'menu', week: WEEK })
    expect(json).toMatchObject({ status: 'error', created: 0 })
    expect(h.provider.requests.length).toBeLessThanOrEqual(14)
    expect(h.created()).toHaveLength(0)
  })

  it('si el servidor rechaza el menú entero: UN reintento del día afectado con el motivo; si persiste, error MENU_INVALID sin crear', async () => {
    let n = 0
    const h = harness({ rpc: { community_service_validate_menu_item: () => (n++ === 0 ? { error: 'martes (cena), receta «Plato de cena 1»: debe tener de 1 a 30 pasos.', quality: [] } : { error: null, quality: [{ code: 'X' }] }) } })
    const { json } = await call(h, { action: 'generate', kind: 'menu', week: WEEK })
    expect(json).toMatchObject({ status: 'ok', created: 1 })
    expect(h.provider.requests).toHaveLength(9)
    const last = text(h.provider.requests[8])
    expect(last).toContain('Ahora toca el día: martes.')
    expect(last).toContain('debe tener de 1 a 30 pasos')

    const hard = harness({ rpc: { community_service_validate_menu_item: () => ({ error: 'martes (cena): algo falla.', quality: [] }) } })
    const r = (await call(hard, { action: 'generate', kind: 'menu', week: WEEK })).json
    expect(r).toMatchObject({ status: 'error', created: 0, errors: ['MENU_INVALID'] })
    expect(hard.provider.requests).toHaveLength(9)
    expect(hard.created()).toHaveLength(0)
  })

  it('un día imposible de generar corta la ejecución con error y no crea nada', async () => {
    const h = harness({ day: (i) => (i === 2 ? 'sin formato' : dayJson(i)) })
    const { json } = await call(h, { action: 'generate', kind: 'menu', week: WEEK })
    expect(json).toMatchObject({ status: 'error', created: 0, errors: ['INVALID_OUTPUT'] })
    expect(h.created()).toHaveLength(0)
    expect(h.client.count('community_service_validate_menu_item')).toBe(0)
  })

  it('el título cruza meses sin romperse', () => {
    expect(menuTitle('2026-10-26')).toBe('Menú semanal de Pepa: semana del 26 de octubre al 1 de noviembre')
    expect(menuTitle('2026-11-02')).toBe('Menú semanal de Pepa: semana del 2 al 8 de noviembre')
  })
})

// =============================================================================================================================
describe('recetas: contrato de las fichas', () => {
  it('mismas reglas que el SQL: raciones, ingredientes repetidos, pasos, sencillos, comas, campos opcionales', () => {
    expect(cleanRecipe(recipe('Sopa', { servings: 6 }), 'menu').ok).toBe(false) // el menú es de 4 raciones
    expect(cleanRecipe(recipe('Sopa', { servings: null }), 'post')).toMatchObject({ ok: true })
    expect(cleanRecipe(recipe('Sopa', { servings: 0 }), 'post').ok).toBe(false)
    expect(cleanRecipe(recipe('Sopa', { steps: [] }), 'menu').ok).toBe(false)
    expect(cleanRecipe(recipe('Fruta', { simple: true, steps: [] }), 'menu').ok).toBe(true)
    expect(cleanRecipe(recipe('Fruta', { simple: true, steps: [] }), 'post').ok).toBe(false) // «simple» no existe en artículos
    const comma = cleanRecipe(recipe('Sopa', { ingredients: [ingredient('Pimiento rojo, troceado', 1, 'unidad')] }), 'menu')
    expect(comma.ok && (comma.value.ingredients as { name: string }[])[0].name).toBe('Pimiento rojo')
    const opt = cleanRecipe(recipe('Sopa', { time: { active: 30, total: 10 }, freeze: { ideal: true, note: 'Hasta 3 meses' }, tip: 'x'.repeat(401) }), 'menu')
    expect(opt.ok && opt.value).toMatchObject({ freeze: { ideal: true, note: 'Hasta 3 meses' } })
    expect(opt.ok && 'time' in opt.value).toBe(false)
    expect(opt.ok && 'tip' in opt.value).toBe(false)
    expect(cleanRecipe(recipe('Sopa', { steps: ['Visita www.sopa.com'] }), 'menu').ok).toBe(false)
    expect(cleanPostRecipes([]).ok).toBe(false)
    expect(cleanPostRecipes(Array(7).fill(recipe('Sopa'))).ok).toBe(false)
  })
})

// =============================================================================================================================
describe('contrato HTTP', () => {
  it('OPTIONS → 204 con CORS; otro método → 405', async () => {
    const h = harness()
    const opt = await handleEditorial(new Request('https://x.test/', { method: 'OPTIONS' }), h.deps)
    expect(opt.status).toBe(204)
    expect(opt.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect((await handleEditorial(new Request('https://x.test/', { method: 'GET' }), h.deps)).status).toBe(405)
  })

  it('401 sin credenciales, con secreto incorrecto o con un JWT que no vale', async () => {
    const h = harness()
    expect((await call(h, { action: 'generate', kind: 'poll' }, null)).json).toEqual({ ok: false, error: 'unauthorized' })
    expect((await call(h, { action: 'generate', kind: 'poll' }, null)).res.status).toBe(401)
    const badSecret = await handleEditorial(cronRequest('otro-secreto', { action: 'cron' }), h.deps)
    expect(badSecret.status).toBe(401)
    expect((await call(h, { action: 'generate', kind: 'poll' }, 'Bearer falso')).res.status).toBe(401)
    expect(h.client.count('community_service_editorial_begin_run')).toBe(0)
  })

  it('403 not_admin si la persona no es administradora; 403 si el cron pide acciones de administrador o al revés', async () => {
    const h = harness()
    h.deps.authenticate = async () => ({ rpc: () => Promise.resolve({ data: null, error: { message: 'NOT_ADMIN' } }) })
    const r = await call(h, { action: 'generate', kind: 'poll' })
    expect(r.res.status).toBe(403)
    expect(r.json).toEqual({ ok: false, error: 'not_admin' })
    expect(h.provider.requests).toHaveLength(0)

    const h2 = harness()
    expect((await handleEditorial(cronRequest(SECRET, { action: 'generate', kind: 'poll' }), h2.deps)).status).toBe(403)
    expect((await call(h2, { action: 'cron' })).res.status).toBe(403)
    expect(h2.client.count('community_service_editorial_begin_run')).toBe(0)
  })

  it('400 con cuerpo inválido o acción desconocida', async () => {
    const h = harness()
    expect((await call(h, { action: 'volar' })).res.status).toBe(400)
    const bad = await handleEditorial(new Request('https://x.test/', { method: 'POST', headers: { Authorization: 'Bearer admin' }, body: 'no json' }), h.deps)
    expect(bad.status).toBe(400)
    expect(bad.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('las respuestas de error llevan CORS', async () => {
    const h = harness()
    const { res } = await call(h, { action: 'generate', kind: 'poll' }, null)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })
})

// Pruebas directas del orquestador de artículos (sin HTTP).
describe('generateArticles', () => {
  it('usa un único begin/finish por la capa superior: el generador no abre ni cierra ejecuciones', async () => {
    const h = harness()
    const r = await generateArticles({ admin: h.client, getAi: h.deps.getAi }, 'run-9', WEEK)
    expect(r.created).toBe(7)
    expect(h.client.count('community_service_editorial_begin_run')).toBe(0)
    expect(h.client.count('community_service_editorial_finish_run')).toBe(0)
    expect(h.client.argsOf('community_service_editorial_create_item').every((a) => a.p_run === 'run-9')).toBe(true)
  })
})
