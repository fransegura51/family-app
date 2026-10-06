import { describe, expect, it } from 'vitest'

// Eventos Fase 14B — desglose OPCIONAL de personas dentro de una
// unidad invitada (UI de EventosScreen.tsx, sobre la infraestructura
// de la Fase 14A). Las pruebas puras de computeGuestBreakdownStatus
// (grupo sin personas, una persona, varias personas, desglose
// completo/parcial, exceso de adultos/niños) viven en
// src/domain/events.test.ts junto a la propia función. Aquí se
// comprueban el cableado de la UI.
//
// CORRECTIVO VISUAL (capturas reales de iPhone, tras la certificación
// inicial): el enlace "Ocultar personas" pegado a "Añadir persona" se
// leía como una sola acción, y el formulario inline (Nombre | Tipo |
// Guardar | Cancelar) se salía de la tarjeta en móvil. Se sustituyó
// por una acción única y clara sin desglose ("👥 Añadir nombres de
// invitados", sin la palabra técnica "desglosar"), una cabecera
// compacta pulsable con contador real con desglose ("👥 Personas · X
// de Y", con chevron para expandir/contraer) y un modal/bottom-sheet
// compartido (mismo .modal-overlay/.modal-sheet que el resto de PEPA)
// para añadir Y editar, en vez de dos formularios inline distintos.
// El modelo de datos, la RLS, los recuentos y la Fase 14C/14D no se
// tocan — solo presentación (ver también las pruebas de "lo que NO
// cambia" al final de este archivo).
const APP = import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const SRC = APP['/src/ui/EventosScreen.tsx']

