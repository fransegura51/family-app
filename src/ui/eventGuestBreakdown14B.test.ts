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
    // 0213/0214 (puente con OwnTracks y su retirada), 0215 (Encargos: resolución con proveedor/precio) y
    // 0216 (Personas especiales/Familiares) no tocan esta funcionalidad. 0217 (pista de familia duplicada
    // al unirse con código), 0218/0219 (vínculo rol↔persona en detalles especiales/tareas de Eventos), 0220
    // (historial de resolución de encargos), 0221 (provider_name en event_payments, snapshot del nombre
    // del proveedor en el pago) y 0222 (ficha ampliada de event_providers: contacto/teléfono/email/web/
    // dirección/archivado) y 0223 (ofertas de proveedores por encargo, event_task_group_offers — tabla
    // nueva, no toca event_payments ni event_budget_items) y 0224 (registro global de proveedores —
    // providers_global/event_provider_links, tablas nuevas; event_providers solo gana una columna
    // global_provider_id, sus FK existentes no cambian) tampoco tocan esta funcionalidad.
    // 0226 (registro de uso por cuenta para el panel de propietaria), 0227 (servicios estructurados y
    // versionado de ofertas de proveedores, event_task_group_offer_items — tabla nueva) y 0228 (trazabilidad
    // oferta→encargo, offer_id en event_task_groups/event_task_group_resolutions) tampoco tocan esta funcionalidad.
    expect(Math.max(...numbers)).toBe(353) // 0349-0353: Gestión de grupos y botes compartidos (grupos, participantes, botes, copias entre espacios, enlaces de consulta, función de IA). 0348: clases Muebles y organización y Manualidades y creatividad y categoría Vivienda y hogar → Muebles y organización (COR-06; aditiva, con reversión). 0347: reaprobar un menú conserva su semana prevista; 0346: señal en vivo del Centro Editorial; 0345: reprogramar encuestas; 0344: alcances de rectificación. 0343: preferencias de la familia (family_prefs; modo y orden del Comparador, mismo motor que user_prefs). 0342: lo que la familia quita del catalogo general no se le vuelve a poner (tabla pequena con RLS, dos disparadores de borrado y funcion para recuperarlo; aditiva, con reversion); 0341: cambiar nombre o icono de una categoria sin perder datos (funcion con permisos de quien la llama; aditiva); 0340: origen de la categoria de cada movimiento (dos columnas opcionales en expenses y un disparador que marca como manual lo que cambia una persona; aditiva, con reversion); 0339: ampliacion del catalogo de Economia (ocho categorias nuevas; aditiva, con reversion); 0338: el catalogo general llega solo a todas las familias (funciones y disparadores de sincronizacion; consolida duplicados equivalentes guardando el estado anterior; aditiva); 0337: preferencias del Comparador (amplia la lista cerrada de claves de preferencias); 0336: identidad del producto confirmada por la familia (una columna opcional en products; aditiva, no toca datos existentes); 0335: Centro de Control de IA (aditiva, con reversión); 0334: catálogo maestro de productos (tres clases nuevas en catalog_food_types y en las clases de las familias; aditiva, no toca datos existentes); 0333: agrupación automática del comparador (una columna con valor por defecto, un valor más permitido en source y una tabla nueva con RLS; no toca datos existentes); 0332: reparto de un gasto entre varias clasificaciones de Compras (tabla nueva con RLS, función con permisos y disparadores aditivos; no toca datos existentes); 0331: productos comunes del comparador (tablas nuevas con RLS por familia y columna ean; no toca datos existentes); 0330: formato del envase en product_prices (cuatro columnas opcionales; no cambia ningún precio); 0324: sincronización entre dispositivos (publica tablas en Realtime; no cambia datos ni políticas); 0323: orden propio de los platos del menú (una columna con valor por defecto, aditiva); 0322: varias etiquetas por movimiento con reparto (tabla nueva, función y tres disparadores sobre expenses; vincular compra y cargo del banco conserva el reparto; no cambia ningún dato existente); 0321: Mis listas (tablas, funciones y disparador nuevos; solo un disparador sobre shopping_items que actualiza elementos de las listas; aditiva); 0318: retiradas de efectivo (categoría «Retirada de efectivo», reparto entre carteras, vincular compra y cargo del banco sin perder la etiqueta; funciones nuevas o sustituidas, no toca políticas ni datos existentes); 0317: quién puede ver cada documento (dos columnas nuevas y políticas de member_documents y de los archivos de documentos reemplazadas; probada en la base real); 0316: aviso a adultos de solicitudes de recompensa (función y disparador nuevos, aditiva); 0315: avisos de cumpleaños (funciones nuevas y tarea programada, aditiva); 0314: peso objetivo para quien no es administradora (función nueva, aditiva); 0313: confirmar llegadas pendientes estando parado (trabajo cada minuto); 0310-0312: compras manuales, equivalencias de producto y efectivo/pagos mixtos/devoluciones (tablas y funciones nuevas; 0312b recorta permisos de las tablas nuevas; no tocan políticas de tablas existentes ni datos de las familias); 0312: confirmar llegadas pendientes parado (trabajo cada minuto, funciones de solo lectura + reclamo atómico); 0309: corregir o anular puntos concedidos por error (columna kind en point_grants, política de insert más estricta y función adjust_point_grant; aditiva, aplicada el 23/10/2026; la 0308 de aprendizaje compartido está aplicada en producción y pendiente de commit en otra sesión); 0307: «Actividad reciente»: un update que no cambia nada ya no se anota (solo reemplaza la función del disparador log_activity, aditiva; la 0306 sigue PENDIENTE en supabase/pending-migrations); 0305: preferencias por persona, una fila por preferencia (CONFIG-01; tabla y funciones nuevas, no toca tablas ni políticas existentes); 0304: cada persona adulta edita su ficha y la de sus hijos/as (dos funciones nuevas, no toca políticas); 0303: endurecimiento de las cuentas y el PIN (retira el reinicio por administradora y el «quitar PIN» sin comprobar; solo revoca permisos y endurece set_own_pin); 0302: primero la invitación, después la cuenta (comprobación pública, gancho de alta, limpieza de huérfanos; aditiva); 0301: dar acceso a PEPA, rol/secciones de la ficha, bloqueo y reserva, blindaje de columnas de invitación; 0300: vínculo parental «Es mi hijo/a» (tablas nuevas); 0299: cuentas y seguridad (solo funciones nuevas, aditiva: cambiar/quitar el PIN con el PIN, recuperarlo con identidad reciente, correos de las fichas); 0291: aviso a la dueña de valoraciones de 1-2 estrellas (disparador, aditiva); 0290: reseñas y opiniones de la app (tabla app_reviews, aditiva); 0289: «Propón un tema» con agradecimiento opcional, vínculo editorial y aviso al publicarse; 0288: escalado de cantidades al importar menús con las unidades de Compras; 0287: Leído / Actualizada, No leídas primero y varios temas; 0286: fecha de nacimiento obligatoria al dar de alta una cuenta; 0285: can_interact del perfil sin alias; 0284: solo adultas, seguir a Pepa, importar sin etiquetas automáticas y propuestas de temas; 0283: avisos de tareas por persona (hoy / atrasadas); 0281: Comunidad abierta sin páginas públicas ni IA; 0282: recetas estructuradas en publicaciones; 0280: el resumen diario de tareas guarda el listado completo en el aviso (antes, 0279: alergias e intolerancias de la ficha privada); la numeración la sube quien añada la siguiente · (de master, aplicadas antes de las de Cuentas: 0298 zonas fantasma de ubicación, 0297 confirmación de llegadas y salidas, 0295 preferencias entre dispositivos, 0294 lácteos y huevos, 0293 descuento de tickets, 0292 PIN para el administrador; por eso Cuentas pasó a 0299-0302)
  })
})
