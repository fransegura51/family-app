// Módulo Eventos (PEPA Events) — capa de datos. Fase 0: motor común +
// tareas. Fase 1: invitados, presupuesto (con gasto real vía etiqueta
// de Economía), menú → traspaso a Compras, proveedores, pagos/fianzas
// y enlace con Calendario al confirmar fecha — ver plan en
// C:\Users\Usuario\.claude\plans\zany-wishing-brook.md.
import { addShoppingItem } from '@/data/shopping'
import { supabase } from '@/data/supabaseClient'
import { listExpenses, listBudgetCategories } from '@/data/finance'
import { distinctTagColor } from '@/domain/colors'
import { computeAllEventAlerts, EVENT_TYPE_META, generateAutoTasks, type EventAlertInput, type EventAlertSummary } from '@/domain/events'
import { isInternalTransferCategory } from '@/domain/finance'
import { showToast } from '@/state/toast'
import type { EventReminder } from '@/domain/reminders'
import type {
  EventActivity,
  EventBudgetItem,
  EventDayPlanItem,
  EventDecorationItem,
  EventDecorationStatus,
  EventFavorItem,
  EventFavorStatus,
  EventGiftReceived,
  EventGuest,
  EventGuestInviteScope,
  EventGuestRsvpStatus,
  EventInvitation,
  EventMenuItem,
  EventModuleKey,
  EventPayment,
  EventPaymentStatus,
  EventProvider,
  EventSpecialDetail,
  EventSpecialDetailStatus,
  EventTableSeat,
  EventTask,
  EventTemplate,
  EventType,
  FamilyEvent,
  InvitationCanvas,
} from '@/domain/types'
import { compressImageFile } from '@/domain/imageCompression'

async function currentFamilyId(): Promise<string> {
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  const { data: profileRow, error } = await supabase.from('profiles').select('family_id').eq('id', userResult.user.id).single()
  if (error) throw error
  return profileRow.family_id
}

