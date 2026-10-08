import { describe, expect, it } from 'vitest'

// Fase 2 (plan de pendientes) — "🎭 Personas especiales" (boda/bautizo/comunión) y "👪 Familiares"
// (bautizo/comunión). El motor de decisiones/roster ya está probado a fondo en
// src/domain/eventSpecialPeople.test.ts y src/data/eventSpecialPeople.test.ts — aquí solo se comprueba el
// cableado real contra la UI.
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const CONFIGURATOR = window_(UI, 'function EventPlanningConfigurator(', '\nfunction ConfiguratorSummaryPanel(')
const ESPECIAL = window_(UI, 'function PersonasEspecialesBlock(', '\nfunction FamiliaresBlock(')
const FAMILIARES = window_(UI, 'function FamiliaresBlock(', '\nfunction ComidaBebidaBlock(')
const ROLE_FORM = window_(UI, 'function RolePersonForm(', '\nfunction RolePeopleList(')

describe('EventPlanningConfigurator — gating por tipo de evento, nunca una tanda nueva de acordeón', () => {
  it('"🎭 Personas especiales" se muestra para boda, bautizo Y comunión', () => {
    expect(CONFIGURATOR).toContain("const showPersonasEspeciales = event.type === 'boda' || event.type === 'bautizo' || event.type === 'comunion'")
  })
  it('"👪 Familiares" NUNCA se muestra para boda — solo bautizo y comunión', () => {
    // La propia línea que define showFamiliares no debe mencionar 'boda' en absoluto (a diferencia de
    // showPersonasEspeciales, que sí la incluye) — se comprueba la línea exacta, no todo lo que viene
    // después (ahí SÍ aparece 'boda' más abajo, para el gating de "La pareja", sin relación con esto).
    const line = window_(CONFIGURATOR, 'const showFamiliares = ', '\n')
    expect(line).not.toContain('boda')
  })
  it('las dos secciones reutilizan el MISMO mecanismo de acordeón y de foco que el resto (loadConfiguratorOpen/focusRequestFor)', () => {
    expect(CONFIGURATOR).toContain("loadConfiguratorOpen(event.id, 'personas_especiales')")
    expect(CONFIGURATOR).toContain("loadConfiguratorOpen(event.id, 'familiares')")
    expect(CONFIGURATOR).toContain("<PersonasEspecialesBlock event={event} onDerivedDataChanged={handleDerivedDataChanged} focusRequest={focusRequestFor('personas_especiales')} />")
    expect(CONFIGURATOR).toContain("<FamiliaresBlock event={event} onDerivedDataChanged={handleDerivedDataChanged} focusRequest={focusRequestFor('familiares')} />")
  })
  it('el resumen general (Fase 1.1) incluye las dos secciones nuevas, cada una gateada por su propio showX', () => {
    expect(CONFIGURATOR).toContain('showPersonasEspeciales\n            ? listEspecialBlockQuestions(decisions, especialPeople.length)')
    expect(CONFIGURATOR).toContain('showFamiliares\n            ? listFamiliaresBlockQuestions(decisions, familiarPeople.length)')
  })
})

describe('PersonasEspecialesBlock — revelado progresivo: roster y preguntas conjuntas solo si "Sí"', () => {
  it('pregunta inicial con las 3 opciones pedidas', () => {
    expect(ESPECIAL).toContain('¿Habrá personas con un papel especial?')
    expect(ESPECIAL).toContain('Por ejemplo: padrino, madrina, testigos, damas de honor…')
  })
  it('el roster y las preguntas conjuntas solo se muestran con hay.choice === "si"', () => {
    expect(ESPECIAL).toContain("hay?.choice === 'si' && questionIsVisible(localFocus, ESPECIAL_HAY_QUESTION_KEY)")
    expect(ESPECIAL).toContain("hay?.choice === 'si' && people.length > 0 && questionIsVisible(localFocus, ESPECIAL_VESTIMENTA_QUESTION_KEY)")
    expect(ESPECIAL).toContain("hay?.choice === 'si' && people.length > 0 && questionIsVisible(localFocus, ESPECIAL_COMPLEMENTOS_QUESTION_KEY)")
    expect(ESPECIAL).toContain("hay?.choice === 'si' && people.length > 0 && questionIsVisible(localFocus, ESPECIAL_REGALOS_QUESTION_KEY)")
  })
  it('complementos/regalos pasan por el MISMO motor de reconciliación que el resto del configurador (applyPairDecisionGeneration vía saveGrouped)', () => {
    expect(ESPECIAL).toContain('await applyPairDecisionGeneration(event.id, decision.id, desired)')
    expect(ESPECIAL).toContain('desiredForEspecialComplementos(')
    expect(ESPECIAL).toContain('desiredForEspecialRegalos(')
  })
  it('vestimenta coordinada NUNCA genera un preparativo (NONE_ESPECIAL fijo) — solo complementos y regalos pueden generar UNO', () => {
    const vestimentaBlock = window_(ESPECIAL, 'Vestimenta coordinada', 'Complementos especiales')
    expect(vestimentaBlock).toContain('NONE_ESPECIAL')
    expect(vestimentaBlock).not.toContain('desiredForEspecial')
  })
  it('usa el roster real (event_role_people vía listEventRolePeople) — nunca una lista aparte', () => {
    expect(ESPECIAL).toContain("listEventRolePeople(event.id, 'especial')")
  })
})

