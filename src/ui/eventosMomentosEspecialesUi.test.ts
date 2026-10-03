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
    expect(ternary).toContain('<LugarContextoBlock event={event} onChanged={onChanged} />')
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
    const block = slice(SRC, 'function LugarContextoBlock(', '\nfunction CasaLocationBlock(')
    expect(block).toContain('upsertEventDecision(event.id, {')
    expect(block).not.toContain('applyPairDecisionGeneration')
  })

  it('reutiliza CustomAwareQuestion, nunca un componente de pregunta nuevo', () => {
    const block = slice(SRC, 'function LugarContextoBlock(', '\nfunction CasaLocationBlock(')
    expect(block).toContain('<CustomAwareQuestion')
    expect(block).toContain('questionKey={LUGAR_CONTEXTO_QUESTION_KEY}')
  })

  // RETOQUE (siguiente mejora validada: "En casa" → proponer Casa) — LugarContextoBlock en sí (la
  // pregunta de CONTEXTO, guardada en event_decisions) sigue sin tocar venueLabel/coordenadas
  // directamente; delega esa parte por completo a CasaLocationBlock, y solo cuando la respuesta ya
  // guardada es 'en_casa' — nunca al elegir cualquier otra opción (restaurante/exterior/otro/todavía).
  it('delega venueLabel/EventLocationCoordsPicker a CasaLocationBlock, nunca los toca directamente, y solo cuando la decisión es "en_casa"', () => {
    const upsertPart = slice(SRC, 'async function save(answer: { choice: LugarContextoChoice', '\n  if (loading)')
    expect(upsertPart).not.toContain('venueLabel')
    expect(upsertPart).not.toContain('EventLocationCoordsPicker')
    const render = slice(SRC, 'function LugarContextoBlock(', '\nfunction CasaLocationBlock(')
    expect(render).toContain("lugarAnswer?.choice === 'en_casa' && <CasaLocationBlock")
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

// "En casa" → proponer la Casa familiar (siguiente mejora, validada por separado tras cerrar la
// persistencia de events.venue_*). Casa se identifica por name === 'Casa' (auditado antes de
// implementar: location_places no tiene ningún tipo/slug/categoría dedicado).
describe('CasaLocationBlock — "En casa" propone la Casa familiar guardada en Ubicación, nunca la asigna en silencio', () => {
  const block = slice(SRC, 'function CasaLocationBlock(', '\nfunction CasaLocationManualPicker(')

  it('identifica Casa por name === \'casa\' (sin distinguir mayúsculas) — location_places no tiene ningún tipo/slug dedicado (auditado)', () => {
    expect(block).toContain("places.find((p) => p.name.trim().toLowerCase() === 'casa')")
  })

  it('listPlaces() ya aplica la RLS de family_id de siempre — nunca un segundo filtro ni una consulta sin acotar', () => {
    expect(block).toContain('listPlaces()')
    expect(SRC).not.toContain("from('location_places')")
  })

  it('al confirmar, COPIA una instantánea a events.venue_* — nunca guarda una referencia viva (location_place_id) ni un id de location_places en el evento', () => {
    const confirmFn = slice(block, 'async function handleConfirmCasa()', '\n  }')
    expect(confirmFn).toContain('venueLatitude: casa.latitude')
    expect(confirmFn).toContain('venueLongitude: casa.longitude')
    expect(confirmFn).not.toContain('casa.id')
    expect(SRC).not.toMatch(/location_place_id|casaId|casa_id/)
  })

  it('venuePlaceId siempre queda null al copiar desde Casa — Casa nunca tiene uno (nunca se inventa)', () => {
    const confirmFn = slice(block, 'async function handleConfirmCasa()', '\n  }')
    expect(confirmFn).toContain('venuePlaceId: null')
  })

  it('nunca convierte venueLabel en "Casa" a la fuerza — conserva el label que ya tenga el evento, y solo usa el nombre de Casa cuando el evento no tiene ninguno', () => {
    const confirmFn = slice(block, 'async function handleConfirmCasa()', '\n  }')
    expect(confirmFn).toContain("venueLabel: event.venueLabel?.trim() ? event.venueLabel : casa.name")
  })

  // RETOQUE (petición real: "las coordenadas son poco útiles para una persona") — reverseGeocode() ya no
  // se llama dentro de handleConfirmCasa: se resuelve UNA sola vez en un efecto propio, en cuanto Casa se
  // carga, y handleConfirmCasa solo reutiliza ese resultado (casaAddress) — nunca una segunda llamada al
  // confirmar, ni una llamada repetida en cada render.
  describe('reverseGeocode() se resuelve UNA sola vez (efecto propio), nunca dentro de handleConfirmCasa ni repetido por render', () => {
    it('handleConfirmCasa reutiliza casaAddress ya resuelto — no llama a reverseGeocode él mismo', () => {
      const confirmFn = slice(block, 'async function handleConfirmCasa()', '\n  }')
      expect(confirmFn).not.toContain('reverseGeocode(')
      expect(confirmFn).toContain('venueAddress: casaAddress,')
    })

    it('un efecto dedicado, dependiente solo de `casa` (no de cada render), llama a reverseGeocode con las coordenadas de Casa', () => {
      const effect = slice(block, 'useEffect(() => {\n    if (!casa) return', '\n  }, [casa])')
      expect(effect).toContain('reverseGeocode(casa.latitude, casa.longitude)')
      expect(block).toContain('}, [casa])')
    })

    it('controla desmontaje con un flag `cancelled` — nunca escribe estado tras desmontar', () => {
      const effect = slice(block, 'useEffect(() => {\n    if (!casa) return', '\n  }, [casa])')
      expect(effect).toContain('let cancelled = false')
      expect(effect).toContain('if (!cancelled) setCasaAddress(address)')
      expect(effect).toContain('return () => {\n      cancelled = true\n    }')
    })

    it('un fallo de reverseGeocode se traga sin más (setCasaAddress(null)) — nunca bloquea Sí/No, cae al mismo fallback humano', () => {
      const effect = slice(block, 'useEffect(() => {\n    if (!casa) return', '\n  }, [casa])')
      expect(effect).toContain('.catch(() => {')
      expect(effect).toContain('if (!cancelled) setCasaAddress(null)')
    })
  })

  // RETOQUE — antes de confirmar, nunca se muestran coordenadas en bruto como texto principal: se usa la
  // dirección ya resuelta, o un fallback humano ("Ubicación Casa guardada") mientras se resuelve o si falla.
  it('muestra la dirección resuelta (casaAddress) antes de confirmar, con fallback humano "Ubicación Casa guardada" — nunca coordenadas en bruto', () => {
    expect(block).toContain('{casaAddress ?? (casa.category ? `${casa.category} · Ubicación Casa guardada` : \'Ubicación Casa guardada\')}')
    expect(block).not.toMatch(/casa\.latitude\.toFixed|casa\.longitude\.toFixed/)
  })

  it('"Sí, usar esta ubicación" nunca escribe en location_places — Casa nunca se modifica desde Eventos', () => {
    expect(block).not.toContain('updatePlace(')
    expect(block).not.toContain('addPlace(')
    expect(block).not.toContain('deletePlace(')
  })

  it('no crea Preparativos/Presupuesto/Proveedores — ni applyPairDecisionGeneration, ni event_tasks/event_budget_items/event_providers', () => {
    expect(block).not.toContain('applyPairDecisionGeneration')
    expect(block).not.toContain('event_tasks')
    expect(block).not.toContain('event_budget_items')
    expect(block).not.toContain('event_providers')
  })

  it('si el evento ya tiene ubicación (coords), muestra un resumen en vez de la propuesta — solo entra en el flujo de Casa si el usuario pulsa "Cambiar ubicación"', () => {
    expect(block).toContain('const hasVenue = event.venueLatitude != null && event.venueLongitude != null')
    expect(block).toContain('const showSummary = hasVenue && !editing')
    expect(block).toContain('📍 Ubicación del evento')
    expect(block).toContain('Cambiar ubicación')
  })

  it('"No, elegir otra" revela el picker manual sin tocar Casa ni el evento', () => {
    expect(block).toContain('onClick={() => setSkipProposal(true)}')
    expect(block).toContain('No, elegir otra')
  })

  it('sin Casa configurada, no muestra tarjeta vacía ni error — pasa directo al picker manual con una nota', () => {
    expect(block).toContain('const showProposal = casa && !skipProposal')
    expect(block).toContain('noCasaConfigured={!casa}')
  })
})

describe('CasaLocationManualPicker — "No, elegir otra"/"Cambiar ubicación" reutilizan EventLocationCoordsPicker, nunca un segundo buscador', () => {
  const fn = slice(SRC, 'function CasaLocationManualPicker(', '\n// ---------------------------------------------------------------------\n// "👰🤵 La pareja"')

  it('reutiliza EventLocationCoordsPicker con sus props completas (label+address+coords+placeId+fallback legacy), nunca un componente nuevo', () => {
    expect(fn).toContain('<EventLocationCoordsPicker')
    expect(fn).toContain('onPlaceDetails={(details) => {')
    expect(fn).toContain('initialAddress={venueAddress}')
    expect(fn).toContain('initialPlaceId={venuePlaceId}')
  })

  it('al guardar, escribe directamente en events.venue_* (updateEvent), nunca en event_decisions ni en location_places', () => {
    const saveFn = slice(fn, 'async function handleSave()', '\n  }')
    expect(saveFn).toContain('await updateEvent(event.id, {')
    expect(saveFn).not.toContain('upsertEventDecision')
    expect(saveFn).not.toContain("from('location_places')")
  })

  it('nunca fuerza el label a "Casa" — arranca con el venueLabel que ya tuviera el evento', () => {
    expect(fn).toContain("useState(event.venueLabel ?? '')")
  })
})
