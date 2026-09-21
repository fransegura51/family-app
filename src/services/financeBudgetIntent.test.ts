import { beforeEach, describe, expect, it, vi } from 'vitest'

const callAiFunction = vi.fn()
const aliasize = vi.fn((s: string) => s.replace('Eric', 'Persona A'))
vi.mock('@/services/aiClient', () => ({
  callAiFunction: (...args: unknown[]) => callAiFunction(...args),
  loadAliasMap: vi.fn(async () => ({ aliasize, restore: (s: string) => s.replace('Persona A', 'Eric') })),
}))

import { classifyBudgetIntent } from '@/services/financeBudgetIntent'

beforeEach(() => {
  callAiFunction.mockReset()
  aliasize.mockClear()
})

describe('classifyBudgetIntent', () => {
  it('envía SOLO la frase (con alias) y la fecha a la función de presupuesto', async () => {
    callAiFunction.mockResolvedValue({ intent: 'budget_set', category: 'restaurantes', general: false, amount: 200, period: 'this_month' })
    const out = await classifyBudgetIntent('Crea un presupuesto de 200 euros para restaurantes de Eric', new Date(2026, 8, 20))
    expect(out).toMatchObject({ intent: 'budget_set', amount: 200 })
    const [name, body] = callAiFunction.mock.calls[0] as [string, Record<string, unknown>]
    expect(name).toBe('finance-budget-intent')
    expect(Object.keys(body).sort()).toEqual(['text', 'today'])
    expect(body.today).toBe('2026-09-20')
    expect(String(body.text)).not.toContain('Eric')
  })

  it('una respuesta con un importe inventado se descarta (null)', async () => {
    callAiFunction.mockResolvedValue({ intent: 'budget_set', category: 'restaurantes', general: false, amount: 999, period: null })
    expect(await classifyBudgetIntent('Crea un presupuesto de 200 euros para restaurantes', new Date(2026, 8, 20))).toBeNull()
  })

  it('si la IA no está disponible devuelve null, sin lanzar', async () => {
    callAiFunction.mockRejectedValue(new Error('IA no disponible (ai_disabled)'))
    expect(await classifyBudgetIntent('Crea un presupuesto de 200 euros para restaurantes', new Date(2026, 8, 20))).toBeNull()
  })
})
