import { describe, expect, it } from 'vitest'
import {
  classifyKind,
  computeFoodNeedsState,
  conflictInputsSignature,
  dietaryNeedLines,
  DIETARY_CATEGORIES,
  findMenuConflicts,
  FOOD_SAFETY_DISCLAIMER,
  foodNeedsBanner,
  needAttends,
  needsReviewApplies,
  suggestDietaryNeeds,
  suggestFromGuestNotes,
} from '@/domain/eventDietaryNeeds'
import { computeEventConclusions } from '@/domain/events'
import { makeGuest, makeMember, makeMenuItem, makeNeed } from '@/domain/eventFoodFixtures'

describe('Necesidades alimentarias AM–AN — notas, necesidades y texto original', () => {
  it('una necesidad conserva el texto ORIGINAL declarado, la clasificación operativa, la persona y el tipo', () => {
    const need = makeNeed({ originalText: 'Intolerancia a la lactosa', category: 'lactosa', kind: 'intolerancia', guestId: 'g1', memberId: 'm1' })
    expect(need.originalText).toBe('Intolerancia a la lactosa')
    expect(need.category).toBe('lactosa')
    expect(DIETARY_CATEGORIES[need.category].label).toBe('Sin lactosa')
    expect(need.guestId).toBe('g1')
    expect(need.memberId).toBe('m1')
    expect(need.kind).toBe('intolerancia')
  })
  it('las notas siguen siendo notas: PEPA solo SUGIERE; no cuenta nada hasta que se confirma', () => {
    const guests = [makeGuest({ id: 'g1', displayName: 'Ana', notes: 'Alergia a las nueces', rsvpStatus: 'confirmado' })]
    const suggestions = suggestFromGuestNotes(guests, [])
    expect(suggestions).toEqual([{ guestId: 'g1', guestName: 'Ana', noteSource: 'nota', text: 'Alergia a las nueces', category: 'frutos_secos', kind: 'alergia' }])
    expect(computeFoodNeedsState(guests, [], []).activeNeeds).toEqual([])
  })
  it('no se sugiere lo que ya está registrado como necesidad', () => {
    const guests = [makeGuest({ id: 'g1', notes: 'alergia a las nueces' })]
    expect(suggestFromGuestNotes(guests, [makeNeed({ guestId: 'g1', category: 'frutos_secos' })])).toEqual([])
  })
  it('las sugerencias también salen de la nota que dejó el invitado en el RSVP', () => {
    const guests = [makeGuest({ id: 'g1', rsvpNote: 'Soy celíaca' })]
    expect(suggestFromGuestNotes(guests, [])[0]).toMatchObject({ noteSource: 'rsvp', category: 'gluten', kind: 'celiaquia' })
  })
  it('quien no asiste no genera sugerencias', () => {
    expect(suggestFromGuestNotes([makeGuest({ notes: 'alergia al huevo', rsvpStatus: 'no_asiste' })], [])).toEqual([])
  })
})

