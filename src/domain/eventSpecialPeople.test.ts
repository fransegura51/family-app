import { describe, expect, it } from 'vitest'
import {
  desiredForEspecialComplementos,
  desiredForEspecialRegalos,
  ESPECIAL_COMPLEMENTOS_QUESTION_KEY,
  ESPECIAL_HAY_QUESTION_KEY,
  ESPECIAL_REGALOS_QUESTION_KEY,
  ESPECIAL_VESTIMENTA_QUESTION_KEY,
  FAMILIARES_NECESIDADES_QUESTION_KEY,
  listEspecialBlockQuestions,
  listFamiliaresBlockQuestions,
  rolePeopleByRole,
  suggestGuestMatches,
} from '@/domain/eventSpecialPeople'
import type { EventDecision } from '@/domain/types'

function makeDecision(questionKey: string, answer: Record<string, unknown>): EventDecision {
  return {
    id: `d-${questionKey}`,
    eventId: 'e1',
    familyId: 'f1',
    blockKey: 'personas_especiales',
    questionKey,
    answer,
    isCustomOption: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    createdBy: null,
  }
}

describe('suggestGuestMatches — sugiere, nunca vincula (eso lo decide quien llama)', () => {
  const candidates = [{ id: 'g1', name: 'María López' }, { id: 'g2', name: 'Juan Pérez' }]

  it('coincide ignorando mayúsculas y acentos', () => {
    expect(suggestGuestMatches('maria lopez', candidates)).toEqual([{ id: 'g1', name: 'María López' }])
  })
  it('coincide con un nombre parcial (solo el nombre de pila) si tiene al menos 3 caracteres', () => {
    expect(suggestGuestMatches('María', candidates)).toEqual([{ id: 'g1', name: 'María López' }])
  })
  it('nunca sugiere con menos de 3 caracteres (evita falsos positivos)', () => {
    expect(suggestGuestMatches('Jo', candidates)).toEqual([])
  })
  it('sin ninguna coincidencia real: lista vacía', () => {
    expect(suggestGuestMatches('Pedro Sánchez', candidates)).toEqual([])
  })
})

describe('listEspecialBlockQuestions — revelado progresivo: vestimenta/complementos/regalos solo si hay personas reales', () => {
  it('sin ninguna decisión: solo la pregunta inicial, "sin empezar"', () => {
    const qs = listEspecialBlockQuestions([], 0)
    expect(qs).toEqual([{ questionKey: ESPECIAL_HAY_QUESTION_KEY, blockKey: 'personas_especiales', label: '¿Habrá personas con un papel especial?', status: 'sin_empezar' }])
  })
  it('"Sí" respondido pero el roster todavía vacío: las preguntas conjuntas no son relevantes todavía', () => {
    const decisions = [makeDecision(ESPECIAL_HAY_QUESTION_KEY, { choice: 'si' })]
    const qs = listEspecialBlockQuestions(decisions, 0)
    expect(qs).toHaveLength(1)
  })
  it('"Sí" + al menos una persona en el roster: las 3 preguntas conjuntas se revelan', () => {
    const decisions = [makeDecision(ESPECIAL_HAY_QUESTION_KEY, { choice: 'si' })]
    const qs = listEspecialBlockQuestions(decisions, 1)
    expect(qs.map((q) => q.questionKey)).toEqual([ESPECIAL_HAY_QUESTION_KEY, ESPECIAL_VESTIMENTA_QUESTION_KEY, ESPECIAL_COMPLEMENTOS_QUESTION_KEY, ESPECIAL_REGALOS_QUESTION_KEY])
  })
  it('"No": nunca revela las preguntas conjuntas, aunque hubiera gente en el roster de antes', () => {
    const decisions = [makeDecision(ESPECIAL_HAY_QUESTION_KEY, { choice: 'no' })]
    expect(listEspecialBlockQuestions(decisions, 3)).toHaveLength(1)
  })
  it('"Todavía no lo sabemos" cuenta como pregunta inicial pendiente, no como "sin empezar"', () => {
    const decisions = [makeDecision(ESPECIAL_HAY_QUESTION_KEY, { choice: 'todavia_no_lo_sabemos' })]
    expect(listEspecialBlockQuestions(decisions, 0)[0].status).toBe('por_decidir')
  })
})

