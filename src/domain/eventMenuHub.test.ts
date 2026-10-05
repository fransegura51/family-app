import { describe, expect, it } from 'vitest'
import { buildFoodContext, type FoodContext } from '@/domain/eventFood'
import { computeFoodNeedsState, findMenuConflicts } from '@/domain/eventDietaryNeeds'
import {
  DEFAULT_VISIBLE_SECTION_KEYS,
  addCustomSection,
  canHideSection,
  categoryForSection,
  computeDiners,
  conflictInfo,
  defaultSections,
  dishHasKitchenTools,
  dishOrigin,
  foodQuestionResults,
  groupNeeds,
  menuToolsMode,
  normalizeStoredSections,
  removeCustomSection,
  reorderVisibleSections,
  resolveMenuSections,
  setSectionHidden,
  showKitchenLinks,
  unclassifiedQuestions,
} from '@/domain/eventMenuHub'
import { VENUE_SERVICES_QUESTION_KEY } from '@/domain/eventVenueServices'
import { makeDecision, makeEvent, makeGuest, makeMember, makeMenuItem, makeNeed } from '@/domain/eventFoodFixtures'
import type { EventDecision, EventGuestQuestion, EventGuestQuestionAnswer, EventGuestQuestionOption } from '@/domain/types'

const casa = makeDecision('lugar.contexto', { choice: 'en_casa' })
const contratado = makeDecision('lugar.contexto', { choice: 'restaurante_local' })
const venueIncl = (...selected: string[]) => makeDecision(VENUE_SERVICES_QUESTION_KEY, { choice: 'seleccionar', selected, customItems: [] })
const quien = (choice: string, extra: Record<string, unknown> = {}) => makeDecision('comida.quien', { choice, ...extra })
const ctxOf = (decisions: EventDecision[]): FoodContext => buildFoodContext(makeEvent(), decisions, [], null)

describe('El origen de la comida gobierna las herramientas (27–32)', () => {
  it('29. preparado en casa / lo preparamos nosotros → SÍ Recetas y Compras', () => {
    const mode = menuToolsMode(ctxOf([casa, quien('nosotros')]))
    expect(mode).toBe('familia')
    expect(showKitchenLinks(mode)).toBe(true)
    expect(dishHasKitchenTools(mode, null)).toBe(true)
  })
  it('27. restaurante / catering → NO Recetas ni Compras', () => {
    for (const choice of ['restaurante', 'catering']) {
      const mode = menuToolsMode(ctxOf([contratado, quien(choice)]))
      expect(mode).toBe('proveedor')
      expect(showKitchenLinks(mode)).toBe(false)
      expect(dishHasKitchenTools(mode, null)).toBe(false)
      expect(dishHasKitchenTools(mode, 'familia')).toBe(false) // aunque el plato diga «familia»: manda el evento
    }
  })
  it('28. comida incluida en el lugar → NO Recetas ni Compras (aunque antes se hubiera respondido «nosotros»)', () => {
    expect(menuToolsMode(ctxOf([contratado, venueIncl('comida')]))).toBe('proveedor')
    expect(menuToolsMode(ctxOf([contratado, venueIncl('comida'), quien('nosotros')]))).toBe('proveedor')
    expect(showKitchenLinks('proveedor')).toBe(false)
  })
  it('30. combinado → herramientas SOLO para la parte propia (por plato, nunca por el nombre)', () => {
    const mode = menuToolsMode(ctxOf([casa, quien('combinar', { combinar: ['nosotros', 'catering'] })]))
    expect(mode).toBe('mixto')
    expect(showKitchenLinks(mode)).toBe(true)
    expect(dishHasKitchenTools(mode, 'familia')).toBe(true) // «Paella: la preparamos nosotros»
    expect(dishHasKitchenTools(mode, 'proveedor')).toBe(false) // «Tarta: restaurante»
    expect(dishHasKitchenTools(mode, null)).toBe(false) // sin indicar: PEPA no lo adivina
    expect(dishOrigin(mode, 'familia')).toBe('familia')
    expect(dishOrigin(mode, null)).toBeNull()
  })
  it('combinar sin la familia = proveedor; solo la familia = familia; vacío = todavía no se sabe', () => {
    expect(menuToolsMode(ctxOf([casa, quien('combinar', { combinar: ['catering', 'restaurante'] })]))).toBe('proveedor')
    expect(menuToolsMode(ctxOf([casa, quien('combinar', { combinar: ['nosotros'] })]))).toBe('familia')
    expect(menuToolsMode(ctxOf([casa, quien('combinar', { combinar: [] })]))).toBe('esperando')
  })
  it('31. todavía no sabemos / sin respuesta / «otro» → no se muestran herramientas', () => {
    for (const decisions of [[casa, quien('todavia_no_lo_sabemos')], [casa], [casa, quien('otro', { customLabel: 'algo' })]]) {
      const mode = menuToolsMode(ctxOf(decisions))
      expect(mode).toBe('esperando')
      expect(showKitchenLinks(mode)).toBe(false)
      expect(dishHasKitchenTools(mode, 'familia')).toBe(false)
    }
  })
  it('32. no habrá comida → estado propio, sin herramientas', () => {
    const mode = menuToolsMode(ctxOf([casa, quien('no_habra')]))
    expect(mode).toBe('sin_comida')
    expect(showKitchenLinks(mode)).toBe(false)
  })
})

