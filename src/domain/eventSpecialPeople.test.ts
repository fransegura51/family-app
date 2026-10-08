import { describe, expect, it } from 'vitest'
import {
  desiredForEspecialComplementosPorPersona,
  desiredForEspecialRegalos,
  ESPECIAL_COMPLEMENTOS_QUESTION_KEY,
  ESPECIAL_HAY_QUESTION_KEY,
  ESPECIAL_REGALOS_QUESTION_KEY,
  ESPECIAL_VESTIMENTA_QUESTION_KEY,
  FAMILIARES_NECESIDADES_QUESTION_KEY,
  listEspecialBlockQuestions,
  listFamiliaresBlockQuestions,
  normalizeComplementosAnswer,
  resolveEspecialScopePersonIds,
  rolePeopleByRole,
  suggestGuestMatches,
  type ComplementosEspecialesAnswer,
} from '@/domain/eventSpecialPeople'
import type { EventDecision, EventRolePerson } from '@/domain/types'

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

describe('desiredForEspecialRegalos — UN preparativo general, nunca uno por persona', () => {
  it('regalos "ninguno"/"todavía no lo sabemos": nada — nunca se da por hecho que habrá regalos', () => {
    expect(desiredForEspecialRegalos({ choice: 'ninguno', selectedPersonIds: [] }).taskTitle).toBeNull()
    expect(desiredForEspecialRegalos({ choice: 'todavia_no_lo_sabemos', selectedPersonIds: [] }).taskTitle).toBeNull()
  })
  it('regalos "todos"/"algunos": UN preparativo general "Decidir regalos para personas especiales"', () => {
    expect(desiredForEspecialRegalos({ choice: 'todos', selectedPersonIds: [] }).taskTitle).toBe('Decidir regalos para personas especiales')
    expect(desiredForEspecialRegalos({ choice: 'algunos', selectedPersonIds: ['p1'] }).taskTitle).toBe('Decidir regalos para personas especiales')
  })
})

// Tanda "Preparativos desglosados" — sustituye al antiguo "un preparativo general para todo el grupo":
// ahora cada persona con al menos un complemento asignado genera SU PROPIO DesiredPairGeneration.
describe('desiredForEspecialComplementosPorPersona — UN preparativo POR PERSONA, nunca uno general para todo el grupo', () => {
  const maria: Pick<EventRolePerson, 'id' | 'name'> = { id: 'p-maria', name: 'María' }
  const ana: Pick<EventRolePerson, 'id' | 'name'> = { id: 'p-ana', name: 'Ana' }
  const peopleById = new Map([
    [maria.id, maria],
    [ana.id, ana],
  ])

  it('"ninguno" o "todavía no lo sabemos": ninguna persona genera nada', () => {
    expect(desiredForEspecialComplementosPorPersona({ choice: 'ninguno', selectedPersonIds: [], assignments: [{ personId: maria.id, items: ['Ramo'], customItems: [] }], note: null }, peopleById)).toEqual([])
    expect(
      desiredForEspecialComplementosPorPersona({ choice: 'todavia_no_lo_sabemos', selectedPersonIds: [], assignments: [{ personId: maria.id, items: ['Ramo'], customItems: [] }], note: null }, peopleById),
    ).toEqual([])
  })
  it('una persona sin ningún ítem asignado todavía: no genera nada para ella (no se interpreta una asignación vacía)', () => {
    const out = desiredForEspecialComplementosPorPersona({ choice: 'todos', selectedPersonIds: [], assignments: [{ personId: maria.id, items: [], customItems: [] }], note: null }, peopleById)
    expect(out).toEqual([])
  })
  it('dos personas con complementos DISTINTOS: dos DesiredPairGeneration independientes, cada uno con el nombre y los ítems de SU persona', () => {
    const out = desiredForEspecialComplementosPorPersona(
      {
        choice: 'todos',
        selectedPersonIds: [],
        assignments: [
          { personId: maria.id, items: ['Prendido floral'], customItems: [] },
          { personId: ana.id, items: ['Ramo'], customItems: [] },
        ],
        note: null,
      },
      peopleById,
    )
    expect(out).toHaveLength(2)
    expect(out.find((o) => o.personId === maria.id)?.desired.taskTitle).toBe('María — Prendido floral')
    expect(out.find((o) => o.personId === ana.id)?.desired.taskTitle).toBe('Ana — Ramo')
  })
  it('varios complementos para UNA persona: todos en el mismo título, separados por coma', () => {
    const out = desiredForEspecialComplementosPorPersona({ choice: 'todos', selectedPersonIds: [], assignments: [{ personId: maria.id, items: ['Ramo', 'Tocado'], customItems: ['Pañuelo de la abuela'] }], note: null }, peopleById)
    expect(out[0].desired.taskTitle).toBe('María — Ramo, Tocado, Pañuelo de la abuela')
  })
  it('un ítem del catálogo (floral) agrupa en "Flores" — el mismo groupKind que desiredForFloral', () => {
    const out = desiredForEspecialComplementosPorPersona({ choice: 'todos', selectedPersonIds: [], assignments: [{ personId: maria.id, items: ['Ramo'], customItems: [] }], note: null }, peopleById)
    expect(out[0].desired.groupKind).toBe('flores')
    expect(out[0].desired.groupDefaultName).toBe('Flores')
  })
  it('un "+Otro" de texto libre NUNCA se da por floral — nada de coincidencias frágiles de texto', () => {
    const out = desiredForEspecialComplementosPorPersona({ choice: 'todos', selectedPersonIds: [], assignments: [{ personId: maria.id, items: [], customItems: ['Ramo de flores silvestres'] }], note: null }, peopleById)
    expect(out[0].desired.groupKind).toBeNull()
  })
  it('una persona que ya no existe en peopleById (borrada) se omite, sin lanzar error', () => {
    const out = desiredForEspecialComplementosPorPersona({ choice: 'todos', selectedPersonIds: [], assignments: [{ personId: 'persona-borrada', items: ['Ramo'], customItems: [] }], note: null }, peopleById)
    expect(out).toEqual([])
  })
})

