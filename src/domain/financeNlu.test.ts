import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { answerFinanceQuery } from './financeCompute'
import { filterCandidate, parseFinanceQuestion, type FinanceQuery } from './financeQuery'
import { CATEGORIES, EXPENSES, SUPER, TODAY, cat, exp, financeData } from './financeTestData'
import { stripWakeWord } from './voiceQuery'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(TODAY)
})
afterEach(() => vi.useRealTimers())

// Lo que llega a Economía en el móvil: la frase pasa primero por stripWakeWord (VoiceCapture) y luego por el analizador.
function parse(text: string) {
  return parseFinanceQuestion(stripWakeWord(text), TODAY)
}
function query(text: string): FinanceQuery {
  const p = parse(text)
  if (!p || p.kind !== 'query') throw new Error(`no es una consulta: ${text} -> ${JSON.stringify(p)}`)
  return p.query
}

const ANALYSIS_PHRASES = [
  'Pepa, analiza nuestros gastos de este mes.',
  'Pepa analiza nuestros gastos de este mes',
  'analiza nuestros gastos este mes',
  'Analízame los gastos de este mes',
  'Oye Pepa, ¿puedes analizar nuestros gastos de este mes?',
  'Quiero que analices los gastos de este mes',
  'Hazme un análisis de nuestros gastos de este mes',
  'Necesito un análisis de la economía de este mes',
  'Pepa, dame un resumen de nuestros gastos de este mes',
  'Explícame nuestra economía de este mes',
  'Dame tus conclusiones de Economía de este mes',
]
const SPEND_PHRASES = [
  'Dime lo que gasté el mes pasado en luz.',
  'Pepa, dime lo que gasté el mes pasado en luz',
  '¿Cuánto gastamos en luz el mes pasado?',
  'Cuánto hemos gastado de luz el mes pasado',
  'Quiero saber cuánto gastamos el mes pasado en la luz',
  'Lo que llevamos gastado en luz el mes pasado',
  '¿Cuánto hemos pagado de luz el mes pasado?',
  'Pepa, ¿me puedes decir cuánto gastamos el mes pasado en luz por favor?',
]

const THIS_MONTH = { t: 'month', offset: 0 }
const LAST_MONTH = { t: 'month', offset: -1 }

describe('intención primero: distintas formas de pedir un ANÁLISIS', () => {
  it.each(ANALYSIS_PHRASES)('%s -> análisis del mes, SIN filtro de categoría', (phrase) => {
    const q = query(phrase)
    expect(q.metric).toBe('analyze')
    expect(q.period).toEqual(THIS_MONTH)
    expect(q.target).toBeNull()
  })
})

describe('intención primero: distintas formas de pedir un GASTO con filtro', () => {
  it.each(SPEND_PHRASES)('%s -> gasto, mes pasado, filtro "luz" (nada más)', (phrase) => {
    const q = query(phrase)
    expect(q.metric).toBe('spent')
    expect(q.period).toEqual(LAST_MONTH)
    expect(q.target).toBe('luz')
  })

  it('el filtro nunca arrastra verbos, relleno ni expresiones de tiempo', () => {
    for (const phrase of [...SPEND_PHRASES, ...ANALYSIS_PHRASES]) {
      const target = query(phrase).target
      if (target !== null) expect(target, phrase).not.toMatch(/gast|dime|analiz|mes|este|pasado|pagad|quiero|saber|cuanto|puedes|lo que|nuestr/)
    }
  })

  it('sin filtro dicho no hay filtro ("en total" tampoco es un filtro)', () => {
    expect(query('¿Cuánto hemos gastado este mes?').target).toBeNull()
    expect(query('Dime cuánto hemos gastado en total este mes').target).toBeNull()
    expect(query('Pepa, cuánto llevamos gastado este año').target).toBeNull()
  })

  it('varias palabras con contenido: se conservan juntas', () => {
    expect(query('¿Cuánto gastamos en material escolar este mes?').target).toBe('material escolar')
    expect(query('Dime cuánto gastamos en Mercadona el mes pasado').target).toBe('mercadona')
  })

  it('demasiadas palabras sueltas: no es un candidato, es una frase que las reglas no ubican', () => {
    const p = parse('Cuánto gastamos el mes pasado en la cosa aquella tan rara de la que hablamos con la abuela ayer por la tarde')
    expect(p).toMatchObject({ kind: 'query', uncertain: true })
    expect((p as { query: FinanceQuery }).query.target).toBeNull()
  })
})