const EVENT_SELECT =
  'id, family_id, type, subtype, title, date_status, event_date, event_time, venue_label, venue_type, venue_latitude, venue_longitude, ceremony_location_label, ceremony_location_latitude, ceremony_location_longitude, ceremony_time, celebration_location_label, celebration_location_latitude, celebration_location_longitude, theme, details, enabled_modules, status, tag_id, calendar_event_id, rsvp_deadline, rsvp_deadline_calendar_event_id, open_rsvp_token, created_by, created_at, updated_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEvent(r: any): FamilyEvent {
  return {
    id: r.id,
    familyId: r.family_id,
    type: r.type,
    subtype: r.subtype,
    title: r.title,
    dateStatus: r.date_status,
    eventDate: r.event_date,
    eventTime: r.event_time,
    venueLabel: r.venue_label,
    venueType: r.venue_type,
    venueLatitude: r.venue_latitude,
    venueLongitude: r.venue_longitude,
    ceremonyLocationLabel: r.ceremony_location_label,
    ceremonyLocationLatitude: r.ceremony_location_latitude,
    ceremonyLocationLongitude: r.ceremony_location_longitude,
    ceremonyTime: r.ceremony_time,
    celebrationLocationLabel: r.celebration_location_label,
    celebrationLocationLatitude: r.celebration_location_latitude,
    celebrationLocationLongitude: r.celebration_location_longitude,
    theme: r.theme,
    details: r.details ?? {},
    enabledModules: r.enabled_modules ?? [],
    status: r.status,
    tagId: r.tag_id,
    calendarEventId: r.calendar_event_id,
    rsvpDeadline: r.rsvp_deadline,
    rsvpDeadlineCalendarEventId: r.rsvp_deadline_calendar_event_id,
    openRsvpToken: r.open_rsvp_token,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function listEvents(includeArchived = false): Promise<FamilyEvent[]> {
  let query = supabase.from('events').select(EVENT_SELECT).order('event_date', { ascending: true, nullsFirst: false })
  if (!includeArchived) query = query.eq('status', 'planificacion')
  const { data, error } = await query
  if (error) throw error
  return data.map(mapEvent)
}

export async function getEvent(id: string): Promise<FamilyEvent> {
  const { data, error } = await supabase.from('events').select(EVENT_SELECT).eq('id', id).single()
  if (error) throw error
  return mapEvent(data)
}

// Fase 3 — avisos fuera del evento: agrega computeEventConclusions()
// sobre TODOS los eventos activos de la familia (listEvents() ya
// excluye los archivados por defecto). expenses/categorías se piden
// una sola vez y se reparten entre todos los eventos, igual que hace
// cada PepaConclusions por su cuenta hoy dentro de un evento — aquí
// solo se hace para varios a la vez, sin ninguna lógica nueva de qué
// es una alerta (eso sigue siendo enteramente de computeEventConclusions).
export async function loadAllEventAlerts(): Promise<EventAlertSummary[]> {
  const events = await listEvents()
  if (events.length === 0) return []
  const needsBudget = events.some((e) => e.enabledModules.includes('presupuesto') && e.tagId)
  const [expenses, categories] = needsBudget ? await Promise.all([listExpenses(), listBudgetCategories()]) : [null, null]

  const inputs: EventAlertInput[] = await Promise.all(
    events.map(async (event) => {
      const has = (k: EventModuleKey) => event.enabledModules.includes(k)
      const [guests, tasks, payments, budgetItems] = await Promise.all([
        has('invitados') ? listEventGuests(event.id) : Promise.resolve([]),
        has('tareas') ? listEventTasks(event.id) : Promise.resolve([]),
        has('pagos') ? listEventPayments(event.id) : Promise.resolve([]),
        has('presupuesto') ? listEventBudgetItems(event.id) : Promise.resolve([]),
      ])
      const plannedBudget = budgetItems.reduce((sum, i) => sum + i.plannedAmount, 0)
      const spentBudget =
        event.tagId && has('presupuesto') && expenses && categories
          ? expenses.filter((e) => e.tagId === event.tagId && !e.isIncome && !isInternalTransferCategory(e.category, categories)).reduce((sum, e) => sum + e.amount, 0)
          : null
      return {
        eventId: event.id,
        eventTitle: event.title,
        eventIcon: EVENT_TYPE_META[event.type].icon,
        rsvpDeadline: event.rsvpDeadline,
        guests,
        tasks,
        payments,
        plannedBudget,
        spentBudget,
      }
    }),
  )
  return computeAllEventAlerts(inputs)
}

// Busca una etiqueta de Economía con ese nombre exacto o la crea —
// evita chocar con el unique(family_id, name) si el usuario ya tenía
// una etiqueta igual (p. ej. al duplicar un evento de años anteriores
// con el mismo título).
//
// Petición real: "les pondría el año porque si no al año siguiente se
// juntarían los gastos con los de este año" — el mismo cumpleaños
// duplicado un año después (ver duplicateEvent) tendría el mismo
// título y, sin el año, la misma etiqueta de Economía que el del año
// anterior. Solo afecta a etiquetas NUEVAS a partir de ahora — las que
// ya existían (p. ej. "Cumpleaños Alvaro") no se renombran solas, para
// no romper lo que ya se haya etiquetado con ellas.
async function findOrCreateEventTag(familyId: string, name: string, year: number): Promise<string> {
  const yearSuffix = ` ${year}`
  const trimmed = `${name.trim().slice(0, 60 - yearSuffix.length)}${yearSuffix}`
  const { data: existing } = await supabase.from('tags').select('id').eq('family_id', familyId).eq('name', trimmed).maybeSingle()
  if (existing) return existing.id
  // Un color distinto por etiqueta (según cuántas tiene ya la familia), no siempre el mismo azul.
  const { count } = await supabase.from('tags').select('id', { count: 'exact', head: true }).eq('family_id', familyId)
  const { data: created, error } = await supabase
    .from('tags')
    .insert({ family_id: familyId, name: trimmed, color: distinctTagColor(count ?? 0), sort_order: Date.now() })
    .select('id')
    .single()
  if (error) throw error
  return created.id
}

export async function createEvent(input: {
  type: EventType
  subtype?: string | null
  title: string
  dateStatus: 'pendiente' | 'provisional' | 'confirmada'
  eventDate?: string | null
  details?: Record<string, unknown>
  enabledModules: EventModuleKey[]
  theme?: string | null
}): Promise<string> {
  const familyId = await currentFamilyId()
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')

  const tagYear = input.eventDate ? new Date(input.eventDate).getFullYear() : new Date().getFullYear()
  const tagId = await findOrCreateEventTag(familyId, input.title, tagYear)

  const { data: event, error } = await supabase
    .from('events')
    .insert({
      family_id: familyId,
      type: input.type,
      subtype: input.subtype ?? null,
      title: input.title.trim(),
      date_status: input.dateStatus,
      event_date: input.eventDate ?? null,
      details: input.details ?? {},
      enabled_modules: input.enabledModules,
      theme: input.theme ?? null,
      tag_id: tagId,
      created_by: userResult.user.id,
    })
    .select('id')
    .single()
  if (error) throw error

  const tasks = generateAutoTasks(input.type, input.eventDate ?? null)
  if (tasks.length > 0) {
    const { error: tasksError } = await supabase.from('event_tasks').insert(
      tasks.map((t, i) => ({
        event_id: event.id,
        family_id: familyId,
        title: t.title,
        due_date: t.dueDate,
        source: 'auto',
        sort_order: i,
      })),
    )
    if (tasksError) throw tasksError
  }

  if (input.dateStatus === 'confirmada' && input.eventDate) await syncEventToCalendarSafely(event.id)

  return event.id
}

export async function updateEvent(
  id: string,
  patch: Partial<{
    title: string
    dateStatus: 'pendiente' | 'provisional' | 'confirmada'
    eventDate: string | null
    eventTime: string | null
    venueLabel: string | null
    venueType: string | null
    venueLatitude: number | null
    venueLongitude: number | null
    theme: string | null
    details: Record<string, unknown>
    enabledModules: EventModuleKey[]
    ceremonyLocationLabel: string | null
    ceremonyLocationLatitude: number | null
    ceremonyLocationLongitude: number | null
    ceremonyTime: string | null
    celebrationLocationLabel: string | null
    celebrationLocationLatitude: number | null
    celebrationLocationLongitude: number | null
    rsvpDeadline: string | null
  }>,
): Promise<void> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.title !== undefined) update.title = patch.title.trim()
  if (patch.dateStatus !== undefined) update.date_status = patch.dateStatus
  if (patch.eventDate !== undefined) update.event_date = patch.eventDate
  if (patch.eventTime !== undefined) update.event_time = patch.eventTime
  if (patch.venueLabel !== undefined) update.venue_label = patch.venueLabel
  if (patch.venueType !== undefined) update.venue_type = patch.venueType
  if (patch.venueLatitude !== undefined) update.venue_latitude = patch.venueLatitude
  if (patch.venueLongitude !== undefined) update.venue_longitude = patch.venueLongitude
  if (patch.theme !== undefined) update.theme = patch.theme
  if (patch.details !== undefined) update.details = patch.details
  if (patch.enabledModules !== undefined) update.enabled_modules = patch.enabledModules
  if (patch.ceremonyLocationLabel !== undefined) update.ceremony_location_label = patch.ceremonyLocationLabel
  if (patch.ceremonyLocationLatitude !== undefined) update.ceremony_location_latitude = patch.ceremonyLocationLatitude
  if (patch.ceremonyLocationLongitude !== undefined) update.ceremony_location_longitude = patch.ceremonyLocationLongitude
  if (patch.ceremonyTime !== undefined) update.ceremony_time = patch.ceremonyTime
  if (patch.celebrationLocationLabel !== undefined) update.celebration_location_label = patch.celebrationLocationLabel
  if (patch.celebrationLocationLatitude !== undefined) update.celebration_location_latitude = patch.celebrationLocationLatitude
  if (patch.celebrationLocationLongitude !== undefined) update.celebration_location_longitude = patch.celebrationLocationLongitude
  if (patch.rsvpDeadline !== undefined) update.rsvp_deadline = patch.rsvpDeadline
  const { error } = await supabase.from('events').update(update).eq('id', id)
  if (error) throw error

  // Petición real: con la fecha confirmada se apunta sola en el Calendario, y si
  // después cambia (fecha, hora, título o lugar) se actualiza sola.
  const touchesCalendar = patch.title !== undefined || patch.dateStatus !== undefined || patch.eventDate !== undefined || patch.eventTime !== undefined || patch.venueLabel !== undefined
  if (touchesCalendar) await syncEventToCalendarSafely(id)
  // Igual con el recordatorio del plazo de RSVP (se pone, se mueve o se quita solo).
  if (patch.rsvpDeadline !== undefined || patch.title !== undefined) await syncRsvpDeadlineReminderSafely(id)
}

// Fase 1 — enabledModules debe tener una única fuente de verdad: tanto
// "Gestionar evento" → Secciones (reemplazo directo) como "Organízamelo
// Pepa" (añadir los módulos recomendados que faltan) pasan por esta
// misma función en vez de construir el patch a mano cada uno por su
// lado.
export async function addEnabledModules(eventId: string, currentModules: EventModuleKey[], toAdd: EventModuleKey[]): Promise<void> {
  if (toAdd.length === 0) return
  const next = [...currentModules, ...toAdd.filter((m) => !currentModules.includes(m))]
  await updateEvent(eventId, { enabledModules: next })
}

// Petición de la Skill: "relative tasks update when event date
// changes" — solo toca las tareas generadas automáticamente (source
// 'auto'), buscándolas por título exacto de la plantilla; una tarea
// auto que el usuario haya renombrado deja de recalcularse sola (no
// hay forma de saber cuál era sin guardar una clave de plantilla, y no
// merece la pena para este alcance).
export async function recalculateAutoTasks(eventId: string, type: EventType, eventDate: string | null): Promise<void> {
  const templates = generateAutoTasks(type, eventDate)
  const results = await Promise.all(
    templates.map((t) =>
      supabase.from('event_tasks').update({ due_date: t.dueDate }).eq('event_id', eventId).eq('source', 'auto').eq('title', t.title),
    ),
  )
  const failed = results.find((r) => r.error)
  if (failed?.error) throw new Error(failed.error.message)
}

