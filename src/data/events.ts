// Módulo Eventos (PEPA Events) — capa de datos. Fase 0: motor común +
// tareas. Fase 1: invitados, presupuesto (con gasto real vía etiqueta
// de Economía), menú → traspaso a Compras, proveedores, pagos/fianzas
// y enlace con Calendario al confirmar fecha — ver plan en
// C:\Users\Usuario\.claude\plans\zany-wishing-brook.md.
import { addShoppingItem } from '@/data/shopping'
import { supabase } from '@/data/supabaseClient'
import { listExpenses, listBudgetCategories } from '@/data/finance'
// BUG TAREA-CALENDARIO-01 — reutiliza el mismo mecanismo de asignación
// de miembro que ya usa Calendario (calendar_event_members), nunca uno
// propio de Eventos.
import { replaceEventMembers } from '@/data/calendar'
import { distinctTagColor } from '@/domain/colors'
import { computeAllEventAlerts, EVENT_TYPE_META, generateAutoTasks, type EventAlertInput, type EventAlertSummary, type FoodNeedsAlertInput } from '@/domain/events'
import { reconcilePairGeneration, type DesiredPairGeneration, type ReconcileAction, type ReconcileResult } from '@/domain/eventPairDecisions'
import {
  buildFoodContext,
  dependentFoodKeys,
  desiredDayPlanMoments,
  desiredForFoodKey,
  FOOD_BLOCK_KEY,
  FOOD_MOMENTOS_KEY,
  FOOD_NECESIDADES_KEY,
  foodNeedsAlertInput,
  isAdoptableLegacyBudget,
  isAdoptableLegacyTask,
  LEGACY_BUDGET_CATEGORIES,
  LEGACY_TASK_TITLES,
  reconcileDayPlan,
  type MomentoComidaDef,
  type MomentosComidaAnswer,
} from '@/domain/eventFood'
import { foodMomentKeyFromSource, foodMomentSourceKey, timeKey, type DayPlanPatch } from '@/domain/eventDayPlan'
import { computeFoodNeedsState } from '@/domain/eventDietaryNeeds'
import { deriveOperationalDate } from '@/domain/eventCelebration'
import { calendarEntryFor, calendarRowMatches, planCalendarSync, type CalendarRowState } from '@/domain/eventCalendarSync'
import { isInternalTransferCategory } from '@/domain/finance'
import { showToast } from '@/state/toast'
import type { EventReminder } from '@/domain/reminders'
import type {
  EventActivity,
  EventBudgetItem,
  EventDayPlanItem,
  EventDecision,
  EventDecisionProvider,
  EventDecorationItem,
  EventDecorationStatus,
  EventDietaryCategory,
  EventDietaryKind,
  EventDietaryNeed,
  EventDietarySource,
  EventFavorItem,
  EventFavorStatus,
  EventGiftReceived,
  EventGuest,
  EventGuestInviteScope,
  EventGuestMember,
  EventGuestMemberType,
  EventGuestMoment,
  EventGuestQuestion,
  EventGuestQuestionOption,
  EventGuestRsvpStatus,
  EventFoodDocument,
  EventFoodDocumentKind,
  EventInvitation,
  EventMenuItem,
  EventMenuOption,
  EventMenuOptionAudience,
  EventModuleKey,
  EventMoment,
  EventPayment,
  EventPaymentStatus,
  EventProvider,
  EventSpecialDetail,
  EventSpecialDetailStatus,
  EventTableSeat,
  EventTask,
  EventTemplate,
  EventType,
  EventServiceId,
  EventVenueType,
  FamilyEvent,
  GuestQuestionScope,
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
  'id, family_id, type, subtype, title, date_status, event_date, event_time, venue_label, venue_type, included_services, venue_latitude, venue_longitude, venue_address, venue_place_id, ceremony_location_label, ceremony_location_latitude, ceremony_location_longitude, ceremony_time, celebration_location_label, celebration_location_latitude, celebration_location_longitude, theme, details, enabled_modules, status, tag_id, calendar_event_id, rsvp_deadline, rsvp_deadline_calendar_event_id, open_rsvp_token, created_by, created_at, updated_at'

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
    includedServices: r.included_services,
    venueLatitude: r.venue_latitude,
    venueLongitude: r.venue_longitude,
    venueAddress: r.venue_address,
    venuePlaceId: r.venue_place_id,
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

  // "Comida y bebida" — aviso persistente «ya han confirmado todos y hay necesidades alimentarias». Dos
  // consultas para TODOS los eventos a la vez (necesidades + la decisión de revisión), nunca una por evento.
  const foodEventIds = events.filter((e) => e.enabledModules.includes('invitados')).map((e) => e.id)
  const [foodNeedsRows, foodReviewRows] =
    foodEventIds.length > 0
      ? await Promise.all([
          supabase.from('event_guest_dietary_needs').select(DIETARY_NEED_SELECT).in('event_id', foodEventIds),
          supabase.from('event_decisions').select(DECISION_SELECT).in('event_id', foodEventIds).eq('question_key', FOOD_NECESIDADES_KEY),
        ])
      : [null, null]
  const dietaryNeedsByEvent = new Map<string, EventDietaryNeed[]>()
  for (const row of foodNeedsRows?.data ?? []) {
    const need = mapDietaryNeed(row)
    dietaryNeedsByEvent.set(need.eventId, [...(dietaryNeedsByEvent.get(need.eventId) ?? []), need])
  }
  const reviewByEvent = new Map<string, EventDecision>()
  for (const row of foodReviewRows?.data ?? []) {
    const decision = mapDecision(row)
    reviewByEvent.set(decision.eventId, decision)
  }

  const inputs: EventAlertInput[] = await Promise.all(
    events.map(async (event) => {
      const has = (k: EventModuleKey) => event.enabledModules.includes(k)
      const [guests, tasks, payments, budgetItems] = await Promise.all([
        has('invitados') ? listEventGuests(event.id) : Promise.resolve([]),
        has('tareas') ? listEventTasks(event.id) : Promise.resolve([]),
        has('pagos') ? listEventPayments(event.id) : Promise.resolve([]),
        has('presupuesto') ? listEventBudgetItems(event.id) : Promise.resolve([]),
      ])
      const plannedBudget = budgetItems.reduce((sum, i) => sum + (i.plannedAmount ?? 0), 0)
      const spentBudget =
        event.tagId && has('presupuesto') && expenses && categories
          ? expenses.filter((e) => e.tagId === event.tagId && !e.isIncome && !isInternalTransferCategory(e.category, categories)).reduce((sum, e) => sum + e.amount, 0)
          : null
      // Solo si hay necesidades registradas se piden además las personas (para excluir a quien dijo «no viene»).
      const eventNeeds = dietaryNeedsByEvent.get(event.id) ?? []
      let foodNeeds: EventAlertInput['foodNeeds']
      if (has('invitados') && guests.length > 0 && eventNeeds.length > 0) {
        const members = await listEventGuestMembersForEvent(event.id)
        const reviewDecision = reviewByEvent.get(event.id)
        foodNeeds = foodNeedsAlertInput(computeFoodNeedsState(guests, members, eventNeeds), reviewDecision ? [reviewDecision] : [])
      }
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
        foodNeeds,
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
  // Fase 1 del "inicio inteligente" (2026-09-30) — respuestas del paso 1/2 del alta. Ambas opcionales:
  // un alta que no responde queda con venueType/includedServices en null, exactamente igual que un
  // evento creado antes de esta fase (generateAutoTasks no las usa; generateEventPlan las lee más
  // tarde, bajo demanda, desde el propio evento guardado — ver "Organízamelo Pepa").
  venueType?: EventVenueType | null
  includedServices?: EventServiceId[] | null
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
      venue_type: input.venueType ?? null,
      included_services: input.includedServices ?? null,
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
    venueType: EventVenueType | null
    includedServices: EventServiceId[] | null
    venueLatitude: number | null
    venueLongitude: number | null
    venueAddress: string | null
    venuePlaceId: string | null
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
  if (patch.includedServices !== undefined) update.included_services = patch.includedServices
  if (patch.venueLatitude !== undefined) update.venue_latitude = patch.venueLatitude
  if (patch.venueLongitude !== undefined) update.venue_longitude = patch.venueLongitude
  if (patch.venueAddress !== undefined) update.venue_address = patch.venueAddress
  if (patch.venuePlaceId !== undefined) update.venue_place_id = patch.venuePlaceId
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
    venueType: original.venueType,
    includedServices: original.includedServices,
  })
}

// ---------------------------------------------------------------------
// Preparativos / tareas
// ---------------------------------------------------------------------

const TASK_SELECT = 'id, event_id, family_id, title, done, due_date, source, sort_order, created_at, assigned_member_id, calendar_event_id, decision_id'

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
    assignedMemberId: r.assigned_member_id,
    calendarEventId: r.calendar_event_id,
    decisionId: r.decision_id,
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

export async function addEventTask(eventId: string, title: string, dueDate: string | null = null, decisionId: string | null = null): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase
    .from('event_tasks')
    .insert({ event_id: eventId, family_id: familyId, title: title.trim(), due_date: dueDate, source: decisionId ? 'auto' : 'manual', sort_order: Date.now(), decision_id: decisionId })
  if (error) throw error
}

