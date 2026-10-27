// Simulaciones para probar community-editorial (programa editorial semanal de Comunidad) en Node: RPC de servicio falsas, IA falsa que responde según el tipo
// de petición, y utilidades para construir peticiones HTTP.
import type { AiGenerateRequest } from '../../supabase/functions/_shared/ai/types'
import type { EditorialDeps, UserSession } from '../../supabase/functions/community-editorial/editorial'
import { RpcFailure, SECRET, U1, allowAi, fakeAi, fakeClient, fakeProvider, secretRpc, type FakeClient, type FakeProvider, type RpcHandler } from './communityServerFakes'

export const WEEK = '2026-11-02' // lunes
export const ADMIN_ID = U1
export const PERSON_SECRET_TEXT = 'SECRETO_DE_PERSONA_XYZ'

export const text = (req: AiGenerateRequest): string => req.parts.map((p) => ('text' in p ? p.text : '')).join('\n')

// ---- recetas y artículos
export const ingredient = (name: string, quantity: string | number = '100', unit = 'g') => ({ name, quantity, unit })
export const recipe = (title: string, extra: Record<string, unknown> = {}) => ({
  title,
  servings: 4,
  ingredients: [ingredient('Arroz', '300', 'g'), ingredient('Cebolla', '1', 'unidad')],
  steps: ['Sofríe la cebolla picada en una sartén.', 'Añade el arroz y cuece quince minutos a fuego suave.'],
  ...extra,
})

const PARA = 'Aprovecha lo que tienes en casa y organiza la semana con calma. Pequeños gestos, bien repartidos, ahorran tiempo y dinero a cualquier familia.'
export const articleBody = (len = 1100): string => {
  let body = 'Una idea sencilla para empezar la semana con buen pie en casa.'
  while (body.length < len) body += `\n\n${PARA} ${PARA}`
  return body.trim()
}
export const articleJson = (title: string, extra: Record<string, unknown> = {}, body = articleBody()): string => JSON.stringify({ title, body, ...extra })

const SLOT_DEFS: [string, string, string][] = [
  ['recetas-faciles', 'recetas', 'Recetas fáciles'],
  ['trucos-de-cocina', 'recetas', 'Trucos de cocina'],
  ['ahorro-economia', 'hogar', 'Ahorro y economía'],
  ['organizacion-familiar', 'hogar', 'Organización familiar'],
  ['limpieza-hogar', 'hogar', 'Limpieza del hogar'],
  ['actividades-familia', 'hogar', 'Actividades en familia'],
  ['crianza-educacion', 'hogar', 'Crianza y educación'],
]
export const slotLabel = (i: number): string => SLOT_DEFS[i][2]

export function planFor(week = WEEK, count = 7): unknown {
  const slots = SLOT_DEFS.slice(0, count).map(([topic_id, section, label], i) => ({
    slot_date: new Date(Date.UTC(+week.slice(0, 4), +week.slice(5, 7) - 1, +week.slice(8, 10) + i)).toISOString().slice(0, 10),
    topic_id,
    section,
    label,
    tier: i === 0 ? 2 : 4,
    published_n: i,
    pending_n: 0,
    group_key: i === 0 ? 'grupo-1' : null,
    proposal_texts: i === 0 ? [`Cenas rápidas para días de colegio ${PERSON_SECRET_TEXT}`] : [],
    proposal_people: i === 0 ? 3 : 0,
    topic_recent_titles: i === 1 ? ['Título reciente del subtema'] : [],
  }))
  return { slots, avoid_titles: ['Título ya existente en el catálogo'] }
}

// ---- encuesta y menú
export const POLL_OK = {
  question: '¿Cómo organizáis la compra de la semana?',
  intro: 'Cuéntanos qué os funciona mejor en casa.',
  topic_id: 'organizacion-familiar',
  options: ['Con lista y menú', 'Sobre la marcha', 'Compra en línea'],
}
export const HOGAR_TOPICS = [
  { id: 'ahorro-economia', label: 'Ahorro y economía' },
  { id: 'organizacion-familiar', label: 'Organización familiar' },
]

export const dayJson = (i: number): string =>
  JSON.stringify({
    comida: { title: `Comida del día ${i}`, side: 'Ensalada', recipes: [recipe(`Plato de comida ${i}`), recipe(`Ensalada ${i}`, { simple: true, steps: [] })] },
    cena: { title: `Cena del día ${i}`, side: '', recipes: [recipe(`Plato de cena ${i}`)] },
  })

export function menuOf(): Record<string, unknown> {
  const names = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
  const mk = (i: number) => {
    const d = JSON.parse(dayJson(i))
    return { day: names[i], meals: { comida: { ...d.comida, recipes: d.comida.recipes.map((r: Record<string, unknown>) => ({ ...r })) }, cena: d.cena } }
  }
  return { version: 1, servings: 4, days: [0, 1, 2, 3, 4, 5, 6].map(mk) }
}