export async function archiveEvent(id: string): Promise<void> {
  const { error } = await supabase.from('events').update({ status: 'archivado' }).eq('id', id)
  if (error) throw error
}

export async function unarchiveEvent(id: string): Promise<void> {
  const { error } = await supabase.from('events').update({ status: 'planificacion' }).eq('id', id)
  if (error) throw error
}

// Petición real: "las etiquetas de un evento borrado no se borran,
// habría que borrarlas" — la etiqueta que se creó sola al dar de alta
// el evento (findOrCreateEventTag) se queda huérfana si nadie la
// limpia. Solo se borra si de verdad no la usa nada más: ni otro
// evento con el mismo nombre (findOrCreateEventTag reutiliza por
// nombre exacto, así que dos eventos podrían compartirla) ni ningún
// gasto ya etiquetado — borrar una etiqueta con gastos reales detrás
// los dejaría "Sin etiqueta" en silencio (expenses.tag_id es ON DELETE
// SET NULL), y eso sí perdería información real.
export async function deleteEvent(id: string): Promise<void> {
  const { data: existing } = await supabase.from('events').select('tag_id').eq('id', id).maybeSingle()
  const { error } = await supabase.from('events').delete().eq('id', id)
  if (error) throw error
  const tagId = existing?.tag_id
  if (!tagId) return
  const [{ count: otherEvents }, { count: taggedExpenses }] = await Promise.all([
    supabase.from('events').select('id', { count: 'exact', head: true }).eq('tag_id', tagId),
    supabase.from('expenses').select('id', { count: 'exact', head: true }).eq('tag_id', tagId),
  ])
  if (!otherEvents && !taggedExpenses) {
    await supabase.from('tags').delete().eq('id', tagId)
  }
}

// Duplicar — petición de la Skill: copia la estructura (tipo, título,
// módulos, sitio, tema, datos del tipo) pero NUNCA estado transaccional
// viejo (invitados/RSVP/gastos), y genera una checklist nueva desde
// cero. Útil para el cumpleaños del año que viene.
export async function duplicateEvent(id: string): Promise<string> {
  const original = await getEvent(id)
  return createEvent({
    type: original.type,
    subtype: original.subtype,
    title: original.title,
    dateStatus: 'pendiente',
    eventDate: null,
    details: original.details,
    enabledModules: original.enabledModules,
    theme: original.theme,
  })
}

// ---------------------------------------------------------------------
// Preparativos / tareas
// ---------------------------------------------------------------------

const TASK_SELECT = 'id, event_id, family_id, title, done, due_date, source, sort_order, created_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTask(r: any): EventTask {
  return {
    id: r.id,
    eventId: r.event_id,
    familyId: r.family_id,
    title: r.title,
    done: r.done,
    dueDate: r.due_date,
    source: r.source,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
  }
}

export async function listEventTasks(eventId: string): Promise<EventTask[]> {
  const { data, error } = await supabase
    .from('event_tasks')
    .select(TASK_SELECT)
    .eq('event_id', eventId)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data.map(mapTask)
}

export async function addEventTask(eventId: string, title: string, dueDate: string | null = null): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase
    .from('event_tasks')
    .insert({ event_id: eventId, family_id: familyId, title: title.trim(), due_date: dueDate, source: 'manual', sort_order: Date.now() })
  if (error) throw error
}

export async function updateEventTask(id: string, patch: { title?: string; done?: boolean; dueDate?: string | null }): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.title !== undefined) update.title = patch.title.trim()
  if (patch.done !== undefined) update.done = patch.done
  if (patch.dueDate !== undefined) update.due_date = patch.dueDate
  const { error } = await supabase.from('event_tasks').update(update).eq('id', id)
  if (error) throw error
}