export async function updateEventTask(
  id: string,
  patch: { title?: string; done?: boolean; dueDate?: string | null; assignedMemberId?: string | null },
): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.title !== undefined) update.title = patch.title.trim()
  if (patch.done !== undefined) update.done = patch.done
  if (patch.dueDate !== undefined) update.due_date = patch.dueDate
  // Fase 6 — responsable de la tarea: nullable, nunca inferido (ver
  // migración 0162_event_task_assignee.sql) — "sin asignar" es un
  // patch explícito a null, igual que quitar la fecha.
  if (patch.assignedMemberId !== undefined) update.assigned_member_id = patch.assignedMemberId
  const { error } = await supabase.from('event_tasks').update(update).eq('id', id)
  if (error) throw error
  // Fase 9/BUG TAREA-CALENDARIO-01 — si la tarea ya está enlazada al
  // Calendario, mantenerlo al día (mismo patrón "safely" que
  // syncEventToCalendarSafely: un fallo aquí nunca deshace el guardado
  // de la tarea, solo avisa). El responsable también dispara la
  // sincronización, no solo título/fecha.
  if (patch.title !== undefined || patch.dueDate !== undefined || patch.assignedMemberId !== undefined) await syncLinkedTaskCalendarEventSafely(id)
}

// BUG TAREA-CALENDARIO-01 — única construcción/sincronización canónica
// EventTask → CalendarEvent para título/fecha/responsable: tanto crear
// el enlace (linkEventTaskToCalendar) como cada edición posterior
// (syncLinkedTaskCalendarEventSafely) pasan por aquí, para que no
// puedan existir dos mapeos distintos que diverjan. El responsable usa
// exactamente la semántica ya existente de Calendario
// (calendar_event_members vacío = "Toda la familia", ver CalendarScreen.tsx) —
// nunca una segunda interpretación propia de Eventos.
async function applyTaskToLinkedCalendarEvent(
  calendarEventId: string,
  task: { title: string; due_date: string; assigned_member_id: string | null },
): Promise<void> {
  const { error } = await supabase.from('calendar_events').update({ title: task.title, start_at: `${task.due_date}T00:00:00` }).eq('id', calendarEventId)
  if (error) throw error
  await replaceEventMembers(calendarEventId, task.assigned_member_id ? [task.assigned_member_id] : [])
}

// Fase 9 — Tarea → Calendario. Mismo patrón ya certificado que
// linkRsvpDeadlineReminder/syncRsvpDeadlineReminder: enlace ESTABLE por
// id (event_tasks.calendar_event_id), nunca se busca por título; la
// propia presencia del id es el estado de "Mostrar en Calendario".
// Devuelve el id del calendar_events enlazado (recién creado o el que
// ya hubiera) — Fase 10 lo necesita para poder guardar el recordatorio
// justo después de activar "Mostrar en Calendario" en el mismo guardado.
export async function linkEventTaskToCalendar(taskId: string): Promise<string> {
  const { data: task, error } = await supabase.from('event_tasks').select('title, due_date, calendar_event_id, assigned_member_id').eq('id', taskId).single()
  if (error) throw error
  if (task.calendar_event_id) return task.calendar_event_id // ya enlazada — idempotente, nunca duplica
  if (!task.due_date) throw new Error('Esta tarea todavía no tiene fecha')
  const familyId = await currentFamilyId()
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  const { data: calendarEvent, error: insertError } = await supabase
    .from('calendar_events')
    .insert({ family_id: familyId, title: task.title, start_at: `${task.due_date}T00:00:00`, all_day: true, created_by: userResult.user.id, visibility: 'shared' })
    .select('id')
    .single()
  if (insertError) throw insertError
  const { error: linkError } = await supabase.from('event_tasks').update({ calendar_event_id: calendarEvent.id }).eq('id', taskId)
  if (linkError) throw linkError
  // BUG TAREA-CALENDARIO-01 — el responsable ya elegido en Eventos debe
  // propagarse desde la primera creación del calendar_event, no solo
  // en ediciones posteriores.
  if (task.assigned_member_id) await replaceEventMembers(calendarEvent.id, [task.assigned_member_id])
  return calendarEvent.id
}

async function unlinkEventTaskCalendarById(taskId: string, calendarEventId: string): Promise<void> {
  const { error } = await supabase.from('calendar_events').delete().eq('id', calendarEventId)
  if (error) throw error
  const { error: unlinkError } = await supabase.from('event_tasks').update({ calendar_event_id: null }).eq('id', taskId)
  if (unlinkError) throw unlinkError
}

export async function unlinkEventTaskFromCalendar(taskId: string): Promise<void> {
  const { data: task, error } = await supabase.from('event_tasks').select('calendar_event_id').eq('id', taskId).single()
  if (error) throw error
  if (!task.calendar_event_id) return
  await unlinkEventTaskCalendarById(taskId, task.calendar_event_id)
}

async function syncLinkedTaskCalendarEventSafely(taskId: string): Promise<void> {
  try {
    const { data, error } = await supabase.from('event_tasks').select('calendar_event_id, title, due_date, assigned_member_id').eq('id', taskId).single()
    if (error) throw error
    if (!data.calendar_event_id) return
    if (!data.due_date) {
      // Sin fecha ya no tiene sentido seguir en el calendario — se desvincula sola.
      await unlinkEventTaskCalendarById(taskId, data.calendar_event_id)
      return
    }
    await applyTaskToLinkedCalendarEvent(data.calendar_event_id, { title: data.title, due_date: data.due_date, assigned_member_id: data.assigned_member_id })
  } catch {
    showToast('⚠️ No se pudo actualizar el calendario de esta tarea')
  }
}

export async function deleteEventTask(id: string): Promise<void> {
  // Fase 9 — si la tarea estaba enlazada al Calendario, limpia también
  // ese compromiso — nunca deja un hueco huérfano en Calendario.
  const { data: linked } = await supabase.from('event_tasks').select('calendar_event_id').eq('id', id).maybeSingle()
  if (linked?.calendar_event_id) await supabase.from('calendar_events').delete().eq('id', linked.calendar_event_id)
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

  // La hora llega de la base de datos como «HH:MM:SS»: calendarEntryFor la normaliza (ver eventCalendarSync).
  const { startAt, allDay } = calendarEntryFor(event.eventDate, event.eventTime)
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
  if (linkError) {
    // Sin enlace el compromiso quedaría huérfano (y el siguiente guardado crearía otro): se deshace.
    await supabase.from('calendar_events').delete().eq('id', calendarEvent.id)
    throw linkError
  }
}

// Cuando la fecha/hora cambia y el evento ya tenía un enlace de
// Calendario, actualiza SOLO ese compromiso ya creado.
export async function updateLinkedCalendarEvent(event: FamilyEvent): Promise<void> {
  if (!event.calendarEventId) return
  if (!event.eventDate) throw new Error('Este evento ya no tiene fecha')
  const { startAt, allDay } = calendarEntryFor(event.eventDate, event.eventTime)
  const { error } = await supabase
    .from('calendar_events')
    .update({ title: event.title, start_at: startAt, all_day: allDay, location_label: event.venueLabel })
    .eq('id', event.calendarEventId)
  if (error) throw error
}

// Quitar la fecha (o «Todavía no lo sabemos»): el compromiso del Calendario se elimina y se limpia el enlace
// (events.calendar_event_id no tiene clave foránea: hay que limpiarlo a mano). Nunca queda una entrada antigua.
async function unlinkEventFromCalendar(event: FamilyEvent, deleteRow: boolean): Promise<void> {
  if (!event.calendarEventId) return
  if (deleteRow) {
    const { error } = await supabase.from('calendar_events').delete().eq('id', event.calendarEventId)
    if (error) throw error
  }
  const { error: linkError } = await supabase.from('events').update({ calendar_event_id: null }).eq('id', event.id)
  if (linkError) throw linkError
}

// Petición real: "definimos por defecto que si se confirma la fecha se apunta
// en el calendario y si se modifica la fecha una vez confirmado se actualiza" —
// ya no hay botones manuales. Con la fecha confirmada: si el evento no está en el
// Calendario se apunta (nota "Fecha anotada en el calendario"), y si ya estaba y
// algo ha cambiado (fecha, hora, título o lugar) se actualiza (nota "Fecha
// actualizada en el calendario"). Sin fecha se retira (nota "Fecha quitada del
// calendario"). Cambiar solo Provisional ↔ Confirmada no escribe nada. Es idempotente:
// guardar dos veces lo mismo no duplica ni falla. Devuelve qué ha pasado, o null si nada.
export type CalendarSyncResult = 'created' | 'updated' | 'removed' | null

