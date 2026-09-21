import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  analysisFacts,
  attentionFindings,
  buildAnalysis,
  categoryFocusFindings,
  changesFindings,
  cutsFindings,
  overviewFindings,
  renderFindings,
  savingsTrendFindings,
  simplerFindings,
  topIncreaseFindings,
  whereMoneyFindings,
} from './financeAnalysis'
import { formatEuros } from './financeCompute'
import { resolvePeriod } from './financePeriod'
import { CATEGORIES, EXPENSES, REST, SUPER, TODAY, cat, exp, financeData } from './financeTestData'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(TODAY)
})
afterEach(() => vi.useRealTimers())

const thisMonth = () => resolvePeriod({ t: 'month', offset: 0 }, TODAY, 1)
const analysis = (over = {}) => buildAnalysis(financeData(over), thisMonth(), TODAY)
const text = (f: { text: string }[]) => f.map((x) => x.text).join('\n')

describe('el motor calcula con los mismos criterios que Economía', () => {
  it('gasto del mismo tramo, sin traspasos entre cuentas ni ingresos', () => {
    const a = analysis()
    expect(a.expenses.total).toBe(280) // 100 + 60 + 90 + 30 (1-20 de septiembre)
    expect(a.expenses.previous).toBe(150) // 80 + 20 + 50 (1-20 de agosto; los 300 de vivienda son del 25: fuera del tramo)
  })

  it('comparación de tramo: 1-20 contra 1-20', () => {
    const a = analysis()
    expect(a.cp.cutoff).toBe(true)
    expect(a.cp.current).toEqual({ from: '2026-09-01', to: '2026-09-20' })
    expect(a.cp.previous).toEqual({ from: '2026-08-01', to: '2026-08-20' })
  })

  it('ahorro = ingresos - gastos en los dos tramos', () => {
    const a = analysis()
    expect(a.savings.total).toBe(2000 - a.expenses.total)
    expect(a.savings.previous).toBe(2000 - (a.expenses.previous as number))
  })

  it('categorías principales con su cambio y su peso', () => {
    const a = analysis()
    const food = a.categories.find((c) => c.name === 'Alimentación')!
    expect(food.amount).toBe(250)
    expect(food.difference).toBe(150)
    expect(Math.round(food.share)).toBe(89)
  })

  it('clasifica: "quiero" y fijo/variable con las clasificaciones reales de las categorías', () => {
    const a = analysis()
    expect(a.necessity.quiero).toBe(90)
    expect(a.fixedVariable.fixed).toBe(0)
  })
})

describe('HECHO / COMPARACIÓN / INTERPRETACIÓN / SUGERENCIA', () => {
  it('"Analiza nuestros gastos": separa los cuatro tipos y no juzga', () => {
    const f = overviewFindings(analysis())
    const kinds = new Set(f.map((x) => x.kind))
    expect(kinds.has('fact')).toBe(true)
    expect(kinds.has('comparison')).toBe(true)
    const t = text(f)
    expect(t).toContain('280,00 € de gasto registrado')
    expect(t).toContain('Son 130,00 € más')
    expect(t).not.toMatch(/demasiado|excesiv|mal habito/i)
  })

  it('interpretación prudente: una categoría explica parte del cambio', () => {
    const t = text(overviewFindings(analysis()))
    expect(t).toContain('Alimentación explica una parte importante del aumento')
  })

  it('sin suficiente histórico de tickets lo dice en vez de inventar', () => {
    const t = text(overviewFindings(analysis({ prices: [] })))
    expect(t).toContain('no hay todavía suficiente histórico para afirmar que el cambio venga de subidas o bajadas de precio')
  })

  it('con tickets en los dos periodos separa precio/cantidad/nuevos/dejados', () => {
    const t = text(overviewFindings(analysis()))
    expect(t).toContain('En la cesta de tickets')
    expect(t).toContain('por precios')
  })

  it('una sugerencia siempre invita a REVISAR, nunca ordena', () => {
    const f = cutsFindings(analysis())
    const s = f.find((x) => x.kind === 'suggestion')!
    expect(s.text).toMatch(/podríais revisar/)
    expect(s.text).toContain('no una recomendación de recortar')
    expect(text(f)).not.toMatch(/cancela|elimina|invierte|deja de|cambia de banco/i)
  })

  it('para recortar señala primero lo "quiero" y nunca lo fijo', () => {
    const t = text(cutsFindings(analysis()))
    expect(t).toContain(REST)
    expect(t).not.toContain('Vivienda y hogar')
  })

  it('con las categorías sin clasificar, lo advierte', () => {
    const bare = analysis({ categories: CATEGORIES.map((c) => ({ ...c, necessity: null, isFixed: null })) })
    expect(text(cutsFindings(bare))).toContain('no están clasificadas')
  })
})