export async function deleteEventTask(id: string): Promise<void> {
  const { error } = await supabase.from('event_tasks').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------
// Calendario — petición de la Skill: no crear ningún compromiso firme
// mientras la fecha no esté confirmada; al confirmarla se apunta sola
// (ver syncEventToCalendar más abajo).
// ---------------------------------------------------------------------

export async function linkEventToCalendar(event: FamilyEvent): Promise<void> {
  if (!event.eventDate) throw new Error('Este evento todavía no tiene fecha')
  const familyId = await currentFamilyId()
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')

  const allDay = !event.eventTime
  const startAt = allDay ? `${event.eventDate}T00:00:00` : `${event.eventDate}T${event.eventTime}:00`
  const { data: calendarEvent, error } = await supabase
    .from('calendar_events')
    .insert({
      family_id: familyId,
      title: event.title,
      start_at: startAt,
      all_day: allDay,
      created_by: userResult.user.id,
      location_label: event.venueLabel,
      visibility: 'shared',
    })
    .select('id')
    .single()
  if (error) throw error

  const { error: linkError } = await supabase.from('events').update({ calendar_event_id: calendarEvent.id }).eq('id', event.id)
  if (linkError) throw linkError
}

// Cuando la fecha/hora cambia y el evento ya tenía un enlace de
// Calendario, actualiza SOLO ese compromiso ya creado.
export async function updateLinkedCalendarEvent(event: FamilyEvent): Promise<void> {
  if (!event.calendarEventId) return
  if (!event.eventDate) throw new Error('Este evento ya no tiene fecha')
  const allDay = !event.eventTime
  const startAt = allDay ? `${event.eventDate}T00:00:00` : `${event.eventDate}T${event.eventTime}:00`
  const { error } = await supabase
    .from('calendar_events')
    .update({ title: event.title, start_at: startAt, all_day: allDay, location_label: event.venueLabel })
    .eq('id', event.calendarEventId)
  if (error) throw error
}

// Petición real: "definimos por defecto que si se confirma la fecha se apunta
// en el calendario y si se modifica la fecha una vez confirmado se actualiza" —
// ya no hay botones manuales. Con la fecha confirmada: si el evento no está en el
// Calendario se apunta (nota "Fecha anotada en el calendario"), y si ya estaba y
// algo ha cambiado (fecha, hora, título o lugar) se actualiza (nota "Fecha
// actualizada en el calendario"). Devuelve qué ha pasado, o null si nada.
export type CalendarSyncResult = 'created' | 'updated' | null

const syncing = new Set<string>()

export async function syncEventToCalendar(id: string): Promise<CalendarSyncResult> {
  if (syncing.has(id)) return null
  syncing.add(id)
  try {
    const event = await getEvent(id)
    if (event.status === 'archivado' || event.dateStatus !== 'confirmada' || !event.eventDate) return null

    if (event.calendarEventId) {
      const { data } = await supabase
        .from('calendar_events')
        .select('start_at, title, location_label')
        .eq('id', event.calendarEventId)
        .maybeSingle()
      if (data) {
        const desiredStart = event.eventTime ? `${event.eventDate}T${event.eventTime}:00` : `${event.eventDate}T00:00:00`
        const unchanged =
          String(data.start_at).slice(0, 19) === desiredStart &&
          data.title === event.title &&
          (data.location_label ?? null) === (event.venueLabel ?? null)
        if (unchanged) return null
        await updateLinkedCalendarEvent(event)
        showToast('📅 Fecha actualizada en el calendario')
        return 'updated'
      }
      // El compromiso enlazado ya no existe (se borró en Calendario): se vuelve a apuntar.
    }
    await linkEventToCalendar(event)
    showToast('📅 Fecha anotada en el calendario')
    return 'created'
  } finally {
    syncing.delete(id)
  }
}

// Igual, pero un fallo del Calendario nunca impide guardar el evento: solo se avisa.
async function syncEventToCalendarSafely(id: string): Promise<void> {
  try {
    await syncEventToCalendar(id)
  } catch {
    showToast('⚠️ No se pudo anotar la fecha en el calendario')
  }
}

// Recordatorio push del plazo de RSVP — mismo patrón que el
// vencimiento de un documento (member_documents.expiryDate): una fila
// normal en calendar_events con sus propios recordatorios, para que el
// pipeline de avisos ya existente (send-due-reminders) funcione sin
// tocar nada. Automático: se pone solo al fijar el plazo (ver syncRsvpDeadlineReminder).
// Los recordatorios de un calendar_event NO son una columna suya —
// viven en la tabla aparte calendar_event_reminders (event_id,
// minutes_before, anchor), igual que hace src/data/calendar.ts.
const DEFAULT_DEADLINE_REMINDERS: EventReminder[] = [{ minutesBefore: 3 * 1440, anchor: 'start' }]

async function insertReminders(calendarEventId: string, reminders: EventReminder[]): Promise<void> {
  const { error } = await supabase
    .from('calendar_event_reminders')
    .insert(reminders.map((r) => ({ event_id: calendarEventId, minutes_before: r.minutesBefore, anchor: r.anchor })))
  if (error) throw error
}

export async function linkRsvpDeadlineReminder(event: FamilyEvent): Promise<void> {
  if (!event.rsvpDeadline) throw new Error('Este evento no tiene plazo de RSVP')
  const familyId = await currentFamilyId()
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  const { data: calendarEvent, error } = await supabase
    .from('calendar_events')
    .insert({
      family_id: familyId,
      title: `Plazo de RSVP: ${event.title}`,
      start_at: `${event.rsvpDeadline}T00:00:00`,
      all_day: true,
      created_by: userResult.user.id,
      visibility: 'shared',
    })
    .select('id')
    .single()
  if (error) throw error
  await insertReminders(calendarEvent.id, DEFAULT_DEADLINE_REMINDERS)
  const { error: linkError } = await supabase.from('events').update({ rsvp_deadline_calendar_event_id: calendarEvent.id }).eq('id', event.id)
  if (linkError) throw linkError
}

// Petición real: el recordatorio del plazo también es automático. Con plazo de RSVP
// y evento en planificación se pone solo ("Recordatorio del plazo puesto"); si el
// plazo o el título cambian se mueve solo ("Recordatorio del plazo actualizado"); si
// se quita el plazo, se borra. Devuelve qué ha pasado, o null si nada.
export type ReminderSyncResult = 'created' | 'updated' | 'removed' | null

const syncingReminders = new Set<string>()

export async function syncRsvpDeadlineReminder(id: string): Promise<ReminderSyncResult> {
  if (syncingReminders.has(id)) return null
  syncingReminders.add(id)
  try {
    const event = await getEvent(id)
    const linkedId = event.rsvpDeadlineCalendarEventId

    if (!event.rsvpDeadline || event.status === 'archivado') {
      if (!linkedId) return null
      const { error } = await supabase.from('calendar_events').delete().eq('id', linkedId)
      if (error) throw error
      const { error: unlinkError } = await supabase.from('events').update({ rsvp_deadline_calendar_event_id: null }).eq('id', id)
      if (unlinkError) throw unlinkError
      return 'removed'
    }

    const desiredTitle = `Plazo de RSVP: ${event.title}`
    const desiredStart = `${event.rsvpDeadline}T00:00:00`
    if (linkedId) {
      const { data } = await supabase.from('calendar_events').select('start_at, title').eq('id', linkedId).maybeSingle()
      if (data) {
        if (String(data.start_at).slice(0, 19) === desiredStart && data.title === desiredTitle) return null
        const { error } = await supabase.from('calendar_events').update({ title: desiredTitle, start_at: desiredStart }).eq('id', linkedId)
        if (error) throw error
        showToast('🔔 Recordatorio del plazo actualizado')
        return 'updated'
      }
      // El recordatorio enlazado ya no existe: se vuelve a poner.
    }
    await linkRsvpDeadlineReminder(event)
    showToast('🔔 Recordatorio del plazo puesto')
    return 'created'
  } finally {
    syncingReminders.delete(id)
  }
}

async function syncRsvpDeadlineReminderSafely(id: string): Promise<void> {
  try {
    await syncRsvpDeadlineReminder(id)
  } catch {
    showToast('⚠️ No se pudo poner el recordatorio del plazo')
  }
}

export async function linkPaymentReminder(payment: EventPayment, eventTitle: string): Promise<void> {
  if (!payment.dueDate) throw new Error('Este pago no tiene fecha de vencimiento')
  const familyId = await currentFamilyId()
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  const { data: calendarEvent, error } = await supabase
    .from('calendar_events')
    .insert({
      family_id: familyId,
      title: `Vence "${payment.concept}" (${eventTitle})`,
      start_at: `${payment.dueDate}T00:00:00`,
      all_day: true,
      created_by: userResult.user.id,
      visibility: 'shared',
    })
    .select('id')
    .single()
  if (error) throw error
  await insertReminders(calendarEvent.id, DEFAULT_DEADLINE_REMINDERS)
  const { error: linkError } = await supabase.from('event_payments').update({ reminder_calendar_event_id: calendarEvent.id }).eq('id', payment.id)
  if (linkError) throw linkError
}

// ---------------------------------------------------------------------
// Invitados — petición de la Skill: alta mínima (nombre/grupo + adultos
// + niños), sin importar contactos; los totales se calculan solos
// sumando la lista, nunca se piden aparte.
// ---------------------------------------------------------------------

const GUEST_SELECT =
  'id, event_id, family_id, display_name, adults_count, children_count, notes, invite_scope, rsvp_status, rsvp_adults_count, rsvp_children_count, rsvp_note, rsvp_token_active, rsvp_responded_at, table_id, sort_order, created_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapGuest(r: any): EventGuest {
  return {
    id: r.id,
    eventId: r.event_id,
    familyId: r.family_id,
    displayName: r.display_name,
    adultsCount: r.adults_count,
    childrenCount: r.children_count,
    notes: r.notes,
    inviteScope: r.invite_scope,
    rsvpStatus: r.rsvp_status,
    rsvpAdultsCount: r.rsvp_adults_count,
    rsvpChildrenCount: r.rsvp_children_count,
    rsvpNote: r.rsvp_note,
    rsvpTokenActive: r.rsvp_token_active,
    rsvpRespondedAt: r.rsvp_responded_at,
    tableId: r.table_id,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
  }
}

