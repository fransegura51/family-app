// community-weekly-proposals: lote semanal PARA REVISIÓN HUMANA (consejos, encuesta y artículo con datos reales de Eurostat verificados por código).
// Simulación completa (sin Supabase, Gemini ni Eurostat reales; los datos de Eurostat de las pruebas son respuestas reales guardadas).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EUROSTAT_CATALOG,
  GEO_EU,
  GEO_SPAIN,
  buildEurostatUrl,
  buildFacts,
  commonRows,
  extractNumbers,
  fetchEurostat,
  parseJsonStat,
  pickEntry,
  verifyNumbers,
} from '../../supabase/functions/community-weekly-proposals/eurostat'
import {
  NOT_REPRESENTATIVE_NOTE,
  TOPICS,
  TOPIC_IDS,
  buildArticleItem,
  buildArticleParts,
  buildTipsPollParts,
  handleWeekly,
  runWeekly,
  validateArticle,
  validateTipsAndPoll,
  type WeeklyDeps,
} from '../../supabase/functions/community-weekly-proposals/proposals'
import { FOOD_BUDGET_SHARE, FOOD_INFLATION, HOUSING_INFLATION } from './communityEurostatFixtures'
import { RpcFailure, SECRET, allowAi, cronRequest, fakeAi, fakeClient, fakeProvider, providerError, secretRpc, type FakeClient, type FakeProvider, type RpcHandler } from './communityServerFakes'

const FOOD = EUROSTAT_CATALOG.find((e) => e.id === 'food-inflation')!
const HBS = EUROSTAT_CATALOG.find((e) => e.id === 'food-budget-share')!

// ---- textos de ejemplo
const TIP = (n: number, topic = 'trucos-de-cocina') => ({
  title: `Consejo número ${n} para la cocina`,
  body: 'Congela el pan en rebanadas y sácalo solo las que vayas a usar: así no se pone duro y no tiras nada. Un minuto en la tostadora lo deja como recién hecho.',
  topic_id: topic,
})
const POLL = {
  question: '¿Cómo organizáis la compra de la semana?',
  intro: 'Cuéntanos qué os funciona mejor en casa.',
  topic_id: 'organizacion-familiar',
  options: ['Con lista y menú', 'Sobre la marcha', 'Compra en línea', 'Cada día un poco'],
}
const tipsPollJson = (tips = [TIP(1), TIP(2, 'ahorro-economia'), TIP(3, 'limpieza-hogar')], poll: unknown = POLL): string => JSON.stringify({ tips, poll })

const GOOD_ARTICLE = {
  title: 'Cuánto han subido los alimentos en España y en Europa',
  body:
    'Entre 2021 y 2025 los precios de los alimentos y las bebidas no alcohólicas subieron con fuerza en toda Europa. En España la variación anual media fue de 1,8 % en 2021, de 11,6 % en 2022 y de 11,7 % en 2023; después bajó a 3,6 % en 2024 y a 2,5 % en 2025.\n\n' +
    'Para una familia, esto significa que la cesta de la compra sigue costando más que hace unos años aunque la subida se haya moderado: conviene planificar el menú y comparar precios.',
  comparison: 'En 2024 España estuvo 1,3 puntos por encima de la media de la Unión Europea y en 2025 estuvo 0,8 puntos por debajo. En 2022 la diferencia fue de 0,3 puntos.',
  methodology: 'Los datos son las cifras oficiales ya publicadas por Eurostat (índice armonizado de precios de consumo) para España y la Unión Europea entre 2021 y 2025. No se han hecho cálculos propios.',
}
const articleJson = (patch: Partial<typeof GOOD_ARTICLE> = {}): string => JSON.stringify({ ...GOOD_ARTICLE, ...patch })

