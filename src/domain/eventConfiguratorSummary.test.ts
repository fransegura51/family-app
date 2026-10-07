import { describe, expect, it } from 'vitest'
import { computeConfiguratorSummary, type ConfiguratorQuestionRef } from '@/domain/eventConfiguratorSummary'

function q(overrides: Partial<ConfiguratorQuestionRef>): ConfiguratorQuestionRef {
  return { sectionKey: 'pareja', sectionLabel: 'La pareja', key: 'k', label: 'Pregunta', status: 'decidida', ...overrides }
}

describe('computeConfiguratorSummary', () => {
  it('sin preguntas: todo en cero, ninguna sección', () => {
    expect(computeConfiguratorSummary([])).toEqual({ decidedCount: 0, pendingCount: 0, sectionsWithPending: [], notStartedSections: [] })
  })

  it('cuenta decididas y pendientes por separado — "todavía no lo sabemos" (por_decidir) nunca cuenta como tomada', () => {
    const result = computeConfiguratorSummary([
      q({ sectionKey: 'pareja', key: 'a', status: 'decidida' }),
      q({ sectionKey: 'pareja', key: 'b', status: 'decidida' }),
      q({ sectionKey: 'pareja', key: 'c', status: 'por_decidir' }),
    ])
    expect(result.decidedCount).toBe(2)
    expect(result.pendingCount).toBe(1)
  })

  it('una sección con al menos una pendiente aparece en sectionsWithPending, con el recuento y la PRIMERA pendiente en orden', () => {
    const result = computeConfiguratorSummary([
      q({ sectionKey: 'pareja', sectionLabel: 'La pareja', key: 'a', status: 'decidida' }),
      q({ sectionKey: 'pareja', sectionLabel: 'La pareja', key: 'b', status: 'por_decidir' }),
      q({ sectionKey: 'pareja', sectionLabel: 'La pareja', key: 'c', status: 'por_decidir' }),
    ])
    expect(result.sectionsWithPending).toEqual([{ sectionKey: 'pareja', sectionLabel: 'La pareja', pendingCount: 2, firstPendingKey: 'b' }])
  })

  it('una sección completamente sin empezar (ninguna decidida, ninguna pendiente) se agrupa en notStartedSections, nunca en sectionsWithPending', () => {
    const result = computeConfiguratorSummary([
      q({ sectionKey: 'comida', sectionLabel: 'Comida y bebida', key: 'a', status: 'sin_empezar' }),
      q({ sectionKey: 'comida', sectionLabel: 'Comida y bebida', key: 'b', status: 'sin_empezar' }),
    ])
    expect(result.sectionsWithPending).toEqual([])
    expect(result.notStartedSections).toEqual([{ sectionKey: 'comida', sectionLabel: 'Comida y bebida' }])
  })

  it('una sección totalmente resuelta (todo decidida, nada pendiente) no aparece en ninguna de las dos listas', () => {
    const result = computeConfiguratorSummary([
      q({ sectionKey: 'momentos_especiales', key: 'a', status: 'decidida' }),
      q({ sectionKey: 'momentos_especiales', key: 'b', status: 'decidida' }),
    ])
    expect(result.sectionsWithPending).toEqual([])
    expect(result.notStartedSections).toEqual([])
  })

  it('una sección con alguna decidida y alguna sin_empezar pero SIN ninguna pendiente explícita no cuenta como "sin empezar" (ya se ha tocado) ni genera línea propia', () => {
    const result = computeConfiguratorSummary([
      q({ sectionKey: 'invitados', key: 'a', status: 'decidida' }),
      q({ sectionKey: 'invitados', key: 'b', status: 'sin_empezar' }),
    ])
    expect(result.sectionsWithPending).toEqual([])
    expect(result.notStartedSections).toEqual([])
  })

  it('varias secciones mezcladas: cada una se clasifica de forma independiente, en el orden de PRIMERA aparición', () => {
    const result = computeConfiguratorSummary([
      q({ sectionKey: 'pareja', sectionLabel: 'La pareja', key: 'a', status: 'por_decidir' }),
      q({ sectionKey: 'comida', sectionLabel: 'Comida y bebida', key: 'b', status: 'sin_empezar' }),
      q({ sectionKey: 'invitados', sectionLabel: 'Invitados e invitaciones', key: 'c', status: 'decidida' }),
      q({ sectionKey: 'momentos_especiales', sectionLabel: 'Momentos especiales', key: 'd', status: 'sin_empezar' }),
    ])
    expect(result.sectionsWithPending.map((s) => s.sectionKey)).toEqual(['pareja'])
    expect(result.notStartedSections.map((s) => s.sectionKey)).toEqual(['comida', 'momentos_especiales'])
    expect(result.decidedCount).toBe(1)
    expect(result.pendingCount).toBe(1)
  })

  it('una sección ausente por completo (list*BlockQuestions devolvió []) nunca aparece en ningún sitio — ni pendiente ni sin empezar', () => {
    // Simula "La pareja" en un evento que no es boda: el llamador ni siquiera incluye sus preguntas.
    const result = computeConfiguratorSummary([q({ sectionKey: 'comida', key: 'a', status: 'decidida' })])
    expect(result.sectionsWithPending.find((s) => s.sectionKey === 'pareja')).toBeUndefined()
    expect(result.notStartedSections.find((s) => s.sectionKey === 'pareja')).toBeUndefined()
  })
})
