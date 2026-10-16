// BARRERA contra IA de las alergias e intolerancias de la ficha privada (datos de salud). Prueba de la «PALABRA TRAMPA»: se rellena la ficha de una persona con
// un texto inconfundible, se ejecutan los flujos del cliente que hablan con la IA con una `fetch` simulada que captura CADA petición saliente, y se comprueba que
// ninguna lleva la palabra trampa ni identificadores de la ficha. Además: la guarda rechaza cargas con claves de salud y se documenta qué NO se puede garantizar.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const TRAP = 'ZZ_CANARIO_ALERGIA_7731'

const rpc = vi.fn()
vi.mock('@/data/supabaseClient', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: 'token-de-prueba' } } }) },
    rpc: (...args: unknown[]) => rpc(...args),
  },
}))
vi.mock('@/data/family', () => ({
  listFamilyMembers: async () => [{ id: 'm1', name: 'Eric' }, { id: 'm2', name: 'Fernando' }],
}))

import { checkRecipeIngredients } from '@/domain/dietaryRestrictions'
import { loadDietaryOverview } from '@/data/dietaryRestrictions'
import { callAiFunction, loadAliasMap } from '@/services/aiClient'
import { requestRecipeDraft } from '@/services/recipeGenerate'
import { requestCookIdeas } from '@/services/whatToCook'
import { classifyQuestionWithAi } from '@/services/pepaIntent'
import { splitGroceryListWithAi } from '@/services/splitGroceryList'
import { classifyFinanceIntent } from '@/services/financeIntent'
import { classifyBudgetIntent } from '@/services/financeBudgetIntent'
import { requestFinanceAnalysis } from '@/services/financeAnalysis'
import { assertNoHealthData, containsHealthData, HealthDataBlockedError, HEALTH_FORBIDDEN_KEYS, HEALTH_FORBIDDEN_MARKERS } from '../../supabase/functions/_shared/ai/healthGuard'
import { createProvider, guardHealthData } from '../../supabase/functions/_shared/ai/providers'
import { createGeminiProvider } from '../../supabase/functions/_shared/ai/gemini'

interface Captured {
  url: string
  body: string
}
let captured: Captured[] = []