const okFetch = (payload: unknown = FOOD_INFLATION): typeof fetch =>
  (async () => new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch

interface Setup {
  deps: WeeklyDeps
  client: FakeClient
  provider: FakeProvider
  fetchFn: ReturnType<typeof vi.fn>
}

function setup(opts: { tipsResponse?: string | Error; articleResponse?: string | Error; fetchFn?: typeof fetch; rpc?: Record<string, RpcHandler>; existing?: unknown[]; aiNull?: boolean } = {}): Setup {
  const client = fakeClient({
    rpc: { ...secretRpc, ...allowAi(true), community_service_create_proposals: (a) => (a.p_items as unknown[]).length, ...opts.rpc },
    tables: { community_official_items: (opts.existing ?? []) as never },
  })
  const provider = fakeProvider((req) => {
    const text = JSON.stringify(req.parts)
    return text.includes('DATOS (las únicas cifras permitidas)') ? (opts.articleResponse ?? articleJson()) : (opts.tipsResponse ?? tipsPollJson())
  })
  const fetchFn = vi.fn(opts.fetchFn ?? okFetch())
  const deps: WeeklyDeps = {
    admin: client,
    getAi: async () => (opts.aiNull ? null : fakeAi(client, provider)),
    fetchFn: fetchFn as unknown as typeof fetch,
    now: () => new Date('2026-10-14T08:00:00Z'), // miércoles
  }
  return { deps, client, provider, fetchFn }
}

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined))
afterEach(() => vi.restoreAllMocks())

// =============================================================================================================================
describe('Eurostat: lector de JSON-stat con respuestas reales', () => {
  it('lee la inflación de alimentos: España está en la 2ª posición del eje geo, no en la 1ª', () => {
    const ds = parseJsonStat(FOOD_INFLATION, FOOD)!
    expect(ds.updated).toBe('2026-02-06')
    const es = ds.points.filter((p) => p.geo === GEO_SPAIN).map((p) => [p.period, p.value])
    const eu = ds.points.filter((p) => p.geo === GEO_EU).map((p) => [p.period, p.value])
    expect(es).toEqual([['2021', 1.8], ['2022', 11.6], ['2023', 11.7], ['2024', 3.6], ['2025', 2.5]])
    expect(eu).toEqual([['2021', 1.6], ['2022', 11.9], ['2023', 12.6], ['2024', 2.3], ['2025', 3.3]])
  })
  it('lee la estructura del gasto (por mil → %) con huecos: la UE no tiene dato de 2010', () => {
    const ds = parseJsonStat(FOOD_BUDGET_SHARE, HBS)!
    expect(ds.points.filter((p) => p.geo === GEO_SPAIN).map((p) => [p.period, p.value])).toEqual([['2010', 14.4], ['2015', 15], ['2020', 17]])
    expect(ds.points.filter((p) => p.geo === GEO_EU).map((p) => [p.period, p.value])).toEqual([['2015', 16.2], ['2020', 16.9]])
    expect(commonRows(ds).map((r) => r.period)).toEqual(['2015', '2020'])
  })
  it('lee la vivienda y energía', () => {
    const ds = parseJsonStat(HOUSING_INFLATION, EUROSTAT_CATALOG.find((e) => e.id === 'housing-energy-inflation')!)!
    expect(commonRows(ds)).toHaveLength(5)
  })
  it('rechaza lo que no tiene la forma esperada (nunca inventa datos)', () => {
    expect(parseJsonStat(null, FOOD)).toBeNull()
    expect(parseJsonStat({ class: 'collection' }, FOOD)).toBeNull()
    expect(parseJsonStat({ class: 'dataset', id: ['geo'], size: [1, 2], dimension: {} }, FOOD)).toBeNull()
    const noGeo = { ...(FOOD_INFLATION as object), id: ['freq', 'unit', 'coicop', 'time'] }
    expect(parseJsonStat(noGeo, FOOD)).toBeNull()
    const noDate = { ...(FOOD_INFLATION as Record<string, unknown>), updated: 'ayer' }
    expect(parseJsonStat(noDate, FOOD)).toBeNull()
    // Otra dimensión con más de un valor: lectura ambigua → null
    const ambiguous = { ...(FOOD_INFLATION as Record<string, unknown>), size: [1, 2, 1, 2, 5] }
    expect(parseJsonStat(ambiguous, FOOD)).toBeNull()
  })
  it('acepta también un índice de categorías en forma de lista y valores en forma de lista', () => {
    const asArray = {
      class: 'dataset',
      updated: '2026-01-02T00:00:00+0100',
      id: ['geo', 'time'],
      size: [2, 2],
      dimension: { geo: { category: { index: ['ES', 'EU27_2020'] } }, time: { category: { index: ['2024', '2025'] } } },
      value: [1.5, 2.5, 3.5, null],
    }
    const ds = parseJsonStat(asArray, FOOD)!
    expect(ds.points).toEqual([
      { geo: 'ES', period: '2024', value: 1.5 },
      { geo: 'ES', period: '2025', value: 2.5 },
      { geo: 'EU27_2020', period: '2024', value: 3.5 },
    ])
  })
  it('la URL de la consulta lleva los códigos del catálogo y el año de inicio', () => {
    const url = new URL(buildEurostatUrl(FOOD, 2026))
    expect(url.origin + url.pathname).toBe('https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_aind')
    expect(url.searchParams.getAll('geo')).toEqual(['ES', 'EU27_2020'])
    expect(url.searchParams.get('coicop')).toBe('CP01')
    expect(url.searchParams.get('unit')).toBe('RCH_A_AVG')
    expect(url.searchParams.get('sinceTimePeriod')).toBe('2020')
    expect(new URL(buildEurostatUrl(HBS, 2026)).searchParams.get('sinceTimePeriod')).toBe('2010')
  })
  it('el catálogo es corto, con códigos y temas válidos', () => {
    expect(EUROSTAT_CATALOG.length).toBeGreaterThanOrEqual(3)
    expect(EUROSTAT_CATALOG.length).toBeLessThanOrEqual(8)
    for (const e of EUROSTAT_CATALOG) {
      expect(e.dataset).toMatch(/^[a-z0-9_]+$/)
      expect(e.topicId in TOPICS).toBe(true)
      expect(TOPICS[e.topicId]).toBe('hogar')
      expect(e.scale).toBeGreaterThan(0)
    }
  })
  it('cada semana toca un indicador distinto y es estable dentro de la semana', () => {
    expect(pickEntry('2026-10-12').id).toBe(pickEntry('2026-10-12').id)
    const four = ['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02'].map((w) => pickEntry(w).id)
    expect(new Set(four).size).toBe(EUROSTAT_CATALOG.length)
  })
})