describe('las consultas de análisis', () => {
  it('dónde se va el dinero: categorías con su peso', () => {
    const t = text(whereMoneyFindings(analysis()))
    expect(t).toContain('Alimentación: 250,00 € (89 %)')
  })
  it('qué categoría ha aumentado más', () => {
    expect(text(topIncreaseFindings(analysis()))).toContain('La categoría que más ha aumentado es Alimentación: +150,00 €')
  })
  it('qué ha cambiado respecto al mes pasado', () => {
    const t = text(changesFindings(analysis()))
    expect(t).toContain('Son 130,00 € más')
    expect(t).toContain('Lo que más ha subido: Alimentación')
  })
  it('qué te llama la atención: solo lo que destaca en los números, sin dar el concepto', () => {
    const t = text(attentionFindings(analysis()))
    expect(t).toContain('Es solo lo que destaca en los números')
    expect(t).not.toContain('SECRETO')
    expect(t).not.toContain('ES76')
  })
  it('explícamelo más sencillo: pocas frases', () => {
    const f = simplerFindings(analysis())
    expect(f.length).toBeLessThanOrEqual(3)
    expect(text(f)).toContain('En sencillo')
  })
  it('un solo bloque de categoría', () => {
    const d = financeData()
    const t = text(categoryFocusFindings(buildAnalysis(d, thisMonth(), TODAY), 'Alimentación', d))
    expect(t).toContain('250,00 € en Alimentación')
    expect(t).toContain('Por dentro')
  })
})

describe('ahorro y corrección de premisas', () => {
  const savingUp = () => {
    // Este tramo ahorran más que el anterior.
    const expenses = [exp('2026-09-02', 100, SUPER), exp('2026-09-01', 2000, 'Sueldo', { isIncome: true }), exp('2026-08-02', 400, SUPER), exp('2026-08-01', 2000, 'Sueldo', { isIncome: true })]
    return buildAnalysis(financeData({ expenses }), thisMonth(), TODAY)
  }
  it('"¿por qué estamos ahorrando menos?" cuando en realidad se ahorra MÁS: corrige', () => {
    const t = text(savingsTrendFindings(savingUp(), 'less'))
    expect(t).toContain('En realidad estáis ahorrando más, no menos')
  })
  it('"¿por qué estamos ahorrando más?" cuando se ahorra menos: corrige', () => {
    const down = buildAnalysis(financeData({ expenses: [exp('2026-09-02', 900, SUPER), exp('2026-09-01', 2000, 'Sueldo', { isIncome: true }), exp('2026-08-02', 100, SUPER), exp('2026-08-01', 2000, 'Sueldo', { isIncome: true })] }), thisMonth(), TODAY)
    expect(text(savingsTrendFindings(down, 'more'))).toContain('En realidad estáis ahorrando menos, no más')
  })
  it('si la premisa es correcta, no la corrige', () => {
    expect(text(savingsTrendFindings(savingUp(), 'more'))).not.toContain('En realidad')
  })
  it('sin ingresos registrados no calcula el ahorro', () => {
    const a = buildAnalysis(financeData({ expenses: EXPENSES.filter((e) => !e.isIncome) }), thisMonth(), TODAY)
    expect(text(savingsTrendFindings(a))).toContain('no puedo calcular el ahorro')
  })
})

describe('datos incompletos', () => {
  it('sin gastos no analiza', () => {
    const a = buildAnalysis(financeData({ expenses: [] }), thisMonth(), TODAY)
    expect(text(overviewFindings(a))).toContain('No tengo gastos registrados este mes para analizar')
  })
  it('banco caducado: advertencia en todo análisis', () => {
    const a = analysis({ bankStale: true })
    expect(text(overviewFindings(a))).toContain('conexión bancaria caducada')
    expect(text(whereMoneyFindings(a))).toContain('conexión bancaria caducada')
    expect(text(cutsFindings(a))).toContain('conexión bancaria caducada')
    expect(a.dataQuality.warnings.join(' ')).toContain('caducada')
  })
  it('sin periodo anterior no compara', () => {
    const only = buildAnalysis(financeData({ expenses: EXPENSES.filter((e) => e.expenseDate >= '2026-09-01') }), thisMonth(), TODAY)
    expect(text(overviewFindings(only))).toContain('No tengo gastos del periodo anterior')
    expect(text(topIncreaseFindings(only))).toContain('con los que comparar')
  })
  it('cobertura de tickets sobre la alimentación', () => {
    const a = analysis()
    expect(a.dataQuality.foodTicketCoverage).not.toBeNull()
  })
})