const syncing = new Set<string>()

export async function syncEventToCalendar(id: string): Promise<CalendarSyncResult> {
  if (syncing.has(id)) return null
  syncing.add(id)
  try {
    const event = await getEvent(id)

    let rowState: CalendarRowState | null = null
    if (event.calendarEventId) {
      const { data, error } = await supabase
        .from('calendar_events')
        .select('start_at, all_day, title, location_label')
        .eq('id', event.calendarEventId)
        .maybeSingle()
      if (error) throw error
      if (!data) rowState = 'missing'
      else rowState = event.eventDate && calendarRowMatches(data, { ...event, eventDate: event.eventDate }) ? 'matches' : 'differs'
    }

    const action = planCalendarSync({
      archived: event.status === 'archivado',
      eventDate: event.eventDate,
      dateStatus: event.dateStatus,
      linkedId: event.calendarEventId ?? null,
      rowState,
    })
    switch (action) {
      case 'none':
        return null
      case 'update':
        await updateLinkedCalendarEvent(event)
        showToast('📅 Fecha actualizada en el calendario')
        return 'updated'
      case 'create':
        // Un enlace colgando (el compromiso se borró en Calendario) se vuelve a apuntar con uno nuevo.
        await linkEventToCalendar(event)
        showToast('📅 Fecha anotada en el calendario')
        return 'created'
      case 'remove':
        await unlinkEventFromCalendar(event, true)
        showToast('📅 Fecha quitada del calendario')
        return 'removed'
      case 'clear_link':
        await unlinkEventFromCalendar(event, false)
        return null
    }
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
// Fase 14A — personas individuales OPCIONALES dentro de una unidad
// invitada. event_id/family_id se guardan tal cual desde la unidad
// padre (event_guests), nunca se recalculan aquí — la RLS "hardened"
// de la migración 0164 es quien de verdad garantiza que no puedan
// quedar desalineados con guest_id/table_id.
// ---------------------------------------------------------------------

const GUEST_MEMBER_SELECT = 'id, guest_id, event_id, family_id, name, person_type, table_id, sort_order, created_at, rsvp_attending, menu_option_id'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapGuestMember(r: any): EventGuestMember {
  return {
    id: r.id,
    guestId: r.guest_id,
    eventId: r.event_id,
    familyId: r.family_id,
    name: r.name,
    personType: r.person_type,
    tableId: r.table_id,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    rsvpAttending: r.rsvp_attending,
    menuOptionId: r.menu_option_id,
  }
}

export async function listEventGuestMembers(guestId: string): Promise<EventGuestMember[]> {
  const { data, error } = await supabase.from('event_guest_members').select(GUEST_MEMBER_SELECT).eq('guest_id', guestId).order('sort_order', { ascending: true })
  if (error) throw error
  return data.map(mapGuestMember)
}

// Fase 14C también necesita ver TODAS las personas de un evento a la
// vez (para la vista de Mesas, que agrupa por unidad) — sin repetir
// esta consulta base en la capa de datos.
export async function listEventGuestMembersForEvent(eventId: string): Promise<EventGuestMember[]> {
  const { data, error } = await supabase.from('event_guest_members').select(GUEST_MEMBER_SELECT).eq('event_id', eventId).order('sort_order', { ascending: true })
  if (error) throw error
  return data.map(mapGuestMember)
}

export async function addEventGuestMember(
  guest: Pick<EventGuest, 'id' | 'eventId' | 'familyId'>,
  input: { name: string; personType: EventGuestMemberType; tableId?: string | null },
): Promise<void> {
  const { error } = await supabase.from('event_guest_members').insert({
    guest_id: guest.id,
    event_id: guest.eventId,
    family_id: guest.familyId,
    name: input.name.trim(),
    person_type: input.personType,
    table_id: input.tableId ?? null,
    sort_order: Date.now(),
  })
  if (error) throw error
}

export async function updateEventGuestMember(
  id: string,
  patch: Partial<{ name: string; personType: EventGuestMemberType; tableId: string | null }>,
): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.name !== undefined) update.name = patch.name.trim()
  if (patch.personType !== undefined) update.person_type = patch.personType
  if (patch.tableId !== undefined) update.table_id = patch.tableId
  const { error } = await supabase.from('event_guest_members').update(update).eq('id', id)
  if (error) throw error
}

export async function deleteEventGuestMember(id: string): Promise<void> {
  const { error } = await supabase.from('event_guest_members').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------
// Presupuesto — planeado (esta tabla) vs real (expenses filtrado por
// events.tagId desde la propia pantalla, sin duplicar nada de Economía).
// ---------------------------------------------------------------------

const BUDGET_ITEM_SELECT = 'id, event_id, family_id, category, planned_amount, sort_order, created_at, decision_id'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapBudgetItem(r: any): EventBudgetItem {
  return {
    id: r.id,
    eventId: r.event_id,
    familyId: r.family_id,
    category: r.category,
    plannedAmount: r.planned_amount == null ? null : Number(r.planned_amount),
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    decisionId: r.decision_id,
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

export async function addEventBudgetItem(eventId: string, category: string, plannedAmount: number | null, decisionId: string | null = null): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase
    .from('event_budget_items')
    .insert({ event_id: eventId, family_id: familyId, category: category.trim(), planned_amount: plannedAmount, sort_order: Date.now(), decision_id: decisionId })
  if (error) throw error
}

export async function updateEventBudgetItem(id: string, patch: { category?: string; plannedAmount?: number | null }): Promise<void> {
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

const MENU_ITEM_SELECT = 'id, event_id, family_id, name, category, quantity_note, transferred, sort_order, created_at, recipe_id, notes, source, document_id'

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
    recipeId: r.recipe_id ?? null,
    notes: r.notes ?? null,
    source: r.source === 'importado' ? 'importado' : 'manual',
    documentId: r.document_id ?? null,
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

export interface MenuItemExtras {
  recipeId?: string | null
  notes?: string | null
  source?: 'manual' | 'importado'
  documentId?: string | null
}

export async function addEventMenuItem(eventId: string, name: string, category?: string | null, quantityNote?: string | null, extras: MenuItemExtras = {}): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('event_menu_items').insert({
    event_id: eventId,
    family_id: familyId,
    name: name.trim(),
    category: category ?? null,
    quantity_note: quantityNote ?? null,
    sort_order: Date.now(),
    recipe_id: extras.recipeId ?? null,
    notes: extras.notes ?? null,
    source: extras.source ?? 'manual',
    document_id: extras.documentId ?? null,
  })
  if (error) throw error
}

// Inserción en bloque de platos ya REVISADOS por la familia (importación de foto/PDF). Un solo viaje a la base
// de datos; el orden de entrada se conserva con un sort_order creciente.
export async function addEventMenuItemsBulk(
  eventId: string,
  items: { name: string; category: string; notes?: string | null }[],
  source: { documentId: string | null; imported: boolean },
): Promise<number> {
  if (items.length === 0) return 0
  const familyId = await currentFamilyId()
  const base = Date.now()
  const { error } = await supabase.from('event_menu_items').insert(
    items.map((item, index) => ({
      event_id: eventId,
      family_id: familyId,
      name: item.name.trim(),
      category: item.category,
      notes: item.notes ?? null,
      sort_order: base + index,
      source: source.imported ? 'importado' : 'manual',
      document_id: source.documentId,
    })),
  )
  if (error) throw error
  return items.length
}

export async function updateEventMenuItem(
  id: string,
  patch: Partial<{ name: string; category: string | null; notes: string | null; quantityNote: string | null; recipeId: string | null }>,
): Promise<void> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.name !== undefined) update.name = patch.name.trim()
  if (patch.category !== undefined) update.category = patch.category
  if (patch.notes !== undefined) update.notes = patch.notes
  if (patch.quantityNote !== undefined) update.quantity_note = patch.quantityNote
  if (patch.recipeId !== undefined) update.recipe_id = patch.recipeId
  const { error } = await supabase.from('event_menu_items').update(update).eq('id', id)
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

const PROVIDER_SELECT = 'id, event_id, family_id, name, type, contact_note, notes, created_at, decision_id'

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
    decisionId: r.decision_id,
  }
}

export async function listEventProviders(eventId: string): Promise<EventProvider[]> {
  const { data, error } = await supabase.from('event_providers').select(PROVIDER_SELECT).eq('event_id', eventId).order('created_at', { ascending: true })
  if (error) throw error
  return data.map(mapProvider)
}

