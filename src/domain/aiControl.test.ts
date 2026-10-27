import { describe, expect, it } from 'vitest'
import {
  AI_MODULES,
  alertText,
  changeOf,
  formatMoney,
  functionStatus,
  limitState,
  marginOf,
  periodRange,
  perActiveFamilyMonthly,
  priceFactorFor,
  projectCosts,
  scheduleOf,
  toAiAlerts,
  toAiLimits,
  toAiOverview,
  toAiState,
  toProjectionBase,
  aiErrorText,
  type AiFunctionRow,
  type AiState,
} from '@/domain/aiControl'

const fn = (over: Partial<AiFunctionRow> = {}): AiFunctionRow => ({
  purpose: 'analyze-receipt-photo',
  label: 'Tickets',
  module: 'compras_economia',
  description: '',
  origin: 'family',
  needs: ['global'],
  enabled: true,
  calls24h: 0,
  failed24h: 0,
  lastCall: null,
  lastFailure: null,
  ...over,
})
const state = (over: Partial<AiState> = {}): AiState => ({
  enabled: true,
  provider: 'gemini',
  model: 'm',
  keyConfigured: true,
  plansEnforced: false,
  thresholds: {},
  openAlerts: 0,
  functions: [],
  unregistered: [],
  community: { launched: true, aiEnabled: true, dailyCap: 300, usedToday: 0, scheduleArticles: false, schedulePolls: false, scheduleMenu: false },
  ...over,
})

describe('estado efectivo de una función', () => {
  it('distingue activada, apagada por ti, parada por el general, en espera y fallo técnico', () => {
    expect(functionStatus(fn(), state()).kind).toBe('on')
    expect(functionStatus(fn({ enabled: false }), state()).kind).toBe('off')
    expect(functionStatus(fn(), state({ enabled: false })).kind).toBe('global_off')
    expect(functionStatus(fn({ enabled: false }), state({ enabled: false })).kind).toBe('global_off')
    expect(functionStatus(fn({ needs: ['global', 'community_launched'] }), state({ community: { ...state().community, launched: false } })).kind).toBe('waiting')
    expect(functionStatus(fn({ needs: ['global', 'community_ai_enabled'] }), state({ community: { ...state().community, aiEnabled: false } })).kind).toBe('waiting')
    expect(functionStatus(fn(), state({ keyConfigured: false })).kind).toBe('technical')
    expect(functionStatus(fn({ calls24h: 4, failed24h: 4 }), state()).kind).toBe('technical')
    expect(functionStatus(fn({ calls24h: 4, failed24h: 1 }), state()).kind).toBe('on')
  })
  it('la programación semanal solo existe en las funciones editoriales', () => {
    const c = { ...state().community, scheduleMenu: true }
    expect(scheduleOf('editorial_menu', c)).toBe(true)
    expect(scheduleOf('editorial_article', c)).toBe(false)
    expect(scheduleOf('summary', c)).toBeNull()
  })
})

describe('periodos en hora de Madrid', () => {
  const now = new Date('2026-10-27T10:00:00Z') // 11:00 en Madrid
  it('hoy, 7 días, 30 días y mes actual', () => {
    expect(periodRange('today', now)?.days).toBe(1)
    expect(periodRange('7d', now)?.days).toBe(7)
    expect(periodRange('30d', now)?.days).toBe(30)
    const m = periodRange('month', now)!
    expect(m.days).toBe(27)
    expect(m.to.getTime()).toBeGreaterThan(now.getTime())
  })
  it('intervalo personalizado: incluye ambos días y rechaza lo inválido', () => {
    expect(periodRange('custom', now, { from: '2026-10-01', to: '2026-10-03' })?.days).toBe(3)
    expect(periodRange('custom', now, { from: '2026-10-05', to: '2026-10-01' })).toBeNull()
    expect(periodRange('custom', now, { from: '', to: '' })).toBeNull()
    expect(periodRange('custom', now, { from: '2026-02-30', to: '2026-03-01' })).toBeNull()
    expect(periodRange('custom', now, { from: '2024-01-01', to: '2026-10-01' })).toBeNull()
  })
})

