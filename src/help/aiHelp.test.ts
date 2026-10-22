// Búsqueda con IA de la Ayuda: función de servidor (solo elige fichas verificadas), tope de consumo y cliente con límites. Sin red ni IA real: todo con simulaciones.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HELP_SEARCH_DAILY_CAP, helpSearchSpec } from '../../supabase/functions/_shared/ai/purposes/helpSearch.ts'
import { HELP_AI_MIN_INTERVAL_MS, HELP_AI_SESSION_CAP, rankHelpWithAi, resetHelpAiForTests, type HelpAiDeps } from '@/help/aiClient'
import { HELP_AI_ENABLED } from '@/help/ai'

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
const POOL = [
  { id: 'cal-crear-evento', title: 'Crear un evento en el calendario' },
  { id: 'com-anadir-producto', title: 'Añadir un producto a la lista de la compra' },
  { id: 'cue-borrar-cuenta', title: 'Borrar mi cuenta' },
]

describe('servidor: el propósito «help-search» solo ELIGE entre fichas verificadas', () => {
  it('valida la entrada: pregunta obligatoria y acotada, fichas con identificador y título válidos, sin duplicados', () => {
    const ok = helpSearchSpec.readInput({ query: ' cómo apunto una cita ', candidates: [...POOL, POOL[0]], recent: ['a', 'b', 'c', 'd'] })
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.input.query).toBe('cómo apunto una cita')
      expect(ok.input.candidates).toHaveLength(3) // sin el duplicado
      expect(ok.input.recent).toEqual(['b', 'c', 'd']) // solo las tres últimas
    }
    for (const bad of [
      { candidates: POOL },
      { query: '', candidates: POOL },
      { query: 'x'.repeat(301), candidates: POOL },
      { query: 'hola', candidates: [] },
      { query: 'hola', candidates: 'no' },
      { query: 'hola', candidates: Array.from({ length: 141 }, (_, i) => ({ id: `ficha-${String(i).padStart(3, '0')}`, title: 't' })) },
      { query: 'hola', candidates: [{ id: 'MAL ID', title: 't' }] },
      { query: 'hola', candidates: [{ id: 'cal-crear-evento', title: '' }] },
      { query: 'hola', candidates: [{ id: 'cal-crear-evento', title: 'x'.repeat(121) }] },
    ]) {
      expect(helpSearchSpec.readInput(bad as Record<string, unknown>).ok, JSON.stringify(bad).slice(0, 60)).toBe(false)
    }
  })

  it('el prompt solo lleva la pregunta, el hilo reciente y la lista de fichas, y ordena NO inventar nada', () => {
    const r = helpSearchSpec.readInput({ query: 'dar de baja mi usuario', candidates: POOL, recent: ['hola'] })
    if (!r.ok) throw new Error('entrada inválida')
    const text = (helpSearchSpec.buildParts(r.input)[0] as { text: string }).text
    expect(text).toContain('dar de baja mi usuario')
    for (const c of POOL) expect(text).toContain(`${c.id}: ${c.title}`)
    expect(text).toMatch(/NO escribas respuestas, NO inventes fichas/)
    expect(text).toContain('SOLO identificadores que aparezcan en la lista')
    expect(Object.keys(r.input).sort()).toEqual(['candidates', 'query', 'recent'])
  })

  it('la respuesta se valida de forma estricta: solo identificadores de la lista, sin repetidos, máximo 3; lo demás se descarta', () => {
    const r = helpSearchSpec.readInput({ query: 'x', candidates: POOL, recent: [] })
    if (!r.ok) throw new Error('entrada inválida')
    const parse = (raw: string) => helpSearchSpec.parseOutput(raw, r.input).ids
    expect(parse('{"ids": ["cue-borrar-cuenta"]}')).toEqual(['cue-borrar-cuenta'])
    expect(parse('```json\n{"ids": ["cal-crear-evento", "cal-crear-evento", "com-anadir-producto"]}\n```')).toEqual(['cal-crear-evento', 'com-anadir-producto'])
    // Inventados, de otro tipo o con texto libre: fuera.
    expect(parse('{"ids": ["ficha-inventada", 5, null, "cue-borrar-cuenta"]}')).toEqual(['cue-borrar-cuenta'])
    expect(parse('{"ids": ["el botón rojo de ajustes"]}')).toEqual([])
    expect(parse('{"respuesta": "Pulsa el botón mágico"}')).toEqual([])
    expect(parse('no es JSON')).toEqual([])
    expect(parse('{"ids": ["a","b","c"]}')).toEqual([])
    const many = { query: 'x', candidates: Array.from({ length: 6 }, (_, i) => ({ id: `ficha-${i}x`, title: `T${i}` })), recent: [] }
    const rr = helpSearchSpec.readInput(many)
    if (!rr.ok) throw new Error('entrada inválida')
    expect(helpSearchSpec.parseOutput(JSON.stringify({ ids: many.candidates.map((c) => c.id) }), rr.input).ids).toHaveLength(3)
  })

  it('la salida nunca contiene texto libre del modelo: el tipo de salida solo tiene identificadores', () => {
    const r = helpSearchSpec.readInput({ query: 'x', candidates: POOL, recent: [] })
    if (!r.ok) throw new Error('entrada inválida')
    expect(Object.keys(helpSearchSpec.parseOutput('{"ids":["cal-crear-evento"],"texto":"hola"}', r.input))).toEqual(['ids'])
  })
})