describe('FamiliaresBlock — roster propio, nunca comparte el de Personas especiales', () => {
  it('carga su propio roster con category "familiar"', () => {
    expect(FAMILIARES).toContain("listEventRolePeople(event.id, 'familiar')")
  })
  it('ficha con parentesco desplegable (sugerencias) y nombre opcional', () => {
    expect(FAMILIARES).toContain('roleSuggestions={[...FAMILIARES_PARENTESCO_OPTIONS]}')
    expect(FAMILIARES).toContain('nameRequired={false}')
  })
  it('UNA sola pregunta conjunta de necesidades, sin multiplicar preguntas — nunca vestimenta/complementos/peluquería/maquillaje por separado', () => {
    expect(FAMILIARES).toContain('¿Qué necesitan los familiares?')
    expect((FAMILIARES.match(/questionIsVisible\(localFocus, FAMILIARES_NECESIDADES_QUESTION_KEY\)/g) ?? []).length).toBe(1)
  })
  it('nunca se añade este bloque a boda — eso lo decide el padre (showFamiliares), no este componente', () => {
    expect(FAMILIARES).not.toContain("event.type === 'boda'")
  })
})

describe('RolePersonForm — alta/edición de una persona, con sugerencia de coincidencia con Invitados', () => {
  it('la sugerencia de coincidencia NUNCA vincula sola: exige un clic explícito ("Sí, es...")', () => {
    expect(ROLE_FORM).toContain('¿Es la misma persona que ya tenéis en Invitados?')
    expect(ROLE_FORM).toContain('Sí, es {m.name}')
    expect(ROLE_FORM).toContain('onClick={() => setGuestMemberId(m.id)}')
  })
  it('las sugerencias se calculan con suggestGuestMatches (nunca una coincidencia automática)', () => {
    expect(ROLE_FORM).toContain('suggestGuestMatches(name, guestCandidates)')
  })
  it('"+Otro papel"/"+Otro parentesco" siempre admite texto libre, nunca limitado al catálogo sugerido', () => {
    expect(ROLE_FORM).toContain('addCustomRole')
    expect(ROLE_FORM).toContain("category === 'especial' ? 'Otro papel…' : 'Otro parentesco…'")
  })
})

describe('Detalles/Regalos — "alimentar" el roster de Personas especiales sin crear nada por su cuenta', () => {
  const details = window_(UI, 'function DetailsSection(', '\nfunction AddFavorModal(')
  const gifts = window_(UI, 'function GiftsSection(', '\nfunction AddGiftModal(')
  const addSpecial = window_(UI, 'function AddSpecialDetailModal(', '\nfunction GiftsSection(')
  const addGift = window_(UI, 'function AddGiftModal(', '\nfunction EventDayBanner(')

  it('DetailsSection/GiftsSection cargan el roster real (category "especial"), nunca uno nuevo', () => {
    expect(details).toContain("listEventRolePeople(eventId, 'especial')")
    expect(gifts).toContain("listEventRolePeople(eventId, 'especial')")
  })
  it('elegir una persona del roster solo RELLENA el formulario (nombre/papel/vínculo) — nunca crea el detalle/regalo directamente', () => {
    expect(addSpecial).toContain('function fillFromRolePerson(personId: string) {')
    expect(addSpecial).not.toContain('addEventSpecialDetail(eventId, { recipientName: person')
    expect(addGift).toContain('function fillFromRolePerson(personId: string) {')
    expect(addGift).not.toContain('addEventGift(eventId, { guestName: person')
  })
})
