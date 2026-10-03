import { describe, expect, it } from 'vitest'

const SRC = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function slice(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('EventPlanningConfigurator — motor común: ya no depende de isEventStructuredByMoments para pintarse entero', () => {
  it('ya no hace early-return para eventos "simples" (cumpleaños/celebración/personalizado)', () => {
    const configurator = slice(SRC, 'function EventPlanningConfigurator(', '\nconst LUGAR_CONTEXTO_OPTIONS')
    const body = slice(configurator, 'function EventPlanningConfigurator({', '\n  return (')
    expect(body).not.toContain('return null')
  })

  it('"🕊️ Ceremonia y celebración" y "📍 Dónde lo vais a celebrar" son mutuamente excluyentes (mismo ternario sobre isEventStructuredByMoments)', () => {
    const configurator = slice(SRC, 'function EventPlanningConfigurator(', '\nconst LUGAR_CONTEXTO_OPTIONS')
    expect(configurator).toContain('{isEventStructuredByMoments(event) ? (')
    const ternary = slice(configurator, '{isEventStructuredByMoments(event) ? (', '\n          )}')
    expect(ternary).toContain('🕊️ Ceremonia y celebración')
    expect(ternary).toContain('📍 Dónde lo vais a celebrar')
    expect(ternary).toContain('<LugarContextoBlock event={event} />')
  })

  it('"👥 Invitados e invitaciones" y "🎉 Momentos especiales" son incondicionales — aplican a cualquier tipo de evento', () => {
    const configurator = slice(SRC, 'function EventPlanningConfigurator(', '\nconst LUGAR_CONTEXTO_OPTIONS')
    expect(configurator).toContain('👥 Invitados e invitaciones')
    expect(configurator).toContain('🎉 Momentos especiales')
    expect(configurator).toContain('<MomentosEspecialesBlock event={event} onDerivedDataChanged={onDerivedDataChanged} />')
    // A diferencia de "La pareja", nunca envueltos en `event.type === 'boda'`.
    const momentosEspecialesIdx = configurator.indexOf('🎉 Momentos especiales')
    const nearestTypeCheckBefore = configurator.lastIndexOf("event.type === 'boda'", momentosEspecialesIdx)
    const guestsIdx = configurator.indexOf('👥 Invitados e invitaciones')
    expect(nearestTypeCheckBefore).toBeLessThan(guestsIdx) // el único "event.type === 'boda'" del componente queda ANTES de Invitados, nunca envolviendo a Momentos especiales
  })

  it('Momentos especiales usa su propio acordeón (momentosEspecialesOpen/toggleMomentosEspecialesBlock), mismo mecanismo que el resto de bloques', () => {
    const configurator = slice(SRC, 'function EventPlanningConfigurator(', '\nconst LUGAR_CONTEXTO_OPTIONS')
    expect(configurator).toContain("loadConfiguratorOpen(event.id, 'momentos_especiales')")
    expect(configurator).toContain("saveConfiguratorOpen(event.id, 'momentos_especiales', next)")
  })
})

describe('MomentosEspecialesBlock — selección múltiple sobre el catálogo, nunca crea event_moments', () => {
  it('reutiliza listEventDecisions/upsertEventDecision/applyPairDecisionGeneration/deleteEventDecision — nunca una tabla/motor nuevo', () => {
    const block = slice(SRC, 'function MomentosEspecialesBlock(', '\n// ---------------------------------------------------------------------\n// Fase 2 — Momentos genéricos')
    expect(block).toContain('listEventDecisions(event.id)')
    expect(block).toContain('upsertEventDecision(event.id, {')
    expect(block).toContain('applyPairDecisionGeneration(event.id,')
    expect(block).toContain('deleteEventDecision(existing.id)')
    expect(block).not.toContain('addEventMoment(')
    expect(block).not.toContain('event_moments')
  })

  it('filtra las decisiones por blockKey "momentos_especiales" — nunca mezcla con otros bloques', () => {
    const block = slice(SRC, 'function MomentosEspecialesBlock(', '\n// ---------------------------------------------------------------------\n// Fase 2 — Momentos genéricos')
    expect(block).toContain("x.blockKey === 'momentos_especiales'")
  })

  it('el catálogo se elige por event.type (MOMENTOS_ESPECIALES_CATALOG[event.type]) — nunca hardcodeado por evento', () => {
    const block = slice(SRC, 'function MomentosEspecialesBlock(', '\n// ---------------------------------------------------------------------\n// Fase 2 — Momentos genéricos')
    expect(block).toContain('MOMENTOS_ESPECIALES_CATALOG[event.type]')
  })

  it('deseleccionar "Primer baile" reconcilia a NONE y borra la sub-decisión de clases de baile — nunca deja un Preparativo huérfano', () => {
    const block = slice(SRC, 'async function saveSeleccion(', '\n  async function saveClasesBaile(')
    expect(block).toContain("if (!answer.selected.includes('primer_baile')) {")
    expect(block).toContain('desiredForClasesBaile(undefined)')
    expect(block).toContain('deleteEventDecision(existing.id)')
  })

  it('"¿Necesitáis clases de baile?" solo se revela cuando "primer_baile" está en la selección', () => {
    const block = slice(SRC, 'function MomentosEspecialesBlock(', '\n// ---------------------------------------------------------------------\n// Fase 2 — Momentos genéricos')
    expect(block).toContain("seleccion?.selected.includes('primer_baile') && (")
    expect(block).toContain('<ClasesBaileQuestion')
  })

  it('RETOQUE (feedback visual) — tanto crear/completar "Sí" como retirar "No" pasan por describeEffects/showToast, el mismo patrón global que PairBlock/GuestsDecisionsBlock — nunca un sistema de toast propio', () => {
    const saveClasesBaile = slice(SRC, 'async function saveClasesBaile(', '\n\n  if (loading)')
    expect(saveClasesBaile).toContain('const message = describeEffects(actions)')
    expect(saveClasesBaile).toContain('if (message) showToast(message)')
    const saveSeleccion = slice(SRC, 'async function saveSeleccion(', '\n  async function saveClasesBaile(')
    expect(saveSeleccion).toContain('const message = describeEffects(allActions)')
    expect(saveSeleccion).toContain('if (message) showToast(message)')
  })
})

describe('MomentosEspecialesQuestion — checklist + "+ Otro" + terminales mutuamente excluyentes', () => {
  it('marcar un elemento del catálogo pone choice en "seleccionar", nunca preselecciona nada por defecto', () => {
    const fn = slice(SRC, 'function MomentosEspecialesQuestion(', '\nfunction ClasesBaileQuestion(')
    expect(fn).toContain("choice: 'seleccionar',")
    expect(fn).toContain('const [draft, setDraft] = useState<MomentosEspecialesAnswer | null>(null)')
  })

  it('"Todavía no lo sabemos" y "Ninguno en especial" limpian la selección (selected: [], customItems: [])', () => {
    const fn = slice(SRC, 'function MomentosEspecialesQuestion(', '\nfunction ClasesBaileQuestion(')
    expect(fn).toContain("function selectTerminal(choice: 'ninguno' | 'todavia_no_lo_sabemos') {")
    expect(fn).toContain('selected: [], customItems: [] }')
  })

  it('"+ Otro momento especial" añade texto libre a customItems sin inferir nada (ni tarea ni proveedor)', () => {
    const fn = slice(SRC, 'function MomentosEspecialesQuestion(', '\nfunction ClasesBaileQuestion(')
    expect(fn).toContain('function addCustom() {')
    expect(fn).toContain('customItems: [...(current?.customItems ?? []), customInput.trim()]')
  })
})

describe('ClasesBaileQuestion — Sí/No/Todavía no lo sabemos, sin preselección', () => {
  it('reutiliza ChoiceRow, mismo patrón de un solo nivel que el resto del motor', () => {
    const fn = slice(SRC, 'function ClasesBaileQuestion(', '\nfunction MomentosEspecialesBlock(')
    expect(fn).toContain('<ChoiceRow options={CLASES_BAILE_OPTIONS} value={existing?.choice}')
  })

  it('CLASES_BAILE_OPTIONS no trae ninguna opción marcada por defecto (son solo 3 valores, sin selected/active)', () => {
    const start = SRC.indexOf('const CLASES_BAILE_OPTIONS')
    const arrayStart = SRC.indexOf('= [', start)
    const optionsBlock = SRC.slice(arrayStart, SRC.indexOf(']', arrayStart + 3))
    expect(optionsBlock).toContain("value: 'si'")
    expect(optionsBlock).toContain("value: 'no'")
    expect(optionsBlock).toContain("value: 'todavia_no_lo_sabemos'")
  })
})

describe('LugarContextoBlock — contexto del lugar para eventos sin ceremonia, nunca la dirección exacta', () => {
  it('se guarda directamente con upsertEventDecision, sin applyPairDecisionGeneration — nunca genera nada', () => {
    const block = slice(SRC, 'function LugarContextoBlock(', '\n// ---------------------------------------------------------------------\n// "👰🤵 La pareja"')
    expect(block).toContain('upsertEventDecision(event.id, {')
    expect(block).not.toContain('applyPairDecisionGeneration')
  })

  it('reutiliza CustomAwareQuestion, nunca un componente de pregunta nuevo', () => {
    const block = slice(SRC, 'function LugarContextoBlock(', '\n// ---------------------------------------------------------------------\n// "👰🤵 La pareja"')
    expect(block).toContain('<CustomAwareQuestion')
    expect(block).toContain('questionKey={LUGAR_CONTEXTO_QUESTION_KEY}')
  })

  it('nunca toca venueLabel/coordenadas — la dirección exacta sigue viviendo en "Gestionar evento"', () => {
    const block = slice(SRC, 'function LugarContextoBlock(', '\n// ---------------------------------------------------------------------\n// "👰🤵 La pareja"')
    expect(block).not.toContain('venueLabel')
    expect(block).not.toContain('EventLocationCoordsPicker')
  })

  it('LUGAR_CONTEXTO_OPTIONS tiene las 5 opciones pedidas, sin preselección', () => {
    const start = SRC.indexOf('const LUGAR_CONTEXTO_OPTIONS')
    const arrayStart = SRC.indexOf('= [', start)
    const optionsBlock = SRC.slice(arrayStart, SRC.indexOf(']', arrayStart + 3))
    expect(optionsBlock).toContain("value: 'en_casa'")
    expect(optionsBlock).toContain("value: 'restaurante_local'")
    expect(optionsBlock).toContain("value: 'exterior'")
    expect(optionsBlock).toContain("value: 'otro'")
    expect(optionsBlock).toContain("value: 'todavia_no_lo_sabemos'")
  })
})
