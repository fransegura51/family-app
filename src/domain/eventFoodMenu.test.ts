import { describe, expect, it } from 'vitest'
import {
  alreadyRespondedMessage,
  canonicalSectionLabel,
  countMenuChoices,
  groupMenuBySection,
  guestsRespondedWithoutMenuChoice,
  guestsWithoutMembers,
  MENU_IMPORT_EXPLANATION,
  MENU_SECTIONS,
  optionAppliesToPerson,
  optionsForPerson,
  sanitizeImportProposal,
  sectionKeyForCategory,
} from '@/domain/eventFoodMenu'
import { makeGuest, makeMember, makeMenuItem, makeOption } from '@/domain/eventFoodFixtures'

describe('Menú estructurado — secciones, platos y receta opcional', () => {
  it('las secciones son las pedidas, en orden, y no hace falta rellenarlas todas', () => {
    expect(MENU_SECTIONS.map((s) => s.label)).toEqual([
      'Aperitivo / picoteo',
      'Entrantes',
      'Primer plato',
      'Plato principal',
      'Guarniciones',
      'Menú infantil',
      'Postres',
      'Tarta',
      'Merienda',
      'Cena',
      'Recena',
      'Bebidas',
      'Otro',
    ])
  })
  it('un plato puede ser solo «Paella»: sin receta, sin nota, sin cantidades', () => {
    const dish = makeMenuItem({ name: 'Paella', category: 'Plato principal' })
    expect(dish.recipeId).toBeNull()
    expect(dish.notes).toBeNull()
    expect(dish.quantityNote).toBeNull()
  })
  it('los platos se agrupan por sección en el orden del catálogo y nada se descarta', () => {
    const items = [
      makeMenuItem({ id: '1', name: 'Tarta de queso', category: 'Postres' }),
      makeMenuItem({ id: '2', name: 'Jamón', category: 'Aperitivo / picoteo' }),
      makeMenuItem({ id: '3', name: 'Sorpresa', category: 'Chocolatada' }),
      makeMenuItem({ id: '4', name: 'Sin sección', category: null }),
    ]
    const groups = groupMenuBySection(items)
    expect(groups.map((g) => g.label)).toEqual(['Aperitivo / picoteo', 'Postres', 'Chocolatada', 'Sin sección'])
    expect(groups.reduce((n, g) => n + g.items.length, 0)).toBe(4)
  })
  it('las categorías antiguas (plantillas de «Organízamelo Pepa») se reconocen sin reescribir la fila', () => {
    expect(sectionKeyForCategory('Segundo plato')).toBe('plato_principal')
    expect(sectionKeyForCategory('Postre')).toBe('postres')
    expect(sectionKeyForCategory('Tarta nupcial')).toBe('tarta')
    expect(sectionKeyForCategory('Snacks')).toBe('aperitivo')
    expect(sectionKeyForCategory('algo raro')).toBeNull()
    expect(canonicalSectionLabel('postre')).toBe('Postres')
    expect(canonicalSectionLabel('Mi sección')).toBe('Mi sección')
  })
  it('un plato enlazado a una receta conserva solo la referencia (recipeId), sin copiar ni inventar ingredientes', () => {
    const dish = makeMenuItem({ recipeId: 'r1' })
    expect(Object.keys(dish)).not.toContain('ingredients')
    expect(dish.recipeId).toBe('r1')
  })
})

describe('Importación de menú — la propuesta nunca se guarda sola', () => {
  it('el texto explicativo es el pedido y no promete seguridad', () => {
    expect(MENU_IMPORT_EXPLANATION).toBe(
      'Guarda tu menú en PEPA. Haz una foto o sube el PDF y PEPA intentará organizarlo por ti. Cuando tus invitados hayan confirmado, podremos ayudarte a detectar platos que conviene revisar por sus alergias o necesidades alimentarias.',
    )
    expect(MENU_IMPORT_EXPLANATION.toLowerCase()).not.toContain('seguro')
    expect(MENU_IMPORT_EXPLANATION.toLowerCase()).not.toContain('garantiz')
  })
  it('limpia lo que devuelve la IA: recorta y descarta solo lo vacío; CONSERVA el orden y los repetidos', () => {
    const proposal = sanitizeImportProposal({
      items: [{ text: ' Croquetas ', kind: 'dish', section: ' entrantes ' }, { text: 'croquetas', kind: 'dish' }, { text: '   ' }, 'Ensaladilla', 'basura:', 7, null],
    })
    expect(proposal.items.map((i) => i.text)).toEqual(['Croquetas', 'croquetas', 'Ensaladilla', 'basura:'])
    expect(proposal.items[0].section).toBe('Entrantes')
  })
  it('una respuesta rara del modelo se convierte en «nada leído», nunca en un error ni en platos inventados', () => {
    expect(sanitizeImportProposal(null)).toEqual({ items: [] })
    expect(sanitizeImportProposal('texto')).toEqual({ items: [] })
    expect(sanitizeImportProposal({ items: 'no' })).toEqual({ items: [] })
    expect(sanitizeImportProposal({ sections: 'no' })).toEqual({ items: [] })
  })
})

