import { beforeEach, describe, expect, it, vi } from 'vitest'

const callAiFunction = vi.fn()
const aliasize = vi.fn((s: string) => s.replace('Eric', 'Persona A'))
vi.mock('@/services/aiClient', () => ({
  callAiFunction: (...args: unknown[]) => callAiFunction(...args),
  loadAliasMap: vi.fn(async () => ({ aliasize, restore: (s: string) => s })),
}))

import type { AnalysisFact } from '@/domain/financeAnalysis'
import { requestFinanceAnalysis } from '@/services/financeAnalysis'

const FACTS: AnalysisFact[] = [
  { ref: 'period.label', label: 'Periodo analizado', value: 'este mes', kind: 'text' },
  { ref: 'expenses.total', label: 'Gasto total del periodo', value: 280, kind: 'eur' },
  { ref: 'cat.1.name', label: 'Categoría 1', value: 'Colegio de Eric', kind: 'text' },
  { ref: 'cat.1.amount', label: 'Gasto en la categoría 1', value: 90, kind: 'eur' },
]

beforeEach(() => {
  callAiFunction.mockReset()
  aliasize.mockClear()
})

describe('requestFinanceAnalysis', () => {
  it('envía SOLO el foco y los hechos (con alias en los nombres) a la función de análisis', async () => {
    callAiFunction.mockResolvedValue({ summary: 'Este mes lleváis {{expenses.total}} de gasto registrado.', findings: [], suggestions: [] })
    const out = await requestFinanceAnalysis('overview', FACTS)
    expect(out?.summary).toContain('{{expenses.total}}')
    const [name, body] = callAiFunction.mock.calls[0] as [string, { focus: string; facts: AnalysisFact[] }]
    expect(name).toBe('finance-analysis')
    expect(Object.keys(body).sort()).toEqual(['facts', 'focus'])
    expect(body.facts.find((f) => f.ref === 'cat.1.name')!.value).toBe('Colegio de Persona A')
    expect(JSON.stringify(body)).not.toContain('Eric')
    // Los números no se tocan.
    expect(body.facts.find((f) => f.ref === 'expenses.total')!.value).toBe(280)
  })

  it('una respuesta con una cifra inventada se descarta (null)', async () => {
    callAiFunction.mockResolvedValue({ summary: 'Este mes lleváis 999 euros de gasto registrado.', findings: [], suggestions: [] })
    expect(await requestFinanceAnalysis('overview', FACTS)).toBeNull()
  })

  it('una respuesta con una referencia que no existe se descarta', async () => {
    callAiFunction.mockResolvedValue({ summary: 'Este mes lleváis {{expenses.otra}} de gasto registrado.', findings: [], suggestions: [] })
    expect(await requestFinanceAnalysis('overview', FACTS)).toBeNull()
  })

  it('si la IA no está disponible devuelve null, sin lanzar', async () => {
    callAiFunction.mockRejectedValue(new Error('IA no disponible (ai_disabled)'))
    expect(await requestFinanceAnalysis('conclusions', FACTS)).toBeNull()
  })
})