describe('el candidato son solo palabras con contenido', () => {
  it.each([
    ['lo que gaste en luz', 'luz'],
    ['analiza nuestros gastos de', null],
    ['nuestros gastos de la casa', null],
    ['en restaurantes de la familia', 'restaurantes'],
    ['me puedes decir cuanto en gasolina', 'gasolina'],
    ['de la peluqueria', 'peluqueria'],
  ])('%s -> %s', (rest, expected) => {
    expect(filterCandidate(rest).candidate).toBe(expected)
  })
})

describe('resolución contra los datos REALES (categoría, tienda, concepto)', () => {
  const data = () =>
    financeData({
      categories: [...CATEGORIES, cat('l1', 'Luz', 'c5', { necessity: 'debo', isFixed: true }), cat('s1', 'Suministros del hogar', 'c5')],
      expenses: [
        ...EXPENSES,
        exp('2026-08-12', 62.4, 'Luz', { notes: 'RECIBO IBERDROLA CLIENTES LUZ' }),
        exp('2026-08-15', 31.1, 'Suministros del hogar', { notes: 'RECIBO AGUA EMASESA' }),
        exp('2026-09-10', 70.25, 'Luz'),
      ],
    })
  const ask = (text: string) => {
    const q = query(text)
    return answerFinanceQuery(q, data(), TODAY).text
  }

  it('"lo que gasté el mes pasado en luz" resuelve la categoría real "Luz"', () => {
    for (const phrase of ['Dime lo que gasté el mes pasado en luz.', 'Pepa, cuánto gastamos en luz el mes pasado', 'Quiero saber cuánto gastamos el mes pasado en la luz']) {
      expect(ask(phrase), phrase).toBe('El mes pasado habéis gastado 62,40 € en Luz.')
    }
  })

  it('un concepto que no es categoría se busca en el texto del movimiento ("agua")', () => {
    const text = ask('Dime lo que gasté el mes pasado en agua')
    expect(text).toContain('31,10 €')
    expect(text).toContain('movimientos cuya categoría, comercio o concepto lo mencionan')
  })

  it('lo que no existe en los datos se dice con SU nombre, no con la frase entera', () => {
    const text = ask('Dime lo que gasté el mes pasado en gasolina')
    expect(text).toBe('No encuentro ninguna categoría, tienda ni concepto llamado «gasolina» en tus datos, así que no lo calculo.')
  })

  it('el análisis nunca pasa por el resolvedor de categorías', () => {
    const q = query('Pepa, analiza nuestros gastos de este mes.')
    expect(q.target).toBeNull()
    const text = answerFinanceQuery(q, data(), TODAY).text
    expect(text).not.toContain('No encuentro')
  })

  it('una tienda real sigue siendo una tienda', () => {
    expect(ask('Dime cuánto gastamos en Mercadona el mes pasado')).toContain('en Mercadona')
  })

  it('una categoría de nombre largo se encuentra con una sola palabra', () => {
    expect(ask('¿Cuánto hemos gastado en restaurantes este mes?')).toContain('Restaurantes, bares y cafeterías')
    expect(SUPER).toContain('Supermercado')
  })
})

describe('sin regresiones con las frases de siempre', () => {
  it('consultas de fases anteriores', () => {
    expect(query('¿Cuánto hemos gastado en comida desde junio?')).toMatchObject({ metric: 'spent', target: 'comida' })
    expect(query('¿En qué hemos gastado más este mes?').metric).toBe('top_categories')
    expect(query('¿Hemos gastado más que el mes pasado?').metric).toBe('compare')
    expect(query('¿Por qué hemos gastado más este mes?').metric).toBe('why_changed')
    expect(query('¿Qué productos han subido más de precio?').metric).toBe('price_up')
    expect(query('¿Dónde compramos más barato el queso?')).toMatchObject({ metric: 'cheapest_store', product: 'queso' })
    expect(query('¿Qué podríamos recortar?').metric).toBe('cuts')
    expect(query('¿Estamos ahorrando más o menos?').metric).toBe('savings_trend')
  })
  it('lo que no es de Economía no lo es', () => {
    for (const t of ['Añade leche, huevos y pan a Mercadona', '¿Qué tenemos mañana?', 'Recuérdame llevar dinero al cole el viernes', 'Apunta pagar la factura de la luz el lunes', 'Pon tortilla para cenar el viernes']) {
      expect(parse(t), t).toBeNull()
    }
  })
})