describe('Eurostat: descarga', () => {
  it('descarga y lee (con la fecha de actualización de Eurostat)', async () => {
    const fetchFn = vi.fn(okFetch())
    const ds = await fetchEurostat(FOOD, { fetchFn: fetchFn as unknown as typeof fetch, now: () => new Date('2026-10-14T08:00:00Z') })
    expect(ds?.updated).toBe('2026-02-06')
    expect(String(fetchFn.mock.calls[0][0])).toContain('prc_hicp_aind')
  })
  it('si la API falla (red, 500, JSON roto, formato raro o datos insuficientes): null, nunca lanza', async () => {
    const boom = (async () => {
      throw new Error('sin red')
    }) as unknown as typeof fetch
    const http500 = (async () => new Response('x', { status: 500 })) as unknown as typeof fetch
    const broken = (async () => new Response('no es json', { status: 200 })) as unknown as typeof fetch
    for (const f of [boom, http500, broken, okFetch({ class: 'dataset' }), okFetch(FOOD_BUDGET_SHARE)]) {
      // FOOD_BUDGET_SHARE solo tiene 2 periodos comunes y FOOD pide 4 → insuficiente
      expect(await fetchEurostat(FOOD, { fetchFn: f })).toBeNull()
    }
  })
})

describe('verificación de cifras contra los datos', () => {
  const facts = buildFacts(parseJsonStat(FOOD_INFLATION, FOOD)!)
  it('las diferencias y cambios calculados por el código están permitidos', () => {
    expect(facts.rows.map((r) => r.diff)).toEqual([0.2, -0.3, -0.9, 1.3, -0.8])
    expect(facts.esChange).toBe(0.7)
    expect(facts.euChange).toBe(1.7)
  })
  it('extrae números con coma o punto decimal y años', () => {
    expect(extractNumbers('subió 11,6 % en 2022 y 2.5 puntos; 1.234 euros')).toEqual(['11.6', '2022', '2.5', '1234'])
    expect(extractNumbers('sin números')).toEqual([])
  })
  it('acepta un texto cuyas cifras están todas en los datos', () => {
    expect(verifyNumbers([GOOD_ARTICLE.body, GOOD_ARTICLE.comparison], facts).ok).toBe(true)
  })
  it('descarta un número que NO está en los datos', () => {
    const check = verifyNumbers(['En 2022 subió un 15 % y en 2023 un 11,7 %, además de 3,6 % en 2024 y 2,5 % en 2025'], facts)
    expect(check.ok).toBe(false)
    expect(check.unknown).toEqual(['15'])
    expect(verifyNumbers(['Subió casi 12 % en 2022, 11,7 % en 2023 y 3,6 % en 2024'], facts).unknown).toEqual(['12'])
  })
  it('descarta un texto sin cifras reales de los datos (solo años) aunque no invente ninguna', () => {
    expect(verifyNumbers(['Entre 2021 y 2025 pasaron cosas.'], facts).ok).toBe(false)
  })
  it('un año fuera de los datos también se descarta', () => {
    expect(verifyNumbers(['En 2019 y 2022: 11,6 % y 11,7 % y 3,6 %.'], facts).unknown).toEqual(['2019'])
  })
})