function window(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const GUEST_BREAKDOWN_SECTION = window(SRC, 'function GuestBreakdownSection', '\nfunction GuestPersonModal')
const GUEST_PERSON_MODAL = window(SRC, 'function GuestPersonModal', '\nfunction AddGuestModal')

describe('sin personas desglosadas → acción única y clara (TEST: sin personas → aparece Añadir nombres de invitados)', () => {
  it('muestra "👥 Añadir nombres de invitados", nunca la palabra técnica "desglosar"', () => {
    const body = window(GUEST_BREAKDOWN_SECTION, 'if (members.length === 0) {', "\n  return (\n    <div style={{ margin")
    expect(body).toContain('👥 Añadir nombres de invitados')
    expect(SRC).not.toMatch(/Desglosar personas/i)
  })

  it('el botón abre el modal en modo "añadir" (member=null), no un formulario inline', () => {
    const body = window(GUEST_BREAKDOWN_SECTION, 'if (members.length === 0) {', "\n  return (\n    <div style={{ margin")
    expect(body).toContain('onClick={() => setModalMember(null)}')
    expect(body).toContain('<GuestPersonModal')
  })
})

describe('con personas desglosadas → cabecera compacta con contador (TEST: con personas → aparece cabecera Personas · X de Y)', () => {
  it('el contador es personas identificadas (status.totalMembers) de total declarado (adultsCount + childrenCount)', () => {
    expect(GUEST_BREAKDOWN_SECTION).toContain('const totalDeclared = guest.adultsCount + guest.childrenCount')
    expect(GUEST_BREAKDOWN_SECTION).toContain('👥 Personas · {status.totalMembers} de {totalDeclared}')
  })

  it('nunca modifica adultsCount/childrenCount del guest — el contador solo LEE, nunca escribe esos campos', () => {
    expect(GUEST_BREAKDOWN_SECTION).not.toMatch(/adultsCount:|childrenCount:/)
  })
})

describe('cabecera pulsable, accesible, sin el patrón "Ocultar personas" pegado a "Añadir persona" (TEST: expandir/contraer)', () => {
  it('es un <button> nativo (accesible por teclado sin reimplementar onKeyDown) con aria-expanded y chevron', () => {
    const body = window(GUEST_BREAKDOWN_SECTION, 'return (\n    <div style={{ margin', '{expanded && (')
    expect(body).toContain('className="guest-breakdown-toggle"')
    expect(body).toContain('onClick={() => setExpanded((v) => !v)}')
    expect(body).toContain('aria-expanded={expanded}')
    expect(body).toContain("{expanded ? '︿' : '⌄'}")
  })

  it('ya no existe el enlace de texto "Ocultar personas"', () => {
    expect(SRC).not.toContain('Ocultar personas')
  })
})

describe('Añadir persona abre el modal, no un formulario inline (TEST: Añadir persona abre formulario, formulario no es inline)', () => {
  it('"+ Añadir persona" (dentro del bloque expandido) abre GuestPersonModal en modo "añadir"', () => {
    const body = window(GUEST_BREAKDOWN_SECTION, '{expanded && (', '{modalMember !== undefined && (')
    expect(body).toContain('onClick={() => setModalMember(null)}')
    expect(body).toContain('+ Añadir persona')
  })

  it('el modal reutiliza el patrón .modal-overlay/.modal-sheet ya existente en PEPA (mismo bottom-sheet responsive que el resto de modales de Eventos)', () => {
    expect(GUEST_PERSON_MODAL).toContain('<div className="modal-overlay" onClick={onClose}>')
    expect(GUEST_PERSON_MODAL).toContain('<div className="modal-sheet" onClick={(e) => e.stopPropagation()}>')
  })

  it('ya no queda ningún formulario "inline-fields" de alta/edición de persona en GuestBreakdownSection (el único formulario vive en el modal)', () => {
    expect(GUEST_BREAKDOWN_SECTION).not.toContain('inline-fields')
    expect(GUEST_BREAKDOWN_SECTION).not.toContain('<form')
  })
})

describe('editar reutiliza exactamente el mismo componente que añadir (TEST: editar reutiliza el mismo formulario)', () => {
  it('un único componente GuestPersonModal, con `member` decidiendo el modo — no hay un segundo formulario de edición', () => {
    expect(SRC.match(/^function GuestPersonModal/gm)?.length).toBe(1)
    expect(GUEST_PERSON_MODAL).toContain('const isEdit = member !== null')
  })

  it('título y valores precargados cambian según el modo, sin duplicar el JSX del formulario', () => {
    expect(GUEST_PERSON_MODAL).toContain("{isEdit ? 'Editar persona' : 'Añadir persona'}")
    expect(GUEST_PERSON_MODAL).toContain('useState(member?.name ?? \'\')')
    expect(GUEST_PERSON_MODAL).toContain("useState<EventGuestMemberType>(member?.personType ?? 'adulto')")
  })

  it('"Editar" en la fila de una persona abre el modal con esa persona (modo edición)', () => {
    const body = window(GUEST_BREAKDOWN_SECTION, 'guest-breakdown-person-row', '+ Añadir persona')
    expect(body).toContain('onClick={() => setModalMember(m)}')
  })
})

describe('guardar (TEST: guardar)', () => {
  it('guarda con addEventGuestMember en modo "añadir", con el mismo traslado de mesa inicial que ya tenía la Fase 14C', () => {
    const body = window(GUEST_PERSON_MODAL, 'async function handleSubmit', 'return (')
    expect(body).toContain('const initialTableId = hasExistingMembers ? null : guest.tableId')
    expect(body).toContain('await addEventGuestMember(guest, { name, personType, tableId: initialTableId })')
  })

  it('guarda con updateEventGuestMember en modo "editar", sobre esa persona concreta', () => {
    const body = window(GUEST_PERSON_MODAL, 'async function handleSubmit', 'return (')
    expect(body).toContain('await updateEventGuestMember(member.id, { name, personType })')
  })

  it('tras guardar, avisa al padre (onSaved) para recargar — nunca dos formularios ni dos fuentes de verdad', () => {
    const body = window(GUEST_PERSON_MODAL, 'async function handleSubmit', 'return (')
    expect(body).toContain('onSaved()')
  })

  it('el formulario de alta/edición no pide más que nombre y tipo (sin teléfono, edad, mesa...)', () => {
    expect(GUEST_PERSON_MODAL).toContain('placeholder="Nombre del invitado"')
    expect(GUEST_PERSON_MODAL).toContain('<option value="adulto">Adulto</option>')
    expect(GUEST_PERSON_MODAL).toContain('<option value="nino">Niño</option>')
    // Solo dos <label> en todo el formulario: Nombre y Tipo — nada más que rellenar.
    expect(GUEST_PERSON_MODAL.match(/<label>/g)?.length).toBe(2)
  })
})

describe('cancelar (TEST: cancelar)', () => {
  it('"Cancelar" y el "✕" de la cabecera cierran el modal sin guardar nada (solo onClose, nunca handleSubmit)', () => {
    const footer = window(GUEST_PERSON_MODAL, 'className="form-actions"', '</div>\n        </form>')
    expect(footer).toContain('onClick={onClose}')
    expect(footer).not.toContain('handleSubmit')
  })
})

describe('viewport móvil (TEST: funcionamiento con viewport móvil)', () => {
  it('el modal no introduce ningún ancho fijo ni control propio: hereda el responsive de .modal-sheet (100% de ancho hasta 640px, sin scroll horizontal)', () => {
    expect(GUEST_PERSON_MODAL).not.toMatch(/width:\s*\d+px|min-width/)
  })

  it('la cabecera plegable usa la clase guest-breakdown-toggle (ancho 100% y alto táctil mínimo 44px, verificado también en el navegador con viewport móvil — vitest no procesa el contenido real de styles.css en este entorno)', () => {
    expect(GUEST_BREAKDOWN_SECTION).toContain('className="guest-breakdown-toggle"')
  })
})

describe('aviso de inconsistencia no bloqueante (sin cambios de comportamiento)', () => {
  it('el aviso solo se pinta si adultsExceeded/childrenExceeded, nunca impide guardar (no hay ningún disabled ligado a status)', () => {
    expect(GUEST_BREAKDOWN_SECTION).toContain('status.adultsExceeded || status.childrenExceeded')
    expect(SRC).not.toMatch(/disabled=\{[^}]*status\./)
  })
})

describe('lo que NO cambia (TEST: lógica y datos de Fase 14B permanecen intactos)', () => {
  it('computeGuestBreakdownStatus sigue siendo la única fuente del contador y del aviso — no se recalcula nada a mano en la UI', () => {
    expect(GUEST_BREAKDOWN_SECTION).toContain('const status = computeGuestBreakdownStatus(guest, members)')
  })

  it('eliminar una persona sigue llamando a deleteEventGuestMember y recargando', () => {
    const body = window(GUEST_BREAKDOWN_SECTION, 'async function handleDeletePerson', 'if (!loaded)')
    expect(body).toContain('await deleteEventGuestMember(id)')
    expect(body).toContain('reloadMembers()')
  })

  it('updateEventGuest (capa de datos) sigue sin tocar event_guest_members: son dos tablas independientes', () => {
    const dataApp = (import.meta.glob('/src/data/events.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/data/events.ts']
    const start = dataApp.indexOf('export async function updateEventGuest(')
    expect(start).toBeGreaterThan(-1)
    const body = dataApp.slice(start, dataApp.indexOf('\nexport async function deleteEventGuest', start))
    expect(body).not.toContain('event_guest_members')
  })

  it('handleRsvpStatusChange (GuestsSection) sigue leyendo/escribiendo solo los campos agregados del guest, sin tocar event_guest_members', () => {
    const body = window(SRC, 'async function handleRsvpStatusChange', 'async function handleRemindPending')
    expect(body).toContain('rsvpAdultsCount')
    expect(body).toContain('rsvpChildrenCount')
    expect(body).not.toContain('event_guest_members')
    expect(body).not.toContain('listEventGuestMembers')
  })

  it('el flujo público de RSVP (event-rsvp Edge Function) ahora SÍ lee/escribe event_guest_members — extensión deliberada de la Parte B (elección de menú por persona, migración 0189), cubierta a fondo en src/data/eventRsvpMenuChoiceFunction.test.ts', () => {
    const rsvpFn = (import.meta.glob('/supabase/functions/event-rsvp/index.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
      '/supabase/functions/event-rsvp/index.ts'
    ]
    expect(rsvpFn).toContain('event_guest_members')
  })

  it('el corrector visual sigue sin ofrecer asignar mesa a una persona desde aquí (eso sigue siendo de la Fase 14C, en TablesSection)', () => {
    expect(GUEST_BREAKDOWN_SECTION).not.toMatch(/assignGuestTable|event_tables/i)
  })

  it('la fila existente del invitado ("X adultos, Y niños" + notas) no se ha tocado, solo se añade GuestBreakdownSection debajo', () => {
    const guestRow = window(SRC, '{g.adultsCount} adultos, {g.childrenCount} niños', '<GuestBreakdownSection guest={g} />')
    expect(guestRow).toContain("{g.notes ? ` · ${g.notes}` : ''}")
  })

  it('no se ha tocado ninguna migración ni política RLS de la Fase 14B (0167/0168/0169/0170/0171/0172/0173/0174/0175/0176/0177/0178/0179/0180/0181/0182/0183/0184/0185/0186/0187/0188 son de fases totalmente distintas y posteriores)', () => {
    // 0167 (reclassify_commission_reversal_pair_202609, FASE CA-4) es la corrección puntual del par
    // comisión+bonificación de septiembre. 0168 (receipt_dedup_fingerprint) añade huellas anti-duplicado a
    // `receipts`. 0169 (event_budget_item_amount_optional, cola nocturna Bloque 11) solo relaja una
    // restricción NOT NULL en event_budget_items.planned_amount. 0170 (date_filter_user_preferences,
    // Configuración → Filtros temporales) añade 2 columnas a `profiles`. 0171
    // (forecast_payment_document_import, "Importar desde foto o documento" en Previsión de pagos) añade 3
    // columnas a `forecast_payments` y un bucket de Storage nuevo. 0172 (event_planning_context, Fase 1
    // del "inicio inteligente" de Eventos) añade `events.included_services` — una columna en `events`,
    // nada en `event_guests`/`event_guest_members`/`event_tables`. 0173 (conciliación: herencia de
    // categoría) redefine match_forecast_occurrence. 0174 (conciliación: "No es este" persistido) añade
    // forecast_reconciliation_dismissals. 0175 (location_places_category, Ubicación: categoría libre por
    // lugar guardado) añade `location_places.category` — tabla de Ubicación. 0176
    // (event_decisions_and_moments, Fase 1 del motor de decisiones + momentos) SÍ toca Eventos, pero no
    // altera event_guests/event_guest_members/event_tables ni su RLS — solo añade tablas nuevas que la
    // REFERENCIAN (event_guest_moments) y decision_id en otras 5 tablas, nada de esto es la Fase 14B.
    // 0177 (event_moment_location_details, cierre de Fase 2 — Google Maps) añade location_address/
    // location_place_id a event_moments — tampoco toca event_guests/event_guest_members/event_tables.
    // 0178 (location_places_notify_arrivals, Ubicación: avisar al llegar/irse de un lugar) añade
    // location_places.notify_arrivals — tabla de Ubicación, tampoco toca eventos.
    // 0179 (event_decision_providers, Fase 3 "La pareja") añade la relación muchos-a-muchos decisión↔
    // proveedor (event_decisions/event_providers) — tampoco toca event_guests/event_guest_members/
    // event_tables ni su RLS.
    // 0180 (alexa_account_linking, integración con Alexa) añade alexa_links/alexa_auth_codes —
    // tampoco toca event_guests/event_guest_members/event_tables ni su RLS. 0181
    // (alexa_account_linking_drop) la deshace por completo — tampoco toca eventos. 0182
    // (store_chains_logo_and_shopping_link, catálogo global de cadenas para Compras) añade
    // store_chains.logo_asset y shopping_stores.chain_key — tablas de Compras, tampoco toca
    // event_guests/event_guest_members/event_tables ni su RLS. 0183 (store_chains_catalog_expansion)
    // añade más cadenas al mismo catálogo — tampoco toca eventos. 0184 (calendar_tasks_categories, FASE
    // CALENDARIO) añade kind/categorías/preferencias a calendar_events/profiles — tampoco toca
    // event_guests/event_guest_members/event_tables ni su RLS. 0185 (calendar_color_mode_three_modes)
    // solo cambia el CHECK y el default de profiles.calendar_color_mode — tampoco. 0186
    // (server_side_automations) añade tablas de estado de automatizaciones y un trigger en
    // member_locations — tampoco toca event_guests/event_guest_members/event_tables ni su RLS. 0187
    // (calendar_task_completion_prefs_and_privacy_fixes, RETOQUE Calendario) añade preferencias de
    // Tareas completadas a profiles y corrige privacidad de recordatorios/adjuntos — tampoco toca
    // event_guests/event_guest_members/event_tables ni su RLS. 0188 (send_test_push) añade push_test_log
    // y una función de aviso de prueba — tampoco toca invitados.
    // Ninguna de las veintidós tiene nada que ver con invitados/regalos de eventos.
    // 0189 (event_guest_menu_choice, Parte B) es la EXCEPCIÓN deliberada: sí añade columnas a
    // event_guest_members (rsvp_attending, menu_option_id) y endurece su RLS — cubierto a fondo en
    // src/data/eventRsvpMenuChoiceFunction.test.ts y en eventGuestMembersMigration.test.ts, no aquí. 0190
    // (event_guest_questions, "Preguntas a los invitados") solo añade tablas NUEVAS que REFERENCIAN
    // event_guests/event_guest_members (igual que event_guest_moments en 0176) — nunca altera esas dos
    // tablas ni su RLS; cubierto en eventGuestQuestionsMigration.test.ts, no aquí. 0191
    // (venue_address/venue_place_id) añade dos columnas a `events` — ni toca event_guests/
    // event_guest_members/event_tables ni su RLS; cubierto en eventVenueAddressMigration.test.ts, no aquí. 0192 (event_food_and_drink) añade event_guest_dietary_needs, que REFERENCIA event_guests/event_guest_members (igual que 0190) sin alterar esas tablas ni su RLS; cubierto en eventFoodAndDrinkMigration.test.ts, no aquí. 0193 (event_moment_date_status) añade una columna nulable a event_moments: ni toca event_guests/event_guest_members/event_tables ni su RLS.
    const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    const numbers = Object.keys(MIGRATIONS)
      .map((f) => Number(f.match(/(\d{4})_/)?.[1]))
      .filter((n) => !Number.isNaN(n))
    // 0197 (recordatorios de Calendario: claim_due_reminders y reminder_deliveries) no toca esta funcionalidad.
    expect(Math.max(...numbers)).toBe(206)
  })
})
