import { describe, expect, it } from 'vitest'
import { draftFromRequest, isMoneyMoveRequest, parseAdjustAmount, parseBudgetRequest, parsePeriodReply, requestFromIntent } from '@/domain/financeBudget'
import { amountsIn, validAmount, validateBudgetIntentOutput, readBudgetIntentRequest } from '../../supabase/functions/_shared/ai/purposes/financeBudgetIntentCore.ts'

describe('importes dichos en la frase', () => {
  it.each([
    ['crea un presupuesto de 300 euros', [300]],
    ['1.500 al mes', [1500]],
    ['1.500,50 €', [1500.5]],
    ['250,5 euros', [250.5]],
    ['300€', [300]],
    ['trescientos euros', [300]],
    ['doscientos cincuenta euros', [250]],
    ['dos mil quinientos', [2500]],
    ['2 mil', [2000]],
    ['treinta y cinco euros', [35]],
    ['cien euros', [100]],
    ['mil euros', [1000]],
    ['ciento veinte euros', [120]],
    ['un presupuesto', []],
    ['300 o 400', [300, 400]],
  ])('%s', (text, expected) => expect(amountsIn(text)).toEqual(expected))

  it('validAmount: mayor que cero, con dos decimales y un tope', () => {
    expect([300, 0.5, 1234.56].every(validAmount)).toBe(true)
    expect([0, -5, NaN, Infinity, 10.123, 2_000_000].some(validAmount)).toBe(false)
  })
})

describe('entender frases de presupuesto', () => {
  it.each([
    ['Pepa, crea un presupuesto de 300 euros para restaurantes este mes.', 'restaurantes', 300, 'this_month'],
    ['Pon un límite de 500 euros en alimentación.', 'alimentacion', 500, 'unspecified'],
    ['Cambia el presupuesto de ocio a 150 euros.', 'ocio', 150, 'unspecified'],
    ['Pon 300 euros para restaurantes.', 'restaurantes', 300, 'unspecified'],
    ['Pon 300 € al mes para restaurantes', 'restaurantes', 300, 'monthly'],
    ['Quiero gastar como máximo 200 euros en ropa al mes', 'ropa', 200, 'monthly'],
    ['No quiero gastar más de doscientos euros en ocio', 'ocio', 200, 'unspecified'],
    ['Sube el presupuesto de restaurantes a 400 para el mes que viene', 'restaurantes', 400, 'next_month'],
    ['Limita ocio a 100 euros al mes', 'ocio', 100, 'monthly'],
    ['Pepa establece un tope de cien euros al mes para cafeterías', 'cafeterias', 100, 'monthly'],
    ['¿Puedes poner un presupuesto de 80 euros para regalos este mes?', 'regalos', 80, 'this_month'],
  ])('%s', (text, category, amount, period) => {
    const req = parseBudgetRequest(text)
    expect(req).toMatchObject({ categoryPhrase: category, amounts: [amount], period })
  })

  it('el presupuesto general no lleva categoría', () => {
    expect(parseBudgetRequest('Crea un presupuesto general de 2000 euros')).toMatchObject({ general: true, categoryPhrase: '', amounts: [2000] })
  })

  it('sin importe o con importes dudosos se detecta para preguntar', () => {
    expect(draftFromRequest(parseBudgetRequest('Ponme un presupuesto para ocio')!)).toMatchObject({ amount: null, amountProblem: null })
    expect(draftFromRequest(parseBudgetRequest('Crea un presupuesto de 300 o 400 euros para ocio')!)).toMatchObject({ amount: null, amountProblem: 'ambiguous' })
    expect(draftFromRequest(parseBudgetRequest('Crea un presupuesto de unos 300 euros para ocio')!)).toMatchObject({ amount: null, amountProblem: 'ambiguous' })
    expect(draftFromRequest(parseBudgetRequest('Crea un presupuesto de -50 euros para ocio')!)).toMatchObject({ amount: null, amountProblem: 'invalid' })
    expect(draftFromRequest(parseBudgetRequest('Crea un presupuesto de cero euros para ocio')!)).toMatchObject({ amount: null, amountProblem: 'invalid' })
  })

  it('periodos: semanal y otros meses se detectan (no soportados), este mes y el que viene sí', () => {
    expect(parseBudgetRequest('Crea un presupuesto semanal de 50 euros para ocio')?.period).toBe('weekly')
    expect(parseBudgetRequest('Crea un presupuesto de 50 euros para ocio en octubre')?.period).toBe('other')
    expect(parseBudgetRequest('Crea un presupuesto de 50 euros para ocio el mes que viene')?.period).toBe('next_month')
  })

  it.each([
    '¿Cuánto me queda del presupuesto de ocio?',
    'Cuánto hemos gastado en restaurantes',
    '¿Cuál es mi presupuesto de ocio?',
    'Añade leche a la compra',
    'Apunta un gasto de 30 euros en restaurantes',
    'Crea una categoría que se llame Gimnasio',
    'Cambia este gasto a Restauración',
    'Etiqueta este gasto como trabajo',
    'Borra el gasto de ayer',
    'Qué tengo mañana',
    'Pon tortilla el viernes para cenar',
  ])('no es un presupuesto: "%s"', (text) => expect(parseBudgetRequest(text)).toBeNull())

  it.each(['Transfiere 500 euros a Eric', 'Traspasa 200 euros a la cuenta de Lucía', 'Haz un bizum de 30 euros', 'Paga 100 euros de la luz', 'Retira 300 euros del banco', 'Invierte 200 euros'])('mover dinero: "%s"', (text) => {
    expect(isMoneyMoveRequest(text)).toBe(true)
  })

  it('preguntas sobre pagos no son órdenes de pagar', () => {
    for (const t of ['¿Cuánto hemos pagado de luz?', 'Cuánto pagamos en Mercadona', 'Qué hemos pagado este mes']) expect(isMoneyMoveRequest(t)).toBe(false)
  })
})

