import { describe, expect, it } from 'vitest'

const SRC = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']
const RSVP_SRC = (import.meta.glob('/src/ui/RsvpScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/RsvpScreen.tsx']
const EVENTS_DOMAIN_SRC = (import.meta.glob('/src/domain/events.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/domain/events.ts']

function slice(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('GuestsDecisionsBlock — montaje y reutilización del motor de "La pareja"', () => {
  it('se monta como tercer acordeón del configurador, junto a Ceremonia/celebración y La pareja — disponible para cualquier evento de este configurador, no solo boda', () => {
    const configurator = slice(SRC, 'function EventPlanningConfigurator(', '\nfunction PairBlock(')
    expect(configurator).toContain('👥 Invitados e invitaciones')
    expect(configurator).toContain("<GuestsDecisionsBlock event={event} onChanged={handleChanged} onDerivedDataChanged={handleDerivedDataChanged} focusRequest={focusRequestFor('invitados')} />")
    // A diferencia de "La pareja" (pairOpen envuelto en `{event.type === 'boda' && (...)}`), el bloque de
    // invitados no debe quedar dentro de esa misma condición. Busca específicamente el GUARD de JSX (con
    // llave y &&), nunca una coincidencia de texto genérica — el resumen general (Fase 1.1) también
    // comprueba event.type === 'boda' en su propio useEffect, en un ternario sin relación con este guard.
    const afterPair = configurator.slice(configurator.indexOf("{event.type === 'boda' && ("))
    expect(afterPair.indexOf('GuestsDecisionsBlock')).toBeLessThan(afterPair.indexOf("{event.type === 'boda' && (", 1) === -1 ? Infinity : afterPair.indexOf("{event.type === 'boda' && (", 1))
  })

  it('reutiliza upsertEventDecision/applyPairDecisionGeneration/describeEffects/showToast — mismas funciones que PairBlock, nunca una copia', () => {
    const block = slice(SRC, 'function GuestsDecisionsBlock(', '\nfunction NinosNecesidadesQuestion(')
    expect(block).toContain('upsertEventDecision(event.id, {')
    expect(block).toContain('applyPairDecisionGeneration(event.id,')
    expect(block).toContain('describeEffects(actions)')
    expect(block).toContain('showToast(message)')
    expect(block).toContain('<BudgetAmountPromptModal')
  })

  it('reutiliza CustomAwareQuestion para las 4 preguntas de primer nivel que siguen usándolo (Lista/Momentos/Niños/Invitación) — "¿Preguntas para los invitados?" usa su propio componente, nunca CustomAwareQuestion', () => {
    const block = slice(SRC, 'function GuestsDecisionsBlock(', '\nfunction NinosNecesidadesQuestion(')
    expect([...block.matchAll(/<CustomAwareQuestion/g)]).toHaveLength(4)
    expect(block).toContain('<InvitadosPreguntasQuestion')
  })

  it('"¿Queréis incluir alguna pregunta para los invitados en la invitación?" es una pregunta temprana (justo después de Lista de invitados, antes que Niños) — ajuste de UX sobre la misma clave que antes solo preguntaba por el menú', () => {
    const block = slice(SRC, 'function GuestsDecisionsBlock(', '\nfunction NinosNecesidadesQuestion(')
    expect(block).toContain('<InvitadosPreguntasQuestion')
    expect(block).toContain('existing={findDecision(GUESTS_PREGUNTAS_QUESTION_KEY)?.answer as unknown as InvitadosPreguntasAnswer | undefined}')
    expect(block).toContain('desiredForInvitadosPreguntas(answer)')
    expect(block).not.toContain('¿Queréis que los invitados elijan su menú en la invitación?')
    const listaIndex = block.indexOf('questionKey={GUESTS_LISTA_QUESTION_KEY}')
    const preguntasIndex = block.indexOf('<InvitadosPreguntasQuestion')
    const ninosIndex = block.indexOf('questionKey={GUESTS_NINOS_QUESTION_KEY}')
    expect(listaIndex).toBeLessThan(preguntasIndex)
    expect(preguntasIndex).toBeLessThan(ninosIndex)
  })

  it('INVITADOS_PREGUNTAS_OPTIONS tiene exactamente Sí/No/Todavía no lo sabemos, sin preselección y sin "Otro" (si responde Sí, ya puede crear cualquier pregunta personalizada)', () => {
    const start = SRC.indexOf('const INVITADOS_PREGUNTAS_OPTIONS')
    const arrayStart = SRC.indexOf('= [', start)
    const optionsBlock = SRC.slice(arrayStart, SRC.indexOf(']', arrayStart + 3))
    expect(optionsBlock).toContain("value: 'si'")
    expect(optionsBlock).toContain("value: 'no'")
    expect(optionsBlock).toContain("value: 'todavia_no_lo_sabemos'")
    expect(optionsBlock).not.toContain("value: 'otro'")
  })

  it('la pregunta de Momentos solo se pinta con 2+ momentos reales (momentsCount >= 2) — nunca cuenta los sintéticos de ceremonia/celebración heredada', () => {
    const block = slice(SRC, 'function GuestsDecisionsBlock(', '\nfunction NinosNecesidadesQuestion(')
    expect(block).toContain('moments.filter((m) => !m.isLegacy)')
    expect(block).toContain('momentsCount >= 2 && questionIsVisible(localFocus, GUESTS_MOMENTOS_QUESTION_KEY) && (')
  })

  it('"todos a todos" asigna de verdad vía setGuestMoments a TODOS los invitados — la decisión en sí nunca genera Preparativo/Presupuesto', () => {
    const saveMomentos = slice(SRC, 'async function saveMomentos(', 'async function saveNinos(')
    expect(saveMomentos).toContain("if (answer.choice === 'todos_a_todos') {")
    expect(saveMomentos).toContain('await Promise.all(guests.map((g) => setGuestMoments(g, momentIds)))')
    expect(saveMomentos).not.toContain('applyPairDecisionGeneration')
  })

  it('Necesidades infantiles solo se revela cuando Niños === "si"', () => {
    const block = slice(SRC, 'function GuestsDecisionsBlock(', '\nfunction NinosNecesidadesQuestion(')
    expect(block).toContain("ninos?.choice === 'si' && questionIsVisible(localFocus, GUESTS_NINOS_NECESIDADES_QUESTION_KEY) && (")
  })

  it('cada necesidad accionable (Animación/Monitor) se reconcilia como su propia sub-decisión, con su propio decisionId — nunca comparten la de "necesidades"', () => {
    const saveNecesidades = slice(SRC, 'async function saveNinosNecesidades(', '\n  }\n\n  if (loading)')
    expect(saveNecesidades).toContain('guestsNinosNecesidadItemKey(itemKey)')
    expect(saveNecesidades).toContain('upsertEventDecision(event.id, { blockKey: ')
    expect(saveNecesidades).toContain('desiredForNinosNecesidadItem(true, itemKey)')
    expect(saveNecesidades).toContain('desiredForNinosNecesidadItem(false, itemKey)')
  })

  it('si Niños deja de ser "sí", las necesidades accionables (y sus Preparativos/Presupuestos prístinos) se reconcilian a NONE y se borran — nunca quedan huérfanas', () => {
    const saveNinos = slice(SRC, 'async function saveNinos(', 'async function saveNinosNecesidades(')
    expect(saveNinos).toContain("if (answer.choice !== 'si') {")
    expect(saveNinos).toContain('desiredForNinosNecesidadItem(false, itemKey)')
    expect(saveNinos).toContain('deleteEventDecision(existing.id)')
    expect(saveNinos).toContain('deleteEventDecision(necesidades.id)')
  })
})

describe('GuestsSection — asignación por invitado cuando Momentos = "depende"', () => {
  it('el desplegable heredado de ceremonia/celebración se oculta cuando hay asignación real por momento (showPerGuestMoments)', () => {
    const section = slice(SRC, 'function GuestsSection(', '\nfunction EventOpenLinkBlock(')
    expect(section).toContain('hasScope && !showPerGuestMoments && (')
    expect(section).toContain("const showPerGuestMoments = momentosChoice === 'depende' && moments.length >= 2")
  })

  it('las casillas por momento escriben con setGuestMoments (event_guest_moments) — nunca dentro de event_decisions', () => {
    const section = slice(SRC, 'function GuestsSection(', '\nfunction EventOpenLinkBlock(')
    expect(section).toContain('async function handleGuestMomentsChange(guest: EventGuest, momentId: string, checked: boolean) {')
    expect(section).toContain('await setGuestMoments(guest, next)')
  })
})

describe('No duplicar "Enviar las invitaciones" — ya existe como Preparativo automático (TASK_TEMPLATES)', () => {
  it('GuestsDecisionsBlock nunca escribe literalmente el título "Enviar las invitaciones"', () => {
    const block = slice(SRC, 'function GuestsDecisionsBlock(', '\nfunction NinosNecesidadesQuestion(')
    expect(block).not.toContain('Enviar las invitaciones')
    expect(block).not.toContain('Enviar invitaciones')
  })

  it('el Preparativo automático "Enviar las invitaciones" (TASK_TEMPLATES, domain/events.ts) sigue existiendo tal cual, sin tocar', () => {
    expect(EVENTS_DOMAIN_SRC).toContain("title: 'Enviar las invitaciones'")
  })
})

describe('"La pareja" no se ha tocado — mismo motor reutilizado, cero regresión', () => {
  it('PairBlock sigue usando exactamente sus mismas funciones de siempre', () => {
    const pairBlock = slice(SRC, 'function PairBlock(', '\nfunction BudgetAmountPromptModal(')
    expect(pairBlock).toContain("blockKey: 'pareja'")
    expect(pairBlock).toContain('summarizePairBlock(event, decisions)')
  })
})

describe('RSVP público — Parte B (elección de menú por persona) conecta por el edge function, nunca importando el módulo de decisiones directamente', () => {
  it('RsvpScreen.tsx sigue sin importar el módulo de decisiones de invitados — la conexión con "¿elegirán menú?" la resuelve event-rsvp (service role), no el cliente público', () => {
    expect(RSVP_SRC).not.toContain('eventGuestDecisions')
    expect(RSVP_SRC).not.toContain('GUESTS_LISTA_QUESTION_KEY')
    expect(RSVP_SRC).not.toContain('GUESTS_PREGUNTAS_QUESTION_KEY')
  })

  it('el flujo de envío del RSVP (status/adultos/niños/nota) sigue intacto para invitados sin desglose de personas', () => {
    expect(RSVP_SRC).toContain('status')
    expect(RSVP_SRC).toMatch(/adults/i)
  })

  it('con personas desglosadas (guest.members), cada una registra su propia asistencia y, si hay opciones, su propio menú — nunca un segundo RSVP paralelo', () => {
    const form = slice(RSVP_SRC, 'function RsvpForm(', '\nfunction OpenRsvpForm(')
    expect(form).toContain('const hasMembers = guest.members.length > 0')
    expect(form).toContain('✅ Viene')
    expect(form).toContain('❌ No viene')
    // Fase "Comida y bebida": las opciones se filtran por persona (adulto/niño/todos) antes de ofrecerlas.
    expect(form).toContain('optionsForPerson(guest.menuOptions, m.personType).length > 0')
    expect(form).toContain('body.members = members.map(')
  })

  it('sin personas desglosadas, el formulario sigue mostrando los campos agregados de Adultos/Niños de siempre', () => {
    const form = slice(RSVP_SRC, 'function RsvpForm(', '\nfunction OpenRsvpForm(')
    expect(form).toContain('<input type="number" min={0} max={50} value={adults} onChange={(e) => setAdults(e.target.value)} />')
    expect(form).toContain('<input type="number" min={0} max={50} value={children} onChange={(e) => setChildren(e.target.value)} />')
  })
})

describe('InvitadosPreguntasQuestion — descubrimiento del sistema genérico, nunca un segundo motor de preguntas', () => {
  it('"Sí" revela exactamente tres accesos: Elección de menú, Transporte, Otra pregunta — ni mutuamente excluyentes ni preseleccionados', () => {
    const fn = slice(SRC, 'function InvitadosPreguntasQuestion(', '\nfunction GuestsDecisionsBlock(')
    expect(fn).toContain("existing?.choice === 'si' && (")
    expect(fn).toContain('🍽️ Elección de menú')
    expect(fn).toContain('🚗 Transporte')
    expect(fn).toContain('✏️ Otra pregunta')
  })

  it('"🍽️ Elección de menú" es un simple interruptor (wantsMenu) — nunca crea una fila en event_guest_questions', () => {
    const fn = slice(SRC, 'function InvitadosPreguntasQuestion(', '\nfunction GuestsDecisionsBlock(')
    expect(fn).toContain("onSave({ choice: 'si', wantsMenu: !wantsMenu })")
    expect(fn).not.toContain('addEventGuestQuestion')
  })

  it('"🚗 Transporte" y "✏️ Otra pregunta" abren el MISMO <GuestQuestionForm> ya existente — nunca un formulario nuevo', () => {
    const fn = slice(SRC, 'function InvitadosPreguntasQuestion(', '\nfunction GuestsDecisionsBlock(')
    expect(fn).toContain('<GuestQuestionForm')
    expect(fn).toContain("initialPrompt={openForm === 'transporte' ? '¿Necesitáis transporte?' : undefined}")
    expect(fn).toContain("initialOptions={openForm === 'transporte' ? [{ id: null, label: 'Sí' }, { id: null, label: 'No' }] : undefined}")
  })

  it('al guardar una pregunta desde aquí, se avisa con un toast y se cierra el formulario — pero no se pinta ninguna lista propia (una sola fuente de verdad: 📋 Preguntas a los invitados)', () => {
    const fn = slice(SRC, 'function InvitadosPreguntasQuestion(', '\nfunction GuestsDecisionsBlock(')
    expect(fn).toContain('onQuestionCreated()')
    expect(fn).not.toContain('listEventGuestQuestions')
  })

  it('effectiveWantsMenu decide el estado del interruptor — nunca una preselección local inventada', () => {
    const fn = slice(SRC, 'function InvitadosPreguntasQuestion(', '\nfunction GuestsDecisionsBlock(')
    expect(fn).toContain('const wantsMenu = effectiveWantsMenu(existing)')
  })
})
