// Módulo Eventos (PEPA Events) — capa de datos. Fase 0: motor común +
// tareas. Fase 1: invitados, presupuesto (con gasto real vía etiqueta
// de Economía), menú → traspaso a Compras, proveedores, pagos/fianzas
// y enlace con Calendario al confirmar fecha — ver plan en
// C:\Users\Usuario\.claude\plans\zany-wishing-brook.md.
import { addShoppingItem } from '@/data/shopping'
import { supabase } from '@/data/supabaseClient'
import { generateAutoTasks } from '@/domain/events'
import type {
  EventBudgetItem,
  EventGuest,
  EventGuestInviteScope,
  EventGuestRsvpStatus,
  EventMenuItem,
  EventModuleKey,
  EventPayment,
  EventPaymentStatus,
  EventProvider,
  EventTask,
  EventType,
  FamilyEvent,
} from '@/domain/types'

async function currentFamilyId(): Promise<string> {
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  const { data: profileRow, error } = await supabase.from('profiles').select('family_id').eq('id', userResult.user.id).single()
  if (error) throw error
  return profileRow.family_id
}

const EVENT_SELECT =
  'id, family_id, type, subtype, title, date_status, event_date, event_time, venue_label, venue_type, ceremony_location_label, ceremony_location_latitude, ceremony_location_longitude, ceremony_time, celebration_location_label, celebration_location_latitude, celebration_location_longitude, theme, details, enabled_modules, status, tag_id, calendar_event_id, rsvp_deadline, open_rsvp_token, created_by, created_at, updated_at'

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

// Busca una etiqueta de Economía con ese nombre exacto o la crea —
// evita chocar con el unique(family_id, name) si el usuario ya tenía
// una etiqueta igual (p. ej. al duplicar un evento de años anteriores
// con el mismo título).
async function findOrCreateEventTag(familyId: string, name: string): Promise<string> {
  const trimmed = name.trim().slice(0, 60)
  const { data: existing } = await supabase.from('tags').select('id').eq('family_id', familyId).eq('name', trimmed).maybeSingle()
  if (existing) return existing.id
  const { data: created, error } = await supabase
    .from('tags')
    .insert({ family_id: familyId, name: trimmed, color: '#4C6EF5', sort_order: Date.now() })
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
}): Promise<string> {
  const familyId = await currentFamilyId()
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')

  const tagId = await findOrCreateEventTag(familyId, input.title)

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
    theme: string | null
    details: Record<string, unknown>
    enabledModules: EventModuleKey[]
    ceremonyLocationLabel: string | null
    ceremonyTime: string | null
    celebrationLocationLabel: string | null
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
  if (patch.theme !== undefined) update.theme = patch.theme
  if (patch.details !== undefined) update.details = patch.details
  if (patch.enabledModules !== undefined) update.enabled_modules = patch.enabledModules
  if (patch.ceremonyLocationLabel !== undefined) update.ceremony_location_label = patch.ceremonyLocationLabel
  if (patch.ceremonyTime !== undefined) update.ceremony_time = patch.ceremonyTime
  if (patch.celebrationLocationLabel !== undefined) update.celebration_location_label = patch.celebrationLocationLabel
  if (patch.rsvpDeadline !== undefined) update.rsvp_deadline = patch.rsvpDeadline
  const { error } = await supabase.from('events').update(update).eq('id', id)
  if (error) throw error
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

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await supabase.from('events').delete().eq('id', id)
  if (error) throw error
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
// mientras la fecha no esté confirmada; al confirmarla, el enlace es
// una acción explícita del usuario, nunca automática.
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
// Calendario, actualiza SOLO ese compromiso ya creado — el usuario
// decide cuándo llamarla (mismo "nunca en silencio" que crear el
// enlace la primera vez), no se dispara sola al editar el evento.
export async function updateLinkedCalendarEvent(event: FamilyEvent): Promise<void> {
  if (!event.calendarEventId) return
  if (!event.eventDate) throw new Error('Este evento ya no tiene fecha')
  const allDay = !event.eventTime
  const startAt = allDay ? `${event.eventDate}T00:00:00` : `${event.eventDate}T${event.eventTime}:00`
  const { error } = await supabase
    .from('calendar_events')
    .update({ title: event.title, start_at: startAt, all_day: allDay })
    .eq('id', event.calendarEventId)
  if (error) throw error
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

const PAYMENT_SELECT = 'id, event_id, family_id, provider_id, concept, total_amount, deposit_paid, due_date, status, notes, created_at'

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
// (ver supabase/functions/event-rsvp). El token se genera bajo demanda,
// no al crear el invitado.
// ---------------------------------------------------------------------

function rsvpUrlFromToken(token: string): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  return `${supabaseUrl}/functions/v1/event-rsvp?token=${token}`
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