describe('Secciones del menú (9–14)', () => {
  const sec = (key: string) => defaultSections(false).find((s) => s.key === key)!

  it('9. de partida se ven pocas (no hace falta usar todas) y el resto está a un toque', () => {
    const visible = defaultSections(false).filter((s) => !s.hidden).map((s) => s.key)
    expect(visible).toEqual(DEFAULT_VISIBLE_SECTION_KEYS)
    expect(sec('bebidas').hidden).toBe(true)
    expect(sec('cena').hidden).toBe(true)
  })
  it('«Menú infantil» se ve de partida solo si Invitados ya marcó que lo necesitáis', () => {
    expect(defaultSections(false).find((s) => s.key === 'menu_infantil')?.hidden).toBe(true)
    expect(defaultSections(true).find((s) => s.key === 'menu_infantil')?.hidden).toBe(false)
  })
  it('10. ocultar una sección vacía; 11. recuperarla', () => {
    const config = defaultSections(false)
    const resolved = resolveMenuSections(config, [], false)
    const entrantes = resolved.visible.find((v) => v.key === 'entrantes')!
    expect(canHideSection(entrantes)).toBe(true)
    const hiddenCfg = setSectionHidden(config, 'entrantes', true)
    const after = resolveMenuSections(hiddenCfg, [], false)
    expect(after.visible.some((v) => v.key === 'entrantes')).toBe(false)
    expect(after.hidden.some((v) => v.key === 'entrantes')).toBe(true)
    const back = resolveMenuSections(setSectionHidden(hiddenCfg, 'entrantes', false), [], false)
    expect(back.visible.some((v) => v.key === 'entrantes')).toBe(true)
  })
  it('12. una sección CON platos no se puede ocultar y, aunque estuviera marcada oculta, SIGUE VISIBLE: nunca se pierden platos', () => {
    const items = [makeMenuItem({ id: 'a', name: 'Gamba blanca', category: 'Entrantes' }), makeMenuItem({ id: 'b', name: 'Tarta', category: 'Postre' })]
    const resolved = resolveMenuSections(defaultSections(false), items, false)
    const entrantes = resolved.visible.find((v) => v.key === 'entrantes')!
    expect(entrantes.items.map((i) => i.name)).toEqual(['Gamba blanca'])
    expect(canHideSection(entrantes)).toBe(false)
    // Aunque alguien guardara la sección como oculta (otro dispositivo, importación…), sus platos se ven
    const forced = resolveMenuSections(setSectionHidden(defaultSections(false), 'bebidas', true), [makeMenuItem({ category: 'Bebidas' })], false)
    const bebidas = forced.visible.find((v) => v.key === 'bebidas')!
    expect(bebidas.forced).toBe(true)
    expect(bebidas.items).toHaveLength(1)
  })
  it('una importación en una sección oculta la hace visible (con sus platos), sin tocar nada más', () => {
    const resolved = resolveMenuSections(defaultSections(false), [makeMenuItem({ category: 'Cena' })], false)
    expect(resolved.visible.map((v) => v.key)).toContain('cena')
  })
  it('13. crear una sección personalizada; no admite vacía ni repetida (si existe, se vuelve a mostrar)', () => {
    const config = defaultSections(false)
    const added = addCustomSection(config, '  Platos para llevar ')
    expect(added.error).toBeNull()
    expect(added.config.at(-1)).toMatchObject({ label: 'Platos para llevar', custom: true, hidden: false })
    expect(addCustomSection(config, '   ').error).toBeTruthy()
    // repetida (sin acentos/mayúsculas) → no duplica
    const twice = addCustomSection(added.config, 'platos para LLEVAR')
    expect(twice.revived).toBe(true)
    expect(twice.config.filter((s) => s.custom)).toHaveLength(1)
    // una del catálogo oculta (por su alias «Principal») se vuelve a mostrar en vez de duplicarse
    const hiddenPrincipal = setSectionHidden(config, 'plato_principal', true)
    const revived = addCustomSection(hiddenPrincipal, 'Principal')
    expect(revived.revived).toBe(true)
    expect(revived.config.find((s) => s.key === 'plato_principal')?.hidden).toBe(false)
    expect(revived.config.some((s) => s.custom)).toBe(false)
  })
  it('los platos de una sección personalizada se agrupan por su nombre', () => {
    const config = addCustomSection(defaultSections(false), 'Platos para llevar').config
    const resolved = resolveMenuSections(config, [makeMenuItem({ id: 'x', category: 'platos para llevar' })], false)
    expect(resolved.visible.find((v) => v.custom)?.items.map((i) => i.id)).toEqual(['x'])
  })
  it('una sección propia vacía se puede quitar del todo; las del catálogo no (solo se ocultan)', () => {
    const config = addCustomSection(defaultSections(false), 'Extra').config
    const key = config.find((s) => s.custom)!.key
    expect(removeCustomSection(config, key).some((s) => s.custom)).toBe(false)
    expect(removeCustomSection(config, 'entrantes').length).toBe(config.length)
  })
  it('14. ordenar secciones: las visibles se reordenan y las ocultas conservan su sitio', () => {
    const config = defaultSections(false)
    const visible = config.filter((s) => !s.hidden).map((s) => s.key)
    const reordered = reorderVisibleSections(config, [visible[2], visible[0], visible[1], visible[3]])
    expect(reordered.filter((s) => !s.hidden).map((s) => s.key)).toEqual([visible[2], visible[0], visible[1], visible[3]])
    // las ocultas siguen en sus posiciones originales
    config.forEach((s, i) => {
      if (s.hidden) expect(reordered[i].key).toBe(s.key)
    })
    expect(reordered).toHaveLength(config.length)
  })
  it('platos con una sección que no es del catálogo ni propia (datos antiguos) se muestran aparte: nada se descarta', () => {
    const items = [makeMenuItem({ id: 'u', category: 'Barbacoa del jardín' }), makeMenuItem({ id: 'n', category: null })]
    const resolved = resolveMenuSections(defaultSections(false), items, false)
    const virtuals = resolved.visible.filter((v) => v.virtual)
    expect(virtuals.map((v) => v.label).sort()).toEqual(['Barbacoa del jardín', 'Sin sección'])
    expect(virtuals.every((v) => !canHideSection(v))).toBe(true)
    expect(categoryForSection({ label: 'Sin sección', virtual: true })).toBeNull()
    expect(categoryForSection({ label: 'Entrantes', virtual: false })).toBe('Entrantes')
  })
  it('datos de prueba antiguos con «Principal», «Postre», «Snacks» o «Chuches» caen en sus secciones (sin reescribir nada)', () => {
    const items = ['Principal', 'Postre', 'Snacks', 'Chuches', 'Bebidas'].map((category, i) => makeMenuItem({ id: String(i), category }))
    const resolved = resolveMenuSections(defaultSections(false), items, false)
    expect(resolved.visible.filter((v) => v.virtual)).toHaveLength(0)
  })
  it('lo guardado se valida: basura descartada, nuevas secciones del catálogo añadidas ocultas, sin configurar = null', () => {
    expect(normalizeStoredSections(null)).toBeNull()
    expect(normalizeStoredSections([])).toBeNull()
    expect(normalizeStoredSections([{ nada: 1 }, 7, null])).toBeNull()
    const ok = normalizeStoredSections([{ key: 'entrantes', label: 'lo que sea', hidden: false }, { key: 'custom:x', label: 'Mi sección', hidden: true }, { key: 'entrantes', label: 'repetida' }])
    expect(ok).toEqual([
      { key: 'entrantes', label: 'Entrantes', hidden: false },
      { key: 'custom:x', label: 'Mi sección', hidden: true, custom: true },
    ])
    const resolved = resolveMenuSections(ok, [], false)
    expect(resolved.config.length).toBeGreaterThan(2) // el resto del catálogo, oculto, disponible
  })
})

