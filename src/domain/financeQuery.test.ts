import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseFinanceFollowUp, parseFinanceQuestion, type FinanceQuery } from './financeQuery'

const TODAY = new Date(2026, 8, 20)
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(TODAY)
})
afterEach(() => vi.useRealTimers())

function query(text: string): FinanceQuery {
  const p = parseFinanceQuestion(text, TODAY)
  if (!p || p.kind !== 'query') throw new Error(`no es una consulta: ${text} -> ${JSON.stringify(p)}`)
  return p.query
}

describe('las consultas del primer bloque', () => {
  it('1-2: gasto este mes / el mes pasado', () => {
    expect(query('¿Cuánto hemos gastado este mes?')).toMatchObject({ metric: 'spent', period: { t: 'month', offset: 0 }, target: null })
    expect(query('¿Cuánto gastamos el mes pasado?')).toMatchObject({ metric: 'spent', period: { t: 'month', offset: -1 } })
  })
  it('3: ingresos', () => {
    expect(query('¿Cuánto hemos ingresado este mes?')).toMatchObject({ metric: 'income', period: { t: 'month', offset: 0 } })
  })
  it('4: ahorro', () => {
    expect(query('¿Cuánto hemos ahorrado este mes?')).toMatchObject({ metric: 'saved' })
    expect(query('¿Cuánto hemos ahorrado?')).toMatchObject({ metric: 'saved', period: null })
  })
  it('5: en qué se gasta más', () => {
    expect(query('¿En qué hemos gastado más este mes?')).toMatchObject({ metric: 'top_categories', period: { t: 'month', offset: 0 } })
  })
  it('6-7: por categoría real', () => {
    expect(query('¿Cuánto hemos gastado en alimentación este mes?')).toMatchObject({ metric: 'spent', target: 'alimentacion' })
    expect(query('¿Cuánto hemos gastado en restaurantes este mes?')).toMatchObject({ metric: 'spent', target: 'restaurantes' })
  })
  it('8: comparar con el mes pasado', () => {
    expect(query('¿Hemos gastado más que el mes pasado?')).toMatchObject({ metric: 'compare' })
    expect(query('¿Estamos gastando más que el mes pasado?')).toMatchObject({ metric: 'compare' })
    expect(query('compara septiembre completo con agosto completo gastos').full).toBe(true)
  })
  it('9: por qué hemos gastado más', () => {
    expect(query('¿Por qué hemos gastado más este mes?')).toMatchObject({ metric: 'why_changed' })
    expect(query('¿Por qué ha cambiado mi gasto?')).toMatchObject({ metric: 'why_changed' })
  })
  it('10-11: productos que suben o bajan', () => {
    expect(query('¿Qué productos han subido más de precio?').metric).toBe('price_up')
    expect(query('¿Qué productos han bajado de precio?').metric).toBe('price_down')
  })
  it('12: dónde es más barato un producto', () => {
    expect(query('¿Dónde compramos más barato el queso?')).toMatchObject({ metric: 'cheapest_store', product: 'queso' })
    expect(query('¿En qué tienda es más barata la leche entera?')).toMatchObject({ metric: 'cheapest_store', product: 'leche entera' })
  })
  it('13: comida desde junio', () => {
    expect(query('¿Cuánto hemos gastado en comida desde junio?')).toMatchObject({ metric: 'spent', target: 'comida', period: { t: 'since_month', month0: 5, year: 2026 } })
  })
  it('14: en una tienda', () => {
    expect(query('¿Cuánto gastamos en Mercadona este mes?')).toMatchObject({ metric: 'spent', target: 'mercadona' })
  })
  it('15: supermercados este año', () => {
    expect(query('¿Cuánto hemos gastado en supermercados este año?')).toMatchObject({ metric: 'spent', target: 'supermercados', period: { t: 'year', offset: 0 } })
  })
  it('un mes concreto', () => {
    expect(query('¿Cuánto gastamos en agosto?')).toMatchObject({ metric: 'spent', period: { t: 'month_named', month0: 7, year: 2026 }, target: null })
  })
  it('en total no es una categoría', () => {
    expect(query('¿Cuánto hemos gastado en total este mes?').target).toBeNull()
  })
})