export async function listEventGuests(eventId: string): Promise<EventGuest[]> {
  const { data, error } = await supabase.from('event_guests').select(GUEST_SELECT).eq('event_id', eventId).order('sort_order', { ascending: true })
  if (error) throw error
  return data.map(mapGuest)
}

export async function addEventGuest(
  eventId: string,
  input: { displayName: string; adultsCount: number; childrenCount: number; notes?: string | null; inviteScope?: EventGuestInviteScope | null },
): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('event_guests').insert({
    event_id: eventId,
    family_id: familyId,
    display_name: input.displayName.trim(),
    adults_count: input.adultsCount,
    children_count: input.childrenCount,
    notes: input.notes ?? null,
    invite_scope: input.inviteScope ?? null,
    sort_order: Date.now(),
  })
  if (error) throw error
}

export async function updateEventGuest(
  id: string,
  patch: Partial<{
    displayName: string
    adultsCount: number
    childrenCount: number
    notes: string | null
    inviteScope: EventGuestInviteScope | null
    rsvpStatus: EventGuestRsvpStatus
    rsvpAdultsCount: number | null
    rsvpChildrenCount: number | null
    rsvpNote: string | null
  }>,
): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.displayName !== undefined) update.display_name = patch.displayName.trim()
  if (patch.adultsCount !== undefined) update.adults_count = patch.adultsCount
  if (patch.childrenCount !== undefined) update.children_count = patch.childrenCount
  if (patch.notes !== undefined) update.notes = patch.notes
  if (patch.inviteScope !== undefined) update.invite_scope = patch.inviteScope
  if (patch.rsvpStatus !== undefined) {
    update.rsvp_status = patch.rsvpStatus
    update.rsvp_responded_at = patch.rsvpStatus === 'pendiente' ? null : new Date().toISOString()
  }
  if (patch.rsvpAdultsCount !== undefined) update.rsvp_adults_count = patch.rsvpAdultsCount
  if (patch.rsvpChildrenCount !== undefined) update.rsvp_children_count = patch.rsvpChildrenCount
  if (patch.rsvpNote !== undefined) update.rsvp_note = patch.rsvpNote
  const { error } = await supabase.from('event_guests').update(update).eq('id', id)
  if (error) throw error
}

export async function deleteEventGuest(id: string): Promise<void> {
  const { error } = await supabase.from('event_guests').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------
// Presupuesto — planeado (esta tabla) vs real (expenses filtrado por
// events.tagId desde la propia pantalla, sin duplicar nada de Economía).
// ---------------------------------------------------------------------

const BUDGET_ITEM_SELECT = 'id, event_id, family_id, category, planned_amount, sort_order, created_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapBudgetItem(r: any): EventBudgetItem {
  return {
    id: r.id,
    eventId: r.event_id,
    familyId: r.family_id,
    category: r.category,
    plannedAmount: Number(r.planned_amount),
    sortOrder: r.sort_order,
    createdAt: r.created_at,
  }
}

export async function listEventBudgetItems(eventId: string): Promise<EventBudgetItem[]> {
  const { data, error } = await supabase
    .from('event_budget_items')
    .select(BUDGET_ITEM_SELECT)
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data.map(mapBudgetItem)
}

export async function addEventBudgetItem(eventId: string, category: string, plannedAmount: number): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase
    .from('event_budget_items')
    .insert({ event_id: eventId, family_id: familyId, category: category.trim(), planned_amount: plannedAmount, sort_order: Date.now() })
  if (error) throw error
}

export async function updateEventBudgetItem(id: string, patch: { category?: string; plannedAmount?: number }): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.category !== undefined) update.category = patch.category.trim()
  if (patch.plannedAmount !== undefined) update.planned_amount = patch.plannedAmount
  const { error } = await supabase.from('event_budget_items').update(update).eq('id', id)
  if (error) throw error
}

export async function deleteEventBudgetItem(id: string): Promise<void> {
  const { error } = await supabase.from('event_budget_items').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------
// Menú — se planea aquí, y solo pasa a Compras cuando el usuario lo
// confirma explícitamente (transferMenuToShopping).
// ---------------------------------------------------------------------

const MENU_ITEM_SELECT = 'id, event_id, family_id, name, category, quantity_note, transferred, sort_order, created_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapMenuItem(r: any): EventMenuItem {
  return {
    id: r.id,
    eventId: r.event_id,
    familyId: r.family_id,
    name: r.name,
    category: r.category,
    quantityNote: r.quantity_note,
    transferred: r.transferred,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
  }
}

export async function listEventMenuItems(eventId: string): Promise<EventMenuItem[]> {
  const { data, error } = await supabase
    .from('event_menu_items')
    .select(MENU_ITEM_SELECT)
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data.map(mapMenuItem)
}

export async function addEventMenuItem(eventId: string, name: string, category?: string | null, quantityNote?: string | null): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('event_menu_items').insert({
    event_id: eventId,
    family_id: familyId,
    name: name.trim(),
    category: category ?? null,
    quantity_note: quantityNote ?? null,
    sort_order: Date.now(),
  })
  if (error) throw error
}

export async function deleteEventMenuItem(id: string): Promise<void> {
  const { error } = await supabase.from('event_menu_items').delete().eq('id', id)
  if (error) throw error
}

// Petición de la Skill: "User confirms transfer to PEPA Purchases" —
// solo las líneas todavía no traspasadas, una por producto, con el
// event_id puesto para que el evento pueda ver luego qué falta comprar
// filtrando shopping_items sin tener que duplicar nada.
export async function transferMenuToShopping(eventId: string): Promise<number> {
  const items = await listEventMenuItems(eventId)
  const pending = items.filter((i) => !i.transferred)
  for (const item of pending) {
    await addShoppingItem({ name: item.name, quantity: '', unit: '', priority: 'normal', tripId: null, eventId })
  }
  if (pending.length > 0) {
    const { error } = await supabase
      .from('event_menu_items')
      .update({ transferred: true })
      .in('id', pending.map((i) => i.id))
    if (error) throw error
  }
  return pending.length
}

// ---------------------------------------------------------------------
// Proveedores — registro ligero, sin marketplace externo.
// ---------------------------------------------------------------------

const PROVIDER_SELECT = 'id, event_id, family_id, name, type, contact_note, notes, created_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProvider(r: any): EventProvider {
  return {
    id: r.id,
    eventId: r.event_id,
    familyId: r.family_id,
    name: r.name,
    type: r.type,
    contactNote: r.contact_note,
    notes: r.notes,
    createdAt: r.created_at,
  }
}

export async function listEventProviders(eventId: string): Promise<EventProvider[]> {
  const { data, error } = await supabase.from('event_providers').select(PROVIDER_SELECT).eq('event_id', eventId).order('created_at', { ascending: true })
  if (error) throw error
  return data.map(mapProvider)
}

