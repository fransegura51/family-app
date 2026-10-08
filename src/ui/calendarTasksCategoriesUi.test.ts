import { describe, expect, it } from 'vitest'

// FASE CALENDARIO — Tareas + Categorías + preferencias. Mismo patrón estructural que el resto del
// repo (sin jsdom/testing-library): se lee el código fuente como texto y se comprueba que la pieza
// exacta que debería existir existe donde debe, en vez de renderizar nada.
const UI_FILES = import.meta.glob('/src/ui/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const DATA_FILES = import.meta.glob('/src/data/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

function readFile(path: string): string {
  const content = UI_FILES[path] ?? DATA_FILES[path]
  expect(content, `no se encontró ${path}`).toBeTruthy()
  return content
}

function slice(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const CALENDAR_SRC = readFile('/src/ui/CalendarScreen.tsx')
const EVENTOS_SRC = readFile('/src/ui/EventosScreen.tsx')
const MENU_SETTINGS_SRC = readFile('/src/ui/MenuSettingsScreen.tsx')
const CALENDAR_DATA_SRC = readFile('/src/data/calendar.ts')
const HOME_SCREEN_SRC = readFile('/src/ui/HomeScreen.tsx')

describe('data/calendar.ts — kind y categoría viajan en create/update, nunca se adivinan', () => {
  it('createEvent: sin indicar, kind=\'event\' (comportamiento idéntico a antes de esta columna)', () => {
    expect(CALENDAR_DATA_SRC).toContain("kind: input.kind ?? 'event'")
  })

  it('createEvent/updateEvent: category_id viaja tal cual (null si no se indica)', () => {
    expect(CALENDAR_DATA_SRC).toContain('category_id: input.categoryId ?? null')
  })

  it('updateEvent nunca escribe `kind` — no existe conversión Evento↔Tarea en esta fase', () => {
    const updateFn = slice(CALENDAR_DATA_SRC, 'export async function updateEvent(', 'export async function deleteEvent(')
    expect(updateFn).not.toMatch(/\bkind:/)
  })

  it('categorías: listCalendarCategories/create/update/delete existen, reutilizando el mismo patrón de currentFamilyId que el resto del archivo', () => {
    expect(CALENDAR_DATA_SRC).toContain('export async function listCalendarCategories')
    expect(CALENDAR_DATA_SRC).toContain('export async function createCalendarCategory')
    expect(CALENDAR_DATA_SRC).toContain('export async function updateCalendarCategory')
    expect(CALENDAR_DATA_SRC).toContain('export async function deleteCalendarCategory')
  })

  it('preferencias: getCalendarPreferences/updateCalendarColorMode/updateCalendarTaskOrder — mismo patrón POR USUARIO (auth.getUser + profiles) que getDateFilterPreferences', () => {
    const prefsBlock = slice(CALENDAR_DATA_SRC, 'export async function getCalendarPreferences', 'export interface ReminderEvent')
    expect(prefsBlock).toContain("supabase.auth.getUser()")
    expect(prefsBlock).toContain(".from('profiles')")
    expect(prefsBlock).not.toMatch(/\.from\('families'\)/)
    expect(prefsBlock).not.toContain('localStorage')
  })
})

describe('AddTaskForm — formulario reducido (Parte 2/3): nunca hora/fin/recurrencia/recordatorios, nunca una hora inventada', () => {
  const FORM = slice(CALENDAR_SRC, 'function AddTaskForm({', 'function ExternalCalendarTab(')

  it('solo Título y Fecha son obligatorios — ningún input de hora/fin', () => {
    expect(FORM).toContain('Título')
    expect(FORM).toContain('Fecha')
    expect(FORM).not.toMatch(/type="time"/)
  })

  it('allDay:true fijo, endAt:null fijo, recurrenceRule:null fijo, reminders:[] fijo — nunca inventa una hora', () => {
    expect(FORM).toContain('allDay: true')
    expect(FORM).toContain('endAt: null')
    expect(FORM).toContain('recurrenceRule: null')
    expect(FORM).toContain('reminders: []')
  })

  it("kind: 'task' explícito al crear", () => {
    expect(FORM).toContain("kind: 'task'")
  })

  it('Parte 25: syncToGoogle:false fijo — una Tarea nunca sincroniza por defecto, reutilizando sync_to_google sin columna nueva', () => {
    expect(FORM).toContain('syncToGoogle: false')
  })

  it('reutiliza WhoDropdown ("¿Para quién?", incluye "Toda la familia" = selección vacía) — nunca un selector nuevo', () => {
    expect(FORM).toContain('<WhoDropdown members={members} selected={selectedMembers} onToggle={toggleMember} />')
    expect(FORM).not.toContain('function WhoDropdown(')
  })

  it('reutiliza CategoryDropdown, EventExtrasFields (ubicación/adjunto/nota) y el campo de puntos — todo opcional, nunca sistemas paralelos', () => {
    expect(FORM).toContain('<CategoryDropdown categories={categories} selected={categoryId} onChange={setCategoryId} onManageCategories={onManageCategories} />')
    expect(FORM).toContain('<EventExtrasFields')
    expect(FORM).toMatch(/Puntos al marcarla "Hecha"/)
    expect(FORM).not.toContain('function EventExtrasFields(')
  })
})

describe('Evento completo (AddEventForm/EditEventForm) — conserva TODO su comportamiento, solo se añade categoría', () => {
  it('AddEventForm sigue pidiendo hora/fin/repetición/recordatorios/privado — nada se ha simplificado', () => {
    const form = slice(CALENDAR_SRC, 'function AddEventForm({', 'function AddTaskForm({')
    expect(form).toContain('RecurrenceControl')
    expect(form).toContain('ReminderPicker')
    expect(form).toContain('🔒 Privado — Solo yo puedo verlo')
    expect(form).toContain('<CategoryDropdown categories={categories} selected={categoryId} onChange={setCategoryId} onManageCategories={onManageCategories} />')
  })

  it('EditEventForm: la Tarea se edita con el formulario reducido (isTask oculta hora/repetición/recordatorios/privado), el Evento conserva el completo', () => {
    const form = slice(CALENDAR_SRC, 'function EditEventForm({', 'function AddEventForm({')
    expect(form).toContain("const isTask = event.kind === 'task'")
    expect(form).toContain('{!isTask && (')
    expect(form).toContain('<CategoryDropdown categories={categories} selected={categoryId} onChange={setCategoryId} onManageCategories={onManageCategories} />')
  })

  it('EditEventForm nunca cambia `kind` al guardar (sin conversión Evento↔Tarea esta fase)', () => {
    const submit = slice(CALENDAR_SRC, 'async function handleSubmit(e: FormEvent) {\n    e.preventDefault()\n    setSaving(true)\n    setError(null)\n    try {\n      const effectiveAllDay', 'return (\n    <form onSubmit={handleSubmit} className="card member-form">\n      <label>\n        Título\n        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />\n      </label>\n      <label>\n        Fecha\n        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />\n      </label>')
    expect(submit).toContain('await updateEvent(event.id, {')
    expect(submit).not.toMatch(/\n\s*kind:/)
  })
})

describe('Categoría — opcional para Evento y Tarea, "Sin categoría" explícito, nunca taxonomía obligatoria', () => {
  const DROPDOWN = slice(CALENDAR_SRC, 'function CategoryDropdown({', 'function ReminderPicker(')

  // RETOQUE (fase posterior) — antes, sin categorías, el componente devolvía null entero (ni la
  // etiqueta se veía); ahora la etiqueta + el engranaje ⚙️ se ven SIEMPRE (para poder crear la primera
  // categoría desde ahí), y solo el selector en sí (botón "▼" + su modal) sigue oculto sin categorías.
  it('sin categorías creadas, la etiqueta y el engranaje ⚙️ se ven igualmente; el selector en sí (botón "▼") se oculta, nunca fuerza a crear una', () => {
    expect(DROPDOWN).not.toContain('if (categories.length === 0) return null')
    expect(DROPDOWN).toContain('Categoría (opcional)')
    expect(DROPDOWN).toContain('calendar-category-manage-btn')
    expect(DROPDOWN).toContain('{categories.length > 0 && (')
  })

  it('"Sin categoría" es una opción explícita, siempre disponible, además de cada categoría real', () => {
    expect(DROPDOWN).toContain('Sin categoría')
    expect(DROPDOWN).toContain('onChange(null)')
  })
})

describe('Emoji de categoría — nunca depende del modo de color (Parte 6), visible donde hay texto, NUNCA en los puntitos de Inicio', () => {
  it('buildEntriesForDate (Mes/Agenda/DayModal/Personal) antepone el emoji de categoría al título', () => {
    const fn = slice(CALENDAR_SRC, 'function buildEntriesForDate(dateStr: string): AgendaEntry[] {', 'function persistCalendarMenuLayout(')
    expect(fn).toContain("const titleWithCategory = category ? `${category.emoji} ${ev.title}` : ev.title")
  })

  it('TimeGridView (Semana/3 días/Día) también antepone el emoji, independiente de categoryColorById (modo de color)', () => {
    const fn = slice(CALENDAR_SRC, 'function TimeGridView({', 'function AgendaListView(')
    expect(fn).toContain('function titleWithCategoryEmoji(ev: CalendarEvent): string {')
    expect(fn).toContain('categoryById.get(ev.categoryId)')
  })

  it('EventCard (Vista Familiar) también antepone el emoji de categoría junto al título', () => {
    const fn = slice(CALENDAR_SRC, 'function EventCard({', 'function MemberFilterDropdown(')
    expect(fn).toContain("categoryById.get(ev.categoryId)!.emoji")
  })

  it('Vista general (Inicio): los puntitos NUNCA llevan emoji — solo color (dots sigue siendo solo eventDotColors, un array de colores)', () => {
    const vistaGeneral = slice(CALENDAR_SRC, ") : view === 'Vista general' ? (", ") : view === 'Agenda' ? (")
    expect(vistaGeneral).not.toContain('.emoji')
    expect(vistaGeneral).toContain('eventDotColors(')
  })
})

// RETOQUE (fase posterior) — de "miembros"/"categorías" (2 opciones) a tres modos mutuamente
// excluyentes; el detalle completo vive en calendarColorModesUi.test.ts, no se repite aquí.
describe('Colores — eventColors conserva su fallback base (detalle de los 3 modos en calendarColorModesUi.test.ts)', () => {
  it('eventColors (Fase 5: un color por persona) sigue devolviendo primero el color propio del evento, consultando la categoría y cayendo en el gris de siempre', () => {
    const fn = slice(CALENDAR_SRC, 'function eventColors(ev: CalendarEvent', 'function shouldStrikethroughEntry(')
    expect(fn).toContain('if (ev.color) return [ev.color]')
    expect(fn).toContain('ev.categoryId')
    expect(fn).toContain("return colors.length > 0 ? colors : ['#9ca3af']")
  })
})

describe('Orden Eventos/Tareas — Configuración → Calendario, por usuario (Parte 8/9)', () => {
  it('eventsByDate ordena por kind según calendarPrefs.taskOrder, con sort ESTABLE (conserva el orden dentro de cada tipo)', () => {
    const fn = slice(CALENDAR_SRC, 'const eventsByDate = useMemo(() => {', '}, [filteredEvents, monthDays, holidayDates, calendarPrefs.taskOrder])')
    expect(fn).toContain("const taskFirst = calendarPrefs.taskOrder === 'tareas_primero'")
    expect(fn).toContain("if (a.kind === b.kind) return 0")
  })

  it('Configuración → Calendario expone el orden Eventos/Tareas con sus dos opciones, con default correcto (los 3 modos de color tienen su propio test en calendarColorModesUi.test.ts)', () => {
    const section = slice(MENU_SETTINGS_SRC, 'function CalendarPreferencesSection() {', 'function CalendarCategoryRow(')
    expect(section).toContain('Eventos primero')
    expect(section).toContain('Tareas primero')
    expect(section).toContain("useState<CalendarTaskOrder>('eventos_primero')")
  })
})

describe('Gestión de categorías — Configuración → Calendario (Parte 27)', () => {
  it('crear/editar nombre+emoji+color opcional/borrar — con confirmación antes de borrar', () => {
    const section = slice(MENU_SETTINGS_SRC, 'function CalendarCategoriesSection() {', 'type SettingsGroupId')
    expect(section).toContain('createCalendarCategory(')
    expect(section).toContain('onDeleted={() => handleDelete(c.id)}')
  })

  it('la fila de edición permite nombre, emoji y color — y quitar el color (opcional de verdad), con confirmación antes de borrar', () => {
    const row = slice(MENU_SETTINGS_SRC, 'function CalendarCategoryRow({', 'function CalendarCategoriesSection() {')
    expect(row).toContain('updateCalendarCategory(category.id,')
    // "Sin color" vive ahora dentro de CalendarCategoryColorPicker (reutilizado en alta y edición,
    // corrección quirúrgica de color de categoría) en vez de repetido a mano en cada formulario.
    expect(row).toContain('<CalendarCategoryColorPicker value={color} onChange={setColor} />')
    expect(MENU_SETTINGS_SRC).toContain('Sin color')
    expect(row).toContain('<ConfirmIconButton onConfirm={onDeleted}')
  })

  it('el grupo "Calendario" reúne modo de color, orden y categorías en un único sitio de Configuración, sin saturar (mismo patrón SettingsGroup que el resto)', () => {
    const group = slice(MENU_SETTINGS_SRC, 'title="Calendario"', '</SettingsGroup>')
    expect(group).toContain('<CalendarPreferencesSection />')
    expect(group).toContain('<CalendarCategoriesSection />')
  })
})

describe('RETOQUE (PRUEBAS MANUALES REALES EN IPHONE) — "Configuración personal" + preferencias de Tareas completadas', () => {
  const SECTION = slice(MENU_SETTINGS_SRC, 'function CalendarPreferencesSection() {', 'function CalendarCategoryEmojiPicker(')

  it('Parte 1: el texto se reparte en encabezado corto + subtexto, en vez de una sola frase larga', () => {
    expect(SECTION).toContain('<strong>Configuración personal</strong>')
    expect(SECTION).toContain('Cada persona de la familia puede ver el calendario a su manera.')
    expect(SECTION).not.toContain('Es solo tuyo — cada persona de la familia puede ver el calendario a su manera.')
  })

  it('Parte 2: tres interruptores independientes, nunca mutuamente excluyentes (ninguno desactiva a otro)', () => {
    expect(SECTION).toContain('Tachar al completar')
    expect(SECTION).toContain('Cambiar color al completar')
    expect(SECTION).toContain('Mover al final')
    // Los tres se guardan con su propia llamada — no hay un solo "modo" que solo permita uno activo.
    expect(SECTION).toContain('updateCalendarTaskStrikethrough(value)')
    expect(SECTION).toContain('updateCalendarTaskDoneColor(next)')
    expect(SECTION).toContain('updateCalendarTaskMoveCompleted(value)')
  })

  it('Parte 2B: "Color de completadas" reutiliza tal cual CalendarCategoryColorPicker (mismo patrón de paleta/Otro color/Sin color que Categorías) — nunca una segunda implementación visual', () => {
    expect(SECTION).toContain('<CalendarCategoryColorPicker value={doneColor} onChange={handleDoneColorChange} />')
    expect(SECTION).not.toContain('function CalendarCategoryColorPicker(')
  })

  it('Parte 3: defaults = comportamiento actual de siempre (tachar=true, color=null/apagado, mover=false) — un usuario que no entra aquí no nota ningún cambio', () => {
    expect(SECTION).toContain('const [strikethrough, setStrikethrough] = useState(true)')
    expect(SECTION).toContain('const [doneColor, setDoneColor] = useState<string | null>(null)')
    expect(SECTION).toContain('const [moveCompleted, setMoveCompleted] = useState(false)')
  })

  it('el picker de color solo se muestra cuando el interruptor está encendido (doneColor != null) — apagarlo vuelve a guardar null, no solo lo oculta visualmente', () => {
    expect(SECTION).toContain('{doneColor != null && (')
    expect(SECTION).toContain('const next = value ? doneColor || solidPalette(CALENDAR_CATEGORY_COLOR_COUNT, getColorTheme())[0] : null')
  })
})

describe('Paridad de vistas (Parte 10/30) — ninguna vista filtra por kind, salvo Externos (ajeno) y Personal (filtra por miembro, no por tipo)', () => {
  const BUILD_ENTRIES = slice(CALENDAR_SRC, 'function buildEntriesForDate(dateStr: string): AgendaEntry[] {', 'function persistCalendarMenuLayout(')
  const TIME_GRID = slice(CALENDAR_SRC, 'function TimeGridView({', 'function AgendaListView(')
  const FAMILY_VIEW = slice(CALENDAR_SRC, 'function FamilyDayView({', 'function PersonalView(')

  it('buildEntriesForDate (Mes/Agenda/DayModal/Personal) nunca filtra por ev.kind', () => {
    expect(BUILD_ENTRIES).not.toMatch(/ev\.kind\s*===/)
  })

  it('TimeGridView (Semana/3 días/Día) separa a propósito las Tareas de "Todo el día" (RETOQUE: una Tarea sin hora nunca es un evento de todo el día) en su propia franja "Tareas", sin inventar una hora', () => {
    expect(TIME_GRID).toContain("if (!ev.allDay || ev.kind === 'task') continue")
    expect(TIME_GRID).toContain("if (ev.kind !== 'task') continue")
    expect(TIME_GRID).toContain('function tasksForDate(')
    expect(TIME_GRID).toContain('time-grid-tasks-row')
  })

  it('FamilyDayView agrupa primero por miembro (columnas), y RETOQUE: dentro de cada columna separa a propósito Eventos de Tareas (groupEventsAndTasks, misma función que DayEntriesBody) — ya no las mezcla', () => {
    expect(FAMILY_VIEW).toContain('groupEventsAndTasks(col.events, taskOrder)')
  })

  it('Personal filtra por MI miembro O por ser privado mío (shouldIncludeInPersonal), nunca por kind — Eventos y Tareas propios conviven', () => {
    const personal = slice(CALENDAR_SRC, 'function PersonalView({', 'interface TimeGridBlock {')
    expect(personal).toContain('shouldIncludeInPersonal(ev, myMemberId)')
    expect(personal).not.toMatch(/ev\.kind\s*===/)
  })

  it('Externos (calendarios externos) sigue siendo una fuente de datos totalmente distinta — nunca mezcla calendar_events ni kind', () => {
    const externos = slice(CALENDAR_SRC, 'function ExternalCalendarTab({', 'function GoogleCalendarSyncCard(')
    expect(externos).not.toContain('calendar_categories')
    expect(externos).not.toMatch(/\bkind\b/)
  })
})

describe('Familiar — corrección de bug de auditoría (Parte 15): Evento Y Tarea completables, reutilizando calendar_event_completions', () => {
  it('EventCard ahora acepta done/onComplete/onUncomplete (antes no los tenía) — RETOQUE: el botón de texto "✓ Hecho" se unificó con el mismo CompletionCircle (círculo ○/✓) del resto de Calendario, con fondo de color para contraste (.completion-circle-chip)', () => {
    const card = slice(CALENDAR_SRC, 'function EventCard({', 'function MemberFilterDropdown(')
    expect(card).toContain('done?: boolean')
    expect(card).toContain('onComplete?: () => void')
    expect(card).toContain('onUncomplete?: () => void')
    expect(card).toContain('<CompletionCircle done={done} color={color} onComplete={onComplete} onUncomplete={onUncomplete} />')
    expect(card).toContain('completion-circle-chip')
  })

  it('FamilyDayView calcula "done" desde eventCompletions (mismo array que ya usa DayModal/Agenda) y llama a onComplete/onUncomplete — nunca un mecanismo nuevo', () => {
    expect(FAMILY_VIEW_SRC()).toContain("eventCompletions.some((c) => c.eventId === ev.id && c.occurrenceDate === selectedDate)")
    expect(FAMILY_VIEW_SRC()).toContain('onComplete={() => onComplete(ev.id, selectedDate)}')
    expect(FAMILY_VIEW_SRC()).toContain('onUncomplete={() => onUncomplete(ev.id, selectedDate)}')
  })

  it('el padre conecta Familiar directamente a handleCompleteEvent/handleUncompleteEvent — las mismas funciones que ya usan Mes/Agenda/Día, nunca una copia', () => {
    expect(CALENDAR_SRC).toContain('onComplete={handleCompleteEvent}')
    expect(CALENDAR_SRC).toContain('onUncomplete={handleUncompleteEvent}')
  })

  it('nunca se crea task_completions ni ninguna tabla nueva de completados', () => {
    expect(CALENDAR_SRC).not.toContain('task_completions')
    expect(CALENDAR_DATA_SRC).not.toContain('task_completions')
  })

  function FAMILY_VIEW_SRC(): string {
    return slice(CALENDAR_SRC, 'function FamilyDayView({', 'function PersonalView(')
  }
})

describe('Personal — deja de ser "solo notas" (Parte 16), notas existentes intactas', () => {
  const PERSONAL = slice(CALENDAR_SRC, 'function PersonalView({', 'interface TimeGridBlock {')

  it('muestra Eventos/Tareas propios (DayEntriesBody con myEntries) Y las notas personales, ambas cosas, nunca solo una', () => {
    expect(PERSONAL).toContain('<DayEntriesBody')
    expect(PERSONAL).toContain('myEntries')
    expect(PERSONAL).toContain('dayNotes.map((n) =>')
  })

  it('las notas siguen siendo privadas y siguen usando exactamente addPersonalNote/deletePersonalNote/personal_calendar_notes — sin tocar ese mecanismo', () => {
    expect(PERSONAL).toContain('🔒 Notas privadas')
    expect(CALENDAR_SRC).toContain('await addPersonalNote(selectedDate, text)')
    expect(CALENDAR_SRC).toContain('await deletePersonalNote(id)')
  })

  it('si no hay miembro propio enlazado (myMemberId null), se explica en vez de romper — y las notas se quedan disponibles igual', () => {
    expect(PERSONAL).toContain('myMemberId ?')
    expect(PERSONAL).toMatch(/Tu cuenta no está enlazada/)
  })

  it('CalendarScreen resuelve myMemberId con linkedProfileId, mismo patrón que FinanceScreen/HomeScreen — nunca un mecanismo nuevo', () => {
    expect(CALENDAR_SRC).toContain('members.find((m) => m.linkedProfileId === profile.id)?.id ?? null')
  })
})

describe('FABs — "+ Nuevo evento" y "+ Nueva tarea" (Parte 22/23)', () => {
  it('grupo vertical propio (.calendar-fab-group), nunca toca .screen-fab global ni .finance-fab-group', () => {
    expect(CALENDAR_SRC).toContain('<div className="calendar-fab-group">')
    expect(CALENDAR_SRC).toContain('+ Nuevo evento')
    expect(CALENDAR_SRC).toContain('+ Nueva tarea')
  })

  it('Personal ya NO oculta el grupo de FABs — antes se escondía solo porque Personal era "solo notas"', () => {
    expect(CALENDAR_SRC).not.toMatch(/view !== 'Personal' &&\s*\(\s*<button[\s\S]{0,40}className="screen-fab"/)
  })

  it('"Nueva tarea" abre AddTaskForm en un modal propio, independiente del de "Nuevo evento"', () => {
    expect(CALENDAR_SRC).toContain('{addingTask && (')
    expect(CALENDAR_SRC).toContain('<AddTaskForm')
  })
})

describe('Breadcrumb de Calendario — sigue funcionando exactamente igual (sin tocar el sistema jerárquico global)', () => {
  it('SectionBreadcrumb sigue recibiendo CALENDARIO_MENU_ITEM_META[view].label, sin cambios', () => {
    expect(CALENDAR_SRC).toContain('<SectionBreadcrumb subsection={CALENDARIO_MENU_ITEM_META[view].label} />')
  })
})

describe('No regresión de Eventos ni de "+ Añadir tarea" de Preparativos (Parte 35/49)', () => {
  it('EventosScreen.tsx no se ha tocado para nada de esta fase — ninguna referencia a calendar_categories/kind de Calendario', () => {
    expect(EVENTOS_SRC).not.toContain('calendar_categories')
    expect(EVENTOS_SRC).not.toContain("kind: 'task'")
  })

  it('el alta rápida inferior de Preparativos ("+ Añadir tarea") se eliminó a propósito (tanda de "+ Nueva tarea"): sigue siendo un concepto de Eventos distinto de las Tareas de Calendario, pero ya no es un formulario reducido aparte', () => {
    expect(EVENTOS_SRC).not.toContain('placeholder="+ Añadir tarea"')
    expect(EVENTOS_SRC).not.toContain('handleAddTask')
    expect(EVENTOS_SRC).toContain('+ Nueva tarea')
  })
})

describe('Inicio — la diapositiva "Hoy en el calendario" también lleva 🔒 en un privado propio (Parte 10/37)', () => {
  const SLIDE = slice(HOME_SCREEN_SRC, 'listUpcomingEvents()', 'listShoppingItems()')

  it('antepone 🔒 al título cuando el evento/tarea es privado, igual que el resto de vistas — nunca queda confinado a Personal', () => {
    expect(SLIDE).toContain("const title = ev.visibility === 'private' ? `🔒 ${ev.title}` : ev.title")
  })

  it('no añade ningún filtro SQL por visibility (RLS ya resuelve quién llega aquí: un privado de otro miembro nunca aparece en esta consulta)', () => {
    expect(SLIDE).not.toMatch(/\.eq\(.visibility/)
  })
})

describe('CALENDARIO — SIGUIENTE FASE: compactación de Familiar (EventCard), sin perder info importante', () => {
  const CARD = slice(CALENDAR_SRC, 'function EventCard({', 'function MemberFilterDropdown(')

  // CASO H — la fecha ya aparece arriba de la vista Familiar ("lunes, 5 de octubre"); repetirla
  // dentro de cada tarjeta era la redundancia más grande. Ya no debe llamarse a
  // toLocaleString con dateStyle (el patrón que repetía la fecha completa).
  it('no repite la fecha dentro de la tarjeta (ya no usa dateStyle)', () => {
    expect(CARD).not.toContain('dateStyle')
    expect(CARD).toContain('entryTimeLabel({')
  })

  // CASO I — el avatar de la persona ya está en la cabecera de su columna (family-view-column-header).
  it('no repite el avatar de la persona dentro de la tarjeta (sin member-chips ni MemberAvatar)', () => {
    expect(CARD).not.toContain('member-chips')
    expect(CARD).not.toContain('MemberAvatar')
    expect(CARD).not.toContain('memberById')
  })

  // CASO J — varios recordatorios se resumen en un solo 🔔, nunca la lista completa en texto.
  it('con recordatorios muestra solo 🔔 (nunca la lista de reminderLabel por cada uno)', () => {
    expect(CARD).toContain("ev.reminders.length > 0 && ' · 🔔'")
    expect(CARD).not.toMatch(/reminders\.map\(\(r\) => reminderLabel/)
  })

  // CASO K — ubicación resumida + enlace de mapa, nunca la dirección postal completa en la tarjeta.
  it('ubicación: nombre resumido (shortLocationLabel) + "Ver mapa", nunca el locationLabel completo suelto', () => {
    expect(CARD).toContain('shortLocationLabel(ev.locationLabel)')
    expect(CARD).toContain('Ver mapa')
    expect(CARD).not.toContain('Ver en el mapa')
    expect(CARD).not.toMatch(/📍 \{ev\.locationLabel\}(?!\s*\?)/)
  })

  // CASO L — el mismo CompletionCircle compartido con el resto de Calendario (ya cubierto en el
  // describe "Familiar — corrección de bug de auditoría", se repite aquí como parte del mismo
  // paquete de pruebas de esta fase).
  it('completado: sigue siendo el mismo CompletionCircle compartido, no un círculo propio de Familiar', () => {
    expect(CARD).toContain('<CompletionCircle done={done} color={color} onComplete={onComplete} onUncomplete={onUncomplete} />')
  })

  // CASO M — Editar/Compartir/Borrar con icono + aria-label/title accesibles, reutilizando el mismo
  // icono de compartir (📤) que ya usaba PEPA aquí — nunca uno nuevo.
  it('Editar/Borrar pasan a icono (✏️/✕) con aria-label y title — Compartir reutiliza el icono 📤 ya existente, ninguno nuevo', () => {
    expect(CARD).toContain('onClick={onEdit} aria-label="Editar" title="Editar"')
    expect(CARD).toContain('>\n          ✏️')
    expect(CARD).toContain('aria-label="Borrar" title="Borrar"')
    expect(CARD).toContain('>\n            ✕')
    expect(CARD).toContain('aria-label="Compartir" title="Compartir"')
    expect(CARD).toContain('📤')
  })

  it('los tres botones de acción reutilizan la MISMA clase .icon-button-share (mismo tamaño/borde/grosor), ninguno inventa una clase nueva', () => {
    const iconButtonCount = (CARD.match(/className="icon-button-share"/g) ?? []).length
    expect(iconButtonCount).toBeGreaterThanOrEqual(3) // Editar + Borrar (disparador inicial) + Compartir
  })

  // CASO N — el candado de privado se conserva tal cual (sin tocar esa lógica ya validada).
  it('privado: conserva el 🔒 delante del título, sin cambios', () => {
    expect(CARD).toContain("{ev.visibility === 'private' && '🔒 '}")
  })

  // El sub-flujo de confirmación de borrado (recurrencia: solo este día / toda la serie) no se ha
  // tocado — solo cambió su disparador inicial (✕ en vez de "Borrar").
  it('el sub-flujo de confirmar borrado (solo un día / toda la serie / cancelar) sigue intacto', () => {
    expect(CARD).toContain('Borrar ese día')
    expect(CARD).toContain("{ev.recurrenceRule ? 'Toda la serie' : 'Borrar'}")
    expect(CARD).toContain('Solo un día')
  })
})

describe('CALENDARIO — SIGUIENTE FASE: bloques "Eventos"/"Tareas" en todas las vistas de detalle (Parte 1)', () => {
  it('DayEntriesBody (Mes/Vista general/Semana/3 días/Día/Agenda/Personal) agrupa con groupEventsAndTasks y pinta un encabezado por grupo no vacío', () => {
    const body = slice(CALENDAR_SRC, 'function DayEntriesBody({', 'function FamilyDayView({')
    expect(body).toContain('groupEventsAndTasks(entries, taskOrder)')
    expect(body).toContain('group.items.length > 0 && (')
    expect(body).toContain('<div className="calendar-section-header">{group.label}</div>')
  })

  it('las 3 llamadas a DayModal (Mes/Vista general/Semana-3días-Día) y AgendaListView/PersonalView/FamilyDayView pasan taskOrder — ninguna preferencia nueva, reutilizan calendarPrefs.taskOrder', () => {
    const count = (CALENDAR_SRC.match(/taskOrder=\{calendarPrefs\.taskOrder\}/g) ?? []).length
    expect(count).toBe(6) // 3x DayModal + AgendaListView + PersonalView + FamilyDayView
  })
})

describe('CALENDARIO — ÚLTIMO RETOQUE: Familiar compacta de verdad (altura automática) + "Sin planes"', () => {
  const FAMILY_VIEW = slice(CALENDAR_SRC, 'function FamilyDayView({', 'function PersonalView(')

  // CASO A — una persona sin NINGÚN plan (ni Evento ni Tarea) ese día: "Sin planes", nunca
  // "No hay eventos" (ya no describía bien el caso, Familiar mezcla Eventos y Tareas).
  it('columna totalmente vacía (col.events.length === 0): "Sin planes", nunca "No hay eventos"', () => {
    expect(FAMILY_VIEW).toContain('<p className="muted">Sin planes</p>')
    expect(FAMILY_VIEW).not.toContain('No hay eventos')
  })

  // CASO B/C — el mensaje vacío SOLO se pinta cuando col.events (Eventos + Tareas juntos) está
  // vacío de verdad; si solo hay tareas o solo eventos, col.events.length > 0 y se entra por la
  // otra rama (groupEventsAndTasks), que ya pinta solo el bloque que tiene algo — nunca un mensaje
  // "vacío" a medias para el bloque que sí tiene contenido.
  it('el mensaje "Sin planes" es la única rama posible cuando no hay NADA — con solo tareas o solo eventos se pinta el bloque correspondiente, no el mensaje', () => {
    const emptyBranch = FAMILY_VIEW.indexOf('{col.events.length === 0 ? (')
    const groupBranch = FAMILY_VIEW.indexOf('groupEventsAndTasks(col.events, taskOrder)')
    expect(emptyBranch).toBeGreaterThan(-1)
    expect(groupBranch).toBeGreaterThan(emptyBranch) // la rama de grupos es el ": (" de ese mismo condicional
  })

  // CASO I — causa real del hueco grande (auditoría): los <p className="muted"> de EventCard nunca
  // tenían su margen por defecto reseteado, y al ser items de un flex en columna esos márgenes no
  // colapsaban entre sí, sumándose al gap. La tarjeta en sí nunca declaró una altura fija/mínima —
  // confirmado aquí a nivel de JSX (ningún style con height/minHeight en el contenedor de la
  // tarjeta); el reseteo de margen en sí vive en styles.css (.event-card p { margin: 0 }), ya
  // verificado en vivo con el navegador (computed styles antes/después) en esta misma fase.
  it('EventCard nunca fija una altura — su único style inline es borderColor (color), la altura depende solo del contenido real', () => {
    const CARD = slice(CALENDAR_SRC, 'function EventCard({', 'function MemberFilterDropdown(')
    expect(CARD).toContain('style={{ borderColor: color }}')
    expect(CARD).not.toMatch(/style=\{\{[^}]*[hH]eight/)
  })

  // CASO D — sin ubicación, el párrafo de ubicación ni se renderiza (no hay wrapper reservando
  // espacio para un dato que no existe) — mismo condicional de siempre, sin tocar.
  it('sin locationLabel ni mapsUrl, el párrafo de ubicación no se renderiza en absoluto (nunca un wrapper vacío)', () => {
    const CARD = slice(CALENDAR_SRC, 'function EventCard({', 'function MemberFilterDropdown(')
    expect(CARD).toContain('{(ev.locationLabel || mapsUrl) && (')
  })
})