beforeEach(() => {
  captured = []
  rpc.mockReset()
  vi.stubEnv('VITE_SUPABASE_URL', 'https://ejemplo.supabase.test')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { body?: string }) => {
      captured.push({ url: String(url), body: String(init?.body ?? '') })
      // La respuesta no importa: solo se mira lo que SALE. Cada servicio rechaza lo que no entiende y sigue.
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

// La ficha de una persona, rellena con la palabra trampa en TODOS los campos de texto y con una alergia real de catálogo.
function fillFicha() {
  rpc.mockResolvedValue({
    data: {
      ok: true,
      can_manage: true,
      my_member_id: 'm1',
      consents: [{ member_id: 'm1', granted_by: 'p1', granted_at: '2026-10-16T09:00:00Z', notice_version: 'v1' }],
      restrictions: [
        { id: 'r1', member_id: 'm1', kind: 'alergia', allergen_key: 'cacahuete', custom_label: null, severity: 'grave', note: TRAP, created_at: 'x', updated_at: 'x' },
        { id: 'r2', member_id: 'm1', kind: 'restriccion', allergen_key: null, custom_label: TRAP, severity: null, note: null, created_at: 'x', updated_at: 'x' },
      ],
    },
    error: null,
  })
}

async function runAllAiFlows() {
  const swallow = <T>(p: Promise<T>) => p.catch(() => null)
  await swallow(requestRecipeDraft({ dish: 'tarta de manzana', servings: 4, preferences: ['sin gluten'] }))
  await swallow(requestCookIdeas({ ingredients: ['huevos', 'tomate'], servings: 2, preferences: [] }))
  await swallow(classifyQuestionWithAi('qué tengo hoy', '2026-10-16'))
  await swallow(splitGroceryListWithAi('leche pan y manzanas'))
  await swallow(classifyFinanceIntent('cuánto gasté en comida', new Date('2026-10-16T10:00:00Z')))
  await swallow(classifyBudgetIntent('pon 300 euros de presupuesto', new Date('2026-10-16T10:00:00Z')))
  await swallow(requestFinanceAnalysis('overview', [{ ref: 'expenses.total', label: 'Gasto total', value: 280, kind: 'eur' }] as never))
}

describe('palabra trampa: ninguna petición saliente lleva la ficha', () => {
  it('con la ficha CARGADA en memoria, todos los flujos de IA del cliente envían peticiones sin la palabra trampa ni identificadores de salud', async () => {
    fillFicha()
    const overview = await loadDietaryOverview()
    expect(overview.restrictions.map((r) => r.note ?? r.customLabel)).toContain(TRAP) // la ficha está realmente cargada
    // Se usa también el motor de avisos con esa ficha (todo local).
    expect(checkRecipeIngredients([{ name: 'mantequilla de cacahuete' }], overview.restrictions).status).toBe('hallazgos')

    await runAllAiFlows()

    expect(captured.length).toBeGreaterThanOrEqual(6) // la prueba no está vacía: salen peticiones de verdad
    const all = captured.map((c) => c.url + '\n' + c.body).join('\n----\n').toLowerCase()
    expect(all).not.toContain(TRAP.toLowerCase())
    expect(all).not.toContain('cacahuete')
    for (const marker of HEALTH_FORBIDDEN_MARKERS) expect(all, marker).not.toContain(marker)
    for (const key of HEALTH_FORBIDDEN_KEYS) expect(all.replace(/[_-]/g, ''), key).not.toContain(`"${key}"`)
  })

  it('las peticiones salen solo hacia las funciones de IA conocidas y con los campos de siempre (si cambian, hay que revisar la privacidad)', async () => {
    fillFicha()
    await loadDietaryOverview()
    await runAllAiFlows()
    const shape = captured.map((c) => `${c.url.split('/functions/v1/')[1]}: ${Object.keys(JSON.parse(c.body)).sort().join(',')}`).sort()
    expect(shape).toEqual([
      'finance-analysis: detail,facts,focus',
      'finance-budget-intent: text,today',
      'finance-intent: text,today',
      'pepa-intent: text,today',
      'recipe-generate: dish,preferences,servings',
      'split-grocery-list: text',
      'what-to-cook: ingredients,preferences,servings',
    ])
  })

  it('el mapa de alias envía a la IA «Persona A…», nunca los nombres reales, y tampoco nada de la ficha', async () => {
    fillFicha()
    await loadDietaryOverview()
    const alias = await loadAliasMap()
    const sent = alias.aliasize('apunta algo para Eric y Fernando')
    expect(sent).not.toContain('Eric')
    expect(sent).not.toContain('Fernando')
    expect(sent).not.toContain(TRAP)
  })
})

describe('la guarda de ejecución rechaza cargas con claves de salud', () => {
  it('callAiFunction (cliente) no envía nada si el cuerpo lleva claves de la ficha', async () => {
    for (const body of [
      { text: 'hola', allergen_key: 'cacahuete' },
      { dish: 'tarta', dietaryRestrictions: [{ id: 'x' }] },
      { dish: 'tarta', nested: { deep: [{ custom_label: TRAP }] } },
      { dish: 'tarta', preferences: ['member_dietary_restrictions'] },
      { dish: 'tarta', allergies: ['kiwi'] },
      { dish: 'tarta', Alergias: 'x' },
    ]) {
      await expect(callAiFunction('recipe-generate', body)).rejects.toBeInstanceOf(HealthDataBlockedError)
    }
    expect(captured).toHaveLength(0) // no salió NADA
  })

  it('el mensaje del error no incluye el contenido bloqueado', async () => {
    const e = (await callAiFunction('recipe-generate', { dish: TRAP, allergen_key: TRAP }).catch((x: unknown) => x)) as Error
    expect(e.message).toBe('health_data_blocked')
    expect(String(e.stack).split('\n')[0]).not.toContain(TRAP)
  })

  it('cuerpos normales siguen pasando', async () => {
    await callAiFunction('recipe-generate', { dish: 'tarta de manzana', servings: 4, preferences: ['sin lactosa'] })
    expect(captured).toHaveLength(1)
  })

  it('assertNoHealthData: claves en cualquier nivel, identificadores dentro de textos, y profundidad excesiva', () => {
    expect(containsHealthData({ a: { b: [{ c: 'select * from public.member_health_consent' }] } })).toBe(true)
    expect(containsHealthData({ 'allergen-key': 1 })).toBe(true)
    expect(containsHealthData({ a: 'receta de tarta de manzana', n: 3, ok: true, nada: null })).toBe(false)
    let deep: unknown = 'x'
    for (let i = 0; i < 30; i++) deep = { d: deep }
    expect(containsHealthData(deep)).toBe(true)
    expect(() => assertNoHealthData({ ok: 1 })).not.toThrow()
    // Las imágenes en base64 no se recorren (no son texto y pueden pesar megas) ni se bloquean por casualidad.
    expect(containsHealthData({ inlineData: { mimeType: 'image/png', data: 'AAAA'.repeat(200000) } })).toBe(false)
  })
})

describe('servidor: createProvider es el único punto de salida hacia Gemini y lleva la guarda', () => {
  const realFetch = vi.fn(async (_u: string, init?: { body?: string }) => {
    captured.push({ url: _u, body: String(init?.body ?? '') })
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{}' }] } }], usageMetadata: {} }), { status: 200 })
  })

  it('una petición normal sale; una con datos de salud (texto o esquema) NO sale y no llega ni a la red', async () => {
    vi.stubGlobal('fetch', realFetch)
    const provider = createProvider('gemini', 'clave-de-prueba')
    expect(provider.name).toBe('gemini')
    await provider.generate({ model: 'm', parts: [{ text: 'Genera una receta de tarta de manzana' }] })
    expect(captured).toHaveLength(1)
    await expect(provider.generate({ model: 'm', parts: [{ text: 'consulta member_dietary_restrictions de la familia' }] })).rejects.toMatchObject({ status: 400, message: 'health_data_blocked' })
    await expect(provider.generate({ model: 'm', parts: [{ text: 'ok' }], responseSchema: { type: 'OBJECT', properties: { allergen_key: { type: 'STRING' } } } })).rejects.toBeInstanceOf(HealthDataBlockedError)
    expect(captured).toHaveLength(1) // las bloqueadas no salieron
  })

  it('el proveedor desnudo SIN guarda dejaría pasar la carga: por eso createProvider es el único camino permitido (candado estático)', async () => {
    vi.stubGlobal('fetch', realFetch)
    await createGeminiProvider('k').generate({ model: 'm', parts: [{ text: 'member_dietary_restrictions' }] })
    expect(captured).toHaveLength(1)
    await expect(guardHealthData(createGeminiProvider('k')).generate({ model: 'm', parts: [{ text: 'member_dietary_restrictions' }] })).rejects.toBeInstanceOf(HealthDataBlockedError)
    expect(captured).toHaveLength(1)
  })

  it('las tres rutas (puerta central, webhooks directos y Comunidad) crean el proveedor con createProvider', () => {
    const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
    expect(read('supabase/functions/_shared/ai/gateway.ts')).toContain('createProvider(providerName, apiKey)')
    expect(read('supabase/functions/import-event-email-webhook/index.ts')).toContain('createProvider(providerName, geminiKey)')
    expect(read('supabase/functions/mercadona-ticket-webhook/index.ts')).toContain('createProvider(providerName, geminiKey)')
    expect(read('supabase/functions/_shared/communityAi.ts')).toContain('options.providerFactory ?? createProvider')
  })
})

describe('LÍMITES documentados: lo que esta barrera NO puede garantizar', () => {
  it('una frase libre que la persona escribe o dicta SÍ viaja a la IA (con los nombres como alias): no hay forma técnica de detectar un dato de salud en un texto libre', async () => {
    // «apunta que Eric es alérgico a …» cae en pepa-intent si las reglas locales no la entienden. Los nombres van como alias; la alergia, en claro.
    await classifyQuestionWithAi(`apunta que Eric es alérgico a ${TRAP}`, '2026-10-16').catch(() => null)
    const body = captured.map((c) => c.body).join('')
    expect(body).toContain(TRAP) // hecho conocido (hallazgo D del análisis): se corrige con la decisión D5, no con permisos
    expect(body).not.toContain('Eric')
  })

  it('las preferencias dietéticas dichas EN la petición («sin gluten») viajan hoy a recipe-generate y what-to-cook (decisión D5 pendiente)', async () => {
    await requestRecipeDraft({ dish: 'pan', servings: 2, preferences: ['sin gluten'] }).catch(() => null)
    expect(captured.map((c) => c.body).join('')).toContain('sin gluten')
  })
})
