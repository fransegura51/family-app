import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/data/bank', () => ({ listBankConnections: vi.fn() }))
vi.mock('@/data/family', () => ({ getFinanceMonthStartDay: vi.fn(), listFamilyMembers: vi.fn() }))
vi.mock('@/data/finance', () => ({ listBudgetCategories: vi.fn(), listExpenses: vi.fn() }))
vi.mock('@/data/products', () => ({ listAllProductPrices: vi.fn(), listProducts: vi.fn() }))
vi.mock('@/data/receipts', () => ({ listReceipts: vi.fn() }))
vi.mock('@/data/shoppingStores', () => ({ listShoppingStores: vi.fn() }))
vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))

import { TODAY, financeData } from '@/domain/financeTestData'
import { forgetFinanceContext, handleFinanceText } from '@/pepa/finance'
import { createPepaOutput, type ResponseMode, type SpeechEngine } from '@/pepa/output'
import { runTalk, type TalkDeps } from '@/pepa/talk'
import { primeSpeech, speakAsync } from '@/services/voice'

const SHOPPING_ANSWER = 'En la lista de la compra de Mercadona hay: leche y pan.'

function makeTalkDeps(): TalkDeps {
  return {
    today: () => TODAY,
    kitchen: vi.fn().mockResolvedValue(null),
    finance: (text) => handleFinanceText(text, TODAY, { canAccess: async () => true, load: async () => financeData(), ai: async () => null, record: () => {} }),
    forgetFinance: forgetFinanceContext,
    storeNames: async () => ['Mercadona'],
    members: async () => [],
    answerCalendar: async () => 'No hay nada en el calendario.',
    answerShopping: async () => SHOPPING_ANSWER,
    classifyWithAi: async () => ({ intent: 'none', explicitDate: null, when: 'today', memberHint: null, storeHint: null, nowOnly: false }),
    answerFromAi: async () => null,
    splitWithAi: async () => [],
  }
}

// Lo mismo que hace la app: una respuesta final del turno de "Hablar" sale por la capa única.
function makeSession(initial: ResponseMode, supported = true) {
  let mode = initial
  const shown: string[] = []
  const spoken: string[] = []
  const engine: SpeechEngine = { supported: () => supported, speak: vi.fn(async (t: string) => void spoken.push(t)), prime: vi.fn() }
  const output = createPepaOutput({ getMode: () => mode, show: (t) => void shown.push(t), engine })
  const deps = makeTalkDeps()
  return {
    output,
    engine,
    shown,
    spoken,
    setMode: (m: ResponseMode) => (mode = m),
    async turn(text: string) {
      const outcome = await runTalk(text, deps)
      await output.say(outcome.text)
      return outcome.text
    },
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
  forgetFinanceContext()
})
afterEach(() => vi.useRealTimers())

describe.each([
  ['Compras', '¿Qué hay en la lista de la compra de Mercadona?', /leche y pan/],
  ['Economía (cifra)', '¿Cuánto hemos gastado este mes?', /€/],
  ['Economía (análisis breve)', '¿Qué podríamos hacer para ahorrar un poco más?', /margen/],
])('%s', (_name, phrase, expected) => {
  it('Hablando: muestra el texto Y lo lee, con el mismo texto', async () => {
    const s = makeSession('voice')
    const text = await s.turn(phrase)
    expect(text).toMatch(expected)
    expect(s.shown).toEqual([text])
    expect(s.spoken).toEqual([text])
  })

  it('Por escrito: solo muestra el texto, no lee nada', async () => {
    const s = makeSession('text')
    const text = await s.turn(phrase)
    expect(s.shown).toEqual([text])
    expect(s.spoken).toEqual([])
    expect(s.engine.speak).not.toHaveBeenCalled()
  })
})

describe('continuación contextual', () => {
  it('"¿Por qué?" tras una respuesta de Economía también se lee (Hablando) y solo se muestra (Por escrito)', async () => {
    const voice = makeSession('voice')
    const first = await voice.turn('¿Qué podríamos hacer para ahorrar un poco más?')
    const why = await voice.turn('¿Por qué?')
    expect(why).toMatch(/^Porque/)
    expect(voice.spoken).toEqual([first, why])
    expect(voice.shown).toEqual([first, why])

    forgetFinanceContext()
    const written = makeSession('text')
    await written.turn('¿Qué podríamos hacer para ahorrar un poco más?')
    const whyWritten = await written.turn('¿Por qué?')
    expect(whyWritten).toMatch(/^Porque/)
    expect(written.shown).toHaveLength(2)
    expect(written.spoken).toEqual([])
  })

  it('Compras y Economía en la misma conversación pasan las dos por la misma capa', async () => {
    const s = makeSession('voice')
    const a = await s.turn('¿Cuánto hemos gastado este mes?')
    const b = await s.turn('¿Qué hay en la lista de la compra de Mercadona?')
    const c = await s.turn('¿Y cuánto hemos gastado este mes?')
    expect(s.spoken).toEqual([a, b, c])
  })
})