describe('Necesidades alimentarias AO — normalización para ORGANIZAR, no para diagnosticar', () => {
  it('«Intolerancia a la lactosa» → «Sin lactosa» sin alterar lo declarado', () => {
    const [s] = suggestDietaryNeeds('Intolerancia a la lactosa')
    expect(s).toEqual({ category: 'lactosa', kind: 'intolerancia' })
    expect(DIETARY_CATEGORIES[s.category].label).toBe('Sin lactosa')
  })
  it('celiaquía, alergia al trigo y preferencia «sin gluten» NO se igualan médicamente', () => {
    expect(suggestDietaryNeeds('celíaco')[0]).toEqual({ category: 'gluten', kind: 'celiaquia' })
    expect(suggestDietaryNeeds('alergia al trigo')[0]).toEqual({ category: 'gluten', kind: 'alergia' })
    // «sin gluten» a secas no dice qué es: el tipo NO se adivina
    expect(suggestDietaryNeeds('sin gluten')[0]).toEqual({ category: 'gluten', kind: null })
    expect(classifyKind('prefiere comer sin gluten', 'gluten')).toBe('preferencia')
  })
  it('reconoce otras categorías y varias a la vez en un mismo texto', () => {
    expect(suggestDietaryNeeds('alergia a frutos secos y marisco').map((s) => s.category)).toEqual(['frutos_secos', 'marisco'])
    expect(suggestDietaryNeeds('vegana')[0]).toEqual({ category: 'vegano', kind: 'dieta' })
    expect(suggestDietaryNeeds('no come cerdo')[0].category).toBe('sin_cerdo')
    expect(suggestDietaryNeeds('alergia a las gambas')[0].category).toBe('marisco')
  })
  it('un texto sin nada reconocible no inventa ninguna categoría', () => {
    expect(suggestDietaryNeeds('sin alergias')).toEqual([])
    expect(suggestDietaryNeeds('')).toEqual([])
    expect(suggestDietaryNeeds(null)).toEqual([])
    expect(suggestDietaryNeeds('le gusta mucho el chocolate')).toEqual([])
  })
})

describe('Resumen provisional AP y aviso con todos confirmados AQ/AR', () => {
  const needGluten = (guestId: string, memberId: string | null = null) => makeNeed({ id: `n-${guestId}-${memberId}`, guestId, memberId, category: 'gluten', kind: null, originalText: 'sin gluten' })
  const needNuts = makeNeed({ id: 'n-nuts', guestId: 'g3' })

  it('AP. con respuestas pendientes → «Información provisional · faltan N personas por confirmar.» + líneas', () => {
    const guests = [
      makeGuest({ id: 'g1', rsvpStatus: 'confirmado' }),
      makeGuest({ id: 'g2', rsvpStatus: 'confirmado' }),
      makeGuest({ id: 'g3', rsvpStatus: 'confirmado' }),
      makeGuest({ id: 'g4', rsvpStatus: 'pendiente', adultsCount: 2, childrenCount: 1 }),
      makeGuest({ id: 'g5', rsvpStatus: 'no_seguro' }),
    ]
    const state = computeFoodNeedsState(guests, [], [needGluten('g1'), needGluten('g2'), needNuts])
    expect(state.allConfirmed).toBe(false)
    expect(state.pendingPeople).toBe(4)
    const banner = foodNeedsBanner(state)
    expect(banner.kind).toBe('provisional')
    if (banner.kind === 'provisional') {
      expect(banner.title).toBe('Información provisional · faltan 4 personas por confirmar.')
      expect(banner.lines).toEqual(['2 necesitan comida sin gluten', '1 ha indicado alergia a los frutos secos'])
    }
  })
  it('singular: falta 1 persona', () => {
    const state = computeFoodNeedsState([makeGuest({ id: 'g1', rsvpStatus: 'pendiente' }), makeGuest({ id: 'g2', rsvpStatus: 'confirmado' })], [], [])
    const banner = foodNeedsBanner(state)
    if (banner.kind === 'provisional') expect(banner.title).toBe('Información provisional · falta 1 persona por confirmar.')
    else throw new Error('esperaba provisional')
  })
  it('AQ. todos confirmados + necesidades → alerta con el texto pedido y el resumen', () => {
    const guests = [makeGuest({ id: 'g1', rsvpStatus: 'confirmado' }), makeGuest({ id: 'g3', rsvpStatus: 'confirmado' }), makeGuest({ id: 'g9', rsvpStatus: 'no_asiste' })]
    const state = computeFoodNeedsState(guests, [], [needGluten('g1'), needNuts])
    expect(state.allConfirmed).toBe(true)
    expect(needsReviewApplies(state)).toBe(true)
    const banner = foodNeedsBanner(state)
    expect(banner).toMatchObject({
      kind: 'alerta',
      title: '⚠️ Ya han confirmado todos los invitados. Entre los asistentes hay necesidades alimentarias que conviene revisar antes de cerrar el menú.',
    })
  })
  it('AR. todos confirmados SIN necesidades → mensaje positivo (nunca «no hay ningún alérgico»)', () => {
    const state = computeFoodNeedsState([makeGuest({ rsvpStatus: 'confirmado' })], [], [])
    const banner = foodNeedsBanner(state)
    expect(banner).toEqual({ kind: 'positivo', title: '✓ Ya han confirmado todos los invitados. No hay necesidades alimentarias declaradas entre los asistentes.', lines: [] })
    expect(banner.kind === 'positivo' && banner.title.toLowerCase()).not.toContain('ningún alérgico')
    expect(needsReviewApplies(state)).toBe(false)
  })
  it('las necesidades de quien no asiste, o de una persona que dijo «no viene», no cuentan', () => {
    const guests = [makeGuest({ id: 'g1', rsvpStatus: 'confirmado' }), makeGuest({ id: 'g2', rsvpStatus: 'no_asiste' })]
    const members = [makeMember({ id: 'm1', guestId: 'g1', rsvpAttending: false })]
    expect(needAttends(needGluten('g2'), guests, members)).toBe(false)
    expect(needAttends(needGluten('g1', 'm1'), guests, members)).toBe(false)
    expect(needAttends(needGluten('g1'), guests, members)).toBe(true)
    expect(computeFoodNeedsState(guests, members, [needGluten('g2'), needGluten('g1', 'm1')]).activeNeeds).toEqual([])
  })
  it('sin invitados no hay ni alerta ni mensaje positivo', () => {
    expect(foodNeedsBanner(computeFoodNeedsState([], [], []))).toEqual({ kind: 'sin_invitados' })
  })
  it('las líneas separan alergia de necesidad y cuentan personas distintas', () => {
    const lines = dietaryNeedLines([
      makeNeed({ id: 'a', guestId: 'g1', category: 'marisco', kind: 'alergia' }),
      makeNeed({ id: 'b', guestId: 'g2', category: 'marisco', kind: 'alergia' }),
      makeNeed({ id: 'c', guestId: 'g3', category: 'lactosa', kind: 'intolerancia' }),
    ])
    expect(lines).toEqual(['2 han indicado alergia al marisco', '1 necesita comida sin lactosa'])
  })
})

