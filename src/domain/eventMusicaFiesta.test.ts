import { describe, expect, it } from 'vitest'
import {
  ANIMACION_QUESTION_KEY,
  desiredForMusicaPartes,
  listMusicaFiestaBlockQuestions,
  MUSICA_EXTRA_CONFIRM_QUESTION_KEY,
  MUSICA_PARTES_CATALOG,
  MUSICA_PARTES_QUESTION_KEY,
  MUSICA_QUESTION_KEY,
} from '@/domain/eventMusicaFiesta'
import type { EventDecision } from '@/domain/types'

function makeDecision(overrides: Partial<EventDecision> = {}): EventDecision {
  return {
    id: 'd1',
    eventId: 'e1',
    familyId: 'f1',
    blockKey: 'musica_fiesta',
    questionKey: MUSICA_QUESTION_KEY,
    answer: {},
    isCustomOption: false,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('Parte G2 (orden de recuperación de requisitos, aclaración directa del usuario) — partes del evento con DJ/música en directo', () => {
  it('catálogo: ceremonia, cóctel, comida, baile, fiesta — sin horarios ni plan de actuación', () => {
    const keys = MUSICA_PARTES_CATALOG.map((i) => i.key)
    expect(keys).toEqual(['ceremonia', 'coctel', 'comida', 'baile', 'fiesta'])
  })

  it('desiredForMusicaPartes es siempre NONE — nunca genera tarea, presupuesto ni proveedor duplicado', () => {
    const none = { taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false, groupKind: null, groupDefaultName: null }
    expect(desiredForMusicaPartes(undefined)).toEqual(none)
    expect(desiredForMusicaPartes({ selected: ['ceremonia', 'baile'] })).toEqual(none)
  })

  it('la pregunta NO aparece si no han elegido ninguna opción de música todavía', () => {
    const keys = listMusicaFiestaBlockQuestions([], false).map((q) => q.questionKey)
    expect(keys).not.toContain(MUSICA_PARTES_QUESTION_KEY)
  })

  it('la pregunta NO aparece si eligieron solo "música propia" (sin DJ ni directo)', () => {
    const decisions = [makeDecision({ answer: { choice: 'seleccionar', selected: ['propia'], customItems: [] } })]
    const keys = listMusicaFiestaBlockQuestions(decisions, false).map((q) => q.questionKey)
    expect(keys).not.toContain(MUSICA_PARTES_QUESTION_KEY)
  })

  it('la pregunta aparece (opcional) si eligieron DJ', () => {
    const decisions = [makeDecision({ answer: { choice: 'seleccionar', selected: ['dj'], customItems: [] } })]
    const keys = listMusicaFiestaBlockQuestions(decisions, false).map((q) => q.questionKey)
    expect(keys).toContain(MUSICA_PARTES_QUESTION_KEY)
  })

  it('la pregunta aparece si eligieron música en directo', () => {
    const decisions = [makeDecision({ answer: { choice: 'seleccionar', selected: ['directo'], customItems: [] } })]
    const keys = listMusicaFiestaBlockQuestions(decisions, false).map((q) => q.questionKey)
    expect(keys).toContain(MUSICA_PARTES_QUESTION_KEY)
  })

  it('cuando el lugar ya incluye música: la pregunta de partes reacciona a la música ADICIONAL (misma clave MUSICA_QUESTION_KEY), no a una pregunta paralela', () => {
    const decisions = [
      makeDecision({ questionKey: MUSICA_EXTRA_CONFIRM_QUESTION_KEY, answer: { choice: 'si' } }),
      makeDecision({ id: 'd2', answer: { choice: 'seleccionar', selected: ['dj'], customItems: [] } }),
    ]
    const keys = listMusicaFiestaBlockQuestions(decisions, true).map((q) => q.questionKey)
    expect(keys).toContain(MUSICA_PARTES_QUESTION_KEY)
  })

  it('no desplaza ni duplica la pregunta de animación, que sigue siempre presente al final', () => {
    const decisions = [makeDecision({ answer: { choice: 'seleccionar', selected: ['dj'], customItems: [] } })]
    const keys = listMusicaFiestaBlockQuestions(decisions, false).map((q) => q.questionKey)
    expect(keys.filter((k) => k === ANIMACION_QUESTION_KEY)).toHaveLength(1)
  })
})