export async function addEventProvider(
  eventId: string,
  input: { name: string; type?: string | null; contactNote?: string | null; notes?: string | null; decisionId?: string | null },
): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('event_providers').insert({
    event_id: eventId,
    family_id: familyId,
    name: input.name.trim(),
    type: input.type ?? null,
    contact_note: input.contactNote ?? null,
    notes: input.notes ?? null,
    decision_id: input.decisionId ?? null,
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

const DECORATION_SELECT = 'id, event_id, family_id, name, note, status, price_estimate, transferred_to_shopping, sort_order, created_at, decision_id'

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
    decisionId: r.decision_id,
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

export async function addEventDecorationItem(eventId: string, name: string, priceEstimate: number | null = null, decisionId: string | null = null): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase
    .from('event_decoration_items')
    .insert({ event_id: eventId, family_id: familyId, name: name.trim(), price_estimate: priceEstimate, sort_order: Date.now(), decision_id: decisionId })
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

const SPECIAL_DETAIL_SELECT = 'id, event_id, family_id, recipient_name, relationship, detail, budget, status, delivery_note, notes, member_id, created_at'

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
    memberId: r.member_id,
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
  input: { recipientName: string; relationship?: string | null; detail?: string | null; budget?: number | null; memberId?: string | null },
): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('event_special_details').insert({
    event_id: eventId,
    family_id: familyId,
    recipient_name: input.recipientName.trim(),
    relationship: input.relationship ?? null,
    detail: input.detail ?? null,
    budget: input.budget ?? null,
    member_id: input.memberId ?? null,
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

const GIFT_SELECT = 'id, event_id, family_id, guest_name, gift_description, cash_amount, note, member_id, created_at'

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
    memberId: r.member_id,
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
  input: { guestName: string; giftDescription?: string | null; cashAmount?: number | null; note?: string | null; memberId?: string | null },
): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('event_gifts_received').insert({
    event_id: eventId,
    family_id: familyId,
    guest_name: input.guestName.trim(),
    gift_description: input.giftDescription ?? null,
    cash_amount: input.cashAmount ?? null,
    note: input.note ?? null,
    member_id: input.memberId ?? null,
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

const DAY_PLAN_SELECT = 'id, event_id, family_id, item_time, title, note, sort_order, created_at, decision_id, source_key, show_on_share, coincide_ok_time'

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
    decisionId: r.decision_id,
    sourceKey: r.source_key ?? null,
    showOnShare: r.show_on_share ?? true,
    coincideOkTime: r.coincide_ok_time ?? null,
  }
}

export async function listEventDayPlan(eventId: string): Promise<EventDayPlanItem[]> {
  const { data, error } = await supabase
    .from('event_day_plan_items')
    .select(DAY_PLAN_SELECT)
    .eq('event_id', eventId)
    .order('item_time', { ascending: true, nullsFirst: false })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return data.map(mapDayPlanItem)
}

// Crea un momento. Sin hora = null (nunca 00:00). sort_order NO se manda: un trigger de la base de datos lo
// coloca al final (0194). «Mostrar al compartir» nace en SÍ para todos, manuales y generados.
export async function addEventDayPlanItem(
  eventId: string,
  title: string,
  itemTime: string | null,
  note: string | null = null,
  origin: { decisionId: string; sourceKey: string } | null = null,
  showOnShare = true,
): Promise<string> {
  const familyId = await currentFamilyId()
  const { data, error } = await supabase
    .from('event_day_plan_items')
    .insert({
      event_id: eventId,
      family_id: familyId,
      title: title.trim(),
      item_time: timeKey(itemTime),
      note: note?.trim() || null,
      decision_id: origin?.decisionId ?? null,
      source_key: origin?.sourceKey ?? null,
      show_on_share: showOnShare,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

// Edita ESA misma fila en una sola escritura (nombre, hora, nota, visibilidad). decision_id y source_key no se
// tocan jamás aquí: un elemento generado conserva su relación aunque se renombre. Cambiar la hora invalida la
// confirmación de coincidencia (coincide_ok_time = null); editar solo la nota o el nombre no.
export async function updateEventDayPlanItem(id: string, patch: DayPlanPatch): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.title !== undefined) {
    const title = patch.title.trim()
    if (!title) throw new Error('El momento necesita un nombre')
    update.title = title
  }
  if (patch.itemTime !== undefined) {
    update.item_time = timeKey(patch.itemTime)
    update.coincide_ok_time = null
  }
  if (patch.note !== undefined) update.note = patch.note?.trim() || null
  if (patch.showOnShare !== undefined) update.show_on_share = patch.showOnShare
  if (Object.keys(update).length === 0) return
  const { error } = await supabase.from('event_day_plan_items').update(update).eq('id', id)
  if (error) throw error
}

export async function deleteEventDayPlanItem(id: string): Promise<void> {
  const { error } = await supabase.from('event_day_plan_items').delete().eq('id', id)
  if (error) throw error
}

// Reordena de forma atómica (RPC reorder_event_day_plan, 0194): reparte entre estos ids las mismas posiciones, en
// este orden. Sirve para el orden manual de «Sin hora» y para el desempate de varios momentos a la misma hora
// (con confirmCoincidence marca además «sí, coinciden» para la hora de cada uno).
export async function reorderEventDayPlan(ids: string[], confirmCoincidence = false): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase.rpc('reorder_event_day_plan', { p_ids: ids, p_confirm_coincidence: confirmCoincidence })
  if (error) throw error
}

// × sobre un momento que viene de «Comida y bebida». La decisión de origen se actualiza SIEMPRE (el momento deja
// de estar marcado: así no se regenera y el configurador no cree que sigue controlándolo):
//  · 'both'        → además se retira del Plan del día.
//  · 'independent' → se queda en el Plan del día como momento propio (nombre, hora, nota, visibilidad y orden
//                    intactos), ya sin ninguna relación con la decisión.
export async function resolveGeneratedDayPlanItem(item: EventDayPlanItem, mode: 'both' | 'independent'): Promise<void> {
  const momentKey = foodMomentKeyFromSource(item.sourceKey)
  if (!item.decisionId || !momentKey) throw new Error('Este momento no viene de Comida y bebida')
  const { data: row, error: rowError } = await supabase.from('event_decisions').select(DECISION_SELECT).eq('id', item.decisionId).maybeSingle()
  if (rowError) throw rowError
  const decision = row ? mapDecision(row) : null
  const answer = decision?.questionKey === FOOD_MOMENTOS_KEY ? (decision.answer as unknown as MomentosComidaAnswer) : undefined
  if (decision && answer?.choice === 'seleccionar' && (answer.selected as string[]).includes(momentKey)) {
    await upsertEventDecision(item.eventId, {
      blockKey: FOOD_BLOCK_KEY,
      questionKey: FOOD_MOMENTOS_KEY,
      answer: { ...answer, selected: answer.selected.filter((k) => k !== momentKey) } as unknown as Record<string, unknown>,
    })
  }
  if (mode === 'both') {
    await deleteEventDayPlanItem(item.id)
    return
  }
  const { error } = await supabase.from('event_day_plan_items').update({ decision_id: null, source_key: null }).eq('id', item.id)
  if (error) throw error
}

// ---------------------------------------------------------------------
// Fase 1 del modelo genérico de momentos (migración 0176) — infraestructura para la futura Fase 2 de UI.
// Sin UI todavía: nada llama a addEventMoment/setGuestMoments fuera de los tests de esta fase.
// ---------------------------------------------------------------------

const MOMENT_SELECT =
  'id, event_id, family_id, title, moment_date, moment_time, location_label, location_latitude, location_longitude, location_address, location_place_id, sort_order, created_at, date_status'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapMoment(r: any): EventMoment {
  return {
    id: r.id,
    eventId: r.event_id,
    familyId: r.family_id,
    title: r.title,
    momentDate: r.moment_date,
    momentTime: r.moment_time,
    locationLabel: r.location_label,
    locationLatitude: r.location_latitude,
    locationLongitude: r.location_longitude,
    locationAddress: r.location_address,
    locationPlaceId: r.location_place_id,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    dateStatus: r.date_status === 'provisional' || r.date_status === 'confirmada' ? r.date_status : null,
  }
}

export async function listEventMoments(eventId: string): Promise<EventMoment[]> {
  const { data, error } = await supabase.from('event_moments').select(MOMENT_SELECT).eq('event_id', eventId).order('sort_order', { ascending: true })
  if (error) throw error
  return data.map(mapMoment)
}

export async function addEventMoment(
  eventId: string,
  input: {
    title: string
    momentDate?: string | null
    momentTime?: string | null
    locationLabel?: string | null
    locationLatitude?: number | null
    locationLongitude?: number | null
    locationAddress?: string | null
    locationPlaceId?: string | null
    dateStatus?: 'provisional' | 'confirmada' | null
  },
): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('event_moments').insert({
    date_status: input.momentDate ? (input.dateStatus ?? null) : null,
    event_id: eventId,
    family_id: familyId,
    title: input.title.trim(),
    moment_date: input.momentDate ?? null,
    moment_time: input.momentTime ?? null,
    location_label: input.locationLabel ?? null,
    location_latitude: input.locationLatitude ?? null,
    location_longitude: input.locationLongitude ?? null,
    location_address: input.locationAddress ?? null,
    location_place_id: input.locationPlaceId ?? null,
    sort_order: Date.now(),
  })
  if (error) throw error
}

export async function updateEventMoment(
  id: string,
  patch: Partial<{
    title: string
    momentDate: string | null
    momentTime: string | null
    locationLabel: string | null
    locationLatitude: number | null
    locationLongitude: number | null
    locationAddress: string | null
    locationPlaceId: string | null
    dateStatus: 'provisional' | 'confirmada' | null
  }>,
): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.dateStatus !== undefined) update.date_status = patch.dateStatus
  if (patch.title !== undefined) update.title = patch.title.trim()
  if (patch.momentDate !== undefined) update.moment_date = patch.momentDate
  if (patch.momentTime !== undefined) update.moment_time = patch.momentTime
  if (patch.locationLabel !== undefined) update.location_label = patch.locationLabel
  if (patch.locationLatitude !== undefined) update.location_latitude = patch.locationLatitude
  if (patch.locationLongitude !== undefined) update.location_longitude = patch.locationLongitude
  if (patch.locationAddress !== undefined) update.location_address = patch.locationAddress
  if (patch.locationPlaceId !== undefined) update.location_place_id = patch.locationPlaceId
  const { error } = await supabase.from('event_moments').update(update).eq('id', id)
  if (error) throw error
}

