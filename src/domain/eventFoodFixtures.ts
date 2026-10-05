// Datos de prueba compartidos por los tests de "Comida y bebida" (sin ninguna lógica de la aplicación).
import type {
  EventBudgetItem,
  EventDayPlanItem,
  EventDecision,
  EventDietaryNeed,
  EventGuest,
  EventGuestMember,
  EventMenuItem,
  EventMenuOption,
  EventTask,
  FamilyEvent,
} from '@/domain/types'

export function makeEvent(overrides: Partial<FamilyEvent> = {}): FamilyEvent {
  return {
    id: 'e1',
    familyId: 'f1',
    type: 'cumpleanos',
    subtype: null,
    title: 'Evento de prueba',
    dateStatus: 'confirmada',
    eventDate: '2026-12-20',
    eventTime: null,
    venueLabel: null,
    venueType: null,
    includedServices: null,
    venueLatitude: null,
    venueLongitude: null,
    venueAddress: null,
    venuePlaceId: null,
    ceremonyLocationLabel: null,
    ceremonyLocationLatitude: null,
    ceremonyLocationLongitude: null,
    ceremonyTime: null,
    celebrationLocationLabel: null,
    celebrationLocationLatitude: null,
    celebrationLocationLongitude: null,
    theme: null,
    details: {},
    enabledModules: ['invitados', 'tareas', 'presupuesto', 'menu_compra', 'plan_dia'],
    status: 'planificando',
    tagId: null,
    calendarEventId: null,
    rsvpDeadline: null,
    rsvpDeadlineCalendarEventId: null,
    openRsvpToken: null,
    createdBy: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  } as FamilyEvent
}

export function makeDecision(questionKey: string, answer: Record<string, unknown>, overrides: Partial<EventDecision> = {}): EventDecision {
  return {
    id: `d:${questionKey}`,
    eventId: 'e1',
    familyId: 'f1',
    blockKey: questionKey.split('.')[0],
    questionKey,
    answer,
    isCustomOption: false,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

export function makeTask(overrides: Partial<EventTask> = {}): EventTask {
  return {
    id: 't1',
    eventId: 'e1',
    familyId: 'f1',
    title: 'Tarea',
    done: false,
    dueDate: null,
    source: 'auto',
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00Z',
    assignedMemberId: null,
    calendarEventId: null,
    decisionId: null,
    ...overrides,
  }
}

export function makeBudget(overrides: Partial<EventBudgetItem> = {}): EventBudgetItem {
  return { id: 'b1', eventId: 'e1', familyId: 'f1', category: 'Tarta', plannedAmount: null, sortOrder: 0, createdAt: '2026-01-01T00:00:00Z', decisionId: null, ...overrides }
}

export function makeDayPlanItem(overrides: Partial<EventDayPlanItem> = {}): EventDayPlanItem {
  return { id: 'p1', eventId: 'e1', familyId: 'f1', itemTime: null, title: 'Comida', note: null, sortOrder: 0, createdAt: '2026-01-01T00:00:00Z', decisionId: null, sourceKey: null, showOnShare: true, coincideOkTime: null, ...overrides }
}

export function makeGuest(overrides: Partial<EventGuest> = {}): EventGuest {
  return {
    id: 'g1',
    eventId: 'e1',
    familyId: 'f1',
    displayName: 'Ana',
    adultsCount: 1,
    childrenCount: 0,
    notes: null,
    inviteScope: null,
    rsvpStatus: 'pendiente',
    rsvpAdultsCount: null,
    rsvpChildrenCount: null,
    rsvpNote: null,
    rsvpTokenActive: true,
    rsvpRespondedAt: null,
    tableId: null,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

export function makeMember(overrides: Partial<EventGuestMember> = {}): EventGuestMember {
  return {
    id: 'm1',
    guestId: 'g1',
    eventId: 'e1',
    familyId: 'f1',
    name: 'Ana',
    personType: 'adulto',
    tableId: null,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00Z',
    rsvpAttending: null,
    menuOptionId: null,
    ...overrides,
  }
}

export function makeMenuItem(overrides: Partial<EventMenuItem> = {}): EventMenuItem {
  return {
    id: 'i1',
    eventId: 'e1',
    familyId: 'f1',
    name: 'Paella',
    category: null,
    quantityNote: null,
    transferred: false,
    preparedBy: null,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00Z',
    recipeId: null,
    notes: null,
    source: 'manual',
    documentId: null,
    ...overrides,
  }
}

export function makeOption(overrides: Partial<EventMenuOption> = {}): EventMenuOption {
  return { id: 'o1', eventId: 'e1', familyId: 'f1', name: 'Carne', sortOrder: 0, createdAt: '2026-01-01T00:00:00Z', audience: 'todos', ...overrides }
}

export function makeNeed(overrides: Partial<EventDietaryNeed> = {}): EventDietaryNeed {
  return {
    id: 'n1',
    eventId: 'e1',
    familyId: 'f1',
    guestId: 'g1',
    memberId: null,
    originalText: 'alergia a las nueces',
    category: 'frutos_secos',
    kind: 'alergia',
    source: 'organizador',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}
