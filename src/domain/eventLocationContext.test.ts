import { describe, expect, it } from 'vitest'
import { LUGAR_CONTEXTO_QUESTION_KEY, lugarContextoStatus } from '@/domain/eventLocationContext'
import type { EventDecision } from '@/domain/types'

function makeDecision(overrides: Partial<EventDecision> = {}): EventDecision {
  return {
    id: 'd1',
    eventId: 'e1',
    familyId: 'f1',
    blockKey: 'lugar_contexto',
    questionKey: LUGAR_CONTEXTO_QUESTION_KEY,
    answer: {},
    isCustomOption: false,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('Lugar contexto — sin fila es "sin empezar", "todavía no lo sabemos" es "por decidir", nunca destructivo', () => {
  it('sin ninguna decisión: sin_empezar', () => {
    expect(lugarContextoStatus([])).toBe('sin_empezar')
  })

  it('"todavía no lo sabemos": por_decidir', () => {
    expect(lugarContextoStatus([makeDecision({ answer: { choice: 'todavia_no_lo_sabemos' } })])).toBe('por_decidir')
  })

  it('"en_casa"/"restaurante_local"/"exterior": decidida', () => {
    expect(lugarContextoStatus([makeDecision({ answer: { choice: 'en_casa' } })])).toBe('decidida')
    expect(lugarContextoStatus([makeDecision({ answer: { choice: 'restaurante_local' } })])).toBe('decidida')
    expect(lugarContextoStatus([makeDecision({ answer: { choice: 'exterior' } })])).toBe('decidida')
  })

  it('"otro" con la resolución personalizada en "todavía no lo sabemos" cuenta como por_decidir, igual que el resto del motor', () => {
    expect(lugarContextoStatus([makeDecision({ answer: { choice: 'otro', custom: { action: 'todavia_no_lo_sabemos' } } })])).toBe('por_decidir')
  })
})