describe('Aviso persistente AS/AT — aparece cuando confirma el último, sin depender del configurador', () => {
  const base = { rsvpDeadline: null, guests: [], tasks: [], payments: [], plannedBudget: 0, spentBudget: null }
  it('con todos confirmados, necesidades y sin revisar → conclusión visible en el evento', () => {
    const c = computeEventConclusions({ ...base, foodNeeds: { allConfirmed: true, hasNeeds: true, reviewed: false } })
    expect(c.map((x) => x.id)).toContain('food-needs-review')
  })
  it('desaparece sola cuando se revisa, y no aparece sin necesidades o con confirmaciones pendientes', () => {
    expect(computeEventConclusions({ ...base, foodNeeds: { allConfirmed: true, hasNeeds: true, reviewed: true } })).toEqual([])
    expect(computeEventConclusions({ ...base, foodNeeds: { allConfirmed: true, hasNeeds: false, reviewed: false } })).toEqual([])
    expect(computeEventConclusions({ ...base, foodNeeds: { allConfirmed: false, hasNeeds: true, reviewed: false } })).toEqual([])
  })
  it('sin el dato nuevo (llamadas antiguas) el comportamiento es exactamente el de siempre', () => {
    expect(computeEventConclusions(base)).toEqual([])
  })
})