describe('comparar con un periodo elegido ("¿y comparado con agosto?")', () => {
  it('usa el mismo tramo de días del periodo de referencia', () => {
    const baseline = resolvePeriod({ t: 'month_named', month0: 6, year: 2026 }, TODAY, 1) // julio
    const a = buildAnalysis(financeData(), thisMonth(), TODAY, { baseline })
    expect(a.cp.previous).toEqual({ from: '2026-07-01', to: '2026-07-20' })
    expect(a.cp.previousLabel).toBe('julio')
  })
})

describe('el paquete para la IA: solo agregados', () => {
  const facts = () => analysisFacts(analysis())
  const json = () => JSON.stringify(facts())

  it('no contiene movimientos, conceptos, IBAN, comercios, fechas sueltas ni productos', () => {
    const j = json()
    expect(j).not.toContain('SECRETO')
    expect(j).not.toContain('ES76')
    expect(j).not.toMatch(/mercadona|aldi/i)
    expect(j).not.toContain('Queso')
    expect(j).not.toContain('Leche')
    expect(j).not.toContain('2026-09-03')
  })
  it('cada hecho tiene referencia única, etiqueta y tipo', () => {
    const f = facts()
    expect(new Set(f.map((x) => x.ref)).size).toBe(f.length)
    expect(f.length).toBeLessThanOrEqual(90)
    for (const x of f) expect(['eur', 'eur_signed', 'pct', 'pct_signed', 'num', 'text']).toContain(x.kind)
  })
  it('incluye lo mínimo necesario para razonar', () => {
    const refs = new Set(facts().map((x) => x.ref))
    for (const r of ['period.label', 'expenses.total', 'expenses.previous', 'expenses.difference', 'expenses.percent', 'income.total', 'savings.total', 'cat.1.name', 'cat.1.amount', 'cat.1.difference']) {
      expect(refs.has(r), r).toBe(true)
    }
  })
  it('los importes son los calculados por el código', () => {
    const f = facts()
    expect(f.find((x) => x.ref === 'expenses.total')!.value).toBe(280)
    expect(f.find((x) => x.ref === 'cat.1.name')!.value).toBe('Alimentación')
  })
  it('sin tickets suficientes no ofrece cifras de compras y avisa', () => {
    const f = analysisFacts(analysis({ prices: [] }))
    expect(f.some((x) => x.ref.startsWith('purchase.'))).toBe(false)
    expect(f.some((x) => x.ref === 'prices.compared')).toBe(false)
    expect(f.find((x) => x.ref === 'quality.warning.1')).toBeDefined()
  })
  it('un nombre de categoría con el de un familiar viaja tal cual al motor (el alias lo pone el servicio)', () => {
    const d = financeData({ categories: [...CATEGORIES, cat('cx', 'Colegio de Eric')], expenses: [...EXPENSES, exp('2026-09-04', 40, 'Colegio de Eric')] })
    const f = analysisFacts(buildAnalysis(d, thisMonth(), TODAY))
    expect(f.some((x) => x.value === 'Colegio de Eric')).toBe(true)
  })
})

describe('todo el texto de código es prudente', () => {
  it('ningún compositor usa juicios ni órdenes financieras', () => {
    const a = analysis({ bankStale: true })
    const d = financeData()
    const all = [
      renderFindings(overviewFindings(a)),
      renderFindings(whereMoneyFindings(a)),
      renderFindings(topIncreaseFindings(a)),
      renderFindings(changesFindings(a)),
      renderFindings(cutsFindings(a)),
      renderFindings(attentionFindings(a)),
      renderFindings(simplerFindings(a)),
      renderFindings(savingsTrendFindings(a, 'less')),
      renderFindings(categoryFocusFindings(a, 'Alimentación', d)),
    ].join('\n')
    expect(all).not.toMatch(/demasiado|excesiv|despilfarr|deberíais|tenéis que|cancela|elimina|invierte|deja de pagar|cambia de banco/i)
    expect(formatEuros(1)).toBe('1,00 €')
  })
})