// Mantiene events.event_date / date_status (la ÚNICA fecha operativa: calendario, cuenta atrás, tareas...)
// coherente con los momentos — ver deriveOperationalDate en domain/eventCelebration.ts. Sin ningún momento
// fechado no toca nada (conserva la fecha general que ya tuviera el evento). Devuelve true si cambió algo.
export async function syncOperationalDateFromMoments(eventId: string): Promise<boolean> {
  const [event, moments] = await Promise.all([getEvent(eventId), listEventMoments(eventId)])
  const derived = deriveOperationalDate(moments, event.dateStatus)
  if (!derived) return false
  if (derived.eventDate === event.eventDate && derived.dateStatus === event.dateStatus) return false
  await updateEvent(eventId, { eventDate: derived.eventDate, dateStatus: derived.dateStatus })
  // Igual que al cambiar la fecha a mano: las tareas automáticas relativas a la fecha se recalculan.
  if (derived.eventDate !== event.eventDate) await recalculateAutoTasks(eventId, event.type, derived.eventDate)
  return true
}

// Borrado seguro: event_guest_moments.moment_id tiene ON DELETE CASCADE (migración 0176), así que borrar
// un momento nunca deja una relación de invitado colgando de un momento inexistente — no hace falta
// limpiar nada a mano aquí.
export async function deleteEventMoment(id: string): Promise<void> {
  const { error } = await supabase.from('event_moments').delete().eq('id', id)
  if (error) throw error
}

// Reordenación explícita (sin drag&drop — ver auditoría de Eventos): asigna sort_order secuencial según
// el orden del array recibido.
export async function reorderEventMoments(momentIds: string[]): Promise<void> {
  await Promise.all(momentIds.map((id, index) => supabase.from('event_moments').update({ sort_order: index }).eq('id', id)))
}

// ---------------------------------------------------------------------
// Fase 1 del modelo genérico de momentos — invitado <-> momento (sustituirá a EventGuest.inviteScope en
// la Fase 2 de UI). Mismo patrón "reemplazar todo el conjunto" que replaceEventMembers (Calendario).
// ---------------------------------------------------------------------

export async function listEventGuestMoments(eventId: string): Promise<EventGuestMoment[]> {
  const { data, error } = await supabase.from('event_guest_moments').select('id, guest_id, moment_id, event_id, family_id, created_at').eq('event_id', eventId)
  if (error) throw error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return data.map((r: any) => ({ id: r.id, guestId: r.guest_id, momentId: r.moment_id, eventId: r.event_id, familyId: r.family_id, createdAt: r.created_at }))
}

// Sustituye TODO el conjunto de momentos de un invitado por `momentIds` (vacío = sin enlaces explícitos,
// cae al fallback de resolveGuestInvitedMoments). Operación en 2 pasos sin transacción explícita porque
// Supabase/PostgREST no expone una desde el cliente — mismo riesgo ya aceptado hoy por replaceEventMembers.
export async function setGuestMoments(guest: Pick<EventGuest, 'id' | 'eventId' | 'familyId'>, momentIds: string[]): Promise<void> {
  const { error: deleteError } = await supabase.from('event_guest_moments').delete().eq('guest_id', guest.id)
  if (deleteError) throw deleteError
  if (momentIds.length === 0) return
  const { error: insertError } = await supabase
    .from('event_guest_moments')
    .insert(momentIds.map((momentId) => ({ guest_id: guest.id, moment_id: momentId, event_id: guest.eventId, family_id: guest.familyId })))
  if (insertError) throw insertError
}

// ---------------------------------------------------------------------
// Fase 1 del motor de decisiones (migración 0176) — infraestructura. Ningún formulario llama todavía a
// upsertEventDecision/applyDecision fuera de los tests de esta fase: no se genera nada automáticamente.
// ---------------------------------------------------------------------

const DECISION_SELECT = 'id, event_id, family_id, block_key, question_key, answer, is_custom_option, created_by, created_at, updated_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDecision(r: any): EventDecision {
  return {
    id: r.id,
    eventId: r.event_id,
    familyId: r.family_id,
    blockKey: r.block_key,
    questionKey: r.question_key,
    answer: r.answer ?? {},
    isCustomOption: r.is_custom_option,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function listEventDecisions(eventId: string): Promise<EventDecision[]> {
  const { data, error } = await supabase.from('event_decisions').select(DECISION_SELECT).eq('event_id', eventId)
  if (error) throw error
  return data.map(mapDecision)
}

// Crea o actualiza la decisión de esta pregunta (una fila por event_id+questionKey para una pregunta NO
// personalizada; una "+ otra opción" debe llamar con un questionKey propio y único, p. ej.
// `custom:${crypto.randomUUID()}`, para no pisar otras opciones personalizadas del mismo bloque).
export async function upsertEventDecision(
  eventId: string,
  input: { blockKey: string; questionKey: string; answer: Record<string, unknown>; isCustomOption?: boolean },
): Promise<EventDecision> {
  const familyId = await currentFamilyId()
  const { data: existing } = await supabase.from('event_decisions').select(DECISION_SELECT).eq('event_id', eventId).eq('question_key', input.questionKey).maybeSingle()
  if (existing) {
    const { data, error } = await supabase.from('event_decisions').update({ answer: input.answer, updated_at: new Date().toISOString() }).eq('id', existing.id).select(DECISION_SELECT).single()
    if (error) throw error
    return mapDecision(data)
  }
  const { data: userResult } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('event_decisions')
    .insert({
      event_id: eventId,
      family_id: familyId,
      block_key: input.blockKey,
      question_key: input.questionKey,
      answer: input.answer,
      is_custom_option: input.isCustomOption ?? false,
      created_by: userResult.user?.id ?? null,
    })
    .select(DECISION_SELECT)
    .single()
  if (error) throw error
  return mapDecision(data)
}

// Borrado seguro: decision_id en las 5 tablas generables tiene ON DELETE SET NULL (migración 0176), así
// que borrar una decisión nunca borra el elemento que generó — solo deja de "saber" quién lo generó.
export async function deleteEventDecision(id: string): Promise<void> {
  const { error } = await supabase.from('event_decisions').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------
// "👰🤵 La pareja" — relación muchos-a-muchos decisión↔proveedor (migración 0179) y aplicación de lo que
// decide el motor puro de src/domain/eventPairDecisions.ts. Nunca se crea un EventProvider aquí — un
// proveedor real solo lo da de alta la familia desde Proveedores; esta relación solo vincula lo ya
// existente con la decisión que lo necesita.
// ---------------------------------------------------------------------

const DECISION_PROVIDER_SELECT = 'id, decision_id, provider_id, event_id, family_id, created_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDecisionProvider(r: any): EventDecisionProvider {
  return { id: r.id, decisionId: r.decision_id, providerId: r.provider_id, eventId: r.event_id, familyId: r.family_id, createdAt: r.created_at }
}

export async function listDecisionProviders(decisionId: string): Promise<EventDecisionProvider[]> {
  const { data, error } = await supabase.from('event_decision_providers').select(DECISION_PROVIDER_SELECT).eq('decision_id', decisionId)
  if (error) throw error
  return data.map(mapDecisionProvider)
}

export async function linkDecisionProvider(eventId: string, decisionId: string, providerId: string): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('event_decision_providers').insert({ event_id: eventId, family_id: familyId, decision_id: decisionId, provider_id: providerId })
  if (error) throw error
}