export async function addEventProvider(
  eventId: string,
  input: { name: string; type?: string | null; contactNote?: string | null; notes?: string | null },
): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('event_providers').insert({
    event_id: eventId,
    family_id: familyId,
    name: input.name.trim(),
    type: input.type ?? null,
    contact_note: input.contactNote ?? null,
    notes: input.notes ?? null,
  })
  if (error) throw error
}

export async function deleteEventProvider(id: string): Promise<void> {
  const { error } = await supabase.from('event_providers').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------
// Pagos / fianzas.
// ---------------------------------------------------------------------

const PAYMENT_SELECT = 'id, event_id, family_id, provider_id, concept, total_amount, deposit_paid, due_date, status, notes, reminder_calendar_event_id, created_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPayment(r: any): EventPayment {
  return {
    id: r.id,
    eventId: r.event_id,
    familyId: r.family_id,
    providerId: r.provider_id,
    concept: r.concept,
    totalAmount: Number(r.total_amount),
    depositPaid: Number(r.deposit_paid),
    dueDate: r.due_date,
    status: r.status,
    notes: r.notes,
    reminderCalendarEventId: r.reminder_calendar_event_id,
    createdAt: r.created_at,
  }
}

export async function listEventPayments(eventId: string): Promise<EventPayment[]> {
  const { data, error } = await supabase
    .from('event_payments')
    .select(PAYMENT_SELECT)
    .eq('event_id', eventId)
    .order('due_date', { ascending: true, nullsFirst: false })
  if (error) throw error
  return data.map(mapPayment)
}

export async function addEventPayment(
  eventId: string,
  input: { concept: string; totalAmount: number; depositPaid: number; dueDate?: string | null; providerId?: string | null; notes?: string | null },
): Promise<void> {
  const familyId = await currentFamilyId()
  const status: EventPaymentStatus = input.depositPaid <= 0 ? 'pendiente' : input.depositPaid >= input.totalAmount ? 'pagado' : 'parcial'
  const { error } = await supabase.from('event_payments').insert({
    event_id: eventId,
    family_id: familyId,
    provider_id: input.providerId ?? null,
    concept: input.concept.trim(),
    total_amount: input.totalAmount,
    deposit_paid: input.depositPaid,
    due_date: input.dueDate ?? null,
    status,
    notes: input.notes ?? null,
  })
  if (error) throw error
}

export async function updateEventPayment(id: string, patch: { depositPaid?: number; totalAmount?: number; status?: EventPaymentStatus }): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.totalAmount !== undefined) update.total_amount = patch.totalAmount
  if (patch.depositPaid !== undefined) update.deposit_paid = patch.depositPaid
  if (patch.status !== undefined) update.status = patch.status
  const { error } = await supabase.from('event_payments').update(update).eq('id', id)
  if (error) throw error
}

export async function deleteEventPayment(id: string): Promise<void> {
  const { error } = await supabase.from('event_payments').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------
// RSVP público — enlace personalizado por invitado, sin cuenta PEPA
// (ver supabase/functions/event-rsvp, que ahora solo sirve JSON, y
// src/ui/RsvpScreen.tsx, que lo renderiza). El token se genera bajo
// demanda, no al crear el invitado.
//
// Bug real: el enlace apuntaba antes directo a la función edge
// (*.supabase.co/functions/v1/event-rsvp), que sirve HTML — pero
// Supabase fuerza Content-Type: text/plain + una CSP en modo sandbox
// en toda función edge (para que ninguna pueda servir HTML "de
// verdad" bajo su dominio compartido), así que el móvil lo descargaba
// como archivo en vez de abrirlo. Ahora el enlace es la propia app,
// por la RAÍZ ("/?rsvp=TOKEN") — un archivo real en GitHub Pages, sin
// el truco de 404.html de por medio (mismo motivo que el regreso del
// banco vuelve siempre a "/": ese salto doble es el más frágil justo
// tras un enlace externo largo en móvil) — App.tsx la reconoce y
// bypasa el login por completo.
function appBaseUrl(): string {
  return window.location.origin + import.meta.env.BASE_URL
}

function rsvpUrlFromToken(token: string): string {
  return `${appBaseUrl()}?rsvp=${token}`
}

export async function getGuestRsvpUrl(guestId: string): Promise<string> {
  const { data, error } = await supabase.rpc('generate_event_guest_rsvp_token', { p_guest_id: guestId })
  if (error) throw error
  return rsvpUrlFromToken(data as string)
}

// Petición de la Skill: "Organizer can regenerate/invalidate the RSVP
// token/link if needed" — el enlace viejo deja de servir al instante.
export async function regenerateGuestRsvpUrl(guestId: string): Promise<string> {
  const { data, error } = await supabase.rpc('regenerate_event_guest_rsvp_token', { p_guest_id: guestId })
  if (error) throw error
  return rsvpUrlFromToken(data as string)
}

// ---------------------------------------------------------------------
// Fase 4 — enlace de RSVP abierto (opcional, sin invitado previo).
// Mismo patrón de token que el personalizado, pero a nivel de evento.
// ---------------------------------------------------------------------

function openRsvpUrlFromToken(token: string): string {
  return `${appBaseUrl()}?rsvp_open=${token}`
}

export async function getEventOpenRsvpUrl(eventId: string): Promise<string> {
  const { data, error } = await supabase.rpc('generate_event_open_rsvp_token', { p_event_id: eventId })
  if (error) throw error
  return openRsvpUrlFromToken(data as string)
}

export async function regenerateEventOpenRsvpUrl(eventId: string): Promise<string> {
  const { data, error } = await supabase.rpc('regenerate_event_open_rsvp_token', { p_event_id: eventId })
  if (error) throw error
  return openRsvpUrlFromToken(data as string)
}

export async function disableEventOpenLink(eventId: string): Promise<void> {
  const { error } = await supabase.from('events').update({ open_rsvp_token: null }).eq('id', eventId)
  if (error) throw error
}

// ---------------------------------------------------------------------
// Fase 3 — Decoración. Opcional; PEPA propone, la familia elige todo/
// algo/nada (nunca se asume que un evento necesita decoración).
// ---------------------------------------------------------------------

const DECORATION_SELECT = 'id, event_id, family_id, name, note, status, price_estimate, transferred_to_shopping, sort_order, created_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDecorationItem(r: any): EventDecorationItem {
  return {
    id: r.id,
    eventId: r.event_id,
    familyId: r.family_id,
    name: r.name,
    note: r.note,
    status: r.status,
    priceEstimate: r.price_estimate === null ? null : Number(r.price_estimate),
    transferredToShopping: r.transferred_to_shopping,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
  }
}

export async function listEventDecorationItems(eventId: string): Promise<EventDecorationItem[]> {
  const { data, error } = await supabase
    .from('event_decoration_items')
    .select(DECORATION_SELECT)
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data.map(mapDecorationItem)
}

export async function addEventDecorationItem(eventId: string, name: string, priceEstimate: number | null = null): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase
    .from('event_decoration_items')
    .insert({ event_id: eventId, family_id: familyId, name: name.trim(), price_estimate: priceEstimate, sort_order: Date.now() })
  if (error) throw error
}