describe('Comensales (19–24)', () => {
  const g = (id: string, rsvpStatus: 'pendiente' | 'confirmado' | 'no_asiste' | 'no_seguro', over = {}) => makeGuest({ id, displayName: id, rsvpStatus, adultsCount: 2, childrenCount: 1, ...over })

  it('19–21. totales: confirmados con adultos y niños, pendientes y quién ha respondido', () => {
    const guests = [g('a', 'confirmado', { rsvpAdultsCount: 2, rsvpChildrenCount: 1 }), g('b', 'confirmado', { rsvpAdultsCount: 1, rsvpChildrenCount: null, childrenCount: 2 }), g('c', 'pendiente'), g('d', 'no_seguro'), g('e', 'no_asiste')]
    const d = computeDiners(guests)
    expect(d.confirmedGuests).toBe(2)
    expect(d.confirmedAdults).toBe(3)
    expect(d.confirmedChildren).toBe(3) // 1 + (rsvp null → lo declarado: 2)
    expect(d.confirmedPeople).toBe(6)
    expect(d.openGuests).toBe(2)
    expect(d.openPeople).toBe(6)
    expect(d.declinedGuests).toBe(1)
    expect(d.allResponded).toBe(false)
  })
  it('«Todos han respondido» solo con invitados, nadie pendiente y alguien que asiste', () => {
    expect(computeDiners([g('a', 'confirmado'), g('b', 'no_asiste')]).allResponded).toBe(true)
    expect(computeDiners([g('a', 'no_asiste')]).allResponded).toBe(false)
    expect(computeDiners([]).allResponded).toBe(false)
  })
  it('usa la MISMA definición de pendiente y de «todos respondieron» que el resto de Comida y bebida (sin estados duplicados que diverjan)', () => {
    const guests = [g('a', 'confirmado'), g('b', 'pendiente'), g('c', 'no_seguro'), g('d', 'no_asiste')]
    const mine = computeDiners(guests)
    const theirs = computeFoodNeedsState(guests, [], [])
    expect(mine.openGuests).toBe(theirs.pendingGuests)
    expect(mine.allResponded).toBe(theirs.allConfirmed)
    const all = [g('a', 'confirmado'), g('d', 'no_asiste')]
    expect(computeDiners(all).allResponded).toBe(computeFoodNeedsState(all, [], []).allConfirmed)
  })

  const guests = [g('a', 'confirmado', { displayName: 'Familia García' }), g('b', 'confirmado', { displayName: 'Marta' }), g('c', 'no_asiste', { displayName: 'Pedro' })]
  const members = [makeMember({ id: 'm1', guestId: 'a', name: 'María' }), makeMember({ id: 'm2', guestId: 'a', name: 'Luis', rsvpAttending: false })]

  it('22/23. necesidades agrupadas con QUIÉN y el texto ORIGINAL intacto; las de quien no asiste no cuentan', () => {
    const needs = [
      makeNeed({ id: 'n1', guestId: 'a', memberId: 'm1', category: 'marisco', kind: 'alergia', originalText: 'Soy alérgica al marisco' }),
      makeNeed({ id: 'n2', guestId: 'b', memberId: null, category: 'gluten', kind: 'celiaquia', originalText: 'Soy celíaca' }),
      makeNeed({ id: 'n3', guestId: 'c', memberId: null, category: 'gluten', kind: 'celiaquia', originalText: 'celíaco' }), // no asiste
      makeNeed({ id: 'n4', guestId: 'a', memberId: 'm2', category: 'vegano', kind: 'dieta', originalText: 'vegano' }), // dijo que no viene
    ]
    const groups = groupNeeds(needs, guests, members)
    expect(groups.map((x) => x.line)).toEqual(['1 ha indicado alergia al marisco', '1 necesita comida sin gluten'])
    expect(groups[0].people).toEqual([{ id: 'm1', name: 'María (Familia García)', originalText: 'Soy alérgica al marisco' }])
    expect(groups[1].people[0].originalText).toBe('Soy celíaca') // la respuesta original, no la clasificación
  })
  it('sin necesidades → ningún grupo', () => {
    expect(groupNeeds([], guests, members)).toEqual([])
  })
  it('37/38. el cruce es un AVISO («posible conflicto») con quién y qué necesidad, nunca una certeza ni «seguro»', () => {
    const needs = [makeNeed({ id: 'n1', guestId: 'a', memberId: 'm1', category: 'marisco', kind: 'alergia', originalText: 'marisco' })]
    const dishes = [makeMenuItem({ id: 'd1', name: 'Gamba blanca' }), makeMenuItem({ id: 'd2', name: 'Ensalada' })]
    const conflicts = findMenuConflicts(dishes, needs)
    const info = conflictInfo(conflicts, needs, guests, members)
    expect([...info.keys()]).toEqual(['d1'])
    const item = info.get('d1')![0]
    expect(item.headline).toBe('Posible conflicto con una necesidad alimentaria de 1 comensal')
    expect(item.detail).toBe('Sin marisco (alergia): María (Familia García)')
    const all = JSON.stringify([...info.values()]).toLowerCase()
    for (const forbidden of ['seguro', 'peligroso', 'puede comer', 'no puede']) expect(all).not.toContain(forbidden)
  })
  it('plural correcto con varios comensales', () => {
    const needs = [makeNeed({ id: 'n1', guestId: 'a', category: 'marisco' }), makeNeed({ id: 'n2', guestId: 'b', category: 'marisco' })]
    const info = conflictInfo(findMenuConflicts([makeMenuItem({ id: 'd', name: 'Gambas al ajillo' })], needs), needs, guests, members)
    expect(info.get('d')![0].headline).toContain('2 comensales')
  })
})