export async function unlinkDecisionProvider(id: string): Promise<void> {
  const { error } = await supabase.from('event_decision_providers').delete().eq('id', id)
  if (error) throw error
}

// Ejecuta exactamente lo que reconcilePairGeneration (puro, src/domain/eventPairDecisions.ts) decide para
// esta decisión: como mucho hay una tarea y un concepto de presupuesto por decisión en todo este bloque,
// así que basta con mirar lo que ya existe por decision_id y aplicar la lista de acciones tal cual.
export async function applyPairDecisionGeneration(eventId: string, decisionId: string, desired: DesiredPairGeneration): Promise<ReconcileResult> {
  const familyId = await currentFamilyId()
  const [{ data: tasks, error: tasksError }, { data: budgetItems, error: budgetError }] = await Promise.all([
    supabase.from('event_tasks').select(TASK_SELECT).eq('decision_id', decisionId),
    supabase.from('event_budget_items').select(BUDGET_ITEM_SELECT).eq('decision_id', decisionId),
  ])
  if (tasksError) throw tasksError
  if (budgetError) throw budgetError
  const existingTask = tasks.map(mapTask)[0]
  const existingBudget = budgetItems.map(mapBudgetItem)[0]

  const result = reconcilePairGeneration(desired, existingTask, existingBudget)
  await executeReconcileActions(eventId, familyId, decisionId, result)
  return result
}

// Ejecuta tal cual la lista de acciones que decidió reconcilePairGeneration (puro). Extraído para que la
// adopción de automatismos antiguos de "Comida y bebida" reutilice EXACTAMENTE el mismo ejecutor, sin un
// segundo camino de escritura.
async function executeReconcileActions(eventId: string, familyId: string, decisionId: string, result: ReconcileResult): Promise<void> {
  for (const action of result.actions) {
    switch (action.op) {
      case 'create_task': {
        const { error } = await supabase
          .from('event_tasks')
          .insert({ event_id: eventId, family_id: familyId, title: action.title, source: 'auto', sort_order: Date.now(), decision_id: decisionId })
        if (error) throw error
        break
      }
      case 'update_task': {
        const { error } = await supabase.from('event_tasks').update({ title: action.title }).eq('id', action.id)
        if (error) throw error
        break
      }
      // Resuelto ≠ cancelado (corrección real) — se conserva y se completa, nunca se borra. updateEventTask
      // ya existe y no dispara resincronización de Calendario para un patch de solo "done" (ver su propia
      // condición), así que reutilizarla aquí no tiene efectos secundarios no deseados.
      case 'complete_task': {
        await updateEventTask(action.id, { done: true })
        break
      }
      case 'delete_task': {
        const { error } = await supabase.from('event_tasks').delete().eq('id', action.id)
        if (error) throw error
        break
      }
      case 'detach_task': {
        const { error } = await supabase.from('event_tasks').update({ decision_id: null }).eq('id', action.id)
        if (error) throw error
        break
      }
      case 'create_budget': {
        const { error } = await supabase
          .from('event_budget_items')
          .insert({ event_id: eventId, family_id: familyId, category: action.category, planned_amount: null, sort_order: Date.now(), decision_id: decisionId })
        if (error) throw error
        break
      }
      case 'update_budget': {
        const { error } = await supabase.from('event_budget_items').update({ category: action.category }).eq('id', action.id)
        if (error) throw error
        break
      }
      case 'delete_budget': {
        const { error } = await supabase.from('event_budget_items').delete().eq('id', action.id)
        if (error) throw error
        break
      }
      case 'detach_budget': {
        const { error } = await supabase.from('event_budget_items').update({ decision_id: null }).eq('id', action.id)
        if (error) throw error
        break
      }
    }
  }
}

// ---------------------------------------------------------------------
// "🍽️ Comida y bebida" — adopción de automatismos antiguos + Plan del día (migración 0192 y anteriores).
// ---------------------------------------------------------------------

// Igual que applyPairDecisionGeneration, pero antes de crear nada intenta ADOPTAR un elemento automático
// PRÍSTINO de antes del configurador que signifique lo mismo (p. ej. «Confirmar la tarta» → «Encargar la
// tarta»), para no duplicarlo. Un elemento que la familia ya enriqueció (fecha puesta a mano, responsable,
// importe, hecho...) se protege y no se adopta nunca. Solo se consultan candidatos cuando hay algo que
// adoptar y la decisión todavía no tiene su propio elemento.
export async function applyFoodDecisionGeneration(
  event: Pick<FamilyEvent, 'id' | 'type' | 'eventDate'>,
  questionKey: string,
  decisionId: string,
  desired: DesiredPairGeneration,
): Promise<ReconcileResult> {
  const familyId = await currentFamilyId()
  const [{ data: tasks, error: tasksError }, { data: budgetItems, error: budgetError }] = await Promise.all([
    supabase.from('event_tasks').select(TASK_SELECT).eq('decision_id', decisionId),
    supabase.from('event_budget_items').select(BUDGET_ITEM_SELECT).eq('decision_id', decisionId),
  ])
  if (tasksError) throw tasksError
  if (budgetError) throw budgetError
  let existingTask = tasks.map(mapTask)[0]
  let existingBudget = budgetItems.map(mapBudgetItem)[0]
  let effective = desired

  const wantsWork = Boolean(desired.taskTitle || desired.budgetCategory || desired.resolved)
  if (wantsWork && !existingTask && LEGACY_TASK_TITLES[questionKey]) {
    const { data: candidates, error } = await supabase
      .from('event_tasks')
      .select(TASK_SELECT)
      .eq('event_id', event.id)
      .is('decision_id', null)
      .eq('source', 'auto')
      .eq('done', false)
    if (error) throw error
    const legacy = candidates.map(mapTask).find((t) => isAdoptableLegacyTask(t, questionKey, event))
    if (legacy) {
      const title = desired.taskTitle ?? legacy.title
      const { error: adoptError } = await supabase.from('event_tasks').update({ decision_id: decisionId, title }).eq('id', legacy.id)
      if (adoptError) throw adoptError
      existingTask = { ...legacy, decisionId, title }
    }
  }
  if (desired.budgetCategory && !existingBudget && LEGACY_BUDGET_CATEGORIES[questionKey]) {
    const { data: candidates, error } = await supabase.from('event_budget_items').select(BUDGET_ITEM_SELECT).eq('event_id', event.id).is('decision_id', null).is('planned_amount', null)
    if (error) throw error
    const legacy = candidates.map(mapBudgetItem).find((b) => isAdoptableLegacyBudget(b, questionKey))
    if (legacy) {
      const { error: adoptError } = await supabase.from('event_budget_items').update({ decision_id: decisionId }).eq('id', legacy.id)
      if (adoptError) throw adoptError
      existingBudget = { ...legacy, decisionId }
      // Se conserva el nombre que ya tenía (la familia lo ve igual que siempre), nunca se renombra.
      effective = { ...desired, budgetCategory: legacy.category }
    }
  }

  const result = reconcilePairGeneration(effective, existingTask, existingBudget)
  await executeReconcileActions(event.id, familyId, decisionId, result)
  return result
}

// «Comida y bebida» consume lo que se decide en el primer bloque (qué incluye el lugar, y si es en casa). Cuando
// esas decisiones cambian, lo que dependía de ellas (contratación, menú, tarta, bebidas) se vuelve a
// reconciliar con las MISMAS reglas de siempre (se retira solo lo no tocado; lo enriquecido se conserva).
// Solo toca las decisiones de comida que ya existen; si todavía no hay ninguna, no hace ni una escritura.
export async function reconcileFoodForVenueChange(
  event: Pick<FamilyEvent, 'id' | 'type' | 'eventDate' | 'venueType' | 'venueLabel' | 'venueAddress' | 'venueLatitude' | 'venueLongitude' | 'celebrationLocationLabel' | 'includedServices' | 'enabledModules'>,
  hasMomentLocation: boolean,
): Promise<ReconcileAction[]> {
  const decisions = await listEventDecisions(event.id)
  const ctx = buildFoodContext(event, decisions, [], null, hasMomentLocation)
  const actions: ReconcileAction[] = []
  for (const key of dependentFoodKeys('lugar.servicios_incluidos')) {
    const row = decisions.find((d) => d.questionKey === key)
    if (!row) continue
    const result = await applyFoodDecisionGeneration(event, key, row.id, desiredForFoodKey(key, ctx))
    actions.push(...result.actions)
  }
  // Los momentos de comida del Plan del día dependen de si habrá comida (p. ej. el lugar la incluye o no).
  const momentosRow = decisions.find((d) => d.questionKey === FOOD_MOMENTOS_KEY)
  if (momentosRow && event.enabledModules.includes('plan_dia')) await applyFoodDayPlan(event.id, event.type, momentosRow.id, desiredDayPlanMoments(event.type, ctx))
  return actions
}