export async function updateEventDecorationItem(id: string, patch: { status?: EventDecorationStatus }): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.status !== undefined) update.status = patch.status
  const { error } = await supabase.from('event_decoration_items').update(update).eq('id', id)
  if (error) throw error
}

export async function deleteEventDecorationItem(id: string): Promise<void> {
  const { error } = await supabase.from('event_decoration_items').delete().eq('id', id)
  if (error) throw error
}

export async function transferDecorationItemToShopping(item: EventDecorationItem): Promise<void> {
  await addShoppingItem({ name: item.name, quantity: '', unit: '', priority: 'normal', tripId: null, eventId: item.eventId })
  const { error } = await supabase.from('event_decoration_items').update({ transferred_to_shopping: true }).eq('id', item.id)
  if (error) throw error
}

// ---------------------------------------------------------------------
// Fase 3 — Actividades / juegos. Contextual, sobre todo cumpleaños sin
// animación incluida por el local.
// ---------------------------------------------------------------------

const ACTIVITY_SELECT = 'id, event_id, family_id, title, description, age_range, duration_minutes, materials_note, transferred_to_shopping, sort_order, created_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapActivity(r: any): EventActivity {
  return {
    id: r.id,
    eventId: r.event_id,
    familyId: r.family_id,
    title: r.title,
    description: r.description,
    ageRange: r.age_range,
    durationMinutes: r.duration_minutes,
    materialsNote: r.materials_note,
    transferredToShopping: r.transferred_to_shopping,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
  }
}

export async function listEventActivities(eventId: string): Promise<EventActivity[]> {
  const { data, error } = await supabase.from('event_activities').select(ACTIVITY_SELECT).eq('event_id', eventId).order('sort_order', { ascending: true })
  if (error) throw error
  return data.map(mapActivity)
}

export async function addEventActivity(
  eventId: string,
  input: { title: string; ageRange?: string | null; durationMinutes?: number | null; materialsNote?: string | null },
): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('event_activities').insert({
    event_id: eventId,
    family_id: familyId,
    title: input.title.trim(),
    age_range: input.ageRange ?? null,
    duration_minutes: input.durationMinutes ?? null,
    materials_note: input.materialsNote ?? null,
    sort_order: Date.now(),
  })
  if (error) throw error
}

export async function deleteEventActivity(id: string): Promise<void> {
  const { error } = await supabase.from('event_activities').delete().eq('id', id)
  if (error) throw error
}

export async function transferActivityMaterialsToShopping(activity: EventActivity): Promise<void> {
  if (!activity.materialsNote?.trim()) return
  await addShoppingItem({ name: activity.materialsNote, quantity: '', unit: '', priority: 'normal', tripId: null, eventId: activity.eventId })
  const { error } = await supabase.from('event_activities').update({ transferred_to_shopping: true }).eq('id', activity.id)
  if (error) throw error
}

// ---------------------------------------------------------------------
// Fase 3 — Mesas. Asignación simple, sin plano 3D (excluido a propósito
// por la Skill).
// ---------------------------------------------------------------------

const TABLE_SELECT = 'id, event_id, family_id, name, capacity, sort_order, created_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTableSeat(r: any): EventTableSeat {
  return {
    id: r.id,
    eventId: r.event_id,
    familyId: r.family_id,
    name: r.name,
    capacity: r.capacity,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
  }
}

export async function listEventTables(eventId: string): Promise<EventTableSeat[]> {
  const { data, error } = await supabase.from('event_tables').select(TABLE_SELECT).eq('event_id', eventId).order('sort_order', { ascending: true })
  if (error) throw error
  return data.map(mapTableSeat)
}

export async function addEventTable(eventId: string, name: string, capacity: number | null): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('event_tables').insert({ event_id: eventId, family_id: familyId, name: name.trim(), capacity, sort_order: Date.now() })
  if (error) throw error
}

export async function deleteEventTable(id: string): Promise<void> {
  const { error } = await supabase.from('event_tables').delete().eq('id', id)
  if (error) throw error
}

export async function assignGuestTable(guestId: string, tableId: string | null): Promise<void> {
  const { error } = await supabase.from('event_guests').update({ table_id: tableId }).eq('id', guestId)
  if (error) throw error
}

// ---------------------------------------------------------------------
// Fase 3 — Detalles/recuerdos (por tipo de artículo) y Detalles
// especiales (por persona) — mismo módulo 'detalles' del motor común,
// dos formas distintas a propósito (ver plan).
// ---------------------------------------------------------------------

const FAVOR_SELECT = 'id, event_id, family_id, item_type, quantity_needed, budget, supplier, status, delivery_note, created_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapFavorItem(r: any): EventFavorItem {
  return {
    id: r.id,
    eventId: r.event_id,
    familyId: r.family_id,
    itemType: r.item_type,
    quantityNeeded: r.quantity_needed,
    budget: r.budget === null ? null : Number(r.budget),
    supplier: r.supplier,
    status: r.status,
    deliveryNote: r.delivery_note,
    createdAt: r.created_at,
  }
}

export async function listEventFavorItems(eventId: string): Promise<EventFavorItem[]> {
  const { data, error } = await supabase.from('event_favor_items').select(FAVOR_SELECT).eq('event_id', eventId).order('created_at', { ascending: true })
  if (error) throw error
  return data.map(mapFavorItem)
}

export async function addEventFavorItem(
  eventId: string,
  input: { itemType: string; quantityNeeded?: number | null; budget?: number | null; supplier?: string | null },
): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('event_favor_items').insert({
    event_id: eventId,
    family_id: familyId,
    item_type: input.itemType.trim(),
    quantity_needed: input.quantityNeeded ?? null,
    budget: input.budget ?? null,
    supplier: input.supplier ?? null,
  })
  if (error) throw error
}

export async function updateEventFavorItem(id: string, patch: { status?: EventFavorStatus }): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.status !== undefined) update.status = patch.status
  const { error } = await supabase.from('event_favor_items').update(update).eq('id', id)
  if (error) throw error
}

export async function deleteEventFavorItem(id: string): Promise<void> {
  const { error } = await supabase.from('event_favor_items').delete().eq('id', id)
  if (error) throw error
}

const SPECIAL_DETAIL_SELECT = 'id, event_id, family_id, recipient_name, relationship, detail, budget, status, delivery_note, notes, created_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSpecialDetail(r: any): EventSpecialDetail {
  return {
    id: r.id,
    eventId: r.event_id,
    familyId: r.family_id,
    recipientName: r.recipient_name,
    relationship: r.relationship,
    detail: r.detail,
    budget: r.budget === null ? null : Number(r.budget),
    status: r.status,
    deliveryNote: r.delivery_note,
    notes: r.notes,
    createdAt: r.created_at,
  }
}

export async function listEventSpecialDetails(eventId: string): Promise<EventSpecialDetail[]> {
  const { data, error } = await supabase
    .from('event_special_details')
    .select(SPECIAL_DETAIL_SELECT)
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data.map(mapSpecialDetail)
}