describe('desiredForEspecialComplementos/Regalos — UN preparativo general, nunca uno por persona', () => {
  it('complementos "ninguno" o "todavía no lo sabemos": nada', () => {
    expect(desiredForEspecialComplementos({ choice: 'ninguno', selectedPersonIds: [], selected: [], customItems: [], note: null }).taskTitle).toBeNull()
    expect(desiredForEspecialComplementos({ choice: 'todavia_no_lo_sabemos', selectedPersonIds: [], selected: [], customItems: [], note: null }).taskTitle).toBeNull()
  })
  it('complementos "todos" sin ningún ítem marcado todavía: nada (no se interpreta una selección vacía)', () => {
    expect(desiredForEspecialComplementos({ choice: 'todos', selectedPersonIds: [], selected: [], customItems: [], note: null }).taskTitle).toBeNull()
  })
  it('complementos con al menos un ítem: UN preparativo general', () => {
    const d = desiredForEspecialComplementos({ choice: 'todos', selectedPersonIds: [], selected: ['Ramo'], customItems: [], note: null })
    expect(d.taskTitle).toBe('Preparar complementos de personas especiales')
    expect(d.budgetCategory).toBeNull()
  })
  it('regalos "ninguno"/"todavía no lo sabemos": nada — nunca se da por hecho que habrá regalos', () => {
    expect(desiredForEspecialRegalos({ choice: 'ninguno', selectedPersonIds: [] }).taskTitle).toBeNull()
    expect(desiredForEspecialRegalos({ choice: 'todavia_no_lo_sabemos', selectedPersonIds: [] }).taskTitle).toBeNull()
  })
  it('regalos "todos"/"algunos": UN preparativo general "Decidir regalos para personas especiales"', () => {
    expect(desiredForEspecialRegalos({ choice: 'todos', selectedPersonIds: [] }).taskTitle).toBe('Decidir regalos para personas especiales')
    expect(desiredForEspecialRegalos({ choice: 'algunos', selectedPersonIds: ['p1'] }).taskTitle).toBe('Decidir regalos para personas especiales')
  })
})

describe('listFamiliaresBlockQuestions — relevante solo con al menos un familiar ya añadido', () => {
  it('roster vacío: ninguna pregunta (nunca "sin empezar" artificial)', () => {
    expect(listFamiliaresBlockQuestions([], 0)).toEqual([])
  })
  it('con al menos un familiar: UNA sola pregunta conjunta', () => {
    const qs = listFamiliaresBlockQuestions([], 2)
    expect(qs).toEqual([{ questionKey: FAMILIARES_NECESIDADES_QUESTION_KEY, blockKey: 'familiares', label: '¿Qué necesitan los familiares?', status: 'sin_empezar' }])
  })
})

describe('rolePeopleByRole — agrupa personas por papel, varias personas por papel y varios papeles por persona', () => {
  it('una persona con dos papeles aparece en los dos grupos', () => {
    const map = rolePeopleByRole([{ id: 'p1', roles: ['Testigo', 'Padrino'] }])
    expect(map.get('Testigo')).toEqual(['p1'])
    expect(map.get('Padrino')).toEqual(['p1'])
  })
  it('varias personas con el mismo papel se agrupan juntas, en orden', () => {
    const map = rolePeopleByRole([
      { id: 'p1', roles: ['Testigo'] },
      { id: 'p2', roles: ['Testigo'] },
    ])
    expect(map.get('Testigo')).toEqual(['p1', 'p2'])
  })
  it('una persona sin ningún papel todavía se agrupa bajo "Sin papel asignado"', () => {
    const map = rolePeopleByRole([{ id: 'p1', roles: [] }])
    expect(map.get('Sin papel asignado')).toEqual(['p1'])
  })
})