describe('Economía es solo de consulta', () => {
  it('borrar, cambiar y crear se rechazan (no son consultas)', () => {
    for (const t of [
      'Borra el gasto de Mercadona.',
      'Cambia el gasto de ayer a Restauración.',
      'Pon un presupuesto de 500 €.',
      'Añade un gasto de 20 euros',
      'Apunta un ingreso de 1000 euros',
      'Elimina el movimiento de ayer',
      'Cambia la categoría de este gasto',
    ]) {
      expect(parseFinanceQuestion(t, TODAY), t).toEqual({ kind: 'write-refused' })
    }
  })
  it('las frases de Compras/Calendario/Cocina NO son de Economía', () => {
    for (const t of [
      'Añade leche, huevos y pan a Mercadona',
      '¿Qué tenemos mañana en el calendario?',
      'Pon tortilla para cenar el viernes',
      'Quiero hacer una paella para seis',
      '¿Qué hay en la lista de la compra de Mercadona?',
      'Añadir',
      'Sí',
      'Guardar',
    ]) {
      expect(parseFinanceQuestion(t, TODAY), t).toBeNull()
    }
  })
  it('presupuestos y saldos: consulta todavía no soportada, no inventada', () => {
    expect(parseFinanceQuestion('¿Cuánto presupuesto me queda?', TODAY)).toEqual({ kind: 'unsupported', what: 'budgets' })
    expect(parseFinanceQuestion('¿Cuál es el saldo de la cuenta?', TODAY)).toEqual({ kind: 'unsupported', what: 'balances' })
  })
})

describe('continuaciones con contexto', () => {
  const spentThisMonth: FinanceQuery = { metric: 'spent', period: { t: 'month', offset: 0 }, target: null, product: null, full: false }

  it('"¿En qué?" pide el desglose del MISMO periodo', () => {
    for (const t of ['¿En qué?', 'Desglósamelo', 'desglose', '¿Y en qué?', 'En qué hemos gastado']) {
      expect(parseFinanceFollowUp(t, spentThisMonth, TODAY), t).toMatchObject({ metric: 'top_categories', period: { t: 'month', offset: 0 } })
    }
  })
  it('"¿Y el mes pasado?" cambia solo el periodo', () => {
    expect(parseFinanceFollowUp('¿Y el mes pasado?', spentThisMonth, TODAY)).toMatchObject({ metric: 'spent', period: { t: 'month', offset: -1 } })
    expect(parseFinanceFollowUp('¿Y en agosto?', spentThisMonth, TODAY)).toMatchObject({ metric: 'spent', period: { t: 'month_named', month0: 7 } })
  })
  it('"¿Solo alimentación?" y "¿Y Mercadona?" cambian solo el filtro', () => {
    expect(parseFinanceFollowUp('¿Solo alimentación?', spentThisMonth, TODAY)).toMatchObject({ metric: 'spent', target: 'alimentacion', period: { t: 'month', offset: 0 } })
    expect(parseFinanceFollowUp('¿Y Mercadona?', spentThisMonth, TODAY)).toMatchObject({ metric: 'spent', target: 'mercadona' })
  })
  it('tras un desglose, "solo alimentación" vuelve al total de esa categoría', () => {
    const breakdown = { ...spentThisMonth, metric: 'top_categories' as const }
    expect(parseFinanceFollowUp('¿Solo alimentación?', breakdown, TODAY)).toMatchObject({ metric: 'spent', target: 'alimentacion' })
  })
  it('lo que no es una continuación no lo es', () => {
    for (const t of ['Añade leche a Mercadona', '¿Qué tenemos mañana?', 'Sí', 'Guardar']) {
      expect(parseFinanceFollowUp(t, spentThisMonth, TODAY), t).toBeNull()
    }
  })
})