export async function addEventSpecialDetail(
  eventId: string,
  input: { recipientName: string; relationship?: string | null; detail?: string | null; budget?: number | null },
): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('event_special_details').insert({
    event_id: eventId,
    family_id: familyId,
    recipient_name: input.recipientName.trim(),
    relationship: input.relationship ?? null,
    detail: input.detail ?? null,
    budget: input.budget ?? null,
  })
  if (error) throw error
}

export async function updateEventSpecialDetail(id: string, patch: { status?: EventSpecialDetailStatus }): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.status !== undefined) update.status = patch.status
  const { error } = await supabase.from('event_special_details').update(update).eq('id', id)
  if (error) throw error
}

export async function deleteEventSpecialDetail(id: string): Promise<void> {
  const { error } = await supabase.from('event_special_details').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------
// Fase 3 — Regalos recibidos. PRIVADO, nunca en la página pública de
// RSVP (event-rsvp no consulta esta tabla en ningún momento).
// ---------------------------------------------------------------------

const GIFT_SELECT = 'id, event_id, family_id, guest_name, gift_description, cash_amount, note, created_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapGiftReceived(r: any): EventGiftReceived {
  return {
    id: r.id,
    eventId: r.event_id,
    familyId: r.family_id,
    guestName: r.guest_name,
    giftDescription: r.gift_description,
    cashAmount: r.cash_amount === null ? null : Number(r.cash_amount),
    note: r.note,
    createdAt: r.created_at,
  }
}

export async function listEventGifts(eventId: string): Promise<EventGiftReceived[]> {
  const { data, error } = await supabase.from('event_gifts_received').select(GIFT_SELECT).eq('event_id', eventId).order('created_at', { ascending: true })
  if (error) throw error
  return data.map(mapGiftReceived)
}

export async function addEventGift(
  eventId: string,
  input: { guestName: string; giftDescription?: string | null; cashAmount?: number | null; note?: string | null },
): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('event_gifts_received').insert({
    event_id: eventId,
    family_id: familyId,
    guest_name: input.guestName.trim(),
    gift_description: input.giftDescription ?? null,
    cash_amount: input.cashAmount ?? null,
    note: input.note ?? null,
  })
  if (error) throw error
}

export async function deleteEventGift(id: string): Promise<void> {
  const { error } = await supabase.from('event_gifts_received').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------
// Fase 3 — Plan del día. Cronológico, protagonista el propio día del
// evento (ver modo "día del evento" en EventosScreen.tsx).
// ---------------------------------------------------------------------

const DAY_PLAN_SELECT = 'id, event_id, family_id, item_time, title, note, sort_order, created_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDayPlanItem(r: any): EventDayPlanItem {
  return {
    id: r.id,
    eventId: r.event_id,
    familyId: r.family_id,
    itemTime: r.item_time,
    title: r.title,
    note: r.note,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
  }
}

export async function listEventDayPlan(eventId: string): Promise<EventDayPlanItem[]> {
  const { data, error } = await supabase
    .from('event_day_plan_items')
    .select(DAY_PLAN_SELECT)
    .eq('event_id', eventId)
    .order('item_time', { ascending: true, nullsFirst: false })
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data.map(mapDayPlanItem)
}

export async function addEventDayPlanItem(eventId: string, title: string, itemTime: string | null, note: string | null = null): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase
    .from('event_day_plan_items')
    .insert({ event_id: eventId, family_id: familyId, title: title.trim(), item_time: itemTime, note, sort_order: Date.now() })
  if (error) throw error
}

export async function deleteEventDayPlanItem(id: string): Promise<void> {
  const { error } = await supabase.from('event_day_plan_items').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------
// Fase 3 — Editor de invitaciones en capas. Una fila por evento
// (unique(event_id) en la tabla); canvas_json guarda las capas con
// posición/rotación/escala — el cliente es la única fuente de verdad
// de esa forma, la función edge event-rsvp no la toca para nada.
// ---------------------------------------------------------------------

const INVITATION_SELECT = 'id, event_id, family_id, template_key, canvas_json, background_image_path, created_at, updated_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapInvitation(r: any): EventInvitation {
  const canvas = r.canvas_json as Partial<InvitationCanvas> | null
  return {
    id: r.id,
    eventId: r.event_id,
    familyId: r.family_id,
    templateKey: r.template_key,
    canvas: { backgroundGradient: canvas?.backgroundGradient ?? '', layers: canvas?.layers ?? [] },
    backgroundImagePath: r.background_image_path,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function getEventInvitation(eventId: string): Promise<EventInvitation | null> {
  const { data, error } = await supabase.from('event_invitations').select(INVITATION_SELECT).eq('event_id', eventId).maybeSingle()
  if (error) throw error
  return data ? mapInvitation(data) : null
}

export async function saveEventInvitation(
  eventId: string,
  templateKey: string,
  canvas: InvitationCanvas,
  backgroundImagePath: string | null = null,
): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase
    .from('event_invitations')
    .upsert(
      {
        event_id: eventId,
        family_id: familyId,
        template_key: templateKey,
        canvas_json: canvas,
        background_image_path: backgroundImagePath,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'event_id' },
    )
  if (error) throw error
}

// Foto subida por el usuario para una capa del diseño — mismo patrón
// que member-photos (bucket privado, carpeta por familia, URL firmada).
export async function uploadInvitationPhoto(eventId: string, file: File): Promise<string> {
  const familyId = await currentFamilyId()
  const compressed = await compressImageFile(file)
  const ext = compressed.name.split('.').pop() || 'jpg'
  const path = `${familyId}/${eventId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('event-photos').upload(path, compressed)
  if (error) throw error
  return path
}

export async function getInvitationPhotoUrl(photoPath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('event-photos').createSignedUrl(photoPath, 3600)
  if (error) throw error
  return data.signedUrl
}

// ---------------------------------------------------------------------
// Fase 4 — plantillas personales reutilizables (06-custom-event.md):
// solo la configuración (tipo/subtipo/tema/módulos/details), nunca
// invitados/gastos/RSVP en marcha.
// ---------------------------------------------------------------------

const TEMPLATE_SELECT = 'id, family_id, name, type, subtype, theme, details, enabled_modules, created_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTemplate(r: any): EventTemplate {
  return {
    id: r.id,
    familyId: r.family_id,
    name: r.name,
    type: r.type,
    subtype: r.subtype,
    theme: r.theme,
    details: r.details ?? {},
    enabledModules: r.enabled_modules ?? [],
    createdAt: r.created_at,
  }
}

export async function listEventTemplates(): Promise<EventTemplate[]> {
  const { data, error } = await supabase.from('event_templates').select(TEMPLATE_SELECT).order('created_at', { ascending: false })
  if (error) throw error
  return data.map(mapTemplate)
}

export async function saveEventTemplate(name: string, event: FamilyEvent): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('event_templates').insert({
    family_id: familyId,
    name: name.trim(),
    type: event.type,
    subtype: event.subtype,
    theme: event.theme,
    details: event.details,
    enabled_modules: event.enabledModules,
  })
  if (error) throw error
}

export async function deleteEventTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('event_templates').delete().eq('id', id)
  if (error) throw error
}