describe('Preguntas de invitados clasificadas como de comida (39)', () => {
  const q = (id: string, topic: 'comida' | null, active = true): EventGuestQuestion => ({ id, eventId: 'e1', familyId: 'f1', prompt: `Pregunta ${id}`, scope: 'persona', required: false, active, sortOrder: 0, createdAt: '', topic })
  const opts: EventGuestQuestionOption[] = [
    { id: 'o1', questionId: 'q1', eventId: 'e1', familyId: 'f1', label: 'Carne', sortOrder: 1, createdAt: '' },
    { id: 'o2', questionId: 'q1', eventId: 'e1', familyId: 'f1', label: 'Pescado', sortOrder: 2, createdAt: '' },
  ]
  const ans = (id: string, guestId: string, memberId: string | null, optionId: string | null): EventGuestQuestionAnswer => ({ id, questionId: 'q1', eventId: 'e1', familyId: 'f1', guestId, memberId, optionId, createdAt: '', updatedAt: '' })
  const guests = [makeGuest({ id: 'a', displayName: 'Familia A', rsvpStatus: 'confirmado' }), makeGuest({ id: 'b', displayName: 'Beto', rsvpStatus: 'confirmado' }), makeGuest({ id: 'c', displayName: 'Cris', rsvpStatus: 'no_asiste' })]
  const members = [makeMember({ id: 'm1', guestId: 'a', name: 'Ana' })]

  it('solo las marcadas por la familia (topic = comida) y activas; NUNCA por palabras del texto', () => {
    const questions = [q('q1', 'comida'), { ...q('q2', null), prompt: '¿Qué plato principal prefieres? (carne o pescado)' }, q('q3', 'comida', false)]
    expect(foodQuestionResults(questions, opts, [], guests, members).map((r) => r.question.id)).toEqual(['q1'])
    // una pregunta que habla de comida pero NO está clasificada queda como «sin clasificar» para que la familia decida
    expect(unclassifiedQuestions(questions).map((x) => x.id)).toEqual(['q2'])
  })
  it('refleja las respuestas que ya guarda el RSVP, con quién eligió cada opción; los que no asisten no cuentan', () => {
    const res = foodQuestionResults([q('q1', 'comida')], opts, [ans('x1', 'a', 'm1', 'o1'), ans('x2', 'b', null, 'o1'), ans('x3', 'c', null, 'o2'), ans('x4', 'b', null, 'o2')], guests, members)
    expect(res[0].options.map((o) => [o.label, o.people])).toEqual([
      ['Carne', ['Ana (Familia A)', 'Beto']],
      ['Pescado', ['Beto']],
    ])
  })
})