// =============================================================================================================================
describe('consejos y encuesta: validación', () => {
  it('acepta 3 consejos y una encuesta válidos; la sección sale del tema', () => {
    const out = validateTipsAndPoll(tipsPollJson())!
    expect(out.tips).toHaveLength(3)
    expect(out.tips.map((t) => t.section)).toEqual(['recetas', 'hogar', 'hogar'])
    expect(out.tips.every((t) => t.kind === 'tip' && Object.keys(t.payload).length === 0)).toBe(true)
    expect(out.poll).toMatchObject({ kind: 'poll', section: 'hogar', topic_id: 'organizacion-familiar', title: POLL.question })
    expect(out.poll!.payload).toEqual({ options: POLL.options })
  })
  it('descarta consejos con tema inventado, con enlaces, con % o repetidos; el resto sigue', () => {
    const out = validateTipsAndPoll(
      tipsPollJson([
        TIP(1),
        { ...TIP(2), topic_id: 'tema-que-no-existe' },
        { ...TIP(3), body: 'Mira https://ejemplo.com/oferta para ahorrar mucho en la compra de cada semana en casa, de verdad.' },
        { ...TIP(4), body: 'Según un estudio, el 40 % de las familias tira comida cada semana en casa, así que planifica bien.' },
        TIP(1),
        TIP(5, 'ahorro-economia'),
      ]),
    )!
    expect(out.tips.map((t) => t.title)).toEqual([TIP(1).title, TIP(5).title])
  })
  it('máximo 3 consejos', () => {
    const out = validateTipsAndPoll(tipsPollJson([TIP(1), TIP(2), TIP(3), TIP(4)]))!
    expect(out.tips).toHaveLength(3)
  })
  it('la encuesta exige 2-6 opciones distintas, tema de hogar y sin enlaces', () => {
    expect(validateTipsAndPoll(tipsPollJson([TIP(1)], { ...POLL, options: ['Solo una'] }))!.poll).toBeNull()
    expect(validateTipsAndPoll(tipsPollJson([TIP(1)], { ...POLL, options: ['Igual', 'igual'] }))!.poll).toBeNull()
    expect(validateTipsAndPoll(tipsPollJson([TIP(1)], { ...POLL, topic_id: 'postres-dulces' }))!.poll).toBeNull()
    expect(validateTipsAndPoll(tipsPollJson([TIP(1)], { ...POLL, options: ['a', 'visita www.malo.es'] }))!.poll).toBeNull()
    expect(validateTipsAndPoll(tipsPollJson([TIP(1)], { ...POLL, options: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] }))!.poll!.payload).toEqual({ options: ['a', 'b', 'c', 'd', 'e', 'f'] })
  })
  it('salida que no es JSON o vacía → null', () => {
    expect(validateTipsAndPoll('no es json')).toBeNull()
    expect(validateTipsAndPoll(JSON.stringify({ tips: [], poll: null }))).toBeNull()
  })
  it('el prompt pide cuidado con consejos peligrosos, estadísticas inventadas y enlaces', () => {
    const text = buildTipsPollParts('2026-10-12').map((p) => ('text' in p ? p.text : '')).join('\n')
    expect(text).toMatch(/sin porcentajes ni estadísticas/)
    expect(text).toMatch(/sin enlaces/)
    expect(text).toMatch(/médicos, legales ni financieros/)
    expect(text).toContain('12/10/2026')
  })
})