describe('respuestas cortas', () => {
  it.each([
    ['Mejor 250', 250],
    ['que sean 250 euros', 250],
    ['cámbialo a 250', 250],
    ['250', 250],
    ['ponle 250 €', 250],
    ['trescientos', 300],
  ])('ajuste de importe: %s', (text, amount) => expect(parseAdjustAmount(text)).toEqual({ amount }))

  it('un ajuste con otra cosa dentro, o sin importe, no es un ajuste; dudoso o inválido se marca', () => {
    expect(parseAdjustAmount('mejor 250 para ocio')).toBeNull()
    expect(parseAdjustAmount('no')).toBeNull()
    expect(parseAdjustAmount('mejor unos 250')).toEqual({ problem: 'ambiguous' })
    expect(parseAdjustAmount('300 o 400')).toEqual({ problem: 'ambiguous' })
    expect(parseAdjustAmount('cero')).toEqual({ problem: 'invalid' })
  })

  it('respuesta al periodo', () => {
    expect(parsePeriodReply('Sí')).toBe('yes')
    expect(parsePeriodReply('hazlo')).toBe('yes')
    expect(parsePeriodReply('mensual')).toBe('this_month')
    expect(parsePeriodReply('sí, este mes')).toBe('this_month')
    expect(parsePeriodReply('el mes que viene')).toBe('next_month')
    expect(parsePeriodReply('semanal')).toBe('weekly')
    expect(parsePeriodReply('no')).toBe('no')
    expect(parsePeriodReply('qué tengo mañana')).toBeNull()
  })
})

describe('IA: solo estructura, y se valida', () => {
  const said = 'Crea un presupuesto de 200 euros para comer fuera en restaurantes'

  it('acepta una estructura cuyo importe y categoría están en la frase', () => {
    const out = validateBudgetIntentOutput({ intent: 'budget_set', category: 'restaurantes', general: false, amount: 200, period: 'this_month' }, said)
    expect(out).toEqual({ intent: 'budget_set', category: 'restaurantes', general: false, amount: 200, period: 'this_month' })
    expect(requestFromIntent(out!, said)).toMatchObject({ categoryPhrase: 'restaurantes', amounts: [200], period: 'this_month' })
  })

  it('rechaza un importe que la persona no dijo', () => {
    expect(validateBudgetIntentOutput({ intent: 'budget_set', category: 'restaurantes', general: false, amount: 250, period: null }, said)).toBeNull()
  })

  it('rechaza una categoría que la persona no dijo', () => {
    expect(validateBudgetIntentOutput({ intent: 'budget_set', category: 'viajes', general: false, amount: 200, period: null }, said)).toBeNull()
  })

  it('rechaza valores fuera de las listas cerradas o mal formados', () => {
    for (const bad of [
      { intent: 'transfer', category: null, general: false, amount: 200, period: null },
      { intent: 'budget_set', category: null, general: false, amount: 200, period: 'yearly' },
      { intent: 'budget_set', category: null, general: false, amount: -200, period: null },
      { intent: 'budget_set', category: 'restaurantes!', general: false, amount: 200, period: null },
      'texto libre',
      null,
    ]) {
      expect(validateBudgetIntentOutput(bad, said), JSON.stringify(bad)).toBeNull()
    }
  })

  it('"none" no lleva nada más', () => {
    expect(validateBudgetIntentOutput({ intent: 'none', category: 'x', amount: 5 }, said)).toEqual({ intent: 'none', category: null, general: false, amount: null, period: null })
  })

  it('la petición al servidor solo admite la frase y la fecha, sin datos sensibles', () => {
    expect(readBudgetIntentRequest({ text: said, today: '2026-09-20' }).ok).toBe(true)
    expect(readBudgetIntentRequest({ text: 'pon ES7620770024003102575766 300 euros', today: '2026-09-20' }).ok).toBe(false)
    expect(readBudgetIntentRequest({ text: said, today: 'mañana' }).ok).toBe(false)
    expect(readBudgetIntentRequest({ text: 'a', today: '2026-09-20' }).ok).toBe(false)
  })
})