describe('resolveEspecialScopePersonIds — reutilizado por vestimenta/complementos/regalos', () => {
  it('"todos" son TODAS las personas actuales del roster, nunca una lista guardada que pueda desfasarse', () => {
    expect(resolveEspecialScopePersonIds('todos', ['viejo-id-ya-no-existe'], ['p1', 'p2'])).toEqual(['p1', 'p2'])
  })
  it('"algunos" son justo las elegidas', () => {
    expect(resolveEspecialScopePersonIds('algunos', ['p1'], ['p1', 'p2'])).toEqual(['p1'])
  })
  it('"ninguno"/"todavía no lo sabemos" no afectan a nadie', () => {
    expect(resolveEspecialScopePersonIds('ninguno', [], ['p1'])).toEqual([])
    expect(resolveEspecialScopePersonIds('todavia_no_lo_sabemos', [], ['p1'])).toEqual([])
  })
})

describe('normalizeComplementosAnswer — migra una respuesta ANTIGUA sin perder lo que ya estaba marcado', () => {
  it('una respuesta que YA trae `assignments` se devuelve tal cual, sin reinterpretar', () => {
    const answer: ComplementosEspecialesAnswer = { choice: 'todos', selectedPersonIds: [], assignments: [{ personId: 'p1', items: ['Ramo'], customItems: [] }], note: null }
    expect(normalizeComplementosAnswer(answer, ['p1', 'p2'])).toBe(answer)
  })
  it('una respuesta ANTIGUA ("todos" + selected/customItems compartido) se migra: CADA persona del alcance recibe la MISMA asignación que ya tenía', () => {
    const legacy = { choice: 'todos', selectedPersonIds: [], selected: ['Ramo'], customItems: ['Pañuelo'], note: null } as unknown as ComplementosEspecialesAnswer
    const normalized = normalizeComplementosAnswer(legacy, ['p1', 'p2'])
    expect(normalized.assignments).toEqual([
      { personId: 'p1', items: ['Ramo'], customItems: ['Pañuelo'] },
      { personId: 'p2', items: ['Ramo'], customItems: ['Pañuelo'] },
    ])
  })
  it('una respuesta ANTIGUA "algunos" se migra solo para las personas que estaban en selectedPersonIds', () => {
    const legacy = { choice: 'algunos', selectedPersonIds: ['p1'], selected: ['Tocado'], customItems: [], note: null } as unknown as ComplementosEspecialesAnswer
    const normalized = normalizeComplementosAnswer(legacy, ['p1', 'p2'])
    expect(normalized.assignments).toEqual([{ personId: 'p1', items: ['Tocado'], customItems: [] }])
  })
  it('una respuesta ANTIGUA sin nada marcado (selected/customItems vacíos) migra a assignments vacío, sin inventar nada', () => {
    const legacy = { choice: 'todos', selectedPersonIds: [], selected: [], customItems: [], note: null } as unknown as ComplementosEspecialesAnswer
    expect(normalizeComplementosAnswer(legacy, ['p1']).assignments).toEqual([])
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