describe('artículo: validación y construcción', () => {
  const ds = parseJsonStat(FOOD_INFLATION, FOOD)!
  const facts = buildFacts(ds)
  it('acepta un artículo cuyas cifras salen de los datos', () => {
    expect(validateArticle(articleJson(), facts)).toMatchObject({ title: GOOD_ARTICLE.title })
  })
  it('descarta el artículo si una cifra no sale de los datos, si lleva enlace o si es demasiado corto', () => {
    expect(validateArticle(articleJson({ body: GOOD_ARTICLE.body.replace('3,6 %', '3,9 %') }), facts)).toBeNull()
    expect(validateArticle(articleJson({ comparison: `${GOOD_ARTICLE.comparison} Más en https://eurostat.example/dato` }), facts)).toBeNull()
    expect(validateArticle(articleJson({ methodology: 'corta' }), facts)).toBeNull()
    expect(validateArticle('no es json', facts)).toBeNull()
  })
  it('el prompt solo contiene las cifras de los datos y exige no calcular otras', () => {
    const text = buildArticleParts(ds, facts).map((p) => ('text' in p ? p.text : '')).join('\n')
    expect(text).toContain('2022: España 11,6 | Unión Europea 11,9 | diferencia España menos UE -0,3')
    expect(text).toMatch(/EXCLUSIVAMENTE las cifras/)
    expect(text).toMatch(/NO calcules otras cifras/)
  })
  it('las fuentes las construye el código (editorial, enlace de Eurostat y fecha de los datos); incluye metodología, comparación y el aviso de representatividad', () => {
    const item = buildArticleItem(ds, facts, validateArticle(articleJson(), facts)!)
    expect(item).toMatchObject({ kind: 'article', section: 'hogar', topic_id: 'ahorro-economia' })
    const payload = item.payload as { sources: Record<string, string>[]; methodology: string; comparison: string; table: { rows: unknown[][] } }
    expect(payload.sources).toEqual([
      {
        title: 'Eurostat — IPCA anual: alimentos y bebidas no alcohólicas (prc_hicp_aind)',
        publisher: 'Eurostat (Oficina Estadística de la Unión Europea)',
        url: 'https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_aind/default/table?lang=en',
        date: '2026-02-06',
      },
    ])
    expect(payload.methodology).toContain(NOT_REPRESENTATIVE_NOTE)
    expect(payload.comparison).toBe(GOOD_ARTICLE.comparison)
    expect(payload.table.rows[1]).toEqual(['2022', 11.6, 11.9])
    expect(item.body).toContain('**Qué dicen los datos**')
    expect(item.body).toContain('Fuente: Eurostat')
    expect(item.body).toContain('06/02/2026')
  })
})