// Postgres: violación de unicidad (otro guardado simultáneo ya creó/readoptó ese mismo momento automático).
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
}

// Momentos de comida → Plan del día, SIN hora, por IDENTIDAD ESTABLE (source_key), nunca por el título. Crea los
// marcados que faltan, READOPTA el que se desvinculó antes, retira solo los generados que siguen prístinos y
// desvincula (conserva) los que la familia ya enriqueció. Un momento puesto a mano es independiente. El índice
// único (decisión + clave) impide el duplicado aunque dos guardados coincidan en el tiempo.
export async function applyFoodDayPlan(eventId: string, eventType: EventType, decisionId: string, desired: MomentoComidaDef[]): Promise<{ created: number; removed: number }> {
  const all = await listEventDayPlan(eventId)
  const actions = reconcileDayPlan(eventType, desired, all, decisionId)
  let created = 0
  let removed = 0
  for (const action of actions) {
    if (action.op === 'create') {
      try {
        await addEventDayPlanItem(eventId, action.title, null, null, { decisionId, sourceKey: foodMomentSourceKey(action.key) })
        created += 1
      } catch (err) {
        if (!isUniqueViolation(err)) throw err
      }
    } else if (action.op === 'adopt') {
      const { error } = await supabase.from('event_day_plan_items').update({ decision_id: decisionId }).eq('id', action.id)
      if (error && !isUniqueViolation(error)) throw error
    } else if (action.op === 'delete') {
      await deleteEventDayPlanItem(action.id)
      removed += 1
    } else {
      const { error } = await supabase.from('event_day_plan_items').update({ decision_id: null, source_key: action.sourceKey }).eq('id', action.id)
      if (error) throw error
    }
  }
  return { created, removed }
}

// ---------------------------------------------------------------------
// Opciones de menú para invitados (event_menu_options, 0189 + audience 0192). Borrar una opción NUNCA borra
// la elección de nadie: event_guest_members.menu_option_id es ON DELETE SET NULL.
// ---------------------------------------------------------------------

const MENU_OPTION_SELECT = 'id, event_id, family_id, name, sort_order, created_at, audience'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapMenuOption(r: any): EventMenuOption {
  return {
    id: r.id,
    eventId: r.event_id,
    familyId: r.family_id,
    name: r.name,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    audience: r.audience === 'adultos' || r.audience === 'ninos' ? r.audience : 'todos',
  }
}

export async function listEventMenuOptions(eventId: string): Promise<EventMenuOption[]> {
  const { data, error } = await supabase.from('event_menu_options').select(MENU_OPTION_SELECT).eq('event_id', eventId).order('sort_order', { ascending: true })
  if (error) throw error
  return data.map(mapMenuOption)
}

export async function addEventMenuOption(eventId: string, name: string, audience: EventMenuOptionAudience = 'todos'): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) return
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('event_menu_options').insert({ event_id: eventId, family_id: familyId, name: trimmed, audience, sort_order: Date.now() })
  if (error) throw error
}

export async function updateEventMenuOption(id: string, patch: Partial<{ name: string; audience: EventMenuOptionAudience }>): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.name !== undefined) update.name = patch.name.trim()
  if (patch.audience !== undefined) update.audience = patch.audience
  if (Object.keys(update).length === 0) return
  const { error } = await supabase.from('event_menu_options').update(update).eq('id', id)
  if (error) throw error
}

export async function deleteEventMenuOption(id: string): Promise<void> {
  const { error } = await supabase.from('event_menu_options').delete().eq('id', id)
  if (error) throw error
}

// Cambia el orden intercambiando el sort_order de dos opciones vecinas.
export async function swapEventMenuOptionOrder(a: Pick<EventMenuOption, 'id' | 'sortOrder'>, b: Pick<EventMenuOption, 'id' | 'sortOrder'>): Promise<void> {
  const [first, second] = await Promise.all([
    supabase.from('event_menu_options').update({ sort_order: b.sortOrder }).eq('id', a.id),
    supabase.from('event_menu_options').update({ sort_order: a.sortOrder }).eq('id', b.id),
  ])
  if (first.error) throw first.error
  if (second.error) throw second.error
}

// ---------------------------------------------------------------------
// Documentos de comida (foto/PDF de un menú). El original se conserva siempre.
// ---------------------------------------------------------------------

const FOOD_DOCUMENT_SELECT = 'id, event_id, family_id, kind, storage_path, original_name, mime_type, created_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapFoodDocument(r: any): EventFoodDocument {
  return {
    id: r.id,
    eventId: r.event_id,
    familyId: r.family_id,
    kind: r.kind,
    storagePath: r.storage_path,
    originalName: r.original_name,
    mimeType: r.mime_type,
    createdAt: r.created_at,
  }
}

export async function listEventFoodDocuments(eventId: string): Promise<EventFoodDocument[]> {
  const { data, error } = await supabase.from('event_food_documents').select(FOOD_DOCUMENT_SELECT).eq('event_id', eventId).order('created_at', { ascending: true })
  if (error) throw error
  return data.map(mapFoodDocument)
}

// Se llama solo al CONFIRMAR el guardado de los platos revisados (nunca durante la revisión, para no subir
// archivos que la familia acaba descartando). Ruta bajo la carpeta de la propia familia (política del bucket).
export async function saveEventFoodDocument(eventId: string, file: File, kind: EventFoodDocumentKind): Promise<EventFoodDocument> {
  const familyId = await currentFamilyId()
  const { data: userResult } = await supabase.auth.getUser()
  const prepared = file.type.startsWith('image/') ? await compressImageFile(file) : file
  const ext = prepared.name.split('.').pop() || (prepared.type === 'application/pdf' ? 'pdf' : 'jpg')
  const path = `${familyId}/${eventId}/${crypto.randomUUID()}.${ext}`
  const { error: uploadError } = await supabase.storage.from('event_food_documents').upload(path, prepared)
  if (uploadError) throw uploadError
  const { data, error } = await supabase
    .from('event_food_documents')
    .insert({
      event_id: eventId,
      family_id: familyId,
      kind,
      storage_path: path,
      original_name: file.name.slice(0, 160),
      mime_type: prepared.type || file.type || null,
      created_by: userResult.user?.id ?? null,
    })
    .select(FOOD_DOCUMENT_SELECT)
    .single()
  if (error) {
    // No dejar un archivo huérfano si la fila no se pudo guardar.
    await supabase.storage.from('event_food_documents').remove([path])
    throw error
  }
  return mapFoodDocument(data)
}

export async function getEventFoodDocumentUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('event_food_documents').createSignedUrl(storagePath, 3600)
  if (error) throw error
  return data.signedUrl
}

// ---------------------------------------------------------------------
// Necesidades alimentarias estructuradas (event_guest_dietary_needs, 0192).
// ---------------------------------------------------------------------

const DIETARY_NEED_SELECT = 'id, event_id, family_id, guest_id, member_id, original_text, category, kind, source, created_at, updated_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDietaryNeed(r: any): EventDietaryNeed {
  return {
    id: r.id,
    eventId: r.event_id,
    familyId: r.family_id,
    guestId: r.guest_id,
    memberId: r.member_id,
    originalText: r.original_text,
    category: r.category,
    kind: r.kind,
    source: r.source,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function listEventDietaryNeeds(eventId: string): Promise<EventDietaryNeed[]> {
  const { data, error } = await supabase.from('event_guest_dietary_needs').select(DIETARY_NEED_SELECT).eq('event_id', eventId).order('created_at', { ascending: true })
  if (error) throw error
  return data.map(mapDietaryNeed)
}

export async function addEventDietaryNeed(
  eventId: string,
  input: { guestId: string; memberId: string | null; originalText: string; category: EventDietaryCategory; kind: EventDietaryKind | null; source: EventDietarySource },
): Promise<void> {
  const familyId = await currentFamilyId()
  const { data: userResult } = await supabase.auth.getUser()
  const { error } = await supabase.from('event_guest_dietary_needs').insert({
    event_id: eventId,
    family_id: familyId,
    guest_id: input.guestId,
    member_id: input.memberId,
    original_text: input.originalText.trim().slice(0, 300),
    category: input.category,
    kind: input.kind,
    source: input.source,
    created_by: userResult.user?.id ?? null,
  })
  if (error) throw error
}

// El texto original declarado NUNCA se modifica aquí: solo se puede corregir la clasificación operativa.
export async function updateEventDietaryNeed(id: string, patch: { category?: EventDietaryCategory; kind?: EventDietaryKind | null }): Promise<void> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.category !== undefined) update.category = patch.category
  if (patch.kind !== undefined) update.kind = patch.kind
  const { error } = await supabase.from('event_guest_dietary_needs').update(update).eq('id', id)
  if (error) throw error
}

