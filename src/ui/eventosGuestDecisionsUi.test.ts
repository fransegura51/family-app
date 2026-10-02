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
    expect(configurator).toContain('<GuestsDecisionsBlock event={event} onChanged={onChanged} onDerivedDataChanged={onDerivedDataChanged} />')
    // A diferencia de "La pareja" (pairOpen envuelto en `{event.type === 'boda' && (...)}`), el bloque de
    // invitados no debe quedar dentro de esa misma condición.
    const afterPair = configurator.slice(configurator.indexOf("event.type === 'boda'"))
    expect(afterPair.indexOf('GuestsDecisionsBlock')).toBeLessThan(afterPair.indexOf("event.type === 'boda'", 1) === -1 ? Infinity : afterPair.indexOf("event.type === 'boda'", 1))
  })

  it('reutiliza upsertEventDecision/applyPairDecisionGeneration/describeEffects/showToast — mismas funciones que PairBlock, nunca una copia', () => {
    const block = slice(SRC, 'function GuestsDecisionsBlock(', '\nfunction NinosNecesidadesQuestion(')
    expect(block).toContain('upsertEventDecision(event.id, {')
    expect(block).toContain('applyPairDecisionGeneration(event.id,')
    expect(block).toContain('describeEffects(actions)')
    expect(block).toContain('showToast(message)')
    expect(block).toContain('<BudgetAmountPromptModal')
  })

  it('reutiliza CustomAwareQuestion para las 5 preguntas de primer nivel (incluida Menú en la invitación) — nunca un componente de pregunta nuevo', () => {
    const block = slice(SRC, 'function GuestsDecisionsBlock(', '\nfunction NinosNecesidadesQuestion(')
    expect([...block.matchAll(/<CustomAwareQuestion/g)]).toHaveLength(5)
  })

  it('"¿Queréis que los invitados elijan su menú en la invitación?" es una pregunta temprana (su <CustomAwareQuestion> va justo después del de Lista de invitados, antes que el de Niños), sin preselección y reutilizando saveQuestion/desiredForMenuInvitacion', () => {
    const block = slice(SRC, 'function GuestsDecisionsBlock(', '\nfunction NinosNecesidadesQuestion(')
    expect(block).toContain('¿Queréis que los invitados elijan su menú en la invitación?')
    expect(block).toContain('questionKey={GUESTS_MENU_QUESTION_KEY}')
    expect(block).toContain('desiredForMenuInvitacion(answer as MenuInvitacionAnswer)')
    // Los <CustomAwareQuestion> de JSX son el orden real de pantalla — a diferencia del simple nombre de la
    // constante, que también aparece antes en declaraciones de variables (p.ej. "const ninosDecision =
    // findDecision(GUESTS_NINOS_QUESTION_KEY)", antes del propio return) y daría un falso orden.
    const listaIndex = block.indexOf('questionKey={GUESTS_LISTA_QUESTION_KEY}')
    const menuIndex = block.indexOf('questionKey={GUESTS_MENU_QUESTION_KEY}')
    const ninosIndex = block.indexOf('questionKey={GUESTS_NINOS_QUESTION_KEY}')
    expect(listaIndex).toBeLessThan(menuIndex)
    expect(menuIndex).toBeLessThan(ninosIndex)
  })

  it('MENU_INVITACION_OPTIONS no preselecciona ningún valor (Sí/No/Todavía no lo sabemos/Otro)', () => {
    const start = SRC.indexOf('const MENU_INVITACION_OPTIONS')
    const arrayStart = SRC.indexOf('= [', start)
    const optionsBlock = SRC.slice(arrayStart, SRC.indexOf(']', arrayStart + 3))
    expect(optionsBlock).toContain("value: 'si'")
    expect(optionsBlock).toContain("value: 'no'")
    expect(optionsBlock).toContain("value: 'todavia_no_lo_sabemos'")
    expect(optionsBlock).toContain("value: 'otro'")
  })

  it('la pregunta de Momentos solo se pinta con 2+ momentos reales (momentsCount >= 2) — nunca cuenta los sintéticos de ceremonia/celebración heredada', () => {
    const block = slice(SRC, 'function GuestsDecisionsBlock(', '\nfunction NinosNecesidadesQuestion(')
    expect(block).toContain('moments.filter((m) => !m.isLegacy)')
    expect(block).toContain('momentsCount >= 2 && (')
  })

  it('"todos a todos" asigna de verdad vía setGuestMoments a TODOS los invitados — la decisión en sí nunca genera Preparativo/Presupuesto', () => {
    const saveMomentos = slice(SRC, 'async function saveMomentos(', 'async function saveNinos(')
    expect(saveMomentos).toContain("if (answer.choice === 'todos_a_todos') {")
    expect(saveMomentos).toContain('await Promise.all(guests.map((g) => setGuestMoments(g, momentIds)))')
    expect(saveMomentos).not.toContain('applyPairDecisionGeneration')
  })

  it('Necesidades infantiles solo se revela cuando Niños === "si"', () => {
    const block = slice(SRC, 'function GuestsDecisionsBlock(', '\nfunction NinosNecesidadesQuestion(')
    expect(block).toContain("ninos?.choice === 'si' && (")
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
    expect(RSVP_SRC).not.toContain('GUESTS_MENU_QUESTION_KEY')
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
    expect(form).toContain('guest.menuOptions.length > 0')
    expect(form).toContain('body.members = members.map(')
  })

  it('sin personas desglosadas, el formulario sigue mostrando los campos agregados de Adultos/Niños de siempre', () => {
    const form = slice(RSVP_SRC, 'function RsvpForm(', '\nfunction OpenRsvpForm(')
    expect(form).toContain('<input type="number" min={0} max={50} value={adults} onChange={(e) => setAdults(e.target.value)} />')
    expect(form).toContain('<input type="number" min={0} max={50} value={children} onChange={(e) => setChildren(e.target.value)} />')
  })
})
