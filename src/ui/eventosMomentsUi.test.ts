import { describe, expect, it } from 'vitest'

// Eventos — Fase 2 del configurador: "Gestionar evento → Momentos" + "✨ Cómo queréis que sea vuestra
// boda → Ceremonia y celebración" sobre event_moments (modelo creado en la Fase 1). Mismo patrón
// estructural que el resto de *Ui.test.ts de este archivo (sin jsdom): se lee el código real y se
// comprueba texto/estructura, nunca se renderiza.
const SRC = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function slice(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('CeremoniaSection ha desaparecido — sustituida por MomentsEditor sobre event_moments', () => {
  it('ya no existe ningún rastro de la antigua sección fija de 2 ubicaciones', () => {
    expect(SRC).not.toContain('function CeremoniaSection')
    expect(SRC).not.toMatch(/<CeremoniaSection/)
  })
})

describe('Fuente única: Configurador y "Gestionar evento" montan exactamente el mismo componente', () => {
  it('MomentsEditor se monta en 2 sitios, con las mismas props (event, onChanged) — nunca una copia del estado', () => {
    const matches = SRC.match(/<MomentsEditor event=\{event\} onChanged=\{onChanged\} \/>/g) ?? []
    expect(matches.length).toBe(2)
  })

  it('un sitio es "Gestionar evento" → Momentos', () => {
    const manageEventModal = slice(SRC, 'function ManageEventModal(', '\n// Petición real: "Compras" en la rejilla del dashboard')
    expect(manageEventModal).toContain('<strong>Momentos</strong>')
    expect(manageEventModal).toContain('<MomentsEditor event={event} onChanged={onChanged} />')
  })

  it('el otro sitio es el configurador del dashboard ("✨ Cómo queréis...")', () => {
    const configurator = slice(SRC, 'function EventPlanningConfigurator(', '\nfunction MomentForm(')
    expect(configurator).toContain('🕊️ Ceremonia y celebración')
    expect(configurator).toContain('<MomentsEditor event={event} onChanged={onChanged} />')
  })
})

describe('Regla de lugar genérico — nunca redundante con Momentos', () => {
  it('isEventStructuredByMoments es la ÚNICA condición, reutilizada en los 3 sitios (cabecera, formulario, configurador)', () => {
    expect(SRC).toContain(
      "function isEventStructuredByMoments(event: Pick<FamilyEvent, 'type' | 'enabledModules'>): boolean {\n  return DUAL_LOCATION_EVENT_TYPES.includes(event.type) && event.enabledModules.includes('ceremonia')\n}",
    )
    const usages = SRC.match(/isEventStructuredByMoments\(event\)/g) ?? []
    // 4 usos reales (cabecera; "Lugar" en "Gestionar evento"; "Momentos" en "Gestionar evento";
    // EventPlanningConfigurator, que ahora decide solo entre el bloque "Ceremonia y celebración" o el
    // bloque "Lugar de contexto", nunca si se pinta el configurador entero — ver RETOQUE más abajo).
    expect(usages.length).toBe(4)
  })

  it('la cabecera del evento oculta el "🏠 Lugar" genérico cuando el evento está estructurado por momentos', () => {
    const heroLine = slice(SRC, "{event.venueLabel && !isEventStructuredByMoments(event) && (", '🎨 Tema:')
    expect(heroLine).toContain('🏠 {event.venueLabel}')
  })

  it('"Gestionar evento" oculta el campo "Lugar" + selector de mapa cuando está estructurado por momentos — nunca lo borra, solo deja de mostrarlo', () => {
    const manageEventModal = slice(SRC, 'function ManageEventModal(', '\n// Petición real: "Compras" en la rejilla del dashboard')
    expect(manageEventModal).toContain('{!isEventStructuredByMoments(event) && (')
    const hiddenBlock = slice(manageEventModal, '{!isEventStructuredByMoments(event) && (', '<label>\n            Tema')
    expect(hiddenBlock).toContain('Lugar (como se ve en la invitación)')
    expect(hiddenBlock).toContain('<EventLocationCoordsPicker')
    expect(hiddenBlock).toContain('coords={venueCoords}')
    expect(hiddenBlock).toContain('onCoordsChange={setVenueCoords}')
  })

  it('un evento SIMPLE (no estructurado por momentos) sigue mostrando "Lugar" exactamente igual que siempre — no se complica cumpleaños/comidas', () => {
    // isEventStructuredByMoments solo es cierto para DUAL_LOCATION_EVENT_TYPES con el módulo "ceremonia"
    // activo — cualquier otro tipo (cumpleanos, celebracion, personalizado) nunca entra en esa rama.
    expect(SRC).toContain("DUAL_LOCATION_EVENT_TYPES.includes(event.type) && event.enabledModules.includes('ceremonia')")
  })

  it('RETOQUE — EventPlanningConfigurator ya NO hace early-return para eventos simples: se pinta siempre, y es el bloque "Ceremonia y celebración" el que se auto-filtra por dentro (ternario sobre isEventStructuredByMoments), igual que "La pareja" ya se autofiltraba por event.type', () => {
    const configurator = slice(SRC, 'function EventPlanningConfigurator(', '\nfunction MomentForm(')
    const earlyReturnBody = slice(configurator, 'function EventPlanningConfigurator({', '\n  return (')
    expect(earlyReturnBody).not.toContain('return null')
    expect(configurator).toContain('{isEventStructuredByMoments(event) ? (')
  })
})

describe('Momentos sin fecha/hora/lugar — "por decidir", nunca se obliga a rellenar', () => {
  it('momentSummaryLine distingue fecha y hora de forma independiente', () => {
    const fn = slice(SRC, 'function momentSummaryLine(', '\n}')
    expect(fn).toContain("'Fecha por decidir'")
    expect(fn).toContain("'Hora por decidir'")
  })

  it('MomentCard muestra "Lugar por decidir" cuando no hay lugar', () => {
    const fn = slice(SRC, 'function MomentCard(', '\nfunction MomentsEditor(')
    expect(fn).toContain("moment.locationLabel || 'Lugar por decidir'")
  })

  it('MomentForm nunca exige fecha/hora/lugar para guardar — solo el nombre es obligatorio', () => {
    const fn = slice(SRC, 'function MomentForm(', '\nfunction MomentCard(')
    expect(fn).toContain('disabled={saving || !title.trim()}')
    expect(fn).not.toMatch(/momentDate.*required/)
    expect(fn).not.toMatch(/momentTime.*required/)
    expect(fn).not.toMatch(/locationLabel.*required/)
  })
})

describe('"+ Añadir momento" — título libre, sin enum rígido, con sugerencias', () => {
  it('las sugerencias son chips que rellenan el campo libre, nunca un <select> cerrado', () => {
    const fn = slice(SRC, 'function MomentForm(', '\nfunction MomentCard(')
    expect(fn).toContain('MOMENT_TITLE_SUGGESTIONS.map')
    expect(fn).toContain("onClick={() => setTitle(s)}")
    expect(fn).not.toMatch(/<select[^>]*value=\{title\}/)
  })

  it('no hay límite de cuántos momentos se pueden añadir (ningún momentos.length < N antes de permitir añadir)', () => {
    const fn = slice(SRC, 'function MomentsEditor(', 'function InvitationSection(')
    expect(fn).not.toMatch(/moments\.length\s*[<>]=?\s*\d/)
  })
})

describe('Editar un momento — materializa un momento "legacy" en vez de pisarlo', () => {
  it('handleEditSave crea (addEventMoment) cuando el momento es legacy, actualiza (updateEventMoment) cuando es real', () => {
    const fn = slice(SRC, 'async function handleEditSave(', '\n  async function handleDelete(')
    expect(fn).toContain('if (moment.isLegacy) {')
    expect(fn).toContain('await addEventMoment(event.id, {')
    expect(fn).toContain('await updateEventMoment(moment.id, {')
  })
})

describe('Reordenar — flechas ↑ ↓, nunca drag & drop (petición explícita: no es fiable en móvil)', () => {
  it('no hay ningún rastro de drag&drop en los componentes de Momentos', () => {
    const momentsBlock = slice(SRC, 'function EventPlanningConfigurator(', '\nfunction MomentsEditor(')
    const editorBlock = slice(SRC, 'function MomentsEditor(', 'function InvitationSection(')
    for (const block of [momentsBlock, editorBlock]) {
      expect(block).not.toMatch(/draggable|onDragStart|onDrop|dnd-kit|react-beautiful-dnd|sortable/i)
    }
  })

  it('handleReorder usa reorderEventMoments (Fase 1) con el array completo en el nuevo orden', () => {
    const fn = slice(SRC, 'async function handleReorder(', '\n  }')
    expect(fn).toContain('await reorderEventMoments(reordered.map((m) => m.id))')
  })

  it('las flechas de un momento legacy (sintetizado, sin fila real) quedan deshabilitadas — no hay nada persistente que reordenar todavía', () => {
    const fn = slice(SRC, 'function MomentsEditor(', 'function InvitationSection(')
    expect(fn).toContain('const realMomentIds = moments.filter((m) => !m.isLegacy).map((m) => m.id)')
    expect(fn).toContain('const realIndex = realMomentIds.indexOf(moment.id)')
    expect(fn).toContain('canMoveUp={realIndex > 0}')
  })
})

describe('Borrar un momento — comprobación de relaciones antes de confirmar (nunca un borrado silencioso)', () => {
  it('se cuentan los invitados vinculados (event_guest_moments) antes de poder borrar', () => {
    const fn = slice(SRC, 'function MomentsEditor(', 'function InvitationSection(')
    expect(fn).toContain('listEventGuestMoments(event.id)')
    expect(fn).toContain('counts.set(link.momentId, (counts.get(link.momentId) ?? 0) + 1)')
  })

  it('el aviso de invitados vinculados NO vive permanentemente en la ficha — solo como mensaje de confirmación al pulsar Eliminar (cierre de Fase 2, ajuste visual)', () => {
    const fn = slice(SRC, 'function MomentCard(', '\nfunction MomentsEditor(')
    expect(fn).not.toMatch(/\{guestCount > 0 && \(\s*<p/)
    expect(fn).toContain('const deleteConfirmMessage =')
    expect(fn).toMatch(/invitado\$\{guestCount === 1 \? '' : 's'\} vinculado/)
    expect(fn).toContain("¿Quieres continuar?")
  })

  it('reutiliza ConfirmButton (doble toque) para el borrado real, pasándole el mensaje dinámico — no un botón de un solo toque ni un "¿Seguro?" genérico cuando hay invitados', () => {
    const fn = slice(SRC, 'function MomentCard(', '\nfunction MomentsEditor(')
    expect(fn).toContain('<ConfirmButton')
    expect(fn).toContain('confirmMessage={deleteConfirmMessage}')
  })

  it('borrar un momento legacy nunca crea una fila real solo para borrarla — vacía los campos heredados directamente', () => {
    const fn = slice(SRC, 'async function handleDelete(', '\n  }')
    expect(fn).toContain('if (moment.isLegacy) {')
    expect(fn).toContain("if (moment.title === 'Ceremonia') {")
    expect(fn).toContain('await updateEvent(event.id, { ceremonyLocationLabel: null')
    expect(fn).toContain('await updateEvent(event.id, { celebrationLocationLabel: null')
    expect(fn).not.toMatch(/moment\.isLegacy[\s\S]{0,80}addEventMoment/)
  })
})

describe('Fallback de la Fase 1 reutilizado tal cual, nunca reimplementado', () => {
  it('MomentsEditor llama a resolveEventMoments (domain/events.ts) — no sintetiza "Ceremonia"/"Celebración" por su cuenta', () => {
    const fn = slice(SRC, 'async function load() {', '\n  }\n\n  useEffect')
    expect(fn).toContain('resolveEventMoments(event, real)')
    expect(fn).not.toContain("'Ceremonia'")
  })
})

describe('No se copian datos al volver a abrir la pantalla (nunca una escritura en el load)', () => {
  it('load() de MomentsEditor solo lista (listEventMoments/listEventGuestMoments), nunca inserta/actualiza', () => {
    const fn = slice(SRC, 'async function load() {', '\n  }\n\n  useEffect')
    expect(fn).not.toMatch(/add[A-Z]\w*\(|update[A-Z]\w*\(/)
  })

  it('el useEffect de carga solo depende de event.id — no se dispara de más ni duplica llamadas por cada render', () => {
    const fn = slice(SRC, 'function MomentsEditor(', 'function InvitationSection(')
    expect(fn).toContain('}, [event.id])')
  })
})

describe('event_date no se toca — sigue siendo la fecha principal del evento, independiente de cada momento', () => {
  it('ManageEventModal sigue leyendo/guardando event.eventDate exactamente igual que antes de la Fase 2', () => {
    const manageEventModal = slice(SRC, 'function ManageEventModal(', '\n// Petición real: "Compras" en la rejilla del dashboard')
    expect(manageEventModal).toContain("const [eventDate, setEventDate] = useState(event.eventDate ?? '')")
    expect(manageEventModal).toContain('eventDate: nextDate,')
  })

  it('cada momento guarda su PROPIA fecha (momentDate), nunca forzada a event.eventDate', () => {
    const fn = slice(SRC, 'function MomentForm(', '\nfunction MomentCard(')
    expect(fn).toContain("const [momentDate, setMomentDate] = useState(initial?.momentDate ?? '')")
    expect(fn).not.toContain('event.eventDate')
  })
})

describe('Acordeón — plegable globalmente y por bloque, estado simple en localStorage, sin wizard', () => {
  it('EventPlanningConfigurator usa loadConfiguratorOpen/saveConfiguratorOpen (Fase 2, src/state) para el nivel global Y el del bloque', () => {
    const fn = slice(SRC, 'function EventPlanningConfigurator(', '\nfunction MomentForm(')
    expect(fn).toContain("loadConfiguratorOpen(event.id)")
    expect(fn).toContain("loadConfiguratorOpen(event.id, 'ceremonia_celebracion')")
    expect(fn).toContain("saveConfiguratorOpen(event.id, null, next)")
    expect(fn).toContain("saveConfiguratorOpen(event.id, 'ceremonia_celebracion', next)")
  })

  it('no hay ningún porcentaje/barra de progreso agregado en el configurador (CSS width:100% no cuenta, eso es maquetación)', () => {
    // Acotado a la propia EventPlanningConfigurator (hasta el siguiente componente, ChoiceRow) — antes
    // llegaba hasta MomentForm e incluía de paso todos los componentes de "La pareja" (Fase 3), cuyo
    // propio toast "✓ Preparativo completado" usa legítimamente la palabra "completado" sin ser una barra
    // de progreso ni un porcentaje — nada que ver con lo que esta prueba vigila.
    const fn = slice(SRC, 'function EventPlanningConfigurator(', '\nfunction ChoiceRow<')
    expect(fn).not.toMatch(/progress|completado|\d+\s*%(?!'\s*,)/i)
  })

  it('el import del estado del acordeón viene del módulo nuevo dedicado, no de un useState suelto sin persistencia', () => {
    expect(SRC).toContain("import { loadConfiguratorOpen, saveConfiguratorOpen } from '@/state/eventPlanningConfiguratorState'")
  })
})

describe('Bloques implementados hasta la fase 5 (reajustada): Ceremonia, La pareja, Invitados e invitaciones, Momentos especiales', () => {
  it('los 4 bloques están presentes', () => {
    const configurator = slice(SRC, 'function EventPlanningConfigurator(', '\nfunction MomentForm(')
    expect(configurator).toContain('🕊️ Ceremonia y celebración')
    expect(configurator).toContain('👰🤵 La pareja')
    expect(configurator).toContain('👥 Invitados e invitaciones')
    expect(configurator).toContain('🎉 Momentos especiales')
  })

  it('ningún bloque posterior del documento maestro (Comida y celebración, Música/fiesta, Fotos y recuerdos, Detalles y regalos, Decoración) está implementado todavía', () => {
    const configurator = slice(SRC, 'function EventPlanningConfigurator(', '\nfunction MomentForm(')
    for (const forbidden of ['Comida y celebración', 'Música, fiesta', 'Fotos y recuerdos', 'Detalles y regalos', 'Decoración']) {
      expect(configurator).not.toContain(forbidden)
    }
  })
})