// ---- entorno
export interface HarnessOptions {
  config?: Record<string, unknown>
  rpc?: Record<string, RpcHandler>
  // Respuesta de la IA para un artículo: (subtema, nº de intento de ese subtema) → texto o error.
  article?: (label: string, n: number) => string | Error
  poll?: (n: number) => string | Error
  day?: (index: number, n: number) => string | Error
  plan?: (n: number) => string | Error
  revise?: (n: number, prompt: string) => string | Error
  aiNull?: boolean
  allowed?: boolean
}

export interface Harness {
  client: FakeClient
  provider: FakeProvider
  deps: EditorialDeps
  rpcNames(): string[]
  created(): Record<string, unknown>[]
}

export function harness(opts: HarnessOptions = {}): Harness {
  const created: Record<string, unknown>[] = []
  const counters = new Map<string, number>()
  const bump = (k: string): number => {
    const n = counters.get(k) ?? 0
    counters.set(k, n + 1)
    return n
  }
  const client = fakeClient({
    rpc: {
      ...secretRpc,
      ...allowAi(opts.allowed ?? true),
      community_service_editorial_config: () => ({
        launched: true, articles_enabled: true, polls_enabled: true, menu_enabled: true, due: true,
        run_at: '2026-10-28T07:00:00Z', articles_week: WEEK, poll_week: '2026-10-26', menu_week: WEEK, ...opts.config,
      }),
      community_service_editorial_begin_run: () => 'run-1',
      community_service_editorial_finish_run: () => null,
      community_service_editorial_plan_articles: (a) => planFor(a.p_week as string),
      community_service_editorial_context: (a) =>
        a.p_kind === 'poll'
          ? { slot_date: '2026-10-31', exists: false, recent_questions: ['¿Qué cenáis los viernes?'], hogar_topics: HOGAR_TOPICS }
          : { slot_date: a.p_week, exists: false, recent_dishes: ['Paella de marisco'] },
      community_service_editorial_create_item: (a) => {
        created.push(a.p_item as Record<string, unknown>)
        return `item-${created.length}`
      },
      community_service_validate_menu_item: () => ({ error: null, quality: [] }),
      ...opts.rpc,
    },
  })
  const provider = fakeProvider((req) => {
    const t = text(req)
    if (t.includes('Escribe UN artículo PRÁCTICO')) {
      const label = /subtema «([^»]+)»/.exec(t)![1]
      return (opts.article ?? ((l) => articleJson(`Artículo práctico sobre ${l.toLowerCase()}`)))(label, bump(`a:${label}`))
    }
    if (t.includes('Prepara UNA encuesta')) return (opts.poll ?? (() => JSON.stringify(POLL_OK)))(bump('poll'))
    if (t.includes('Planifica los 14 platos')) return (opts.plan ?? (() => defaultPlan()))(bump('plan'))
    if (t.includes('MENÚ SEMANAL')) {
      const day = /Ahora toca el día: ([^.]+)\./.exec(t)![1]
      const index = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'].indexOf(day)
      return (opts.day ?? ((i) => dayJson(i)))(index, bump(`d:${index}`))
    }
    if (t.includes('Rectificas un borrador')) return (opts.revise ?? (() => '{}'))(bump('revise'), t)
    return new Error('petición de IA no reconocida')
  })
  const session: UserSession = { rpc: (fn) => Promise.resolve({ data: fn === 'community_admin_can_generate' ? { ok: true, user: ADMIN_ID } : null, error: null }) }
  const deps: EditorialDeps = {
    admin: client,
    getAi: async () => (opts.aiNull ? null : fakeAi(client, provider)),
    authenticate: async (auth) => (auth === 'Bearer admin' || auth === 'Bearer other' ? session : null),
  }
  return { client, provider, deps, rpcNames: () => client.calls.map((c) => c.fn), created: () => created }
}

export const adminRequest = (body: unknown, auth: string | null = 'Bearer admin'): Request => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (auth) headers.Authorization = auth
  return new Request('https://example.test/functions/v1/community-editorial', { method: 'POST', headers, body: JSON.stringify(body) })
}

export { RpcFailure, SECRET }

// Plan de menú por defecto: los mismos títulos que usa dayJson.
export const planJson = (override: (i: number) => { comida: string; cena: string } = (i) => ({ comida: `Comida del día ${i}`, cena: `Cena del día ${i}` })): string =>
  JSON.stringify({ days: [0, 1, 2, 3, 4, 5, 6].map((i) => ({ day: `día ${i}`, ...override(i) })) })
const defaultPlan = (): string => planJson()