// =============================================================================================================================
describe('ejecución completa del lote semanal', () => {
  it('crea 3 consejos + 1 encuesta + 1 artículo como PROPUESTA con la semana del lote (lunes)', async () => {
    const s = setup()
    const report = await runWeekly(s.deps)
    expect(report).toMatchObject({ week: '2026-10-12', tips: 3, poll: true, article: 'proposed', created: 5 })
    const [args] = s.client.argsOf('community_service_create_proposals')
    expect(args.p_week).toBe('2026-10-12')
    const items = args.p_items as { kind: string }[]
    expect(items.map((i) => i.kind)).toEqual(['tip', 'tip', 'tip', 'poll', 'article'])
    expect(s.client.argsOf('community_service_record_ai').map((a) => a.p_purpose)).toEqual(['proposals', 'proposals'])
  })
  it('SOLO escribe propuestas: ninguna otra escritura (nada se publica ni se aprueba)', async () => {
    const s = setup()
    await runWeekly(s.deps)
    const used = new Set(s.client.calls.map((c) => c.fn))
    expect([...used].sort()).toEqual(['community_service_ai_allowed', 'community_service_create_proposals', 'community_service_record_ai'])
    expect(s.client.inserted).toEqual([])
    expect(used.has('community_admin_approve_proposal')).toBe(false)
  })
  it('si Eurostat falla: SIN artículo, pero los consejos y la encuesta se proponen igualmente', async () => {
    const s = setup({ fetchFn: (async () => new Response('x', { status: 503 })) as unknown as typeof fetch })
    const report = await runWeekly(s.deps)
    expect(report).toMatchObject({ tips: 3, poll: true, article: 'no_external_data', created: 4 })
    expect(s.provider.requests).toHaveLength(1) // ni siquiera se pide el artículo a la IA
    const items = s.client.argsOf('community_service_create_proposals')[0].p_items as { kind: string }[]
    expect(items.some((i) => i.kind === 'article')).toBe(false)
  })
  it('si el artículo trae una cifra inventada: se descarta el artículo, el resto se propone', async () => {
    const s = setup({ articleResponse: articleJson({ body: GOOD_ARTICLE.body.replace('11,7 %', '17 %') }) })
    const report = await runWeekly(s.deps)
    expect(report.article).toBe('invalid_output')
    const items = s.client.argsOf('community_service_create_proposals')[0].p_items as { kind: string }[]
    expect(items.map((i) => i.kind)).toEqual(['tip', 'tip', 'tip', 'poll'])
    // la llamada del artículo queda contada como error
    expect(s.client.argsOf('community_service_record_ai').map((a) => a.p_error)).toEqual([false, true])
  })
  it('si la IA falla en los consejos, el artículo se propone igualmente (y viceversa)', async () => {
    const a = setup({ tipsResponse: providerError(503) })
    expect(await runWeekly(a.deps)).toMatchObject({ tips: 0, poll: false, article: 'proposed', created: 1 })
    const b = setup({ articleResponse: providerError(503) })
    expect(await runWeekly(b.deps)).toMatchObject({ tips: 3, article: 'ai_failed', created: 4 })
  })
  it('si no sale nada, no se llama a create_proposals', async () => {
    const s = setup({ tipsResponse: 'basura', articleResponse: 'basura' })
    const report = await runWeekly(s.deps)
    expect(report.created).toBe(0)
    expect(s.client.count('community_service_create_proposals')).toBe(0)
  })
  it('no duplica: si la semana ya tiene propuestas, no hace nada (ni IA ni Eurostat)', async () => {
    const s = setup({ existing: [{ id: 'x', batch_week: '2026-10-12' }] })
    const report = await runWeekly(s.deps)
    expect(report.skipped).toBe('already_proposed')
    expect(s.provider.requests).toHaveLength(0)
    expect(s.fetchFn).not.toHaveBeenCalled()
  })
  it('si no se puede comprobar si ya hay propuestas, no arriesga duplicados', async () => {
    const s = setup()
    s.client.from = () => {
      throw new Error('sin acceso')
    }
    expect((await runWeekly(s.deps)).skipped).toBe('check_failed')
  })
  it('con el tope diario de IA alcanzado no hace nada', async () => {
    const s = setup({ rpc: allowAi(false) })
    expect((await runWeekly(s.deps)).skipped).toBe('ai_not_allowed')
    expect(s.provider.requests).toHaveLength(0)
    expect(s.fetchFn).not.toHaveBeenCalled()
  })
  it('IA apagada: no hace nada', async () => {
    expect((await runWeekly(setup({ aiNull: true }).deps)).skipped).toBe('ai_unavailable')
  })
  it('un error al guardar no lanza ni dice que se creó algo', async () => {
    const s = setup({ rpc: { community_service_create_proposals: () => new RpcFailure('x') } })
    expect((await runWeekly(s.deps)).created).toBe(0)
  })
  it('nunca usa ai_gate', async () => {
    const s = setup()
    await runWeekly(s.deps)
    expect(s.client.calls.map((c) => c.fn)).not.toContain('ai_gate')
  })
})

describe('autenticación del cron semanal', () => {
  it('sin el secreto correcto: 401 y no se hace nada', async () => {
    const s = setup()
    expect((await handleWeekly(cronRequest(null), s.deps)).status).toBe(401)
    expect((await handleWeekly(cronRequest('mal'), s.deps)).status).toBe(401)
    expect(s.provider.requests).toHaveLength(0)
    expect(s.fetchFn).not.toHaveBeenCalled()
    expect(s.client.count('community_service_create_proposals')).toBe(0)
  })
  it('con el secreto: 200 y el informe', async () => {
    const res = await handleWeekly(cronRequest(SECRET), setup().deps)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, created: 5 })
  })
})

describe('catálogo de temas', () => {
  it('tiene los 14 temas del catálogo de Comunidad', () => {
    expect(TOPIC_IDS).toHaveLength(14)
  })
})