describe('Cruce menú ↔ necesidades AS–AV — posible conflicto, nunca garantía', () => {
  const dish = (name: string, id = name) => makeMenuItem({ id, name })
  it('«Cóctel de gambas» + alergia al marisco → aviso con el texto pedido', () => {
    const conflicts = findMenuConflicts([dish('Cóctel de gambas')], [makeNeed({ category: 'marisco', kind: 'alergia' })])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].message).toBe('⚠️ Conviene revisar ‘Cóctel de gambas’: entre los asistentes hay una persona que ha indicado alergia al marisco.')
  })
  it('detecta nueces → frutos secos, pan/pasta → gluten, queso → lácteos/lactosa, tortilla → huevo', () => {
    expect(findMenuConflicts([dish('Tarta de nueces')], [makeNeed({ category: 'frutos_secos' })])).toHaveLength(1)
    expect(findMenuConflicts([dish('Macarrones con tomate')], [makeNeed({ category: 'gluten', kind: null })])).toHaveLength(1)
    expect(findMenuConflicts([dish('Tabla de quesos')], [makeNeed({ category: 'lactosa', kind: 'intolerancia' })])).toHaveLength(1)
    expect(findMenuConflicts([dish('Tabla de quesos')], [makeNeed({ category: 'lacteos', kind: 'alergia' })])).toHaveLength(1)
    expect(findMenuConflicts([dish('Tortilla de patata')], [makeNeed({ category: 'huevo', kind: 'alergia' })])).toHaveLength(1)
  })
  it('también mira la nota del plato', () => {
    const conflicts = findMenuConflicts([makeMenuItem({ name: 'Salsa de la casa', notes: 'lleva almendras' })], [makeNeed({ category: 'frutos_secos' })])
    expect(conflicts).toHaveLength(1)
  })
  it('varias personas: «N personas que…» y el verbo cambia si no es alergia', () => {
    const needs = [makeNeed({ id: 'a', guestId: 'g1', category: 'gluten', kind: null }), makeNeed({ id: 'b', guestId: 'g2', category: 'gluten', kind: null })]
    expect(findMenuConflicts([dish('Pizza')], needs)[0].message).toBe('⚠️ Conviene revisar ‘Pizza’: entre los asistentes hay 2 personas que necesitan comida sin gluten.')
  })
  it('que no haya conflicto NO se presenta como garantía: el aviso de seguridad lo dice explícitamente', () => {
    expect(findMenuConflicts([dish('Ensalada verde')], [makeNeed({ category: 'marisco' })])).toEqual([])
    expect(FOOD_SAFETY_DISCLAIMER).toContain('no significa que el menú sea seguro')
    expect(FOOD_SAFETY_DISCLAIMER).toContain('restaurante o el proveedor')
    for (const c of findMenuConflicts([dish('Cóctel de gambas')], [makeNeed({ category: 'marisco' })])) {
      expect(c.message.toLowerCase()).not.toContain('es seguro')
      expect(c.message.toLowerCase()).not.toContain('sin riesgo')
    }
  })
  it('no marca coincidencias a medias («panceta» no es «pan»; «ron» no está en «croquetas»)', () => {
    expect(findMenuConflicts([dish('Panceta ibérica')], [makeNeed({ category: 'gluten' })])).toEqual([])
    expect(findMenuConflicts([dish('Croquetas caseras')], [makeNeed({ category: 'sin_alcohol' })])).toEqual([])
  })
  it('una necesidad «otra» no se cruza con nada (no se inventa un cruce)', () => {
    expect(findMenuConflicts([dish('Cualquier plato')], [makeNeed({ category: 'otra' })])).toEqual([])
  })
  it('AV. la huella cambia cuando cambia el menú, las necesidades o la asistencia (y solo entonces)', () => {
    const a = conflictInputsSignature([dish('Pizza')], [makeNeed()])
    expect(conflictInputsSignature([dish('Pizza')], [makeNeed()])).toBe(a)
    expect(conflictInputsSignature([dish('Pizza'), dish('Paella')], [makeNeed()])).not.toBe(a)
    expect(conflictInputsSignature([dish('Pizza')], [makeNeed({ category: 'gluten' })])).not.toBe(a)
    expect(conflictInputsSignature([dish('Pizza')], [])).not.toBe(a)
  })
})