describe('servidor: consumo controlado', () => {
  it('tiene un tope diario propio del propósito y la pasarela lo aplica (y no llama a la IA si no puede leer el contador)', () => {
    expect(helpSearchSpec.purposeDailyCap).toBe(HELP_SEARCH_DAILY_CAP)
    expect(HELP_SEARCH_DAILY_CAP).toBeLessThanOrEqual(60)
    const gw = read('supabase/functions/_shared/ai/gateway.ts')
    expect(gw).toContain('spec.purposeDailyCap')
    expect(gw).toContain('purpose_daily_cap')
    expect(gw).toContain('usage_unavailable')
    expect(gw.indexOf('spec.purposeDailyCap')).toBeLessThan(gw.indexOf('get_app_secret')) // antes de pedir la clave y llamar al proveedor
    expect(read('supabase/functions/_shared/ai/types.ts')).toContain('purposeDailyCap?: number') // opcional: el resto de propósitos no cambian
  })
  it('la función de servidor usa la pasarela común (sesión, cuenta adulta, interruptores, tope general y registro de uso) y no guarda nada', () => {
    const fn = read('supabase/functions/help-search/index.ts')
    expect(fn).toContain('serveAiPurpose(helpSearchSpec)')
    expect(read('supabase/functions/_shared/ai/purposes/helpSearch.ts')).not.toMatch(/\.from\(|insert\(|upsert\(/)
  })
  it('está APAGADA en la web mientras no se despliegue (interruptor de compilación)', () => {
    expect(HELP_AI_ENABLED).toBe(false)
  })
})

describe('cliente: límites y protección frente a llamadas repetidas', () => {
  let t = 1_000_000
  const calls: { name: string; body: Record<string, unknown> }[] = []
  let reply: unknown = { ids: ['cal-crear-evento'] }
  const deps: HelpAiDeps = {
    call: vi.fn(async (name, body) => {
      calls.push({ name, body })
      if (reply instanceof Error) throw reply
      return reply
    }),
    aliasize: async (s) => s.replace(/Eric/g, 'Persona A'),
    now: () => t,
  }
  beforeEach(() => {
    resetHelpAiForTests()
    calls.length = 0
    reply = { ids: ['cal-crear-evento'] }
    t = 1_000_000
  })

  it('manda solo pregunta (con alias), fichas (id + título) e hilo reciente a la función help-search', async () => {
    const ids = await rankHelpWithAi('apuntar cita de Eric', POOL, ['antes', 'después'], deps)
    expect(ids).toEqual(['cal-crear-evento'])
    expect(calls).toHaveLength(1)
    expect(calls[0].name).toBe('help-search')
    expect(Object.keys(calls[0].body).sort()).toEqual(['candidates', 'query', 'recent'])
    expect(calls[0].body.query).toBe('apuntar cita de Persona A')
    expect(calls[0].body.candidates).toEqual(POOL)
  })

  it('descarta cualquier identificador que no estuviera en la lista (la IA no puede inventar fichas)', async () => {
    reply = { ids: ['ficha-inventada', 'cue-borrar-cuenta', 7] }
    expect(await rankHelpWithAi('baja', POOL, [], deps)).toEqual(['cue-borrar-cuenta'])
  })

  it('la misma pregunta no vuelve a llamar (se reutiliza la respuesta de la sesión)', async () => {
    await rankHelpWithAi('Cómo apunto una cita', POOL, [], deps)
    t += HELP_AI_MIN_INTERVAL_MS + 1
    expect(await rankHelpWithAi('como apunto una cita!', POOL, [], deps)).toEqual(['cal-crear-evento'])
    expect(calls).toHaveLength(1)
  })

  it('no más de una llamada cada 2,5 segundos', async () => {
    await rankHelpWithAi('primera pregunta', POOL, [], deps)
    t += 500
    expect(await rankHelpWithAi('segunda pregunta', POOL, [], deps)).toBeNull()
    expect(calls).toHaveLength(1)
    t += HELP_AI_MIN_INTERVAL_MS
    expect(await rankHelpWithAi('segunda pregunta', POOL, [], deps)).toEqual(['cal-crear-evento'])
    expect(calls).toHaveLength(2)
  })

  it(`tope de ${HELP_AI_SESSION_CAP} llamadas por sesión`, async () => {
    for (let i = 0; i < HELP_AI_SESSION_CAP + 5; i++) {
      t += HELP_AI_MIN_INTERVAL_MS + 1
      await rankHelpWithAi(`pregunta distinta número ${i}`, POOL, [], deps)
    }
    expect(calls).toHaveLength(HELP_AI_SESSION_CAP)
  })

  it('cualquier fallo (sin red, IA apagada, tope del servidor) devuelve null: la Ayuda sigue con la búsqueda local', async () => {
    reply = new Error('IA no disponible (purpose_daily_cap)')
    expect(await rankHelpWithAi('pregunta', POOL, [], deps)).toBeNull()
  })

  it('sin fichas o con la pregunta vacía no llama', async () => {
    expect(await rankHelpWithAi('hola', [], [], deps)).toBeNull()
    expect(await rankHelpWithAi('   ', POOL, [], deps)).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it('no lleva claves de datos de salud (la barrera de privacidad existente sigue delante)', () => {
    const src = read('src/help/aiClient.ts')
    expect(src).toContain("import('@/services/aiClient')") // pasa por callAiFunction, que aplica assertNoHealthData
  })
})