describe('el modo se lee al contestar, no al abrir', () => {
  it('cambiar a Hablando con la escucha ya en marcha se respeta', async () => {
    const s = makeSession('text')
    await s.turn('¿Cuánto hemos gastado este mes?')
    expect(s.spoken).toHaveLength(0)
    s.setMode('voice')
    const later = await s.turn('¿Cuánto hemos gastado este mes?')
    expect(s.spoken).toEqual([later])
    s.setMode('text')
    await s.turn('¿Cuánto hemos gastado este mes?')
    expect(s.spoken).toHaveLength(1)
  })

  it('las respuestas dentro de una tarjeta (solo voz) siguen el mismo modo', async () => {
    const s = makeSession('voice')
    await s.output.speakOnly('Listo, con Mercadona.')
    expect(s.spoken).toEqual(['Listo, con Mercadona.'])
    expect(s.shown).toEqual([])
    s.setMode('text')
    await s.output.speakOnly('Otra')
    expect(s.spoken).toEqual(['Listo, con Mercadona.'])
  })

  it('sin voz en el navegador o con un texto vacío no se intenta hablar, pero el texto se muestra', async () => {
    const s = makeSession('voice', false)
    await s.turn('¿Cuánto hemos gastado este mes?')
    expect(s.shown).toHaveLength(1)
    expect(s.engine.speak).not.toHaveBeenCalled()
    const t = makeSession('voice')
    await t.output.say('   ')
    expect(t.engine.speak).not.toHaveBeenCalled()
  })

  it('desbloquear la voz (iOS) solo se hace en modo Hablando', () => {
    const v = makeSession('voice')
    v.output.prime()
    expect(v.engine.prime).toHaveBeenCalledTimes(1)
    const t = makeSession('text')
    t.output.prime()
    expect(t.engine.prime).not.toHaveBeenCalled()
  })
})

describe('motor de voz (services/voice)', () => {
  class FakeUtterance {
    onend: (() => void) | null = null
    onerror: (() => void) | null = null
    lang = ''
    volume = 1
    constructor(public text: string) {}
  }
  let synth: { speaking: boolean; pending: boolean; paused: boolean; speak: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn>; resume: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    vi.useRealTimers()
    vi.useFakeTimers()
    synth = { speaking: false, pending: false, paused: false, speak: vi.fn(), cancel: vi.fn(), resume: vi.fn() }
    vi.stubGlobal('window', { speechSynthesis: synth })
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('habla en español, sin cancelar nada si no suena nada, y termina cuando acaba', async () => {
    const done = vi.fn()
    const p = speakAsync('Hola').then(done)
    expect(synth.cancel).not.toHaveBeenCalled()
    const u = synth.speak.mock.calls[0][0] as FakeUtterance
    expect(u.text).toBe('Hola')
    expect(u.lang).toBe('es-ES')
    expect(done).not.toHaveBeenCalled()
    u.onend?.()
    await p
    expect(done).toHaveBeenCalled()
  })

  it('si suena otra cosa, la corta y espera un momento antes de hablar (iOS descarta cancel+speak seguidos)', async () => {
    synth.speaking = true
    const p = speakAsync('Nueva')
    expect(synth.cancel).toHaveBeenCalledTimes(1)
    expect(synth.speak).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(100)
    expect(synth.speak).toHaveBeenCalledTimes(1)
    ;(synth.speak.mock.calls[0][0] as FakeUtterance).onerror?.()
    await p
  })

  it('reanuda una síntesis en pausa', async () => {
    synth.paused = true
    const p = speakAsync('Hola')
    expect(synth.resume).toHaveBeenCalled()
    ;(synth.speak.mock.calls[0][0] as FakeUtterance).onend?.()
    await p
  })

  it('nunca se queda colgada: si el navegador no avisa del final, termina sola', async () => {
    const done = vi.fn()
    void speakAsync('Frase de prueba').then(done)
    await vi.advanceTimersByTimeAsync(2000)
    expect(done).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(10000)
    expect(done).toHaveBeenCalled()
  })

  it('desbloqueo: un enunciado vacío y mudo, y solo si no suena nada', () => {
    primeSpeech()
    const u = synth.speak.mock.calls[0][0] as FakeUtterance
    expect(u.text).toBe('')
    expect(u.volume).toBe(0)
    synth.speaking = true
    primeSpeech()
    expect(synth.speak).toHaveBeenCalledTimes(1)
  })
})

// Código fuente de la app (sin tests), leído como texto.
const SOURCES = import.meta.glob(['/src/**/*.ts', '/src/**/*.tsx', '!/src/**/*.test.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>

describe('arquitectura: una sola salida de voz', () => {
  it('solo el motor de voz toca speechSynthesis', () => {
    const offenders = Object.entries(SOURCES)
      .filter(([file, text]) => /speechSynthesis|SpeechSynthesisUtterance/.test(text) && !file.endsWith('/src/services/voice.ts'))
      .map(([file]) => file)
    expect(offenders).toEqual([])
  })

  it('la pantalla de voz solo habla a través de la capa de salida (el motor se pasa a createPepaOutput y no hay más llamadas)', () => {
    const src = SOURCES['/src/ui/VoiceCapture.tsx']
    expect(src.match(/speakAsync/g)).toHaveLength(2)
    expect(src).toContain('createPepaOutput')
    expect(src).not.toMatch(/mode === 'voice' && isSpeechSupported/)
  })
})