// Aviso persistente de UN evento (PepaConclusions): undefined si no hay invitados ni necesidades registradas.
export async function loadEventFoodNeedsAlert(eventId: string, guests: EventGuest[]): Promise<FoodNeedsAlertInput | undefined> {
  if (guests.length === 0) return undefined
  const needs = await listEventDietaryNeeds(eventId)
  if (needs.length === 0) return undefined
  const [members, { data: reviewRows }] = await Promise.all([
    listEventGuestMembersForEvent(eventId),
    supabase.from('event_decisions').select(DECISION_SELECT).eq('event_id', eventId).eq('question_key', FOOD_NECESIDADES_KEY),
  ])
  const review = (reviewRows ?? []).map(mapDecision)
  return foodNeedsAlertInput(computeFoodNeedsState(guests, members, needs), review)
}

export async function deleteEventDietaryNeed(id: string): Promise<void> {
  const { error } = await supabase.from('event_guest_dietary_needs').delete().eq('id', id)
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
    // Fase 3 Bloque 3 — bug real reproducido en vivo (mover/zoom una plantilla importada, guardar, reabrir):
    // canvas_json SÍ guarda backgroundOffsetX/Y/backgroundScale (saveEventInvitation serializa el objeto
    // entero), pero esta función los descartaba al leer — el editor siempre veía undefined y caía en sus
    // valores por defecto (0/0/1), perdiendo en silencio el encuadre que el usuario había ajustado.
    canvas: {
      backgroundGradient: canvas?.backgroundGradient ?? '',
      layers: canvas?.layers ?? [],
      backgroundOffsetX: canvas?.backgroundOffsetX,
      backgroundOffsetY: canvas?.backgroundOffsetY,
      backgroundScale: canvas?.backgroundScale,
      // Fase 3 Bloque 5B — mismo cuidado que backgroundOffsetX/Y/backgroundScale arriba (ver el comentario
      // del Bloque 3): sin este campo aquí, la zona de escritura confirmada por el usuario se perdería en
      // silencio al reabrir la invitación, igual que pasó antes con el encuadre del fondo.
      customTextArea: canvas?.customTextArea ?? null,
    },
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

// INV-EDITOR-7 — mismo tope que uploadProductPhoto (data/products.ts): tras comprimir (compressImageFile
// ya reduce a MAX_DIMENSION=1600px/calidad 0.82), este límite solo atrapa casos patológicos — un formato
// que no se pudo recomprimir, por ejemplo.
const MAX_INVITATION_PHOTO_BYTES = 8 * 1024 * 1024

// Foto subida por el usuario para una capa del diseño — mismo patrón
// que member-photos (bucket privado, carpeta por familia, URL firmada).
export async function uploadInvitationPhoto(eventId: string, file: File): Promise<string> {
  // El accept="image/*" del selector de archivo es solo una pista de UI, nunca una validación real —
  // se comprueba aquí también, de verdad, antes de tocar storage (mismo patrón que uploadProductPhoto).
  if (!file.type.startsWith('image/')) throw new Error('Solo se pueden subir imágenes.')
  const familyId = await currentFamilyId()
  const compressed = await compressImageFile(file)
  if (compressed.size > MAX_INVITATION_PHOTO_BYTES) throw new Error('La foto pesa demasiado, incluso comprimida. Prueba con otra.')
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

// ---------------------------------------------------------------------
// "📋 Preguntas a los invitados" (migración 0190) — capacidad genérica, deliberadamente separada de la
// elección de menú (event_menu_options, migración 0189). Solo CRUD de preguntas/opciones desde la app —
// las respuestas a esas preguntas las escribe únicamente el RSVP público (rol de servicio,
// supabase/functions/event-rsvp), nunca desde aquí: no existe ninguna función de escritura de esas
// respuestas en este archivo a propósito.
// ---------------------------------------------------------------------

const GUEST_QUESTION_SELECT = 'id, event_id, family_id, prompt, scope, required, active, sort_order, created_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapGuestQuestion(r: any): EventGuestQuestion {
  return {
    id: r.id,
    eventId: r.event_id,
    familyId: r.family_id,
    prompt: r.prompt,
    scope: r.scope,
    required: r.required,
    active: r.active,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
  }
}

export async function listEventGuestQuestions(eventId: string): Promise<EventGuestQuestion[]> {
  const { data, error } = await supabase.from('event_guest_questions').select(GUEST_QUESTION_SELECT).eq('event_id', eventId).order('sort_order', { ascending: true })
  if (error) throw error
  return data.map(mapGuestQuestion)
}

export async function addEventGuestQuestion(eventId: string, input: { prompt: string; scope: GuestQuestionScope; required: boolean }): Promise<EventGuestQuestion> {
  const familyId = await currentFamilyId()
  const { data, error } = await supabase
    .from('event_guest_questions')
    .insert({ event_id: eventId, family_id: familyId, prompt: input.prompt.trim(), scope: input.scope, required: input.required, sort_order: Date.now() })
    .select(GUEST_QUESTION_SELECT)
    .single()
  if (error) throw error
  return mapGuestQuestion(data)
}

export async function updateEventGuestQuestion(id: string, patch: Partial<{ prompt: string; scope: GuestQuestionScope; required: boolean; active: boolean }>): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.prompt !== undefined) update.prompt = patch.prompt.trim()
  if (patch.scope !== undefined) update.scope = patch.scope
  if (patch.required !== undefined) update.required = patch.required
  if (patch.active !== undefined) update.active = patch.active
  const { error } = await supabase.from('event_guest_questions').update(update).eq('id', id)
  if (error) throw error
}

export async function deleteEventGuestQuestion(id: string): Promise<void> {
  const { error } = await supabase.from('event_guest_questions').delete().eq('id', id)
  if (error) throw error
}

const GUEST_QUESTION_OPTION_SELECT = 'id, question_id, event_id, family_id, label, sort_order, created_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapGuestQuestionOption(r: any): EventGuestQuestionOption {
  return { id: r.id, questionId: r.question_id, eventId: r.event_id, familyId: r.family_id, label: r.label, sortOrder: r.sort_order, createdAt: r.created_at }
}

// Carga todas las opciones del evento de una vez (como listEventGuestMembersForEvent) — la UI de
// organización siempre pinta todas las preguntas juntas, nunca pregunta por pregunta.
export async function listEventGuestQuestionOptionsForEvent(eventId: string): Promise<EventGuestQuestionOption[]> {
  const { data, error } = await supabase
    .from('event_guest_question_options')
    .select(GUEST_QUESTION_OPTION_SELECT)
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data.map(mapGuestQuestionOption)
}

export async function addEventGuestQuestionOption(questionId: string, eventId: string, label: string): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase
    .from('event_guest_question_options')
    .insert({ question_id: questionId, event_id: eventId, family_id: familyId, label: label.trim(), sort_order: Date.now() })
  if (error) throw error
}

// Renombrar una opción YA EXISTENTE conservando su id — una respuesta ya guardada apunta a option_id,
// nunca al texto, así que corregir la etiqueta (p. ej. una errata) nunca invalida ni desvincula ninguna
// respuesta real. Distinto de borrar+crear, que sí perdería esa identidad.
export async function updateEventGuestQuestionOption(id: string, label: string): Promise<void> {
  const { error } = await supabase.from('event_guest_question_options').update({ label: label.trim() }).eq('id', id)
  if (error) throw error
}

export async function deleteEventGuestQuestionOption(id: string): Promise<void> {
  const { error } = await supabase.from('event_guest_question_options').delete().eq('id', id)
  if (error) throw error
}

// Edición de una pregunta ya creada (petición real, validación manual) — antes de permitir quitar una
// opción o cambiar quién responde (scope), hay que saber si YA existen respuestas reales y, si las hay,
// a qué opción concreta apuntan. Solo option_id (nunca guest_id/member_id ni fechas): esto sigue sin ser
// un visor de respuestas, solo el recuento agregado que hace falta para decidir si un cambio es seguro.
export async function getEventGuestQuestionAnswerStats(questionId: string): Promise<{ total: number; answeredOptionIds: string[] }> {
  const { data, error } = await supabase.from('event_guest_question_answers').select('option_id').eq('question_id', questionId)
  if (error) throw error
  const rows = data ?? []
  const answeredOptionIds = Array.from(new Set(rows.map((r) => r.option_id as string | null).filter((x): x is string => !!x)))
  return { total: rows.length, answeredOptionIds }
}