describe('formato y variación', () => {
  it('variación frente al periodo anterior', () => {
    expect(changeOf(150, 100)).toEqual({ text: '+50 %', dir: 'up' })
    expect(changeOf(50, 100)).toEqual({ text: '−50 %', dir: 'down' })
    expect(changeOf(5, 0)).toEqual({ text: 'Nuevo', dir: 'new' })
    expect(changeOf(0, 0).dir).toBe('same')
    expect(changeOf(100.2, 100).dir).toBe('same')
  })
  it('los importes muy pequeños no se redondean a cero', () => {
    expect(formatMoney(0.00042)).toContain('0,00042')
    expect(formatMoney(12.5)).toBe('12,50 US$')
    expect(formatMoney(0)).toBe('0,00 US$')
  })
})

describe('lectores de las respuestas del servidor', () => {
  it('ignoran lo que no cuadra y no lanzan', () => {
    expect(toAiState(null).functions).toEqual([])
    expect(toAiState({ functions: [{ purpose: 'x', module: 'inventado', needs: ['raro', 'global'] }] }).functions[0]).toMatchObject({ module: 'otros', needs: ['global'], enabled: true })
    expect(toAiOverview('basura').totals.cost).toBe(0)
    expect(toAiLimits({ limits: [{ id: 'a', scope: 'module', scope_key: 'cocina', period: 'x', metric: 'cost', max_value: '5', mode: 'raro' }] }).limits[0]).toMatchObject({ label: 'Cocina', period: 'month', mode: 'observe', maxValue: 5 })
    expect(toAiAlerts([{ kind: 'cost_spike', severity: 'rara' }])[0].severity).toBe('info')
    expect(toProjectionBase(undefined).enough).toBe(false)
  })
  it('el estado de un límite sale del uso', () => {
    const l = toAiLimits({ limits: [{ id: 'a', scope: 'global', period: 'day', metric: 'calls', max_value: 100, warn_pct: 80, mode: 'observe', used: 85 }] }).limits[0]
    expect(limitState(l)).toBe('near')
    expect(limitState({ ...l, used: 100 })).toBe('over')
    expect(limitState({ ...l, used: 10 })).toBe('ok')
  })
  it('cada alerta tiene texto en español sin valores rotos', () => {
    for (const kind of ['cost_spike', 'calls_spike', 'family_outlier', 'function_growth', 'excessive_retries', 'possible_loop', 'provider_errors', 'near_limit', 'otra']) {
      const t = alertText({ id: '1', kind, subject: 's', subjectLabel: 'X', severity: 'warning', details: {}, status: 'open', firstSeen: '', lastSeen: '', occurrences: 1 })
      expect(t.title.length).toBeGreaterThan(3)
      expect(t.body).not.toMatch(/undefined|NaN|\[object/)
    }
  })
})

describe('proyección de costes', () => {
  const base = toProjectionBase({
    days: 30,
    data_days: 20,
    calls: 600,
    active_families: 3,
    total_families: 6,
    enough: true,
    by_module: [
      { module: 'cocina', calls: 300, cost: 0.9, tokens_in: 1000, tokens_out: 500 },
      { module: 'comunidad', calls: 300, cost: 0.3, tokens_in: 1000, tokens_out: 500 },
    ],
  })
  it('consumo mensual por familia activa a partir de lo observado', () => {
    const p = perActiveFamilyMonthly(base)
    expect(p.cocina).toBeCloseTo(0.3, 6)
    expect(p.comunidad).toBeCloseTo(0.1, 6)
    expect(perActiveFamilyMonthly({ ...base, activeFamilies: 0 })).toEqual({})
  })
  it('escala con familias y proporción de activas; bajo/medio/alto son hipótesis', () => {
    const perActiveFamily = { cocina: 0.3, comunidad: 0.1 }
    const mid = projectCosts({ families: 1000, activeShare: 0.5, perActiveFamily, multiplier: 1, priceFactor: 1, capPerFamily: null })
    expect(mid.monthly).toBeCloseTo(200, 6)
    expect(mid.yearly).toBeCloseTo(2400, 6)
    expect(mid.perFamily).toBeCloseTo(0.2, 6)
    expect(mid.perActiveFamily).toBeCloseTo(0.4, 6)
    const high = projectCosts({ families: 1000, activeShare: 0.5, perActiveFamily, multiplier: 2, priceFactor: 1, capPerFamily: null })
    expect(high.monthly).toBeCloseTo(400, 6)
    expect(projectCosts({ families: 100000, activeShare: 1, perActiveFamily, multiplier: 1, priceFactor: 1, capPerFamily: null }).monthly).toBeCloseTo(40000, 4)
  })
  it('el tope por familia recorta y dice cuánto ahorra; el cambio de modelo multiplica', () => {
    const perActiveFamily = { cocina: 0.3, comunidad: 0.1 }
    const capped = projectCosts({ families: 100, activeShare: 1, perActiveFamily, multiplier: 1, priceFactor: 1, capPerFamily: 0.2 })
    expect(capped.capped).toBe(true)
    expect(capped.monthly).toBeCloseTo(20, 6)
    expect(capped.savedByCap).toBeCloseTo(20, 6)
    const dearer = projectCosts({ families: 100, activeShare: 1, perActiveFamily, multiplier: 1, priceFactor: 3, capPerFamily: null })
    expect(dearer.monthly).toBeCloseTo(120, 6)
  })
  it('factor de precio con la mezcla real de tokens', () => {
    expect(priceFactorFor({ in: 0.1, out: 0.4 }, { in: 0.2, out: 0.8 }, 1000, 500)).toBeCloseTo(2, 6)
    expect(priceFactorFor({ in: 0, out: 0 }, { in: 1, out: 1 }, 0, 0)).toBe(1)
  })
  it('nunca produce negativos ni NaN con datos raros', () => {
    const r = projectCosts({ families: -5, activeShare: 7, perActiveFamily: { a: -1 }, multiplier: -2, priceFactor: Number.NaN, capPerFamily: -1 })
    expect(Number.isFinite(r.monthly)).toBe(true)
    expect(r.monthly).toBeGreaterThanOrEqual(0)
  })
  it('el margen no se calcula hasta tener precio, porcentaje y tipo de cambio (no se inventa ninguno)', () => {
    expect(marginOf({ priceEur: null, payingShare: 0.1, eurPerUsd: 0.9, families: 1000, monthlyCostUsd: 10 })).toBeNull()
    expect(marginOf({ priceEur: 3, payingShare: 0.1, eurPerUsd: null, families: 1000, monthlyCostUsd: 10 })).toBeNull()
    const m = marginOf({ priceEur: 3, payingShare: 0.1, eurPerUsd: 0.5, families: 1000, monthlyCostUsd: 10 })!
    expect(m.revenueEur).toBeCloseTo(300, 6)
    expect(m.costEur).toBeCloseTo(5, 6)
    expect(m.marginEur).toBeCloseTo(295, 6)
  })
})

describe('textos de error y módulos', () => {
  it('traduce los errores del servidor sin enseñar códigos', () => {
    expect(aiErrorText(new Error('NOT_ADMIN'))).toMatch(/administradoras/)
    expect(aiErrorText(new Error('Could not find the function public.ai_admin_state'))).toMatch(/0332/)
    expect(aiErrorText(new Error('algo raro'))).toBe('Algo ha fallado. Inténtalo de nuevo.')
  })
  it('los siete módulos pedidos existen con nombre en español', () => {
    expect(AI_MODULES.map((m) => m.label)).toEqual(['Compras y Economía', 'Comunidad', 'Ayuda y asistencia', 'Cocina', 'Mis listas', 'Eventos', 'Otros módulos con IA'])
  })
})