describe('Opciones de menú para invitados — adulto / niño / todos', () => {
  it('una opción antigua sin destinatario se trata como «todos» y la ven adultos y niños', () => {
    expect(optionAppliesToPerson(undefined, 'adulto')).toBe(true)
    expect(optionAppliesToPerson(null, 'nino')).toBe(true)
    expect(optionAppliesToPerson('todos', 'nino')).toBe(true)
  })
  it('«adultos» solo para adultos y «niños» solo para niños', () => {
    expect(optionAppliesToPerson('adultos', 'adulto')).toBe(true)
    expect(optionAppliesToPerson('adultos', 'nino')).toBe(false)
    expect(optionAppliesToPerson('ninos', 'nino')).toBe(true)
    expect(optionAppliesToPerson('ninos', 'adulto')).toBe(false)
  })
  it('una persona de tipo desconocido solo ve las opciones de «todos» (no se adivina)', () => {
    expect(optionAppliesToPerson('adultos', null)).toBe(false)
    expect(optionAppliesToPerson('ninos', undefined)).toBe(false)
    expect(optionAppliesToPerson('todos', undefined)).toBe(true)
  })
  it('optionsForPerson filtra la lista', () => {
    const options = [makeOption({ id: 'a', audience: 'adultos' }), makeOption({ id: 'n', audience: 'ninos' }), makeOption({ id: 't', audience: 'todos' })]
    expect(optionsForPerson(options, 'adulto').map((o) => o.id)).toEqual(['a', 't'])
    expect(optionsForPerson(options, 'nino').map((o) => o.id)).toEqual(['n', 't'])
  })
})

describe('Elección de menú — recuento y detalle para quien organiza', () => {
  const options = [makeOption({ id: 'carne', name: 'Carne' }), makeOption({ id: 'pescado', name: 'Pescado' })]
  const guests = [makeGuest({ id: 'g1', displayName: 'Ana', rsvpStatus: 'confirmado' }), makeGuest({ id: 'g2', displayName: 'Luis', rsvpStatus: 'confirmado' }), makeGuest({ id: 'g3', displayName: 'Eva', rsvpStatus: 'no_asiste' })]
  const members = [
    makeMember({ id: 'm1', guestId: 'g1', name: 'Ana', rsvpAttending: true, menuOptionId: 'carne' }),
    makeMember({ id: 'm2', guestId: 'g2', name: 'Luis', rsvpAttending: true, menuOptionId: 'carne' }),
    makeMember({ id: 'm3', guestId: 'g2', name: 'Pau', rsvpAttending: true, menuOptionId: 'pescado' }),
    makeMember({ id: 'm4', guestId: 'g2', name: 'Sin', rsvpAttending: null, menuOptionId: null }),
    makeMember({ id: 'm5', guestId: 'g3', name: 'Eva', rsvpAttending: true, menuOptionId: 'pescado' }),
    makeMember({ id: 'm6', guestId: 'g1', name: 'No viene', rsvpAttending: false, menuOptionId: null }),
  ]
  it('cuenta por opción y deja «Sin elegir», sin contar a quien no viene ni a invitaciones que no asisten', () => {
    const { counts, unchosen } = countMenuChoices(options, members, guests)
    expect(counts.map((c) => [c.name, c.count])).toEqual([
      ['Carne', 2],
      ['Pescado', 1],
    ])
    expect(unchosen.count).toBe(1)
    expect(unchosen.name).toBe('Sin elegir')
  })
  it('el detalle dice quién eligió qué', () => {
    const { counts } = countMenuChoices(options, members, guests)
    expect(counts[0].people.map((p) => p.name)).toEqual(['Ana', 'Luis'])
  })
  it('borrar una opción deja a quien la eligió «sin elegir» (menuOptionId null), sin perder a la persona', () => {
    const after = members.map((m) => (m.menuOptionId === 'carne' ? { ...m, menuOptionId: null } : m))
    const { counts, unchosen } = countMenuChoices([options[1]], after, guests)
    expect(counts[0].count).toBe(1)
    expect(unchosen.count).toBe(3)
  })
  it('«Sin elegir» no cuenta a quien no tiene ninguna opción aplicable (p. ej. solo hay opciones de adultos y es un niño)', () => {
    const onlyAdults = [makeOption({ id: 'a', audience: 'adultos' })]
    const kid = [makeMember({ id: 'k', guestId: 'g1', personType: 'nino', rsvpAttending: true })]
    expect(countMenuChoices(onlyAdults, kid, guests).unchosen.count).toBe(0)
  })
})

describe('Invitaciones que ya habían respondido antes de que existieran opciones (Boda de plata)', () => {
  const responded = [1, 2, 3, 4, 5].map((n) => makeGuest({ id: `g${n}`, displayName: `Invitado ${n}`, rsvpStatus: 'confirmado', rsvpRespondedAt: '2026-06-01T00:00:00Z' }))
  it('crear opciones no invalida a nadie: se informa y quedan «sin elegir»', () => {
    expect(guestsRespondedWithoutMenuChoice(responded, [])).toBe(5)
    expect(alreadyRespondedMessage(5)).toBe('5 invitaciones ya habían respondido antes de añadir las opciones de menú.')
    expect(alreadyRespondedMessage(1)).toBe('1 invitación ya había respondido antes de añadir las opciones de menú.')
  })
  it('quien ya eligió no se cuenta; quien no ha respondido tampoco', () => {
    const members = [makeMember({ guestId: 'g1', rsvpAttending: true, menuOptionId: 'carne' })]
    expect(guestsRespondedWithoutMenuChoice(responded, members)).toBe(4)
    expect(guestsRespondedWithoutMenuChoice([makeGuest({ rsvpStatus: 'pendiente' })], [])).toBe(0)
  })
  it('las invitaciones sin personas con nombre no pueden elegir menú en la invitación: se avisa', () => {
    expect(guestsWithoutMembers(responded, [makeMember({ guestId: 'g1' })])).toBe(4)
  })
})
