import { type CSSProperties, FormEvent, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import eventosHeaderImg from '@/assets/eventos/eventos-header.jpg'
import pepaFaceReference from '@/assets/brand/references/pepa-face-reference-official.jpg'
import { SectionBreadcrumb, type BreadcrumbLevel } from '@/ui/SectionBreadcrumb'
import { useSectionHome, useLocationFlag } from '@/ui/useSectionHome'
import { questionIsVisible, useConfiguratorQuestionFocus, type ConfiguratorFocusRequest } from '@/ui/useConfiguratorQuestionFocus'
import { computeConfiguratorSummary, type ConfiguratorQuestionRef, type ConfiguratorSummary } from '@/domain/eventConfiguratorSummary'
import {
  desiredForEspecialComplementosPorPersona,
  desiredForEspecialRegalos,
  ESPECIAL_COMPLEMENTOS_CATALOG,
  ESPECIAL_COMPLEMENTOS_QUESTION_KEY,
  ESPECIAL_HAY_QUESTION_KEY,
  ESPECIAL_REGALOS_QUESTION_KEY,
  ESPECIAL_ROLE_SUGGESTIONS,
  ESPECIAL_VESTIMENTA_QUESTION_KEY,
  FAMILIARES_NECESIDAD_OPTIONS,
  FAMILIARES_NECESIDADES_QUESTION_KEY,
  FAMILIARES_PARENTESCO_OPTIONS,
  listEspecialBlockQuestions,
  listFamiliaresBlockQuestions,
  normalizeComplementosAnswer,
  resolveEspecialScopePersonIds,
  suggestGuestMatches,
  summarizeEspecialBlock,
  summarizeFamiliaresBlock,
  type ComplementoPersonaAsignacion,
  type ComplementosEspecialesAnswer,
  type FamiliaresNecesidadesAnswer,
  type GrupoAlcanceChoice,
  type GuestMatchCandidate,
  type HayPersonasAnswer,
  type HayPersonasChoice,
  type RegalosEspecialesAnswer,
  type VestimentaCoordinadaAnswer,
} from '@/domain/eventSpecialPeople'
import { addEventRolePerson, deleteEventRolePerson, listEventRolePeople, updateEventRolePerson } from '@/data/eventSpecialPeople'
import type { EventRolePerson } from '@/domain/types'

const NONE_ESPECIAL: DesiredPairGeneration = { taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false, groupKind: null, groupDefaultName: null }
import {
  addEventActivity,
  addEventBudgetItem,
  addEventDecorationItem,
  addEventFavorItem,
  addEventGift,
  addEventGuest,
  addEventGuestMember,
  addEventGuestQuestion,
  addEventGuestQuestionOption,
  addEventMenuItem,
  addEventMoment,
  addEventPayment,
  addEventProvider,
  addEventSpecialDetail,
  addEventTable,
  addEventTask,
  addEnabledModules,
  archiveEvent,
  linkEventTaskToCalendar,
  unlinkEventTaskFromCalendar,
  assignGuestTable,
  createEvent,
  deleteEvent,
  deleteEventActivity,
  deleteEventTemplate,
  deleteEventBudgetItem,
  deleteEventDecision,
  deleteEventDecorationItem,
  deleteEventFavorItem,
  deleteEventGift,
  deleteEventGuest,
  deleteEventGuestMember,
  deleteEventGuestQuestion,
  deleteEventGuestQuestionOption,
  deleteEventMoment,
  deleteEventPayment,
  deleteEventSpecialDetail,
  deleteEventTable,
  deleteEventTask,
  disableEventOpenLink,
  duplicateEvent,
  getEventGuestQuestionAnswerStats,
  getEventInvitation,
  getEventOpenRsvpUrl,
  getGuestRsvpUrl,
  getInvitationPhotoUrl,
  syncEventToCalendar,
  linkPaymentReminder,
  syncRsvpDeadlineReminder,
  listEventActivities,
  listEventBudgetItems,
  listEventDayPlan,
  listEventDecorationItems,
  listEventFavorItems,
  listEventGifts,
  listEventGuestMembers,
  listEventGuestMembersForEvent,
  listEventGuestMoments,
  listEventGuestQuestionOptionsForEvent,
  listEventGuestQuestions,
  listEventGuests,
  listEventMenuItems,
  listEventMoments,
  setGuestMoments,
  listEventPayments,
  listEventDecisions,
  upsertEventDecision,
  applyPairDecisionGeneration,
  applyPairDecisionGenerationPerPerson,
  listDecisionProviders,
  linkDecisionProvider,
  unlinkDecisionProvider,
  listEventProviders,
  listEventSpecialDetails,
  listEventTables,
  listEventTasks,
  listEvents,
  listEventTemplates,
  recalculateAutoTasks,
  regenerateEventOpenRsvpUrl,
  regenerateGuestRsvpUrl,
  reorderEventMoments,
  saveEventTemplate,
  transferActivityMaterialsToShopping,
  transferDecorationItemToShopping,
  unarchiveEvent,
  updateEvent,
  updateEventDecorationItem,
  updateEventFavorItem,
  updateEventGuest,
  updateEventGuestMember,
  updateEventGuestQuestion,
  updateEventGuestQuestionOption,
  updateEventBudgetItem,
  updateEventMoment,
  updateEventPayment,
  updateEventSpecialDetail,
  updateEventTask,
  reconcileFoodForVenueChange,
  syncOperationalDateFromMoments,
  addEventMenuOption,
  applyFoodDayPlan,
  applyFoodDecisionGeneration,
  deleteEventMenuOption,
  listEventDietaryNeeds,
  listEventMenuOptions,
  loadEventFoodNeedsAlert,
  swapEventMenuOptionOrder,
  updateEventMenuOption,
  ensureTaskPrioritySuggestions,
  listOpenEventTaskPrioritySuggestions,
  respondToEventTaskPrioritySuggestion,
  countMenuOptionChoices,
} from '@/data/events'
import { listExpenses, listBudgetCategories } from '@/data/finance'
import { listFamilyMembers } from '@/data/family'
// "En casa" (lugar.contexto) → proponer la Casa familiar ya guardada en Ubicación — reutiliza tal cual
// listPlaces() (RLS ya limita a la familia actual, mismo patrón que el resto de esta pantalla) y
// reverseGeocode() (misma función ya usada por LocationPickerModal al tocar/arrastrar el mapa, nunca un
// segundo flujo de geocodificación). Nunca se escribe en location_places desde Eventos.
import { listPlaces } from '@/data/location'
import { reverseGeocode } from '@/services/geocoding'
import type { LocationPlace } from '@/domain/types'
// Fase 10 — reutiliza el mismo almacén de recordatorios que ya usa
// Calendario (calendar_event_reminders) en vez de crear uno propio de
// Eventos; no toca push/cron/service worker, solo configura qué debe
// avisar el pipeline ya existente.
import { listEventReminders, replaceReminders } from '@/data/calendar'
import { addEventHelper, countHelperAssignments, deleteEventHelper, listEventHelpers, setEventTaskHelpers, setEventTaskResponsibles, updateEventHelper } from '@/data/eventTaskResponsibles'
import {
  addEventTaskGroup,
  addEventTaskGroupOffer,
  addEventTaskGroupOfferItem,
  addLooseTaskGroupOffer,
  countTasksInGroup,
  deleteEventTaskGroup,
  deleteEventTaskGroupOffer,
  deleteEventTaskGroupOfferItem,
  getEventTaskGroupOfferAttachmentUrl,
  linkLooseTaskGroupOfferToGroup,
  listEventTaskGroupOfferItems,
  listEventTaskGroupOffers,
  listEventTaskGroups,
  listLooseOffersForEvent,
  listLooseOffersForProvider,
  renameEventTaskGroup,
  resolveEventTaskGroup,
  saveEventTaskGroupOfferAttachment,
  selectEventTaskGroupOffer,
  setEventTaskGroup,
  setEventTaskGroupOfferItemSelected,
  setEventTaskGroupOfferStatus,
  updateEventTaskGroupOffer,
  updateEventTaskGroupOfferItem,
} from '@/data/eventTaskGroups'
import { buildTaskGroupRenderItems } from '@/domain/eventTaskGroupDisplay'
import { suggestNextStepsForGroup, suggestNextStepsForTask, type NextStepSuggestion } from '@/domain/eventNextSteps'
import type { EventTaskGroupOffer, EventTaskGroupOfferItem, EventTaskGroupOfferStatus, EventTaskGroupResolutionMethod } from '@/domain/types'
import { PRIORITY_LABELS, taskResponsibleNames } from '@/domain/eventTaskResponsibles'
import { effectivePriority, recommendTasks, type DecisionLookup } from '@/domain/eventTaskPriority'
import { explainPrioritySuggestion, PRIORITY_ORDER } from '@/domain/eventTaskPrioritySuggestion'
import type { EventTaskPrioritySuggestion } from '@/domain/types'
import {
  NO_RESPONSIBLE_KEY,
  taskMatchesResponsibleFilter,
  toggleResponsibleFilterKey,
  taskReminderSelectionFrom,
  toggledPresetReminders,
  remindersFromSelection,
  hasAnyReminder,
  type ReminderPresetKey,
} from '@/domain/eventTaskFilters'
import { REMINDER_UNIT_OPTIONS, reminderLabel, reminderMinutesFrom, unitAndAmountFromMinutes, type EventReminder, type ReminderUnit } from '@/domain/reminders'
import { isInternalTransferCategory } from '@/domain/finance'
import { errorMessage } from '@/domain/errorMessage'
import {
  addProviderGlobal,
  countProviderGlobalEventLinks,
  linkProviderGlobalToEvent,
  listEventProviderLinks,
  listProvidersGlobal,
  setEventProviderLinkStatus,
  unlinkProviderFromEvent,
  updateProviderGlobal,
} from '@/data/providersGlobal'
import {
  buildMapsUrl,
  CELEBRATION_SUBTYPES,
  computeEventConclusions,
  computeEventHealth,
  computeEventStatusSummary,
  computeGuestBreakdownStatus,
  computeGuestSeatingStatus,
  computeTableOccupancy,
  countPaymentAlerts,
  daysUntil,
  DUAL_LOCATION_EVENT_TYPES,
  type EventConclusion as EventConclusionType,
  EVENT_MODULES,
  EVENT_TYPES,
  EVENT_TYPE_META,
  eventDateLine,
  eventLocationLines,
  eventLocationMapLines,
  eventPlanningConfiguratorTitle,
  EVENT_SERVICE_META,
  type EventHealthLevel,
  generateEventPlan,
  hasRealMoments,
  INVITATION_TEMPLATES,
  isOverdueTask,
  isToday,
  momentsLocationLines,
  momentsLocationMapLines,
  RECOMMENDED_MODULES,
  resolveEventMoments,
  resolveGuestInvitedMoments,
  sortInvitationTemplatesForEvent,
} from '@/domain/events'
import { loadConfiguratorOpen, loadStoredConfiguratorOpen, saveConfiguratorOpen } from '@/state/eventPlanningConfiguratorState'
import {
  ALIANZAS_QUESTION_KEY,
  BUDGET_UPDATED_MESSAGE,
  COMPLEMENTOS_OPTIONS,
  describeEffects,
  DETALLE_ESPECIAL_QUESTION_KEY,
  DETALLE_ESPECIAL_RESOLUCION_QUESTION_KEY,
  desiredForAlianzas,
  desiredForComplementos,
  desiredForDetalleEspecialResolucion,
  desiredForFloral,
  desiredForPeluqueriaResolucion,
  desiredForVestuarioResolucion,
  type DesiredPairGeneration,
  floralItemSelected,
  floralItemsForSlot,
  hasFloralActivity,
  listPairBlockQuestions,
  pairQuestionKey,
  partnerName,
  PARTNER_ROLE_OPTIONS,
  PARTNER_SLOTS,
  type PartnerRole,
  type ReconcileAction,
  summarizePairBlock,
  TASK_COMPLETED_AND_BUDGET_UPDATED_MESSAGE,
  TASK_COMPLETED_MESSAGE,
  withFloralSelected,
  type AlianzasAnswer,
  type AlianzasChoice,
  type ComplementosAnswer,
  type ComplementosChoice,
  type CustomAction,
  type CustomHasCost,
  type CustomResolution,
  type DetalleEspecialResolucionAnswer,
  type DetalleEspecialResolucionChoice,
  type DetalleEspecialTipoAnswer,
  type DetalleEspecialTipoChoice,
  type FloralAnswer,
  type FloralChoice,
  type FloralItemKey,
  type PartnerSlot,
  type PeluqueriaNecesidadAnswer,
  type PeluqueriaNecesidadChoice,
  type PeluqueriaResolucionAnswer,
  type PeluqueriaResolucionChoice,
  type VestuarioResolucionAnswer,
  type VestuarioResolucionChoice,
  type VestuarioTipoAnswer,
  type VestuarioTipoChoice,
} from '@/domain/eventPairDecisions'
import {
  desiredForInvitacion,
  desiredForInvitadosPreguntas,
  desiredForListaInvitados,
  desiredForNinosNecesidadItem,
  effectiveWantsMenu,
  guestsNinosNecesidadItemKey,
  GUESTS_INVITACION_QUESTION_KEY,
  GUESTS_LISTA_QUESTION_KEY,
  GUESTS_PREGUNTAS_QUESTION_KEY,
  GUESTS_MOMENTOS_QUESTION_KEY,
  GUESTS_NINOS_NECESIDADES_QUESTION_KEY,
  GUESTS_NINOS_QUESTION_KEY,
  listGuestsBlockQuestions,
  NINOS_NECESIDAD_ACCIONABLE,
  NINOS_NECESIDADES_OPTIONS,
  summarizeGuestsBlock,
  type InvitacionAnswer,
  type InvitacionChoice,
  type InvitadosPreguntasAnswer,
  type InvitadosPreguntasChoice,
  type ListaInvitadosAnswer,
  type ListaInvitadosChoice,
  type MomentosAnswer,
  type MomentosChoice,
  type NinosAnswer,
  type NinosChoice,
  type NinosNecesidadesAnswer,
  type NinosNecesidadItemKey,
} from '@/domain/eventGuestDecisions'
import { LUGAR_CONTEXTO_QUESTION_KEY, type LugarContextoAnswer, type LugarContextoChoice } from '@/domain/eventLocationContext'
import {
  DATE_CHOICES,
  DATE_FIELD_LABEL,
  DATE_STATUS_QUESTION,
  dateDraftFromSaved,
  dateDraftToPatch,
  isDateDraftDirty,
  MISSING_STATUS_MESSAGE,
  REMOVE_DATE_CONFIRM,
  REMOVE_DATE_LABEL,
  TIME_FIELD_LABEL,
  validateDateDraft,
  type DateChoice,
  type DateDraft,
} from '@/domain/eventDateForm'
import {
  ageTurning,
  CELEBRATION_BLOCK_KEY,
  CELEBRATION_DATE_QUESTION_KEY,
  celebrationBlockTitle,
  dateStatusLabel,
  dateWithStatusLabel,
  listCelebrationQuestions,
  momentDateStatus,
  summarizeCelebrationBlock,
} from '@/domain/eventCelebration'
import {
  CANCION_PRIMER_BAILE_QUESTION_KEY,
  CLASES_BAILE_QUESTION_KEY,
  desiredForCancionPrimerBaile,
  desiredForClasesBaile,
  listMomentosEspecialesBlockQuestions,
  MOMENTOS_ESPECIALES_CATALOG,
  MOMENTOS_ESPECIALES_QUESTION_KEY,
  summarizeMomentosEspecialesBlock,
  type CancionPrimerBaileAnswer,
  type CancionPrimerBaileChoice,
  type ClasesBaileAnswer,
  type ClasesBaileChoice,
  type MomentoEspecialCatalogItem,
  type MomentoEspecialKey,
  type MomentosEspecialesAnswer,
} from '@/domain/eventSpecialMoments'
import { notifyEventMomentsChanged, useEventMomentsChangeSignal } from '@/state/eventMomentsSync'
import { showToast } from '@/state/toast'
import {
  buildFoodContext,
  contratacionApplies,
  cooksThemselves,
  dependentFoodKeys,
  desiredDayPlanMoments,
  desiredForFoodKey,
  FOOD_BEBIDAS_KEY,
  FOOD_BLOCK_KEY,
  FOOD_CONTRATACION_KEY,
  FOOD_MENU_ESTADO_KEY,
  FOOD_MENU_GUARDAR_KEY,
  FOOD_MENU_INFANTIL_GUARDAR_KEY,
  FOOD_MENU_INFANTIL_KEY,
  FOOD_MOMENTOS_KEY,
  FOOD_NECESIDADES_KEY,
  FOOD_QUIEN_KEY,
  FOOD_TARTA_KEY,
  foodWillExist,
  guestsChooseMenu,
  includedByVenueLines,
  listFoodBlockQuestions,
  menuEstadoAnswer,
  MOMENTOS_COMIDA_CATALOG,
  momentosComidaAnswer,
  momentRecoveryPrompt,
  type DayPlanResolution,
  type MomentRecoveryPrompt,
  ninosNeedMenuInfantil,
  quienAnswer,
  quienApplies,
  summarizeFoodBlock,
  tartaContradiction,
  venueIncludes,
  type BebidasAnswer,
  type BebidasChoice,
  type ContratacionAnswer,
  type ContratacionChoice,
  type GuardarMenuAnswer,
  type GuardarMenuChoice,
  type MenuEstadoChoice,
  type MenuInfantilAnswer,
  type MenuInfantilChoice,
  type MomentoComidaDef,
  type MomentosComidaAnswer,
  type NecesidadesAnswer,
  type QuienAnswer,
  type QuienChoice,
  type QuienWay,
  type TartaAnswer,
  type TartaChoice,
} from '@/domain/eventFood'
import {
  buildFoodDecisionSummary,
  buildCelebrationDecisionSummary,
  buildPairDecisionSummary,
  buildGuestsDecisionSummary,
  buildMomentosEspecialesDecisionSummary,
  buildEspecialDecisionSummary,
  buildFamiliaresDecisionSummary,
  buildMusicaFiestaDecisionSummary,
  buildFotosRecuerdosDecisionSummary,
  buildOtrosDecoracionDecisionSummary,
  mergeTipoResolucionPairs,
  type DecisionSummary,
  type DecisionSummaryItem,
} from '@/domain/eventDecisionsSummary'
import {
  listMusicaFiestaBlockQuestions,
  summarizeMusicaFiestaBlock,
  desiredForMusica,
  desiredForAnimacion,
  MUSICA_FIESTA_BLOCK_KEY,
  MUSICA_QUESTION_KEY,
  MUSICA_EXTRA_CONFIRM_QUESTION_KEY,
  MUSICA_CATALOG,
  ANIMACION_QUESTION_KEY,
  ANIMACION_CATALOG,
  type MusicaAnswer,
  type MusicaExtraConfirmAnswer,
  type MusicaExtraConfirmChoice,
  type AnimacionAnswer,
  type AnimacionChoice,
} from '@/domain/eventMusicaFiesta'
import {
  listFotosRecuerdosBlockQuestions,
  summarizeFotosRecuerdosBlock,
  desiredForCoberturaFotos,
  desiredForSesionFotos,
  desiredForVideo,
  normalizeCoberturaFotosAnswer,
  FOTOS_RECUERDOS_BLOCK_KEY,
  COBERTURA_FOTOS_QUESTION_KEY,
  COBERTURA_FOTOS_CATALOG,
  SESION_FOTOS_QUESTION_KEY,
  VIDEO_QUESTION_KEY,
  type CoberturaFotosAnswer,
  type CoberturaFotosKey,
  type SesionFotosAnswer,
  type SesionFotosChoice,
  type SesionFotosQuien,
  type VideoAnswer,
  type VideoChoice,
} from '@/domain/eventFotosRecuerdos'
import {
  listOtrosDecoracionBlockQuestions,
  summarizeOtrosDecoracionBlock,
  desiredForDecoracionOrganizacion,
  desiredForDecoracionExtraConfirm,
  OTROS_DECORACION_BLOCK_KEY,
  DECORACION_EXTRA_CONFIRM_QUESTION_KEY,
  DECORACION_ORGANIZACION_QUESTION_KEY,
  DECORACION_ZONAS_QUESTION_KEY,
  DECORACION_ZONAS_CATALOG,
  OTRAS_NECESIDADES_QUESTION_KEY,
  type DecoracionExtraConfirmAnswer,
  type DecoracionExtraConfirmChoice,
  type DecoracionOrganizacionAnswer,
  type DecoracionOrganizacionChoice,
  type DecoracionZonasAnswer,
  type OtraNecesidadItem,
  type OtrasNecesidadesAnswer,
} from '@/domain/eventOtrosDecoracion'
import {
  effectiveVenueServicesAnswer,
  legacyOnlyServiceLabels,
  resolveVenueCase,
  toggleVenueService,
  venueIncludesService,
  VENUE_SERVICES,
  VENUE_SERVICES_BLOCK_KEY,
  VENUE_SERVICES_QUESTION_KEY,
  venueServiceIdsForPlan,
  venueServiceLabel,
  venueServicesFromLegacy,
  venueServicesQuestionLabel,
  withVenueServiceCustomItems,
  withVenueServicesNinguno,
  withVenueServicesUnknown,
  type VenueServicesAnswer,
} from '@/domain/eventVenueServices'
import {
  computeFoodNeedsState,
  needsReviewApplies,
} from '@/domain/eventDietaryNeeds'
import {
  alreadyRespondedMessage,
  guestsRespondedWithoutMenuChoice,
  guestsWithoutMembers,
  MENU_OPTION_AUDIENCES,
  sectionKeyForCategory,
} from '@/domain/eventFoodMenu'
import type { EventDietaryNeed, EventHelper, EventMenuOption, EventMenuOptionAudience, EventTaskGroup } from '@/domain/types'
// Fase 8 — reutiliza el formateador DD/MM/YYYY que ya existe en
// Previsión (Economía) en vez de escribir uno nuevo para Eventos; es
// una función pura sin ninguna dependencia de Previsión/Economía.
import { formatSpanishDate } from '@/domain/forecastInstallmentPlanForm'
import { pastelPalette, paletteByName } from '@/domain/colors'
import { listShoppingItems } from '@/data/shopping'
import type {
  EventActivity,
  EventBudgetItem,
  EventDayPlanItem,
  EventDecision,
  EventDecisionProvider,
  EventDecorationItem,
  EventFavorItem,
  EventGiftReceived,
  EventGuest,
  EventGuestInviteScope,
  EventGuestMember,
  EventGuestMemberType,
  EventGuestMoment,
  EventGuestQuestion,
  EventGuestQuestionOption,
  EventGuestRsvpStatus,
  EventInvitation,
  EventMenuItem,
  EventModuleKey,
  EventMoment,
  EventPayment,
  EventPaymentStatus,
  EventProvider,
  EventProviderLink,
  EventProviderLinkStatus,
  EventServiceId,
  ProviderGlobal,
  EventSpecialDetail,
  EventTableSeat,
  EventTask,
  EventTemplate,
  EventType,
  FamilyEvent,
  FamilyMember,
  GuestQuestionScope,
  ShoppingItem,
  InvitationCanvas,
} from '@/domain/types'
import { canShareFiles, shareFiles, shareText } from '@/services/share'
import { downloadTextFile } from '@/services/exportFile'
import { buildVcf } from '@/domain/vcardParser'
import { analyzeProviderContactDocument, type ProviderContactScanResult } from '@/services/providerContactDocument'
import { analyzeOfferBudgetDocument, type OfferBudgetScanItem, type OfferBudgetScanResult } from '@/services/offerBudgetDocument'
import { exportInvitationImage } from '@/services/invitationExport'
import { ConfirmButton, ConfirmIconButton } from '@/ui/ConfirmButton'
import { FileOrPdfPicker } from '@/ui/FileOrPdfPicker'
import { ChoiceRow } from '@/ui/ChoiceRow'
import { DayPlanSection } from '@/ui/EventDayPlan'
import { EventMenuSection } from '@/ui/EventMenu'
import { RecoverMomentDialog } from '@/ui/RecoverMomentDialog'
import { ShareFallbackModal } from '@/ui/ShareFallbackModal'
import { LocationPickerModal } from '@/ui/LocationPickerModal'
import { GuestExportModal } from '@/ui/GuestExportModal'
import { InvitationBackground, InvitationCanvasEditor, InvitationCanvasView, InvitationTemplatePicker } from '@/ui/InvitationDesigner'
import { getInvitationEventDataChanges, invitationHasTrackedEventData } from '@/domain/invitationAutoCompose'

// Módulo Eventos (PEPA Events) — plan aprobado en
// C:\Users\Usuario\.claude\plans\zany-wishing-brook.md.
// Fase 0: motor común configurable + tareas. Fase 1: invitados,
// presupuesto (con gasto real de Economía vía etiqueta), menú →
// traspaso a Compras, ceremonia/ubicaciones, proveedores, pagos/
// fianzas y enlace con Calendario. Fase 2: invitaciones + RSVP público.
// Fase 3: decoración, actividades, mesas, detalles/recuerdos, regalos
// recibidos, plan del día, modo "día del evento" y conclusiones PEPA.

// Fase 7 — el emoji es presentación pura (vive aquí, no en domain/events.ts).
const EVENT_HEALTH_EMOJI: Record<EventHealthLevel, string> = {
  danger: '🔴',
  warning: '🟠',
  progress: '🟡',
  good: '🟢',
}

// Ceremonia (dos ubicaciones) solo tiene sentido en estos tipos —
// aunque el módulo esté activado, en otros tipos no se muestra.
// (DUAL_LOCATION_EVENT_TYPES importado de domain/events.ts, compartido
// con el texto de la invitación/RSVP.)

const RSVP_STATUS_OPTIONS: { value: EventGuestRsvpStatus; label: string }[] = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'confirmado', label: 'Confirmado' },
  { value: 'no_asiste', label: 'No asiste' },
  { value: 'no_seguro', label: 'No seguro' },
]

const INVITE_SCOPE_OPTIONS: { value: EventGuestInviteScope; label: string }[] = [
  { value: 'ambas', label: 'Ceremonia + celebración' },
  { value: 'solo_ceremonia', label: 'Solo ceremonia' },
  { value: 'solo_celebracion', label: 'Solo celebración' },
]

// Fase 14C — sentinela del <select> "Asignar todo el grupo a…": su
// placeholder deshabilitado ya usa value="", así que "Sin mesa" (quitar
// mesa a todo el grupo) necesita un valor propio para no compartirlo.
const GROUP_ASSIGN_NONE = '__sin_mesa__'

function eventDateLabel(ev: FamilyEvent): string {
  if (ev.dateStatus === 'pendiente' || !ev.eventDate) return 'Sin fecha todavía'
  const label = new Date(`${ev.eventDate}T00:00`).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

// Una línea que reduce su letra (hasta un mínimo) para que el texto quepa entero en vez
// de cortarse con "…" — petición real: "el tamaño del campo se ajusta al texto".
function FitText({ as: Tag, maxSize, minSize = 10, className, style, children }: { as: 'p' | 'strong'; maxSize: number; minSize?: number; className?: string; style?: CSSProperties; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      let size = maxSize
      el.style.fontSize = `${size}px`
      while (el.scrollWidth > el.clientWidth + 0.5 && size > minSize) {
        size -= 0.5
        el.style.fontSize = `${size}px`
      }
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => observer.disconnect()
  })
  return (
    <Tag ref={ref as never} className={className} style={style}>
      {children}
    </Tag>
  )
}

// Cabecera en dos filas: el tipo ("Cumpleaños") y debajo el nombre. Si el título ya
// empieza por el tipo ("Cumpleaños de Hugo") se le quita para no repetirlo → "Hugo".
function eventNameWithoutType(ev: FamilyEvent): string {
  const typeWord = EVENT_TYPE_META[ev.type].label.split(' ')[0]
  const stripped = ev.title.replace(new RegExp(`^${typeWord}\\s*(?:de la |del |de los |de las |de |:|-)?\\s*`, 'i'), '').trim()
  return stripped
}

// Cuenta atrás: a 2 semanas se pone amarilla y a la semana roja.
function countdownTone(days: number | null): 'normal' | 'warn' | 'alert' {
  if (days === null || days < 0) return 'normal'
  if (days <= 7) return 'alert'
  if (days <= 14) return 'warn'
  return 'normal'
}

// Fase 2 del configurador — ¿este evento se organiza por MOMENTOS (varios lugares/fechas posibles) en vez
// de un único "Lugar" genérico? Mismo criterio que ya decidía hoy si se mostraba la antigua
// CeremoniaSection: tipo de doble ubicación + módulo "ceremonia" activo. Un único sitio para esta
// condición — la usan la cabecera, "Gestionar evento" y el configurador, para que las 3 nunca diverjan.
function isEventStructuredByMoments(event: Pick<FamilyEvent, 'type' | 'enabledModules'>): boolean {
  return DUAL_LOCATION_EVENT_TYPES.includes(event.type) && event.enabledModules.includes('ceremonia')
}

// Fecha corta para la cabecera del evento ("Domingo, 18/10/2026"), para que quepa en una línea.
function eventShortDateLabel(ev: FamilyEvent): string {
  if (ev.dateStatus === 'pendiente' || !ev.eventDate) return 'Sin fecha todavía'
  const [y, m, d] = ev.eventDate.split('-')
  const weekday = new Date(`${ev.eventDate}T00:00`).toLocaleDateString('es-ES', { weekday: 'long' })
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${d}/${m}/${y}`
}

// "Ponlo en marcha" del alta de Eventos (Fase 1 del "inicio inteligente", 2026-09-30) — sustituye el
// antiguo toggle "Recomendado"/"Elegir yo": PEPA recomienda → el usuario revisa → el usuario decide.
// Los 14 EVENT_MODULES están SIEMPRE visibles y elegibles; `recommended` solo cambia el estado inicial
// (premarcado) y la marca visual (✨) — nunca oculta ni bloquea nada. Retoque UX (2026-09-30, tras
// validar en producción): el texto "· Recomendado" se sustituye por un simple "✨" — mismo contraste que
// el resto del chip, no depende de "muted" sobre fondo azul seleccionado. La ✨ es puramente informativa
// (viene de PEPA) e independiente de `checked` (si el usuario decide) — desmarcar un recomendado no le
// quita la ✨, y marcar uno no recomendado nunca se la pone.
function ModulePickerChips({
  modules,
  onChange,
  recommended,
}: {
  modules: EventModuleKey[]
  onChange: (next: EventModuleKey[]) => void
  recommended?: Set<EventModuleKey>
}) {
  return (
    <div className="filter-row" style={{ flexWrap: 'wrap' }}>
      {EVENT_MODULES.map((m) => {
        const checked = modules.includes(m.key)
        const isRecommended = recommended?.has(m.key)
        return (
          <button
            key={m.key}
            type="button"
            className={'chip' + (checked ? ' chip-active' : '')}
            onClick={() => onChange(checked ? modules.filter((k) => k !== m.key) : [...modules, m.key])}
          >
            {m.icon} {m.label}
            {isRecommended && ' ✨'}
          </button>
        )
      })}
    </div>
  )
}

const EVENT_MODULE_KEYS = new Set(EVENT_MODULES.map((m) => m.key))

// Fase 4 — deep-link real: /eventos?event=<uuid>&modulo=<clave>. No
// hace falta ninguna ruta ":id" nueva (":id" habría exigido tocar
// App.tsx/el 404.html de GitHub Pages) — con la SPA ya cargada,
// react-router resuelve el mismo "/eventos" con query string sin
// ningún salto de página, y un id inexistente o no autorizado
// simplemente no aparece en `events` (ya viene filtrado por RLS), así
// que el fallback a la lista de eventos es automático.
function validInitialModule(raw: string | null): EventModuleKey | null {
  return raw && EVENT_MODULE_KEYS.has(raw as EventModuleKey) ? (raw as EventModuleKey) : null
}

export function EventosScreen() {
  const [events, setEvents] = useState<FamilyEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  // PEPA Eventos, prompt maestro Parte A1 — registro global de proveedores, accesible desde Eventos →
  // Inicio SIN depender de entrar en un evento concreto (nunca selectedId).
  const [showGlobalProviders, setShowGlobalProviders] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const [initialModule, setInitialModule] = useState<EventModuleKey | null>(null)
  // "Eventos" del breadcrumb siempre vuelve a la lista (Inicio), incluso ya estando en /eventos.
  // initialModule se resetea también: si no, el próximo evento que se abra (normal, no por deep-link)
  // heredaría un módulo que ya no tiene sentido en vez de abrir en su propio Inicio.
  useSectionHome(() => {
    setSelectedId(null)
    setInitialModule(null)
    setShowGlobalProviders(false)
  })
  // Tercer nivel del breadcrumb ("Eventos / Boda de plata / Preparativos"): el módulo abierto vive como
  // estado LOCAL dentro de EventDetail (openModule), así que EventDetail avisa aquí arriba de su label
  // cada vez que cambia, en vez de subir todo ese estado — evita una reescritura grande de EventDetail
  // por un cambio que es puramente de navegación/breadcrumb.
  const [openModuleLabel, setOpenModuleLabel] = useState<string | null>(null)

  function reload() {
    listEvents(showArchived)
      .then(setEvents)
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar los eventos')))
      .finally(() => setLoading(false))
  }
  useEffect(reload, [showArchived])

  // Consume el deep-link una sola vez, en cuanto los eventos ya están
  // cargados (antes no se sabe si el id es válido) — y limpia la URL
  // después, para que navegar dentro de Eventos a partir de ahí no
  // vuelva a forzar el mismo módulo.
  useEffect(() => {
    if (loading) return
    const eventParam = searchParams.get('event')
    if (!eventParam) return
    if (events.some((e) => e.id === eventParam)) {
      setSelectedId(eventParam)
      setInitialModule(validInitialModule(searchParams.get('modulo')))
    }
    setSearchParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, events])

  const selected = events.find((e) => e.id === selectedId) ?? null

  if (loading) return <div className="screen">Cargando eventos…</div>

  return (
    <div className="screen">
      {/* Petición real, con imagen de referencia: cabecera con foto para
          Eventos, igual que Familia/Alimentación/Calendario — esta
          sección tampoco tiene menú ☰ (una sola pantalla), así que solo
          sustituye el <h1> de texto plano, sin botón de menú encima. */}
      <div className="kitchen-header">
        <img src={eventosHeaderImg} alt="Eventos" className="kitchen-header-img" />
      </div>
      {/* Dos niveles normalmente ("Eventos / Boda de plata"); tres cuando hay un módulo abierto dentro
          del evento ("Eventos / Boda de plata / Preparativos") — "Boda de plata" pasa a ser un enlace real
          que vuelve al dashboard de ESE evento (state.eventHome, ver EventDetail más abajo), nunca solo a
          /eventos a secas. */}
      <SectionBreadcrumb
        subsection={
          showGlobalProviders
            ? ([{ label: 'Inicio', to: '/eventos' }, { label: 'Proveedores y ofertas' }] satisfies BreadcrumbLevel[])
            : !selected
              ? 'Inicio'
              : !openModuleLabel
                ? selected.title
                : ([
                    { label: selected.title, to: '/eventos', state: { eventHome: true } },
                    { label: openModuleLabel },
                  ] satisfies BreadcrumbLevel[])
        }
      />
      {error && <p className="error">{error}</p>}

      {showGlobalProviders ? (
        <ProvidersGlobalScreen onBack={() => setShowGlobalProviders(false)} />
      ) : selected ? (
        <EventDetail
          event={selected}
          initialModule={initialModule}
          onBack={() => setSelectedId(null)}
          onModuleLabelChange={setOpenModuleLabel}
          onChanged={reload}
          onArchivedOrDeleted={() => {
            setSelectedId(null)
            reload()
          }}
          onDuplicated={(id) => {
            reload()
            setSelectedId(id)
          }}
        />
      ) : (
        <>
          <button type="button" onClick={() => setShowCreate(true)}>
            + Nuevo evento
          </button>
          <button type="button" className="link-button" onClick={() => setShowGlobalProviders(true)} style={{ marginLeft: 8 }}>
            📇 Proveedores y ofertas
          </button>
          {showCreate && (
            <CreateEventModal
              onClose={() => setShowCreate(false)}
              onCreated={(id) => {
                setShowCreate(false)
                reload()
                setSelectedId(id)
              }}
            />
          )}

          <div className="filter-row" style={{ marginTop: 12 }}>
            <button type="button" className={'chip' + (!showArchived ? ' chip-active' : '')} onClick={() => setShowArchived(false)}>
              En marcha
            </button>
            <button type="button" className={'chip' + (showArchived ? ' chip-active' : '')} onClick={() => setShowArchived(true)}>
              Archivados
            </button>
          </div>

          <div className="event-list" style={{ marginTop: 12 }}>
            {events.length === 0 && (
              <p className="muted">{showArchived ? 'Todavía no hay eventos archivados.' : 'Todavía no hay ningún evento — crea el primero.'}</p>
            )}
            {events
              .filter((ev) => showArchived === (ev.status === 'archivado'))
              .map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  className="card event-card"
                  style={{ textAlign: 'left', width: '100%' }}
                  onClick={() => setSelectedId(ev.id)}
                >
                  <strong>
                    {EVENT_TYPE_META[ev.type].icon} {ev.title}
                  </strong>
                  <p className="muted" style={{ margin: '4px 0 0' }}>
                    {eventDateLabel(ev)}
                  </p>
                </button>
              ))}
          </div>
        </>
      )}
    </div>
  )
}

// Alta mínima — «Nuevo evento» solo identifica QUÉ evento vamos a organizar: nombre, tipo (con su variante si
// la tiene) y qué partes quiere gestionar el usuario en PEPA. Fecha, lugar, edad, servicios incluidos y demás
// datos estructurales se configuran después, dentro de ✨ «Cómo queréis que sea vuestro evento» (primer
// bloque: «Ceremonia y celebración» / «Celebración»). Un evento puede crearse incompleto: ese bloque aparecerá
// como «sin empezar» hasta que se rellene.
function CreateEventModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [type, setType] = useState<EventType>('cumpleanos')
  const [title, setTitle] = useState('')
  const [subtype, setSubtype] = useState(CELEBRATION_SUBTYPES[0])
  const [modules, setModules] = useState<EventModuleKey[]>(RECOMMENDED_MODULES.cumpleanos)
  const [theme, setTheme] = useState<string | null>(null)
  const [templates, setTemplates] = useState<EventTemplate[]>([])
  const [templateId, setTemplateId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listEventTemplates()
      .then(setTemplates)
      .catch(() => {})
  }, [])

  const recommendedModules = RECOMMENDED_MODULES[type]

  function handleTypeChange(next: EventType) {
    setType(next)
    setModules(RECOMMENDED_MODULES[next])
  }

  // Una plantilla solo preconfigura la IDENTIDAD del evento (tipo, variante, tema y módulos): nunca fechas,
  // lugares ni servicios, que se deciden en el configurador.
  function handleUseTemplate(id: string) {
    setTemplateId(id)
    const t = templates.find((tpl) => tpl.id === id)
    if (!t) return
    setType(t.type)
    if (t.subtype) setSubtype(t.subtype)
    setTheme(t.theme)
    setModules(t.enabledModules)
  }

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!title.trim()) {
      setError('Ponle un nombre al evento.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const id = await createEvent({
        type,
        subtype: type === 'celebracion' ? subtype : null,
        title,
        dateStatus: 'pendiente',
        eventDate: null,
        details: {},
        enabledModules: modules,
        theme,
      })
      onCreated(id)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo crear el evento'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Nuevo evento
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <form className="card member-form" onSubmit={handleSubmit}>
          {error && <p className="error">{error}</p>}
          {templates.length > 0 && (
            <label>
              Usar plantilla (opcional)
              <div className="inline-fields">
                <select value={templateId} onChange={(e) => handleUseTemplate(e.target.value)} style={{ flex: 1 }}>
                  <option value="">Sin plantilla</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                {templateId && (
                  <ConfirmIconButton
                    icon="✕"
                    className="icon-button"
                    ariaLabel="Borrar plantilla"
                    onConfirm={() =>
                      deleteEventTemplate(templateId).then(() => {
                        setTemplates((ts) => ts.filter((t) => t.id !== templateId))
                        setTemplateId('')
                      })
                    }
                  />
                )}
              </div>
            </label>
          )}
          <label>
            Nombre del evento
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Cumpleaños de Eric" autoFocus />
          </label>
          <label>
            Tipo
            <select value={type} onChange={(e) => handleTypeChange(e.target.value as EventType)}>
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EVENT_TYPE_META[t].icon} {EVENT_TYPE_META[t].label}
                </option>
              ))}
            </select>
          </label>
          {type === 'celebracion' && (
            <label>
              Tipo de celebración
              <select value={subtype} onChange={(e) => setSubtype(e.target.value)}>
                {CELEBRATION_SUBTYPES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Los 14 módulos están siempre visibles, los recomendados llegan premarcados y el usuario decide
              libremente (marcar, desmarcar, combinar) — nunca ocultos, nunca bloqueados. */}
          <strong style={{ marginTop: 8 }}>¿Qué quieres organizar en PEPA?</strong>
          <p className="muted" style={{ fontSize: 12, margin: '-4px 0 0' }}>
            ✨ Pepa te recomienda {recommendedModules.length} de {EVENT_MODULES.length} módulos para este evento.
          </p>
          <ModulePickerChips modules={modules} onChange={setModules} recommended={new Set(recommendedModules)} />
          <p className="muted" style={{ fontSize: 12 }}>
            La fecha, el lugar y el resto de detalles los iréis decidiendo después, en «Cómo queréis que sea vuestro evento». Podrás activar o desactivar módulos más adelante desde el propio evento.
          </p>

          <button type="submit" disabled={saving}>
            {saving ? 'Creando…' : 'Crear evento'}
          </button>
        </form>
      </div>
    </div>
  )
}

// Petición real: "reorganizar Eventos con este aspecto o similar" —
// antes EventDetail apilaba las 12+ secciones de un evento, todas
// visibles a la vez, en una sola página larguísima. Ahora es un
// dashboard compacto (cabecera con cuenta atrás, "Preparación del
// evento", "Pepa te recomienda" con las tareas más urgentes, y una
// rejilla de tarjetas — una por módulo activado) y cada tarjeta abre
// SU sección a pantalla completa (openModule) en vez de tenerlas todas
// desplegadas. Los 12 componentes de sección de abajo (GuestsSection,
// BudgetSection...) no cambian nada por dentro, solo CUÁNDO se montan.
function EventDetail({
  event,
  initialModule = null,
  onBack,
  onModuleLabelChange,
  onChanged,
  onArchivedOrDeleted,
  onDuplicated,
}: {
  event: FamilyEvent
  initialModule?: EventModuleKey | null
  onBack: () => void
  onModuleLabelChange: (label: string | null) => void
  onChanged: () => void
  onArchivedOrDeleted: () => void
  onDuplicated: (id: string) => void
}) {
  const [tasks, setTasks] = useState<EventTask[]>([])
  // Preparativos aparece siempre desplegado al entrar (antes solo si se llegaba desde un aviso de tarea;
  // la entrada normal, desde la tarjeta del dashboard, se quedaba en las 5 primeras con "Ver todas" —
  // petición real: que empiece desplegado siempre, conservando el control para plegarlo a mano).
  const [showAllTasks, setShowAllTasks] = useState(true)
  // Bloque 9 (cola nocturna) — Completadas/Historial: auditoría real (src/domain/events.ts,
  // src/ui/EventosScreen.tsx) confirmó que una tarea hecha (done:true) desaparecía de la vista para
  // siempre (solo quedaba el recuento "X de Y completadas"), sin ningún borrado — el dato ya se conservaba
  // en la base de datos, solo faltaba un sitio para volver a verlo. Colapsado por defecto: no reordena ni
  // agranda la vista de siempre de Preparativos.
  const [showCompletedTasks, setShowCompletedTasks] = useState(false)
  // Fase 8 — rediseño de Preparativos: qué tarea se está editando ahora
  // mismo (ficha compacta + modal de edición, en vez de una fila de
  // tabla con checkbox+texto+fecha+responsable+✕ compitiendo por sitio).
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  // Preparativos: filtro de la LISTA por responsable (solo presentación) y avisos rápidos por tarea.
  const [responsibleFilter, setResponsibleFilter] = useState<string[]>([])
  // Varios avisos por tarea: se guarda el array real (no una sola "opción elegida"), misma fuente de
  // verdad para la campana rápida y para «Editar tarea».
  const [taskReminders, setTaskReminders] = useState<Record<string, EventReminder[]>>({})
  const [eventHelpers, setEventHelpers] = useState<EventHelper[]>([])
  // "+ Nueva tarea" (reemplaza el alta rápida inferior): abre el mismo formulario completo que "Editar
  // tarea", en modo creación — nunca un segundo sistema de alta simplificado.
  const [creatingTask, setCreatingTask] = useState(false)
  const [managingHelpers, setManagingHelpers] = useState(false)
  // "🗂️ Encargos" (bloque D/F): agrupación organizativa, puramente ligera — nada se rompe ni cambia de
  // aspecto para quien no la use (eventTaskGroups vacío = cero diferencia visual).
  const [eventTaskGroups, setEventTaskGroups] = useState<EventTaskGroup[]>([])
  const [managingGroups, setManagingGroups] = useState(false)
  // Fase 8 (Parte C5, prompt maestro) — color por encargo, reutilizando el MISMO sistema pastel/vivo/
  // neutro de siempre (paletteByName: mismo nombre siempre el mismo color, nunca una paleta paralela). El
  // color identifica el ENCARGO, nunca su estado — se usa igual esté pendiente o ya resuelto/completado.
  const groupColors = useMemo(() => paletteByName(eventTaskGroups.map((g) => g.name)), [eventTaskGroups])
  // Al crear una tarea desde dentro de un encargo concreto ("+ Tarea en este encargo"), ese grupo llega
  // ya preseleccionado al formulario de creación.
  const [creatingTaskInGroup, setCreatingTaskInGroup] = useState<string | null>(null)
  function reloadEventTaskGroups() {
    return listEventTaskGroups(event.id).then(setEventTaskGroups)
  }
  useEffect(() => void reloadEventTaskGroups().catch(() => {}), [event.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // Tanda Encargos v2: qué encargo se está resolviendo ahora mismo ("Marcar encargo como resuelto").
  const [resolvingGroup, setResolvingGroup] = useState<EventTaskGroup | null>(null)
  // "Siguiente preparativo" — prompt efímero (solo en memoria, nunca persistido: ver el informe de la
  // tanda) mostrado una vez justo tras resolver un encargo o completar una tarea suelta. sourceLabel es
  // el texto de lo que se acaba de resolver/completar; createdKeys evita poder crear la misma sugerencia
  // dos veces desde el mismo prompt.
  const [nextStepPrompt, setNextStepPrompt] = useState<{ sourceLabel: string; suggestions: NextStepSuggestion[]; createdKeys: Set<string> } | null>(null)
  // Formulario de "Nueva tarea" abierto desde el prompt de "Siguiente preparativo" — reutiliza
  // EXACTAMENTE el mismo TaskEditModal que "+ Nueva tarea", nunca un segundo camino de creación.
  const [followUpCreate, setFollowUpCreate] = useState<{ initialTitle: string; suggestionKey: string | null } | null>(null)
  // Fase 1 — reforma de Editar/•••: un único punto de entrada
  // ("Gestionar evento") en vez de dos controles compitiendo por la
  // misma clase de acción, ver ManageEventModal más abajo.
  const [showManage, setShowManage] = useState(false)
  const [showPlan, setShowPlan] = useState(false)
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [showEndSummary, setShowEndSummary] = useState(false)
  const [openModule, setOpenModule] = useState<EventModuleKey | 'compras' | null>(initialModule)
  // Nivel intermedio del breadcrumb ("Boda de plata"): al pulsarlo, cierra el módulo abierto y vuelve al
  // dashboard de ESTE evento — mismo mecanismo que sectionHome (state.eventHome + useLocationFlag), nunca
  // history.back(), para que el destino sea determinista aunque se haya llegado por deep-link directo a
  // un módulo. selectedId vive en el padre (EventosScreen) y no se toca aquí.
  useLocationFlag('eventHome', () => setOpenModule(null))
  // El label del módulo abierto se reporta al padre para el tercer nivel del breadcrumb — 'compras' no es
  // un EventModuleKey real (ver moduleCards más abajo), de ahí el fallback literal.
  useEffect(() => {
    onModuleLabelChange(openModule ? (EVENT_MODULES.find((m) => m.key === openModule)?.label ?? 'Compras') : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openModule])
  const [refreshKey, setRefreshKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  // Un evento con la fecha confirmada que todavía no está en el Calendario (p. ej. uno
  // confirmado antes de que esto fuera automático) se apunta al abrirlo.
  useEffect(() => {
    if (event.status === 'planificacion' && event.dateStatus === 'confirmada' && event.eventDate && !event.calendarEventId) {
      syncEventToCalendar(event.id)
        .then((result) => {
          if (result) onChanged()
        })
        .catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id, event.dateStatus, event.eventDate])

  // Igual con el recordatorio del plazo de RSVP: un evento con plazo y sin recordatorio
  // (puesto antes de que esto fuera automático) lo recibe al abrirlo.
  useEffect(() => {
    if (event.status === 'planificacion' && event.rsvpDeadline && !event.rsvpDeadlineCalendarEventId) {
      syncRsvpDeadlineReminder(event.id)
        .then((result) => {
          if (result) onChanged()
        })
        .catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id, event.rsvpDeadline])

  function reloadTasks() {
    return listEventTasks(event.id)
      .then(setTasks)
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar las tareas')))
  }
  useEffect(() => void reloadTasks(), [event.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Completar UNA tarea suelta (checkbox normal) pasa por el MISMO motor general de "siguiente
  // preparativo" que resolver un encargo — hoy siempre sin ninguna sugerencia real (ver
  // suggestNextStepsForTask), pero el enganche es general y decoupled, no exclusivo de Encargos.
  async function completeTaskWithNextStep(t: EventTask) {
    await updateEventTask(t.id, { done: true })
    await reloadTasks()
    const suggestions = suggestNextStepsForTask(t)
    if (suggestions.length > 0) setNextStepPrompt({ sourceLabel: t.title, suggestions, createdKeys: new Set() })
  }

  // Decisiones del evento, solo para que PEPA pueda seguir recalculando la prioridad de las tareas que
  // gestiona (ver effectivePriority) — nunca para escribir nada aquí; cada bloque del configurador sigue
  // cargando y guardando sus propias decisiones por su cuenta.
  const [taskDecisions, setTaskDecisions] = useState<EventDecision[]>([])
  useEffect(() => {
    listEventDecisions(event.id)
      .then(setTaskDecisions)
      .catch(() => {})
  }, [event.id])
  // Tras cada recarga de tareas, PEPA revisa (barato y determinista, sin cron) si alguna prioridad fijada
  // por el usuario merece una sugerencia de cambio — nunca sobre las que PEPA ya gestiona.
  useEffect(() => {
    if (tasks.length === 0) return
    ensureTaskPrioritySuggestions(tasks, taskDecisions, new Date())
      .then((changed) => {
        if (changed) reloadPrioritySuggestions()
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, taskDecisions])
  const [prioritySuggestions, setPrioritySuggestions] = useState<EventTaskPrioritySuggestion[]>([])
  function reloadPrioritySuggestions() {
    listOpenEventTaskPrioritySuggestions(event.id)
      .then(setPrioritySuggestions)
      .catch(() => {})
  }
  useEffect(reloadPrioritySuggestions, [event.id])

  const pendingTasks = tasks.filter((t) => !t.done)
  const filteredTasks = pendingTasks.filter((t) => taskMatchesResponsibleFilter(t, responsibleFilter))
  const visibleTasks = showAllTasks ? filteredTasks : filteredTasks.slice(0, 5)
  // Bloque 9 — nunca se borran solas: mismo array `tasks` de siempre, solo el lado done:true.
  const completedTasks = tasks.filter((t) => t.done)
  function reloadEventHelpers() {
    return listEventHelpers(event.id).then(setEventHelpers)
  }
  useEffect(() => {
    reloadEventHelpers().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id, tasks])
  useEffect(() => {
    const linked = tasks.filter((t): t is EventTask & { calendarEventId: string } => t.calendarEventId != null)
    if (linked.length === 0) return
    let cancelled = false
    Promise.all(linked.map(async (t) => [t.id, await listEventReminders(t.calendarEventId)] as const))
      .then((pairs) => {
        if (!cancelled) setTaskReminders(Object.fromEntries(pairs))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [tasks])
  const hasTasksModule = event.enabledModules.includes('tareas')

  function toggleResponsibleFilter(key: string) {
    setResponsibleFilter((prev) => toggleResponsibleFilterKey(prev, key))
  }

  // Sin fecha no hay aviso temporal; sin «Mostrar en Calendario» no hay dónde guardarlo: se explica, no se inventa.
  function reminderHintFor(t: EventTask): string | null {
    if (!t.dueDate) return 'Pon una fecha para activar un aviso'
    if (!t.calendarEventId) return 'Activa primero «Mostrar en Calendario» en el editor'
    return null
  }

  // Bloque A — la campana ya no se limita a explicar por qué está desactivada: cuando el único motivo es
  // que la tarea todavía no está en Calendario (SÍ tiene fecha), ofrece resolverlo ahí mismo. Reutiliza
  // el mismo linkEventTaskToCalendar de siempre (idempotente: si ya estuviera enlazada, no duplica nada)
  // — nunca un sistema de avisos paralelo al de Calendario.
  type ReminderGate = 'ok' | 'no_date' | 'not_in_calendar'
  function reminderGateFor(t: EventTask): ReminderGate {
    if (!t.dueDate) return 'no_date'
    if (!t.calendarEventId) return 'not_in_calendar'
    return 'ok'
  }

  // Enlaza la tarea a Calendario (conserva fecha/hora/responsables — linkEventTaskToCalendar ya lo hace)
  // y refresca la lista antes de devolver el control, para que la campana ya vea calendarEventId al
  // reabrirse. true = se puede continuar y abrir el selector de avisos; false = algo falló, nada cambió.
  async function enableCalendarForReminder(t: EventTask): Promise<boolean> {
    try {
      await linkEventTaskToCalendar(t.id)
      await reloadTasks()
      return true
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir la tarea al Calendario'))
      return false
    }
  }

  // Varios avisos a la vez (Bloque recordatorios): cada toque cambia SOLO el aviso tocado, nunca pierde
  // los demás. Mientras haya un guardado en curso para esta tarea, se ignoran más toques (en vez de
  // lanzar dos escrituras en paralelo que podrían pisarse) — se reactivan solos al terminar. Nunca se
  // actualiza el estado local antes de que la base de datos confirme; si falla, se recarga lo real.
  const [savingReminderTaskId, setSavingReminderTaskId] = useState<string | null>(null)

  async function refreshTaskReminders(t: EventTask & { calendarEventId: string }) {
    try {
      const fresh = await listEventReminders(t.calendarEventId)
      setTaskReminders((prev) => ({ ...prev, [t.id]: fresh }))
    } catch {
      // Si ni siquiera se puede releer, se deja el estado anterior — nunca se inventa uno.
    }
  }

  async function toggleTaskReminderPreset(t: EventTask, key: ReminderPresetKey) {
    if (!t.calendarEventId || savingReminderTaskId === t.id) return
    const calendarEventId = t.calendarEventId
    const next = toggledPresetReminders(taskReminders[t.id] ?? [], key)
    setSavingReminderTaskId(t.id)
    try {
      await replaceReminders(calendarEventId, next)
      setTaskReminders((prev) => ({ ...prev, [t.id]: next }))
    } catch (err) {
      setError(errorMessage(err, 'No se pudo cambiar el aviso'))
      await refreshTaskReminders({ ...t, calendarEventId })
    } finally {
      setSavingReminderTaskId(null)
    }
  }

  async function clearTaskReminders(t: EventTask) {
    if (!t.calendarEventId || savingReminderTaskId === t.id) return
    const calendarEventId = t.calendarEventId
    setSavingReminderTaskId(t.id)
    try {
      await replaceReminders(calendarEventId, [])
      setTaskReminders((prev) => ({ ...prev, [t.id]: [] }))
    } catch (err) {
      setError(errorMessage(err, 'No se pudo quitar el aviso'))
      await refreshTaskReminders({ ...t, calendarEventId })
    } finally {
      setSavingReminderTaskId(null)
    }
  }


  // ---------------------------------------------------------------
  // Datos "de un vistazo" para el dashboard — una carga ligera propia,
  // aparte de la que hace cada sección al abrirse (mismo patrón que ya
  // usan PepaConclusions/BudgetSection/EndSummaryModal, cada una con
  // su propio fetch independiente en vez de compartir un estado
  // central). Cada lista solo se pide si el módulo correspondiente
  // está activado en ESTE evento.
  // ---------------------------------------------------------------
  const [guests, setGuests] = useState<EventGuest[]>([])
  const [invitationExists, setInvitationExists] = useState(false)
  const [budgetItems, setBudgetItems] = useState<EventBudgetItem[]>([])
  const [budgetSpent, setBudgetSpent] = useState<number | null>(null)
  const [menuItems, setMenuItems] = useState<EventMenuItem[]>([])
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([])
  const [decorationItems, setDecorationItems] = useState<EventDecorationItem[]>([])
  const [activities, setActivities] = useState<EventActivity[]>([])
  const [tables, setTables] = useState<EventTableSeat[]>([])
  const [providers, setProviders] = useState<EventProvider[]>([])
  const [payments, setPayments] = useState<EventPayment[]>([])
  const [favorItems, setFavorItems] = useState<EventFavorItem[]>([])
  const [specialDetails, setSpecialDetails] = useState<EventSpecialDetail[]>([])
  const [gifts, setGifts] = useState<EventGiftReceived[]>([])
  const [dayPlan, setDayPlan] = useState<EventDayPlanItem[]>([])
  // Fase 6 — responsable de una tarea: miembros reales de la familia,
  // para el desplegable "Sin asignar" / miembro — nunca inferido.
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([])
  useEffect(() => {
    listFamilyMembers().then(setFamilyMembers).catch(() => {})
  }, [])

  function reloadDashboardStats() {
    const has = (k: EventModuleKey) => event.enabledModules.includes(k)
    if (has('invitados')) listEventGuests(event.id).then(setGuests).catch(() => {})
    if (has('invitaciones'))
      getEventInvitation(event.id)
        .then((inv) => setInvitationExists(!!inv && inv.canvas.layers.length > 0))
        .catch(() => {})
    if (has('presupuesto')) {
      listEventBudgetItems(event.id).then(setBudgetItems).catch(() => {})
      if (event.tagId) {
        // FASE 6D.3 — auditoría: este `!e.isIncome && !isInternalTransferCategory(...)` (y sus 3 réplicas en este archivo) es el
        // LADO DEL GASTO de un evento (cuánto se ha gastado con su etiqueta), no "ingreso real": una devolución (is_income=true)
        // ya queda fuera por `!e.isIncome`, sin necesidad de isRealIncome. No es el mismo caso que FinanceScreen.tsx — no se toca.
        Promise.all([listExpenses(), listBudgetCategories()])
          .then(([expenses, categories]) =>
            setBudgetSpent(
              expenses
                .filter((e) => e.tagId === event.tagId && !e.isIncome && !isInternalTransferCategory(e.category, categories))
                .reduce((sum, e) => sum + e.amount, 0),
            ),
          )
          .catch(() => setBudgetSpent(null))
      }
    }
    if (has('menu_compra')) {
      listEventMenuItems(event.id).then(setMenuItems).catch(() => {})
      listShoppingItems()
        .then((items) => setShoppingItems(items.filter((i) => i.eventId === event.id)))
        .catch(() => {})
    }
    if (has('decoracion')) listEventDecorationItems(event.id).then(setDecorationItems).catch(() => {})
    if (has('actividades')) listEventActivities(event.id).then(setActivities).catch(() => {})
    if (has('mesas')) listEventTables(event.id).then(setTables).catch(() => {})
    if (has('proveedores')) listEventProviders(event.id).then(setProviders).catch(() => {})
    if (has('pagos')) listEventPayments(event.id).then(setPayments).catch(() => {})
    if (has('detalles')) {
      listEventFavorItems(event.id).then(setFavorItems).catch(() => {})
      listEventSpecialDetails(event.id).then(setSpecialDetails).catch(() => {})
    }
    if (has('regalos')) listEventGifts(event.id).then(setGifts).catch(() => {})
    if (has('plan_dia')) listEventDayPlan(event.id).then(setDayPlan).catch(() => {})
  }
  useEffect(reloadDashboardStats, [event.id, event.enabledModules, event.tagId, refreshKey])

  // Fase 2 — "Estado del evento": sustituye el porcentaje agregado de
  // "Preparación del evento" (auditoría: 0/6 tareas + 16/16 invitados
  // daba "50 %", escondiendo justo las tareas atrasadas detrás de un
  // número tranquilizador) por indicadores independientes y
  // verificables, vía computeEventStatusSummary — sin fórmula nueva
  // que combine cosas sin relación entre sí.
  const hasGuestsModule = event.enabledModules.includes('invitados')
  const hasBudgetModule = event.enabledModules.includes('presupuesto')
  const hasPaymentsModule = event.enabledModules.includes('pagos')
  const taskDoneCount = tasks.filter((t) => t.done).length
  const budgetPlanned = budgetItems.reduce((sum, i) => sum + (i.plannedAmount ?? 0), 0)
  const statusSummary = computeEventStatusSummary({ tasks, guests, payments, plannedBudget: budgetPlanned, spentBudget: budgetSpent })

  // Fase 12 — deep-link a la tarea concreta: computeEventConclusions
  // agrega ("N tareas atrasadas"), no señala una tarea en particular,
  // así que en vez de inventar un id de tarea en la URL (más
  // arquitectura, más superficie de deep-link que mantener), al entrar
  // a Preparativos desde un aviso se destaca sola la más urgente de
  // verdad (mismo orden que "Pepa te recomienda", rankUpcomingTasks) —
  // sencillo, robusto, y se recalcula solo si se resuelve.
  const deepLinkHighlightTaskId = initialModule === 'tareas' ? (recommendTasks(tasks, new Date(), 1, taskDecisions)[0]?.task.id ?? null) : null

  // Fase 7 — barra dinámica: "corresponde" evaluar ubicación exacta
  // solo si el evento ya tiene algún lugar en texto — uno que todavía
  // no ha decidido dónde será no se penaliza por algo que ni existe.
  const eventLocations = DUAL_LOCATION_EVENT_TYPES.includes(event.type)
    ? [
        { label: event.ceremonyLocationLabel, hasCoords: event.ceremonyLocationLatitude != null },
        { label: event.celebrationLocationLabel, hasCoords: event.celebrationLocationLatitude != null },
      ]
    : [{ label: event.venueLabel, hasCoords: event.venueLatitude != null }]
  const setLocations = eventLocations.filter((l) => l.label)
  const paymentAlerts = countPaymentAlerts(payments)
  const eventHealth = computeEventHealth({
    hasTasksModule,
    tasksTotal: statusSummary.tasksTotal,
    tasksDone: statusSummary.tasksDone,
    tasksOverdue: statusSummary.tasksOverdue,
    hasGuestsModule,
    guestsTotalPeople: statusSummary.guestsTotalPeople,
    guestsConfirmedPeople: statusSummary.guestsConfirmedPeople,
    guestsPendingCount: statusSummary.guestsPendingCount,
    hasBudgetModule,
    budgetPlanned: statusSummary.budgetPlanned,
    budgetSpent: statusSummary.budgetSpent,
    hasPaymentsModule,
    paymentsOverdueCount: paymentAlerts.overdue,
    paymentsDueSoonCount: paymentAlerts.dueSoon,
    locationApplicable: setLocations.length > 0,
    hasExactLocation: setLocations.length > 0 && setLocations.every((l) => l.hasCoords),
    nextMilestone: statusSummary.nextMilestone,
  })

  // "Pepa te recomienda" — hasta 3 tareas pendientes, vencidas primero
  // y luego las más próximas (rankUpcomingTasks, domain/events.ts).
  const upcomingTasks = recommendTasks(tasks, new Date(), 3, taskDecisions)

  // Fase 11 — "recordatorio cuando aporte valor": solo se pide para las
  // hasta 3 tareas que ya se muestran aquí, nunca para todas las
  // tareas del evento. Reutiliza listEventReminders (Fase 10, mismo
  // almacén que Calendario) — desaparece sola si la tarea deja de
  // estar entre las recomendadas (p. ej. al resolverse).
  const [upcomingReminders, setUpcomingReminders] = useState<Record<string, EventReminder>>({})
  useEffect(() => {
    const linked = recommendTasks(tasks, new Date(), 3, taskDecisions)
      .map((r) => r.task)
      .filter((t): t is EventTask & { calendarEventId: string } => t.calendarEventId != null)
    if (linked.length === 0) {
      setUpcomingReminders({})
      return
    }
    Promise.all(linked.map((t) => listEventReminders(t.calendarEventId).then((rs) => [t.id, rs[0]] as const)))
      .then((pairs) => setUpcomingReminders(Object.fromEntries(pairs.filter((p): p is [string, EventReminder] => !!p[1]))))
      .catch(() => {})
  }, [tasks, taskDecisions])

  // Cuenta atrás — solo si hay fecha puesta (un evento "pendiente" sin
  // fecha no tiene nada que contar).
  const daysToEvent = event.eventDate ? daysUntil(event.eventDate) : null

  // Rejilla de tarjetas: una por módulo activado con sección propia.
  // "invitaciones" pasó a tener sección propia en Fase 3 (2026-09-27,
  // auditoría): antes su valor de EventModuleKey nunca se usaba porque
  // el botón 💌 de cada invitado, dentro de Invitados, se consideraba
  // suficiente — pero eso mezclaba "diseñar" con "enviar" (InvitationSection,
  // más arriba). "Ceremonia" ya no es una tarjeta de la rejilla (Fase 1 —
  // reforma Editar/•••): sus campos viven en "Información del evento"
  // dentro de "Gestionar evento", para no duplicar una tercera superficie
  // de edición estructural (auditoría, hallazgo E). "Compras" es una
  // clave propia (no un EventModuleKey real) ligada al mismo módulo que
  // "Menú del evento": las dos aparecen o desaparecen juntas.
  interface ModuleCardDef {
    key: EventModuleKey | 'compras'
    icon: string
    label: string
    stat: string
  }
  const moduleCards: ModuleCardDef[] = []
  for (const mod of EVENT_MODULES) {
    if (!event.enabledModules.includes(mod.key)) continue
    if (mod.key === 'ceremonia') continue
    let stat = ''
    switch (mod.key) {
      case 'tareas':
        stat = tasks.length > 0 ? `${taskDoneCount} de ${tasks.length} completadas` : 'Sin tareas'
        break
      case 'invitados':
        stat = guests.length > 0 ? `${statusSummary.guestsTotalPeople} personas · ${statusSummary.guestsConfirmedPeople} confirmadas` : 'Sin invitados'
        break
      case 'invitaciones':
        stat = invitationExists ? 'Invitación creada' : 'Sin crear todavía'
        break
      case 'presupuesto':
        stat = budgetSpent !== null ? `${budgetSpent.toFixed(2)} € de ${budgetPlanned.toFixed(2)} €` : `Planeado: ${budgetPlanned.toFixed(2)} €`
        break
      case 'menu_compra': {
        // Solo los platos cuentan como platos (los encabezados y notas del menú no).
        const dishes = menuItems.filter((i) => i.kind === 'dish').length
        stat = menuItems.length === 0 ? 'Sin menú todavía' : `${dishes} plato${dishes === 1 ? '' : 's'}`
        break
      }
      case 'decoracion': {
        const comprados = decorationItems.filter((i) => i.status === 'comprado').length
        stat = decorationItems.length === 0 ? 'Sin ideas' : `${decorationItems.length} ideas · ${comprados} compradas`
        break
      }
      case 'actividades':
        stat = activities.length > 0 ? `${activities.length} preparadas` : 'Sin actividades'
        break
      case 'mesas':
        stat = tables.length > 0 ? `${tables.length} mesas` : 'Sin mesas'
        break
      case 'proveedores':
        stat = providers.length > 0 ? `${providers.length} proveedores` : 'Sin proveedores'
        break
      case 'pagos': {
        const pending = payments.filter((p) => p.status !== 'pagado').length
        stat = payments.length === 0 ? 'Sin pagos' : pending > 0 ? `${pending} pendientes` : 'Todo pagado'
        break
      }
      case 'detalles': {
        const count = favorItems.length + specialDetails.length
        stat = count > 0 ? `${count} detalles` : 'Sin detalles'
        break
      }
      case 'regalos':
        stat = gifts.length > 0 ? `${gifts.length} registrados` : 'Sin regalos'
        break
      case 'plan_dia':
        stat = dayPlan.length > 0 ? `${dayPlan.length} momentos planeados` : 'Sin preparar'
        break
    }
    moduleCards.push({ key: mod.key, icon: mod.icon, label: mod.label, stat })
    if (mod.key === 'menu_compra') {
      const pendingShopping = shoppingItems.filter((i) => i.status === 'pendiente').length
      moduleCards.push({
        key: 'compras',
        icon: '🛍️',
        label: 'Compras',
        stat: shoppingItems.length === 0 ? 'Nada pendiente' : pendingShopping > 0 ? `${pendingShopping} pendientes` : 'Todo comprado',
      })
    }
  }
  const cardColors = pastelPalette(moduleCards.length)

  function renderOpenModule() {
    switch (openModule) {
      case 'tareas': {
        const editingTask = tasks.find((t) => t.id === editingTaskId) ?? null
        return (
          <div className="card event-card">
            <strong>{EVENT_MODULES.find((m) => m.key === 'tareas')?.icon} Preparativos</strong>
            {pendingTasks.length === 0 && <p className="muted">No hay nada pendiente.</p>}
            {pendingTasks.length > 0 && (
              <div className="filter-row" role="group" aria-label="Filtrar por responsable" style={{ flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                <button type="button" className={'chip' + (responsibleFilter.length === 0 ? ' chip-active' : '')} onClick={() => setResponsibleFilter([])}>
                  Todos
                </button>
                <button type="button" className={'chip' + (responsibleFilter.includes(NO_RESPONSIBLE_KEY) ? ' chip-active' : '')} onClick={() => toggleResponsibleFilter(NO_RESPONSIBLE_KEY)}>
                  Sin asignar
                </button>
                {familyMembers.map((m) => (
                  <button key={m.id} type="button" className={'chip' + (responsibleFilter.includes('m:' + m.id) ? ' chip-active' : '')} onClick={() => toggleResponsibleFilter('m:' + m.id)}>
                    👤 {m.name}
                  </button>
                ))}
                {eventHelpers.map((h) => (
                  <button key={h.id} type="button" className={'chip' + (responsibleFilter.includes('h:' + h.id) ? ' chip-active' : '')} onClick={() => toggleResponsibleFilter('h:' + h.id)}>
                    🤝 {h.name}
                  </button>
                ))}
                {responsibleFilter.length > 0 && (
                  <button type="button" className="link-button" onClick={() => setResponsibleFilter([])}>
                    Limpiar filtros
                  </button>
                )}
              </div>
            )}
            {/* "+ Nueva tarea" sustituye el alta rápida inferior (bloque 1 de la tanda): mismo formulario
                completo que "Editar tarea", en modo creación. Se queda siempre aquí, debajo de los
                filtros y antes de la lista, haya o no filtros activos. */}
            <div className="filter-row" style={{ marginTop: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  setCreatingTaskInGroup(null)
                  setCreatingTask(true)
                }}
              >
                + Nueva tarea
              </button>
              <button type="button" className="link-button" onClick={() => setManagingHelpers(true)}>
                👥 Colaboradores
              </button>
              <button type="button" className="link-button" onClick={() => setManagingGroups(true)}>
                🗂️ Encargos
              </button>
            </div>
            {responsibleFilter.length > 0 && filteredTasks.length === 0 && <p className="muted">Ninguna tarea pendiente coincide con este filtro.</p>}
            <div className="event-list" style={{ marginTop: 8 }}>
              {buildTaskGroupRenderItems(visibleTasks, eventTaskGroups).map((item) =>
                item.type === 'task' ? (
                  <TaskCard
                    key={item.task.id}
                    task={item.task}
                    decisions={taskDecisions}
                    responsible={familyMembers.find((m) => m.id === item.task.assignedMemberId) ?? null}
                    responsibleNames={taskResponsibleNames(item.task, familyMembers)}
                    reminder={{
                      reminders: taskReminders[item.task.id] ?? [],
                      hint: reminderHintFor(item.task),
                      gate: reminderGateFor(item.task),
                      saving: savingReminderTaskId === item.task.id,
                      onTogglePreset: (key) => void toggleTaskReminderPreset(item.task, key),
                      onClear: () => void clearTaskReminders(item.task),
                      onOpenCustom: () => setEditingTaskId(item.task.id),
                      onNoDateTap: () => showToast('Añade una fecha a la tarea para poder configurar avisos.'),
                      onEnableCalendar: () => enableCalendarForReminder(item.task),
                    }}
                    highlighted={item.task.id === deepLinkHighlightTaskId}
                    onToggleDone={() => void completeTaskWithNextStep(item.task)}
                    onEdit={() => setEditingTaskId(item.task.id)}
                    onDelete={() => deleteEventTask(item.task.id).then(reloadTasks)}
                  />
                ) : (
                  // "📦 NOMBRE" se muestra UNA vez, como cabecera del encargo entero — nunca repetido en
                  // cada tarjeta (ver TaskCard, que ya no recibe groupName aquí). Cada tarea conserva
                  // todos sus controles normales (checkbox, campana, ⋯...).
                  <div key={item.groupId} className="card member-form" style={{ background: groupColors.get(item.groupName) }}>
                    <div className="inline-fields" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                      <strong>📦 {item.groupName.toUpperCase()}</strong>
                      {/* Bug real corregido (decisión explícita de la usuaria): todo "group" que llega aquí
                          tiene SIEMPRE al menos una tarea pendiente (buildTaskGroupRenderItems solo lo crea
                          a partir de visibleTasks, ya filtrado a !done) — así que un encargo con
                          resolvedAt YA puesto pero con algo pendiente nuevo (p. ej. un complemento floral
                          decidido después de resolver Flores) NUNCA debe mostrarse como "✅ Resuelto" sin
                          más: eso ocultaba que había trabajo nuevo. El botón "Resolver encargo" sale
                          SIEMPRE que haya algo pendiente; si además ya hubo una resolución antes, se
                          conserva como referencia histórica (nunca se borra ni se sobrescribe aquí — ver
                          resolveEventTaskGroup, que ahora además guarda cada resolución en
                          event_task_group_resolutions). */}
                      <button type="button" className="link-button" onClick={() => setResolvingGroup(item.group)}>
                        Resolver encargo
                      </button>
                    </div>
                    {item.group.resolvedAt && (
                      <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>
                        Antes resuelto: {RESOLUTION_METHOD_LABELS[item.group.resolutionMethod ?? 'otro']}
                        {item.group.providerName ? ` · ${item.group.providerName}` : ''} — hay algo nuevo pendiente.
                      </p>
                    )}
                    <div className="event-list" style={{ marginTop: 6 }}>
                      {item.tasks.map((t) => (
                        <TaskCard
                          key={t.id}
                          task={t}
                          decisions={taskDecisions}
                          responsible={familyMembers.find((m) => m.id === t.assignedMemberId) ?? null}
                          responsibleNames={taskResponsibleNames(t, familyMembers)}
                          reminder={{
                            reminders: taskReminders[t.id] ?? [],
                            hint: reminderHintFor(t),
                            gate: reminderGateFor(t),
                            saving: savingReminderTaskId === t.id,
                            onTogglePreset: (key) => void toggleTaskReminderPreset(t, key),
                            onClear: () => void clearTaskReminders(t),
                            onOpenCustom: () => setEditingTaskId(t.id),
                            onNoDateTap: () => showToast('Añade una fecha a la tarea para poder configurar avisos.'),
                            onEnableCalendar: () => enableCalendarForReminder(t),
                          }}
                          highlighted={t.id === deepLinkHighlightTaskId}
                          onToggleDone={() => void completeTaskWithNextStep(t)}
                          onEdit={() => setEditingTaskId(t.id)}
                          onDelete={() => deleteEventTask(t.id).then(reloadTasks)}
                        />
                      ))}
                    </div>
                  </div>
                ),
              )}
            </div>
            {pendingTasks.length > 5 && (
              <button type="button" className="link-button" onClick={() => setShowAllTasks((v) => !v)}>
                {showAllTasks ? 'Ver menos' : `Ver todas (${pendingTasks.length})`}
              </button>
            )}
            {completedTasks.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid #eee' }}>
                <button type="button" className="link-button" onClick={() => setShowCompletedTasks((v) => !v)}>
                  {showCompletedTasks ? '▲' : '▼'} ✔️ Completadas ({completedTasks.length})
                </button>
                {showCompletedTasks && (
                  <div className="event-list" style={{ marginTop: 8 }}>
                    {completedTasks.map((t) => (
                      <TaskCard
                        key={t.id}
                        task={t}
                        decisions={taskDecisions}
                        responsible={familyMembers.find((m) => m.id === t.assignedMemberId) ?? null}
                        responsibleNames={taskResponsibleNames(t, familyMembers)}
                        groupName={eventTaskGroups.find((g) => g.id === t.groupId)?.name ?? null}
                        groupColor={groupColors.get(eventTaskGroups.find((g) => g.id === t.groupId)?.name ?? '') ?? null}
                        onToggleDone={() => updateEventTask(t.id, { done: false }).then(reloadTasks)}
                        onEdit={() => setEditingTaskId(t.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
            {editingTask && (
              <TaskEditModal
                task={editingTask}
                eventId={event.id}
                familyMembers={familyMembers}
                helpers={eventHelpers}
                onHelpersChanged={reloadEventHelpers}
                groups={eventTaskGroups}
                onClose={() => setEditingTaskId(null)}
                onSaved={() => {
                  setEditingTaskId(null)
                  reloadTasks()
                }}
              />
            )}
            {creatingTask && (
              <TaskEditModal
                eventId={event.id}
                familyMembers={familyMembers}
                helpers={eventHelpers}
                onHelpersChanged={reloadEventHelpers}
                groups={eventTaskGroups}
                initialGroupId={creatingTaskInGroup}
                onClose={() => setCreatingTask(false)}
                onSaved={() => {
                  setCreatingTask(false)
                  reloadTasks()
                }}
              />
            )}
            {managingHelpers && (
              <EventHelpersModal eventId={event.id} helpers={eventHelpers} onHelpersChanged={reloadEventHelpers} onClose={() => setManagingHelpers(false)} />
            )}
            {managingGroups && (
              <EventTaskGroupsModal
                eventId={event.id}
                groups={eventTaskGroups}
                tasks={tasks}
                onGroupsChanged={async () => {
                  await reloadEventTaskGroups()
                  await reloadTasks()
                }}
                onClose={() => setManagingGroups(false)}
                onCreateTaskInGroup={(groupId) => {
                  setCreatingTaskInGroup(groupId)
                  setManagingGroups(false)
                  setCreatingTask(true)
                }}
              />
            )}
            {resolvingGroup && (
              <ResolveGroupModal
                event={event}
                group={resolvingGroup}
                tasks={tasks.filter((t) => t.groupId === resolvingGroup.id && !t.done)}
                onClose={() => setResolvingGroup(null)}
                onResolved={async () => {
                  const group = resolvingGroup
                  setResolvingGroup(null)
                  await reloadTasks()
                  await reloadEventTaskGroups()
                  const suggestions = suggestNextStepsForGroup(group)
                  if (suggestions.length > 0) setNextStepPrompt({ sourceLabel: group.name, suggestions, createdKeys: new Set() })
                }}
              />
            )}
            {nextStepPrompt && (
              <NextStepPromptModal
                prompt={nextStepPrompt}
                onClose={() => setNextStepPrompt(null)}
                onCreate={(s) => setFollowUpCreate({ initialTitle: s.title, suggestionKey: s.key })}
                onCreateOther={() => setFollowUpCreate({ initialTitle: '', suggestionKey: null })}
                onDismiss={(key) =>
                  setNextStepPrompt((prev) => (prev ? { ...prev, suggestions: prev.suggestions.filter((s) => s.key !== key) } : null))
                }
              />
            )}
            {followUpCreate && (
              <TaskEditModal
                eventId={event.id}
                familyMembers={familyMembers}
                helpers={eventHelpers}
                onHelpersChanged={reloadEventHelpers}
                groups={eventTaskGroups}
                initialTitle={followUpCreate.initialTitle}
                onClose={() => setFollowUpCreate(null)}
                onSaved={() => {
                  const key = followUpCreate.suggestionKey
                  setFollowUpCreate(null)
                  if (key) setNextStepPrompt((prev) => (prev ? { ...prev, createdKeys: new Set(prev.createdKeys).add(key) } : null))
                  reloadTasks()
                }}
              />
            )}
          </div>
        )
      }
      case 'invitados':
        return <GuestsSection key={`invitados-${refreshKey}`} event={event} onOpenInvitation={() => setOpenModule('invitaciones')} />
      case 'invitaciones':
        return <InvitationSection key={`invitaciones-${refreshKey}`} event={event} />
      case 'mesas':
        return <TablesSection key={`mesas-${refreshKey}`} event={event} />
      case 'presupuesto':
        return <BudgetSection key={`presupuesto-${refreshKey}`} event={event} />
      case 'menu_compra':
        return (
          <EventMenuSection
            key={`menu-${refreshKey}`}
            event={event}
            onDerivedDataChanged={() => {
              reloadTasks()
              reloadDashboardStats()
            }}
          />
        )
      case 'compras':
        return <EventShoppingSection items={shoppingItems} />
      case 'decoracion':
        return <DecorationSection key={`decoracion-${refreshKey}`} eventId={event.id} />
      case 'actividades':
        return <ActivitiesSection key={`actividades-${refreshKey}`} eventId={event.id} />
      case 'proveedores':
        return <ProvidersSection eventId={event.id} />
      case 'pagos':
        return <PaymentsSection event={event} />
      case 'detalles':
        return <DetailsSection eventId={event.id} tasks={tasks} onTasksChanged={reloadTasks} />
      case 'regalos':
        return <GiftsSection eventId={event.id} />
      case 'plan_dia':
        return <DayPlanSection eventId={event.id} />
      default:
        return null
    }
  }

  if (openModule !== null) {
    // Sin "‹ {icono} {título}" aquí: el breadcrumb de arriba (SectionBreadcrumb, en EventosScreen) ya
    // muestra "Eventos / {título} / {módulo}" con "{título}" como enlace real de vuelta a este mismo
    // dashboard (state.eventHome) — un segundo control para el mismo destino era navegación duplicada.
    return (
      <div>
        {error && <p className="error">{error}</p>}
        <div style={{ marginTop: 8 }}>{renderOpenModule()}</div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button type="button" className="link-button" onClick={onBack}>
          ← Todos los eventos
        </button>
        <div className="filter-row" style={{ gap: 4 }}>
          <button type="button" className="link-button" onClick={() => setShowManage(true)}>
            ⚙️ Gestionar evento
          </button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="card event-card event-hero-card" style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Petición real: dos filas —el tipo y debajo el nombre— con el
                emoji más grande repartido entre las dos, para todos los eventos. */}
            <div className="event-hero-title">
              <span className="event-hero-emoji">{EVENT_TYPE_META[event.type].icon}</span>
              <div style={{ minWidth: 0 }}>
                <FitText as="strong" maxSize={18}>
                  {EVENT_TYPE_META[event.type].label}
                </FitText>
                {eventNameWithoutType(event) && (
                  <FitText as="strong" maxSize={18}>
                    {eventNameWithoutType(event)}
                  </FitText>
                )}
              </div>
            </div>
            {/* Petición real: fecha corta ("Domingo, 18/10/2026") en una sola
                línea, con el estado (✔️ confirmada / ❓ provisional) DETRÁS de
                la fecha —es un botón que abre la edición— y el lugar del
                mismo tamaño que la fecha, para que la cuenta atrás pueda
                ser más grande. */}
            <FitText as="p" maxSize={14} className="muted event-hero-line" style={{ margin: '6px 0 0' }}>
              📅 {eventShortDateLabel(event)}
              {event.eventDate && (
                <span
                  className="event-status-badge"
                  title={event.dateStatus === 'confirmada' ? 'Fecha confirmada' : 'Fecha provisional'}
                  aria-label={event.dateStatus === 'confirmada' ? 'Fecha confirmada' : 'Fecha provisional'}
                >
                  {event.dateStatus === 'confirmada' ? '✓' : '◷'}
                </span>
              )}
            </FitText>
            {/* Fase 2 — un evento estructurado por momentos (boda/comunión/bautizo con Ceremonia y
                Celebración) no tiene un único "Lugar": mostrarlo aquí además del bloque de Momentos de
                más abajo era el mismo dato duplicado que "Gestionar evento" (auditoría real: "Boda de
                plata" tenía venue_label = celebration_location_label, el mismo restaurante dos veces). */}
            {event.venueLabel && !isEventStructuredByMoments(event) && (
              <FitText as="p" maxSize={14} className="muted event-hero-line" style={{ margin: '2px 0 0' }}>
                🏠 {event.venueLabel}
              </FitText>
            )}
            <FitText as="p" maxSize={14} className="muted event-hero-line" style={{ margin: '2px 0 0' }}>
              🎨 Tema: {event.theme || 'no'}
            </FitText>
            {event.status === 'archivado' && <p className="muted">📦 Archivado</p>}
          </div>
          {/* Petición real: cuenta atrás "30 días para celebrarlo" junto
              al título, en un círculo pastel — solo tiene sentido con
              fecha puesta y evento todavía en marcha. */}
          {event.status === 'planificacion' && daysToEvent !== null && (
            <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: 104 }}>
              <div className={`event-countdown event-countdown-${countdownTone(daysToEvent)}`}>
                {daysToEvent > 0 ? (
                  <strong className="event-countdown-number">{daysToEvent}</strong>
                ) : daysToEvent === 0 ? (
                  <strong className="event-countdown-number" style={{ fontSize: 22 }}>¡Hoy!</strong>
                ) : (
                  <span style={{ fontSize: 11 }}>Ya pasó</span>
                )}
              </div>
              {daysToEvent >= 0 && (
                <span className="muted" style={{ fontSize: 11, textAlign: 'center', lineHeight: 1.2 }}>
                  {daysToEvent === 0 ? '¡Celebrarlo hoy! 🎉' : 'días para celebrarlo 🎉'}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {event.status === 'planificacion' && event.dateStatus === 'confirmada' && isToday(event.eventDate) && <EventDayBanner event={event} />}
      {event.status === 'planificacion' && <PepaConclusions event={event} />}

      {/* Configurador — Ceremonia y celebración (Fase 2) y, solo en boda, La pareja (Fase 3) están
          implementados. El propio componente decide si tiene algo que mostrar
          (isEventStructuredByMoments); el resto de bloques del documento maestro (Invitados, Momentos
          especiales...) llegan en fases posteriores, no en esta. */}
      <EventPlanningConfigurator
        event={event}
        onChanged={onChanged}
        onOpenMenu={() => setOpenModule('menu_compra')}
        onDerivedDataChanged={() => {
          reloadTasks()
          reloadDashboardStats()
        }}
      />

      {/* Fase 2 — "Estado del evento": auditoría real encontró que
          "Preparación del evento" (media de %tareas y %invitados) podía
          enseñar "50 %" con 0 de 6 tareas hechas y 2 ya vencidas, solo
          porque los invitados estaban confirmados — un número que
          escondía justo el problema en vez de mostrarlo. Se sustituye
          por indicadores independientes y verificables, sin inventar
          otra fórmula agregada; lo urgente (atrasadas) tiene su propia
          prioridad visual en vez de diluirse en una media. */}
      {(hasTasksModule && statusSummary.tasksTotal > 0) ||
      (hasGuestsModule && statusSummary.guestsTotalPeople > 0) ||
      (hasBudgetModule && statusSummary.budgetSpent !== null) ? (
        <div className="card event-card" style={{ marginTop: 8 }}>
          <strong>Estado del evento</strong>
          {/* Fase 7 — barra dinámica: el color (level) nunca depende solo
              de la media interna (progress) — una incidencia real
              (tarea/pago atrasado, presupuesto superado) fija el color
              directamente. El número de "progress" no se enseña nunca,
              solo se usa para el ancho de la barra. */}
          <div className={`event-health-bar event-health-${eventHealth.level}`} style={{ marginTop: 8 }}>
            <div className="event-health-bar-fill" style={{ width: `${eventHealth.progress}%` }} />
          </div>
          <p style={{ margin: '6px 0 0', fontWeight: 600 }}>
            {EVENT_HEALTH_EMOJI[eventHealth.level]} {eventHealth.label} · {eventHealth.message}
          </p>
          <div className="event-readiness-stats" style={{ marginTop: 10 }}>
            {hasTasksModule && statusSummary.tasksTotal > 0 && (
              <div>
                <strong>
                  {statusSummary.tasksDone} de {statusSummary.tasksTotal}
                </strong>
                <span className="muted"> tareas completadas</span>
                {statusSummary.tasksOverdue > 0 && (
                  <div style={{ color: '#dc2626', fontWeight: 600, marginTop: 2 }}>
                    🔴 {statusSummary.tasksOverdue} {statusSummary.tasksOverdue === 1 ? 'atrasada' : 'atrasadas'}
                  </div>
                )}
              </div>
            )}
            {hasGuestsModule && statusSummary.guestsTotalPeople > 0 && (
              <div>
                <strong>
                  {statusSummary.guestsConfirmedPeople} de {statusSummary.guestsTotalPeople}
                </strong>
                <span className="muted"> invitados confirmados</span>
                {statusSummary.guestsPendingCount > 0 && (
                  <div className="muted" style={{ marginTop: 2 }}>
                    {statusSummary.guestsPendingCount} {statusSummary.guestsPendingCount === 1 ? 'pendiente de responder' : 'pendientes de responder'}
                  </div>
                )}
              </div>
            )}
            {hasBudgetModule && statusSummary.budgetSpent !== null && (
              <div>
                <strong>{statusSummary.budgetSpent.toFixed(2)} €</strong>
                <span className="muted"> de {statusSummary.budgetPlanned.toFixed(2)} €</span>
              </div>
            )}
          </div>
          {statusSummary.nextMilestone && (
            <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
              Próximo hito: {statusSummary.nextMilestone.kind === 'tarea' ? '✅' : '🧾'} {statusSummary.nextMilestone.label} —{' '}
              {statusSummary.nextMilestone.daysUntil === 0 ? 'hoy' : statusSummary.nextMilestone.daysUntil === 1 ? 'mañana' : `en ${statusSummary.nextMilestone.daysUntil} días`}
            </p>
          )}
        </div>
      ) : null}

      {hasTasksModule && upcomingTasks.length > 0 && (
        <div className="card event-card event-recommend-card" style={{ marginTop: 8 }}>
          <strong>💡 Pepa te recomienda</strong>
          <p className="muted" style={{ margin: '2px 0 8px', fontSize: 13 }}>
            Estas son las próximas tareas importantes:
          </p>
          <div className="event-list">
            {upcomingTasks.map(({ task, daysUntil: d, explanation }) => {
              const responsible = familyMembers.find((m) => m.id === task.assignedMemberId)
              const reminder = upcomingReminders[task.id]
              // Aquí, a diferencia de la tarjeta compacta, sí hay sitio para el nombre completo — y debe
              // ser la prioridad EFECTIVA (recalculada en vivo), nunca la guardada a secas.
              const recommendedPriority = effectivePriority(task, taskDecisions).priority
              return (
                <div key={task.id} className="inline-fields" style={{ alignItems: 'center' }}>
                  {recommendedPriority && <span className={`event-priority-dot event-priority-${recommendedPriority}`} aria-hidden="true" />}
                  <input type="checkbox" checked={task.done} onChange={() => updateEventTask(task.id, { done: true }).then(reloadTasks)} />
                  <span style={{ flex: 1 }}>
                    {task.title}
                    {/* Motivo breve y estructurado (práctica, reserva, fecha real…): sin texto inventado. */}
                    <span className="muted" style={{ display: 'block', fontSize: 12 }}>
                      {recommendedPriority && `Prioridad ${PRIORITY_LABELS[recommendedPriority]} · `}
                      {explanation}
                    </span>
                    {responsible && (
                      <span className="muted" style={{ fontSize: 12 }}>
                        {' '}
                        · Responsable: {responsible.name}
                      </span>
                    )}
                    {/* Fase 11 — recordatorio solo si aporta valor: solo cuando existe uno de verdad. */}
                    {reminder && (
                      <span className="muted" style={{ fontSize: 12 }}>
                        {' '}
                        · 🔔 {reminderLabel(reminder.minutesBefore, reminder.anchor)}
                      </span>
                    )}
                  </span>
                  {task.dueDate && (
                    <span className="muted" style={{ fontSize: 12 }}>
                      {d !== null && d < 0 ? `Venció el ${formatSpanishDate(task.dueDate)}` : `Vence el ${formatSpanishDate(task.dueDate)}`}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          <button type="button" className="link-button" onClick={() => setOpenModule('tareas')}>
            Ver todas →
          </button>
        </div>
      )}

      {/* Sugerencias de PEPA sobre una prioridad que YA fijó el usuario — nunca la cambia sola, solo
          propone con motivo. Una rechazada no vuelve a aparecer para el mismo contexto. */}
      {hasTasksModule && prioritySuggestions.length > 0 && (
        <div className="card event-card event-recommend-card" style={{ marginTop: 8 }}>
          <strong>💡 PEPA propone un cambio de prioridad</strong>
          <div className="event-list" style={{ marginTop: 6 }}>
            {prioritySuggestions.map((s) => {
              const task = tasks.find((t) => t.id === s.taskId)
              if (!task) return null
              return (
                <div key={s.id} style={{ fontSize: 13 }}>
                  <p style={{ margin: '0 0 4px' }}>{explainPrioritySuggestion(task.title, s.currentPriority, s.proposedPriority, s.reason)}</p>
                  <div className="inline-fields">
                    <button
                      type="button"
                      onClick={() => respondToEventTaskPrioritySuggestion(s.id, true).then(() => Promise.all([reloadTasks(), reloadPrioritySuggestions()]))}
                    >
                      {s.currentPriority ? (PRIORITY_ORDER[s.proposedPriority] > PRIORITY_ORDER[s.currentPriority] ? 'Subir prioridad' : 'Bajar prioridad') : 'Asignar prioridad'}
                    </button>
                    <button type="button" className="secondary" onClick={() => respondToEventTaskPrioritySuggestion(s.id, false).then(reloadPrioritySuggestions)}>
                      Mantenerla como está
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="card-grid" style={{ marginTop: 8 }}>
        {moduleCards.map((card, i) => (
          <button
            key={card.key}
            type="button"
            className="card event-module-card home-card"
            style={{ background: cardColors[i] }}
            onClick={() => setOpenModule(card.key)}
          >
            <div>
              <h2>{card.label}</h2>
              <p className="muted">{card.stat}</p>
            </div>
            <span className="home-card-icon">{card.icon}</span>
          </button>
        ))}
      </div>

      {event.status === 'planificacion' && (
        <div className="card event-card" style={{ marginTop: 8 }}>
          <button type="button" className="link-button" onClick={() => setShowPlan(true)}>
            🪄 Organízamelo Pepa
          </button>
          <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Propuesta de presupuesto, menú, decoración y actividades típicas de este tipo de evento — revisas y eliges qué aplicar, no se escribe nada solo.
          </p>
        </div>
      )}

      {showManage && (
        <ManageEventModal
          event={event}
          onClose={() => setShowManage(false)}
          onChanged={onChanged}
          onSaveTemplate={() => {
            setShowManage(false)
            setShowSaveTemplate(true)
          }}
          onArchive={() => {
            setShowManage(false)
            setShowEndSummary(true)
          }}
          onReactivate={() => {
            setShowManage(false)
            unarchiveEvent(event.id).then(onChanged)
          }}
          onDuplicate={() => {
            setShowManage(false)
            duplicateEvent(event.id).then(onDuplicated)
          }}
          onDelete={() => deleteEvent(event.id).then(onArchivedOrDeleted)}
        />
      )}
      {showPlan && (
        <OrganizamePepaModal
          event={event}
          onClose={() => setShowPlan(false)}
          onApplied={() => {
            setShowPlan(false)
            setRefreshKey((k) => k + 1)
            onChanged()
          }}
        />
      )}
      {showSaveTemplate && <SaveTemplateModal event={event} onClose={() => setShowSaveTemplate(false)} onSaved={() => setShowSaveTemplate(false)} />}
      {showEndSummary && (
        <EndSummaryModal
          event={event}
          onClose={() => setShowEndSummary(false)}
          onConfirmed={() => {
            setShowEndSummary(false)
            archiveEvent(event.id).then(onArchivedOrDeleted)
          }}
        />
      )}
    </div>
  )
}

// Fase 1 — reforma de Editar/•••: auditoría real ("no queda claro qué
// se administra desde cada uno") encontró que "Editar" y "•••" son en
// realidad la misma clase de acción (configurar el evento) repartida
// sin ningún criterio visible al usuario, y que además "Ceremonia"
// (para Comunión/Bautizo/Boda) era una TERCERA superficie de edición
// estructural, aparte de las otras dos. Un único punto de entrada
// ("Gestionar evento"), con tres grupos claramente separados:
// Información (qué es el evento) / Secciones (qué módulos tiene
// activos — única fuente de verdad de enabledModules, ver
// addEnabledModules en data/events.ts, reutilizada también por
// "Organízamelo Pepa") / Acciones (duplicar, archivar, borrar — las
// destructivas al final, separadas visualmente). No se duplica ningún
// dato de Ceremonia: reutiliza tal cual CeremoniaSection (mismas
// columnas, mismo guardado), solo cambia DÓNDE se muestra.
function ManageEventModal({
  event,
  onClose,
  onChanged,
  onSaveTemplate,
  onArchive,
  onReactivate,
  onDuplicate,
  onDelete,
}: {
  event: FamilyEvent
  onClose: () => void
  onChanged: () => void
  onSaveTemplate: () => void
  onArchive: () => void
  onReactivate: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const [title, setTitle] = useState(event.title)
  const [theme, setTheme] = useState(event.theme ?? '')
  const [rsvpDeadline, setRsvpDeadline] = useState(event.rsvpDeadline ?? '')
  const [savingInfo, setSavingInfo] = useState(false)
  const [infoError, setInfoError] = useState<string | null>(null)
  const [infoSaved, setInfoSaved] = useState(false)

  const [modules, setModules] = useState<EventModuleKey[]>(event.enabledModules)
  const [savingModules, setSavingModules] = useState(false)
  const [modulesError, setModulesError] = useState<string | null>(null)
  const [modulesSaved, setModulesSaved] = useState(false)

  // "👰🤵 La pareja" — datos estructurales del evento (mismo patrón que details.ageTurning en cumpleaños,
  // sin migración nueva); el rol solo adapta sugerencias, nunca restringe. Merge explícito con event.details
  // al guardar para no perder otras claves que puedan convivir ahí.
  const details = event.details as { partner1Name?: string; partner1Role?: PartnerRole; partner2Name?: string; partner2Role?: PartnerRole }
  const [partner1Name, setPartner1Name] = useState(details.partner1Name ?? '')
  const [partner1Role, setPartner1Role] = useState<PartnerRole | ''>(details.partner1Role ?? '')
  const [partner2Name, setPartner2Name] = useState(details.partner2Name ?? '')
  const [partner2Role, setPartner2Role] = useState<PartnerRole | ''>(details.partner2Role ?? '')
  const [savingPair, setSavingPair] = useState(false)
  const [pairError, setPairError] = useState<string | null>(null)
  const [pairSaved, setPairSaved] = useState(false)

  async function handleSavePair(ev: FormEvent) {
    ev.preventDefault()
    setSavingPair(true)
    setPairError(null)
    setPairSaved(false)
    try {
      await updateEvent(event.id, {
        details: {
          ...event.details,
          partner1Name: partner1Name.trim() || null,
          partner1Role: partner1Role || null,
          partner2Name: partner2Name.trim() || null,
          partner2Role: partner2Role || null,
        },
      })
      onChanged()
      setPairSaved(true)
    } catch (err) {
      setPairError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSavingPair(false)
    }
  }

  async function handleSaveInfo(ev: FormEvent) {
    ev.preventDefault()
    setSavingInfo(true)
    setInfoError(null)
    setInfoSaved(false)
    try {
      // La fecha y el lugar ya NO se editan aquí: viven en el primer bloque del configurador («Ceremonia y
      // celebración» / «Celebración»), única fuente para el resto de la app.
      await updateEvent(event.id, {
        title,
        theme: theme || null,
        rsvpDeadline: rsvpDeadline || null,
      })
      onChanged()
      setInfoSaved(true)
    } catch (err) {
      setInfoError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSavingInfo(false)
    }
  }

  async function handleSaveModules() {
    setSavingModules(true)
    setModulesError(null)
    setModulesSaved(false)
    try {
      await updateEvent(event.id, { enabledModules: modules })
      onChanged()
      setModulesSaved(true)
    } catch (err) {
      setModulesError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSavingModules(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Gestionar evento
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <strong style={{ fontSize: 13, display: 'block', marginTop: 4 }}>Información del evento</strong>
        <form className="card member-form" onSubmit={handleSaveInfo} style={{ marginTop: 4 }}>
          {infoError && <p className="error">{infoError}</p>}
          <label>
            Nombre
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <p className="muted" style={{ fontSize: 12, margin: '0 0 4px' }}>
            📅 La fecha, el lugar y lo que incluye se deciden en ✨ «Cómo queréis que sea vuestro evento» →{' '}
            {isEventStructuredByMoments(event) ? 'Ceremonia y celebración' : 'Celebración'}.
          </p>
          <label>
            Tema
            <input type="text" value={theme} onChange={(e) => setTheme(e.target.value)} />
          </label>
          <label>
            Plazo de RSVP (opcional)
            <input type="date" value={rsvpDeadline} onChange={(e) => setRsvpDeadline(e.target.value)} />
          </label>
          <button type="submit" disabled={savingInfo}>
            {savingInfo ? 'Guardando…' : infoSaved ? '✓ Guardado' : 'Guardar información'}
          </button>
        </form>

        {event.type === 'boda' && (
          <form className="card event-card" style={{ marginTop: 8 }} onSubmit={handleSavePair}>
            <strong>👰🤵 La pareja</strong>
            <p className="muted" style={{ fontSize: 13 }}>
              Los nombres se usan en los textos de "La pareja" y podrán reutilizarse en invitaciones y Preparativos. El rol solo adapta sugerencias, nunca limita las opciones.
            </p>
            {pairError && <p className="error">{pairError}</p>}
            <label>
              Nombre de Pareja 1
              <input type="text" value={partner1Name} onChange={(e) => setPartner1Name(e.target.value)} placeholder="Ej. Laura" />
            </label>
            <label>
              Tratamiento/rol (opcional)
              <select value={partner1Role} onChange={(e) => setPartner1Role(e.target.value as PartnerRole | '')}>
                <option value="">Sin especificar</option>
                {PARTNER_ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nombre de Pareja 2
              <input type="text" value={partner2Name} onChange={(e) => setPartner2Name(e.target.value)} placeholder="Ej. Miguel" />
            </label>
            <label>
              Tratamiento/rol (opcional)
              <select value={partner2Role} onChange={(e) => setPartner2Role(e.target.value as PartnerRole | '')}>
                <option value="">Sin especificar</option>
                {PARTNER_ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={savingPair}>
              {savingPair ? 'Guardando…' : pairSaved ? '✓ Guardado' : 'Guardar nombres'}
            </button>
          </form>
        )}

        <strong style={{ fontSize: 13, display: 'block', marginTop: 16 }}>Secciones del evento</strong>
        <p className="muted" style={{ fontSize: 12, margin: '2px 0 6px' }}>
          Los módulos que quites se ocultan, pero no se borra nada — puedes reactivarlos cuando quieras.
        </p>
        {modulesError && <p className="error">{modulesError}</p>}
        <ModulePickerChips modules={modules} onChange={setModules} />
        <button
          type="button"
          className="link-button"
          onClick={handleSaveModules}
          disabled={savingModules}
          style={{ marginTop: 8 }}
        >
          {savingModules ? 'Guardando…' : modulesSaved ? '✓ Guardado' : 'Guardar secciones'}
        </button>

        <strong style={{ fontSize: 13, display: 'block', marginTop: 16 }}>Acciones del evento</strong>
        <div className="event-list" style={{ marginTop: 4 }}>
          <button type="button" className="link-button" onClick={onSaveTemplate} style={{ display: 'block' }}>
            💾 Guardar como plantilla
          </button>
          <button type="button" className="link-button" onClick={onDuplicate} style={{ display: 'block' }}>
            📋 Duplicar
          </button>
        </div>

        {/* Destructivas/de ciclo de vida, separadas visualmente al final
            (auditoría, hallazgo E: "estructural" vs "operativo" mezclados
            dentro del mismo menú era parte de la confusión). */}
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #eee' }}>
          {event.status === 'planificacion' ? (
            <button type="button" className="link-button" onClick={onArchive} style={{ display: 'block' }}>
              📦 Finalizar y archivar
            </button>
          ) : (
            <button type="button" className="link-button" onClick={onReactivate} style={{ display: 'block' }}>
              Reactivar
            </button>
          )}
          <div style={{ marginTop: 4 }}>
            <ConfirmButton label="Borrar evento" confirmLabel="Borrar" className="link-button" onConfirm={onDelete} />
          </div>
        </div>
      </div>
    </div>
  )
}

// Petición real: "Compras" en la rejilla del dashboard — mini-vista de
// solo lectura con los pendientes de ESTE evento (shopping_items.
// event_id, hasta ahora escrito pero nunca leído de vuelta, ver
// listShoppingItems). La gestión de verdad (marcar comprado, añadir,
// borrar) se sigue haciendo en Compras — aquí solo se ve qué falta y
// se enlaza allí.
// Fase 8 — rediseño de Preparativos: ficha compacta táctil en vez de
// una fila de tabla (checkbox+texto+fecha+responsable+✕ compitiendo
// por el mismo espacio horizontal, con la fecha en ISO crudo). Título
// protagonista, fecha/responsable como línea secundaria, acciones
// (editar/borrar) detrás de "⋯" — nunca un select permanente ni la ✕
// siempre visible.
// Campana rápida: muestra si la tarea tiene aviso y permite cambiarlo sin abrir el editor. No sustituye a
// «Mostrar en Calendario» ni inventa avisos cuando la tarea no tiene fecha.
const REMINDER_PRESET_LABEL: Record<ReminderPresetKey, string> = {
  same_day: '🔔 El mismo día',
  '1_day': '🔔 1 día antes',
  '1_week': '🔔 1 semana antes',
}
const REMINDER_PRESET_ORDER: ReminderPresetKey[] = ['same_day', '1_day', '1_week']

// Varios avisos a la vez (antes uno exclusivo): el menú ahora es multiselección — tocar un preset lo
// alterna SIN cerrar el menú (para marcar varios sin reabrir tres veces), «Sin aviso» quita todos y
// cierra, «Personalizado» abre el editor completo (tiene su propia cantidad/unidad) y también cierra.
// Mientras se guarda un toque (saving), los controles se deshabilitan: dos toques rápidos nunca lanzan
// dos escrituras en paralelo que puedan pisarse.
function ReminderBell({
  taskTitle,
  reminders,
  hint,
  gate,
  saving,
  onTogglePreset,
  onClear,
  onOpenCustom,
  onNoDateTap,
  onEnableCalendar,
}: {
  taskTitle: string
  reminders: EventReminder[]
  hint: string | null
  gate: 'ok' | 'no_date' | 'not_in_calendar'
  saving: boolean
  onTogglePreset: (key: ReminderPresetKey) => void
  onClear: () => void
  onOpenCustom: () => void
  onNoDateTap: () => void
  onEnableCalendar: () => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  // Añadir al Calendario (cuando el único motivo es que todavía no está) tarda un instante: mientras
  // tanto, el botón se deshabilita para no lanzar dos enlaces a la vez.
  const [linking, setLinking] = useState(false)
  const selection = taskReminderSelectionFrom(reminders)
  const active = hasAnyReminder(reminders)
  const summary = active
    ? [...REMINDER_PRESET_ORDER.filter((k) => selection.presets.has(k)).map((k) => REMINDER_PRESET_LABEL[k]), selection.custom ? '🔔 Personalizado' : null]
        .filter((x): x is string => x !== null)
        .join(' · ')
    : 'Sin aviso'

  // Bloque A — la campana ya no se queda simplemente deshabilitada cuando no hay fecha o cuando la tarea
  // no está en Calendario: explica el motivo y, si solo falta añadirla a Calendario, ofrece hacerlo ahí
  // mismo (reutilizando linkEventTaskToCalendar, idempotente) y abre el selector al momento.
  async function handleClick() {
    if (gate === 'no_date') {
      onNoDateTap()
      return
    }
    if (gate === 'not_in_calendar') {
      if (!window.confirm('Para añadir avisos, esta tarea debe estar en el Calendario. ¿Añadirla?')) return
      setLinking(true)
      const ok = await onEnableCalendar().finally(() => setLinking(false))
      if (ok) setOpen(true)
      return
    }
    setOpen((v) => !v)
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className="icon-button"
        aria-label={`Aviso de "${taskTitle}"`}
        title={hint ?? summary}
        disabled={linking}
        onClick={() => void handleClick()}
        style={{ color: active ? 'var(--primary, #4f46e5)' : undefined, opacity: hint ? 0.4 : 1 }}
      >
        {active ? '🔔' : '🔕'}
      </button>
      {open && gate === 'ok' && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 1 }} onClick={() => setOpen(false)} />
          <div className="event-task-menu" style={{ zIndex: 2 }}>
            <button
              type="button"
              className="link-button"
              style={{ display: 'block', width: '100%', textAlign: 'left' }}
              disabled={saving}
              onClick={() => {
                setOpen(false)
                onClear()
              }}
            >
              🔕 Sin aviso
            </button>
            {REMINDER_PRESET_ORDER.map((key) => (
              <button
                key={key}
                type="button"
                className="link-button"
                style={{ display: 'block', width: '100%', textAlign: 'left' }}
                disabled={saving}
                onClick={() => onTogglePreset(key)}
              >
                {selection.presets.has(key) ? '✓ ' : ''}
                {REMINDER_PRESET_LABEL[key]}
              </button>
            ))}
            <button
              type="button"
              className="link-button"
              style={{ display: 'block', width: '100%', textAlign: 'left' }}
              disabled={saving}
              onClick={() => {
                setOpen(false)
                onOpenCustom()
              }}
            >
              {selection.custom ? '✓ ' : ''}
              🔔 Personalizado
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// Tanda Encargos v2 — etiqueta visible para cada EventTaskGroupResolutionMethod real.
const RESOLUTION_METHOD_LABELS: Record<EventTaskGroupResolutionMethod, string> = {
  empresa: 'Empresa/proveedor',
  nosotros: 'Lo hacemos nosotros',
  ayuda: 'Nos ayuda alguien',
  otro: 'Otra opción',
}

function TaskCard({
  task,
  decisions = [],
  responsible,
  responsibleNames,
  groupName = null,
  groupColor = null,
  reminder,
  highlighted = false,
  onToggleDone,
  onEdit,
  onDelete,
}: {
  task: EventTask
  // Para que PEPA pueda recalcular en vivo la prioridad de las tareas que gestiona (effectivePriority) —
  // ausente = se trata como si la tarea no dependiera de ninguna decisión (nunca rompe, solo es menos preciso).
  decisions?: DecisionLookup[]
  responsible: FamilyMember | null
  // Preparativos: todos los responsables (familiares y externos), ya en texto. Sin él, se muestra el principal.
  responsibleNames?: string[]
  // Bloque D — nombre del encargo/grupo, si la tarea pertenece a uno. Solo una etiqueta ligera en la
  // línea de meta-datos; nunca cambia la composición de la tarjeta ni oculta nada.
  groupName?: string | null
  // Fase 8 (Parte C5) — mismo color que la cabecera "📦 NOMBRE" de ese encargo (paletteByName), para
  // reconocerlo también aquí (p. ej. en Completadas) sin repetir el cálculo por tarjeta.
  groupColor?: string | null
  // Campana: aviso actual y cómo cambiarlo; ausente = la tarjeta no ofrece campana (p. ej. completadas).
  reminder?: {
    reminders: EventReminder[]
    hint: string | null
    gate: 'ok' | 'no_date' | 'not_in_calendar'
    saving: boolean
    onTogglePreset: (key: ReminderPresetKey) => void
    onClear: () => void
    onOpenCustom: () => void
    onNoDateTap: () => void
    onEnableCalendar: () => Promise<boolean>
  }
  // Fase 12 — deep-link a la tarea concreta: destaca la ficha cuando se
  // llegó aquí desde un aviso sobre esta tarea en particular.
  highlighted?: boolean
  onToggleDone: () => void
  onEdit: () => void
  // Bloque 9 (cola nocturna) — opcional: la vista de Completadas/Historial nunca ofrece borrar (una tarea
  // hecha se conserva siempre), así que ese menú no pasa onDelete y el botón "🗑️ Borrar" no se pinta.
  onDelete?: () => void
}) {
  const [showMenu, setShowMenu] = useState(false)
  const overdue = isOverdueTask(task)
  const shownPriority = effectivePriority(task, decisions).priority
  return (
    <div className={'card event-task-card' + (highlighted ? ' event-task-card-highlighted' : '')}>
      <input type="checkbox" checked={task.done} onChange={onToggleDone} aria-label={`Marcar "${task.title}" como hecha`} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{task.title}</div>
        {(task.dueDate || responsible || (responsibleNames && responsibleNames.length > 0) || shownPriority || groupName) && (
          <div className="muted event-task-card-meta">
            {task.dueDate && (
              <span style={overdue ? { color: '#dc2626', fontWeight: 600 } : undefined}>
                📅 {formatSpanishDate(task.dueDate)}
                {task.dueTime ? ` · ${task.dueTime}` : ''}
                {overdue ? ' · 🔴 Atrasada' : ''}
              </span>
            )}
            {/* Revisión manual en iPhone: solo el punto de color en la tarjeta compacta, nunca la palabra
                — el nombre completo sigue existiendo en el editor y en "Pepa te recomienda". */}
            {shownPriority && (
              <span className={`event-priority-dot event-priority-${shownPriority}`} title={`Prioridad ${PRIORITY_LABELS[shownPriority]}`} aria-label={`Prioridad ${PRIORITY_LABELS[shownPriority]}`} />
            )}
            {responsibleNames && responsibleNames.length > 0 ? (
              <span>👤 {responsibleNames.join(', ')}</span>
            ) : (
              responsible && <span>👤 {responsible.name}</span>
            )}
            {groupName && (
              <span>
                {groupColor && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: groupColor, marginRight: 3 }} />}
                🗂️ {groupName}
              </span>
            )}
          </div>
        )}
        {task.notes && (
          // Una sola línea; si no cabe se trunca solo en pantalla (la nota guardada no cambia).
          <div className="muted" title={task.notes} style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {task.notes}
          </div>
        )}
      </div>
      {reminder && (
        <ReminderBell
          taskTitle={task.title}
          reminders={reminder.reminders}
          hint={reminder.hint}
          gate={reminder.gate}
          saving={reminder.saving}
          onTogglePreset={reminder.onTogglePreset}
          onClear={reminder.onClear}
          onOpenCustom={reminder.onOpenCustom}
          onNoDateTap={reminder.onNoDateTap}
          onEnableCalendar={reminder.onEnableCalendar}
        />
      )}
      <div style={{ position: 'relative' }}>
        <button type="button" className="icon-button" aria-label={`Más opciones de "${task.title}"`} onClick={() => setShowMenu((v) => !v)}>
          ⋯
        </button>
        {showMenu && (
          <>
            {/* Capa invisible para cerrar el menú al tocar fuera, mismo patrón que modal-overlay. */}
            <div style={{ position: 'fixed', inset: 0, zIndex: 1 }} onClick={() => setShowMenu(false)} />
            <div className="event-task-menu">
              <button
                type="button"
                className="link-button"
                style={{ display: 'block', width: '100%', textAlign: 'left' }}
                onClick={() => {
                  setShowMenu(false)
                  onEdit()
                }}
              >
                <span className="event-task-menu-row">
                  <span className="event-task-menu-icon">✏️</span>
                  <span>Editar</span>
                </span>
              </button>
              {onDelete && (
                <ConfirmButton
                  label={
                    <span className="event-task-menu-row">
                      <span className="event-task-menu-icon">🗑️</span>
                      <span>Borrar</span>
                    </span>
                  }
                  confirmLabel="Borrar"
                  className="link-button"
                  style={{ display: 'block', width: '100%', textAlign: 'left' }}
                  onConfirm={onDelete}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// Mismo formulario completo para "Editar tarea" y "+ Nueva tarea" (bloque 2/3 de la tanda): `task`
// ausente = modo creación. Nunca un segundo formulario reducido que pueda divergir del completo.
// `helpers`/`onHelpersChanged` vienen del padre (EventosScreen) — es la misma lista que alimenta el
// filtro por responsable y "👥 Colaboradores"; el alta rápida de aquí solo CREA y refresca esa lista
// compartida, nunca mantiene una copia propia que pueda desincronizarse. Editar/borrar un colaborador ya
// existente vive exclusivamente en "👥 Colaboradores" (EventHelpersModal) — aquí solo se selecciona.
function TaskEditModal({
  task,
  eventId,
  familyMembers,
  helpers,
  onHelpersChanged,
  groups = [],
  initialGroupId = null,
  initialTitle = '',
  onClose,
  onSaved,
}: {
  task?: EventTask
  eventId: string
  familyMembers: FamilyMember[]
  helpers: EventHelper[]
  onHelpersChanged: () => Promise<void>
  // Bloque D/F — encargos disponibles para seleccionar (solo lectura aquí: crear/renombrar/borrar
  // encargos vive exclusivamente en "🗂️ Encargos", igual que Colaboradores en el bloque 8 de la tanda
  // anterior). initialGroupId: al crear una tarea desde "+ Tarea en este encargo", llega preseleccionado.
  groups?: EventTaskGroup[]
  initialGroupId?: string | null
  // Tanda Encargos v2 — "Siguiente preparativo": al abrir en modo creación desde "Crear preparativo" o
  // "+ Crear otro", el título puede llegar precargado (solo el título — nunca fecha/responsable/
  // recordatorio/precio inventados). Ignorado si task ya tiene su propio título.
  initialTitle?: string
  onClose: () => void
  onSaved: () => void
}) {
  const isCreating = task === undefined
  const [title, setTitle] = useState(task?.title ?? initialTitle)
  const [dueDate, setDueDate] = useState(task?.dueDate ?? '')
  // Preparativos (migración 0206): hora (solo con fecha), prioridad (lo que elija el usuario manda), nota, varios
  // responsables y personas externas del evento.
  const [dueTime, setDueTime] = useState(task?.dueTime ?? '')
  const [priority, setPriority] = useState<'' | 'alta' | 'media' | 'baja'>(task?.priority ?? '')
  // Solo importa en modo creación: si el usuario nunca toca el selector, se deja que PEPA proponga
  // prioridad (igual que el alta rápida de siempre) en vez de forzar "Sin prioridad" por defecto.
  const [priorityTouched, setPriorityTouched] = useState(false)
  const [notes, setNotes] = useState(task?.notes ?? '')
  const [groupId, setGroupId] = useState<string>(task?.groupId ?? initialGroupId ?? '')
  const originalResponsibleIds = task?.responsibleMemberIds && task.responsibleMemberIds.length > 0 ? task.responsibleMemberIds : task?.assignedMemberId ? [task.assignedMemberId] : []
  const [responsibleIds, setResponsibleIds] = useState<string[]>(originalResponsibleIds)
  const originalHelperIds = (task?.helpers ?? []).flatMap((h) => (h.helperId ? [h.helperId] : []))
  const [helperIds, setHelperIds] = useState<string[]>(originalHelperIds)
  const [newHelperName, setNewHelperName] = useState('')
  const [newHelperLabel, setNewHelperLabel] = useState('')
  // Ficha compacta (revisión manual en iPhone): el alta de persona externa ya no se muestra siempre —
  // solo al tocar «+ Añadir persona externa». Esto es ALTA RÁPIDA únicamente: editar/borrar una externa
  // ya existente vive en "👥 Colaboradores", nunca aquí.
  const [addingHelper, setAddingHelper] = useState(false)
  // Fase 9 — la propia presencia de calendarEventId es el estado
  // inicial del interruptor; no hay una columna booleana aparte.
  const [showInCalendar, setShowInCalendar] = useState(task?.calendarEventId != null)
  // Varios avisos a la vez (antes como mucho uno): el modelo real es el conjunto de presets activos +
  // como mucho un personalizado editable aquí (más cualquier otro personalizado ya existente que no se
  // toca ni se pierde — extraCustomReminders). Solo tiene sentido si la tarea está enlazada al Calendario.
  const [reminderPresets, setReminderPresets] = useState<Set<ReminderPresetKey>>(new Set())
  const [customReminderOn, setCustomReminderOn] = useState(false)
  const [customAmount, setCustomAmount] = useState('1')
  const [customUnit, setCustomUnit] = useState<ReminderUnit>('dias')
  const [extraCustomReminders, setExtraCustomReminders] = useState<EventReminder[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!task?.calendarEventId) return
    listEventReminders(task.calendarEventId)
      .then((reminders) => {
        const sel = taskReminderSelectionFrom(reminders)
        setReminderPresets(sel.presets)
        setCustomReminderOn(sel.custom !== null)
        if (sel.custom) {
          const { amount, unit } = unitAndAmountFromMinutes(sel.custom.minutesBefore)
          setCustomAmount(String(amount))
          setCustomUnit(unit)
        }
        setExtraCustomReminders(sel.extraCustom.map((c) => ({ minutesBefore: c.minutesBefore, anchor: 'start' })))
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Alta rápida (bloque 9 de la tanda): crea el colaborador de verdad en el evento, refresca la lista
  // compartida del padre (para que aparezca también en "👥 Colaboradores" y en el filtro) y lo deja ya
  // SELECCIONADO en esta tarea — nunca hace falta salir del formulario y volver a entrar.
  async function addHelper() {
    if (!newHelperName.trim()) return
    setError(null)
    try {
      const id = await addEventHelper(eventId, newHelperName, newHelperLabel || null)
      setNewHelperName('')
      setNewHelperLabel('')
      setHelperIds((prev) => [...prev, id])
      await onHelpersChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir la persona externa'))
    }
  }

  function togglePresetInForm(key: ReminderPresetKey) {
    setReminderPresets((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Todos los avisos a guardar: los presets marcados + el personalizado (si está activado) + cualquier
  // otro personalizado que ya existiera y no se edita aquí (nunca se pierde por guardar los demás).
  function remindersForForm(): EventReminder[] {
    return remindersFromSelection({
      presets: reminderPresets,
      custom: customReminderOn ? { minutesBefore: reminderMinutesFrom(Number(customAmount) || 1, customUnit) } : null,
      extraCustom: extraCustomReminders.map((r) => ({ minutesBefore: r.minutesBefore })),
    })
  }

  function clearAllReminders() {
    setReminderPresets(new Set())
    setCustomReminderOn(false)
    setExtraCustomReminders([])
  }

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!title.trim()) {
      setError('Ponle un título.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (isCreating) {
        // Una única tarea, de principio a fin — nunca dos sistemas de alta distintos. Sin tocar el
        // selector de prioridad se deja que PEPA proponga (igual que hacía siempre el alta rápida);
        // tocarlo (aunque vuelva a "Sin prioridad") es una elección real del usuario.
        const newId = await addEventTask(eventId, title, dueDate || null, null, {
          ...(priorityTouched ? { priority: (priority || null) as 'alta' | 'media' | 'baja' | null } : {}),
          notes: notes.trim() ? notes : null,
          dueTime: dueDate && dueTime ? dueTime : null,
        })
        if (responsibleIds.length > 0) await setEventTaskResponsibles(newId, responsibleIds)
        if (helperIds.length > 0) await setEventTaskHelpers(newId, helperIds)
        if (groupId) await setEventTaskGroup(newId, groupId)
        if (showInCalendar && dueDate) {
          const linkedId = await linkEventTaskToCalendar(newId)
          const reminders = remindersForForm()
          if (reminders.length > 0) await replaceReminders(linkedId, reminders)
        }
      } else {
        const priorityChanged = (priority || null) !== (task.priority ?? null)
        await updateEventTask(task.id, {
          title,
          dueDate: dueDate || null,
          // La hora solo existe con fecha (nunca 00:00 inventado).
          dueTime: dueDate && dueTime ? dueTime : null,
          notes: notes.trim() ? notes : null,
          // Solo si la cambias tú: una prioridad elegida manda y PEPA no la sobrescribe.
          ...(priorityChanged ? { priority: (priority || null) as 'alta' | 'media' | 'baja' | null } : {}),
        })
        const sameResponsibles = [...responsibleIds].sort().join('|') === [...originalResponsibleIds].sort().join('|')
        if (!sameResponsibles) await setEventTaskResponsibles(task.id, responsibleIds)
        const sameHelpers = [...helperIds].sort().join('|') === [...originalHelperIds].sort().join('|')
        if (!sameHelpers) await setEventTaskHelpers(task.id, helperIds)
        if (groupId !== (task.groupId ?? '')) await setEventTaskGroup(task.id, groupId || null)
        const wasLinked = task.calendarEventId != null
        let linkedId: string | null = task.calendarEventId
        if (showInCalendar && !wasLinked && dueDate) linkedId = await linkEventTaskToCalendar(task.id)
        else if (!showInCalendar && wasLinked) {
          await unlinkEventTaskFromCalendar(task.id)
          linkedId = null
        }
        if (linkedId) await replaceReminders(linkedId, remindersForForm())
      }
      onSaved()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            {isCreating ? 'Nueva tarea' : 'Editar tarea'}
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <form className="card member-form" onSubmit={handleSubmit}>
          {error && <p className="error">{error}</p>}
          <label>
            Título
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </label>
          {/* Comparten fila si el ancho lo permite; en móvil estrecho se apilan solas (flexWrap), nunca
              desbordan — revisión manual en iPhone encontró scroll horizontal aquí. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <label style={{ flex: '1 1 140px', minWidth: 0 }}>
              Fecha
              <input
                type="date"
                value={dueDate}
                style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }}
                onChange={(e) => {
                  setDueDate(e.target.value)
                  if (!e.target.value) {
                    setShowInCalendar(false)
                    setDueTime('')
                  }
                }}
              />
            </label>
            <label style={{ flex: '1 1 110px', minWidth: 0 }}>
              Hora (opcional)
              <input type="time" value={dueTime} disabled={!dueDate} style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }} onChange={(e) => setDueTime(e.target.value)} />
            </label>
          </div>
          <label>
            Prioridad
            <select
              value={priority}
              onChange={(e) => {
                setPriority(e.target.value as '' | 'alta' | 'media' | 'baja')
                setPriorityTouched(true)
              }}
            >
              <option value="">Sin prioridad</option>
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="baja">Baja</option>
            </select>
          </label>
          {groups.length > 0 && (
            <label>
              Encargo (opcional)
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                <option value="">Ninguno</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div style={{ minWidth: 0 }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
              Responsables (puede ser más de uno; ninguno marcado = sin asignar)
            </div>
            {/* Chips compactos (revisión manual en iPhone: la lista vertical de checkboxes desperdiciaba
                espacio) — mismo patrón que el filtro de Preparativos. Nunca inferido: sin nadie marcado
                la tarea queda sin responsable. Las externas llevan borde discontinuo, nunca solo color. */}
            <div className="chip-row" style={{ marginTop: 4 }}>
              {familyMembers.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={'chip' + (responsibleIds.includes(m.id) ? ' chip-active' : '')}
                  onClick={() => setResponsibleIds((prev) => (prev.includes(m.id) ? prev.filter((id) => id !== m.id) : [...prev, m.id]))}
                >
                  {m.name}
                </button>
              ))}
              {helpers.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  className={'chip chip-external' + (helperIds.includes(h.id) ? ' chip-active' : '')}
                  onClick={() => setHelperIds((prev) => (prev.includes(h.id) ? prev.filter((id) => id !== h.id) : [...prev, h.id]))}
                >
                  {h.name}
                  {h.label ? ` · ${h.label}` : ''}
                </button>
              ))}
              <button type="button" className="chip" onClick={() => setAddingHelper((v) => !v)}>
                + Añadir persona externa
              </button>
            </div>
            {/* Seleccionar/deseleccionar aquí; editar o borrar un colaborador existente vive exclusivamente
                en "👥 Colaboradores" (bloque 8 de la tanda) — nunca un menú ⋯ ni un alta dentro de la tarea. */}
            {(task?.helpers ?? []).filter((h) => h.helperId === null).length > 0 && (
              <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                {(task?.helpers ?? [])
                  .filter((h) => h.helperId === null)
                  .map((h) => h.name + (h.label ? ` · ${h.label}` : ''))
                  .join(', ')}{' '}
                · ya no está en el evento (referencia histórica)
              </p>
            )}
            {addingHelper && (
              <div className="card" style={{ padding: 8, marginTop: 4 }}>
                <p className="muted" style={{ fontSize: 12, margin: '0 0 4px' }}>
                  Ayuda en el evento. No necesita cuenta, email ni teléfono, y solo existe en este evento.
                </p>
                <div className="inline-fields" style={{ flexWrap: 'wrap' }}>
                  <input type="text" value={newHelperName} placeholder="Nombre" onChange={(e) => setNewHelperName(e.target.value)} aria-label="Nombre de la nueva persona externa" style={{ minWidth: 0, flex: 1 }} />
                  <input
                    type="text"
                    value={newHelperLabel}
                    placeholder="Relación (opcional)"
                    onChange={(e) => setNewHelperLabel(e.target.value)}
                    aria-label="Relación de la nueva persona externa"
                    style={{ minWidth: 0, flex: 1 }}
                  />
                </div>
                <div className="filter-row" style={{ marginTop: 4 }}>
                  <button type="button" className="link-button" onClick={() => void addHelper().then(() => setAddingHelper(false))} disabled={!newHelperName.trim()}>
                    Guardar
                  </button>
                  <button type="button" className="link-button" onClick={() => setAddingHelper(false)}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
          <label>
            Nota
            <textarea value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </label>
          <label className="inline-fields" style={{ alignItems: 'center' }}>
            <input type="checkbox" checked={showInCalendar} disabled={!dueDate} onChange={(e) => setShowInCalendar(e.target.checked)} />
            <span>📅 Mostrar en Calendario</span>
          </label>
          {!dueDate && (
            <p className="muted" style={{ fontSize: 12, marginTop: -4 }}>
              Ponle una fecha para poder mostrarla en el Calendario.
            </p>
          )}
          {showInCalendar && (
            <div>
              <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
                Recordatorio (puede ser más de uno)
              </div>
              <button type="button" className="link-button" onClick={clearAllReminders}>
                🔕 Sin aviso
              </button>
              {REMINDER_PRESET_ORDER.map((key) => (
                <label key={key} className="inline-fields" style={{ alignItems: 'center' }}>
                  <input type="checkbox" checked={reminderPresets.has(key)} onChange={() => togglePresetInForm(key)} />
                  <span>{REMINDER_PRESET_LABEL[key]}</span>
                </label>
              ))}
              <label className="inline-fields" style={{ alignItems: 'center' }}>
                <input type="checkbox" checked={customReminderOn} onChange={(e) => setCustomReminderOn(e.target.checked)} />
                <span>🔔 Personalizado</span>
              </label>
              {customReminderOn && (
                <div className="inline-fields">
                  <input
                    type="number"
                    min={1}
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    style={{ width: 70 }}
                    aria-label="Cantidad del recordatorio personalizado"
                  />
                  <select value={customUnit} onChange={(e) => setCustomUnit(e.target.value as ReminderUnit)} aria-label="Unidad del recordatorio personalizado">
                    {REMINDER_UNIT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <span className="muted" style={{ fontSize: 12 }}>
                    antes
                  </span>
                </div>
              )}
              {extraCustomReminders.length > 0 && (
                <p className="muted" style={{ fontSize: 12, margin: '2px 0' }}>
                  También tiene: {extraCustomReminders.map((r) => reminderLabel(r.minutesBefore, r.anchor)).join(', ')} (se conserva).
                </p>
              )}
            </div>
          )}
          <button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
      </div>
    </div>
  )
}

// "👥 Colaboradores" (bloque 6/7 de la tanda) — gestión de personas externas DEL EVENTO, fuera de
// cualquier tarea concreta. Reutiliza exactamente el mismo modelo y las mismas funciones de datos que ya
// existían dentro de "Editar tarea" (addEventHelper/updateEventHelper/countHelperAssignments/
// deleteEventHelper) — nada nuevo en el esquema, solo se traslada aquí la única gestión (alta/edición/
// borrado) que antes vivía, de forma menos visible, dentro del formulario de una tarea.
function EventHelpersModal({
  eventId,
  helpers,
  onHelpersChanged,
  onClose,
}: {
  eventId: string
  helpers: EventHelper[]
  onHelpersChanged: () => Promise<void>
  onClose: () => void
}) {
  const [newName, setNewName] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string; label: string } | null>(null)
  const [deleteFor, setDeleteFor] = useState<{ helper: EventHelper; assignments: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function add() {
    if (!newName.trim()) return
    setError(null)
    setSaving(true)
    try {
      await addEventHelper(eventId, newName, newLabel || null)
      setNewName('')
      setNewLabel('')
      await onHelpersChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir la persona externa'))
    } finally {
      setSaving(false)
    }
  }

  async function saveEditing() {
    if (!editing || !editing.name.trim()) return
    setError(null)
    try {
      await updateEventHelper(editing.id, { name: editing.name, label: editing.label || null })
      setEditing(null)
      await onHelpersChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar la persona externa'))
    }
  }

  // Sin asignaciones: confirmación sencilla. Con asignaciones: NUNCA en silencio — elige conservar
  // (referencia histórica, igual que ya hacía "Editar tarea") o quitar de las tareas.
  async function askDelete(h: EventHelper) {
    setError(null)
    try {
      const assignments = await countHelperAssignments(h.id)
      if (assignments === 0) {
        if (!window.confirm(`¿Borrar a ${h.name} de este evento?`)) return
        await deleteEventHelper(h.id, 'keep')
        await onHelpersChanged()
      } else {
        setDeleteFor({ helper: h, assignments })
      }
    } catch (err) {
      setError(errorMessage(err, 'No se pudo borrar la persona externa'))
    }
  }

  async function confirmDelete(mode: 'keep' | 'remove') {
    if (!deleteFor) return
    setError(null)
    try {
      await deleteEventHelper(deleteFor.helper.id, mode)
      setDeleteFor(null)
      await onHelpersChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo borrar la persona externa'))
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            👥 Colaboradores
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="card member-form">
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Personas que ayudan en este evento, sin cuenta ni acceso a PEPA. Se asignan a tareas desde «+ Nueva tarea» o «Editar tarea».
          </p>
          {error && <p className="error">{error}</p>}
          {helpers.length === 0 && <p className="muted">Todavía no hay ningún colaborador en este evento.</p>}
          {helpers.map((h) =>
            editing && editing.id === h.id ? (
              <div key={h.id} className="card" style={{ padding: 8 }}>
                <div className="inline-fields" style={{ flexWrap: 'wrap' }}>
                  <input type="text" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} aria-label="Nombre del colaborador" style={{ minWidth: 0, flex: 1 }} />
                  <input
                    type="text"
                    value={editing.label}
                    placeholder="Relación (opcional)"
                    onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                    aria-label="Relación del colaborador"
                    style={{ minWidth: 0, flex: 1 }}
                  />
                </div>
                <div className="filter-row" style={{ marginTop: 4 }}>
                  <button type="button" className="link-button" onClick={() => void saveEditing()}>
                    Guardar
                  </button>
                  <button type="button" className="link-button" onClick={() => setEditing(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div key={h.id} className="inline-fields" style={{ alignItems: 'center' }}>
                <span style={{ flex: 1 }}>
                  {h.name}
                  {h.label ? ` · ${h.label}` : ''}
                </span>
                <button type="button" className="link-button" onClick={() => setEditing({ id: h.id, name: h.name, label: h.label ?? '' })}>
                  Editar
                </button>
                <button type="button" className="link-button" onClick={() => void askDelete(h)}>
                  Borrar
                </button>
              </div>
            ),
          )}
          {deleteFor && (
            <div className="card" style={{ padding: 8 }}>
              <p style={{ margin: '0 0 6px' }}>
                {deleteFor.helper.name} tiene {deleteFor.assignments} asignación{deleteFor.assignments === 1 ? '' : 'es'} en este evento. ¿Qué quieres hacer con ellas?
              </p>
              <div className="filter-row" style={{ flexWrap: 'wrap' }}>
                <button type="button" className="link-button" onClick={() => void confirmDelete('keep')}>
                  Conservar las asignaciones (quedan como referencia)
                </button>
                <button type="button" className="link-button" onClick={() => void confirmDelete('remove')}>
                  Quitarla también de las tareas
                </button>
                <button type="button" className="link-button" onClick={() => setDeleteFor(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
          <div className="card" style={{ padding: 8 }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
              + Añadir colaborador
            </div>
            <div className="inline-fields" style={{ flexWrap: 'wrap', marginTop: 4 }}>
              <input type="text" value={newName} placeholder="Nombre" onChange={(e) => setNewName(e.target.value)} aria-label="Nombre del nuevo colaborador" style={{ minWidth: 0, flex: 1 }} />
              <input
                type="text"
                value={newLabel}
                placeholder="Relación (opcional)"
                onChange={(e) => setNewLabel(e.target.value)}
                aria-label="Relación del nuevo colaborador"
                style={{ minWidth: 0, flex: 1 }}
              />
            </div>
            <button type="button" onClick={() => void add()} disabled={!newName.trim() || saving} style={{ marginTop: 4 }}>
              Añadir
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// "🗂️ Encargos" (bloque D/F de la tanda) — agrupación organizativa de Preparativos relacionados (p. ej.
// "Flores": ramo, prendidos, decoración, recoger). Puramente ligera y deliberadamente SIN ninguna
// relación con Proveedores/Presupuesto (ver migración 0212 y el informe de esta tanda — unificarlo ahí
// podría sumar un mismo importe varias veces, y es una decisión de producto aparte).
//
// Crear/renombrar/borrar un encargo vive exclusivamente aquí; dentro de Nueva/Editar tarea solo se
// SELECCIONA (mismo criterio que Colaboradores). Borrar un encargo nunca borra sus tareas — el FK
// ON DELETE SET NULL las deja sin encargo, no hace falta pedir confirmación "conservar/quitar" como con
// un colaborador (aquí no hay ninguna referencia histórica que se pueda perder: la tarea sigue intacta).
function EventTaskGroupsModal({
  eventId,
  groups,
  tasks,
  onGroupsChanged,
  onClose,
  onCreateTaskInGroup,
}: {
  eventId: string
  groups: EventTaskGroup[]
  tasks: EventTask[]
  onGroupsChanged: () => Promise<void>
  onClose: () => void
  onCreateTaskInGroup: (groupId: string) => void
}) {
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Fase 4 (bug real: dos contenedores "Flores" sueltos, uno con tareas y otro vacío) — "+ Nuevo encargo"
  // creaba sin avisar aunque ya existiera uno con ese mismo nombre. Nunca se fusiona solo (dos encargos
  // "Flores" pueden ir legítimamente a floristerías distintas): se avisa y la familia elige.
  const [duplicateOfName, setDuplicateOfName] = useState<string | null>(null)
  // "+ Añadir tarea existente" (Tanda Encargos v2) — alternativa a "+ Tarea en este encargo" (que crea una
  // NUEVA): deja meter en el encargo una tarea que YA existe. Solo ofrece tareas sin encargo todavía — una
  // tarea pertenece como mucho a uno; mover entre encargos es un paso aparte, no ofrecido aquí.
  const [addingExistingToGroupId, setAddingExistingToGroupId] = useState<string | null>(null)
  const [selectedExistingTaskId, setSelectedExistingTaskId] = useState('')
  const ungroupedTasks = tasks.filter((t) => !t.groupId)
  // Fase 8 (Parte C5) — mismo cálculo que en Preparativos (paletteByName): mismo nombre, mismo color aquí
  // también, para reconocer el encargo igual en las dos pantallas.
  const groupColors = useMemo(() => paletteByName(groups.map((g) => g.name)), [groups])

  async function addExistingTask(groupId: string) {
    if (!selectedExistingTaskId) return
    setError(null)
    try {
      await setEventTaskGroup(selectedExistingTaskId, groupId)
      setSelectedExistingTaskId('')
      setAddingExistingToGroupId(null)
      await onGroupsChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir la tarea al encargo'))
    }
  }

  async function add(force = false) {
    const name = newName.trim()
    if (!name) return
    if (!force) {
      const existing = groups.find((g) => g.name.trim().toLowerCase() === name.toLowerCase())
      if (existing) {
        setDuplicateOfName(existing.name)
        return
      }
    }
    setError(null)
    setSaving(true)
    try {
      await addEventTaskGroup(eventId, name)
      setNewName('')
      setDuplicateOfName(null)
      await onGroupsChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo crear el encargo'))
    } finally {
      setSaving(false)
    }
  }

  async function saveEditing() {
    if (!editing || !editing.name.trim()) return
    setError(null)
    try {
      await renameEventTaskGroup(editing.id, editing.name)
      setEditing(null)
      await onGroupsChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo renombrar el encargo'))
    }
  }

  // Nunca destructivo para las tareas (no hay nada que "conservar o quitar": siguen intactas, solo se
  // desvinculan) — basta un aviso sencillo con el número, sin el flujo de conservar/quitar de Colaboradores.
  async function askDelete(g: EventTaskGroup) {
    setError(null)
    try {
      const count = await countTasksInGroup(g.id)
      const message = count > 0 ? `¿Borrar el encargo «${g.name}»? Sus ${count} tarea${count === 1 ? '' : 's'} no se borran: quedan sin encargo.` : `¿Borrar el encargo «${g.name}»?`
      if (!window.confirm(message)) return
      await deleteEventTaskGroup(g.id)
      await onGroupsChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo borrar el encargo'))
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            🗂️ Encargos
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="card member-form">
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Agrupa Preparativos relacionados (por ejemplo «Flores»: ramo, prendidos, decoración, recoger). Cada tarea sigue siendo independiente — el encargo es solo para verlas juntas.
          </p>
          {error && <p className="error">{error}</p>}
          {groups.length === 0 && <p className="muted">Todavía no hay ningún encargo en este evento.</p>}
          {groups.map((g) => {
            const groupTasks = tasks.filter((t) => t.groupId === g.id)
            return editing && editing.id === g.id ? (
              <div key={g.id} className="card" style={{ padding: 8 }}>
                <div className="inline-fields" style={{ flexWrap: 'wrap' }}>
                  <input type="text" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} aria-label="Nombre del encargo" style={{ minWidth: 0, flex: 1 }} />
                </div>
                <div className="filter-row" style={{ marginTop: 4 }}>
                  <button type="button" className="link-button" onClick={() => void saveEditing()}>
                    Guardar
                  </button>
                  <button type="button" className="link-button" onClick={() => setEditing(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div key={g.id} className="card" style={{ padding: 8, background: groupColors.get(g.name) }}>
                <div className="inline-fields" style={{ alignItems: 'center' }}>
                  <strong style={{ flex: 1 }}>{g.name}</strong>
                  <button type="button" className="link-button" onClick={() => setEditing({ id: g.id, name: g.name })}>
                    Editar
                  </button>
                  <button type="button" className="link-button" onClick={() => void askDelete(g)}>
                    Borrar
                  </button>
                </div>
                {groupTasks.length > 0 ? (
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13 }}>
                    {groupTasks.map((t) => (
                      <li key={t.id}>
                        {t.title}
                        {t.done ? ' ✔️' : ''}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                    Todavía no tiene tareas.
                  </p>
                )}
                <div className="inline-fields" style={{ flexWrap: 'wrap', marginTop: 4 }}>
                  <button type="button" className="link-button" onClick={() => onCreateTaskInGroup(g.id)}>
                    + Crear nueva tarea
                  </button>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      setSelectedExistingTaskId('')
                      setAddingExistingToGroupId(addingExistingToGroupId === g.id ? null : g.id)
                    }}
                  >
                    + Añadir tarea existente
                  </button>
                </div>
                {addingExistingToGroupId === g.id && (
                  <div className="inline-fields" style={{ flexWrap: 'wrap', marginTop: 4 }}>
                    {ungroupedTasks.length === 0 ? (
                      <p className="muted" style={{ fontSize: 12 }}>
                        No hay ninguna tarea sin encargo que añadir aquí.
                      </p>
                    ) : (
                      <>
                        <select value={selectedExistingTaskId} onChange={(e) => setSelectedExistingTaskId(e.target.value)} aria-label="Tarea existente a añadir">
                          <option value="">Elige una tarea…</option>
                          {ungroupedTasks.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.title}
                              {t.done ? ' ✔️' : ''}
                            </option>
                          ))}
                        </select>
                        <button type="button" className="link-button" disabled={!selectedExistingTaskId} onClick={() => void addExistingTask(g.id)}>
                          Añadir
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          <div className="card" style={{ padding: 8 }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
              + Nuevo encargo
            </div>
            <div className="inline-fields" style={{ flexWrap: 'wrap', marginTop: 4 }}>
              <input
                type="text"
                value={newName}
                placeholder="Nombre (p. ej. Flores)"
                onChange={(e) => {
                  setNewName(e.target.value)
                  setDuplicateOfName(null)
                }}
                aria-label="Nombre del nuevo encargo"
                style={{ minWidth: 0, flex: 1 }}
              />
            </div>
            {duplicateOfName ? (
              <div className="card" style={{ padding: 8, marginTop: 4 }}>
                <p className="muted" style={{ margin: 0 }}>Ya existe un encargo llamado «{duplicateOfName}». ¿Es el mismo, o uno distinto (p. ej. otro proveedor)?</p>
                <div className="filter-row" style={{ marginTop: 4 }}>
                  <button type="button" className="link-button" onClick={() => { setNewName(''); setDuplicateOfName(null) }}>
                    Es el mismo, usar el existente
                  </button>
                  <button type="button" className="link-button" onClick={() => void add(true)} disabled={saving}>
                    Crear uno nuevo igualmente
                  </button>
                  <button type="button" className="link-button" onClick={() => setDuplicateOfName(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => void add()} disabled={!newName.trim() || saving} style={{ marginTop: 4 }}>
                Añadir
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const OFFER_STATUS_LABELS: Record<EventTaskGroupOfferStatus, string> = {
  recibida: 'Recibida',
  seleccionada: '✓ Seleccionada',
  descartada: 'Descartada',
}

// PEPA — prompt maestro, Bloque B3/B4: un servicio en edición, antes de guardarse — "id" presente =
// servicio ya persistido (edición), ausente = servicio nuevo todavía sin guardar (alta, o añadido dentro
// de una oferta en edición). Mismo shape que OfferBudgetScanItem (lo que ya propone la IA) a propósito:
// un servicio importado y uno escrito a mano son indistinguibles una vez en la lista.
type DraftOfferItem = OfferBudgetScanItem & { id?: string }

// Único formulario de un servicio — reutilizado tanto para añadirlo/editarlo SIN guardar todavía (dentro
// de OfferFormFields, alta o edición de la oferta) como para añadirlo/editarlo YA guardado (dentro de
// OfferItemsPanel, viendo una oferta ya existente sin entrar a editarla entera) — "onSave" decide qué
// hacer con el resultado en cada caso, nunca dos formularios de servicio distintos. Solo 2 campos
// visibles al principio (nombre + importe), el resto detrás de "Más detalles" — petición real: no obligar
// a rellenar cantidad/unidad/precio/descripción para un servicio sencillo de una sola línea.
function DraftItemForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: DraftOfferItem | null
  onSave: (item: DraftOfferItem) => void
  onCancel: () => void
  saving?: boolean
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [subtotal, setSubtotal] = useState(initial?.subtotal === null || initial?.subtotal === undefined ? '' : String(initial.subtotal))
  const [showDetails, setShowDetails] = useState(Boolean(initial && (initial.description || initial.quantity !== null || initial.unit || initial.isPackage)))
  const [description, setDescription] = useState(initial?.description ?? '')
  const [quantity, setQuantity] = useState(initial?.quantity === null || initial?.quantity === undefined ? '' : String(initial.quantity))
  const [unit, setUnit] = useState(initial?.unit ?? '')
  const [unitPrice, setUnitPrice] = useState(initial?.unitPrice === null || initial?.unitPrice === undefined ? '' : String(initial.unitPrice))
  const [isPackage, setIsPackage] = useState(initial?.isPackage ?? false)
  const [error, setError] = useState<string | null>(null)

  function handleSave() {
    if (!name.trim()) {
      setError('Ponle un nombre al servicio.')
      return
    }
    setError(null)
    onSave({
      id: initial?.id,
      name: name.trim(),
      description: description.trim() || null,
      quantity: quantity.trim() === '' ? null : Number(quantity),
      unit: unit.trim() || null,
      unitPrice: unitPrice.trim() === '' ? null : Number(unitPrice),
      subtotal: subtotal.trim() === '' ? null : Number(subtotal),
      isPackage,
    })
  }

  return (
    <div className="card" style={{ padding: 8, marginTop: 6 }}>
      {error && <p className="error">{error}</p>}
      <label>
        Nombre del servicio
        {/* Ejemplo genérico a propósito (petición real: nunca un ejemplo específico de un sector
            concreto, como el de una boda, para el servicio de un proveedor de otro tipo cualquiera). */}
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Hora extra, segundo profesional, envío..." />
      </label>
      <label style={{ marginTop: 6 }}>
        Importe del servicio (€)
        <input type="number" min={0} step="0.01" value={subtotal} onChange={(e) => setSubtotal(e.target.value)} />
      </label>
      <button type="button" className="link-button" style={{ fontSize: 12, marginTop: 4 }} onClick={() => setShowDetails((v) => !v)}>
        {showDetails ? '▾' : '▸'} Más detalles (opcional)
      </button>
      {showDetails && (
        <>
          <div className="filter-row" style={{ marginTop: 6 }}>
            <button type="button" className={'chip' + (!isPackage ? ' chip-active' : '')} onClick={() => setIsPackage(false)}>
              Por cantidad/precio
            </button>
            <button type="button" className={'chip' + (isPackage ? ' chip-active' : '')} onClick={() => setIsPackage(true)}>
              📦 Paquete indivisible
            </button>
          </div>
          {!isPackage && (
            <div className="inline-fields" style={{ marginTop: 6 }}>
              <label style={{ flex: 1 }}>
                Cantidad
                <input type="number" min={0} step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </label>
              <label style={{ flex: 1 }}>
                Unidad
                <input type="text" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="ud, hora..." />
              </label>
              <label style={{ flex: 1 }}>
                Precio unitario
                <input type="number" min={0} step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
              </label>
            </div>
          )}
          <label style={{ marginTop: 6 }}>
            Descripción (opcional)
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </label>
        </>
      )}
      <div className="filter-row" style={{ marginTop: 8 }}>
        <button type="button" onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando…' : initial ? 'Guardar servicio' : '+ Añadir servicio'}
        </button>
        <button type="button" className="link-button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

// PEPA — prompt maestro, Bloque B3/B4: campos de una oferta — la MISMA interfaz para alta y edición
// (nunca dos formularios distintos). El proveedor queda fuera a propósito: su selección varía según el
// contexto (nuevo/existente dentro de un encargo, fijo en una oferta suelta, texto libre al editar), así
// que cada sitio que usa OfferFormFields lo resuelve y lo muestra justo encima. Todo lo demás es idéntico
// en los tres sitios. "mode"/"setMode" son el interruptor Texto libre | Desglosado pedido explícitamente;
// "items" son los servicios en borrador (sin guardar todavía en alta; ya persistidos, pero editables
// localmente, en edición) — nunca obliga a guardar la oferta antes de poder añadir un servicio.
function OfferFormFields({
  name,
  setName,
  amount,
  setAmount,
  mode,
  setMode,
  scopeIncluded,
  setScopeIncluded,
  items,
  setItems,
  scopeExcluded,
  setScopeExcluded,
  offerDate,
  setOfferDate,
  validUntil,
  setValidUntil,
  conditions,
  setConditions,
  notes,
  setNotes,
  file,
  setFile,
  hasExistingAttachment,
  onImported,
}: {
  name: string
  setName: (v: string) => void
  amount: string
  setAmount: (v: string) => void
  mode: 'texto' | 'desglosado'
  setMode: (v: 'texto' | 'desglosado') => void
  scopeIncluded: string
  setScopeIncluded: (v: string) => void
  items: DraftOfferItem[]
  setItems: (fn: (prev: DraftOfferItem[]) => DraftOfferItem[]) => void
  scopeExcluded: string
  setScopeExcluded: (v: string) => void
  offerDate: string
  setOfferDate: (v: string) => void
  validUntil: string
  setValidUntil: (v: string) => void
  conditions: string
  setConditions: (v: string) => void
  notes: string
  setNotes: (v: string) => void
  file: File | null
  setFile: (f: File | null) => void
  hasExistingAttachment: boolean
  onImported: (result: OfferBudgetScanResult, items: OfferBudgetScanItem[]) => void
}) {
  const [showMoreDetails, setShowMoreDetails] = useState(Boolean(scopeExcluded || offerDate || validUntil || conditions || notes || hasExistingAttachment))
  const [showItemForm, setShowItemForm] = useState(false)
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null)

  const sumItems = items.reduce((s, i) => s + (i.subtotal ?? 0), 0)
  const hasAnySubtotal = items.some((i) => i.subtotal !== null)
  const amountNum = Number(amount)
  const amountMismatch = hasAnySubtotal && amount.trim() !== '' && !Number.isNaN(amountNum) && Math.abs(sumItems - amountNum) > 0.009

  return (
    <>
      <ImportOfferBudgetButton onImported={onImported} />
      <label>
        Nombre de la oferta (opcional)
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Paquete básico, con álbum..." />
      </label>
      <label style={{ marginTop: 6 }}>
        Importe total (€)
        <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <p style={{ marginTop: 10, marginBottom: 4, fontWeight: 600, fontSize: 14 }}>¿Qué incluye la oferta?</p>
      <div className="filter-row">
        <button type="button" className={'chip' + (mode === 'texto' ? ' chip-active' : '')} onClick={() => setMode('texto')}>
          Texto libre
        </button>
        <button type="button" className={'chip' + (mode === 'desglosado' ? ' chip-active' : '')} onClick={() => setMode('desglosado')}>
          Desglosado
        </button>
      </div>
      {mode === 'texto' ? (
        <label style={{ marginTop: 6 }}>
          Qué incluye (opcional)
          <textarea
            value={scopeIncluded}
            onChange={(e) => setScopeIncluded(e.target.value)}
            rows={3}
            placeholder="Reportaje fotográfico, álbum y vídeo de la celebración…"
          />
        </label>
      ) : (
        <div style={{ marginTop: 6 }}>
          <p className="muted" style={{ fontSize: 12 }}>
            Servicios incluidos
          </p>
          {items.length === 0 && !showItemForm && (
            <p className="muted" style={{ fontSize: 12 }}>
              Todavía no hay ningún servicio — añade el primero cuando quieras, no hace falta guardar la oferta antes.
            </p>
          )}
          <div className="event-list">
            {items.map((item, i) =>
              editingItemIndex === i ? (
                <DraftItemForm
                  key={item.id ?? `new-${i}`}
                  initial={item}
                  onCancel={() => setEditingItemIndex(null)}
                  onSave={(updated) => {
                    setItems((prev) => prev.map((it, idx) => (idx === i ? updated : it)))
                    setEditingItemIndex(null)
                  }}
                />
              ) : (
                <div key={item.id ?? `new-${i}`} className="inline-fields" style={{ alignItems: 'center', marginTop: 4 }}>
                  <div style={{ flex: 1 }}>
                    <strong style={{ fontSize: 13 }}>{item.name}</strong>
                    {item.isPackage ? <span className="muted" style={{ fontSize: 11 }}> · 📦 paquete</span> : null}
                  </div>
                  <span style={{ fontSize: 12 }}>{item.subtotal !== null ? `${item.subtotal.toFixed(2)} €` : 'sin importe'}</span>
                  <button type="button" className="link-button" onClick={() => setEditingItemIndex(i)}>
                    ✏️
                  </button>
                  <button type="button" className="link-button" onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}>
                    ✕
                  </button>
                </div>
              ),
            )}
          </div>
          {showItemForm ? (
            <DraftItemForm
              initial={null}
              onCancel={() => setShowItemForm(false)}
              onSave={(item) => {
                setItems((prev) => [...prev, item])
                setShowItemForm(false)
              }}
            />
          ) : (
            <button type="button" className="link-button" style={{ marginTop: 6 }} onClick={() => setShowItemForm(true)}>
              + Añadir servicio
            </button>
          )}
          {hasAnySubtotal && (
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Suma de los servicios: {sumItems.toFixed(2)} €
              {amountMismatch && <> · El importe total no coincide — puede incluir descuento, impuestos u otro cargo aparte.</>}
            </p>
          )}
        </div>
      )}
      <button type="button" className="link-button" style={{ fontSize: 12, marginTop: 10 }} onClick={() => setShowMoreDetails((v) => !v)}>
        {showMoreDetails ? '▾' : '▸'} Más detalles (opcional)
      </button>
      {showMoreDetails && (
        <>
          <label style={{ marginTop: 6 }}>
            Qué NO incluye (opcional)
            <textarea value={scopeExcluded} onChange={(e) => setScopeExcluded(e.target.value)} rows={2} />
          </label>
          <div className="inline-fields" style={{ marginTop: 6 }}>
            <label style={{ flex: 1 }}>
              Fecha de la oferta (opcional)
              <input type="date" value={offerDate} onChange={(e) => setOfferDate(e.target.value)} />
            </label>
            <label style={{ flex: 1 }}>
              Válida hasta (opcional)
              <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </label>
          </div>
          <label style={{ marginTop: 6 }}>
            Condiciones (opcional)
            <input type="text" value={conditions} onChange={(e) => setConditions(e.target.value)} placeholder="Forma de pago, cancelación..." />
          </label>
          <label style={{ marginTop: 6 }}>
            Notas (opcional)
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <label style={{ marginTop: 6 }}>
            {hasExistingAttachment ? 'Sustituir adjunto (opcional)' : 'Adjunto (opcional)'}
            <input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          {file && (
            <p className="muted" style={{ fontSize: 12 }}>
              Elegido: {file.name}
            </p>
          )}
        </>
      )}
    </>
  )
}

// Fase 6 (Parte B) — comparar varias ofertas de proveedores antes de resolver un encargo. SOLO
// información para comparar: seleccionar una aquí NUNCA crea un pago ni toca el presupuesto — eso sigue
// pasando exclusivamente al "Marcar encargo como resuelto" de ResolveGroupModal; "Usar esta oferta al
// resolver" solo rellena ese formulario como atajo (onUseOffer), nunca en automático.
// PEPA — prompt maestro, Bloque B6: menú ⋯ de una oferta — mismo patrón ya usado en proveedores
// (ProviderCardMenu) y en Familia (member-row-more/member-row-actions). "Seleccionar"/"Usar esta oferta
// al resolver" se quedan fuera del menú a propósito: son la acción principal del flujo de una oferta
// recibida/seleccionada, no una acción secundaria de mantenimiento como editar/descartar/eliminar.
function OfferCardMenu({
  open,
  onToggle,
  onEdit,
  discarded,
  onToggleDiscard,
  onDelete,
}: {
  open: boolean
  onToggle: () => void
  onEdit: () => void
  discarded: boolean
  onToggleDiscard: () => void
  onDelete: () => void
}) {
  return (
    <>
      <button type="button" className="member-row-more" aria-label="Acciones de la oferta" aria-expanded={open} onClick={onToggle}>
        ⋯
      </button>
      {open && (
        <div className="member-row-actions">
          <button type="button" className="link-button" onClick={onEdit}>
            ✏️ Editar oferta
          </button>
          <button type="button" className="link-button" onClick={onToggleDiscard}>
            {discarded ? '↩️ Recuperar oferta' : '🗑 Descartar oferta'}
          </button>
          <ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Eliminar oferta" onConfirm={onDelete} />
        </div>
      )}
    </>
  )
}

function OffersComparison({
  group,
  providers,
  onUseOffer,
}: {
  group: EventTaskGroup
  providers: EventProvider[]
  onUseOffer: (offer: EventTaskGroupOffer) => void
}) {
  const [offers, setOffers] = useState<EventTaskGroupOffer[]>([])
  const [looseOffers, setLooseOffers] = useState<EventTaskGroupOffer[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    listEventTaskGroupOffers(group.id)
      .then(setOffers)
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar las ofertas')))
  }
  useEffect(reload, [group.id])

  // Fase 5 (Parte B1) — ofertas sueltas de ESTE evento (registradas desde Proveedores, sin encargo
  // todavía): poder vincularlas aquí sin tener que volver a escribirlas, nunca en automático.
  function reloadLoose() {
    listLooseOffersForEvent(group.eventId)
      .then(setLooseOffers)
      .catch(() => {})
  }
  useEffect(reloadLoose, [group.eventId])

  async function handleLinkLoose(offer: EventTaskGroupOffer) {
    setError(null)
    try {
      await linkLooseTaskGroupOfferToGroup(offer, group.id)
      reloadLoose()
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo vincular'))
    }
  }

  async function handleSelect(offer: EventTaskGroupOffer) {
    setError(null)
    try {
      await selectEventTaskGroupOffer(offer.id, group.id)
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo seleccionar'))
    }
  }

  async function handleToggleDiscard(offer: EventTaskGroupOffer) {
    setError(null)
    try {
      await setEventTaskGroupOfferStatus(offer.id, offer.status === 'descartada' ? 'recibida' : 'descartada')
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo cambiar el estado'))
    }
  }

  async function handleViewAttachment(offer: EventTaskGroupOffer) {
    if (!offer.attachmentStoragePath) return
    try {
      const url = await getEventTaskGroupOfferAttachmentUrl(offer.attachmentStoragePath)
      window.open(url, '_blank', 'noopener')
    } catch (err) {
      setError(errorMessage(err, 'No se pudo abrir el adjunto'))
    }
  }

  return (
    <div className="card" style={{ padding: 8, marginTop: 6 }}>
      <strong style={{ fontSize: 13 }}>📋 Ofertas recibidas{offers.length > 0 ? ` (${offers.length})` : ''}</strong>
      {error && <p className="error">{error}</p>}
      {looseOffers.length > 0 && (
        <div style={{ marginTop: 4, marginBottom: 6 }}>
          <strong style={{ fontSize: 12 }}>🔗 Ofertas sueltas de este evento (sin encargo todavía)</strong>
          {looseOffers.map((o) => (
            <div key={o.id} className="inline-fields" style={{ alignItems: 'center', marginTop: 4 }}>
              <span style={{ flex: 1, fontSize: 12 }}>
                {o.providerName} · {o.amount.toFixed(2)} €
              </span>
              <button type="button" className="link-button" onClick={() => void handleLinkLoose(o)}>
                Vincular a este encargo
              </button>
            </div>
          ))}
        </div>
      )}
      {offers.length === 0 && !showAdd && (
        <p className="muted" style={{ fontSize: 12 }}>
          Todavía no hay ninguna oferta apuntada — compara precios de varios proveedores antes de resolver, si quieres.
        </p>
      )}
      {offers.map((o) =>
        editingId === o.id ? (
          <EditOfferForm key={o.id} offer={o} providers={providers} onDone={() => setEditingId(null)} onSaved={() => { setEditingId(null); reload() }} />
        ) : (
          <div key={o.id} className="card" style={{ padding: 8, marginTop: 6, opacity: o.status === 'descartada' ? 0.6 : 1 }}>
            <div className="inline-fields" style={{ alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <strong>{o.providerName}</strong>
                <span className="muted" style={{ fontSize: 12 }}>
                  {' '}
                  · {o.amount.toFixed(2)} €
                </span>
              </div>
              <span className="muted" style={{ fontSize: 11 }}>
                {OFFER_STATUS_LABELS[o.status]}
              </span>
              <OfferCardMenu
                open={menuOpenId === o.id}
                onToggle={() => setMenuOpenId((cur) => (cur === o.id ? null : o.id))}
                onEdit={() => setEditingId(o.id)}
                discarded={o.status === 'descartada'}
                onToggleDiscard={() => void handleToggleDiscard(o)}
                onDelete={() => deleteEventTaskGroupOffer(o).then(reload)}
              />
            </div>
            {o.supersedesOfferId && (
              <p className="muted" style={{ fontSize: 11, margin: '2px 0' }}>
                🔁 Revisión de otra oferta{(() => {
                  const prev = offers.find((p) => p.id === o.supersedesOfferId)
                  return prev ? ` de ${prev.providerName} (antes ${prev.amount.toFixed(2)} €)` : ''
                })()}
              </p>
            )}
            {(o.scopeIncluded || o.scopeExcluded) && (
              <p className="muted" style={{ fontSize: 12, margin: '2px 0' }}>
                {o.scopeIncluded && <>Incluye: {o.scopeIncluded}</>}
                {o.scopeIncluded && o.scopeExcluded ? ' · ' : ''}
                {o.scopeExcluded && <>No incluye: {o.scopeExcluded}</>}
              </p>
            )}
            {(o.offerDate || o.validUntil) && (
              <p className="muted" style={{ fontSize: 12, margin: '2px 0' }}>
                {o.offerDate ? `Oferta: ${o.offerDate}` : ''}
                {o.offerDate && o.validUntil ? ' · ' : ''}
                {o.validUntil ? `Válida hasta: ${o.validUntil}` : ''}
              </p>
            )}
            {o.conditions && (
              <p className="muted" style={{ fontSize: 12, margin: '2px 0' }}>
                Condiciones: {o.conditions}
              </p>
            )}
            {o.notes && (
              <p className="muted" style={{ fontSize: 12, margin: '2px 0' }}>
                📝 {o.notes}
              </p>
            )}
            {o.attachmentStoragePath && (
              <button type="button" className="link-button" style={{ fontSize: 12, maxWidth: '100%', overflow: 'hidden' }} onClick={() => void handleViewAttachment(o)}>
                <span style={{ display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>
                  📎 {o.attachmentOriginalName ?? 'Ver adjunto'}
                </span>
              </button>
            )}
            <OfferItemsPanel offer={o} />
            {(o.status === 'recibida' || o.status === 'seleccionada') && (
              <div className="filter-row" style={{ marginTop: 4, flexWrap: 'wrap' }}>
                {o.status === 'recibida' && (
                  <button type="button" className="link-button" onClick={() => void handleSelect(o)}>
                    ✓ Seleccionar
                  </button>
                )}
                {o.status === 'seleccionada' && (
                  <button type="button" className="link-button" onClick={() => onUseOffer(o)}>
                    Usar esta oferta al resolver
                  </button>
                )}
              </div>
            )}
          </div>
        ),
      )}
      {showAdd ? (
        <AddOfferForm groupId={group.id} providers={providers} existingOffers={offers} onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); reload() }} />
      ) : (
        <button type="button" className="link-button" onClick={() => setShowAdd(true)} style={{ marginTop: 6 }}>
          + Añadir oferta
        </button>
      )}
    </div>
  )
}

// Fase 6 (Parte B3, prompt maestro) — "Importar presupuesto": lee una foto/PDF de un proveedor y
// PROPONE los datos de la oferta y sus servicios; la familia revisa (incluida la lista de servicios, uno
// a uno) antes de que nada se aplique al formulario. Mismo patrón que ImportProviderPhotoButton (A6):
// nunca guarda nada por sí sola, solo entrega la propuesta ya revisada a quien la usa.
function ImportOfferBudgetButton({ onImported }: { onImported: (result: OfferBudgetScanResult, includedItems: OfferBudgetScanItem[]) => void }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<OfferBudgetScanResult | null>(null)
  const [included, setIncluded] = useState<Set<number>>(new Set())

  async function handleFile(file: File) {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const scanned = await analyzeOfferBudgetDocument(file)
      if (scanned.amount === null && scanned.items.length === 0 && !scanned.providerName) {
        setError('No se ha podido leer ningún dato en este documento — prueba con otro, o rellena los datos a mano.')
      } else {
        setResult(scanned)
        setIncluded(new Set(scanned.items.map((_, i) => i)))
      }
    } catch (err) {
      setError(errorMessage(err, 'No se pudo leer el documento'))
    } finally {
      setLoading(false)
    }
  }

  function toggleItem(i: number) {
    setIncluded((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  return (
    <div className="card" style={{ padding: 8, marginBottom: 6 }}>
      {/* PEPA — prompt maestro B5: mismo selector de Cámara/Galería/Archivo ya usado en Compras/
          Documentos (FileOrPdfPicker), en vez del <input type=file> suelto de antes — nunca se
          construye un segundo selector. `file` siempre null porque este botón no conserva el archivo
          tras leerlo (su propio resultado ya se enseña debajo, revisable antes de aplicar). */}
      <FileOrPdfPicker
        file={null}
        sheetTitle="Importar presupuesto"
        onChange={(file) => {
          if (file) void handleFile(file)
        }}
      />
      {loading && (
        <p className="muted" style={{ fontSize: 12 }}>
          Leyendo el documento…
        </p>
      )}
      {error && (
        <p className="error" style={{ fontSize: 12 }}>
          {error}
        </p>
      )}
      {result && (
        <div className="card" style={{ padding: 8, marginTop: 6 }}>
          <p className="muted" style={{ fontSize: 12 }}>
            Esto es lo que se ha leído — revísalo, podrás corregirlo después:
          </p>
          <p style={{ fontSize: 13, margin: '2px 0' }}>
            {[result.providerName, result.amount !== null ? `${result.amount.toFixed(2)} €` : null, result.offerDate].filter(Boolean).join(' · ')}
          </p>
          {result.items.length > 0 && (
            <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
              {result.items.map((it, i) => (
                <li key={i} style={{ fontSize: 12 }}>
                  <label>
                    <input type="checkbox" checked={included.has(i)} onChange={() => toggleItem(i)} /> {it.name}
                    {it.subtotal !== null ? ` — ${it.subtotal.toFixed(2)} €` : ''}
                    {it.isPackage ? ' · 📦 paquete' : ''}
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className="filter-row">
            <button
              type="button"
              className="link-button"
              onClick={() => {
                onImported(
                  result,
                  result.items.filter((_, i) => included.has(i)),
                )
                setResult(null)
              }}
            >
              Usar estos datos
            </button>
            <button type="button" className="link-button" onClick={() => setResult(null)}>
              Descartar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function AddOfferForm({
  groupId,
  providers,
  existingOffers,
  onClose,
  onAdded,
}: {
  groupId: string
  providers: EventProvider[]
  existingOffers: EventTaskGroupOffer[]
  onClose: () => void
  onAdded: () => void
}) {
  const [providerMode, setProviderMode] = useState<'existing' | 'new'>(providers.length > 0 ? 'existing' : 'new')
  const [selectedProviderId, setSelectedProviderId] = useState('')
  const [newProviderName, setNewProviderName] = useState('')
  const [supersedesOfferId, setSupersedesOfferId] = useState('')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState<'texto' | 'desglosado'>('texto')
  const [scopeIncluded, setScopeIncluded] = useState('')
  const [items, setItems] = useState<DraftOfferItem[]>([])
  const [scopeExcluded, setScopeExcluded] = useState('')
  const [offerDate, setOfferDate] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [conditions, setConditions] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // "Importar presupuesto" solo rellena lo que esté VACÍO (igual que el resto de importaciones de PEPA) —
  // si trae servicios, pasa a Desglosado sola (revisable igual, nunca se pierden si luego se corrige a mano).
  function applyImported(result: OfferBudgetScanResult, importedItems: OfferBudgetScanItem[]) {
    if (providerMode === 'new' && !newProviderName && result.providerName) setNewProviderName(result.providerName)
    if (!amount && result.amount !== null) setAmount(String(result.amount))
    if (!offerDate && result.offerDate) setOfferDate(result.offerDate)
    if (!validUntil && result.validUntil) setValidUntil(result.validUntil)
    if (!conditions && result.conditions) setConditions(result.conditions)
    if (!notes && result.notes) setNotes(result.notes)
    if (importedItems.length > 0) {
      setMode('desglosado')
      setItems((prev) => [...prev, ...importedItems])
    }
  }

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    const providerName = providerMode === 'existing' ? (providers.find((p) => p.id === selectedProviderId)?.name ?? '') : newProviderName.trim()
    if (!providerName) {
      setError('Pon el nombre del proveedor.')
      return
    }
    const amountNum = Number(amount)
    if (amount.trim() === '' || Number.isNaN(amountNum) || amountNum < 0) {
      setError('Pon un importe válido.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const offer = await addEventTaskGroupOffer(groupId, {
        providerId: providerMode === 'existing' ? selectedProviderId || null : null,
        providerName,
        name: name.trim() || null,
        amount: amountNum,
        scopeIncluded: mode === 'texto' ? scopeIncluded.trim() || null : null,
        scopeExcluded: scopeExcluded.trim() || null,
        offerDate: offerDate || null,
        validUntil: validUntil || null,
        conditions: conditions.trim() || null,
        notes: notes.trim() || null,
        supersedesOfferId: supersedesOfferId || null,
      })
      if (file) await saveEventTaskGroupOfferAttachment(offer, file)
      if (mode === 'desglosado') {
        for (const item of items) {
          await addEventTaskGroupOfferItem(offer, item)
        }
      }
      onAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir la oferta'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="card member-form" style={{ padding: 8, marginTop: 6 }} onSubmit={handleSubmit}>
      {error && <p className="error">{error}</p>}
      {existingOffers.length > 0 && (
        <label>
          ¿Es una revisión de una oferta anterior? (opcional)
          <select value={supersedesOfferId} onChange={(e) => setSupersedesOfferId(e.target.value)}>
            <option value="">No, es una oferta nueva</option>
            {existingOffers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.providerName} · {o.amount.toFixed(2)} € {o.offerDate ? `(${o.offerDate})` : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="filter-row" style={{ marginTop: existingOffers.length > 0 ? 6 : 0 }}>
        <button type="button" className={'chip' + (providerMode === 'existing' ? ' chip-active' : '')} onClick={() => setProviderMode('existing')}>
          Proveedor ya existente
        </button>
        <button type="button" className={'chip' + (providerMode === 'new' ? ' chip-active' : '')} onClick={() => setProviderMode('new')}>
          Proveedor nuevo / sin dar de alta
        </button>
      </div>
      {providerMode === 'existing' ? (
        providers.length > 0 ? (
          <select value={selectedProviderId} onChange={(e) => setSelectedProviderId(e.target.value)} style={{ marginTop: 6 }}>
            <option value="">Elige un proveedor…</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Todavía no hay proveedores en este evento — escribe el nombre.
          </p>
        )
      ) : (
        <label style={{ marginTop: 6 }}>
          Nombre del proveedor
          <input type="text" value={newProviderName} onChange={(e) => setNewProviderName(e.target.value)} placeholder="Floristería..." />
        </label>
      )}
      <OfferFormFields
        name={name}
        setName={setName}
        amount={amount}
        setAmount={setAmount}
        mode={mode}
        setMode={setMode}
        scopeIncluded={scopeIncluded}
        setScopeIncluded={setScopeIncluded}
        items={items}
        setItems={setItems}
        scopeExcluded={scopeExcluded}
        setScopeExcluded={setScopeExcluded}
        offerDate={offerDate}
        setOfferDate={setOfferDate}
        validUntil={validUntil}
        setValidUntil={setValidUntil}
        conditions={conditions}
        setConditions={setConditions}
        notes={notes}
        setNotes={setNotes}
        file={file}
        setFile={setFile}
        hasExistingAttachment={false}
        onImported={applyImported}
      />
      <div className="filter-row" style={{ marginTop: 8 }}>
        <button type="submit" disabled={saving}>
          {saving ? 'Guardando…' : 'Añadir oferta'}
        </button>
        <button type="button" className="link-button" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function EditOfferForm({
  offer,
  providers,
  onDone,
  onSaved,
}: {
  offer: EventTaskGroupOffer
  providers: EventProvider[]
  onDone: () => void
  onSaved: () => void
}) {
  const [providerName, setProviderName] = useState(offer.providerName)
  const [name, setName] = useState(offer.name ?? '')
  const [amount, setAmount] = useState(String(offer.amount))
  // Por defecto Texto libre; en cuanto se sepa si la oferta ya tenía servicios (carga async más abajo)
  // pasa sola a Desglosado — nunca se pierden servicios ya guardados por no entrar en ese modo.
  const [mode, setMode] = useState<'texto' | 'desglosado'>('texto')
  const [scopeIncluded, setScopeIncluded] = useState(offer.scopeIncluded ?? '')
  const [items, setItems] = useState<DraftOfferItem[]>([])
  // IDs de los servicios tal y como estaban guardados ANTES de abrir el formulario — para saber cuáles
  // borrar de verdad al guardar (los que ya no están en "items") sin tocar nada si el usuario nunca llega
  // a guardar en modo Desglosado (petición real: cambiar de Texto libre a Desglosado y volver nunca borra
  // nada en silencio).
  const [originalItemIds, setOriginalItemIds] = useState<string[]>([])
  const [scopeExcluded, setScopeExcluded] = useState(offer.scopeExcluded ?? '')
  const [offerDate, setOfferDate] = useState(offer.offerDate ?? '')
  const [validUntil, setValidUntil] = useState(offer.validUntil ?? '')
  const [conditions, setConditions] = useState(offer.conditions ?? '')
  const [notes, setNotes] = useState(offer.notes ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listEventTaskGroupOfferItems(offer.id)
      .then((existing) => {
        setItems(existing.map((it) => ({ id: it.id, name: it.name, description: it.description, quantity: it.quantity, unit: it.unit, unitPrice: it.unitPrice, subtotal: it.subtotal, isPackage: it.isPackage })))
        setOriginalItemIds(existing.map((it) => it.id))
        if (existing.length > 0) setMode('desglosado')
      })
      .catch(() => {})
  }, [offer.id])

  // "Importar presupuesto" también disponible al editar (petición real: el mismo formulario sirve para
  // alta y edición) — solo rellena lo vacío; si trae servicios, pasa a Desglosado y los AÑADE a los que ya
  // hubiera, nunca los sustituye.
  function applyImported(result: OfferBudgetScanResult, importedItems: OfferBudgetScanItem[]) {
    if (!offerDate && result.offerDate) setOfferDate(result.offerDate)
    if (!validUntil && result.validUntil) setValidUntil(result.validUntil)
    if (!conditions && result.conditions) setConditions(result.conditions)
    if (!notes && result.notes) setNotes(result.notes)
    if (importedItems.length > 0) {
      setMode('desglosado')
      setItems((prev) => [...prev, ...importedItems])
    }
  }

  async function save() {
    const amountNum = Number(amount)
    if (!providerName.trim() || amount.trim() === '' || Number.isNaN(amountNum) || amountNum < 0) {
      setError('Revisa el proveedor y el importe.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateEventTaskGroupOffer(offer.id, {
        providerName,
        name: name.trim() || null,
        amount: amountNum,
        scopeIncluded: mode === 'texto' ? scopeIncluded.trim() || null : null,
        scopeExcluded: scopeExcluded.trim() || null,
        offerDate: offerDate || null,
        validUntil: validUntil || null,
        conditions: conditions.trim() || null,
        notes: notes.trim() || null,
      })
      if (file) await saveEventTaskGroupOfferAttachment(offer, file)
      // Los servicios solo se sincronizan si se guarda ESTANDO en modo Desglosado — cambiar de modo y
      // volver, sin llegar a guardar así, nunca toca lo que ya hubiera (regla explícita: no perder
      // información por cambiar de modalidad).
      if (mode === 'desglosado') {
        const currentIds = new Set(items.filter((i) => i.id).map((i) => i.id as string))
        for (const removedId of originalItemIds) {
          if (!currentIds.has(removedId)) await deleteEventTaskGroupOfferItem(removedId)
        }
        for (const item of items) {
          if (item.id) await updateEventTaskGroupOfferItem(item.id, item)
          else await addEventTaskGroupOfferItem(offer, item)
        }
      }
      onSaved()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card member-form" style={{ padding: 8, marginTop: 6 }}>
      {error && <p className="error">{error}</p>}
      <label>
        Proveedor
        <input type="text" value={providerName} onChange={(e) => setProviderName(e.target.value)} list="edit-offer-providers" />
        <datalist id="edit-offer-providers">
          {providers.map((p) => (
            <option key={p.id} value={p.name} />
          ))}
        </datalist>
      </label>
      <OfferFormFields
        name={name}
        setName={setName}
        amount={amount}
        setAmount={setAmount}
        mode={mode}
        setMode={setMode}
        scopeIncluded={scopeIncluded}
        setScopeIncluded={setScopeIncluded}
        items={items}
        setItems={setItems}
        scopeExcluded={scopeExcluded}
        setScopeExcluded={setScopeExcluded}
        offerDate={offerDate}
        setOfferDate={setOfferDate}
        validUntil={validUntil}
        setValidUntil={setValidUntil}
        conditions={conditions}
        setConditions={setConditions}
        notes={notes}
        setNotes={setNotes}
        file={file}
        setFile={setFile}
        hasExistingAttachment={Boolean(offer.attachmentStoragePath)}
        onImported={applyImported}
      />
      <div className="filter-row" style={{ marginTop: 8 }}>
        <button type="button" onClick={() => void save()} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button type="button" className="link-button" onClick={onDone}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

// Fase 5 (Parte B1, prompt maestro) — ofertas SUELTAS de un proveedor concreto, sin encargo todavía:
// se usa tanto desde el registro global (eventId null) como desde Proveedores de un evento (eventId
// puesto). Reutiliza EditOfferForm (sirve igual para una oferta suelta: updateEventTaskGroupOffer y
// saveEventTaskGroupOfferAttachment no tocan group/event/global_provider_id).
function ProviderOffersPanel({
  eventId,
  globalProviderId,
  providerName,
}: {
  eventId: string | null
  globalProviderId: string
  providerName: string
}) {
  const [open, setOpen] = useState(false)
  const [offers, setOffers] = useState<EventTaskGroupOffer[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    listLooseOffersForProvider(globalProviderId, eventId)
      .then(setOffers)
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar las ofertas')))
  }
  useEffect(() => {
    if (open) reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, eventId, globalProviderId])

  async function handleToggleDiscard(offer: EventTaskGroupOffer) {
    setError(null)
    try {
      await setEventTaskGroupOfferStatus(offer.id, offer.status === 'descartada' ? 'recibida' : 'descartada')
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo cambiar el estado'))
    }
  }

  async function handleViewAttachment(offer: EventTaskGroupOffer) {
    if (!offer.attachmentStoragePath) return
    try {
      const url = await getEventTaskGroupOfferAttachmentUrl(offer.attachmentStoragePath)
      window.open(url, '_blank', 'noopener')
    } catch (err) {
      setError(errorMessage(err, 'No se pudo abrir el adjunto'))
    }
  }

  return (
    <div style={{ marginTop: 4 }}>
      <button type="button" className="link-button" onClick={() => setOpen((v) => !v)} style={{ fontSize: 12 }}>
        {open ? '▾' : '▸'} 💰 Ofertas{offers.length > 0 ? ` (${offers.length})` : ''}
      </button>
      {open && (
        <div className="card" style={{ padding: 8, marginTop: 4 }}>
          {error && <p className="error">{error}</p>}
          {offers.length === 0 && !showAdd && (
            <p className="muted" style={{ fontSize: 12 }}>
              Todavía no hay ninguna oferta registrada con este proveedor{eventId ? ' para este evento' : ''}.
            </p>
          )}
          {offers.map((o) =>
            editingId === o.id ? (
              <EditOfferForm key={o.id} offer={o} providers={[]} onDone={() => setEditingId(null)} onSaved={() => { setEditingId(null); reload() }} />
            ) : (
              <div key={o.id} className="card" style={{ padding: 8, marginTop: 6, opacity: o.status === 'descartada' ? 0.6 : 1 }}>
                <div className="inline-fields" style={{ alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <strong>{o.amount.toFixed(2)} €</strong>
                  </div>
                  <span className="muted" style={{ fontSize: 11 }}>
                    {OFFER_STATUS_LABELS[o.status]}
                  </span>
                  <OfferCardMenu
                    open={menuOpenId === o.id}
                    onToggle={() => setMenuOpenId((cur) => (cur === o.id ? null : o.id))}
                    onEdit={() => setEditingId(o.id)}
                    discarded={o.status === 'descartada'}
                    onToggleDiscard={() => void handleToggleDiscard(o)}
                    onDelete={() => deleteEventTaskGroupOffer(o).then(reload)}
                  />
                </div>
                {o.supersedesOfferId && (
                  <p className="muted" style={{ fontSize: 11, margin: '2px 0' }}>
                    🔁 Revisión de otra oferta{(() => {
                      const prev = offers.find((p) => p.id === o.supersedesOfferId)
                      return prev ? ` (antes ${prev.amount.toFixed(2)} €)` : ''
                    })()}
                  </p>
                )}
                {(o.scopeIncluded || o.scopeExcluded) && (
                  <p className="muted" style={{ fontSize: 12, margin: '2px 0' }}>
                    {o.scopeIncluded && <>Incluye: {o.scopeIncluded}</>}
                    {o.scopeIncluded && o.scopeExcluded ? ' · ' : ''}
                    {o.scopeExcluded && <>No incluye: {o.scopeExcluded}</>}
                  </p>
                )}
                {(o.offerDate || o.validUntil) && (
                  <p className="muted" style={{ fontSize: 12, margin: '2px 0' }}>
                    {o.offerDate ? `Oferta: ${o.offerDate}` : ''}
                    {o.offerDate && o.validUntil ? ' · ' : ''}
                    {o.validUntil ? `Válida hasta: ${o.validUntil}` : ''}
                  </p>
                )}
                {o.conditions && (
                  <p className="muted" style={{ fontSize: 12, margin: '2px 0' }}>
                    Condiciones: {o.conditions}
                  </p>
                )}
                {o.notes && (
                  <p className="muted" style={{ fontSize: 12, margin: '2px 0' }}>
                    📝 {o.notes}
                  </p>
                )}
                {o.attachmentStoragePath && (
                  <button type="button" className="link-button" style={{ fontSize: 12, maxWidth: '100%', overflow: 'hidden' }} onClick={() => void handleViewAttachment(o)}>
                    <span style={{ display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>
                      📎 {o.attachmentOriginalName ?? 'Ver adjunto'}
                    </span>
                  </button>
                )}
                {eventId && (
                  <p className="muted" style={{ fontSize: 11, margin: '2px 0' }}>
                    Sin encargo todavía — vincúlala desde "🗂️ Encargos" cuando corresponda.
                  </p>
                )}
                <OfferItemsPanel offer={o} />
              </div>
            ),
          )}
          {showAdd ? (
            <AddLooseOfferForm
              eventId={eventId}
              globalProviderId={globalProviderId}
              providerName={providerName}
              existingOffers={offers}
              onClose={() => setShowAdd(false)}
              onAdded={() => { setShowAdd(false); reload() }}
            />
          ) : (
            <button type="button" className="link-button" onClick={() => setShowAdd(true)} style={{ marginTop: 6 }}>
              + Añadir oferta
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function AddLooseOfferForm({
  eventId,
  globalProviderId,
  providerName,
  existingOffers,
  onClose,
  onAdded,
}: {
  eventId: string | null
  globalProviderId: string
  providerName: string
  existingOffers: EventTaskGroupOffer[]
  onClose: () => void
  onAdded: () => void
}) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState<'texto' | 'desglosado'>('texto')
  const [scopeIncluded, setScopeIncluded] = useState('')
  const [items, setItems] = useState<DraftOfferItem[]>([])
  const [scopeExcluded, setScopeExcluded] = useState('')
  const [offerDate, setOfferDate] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [conditions, setConditions] = useState('')
  const [notes, setNotes] = useState('')
  const [supersedesOfferId, setSupersedesOfferId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // "Importar presupuesto" solo rellena lo que esté VACÍO — el proveedor ya viene fijo del contexto, así
  // que un providerName distinto leído del documento se ignora (nunca sustituye al proveedor elegido).
  function applyImported(result: OfferBudgetScanResult, importedItems: OfferBudgetScanItem[]) {
    if (!amount && result.amount !== null) setAmount(String(result.amount))
    if (!offerDate && result.offerDate) setOfferDate(result.offerDate)
    if (!validUntil && result.validUntil) setValidUntil(result.validUntil)
    if (!conditions && result.conditions) setConditions(result.conditions)
    if (!notes && result.notes) setNotes(result.notes)
    if (importedItems.length > 0) {
      setMode('desglosado')
      setItems((prev) => [...prev, ...importedItems])
    }
  }

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    const amountNum = Number(amount)
    if (amount.trim() === '' || Number.isNaN(amountNum) || amountNum < 0) {
      setError('Pon un importe válido.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const offer = await addLooseTaskGroupOffer({
        globalProviderId,
        eventId,
        providerName,
        name: name.trim() || null,
        amount: amountNum,
        scopeIncluded: mode === 'texto' ? scopeIncluded.trim() || null : null,
        scopeExcluded: scopeExcluded.trim() || null,
        offerDate: offerDate || null,
        validUntil: validUntil || null,
        conditions: conditions.trim() || null,
        notes: notes.trim() || null,
        supersedesOfferId: supersedesOfferId || null,
      })
      if (file) await saveEventTaskGroupOfferAttachment(offer, file)
      if (mode === 'desglosado') {
        for (const item of items) {
          await addEventTaskGroupOfferItem(offer, item)
        }
      }
      onAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir la oferta'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="card member-form" style={{ padding: 8, marginTop: 6 }} onSubmit={handleSubmit}>
      {error && <p className="error">{error}</p>}
      {existingOffers.length > 0 && (
        <label>
          ¿Es una revisión de una oferta anterior? (opcional)
          <select value={supersedesOfferId} onChange={(e) => setSupersedesOfferId(e.target.value)}>
            <option value="">No, es una oferta nueva</option>
            {existingOffers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.amount.toFixed(2)} € {o.offerDate ? `(${o.offerDate})` : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      <OfferFormFields
        name={name}
        setName={setName}
        amount={amount}
        setAmount={setAmount}
        mode={mode}
        setMode={setMode}
        scopeIncluded={scopeIncluded}
        setScopeIncluded={setScopeIncluded}
        items={items}
        setItems={setItems}
        scopeExcluded={scopeExcluded}
        setScopeExcluded={setScopeExcluded}
        offerDate={offerDate}
        setOfferDate={setOfferDate}
        validUntil={validUntil}
        setValidUntil={setValidUntil}
        conditions={conditions}
        setConditions={setConditions}
        notes={notes}
        setNotes={setNotes}
        file={file}
        setFile={setFile}
        hasExistingAttachment={false}
        onImported={applyImported}
      />
      <div className="filter-row" style={{ marginTop: 8 }}>
        <button type="submit" disabled={saving}>
          {saving ? 'Guardando…' : 'Añadir oferta'}
        </button>
        <button type="button" className="link-button" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

// Fase 6 (Parte B2, prompt maestro) — servicios estructurados dentro de una oferta: SOLO desglosa el
// importe total de la oferta (nunca lo sustituye ni lo recalcula). Un paquete indivisible (is_package)
// puede no tener relación matemática entre cantidad/precio unitario y subtotal — subtotal manda siempre.
// "Seleccionada" (por línea) es solo para comparar qué servicios interesan de esta oferta en concreto;
// nunca contrata ni completa nada por sí sola — eso sigue siendo cosa de "Resolver encargo".
function OfferItemsPanel({ offer }: { offer: EventTaskGroupOffer }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<EventTaskGroupOfferItem[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    listEventTaskGroupOfferItems(offer.id)
      .then(setItems)
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar los servicios')))
  }
  useEffect(() => {
    if (open) reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, offer.id])

  async function handleToggleSelected(item: EventTaskGroupOfferItem) {
    setError(null)
    try {
      await setEventTaskGroupOfferItemSelected(item.id, !item.selected)
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo cambiar'))
    }
  }

  const sumAll = items.reduce((s, i) => s + (i.subtotal ?? 0), 0)
  const sumSelected = items.filter((i) => i.selected).reduce((s, i) => s + (i.subtotal ?? 0), 0)
  const hasAnySubtotal = items.some((i) => i.subtotal !== null)
  const amountMismatch = hasAnySubtotal && Math.abs(sumAll - offer.amount) > 0.009

  return (
    <div style={{ marginTop: 4 }}>
      <button type="button" className="link-button" onClick={() => setOpen((v) => !v)} style={{ fontSize: 12 }}>
        {open ? '▾' : '▸'} 📋 Servicios{items.length > 0 ? ` (${items.length})` : ''}
      </button>
      {open && (
        <div className="card" style={{ padding: 8, marginTop: 4 }}>
          {error && <p className="error">{error}</p>}
          {items.length === 0 && !showAdd && (
            <p className="muted" style={{ fontSize: 12 }}>
              Esta oferta todavía no tiene servicios desglosados — el importe de arriba es el total tal cual, sin desglose.
            </p>
          )}
          {items.map((item) =>
            editingId === item.id ? (
              <DraftItemForm
                key={item.id}
                initial={item}
                onCancel={() => setEditingId(null)}
                onSave={(updated) => void updateEventTaskGroupOfferItem(item.id, updated).then(() => { setEditingId(null); reload() })}
              />
            ) : (
              <div key={item.id} className="inline-fields" style={{ alignItems: 'center', marginTop: 4, opacity: item.selected ? 1 : 0.55 }}>
                <input type="checkbox" checked={item.selected} onChange={() => void handleToggleSelected(item)} aria-label="Seleccionada para comparar" />
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: 13 }}>{item.name}</strong>
                  {item.isPackage ? <span className="muted" style={{ fontSize: 11 }}> · 📦 paquete</span> : null}
                  {(item.quantity !== null || item.unit) && (
                    <span className="muted" style={{ fontSize: 12 }}>
                      {' '}
                      · {item.quantity ?? ''} {item.unit ?? ''}
                      {item.unitPrice !== null ? ` × ${item.unitPrice.toFixed(2)} €` : ''}
                    </span>
                  )}
                  {item.description && (
                    <p className="muted" style={{ fontSize: 12, margin: '2px 0' }}>
                      {item.description}
                    </p>
                  )}
                </div>
                <span style={{ fontSize: 12 }}>{item.subtotal !== null ? `${item.subtotal.toFixed(2)} €` : 'sin importe'}</span>
                <button type="button" className="link-button" onClick={() => setEditingId(item.id)}>
                  ✏️
                </button>
                <ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Borrar servicio" onConfirm={() => deleteEventTaskGroupOfferItem(item.id).then(reload)} />
              </div>
            ),
          )}
          {hasAnySubtotal && (
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Suma de las líneas: {sumAll.toFixed(2)} € · Seleccionadas: {sumSelected.toFixed(2)} €
              {amountMismatch && <> · El total de la oferta ({offer.amount.toFixed(2)} €) no coincide — puede incluir descuento, impuestos u otro cargo aparte.</>}
            </p>
          )}
          {showAdd ? (
            <DraftItemForm
              initial={null}
              onCancel={() => setShowAdd(false)}
              onSave={(item) => void addEventTaskGroupOfferItem(offer, item).then(() => { setShowAdd(false); reload() })}
            />
          ) : (
            <button type="button" className="link-button" onClick={() => setShowAdd(true)} style={{ marginTop: 6 }}>
              + Añadir servicio
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const RESOLUTION_METHOD_OPTIONS: { value: EventTaskGroupResolutionMethod; label: string }[] = [
  { value: 'empresa', label: 'Empresa/proveedor' },
  { value: 'nosotros', label: 'Lo hacemos nosotros' },
  { value: 'ayuda', label: 'Nos ayuda alguien' },
  { value: 'otro', label: 'Otra opción' },
]

// "Marcar encargo como resuelto" (Tanda Encargos v2) — completa EXCLUSIVAMENTE las tareas pendientes
// ACTUALES de este encargo (las que llegan en `tasks`, ya filtradas por el padre) — nunca una tarea
// posterior y distinta aunque su título se parezca (p. ej. "Recoger las flores" nunca se completa aquí).
// Si el método es "Empresa/proveedor", el proveedor (ya existente o nuevo, vía el sistema de Proveedores
// de siempre) y el precio TOTAL opcional (nunca repetido por tarea) se guardan en el propio encargo —
// nunca en event_budget_items, para no duplicar ninguna partida de Presupuesto ya existente por decisión.
function ResolveGroupModal({
  event,
  group,
  tasks,
  onClose,
  onResolved,
}: {
  event: FamilyEvent
  group: EventTaskGroup
  tasks: EventTask[]
  onClose: () => void
  onResolved: () => Promise<void>
}) {
  const [method, setMethod] = useState<EventTaskGroupResolutionMethod | ''>('')
  const [note, setNote] = useState('')
  const [providers, setProviders] = useState<EventProvider[]>([])
  const [providerMode, setProviderMode] = useState<'existing' | 'new'>('existing')
  const [selectedProviderId, setSelectedProviderId] = useState('')
  const [newProviderName, setNewProviderName] = useState('')
  const [price, setPrice] = useState('')
  // Fase 7 (Parte C2) — qué oferta se usó para rellenar este formulario, si alguna (trazabilidad
  // oferta → encargo). Puramente informativo: cambiar a mano lo que la oferta rellenó no borra el vínculo.
  const [usedOfferId, setUsedOfferId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Antes solo se cargaban al elegir "Empresa/proveedor"; ahora hacen falta desde el principio para la
  // comparación de ofertas (OffersComparison), que se ve aunque todavía no se haya elegido el método.
  useEffect(() => {
    listEventProviders(event.id)
      .then((all) => setProviders(all.filter((p) => !p.archived)))
      .catch(() => {})
  }, [event.id])

  async function handleSubmit() {
    if (!method) {
      setError('Elige cómo se ha resuelto.')
      return
    }
    if (method === 'empresa' && providerMode === 'existing' && !selectedProviderId) {
      setError('Elige un proveedor, o da de alta uno nuevo.')
      return
    }
    if (method === 'empresa' && providerMode === 'new' && !newProviderName.trim()) {
      setError('Ponle un nombre al proveedor nuevo.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      let providerId: string | null = null
      let providerName: string | null = null
      if (method === 'empresa') {
        if (providerMode === 'new') {
          providerId = await addEventProvider(event.id, { name: newProviderName })
          providerName = newProviderName.trim()
        } else {
          providerId = selectedProviderId
          providerName = providers.find((p) => p.id === selectedProviderId)?.name ?? null
        }
      }
      let paymentId: string | null = null
      const amount = Number(price)
      if (method === 'empresa' && price.trim() !== '' && !Number.isNaN(amount) && amount > 0) {
        // UN único pago por el TOTAL del encargo — nunca uno por tarea ni por decisión (ver cabecera).
        paymentId = await addEventPayment(event.id, { concept: group.name, totalAmount: amount, depositPaid: 0, providerId, providerName })
      }
      await resolveEventTaskGroup(group.id, { method, note: note.trim() ? note.trim() : null, providerId, providerName, paymentId, offerId: usedOfferId })
      // Fase 7 (Parte C3, decisión explícita del usuario): "contratar" y "completar tareas" son acciones
      // separadas — resolver un encargo YA NO completa ninguna tarea; cada una se marca hecha a mano, como
      // cualquier otra tarea del evento.
      await onResolved()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo resolver el encargo'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Resolver encargo «{group.name}»
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="card member-form">
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            {tasks.length > 0
              ? `Este encargo tiene ${tasks.length} tarea${tasks.length === 1 ? '' : 's'} pendiente${tasks.length === 1 ? '' : 's'} — resolverlo registra cómo y con quién, pero no las completa: marca cada una a mano cuando esté hecha de verdad.`
              : 'Este encargo no tiene ninguna tarea pendiente — se marcará resuelto igualmente.'}
          </p>
          {error && <p className="error">{error}</p>}
          <OffersComparison
            group={group}
            providers={providers}
            onUseOffer={(offer) => {
              setMethod('empresa')
              if (offer.providerId) {
                setProviderMode('existing')
                setSelectedProviderId(offer.providerId)
              } else {
                setProviderMode('new')
                setNewProviderName(offer.providerName)
              }
              setUsedOfferId(offer.id)
              // Parte C4 — si la oferta tiene servicios desglosados con importe, el precio se propone POR
              // SERVICIOS (la suma de los seleccionados); si no, el total simple de la oferta tal cual.
              // Siempre editable después — nunca se fija ni se sustituye sin que la familia lo confirme.
              listEventTaskGroupOfferItems(offer.id)
                .then((items) => {
                  const selectedSum = items.filter((i) => i.selected && i.subtotal !== null).reduce((s, i) => s + (i.subtotal ?? 0), 0)
                  setPrice(String(selectedSum > 0 ? selectedSum : offer.amount))
                })
                .catch(() => setPrice(String(offer.amount)))
            }}
          />
          <div className="muted" style={{ fontSize: 12, fontWeight: 600, marginTop: 6 }}>
            ¿Cómo se ha resuelto?
          </div>
          <div className="filter-row" style={{ flexWrap: 'wrap', marginTop: 4 }}>
            {RESOLUTION_METHOD_OPTIONS.map((o) => (
              <button key={o.value} type="button" className={'chip' + (method === o.value ? ' chip-active' : '')} onClick={() => setMethod(o.value)}>
                {o.label}
              </button>
            ))}
          </div>
          {method === 'empresa' && (
            <div className="card" style={{ padding: 8, marginTop: 6 }}>
              <div className="filter-row">
                <button type="button" className={'chip' + (providerMode === 'existing' ? ' chip-active' : '')} onClick={() => setProviderMode('existing')}>
                  Proveedor ya existente
                </button>
                <button type="button" className={'chip' + (providerMode === 'new' ? ' chip-active' : '')} onClick={() => setProviderMode('new')}>
                  Proveedor nuevo
                </button>
              </div>
              {providerMode === 'existing' ? (
                providers.length > 0 ? (
                  <select value={selectedProviderId} onChange={(e) => setSelectedProviderId(e.target.value)} style={{ marginTop: 6 }}>
                    <option value="">Elige un proveedor…</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.type ? ` (${p.type})` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    Todavía no hay proveedores en este evento — da de alta uno nuevo.
                  </p>
                )
              ) : (
                <label style={{ marginTop: 6 }}>
                  Nombre del proveedor
                  <input type="text" value={newProviderName} onChange={(e) => setNewProviderName(e.target.value)} placeholder="Floristería..." />
                </label>
              )}
              <label style={{ marginTop: 6 }}>
                Precio TOTAL del encargo, opcional (€)
                <input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Sin precio todavía" />
              </label>
            </div>
          )}
          {(method === 'nosotros' || method === 'ayuda' || method === 'otro') && (
            <label style={{ marginTop: 6 }}>
              Nota, opcional
              <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder={method === 'ayuda' ? 'Quién ayuda...' : 'Detalle...'} />
            </label>
          )}
          <button type="button" onClick={() => void handleSubmit()} disabled={saving} style={{ marginTop: 10 }}>
            {saving ? 'Resolviendo…' : 'Marcar encargo como resuelto'}
          </button>
        </div>
      </div>
    </div>
  )
}

// "Siguiente preparativo" (Tanda Encargos v2) — exactamente 3 acciones por sugerencia: Crear preparativo /
// No hace falta / + Crear otro. Efímero (solo en memoria): nunca vuelve a aparecer solo porque la familia
// recargue la página o vuelva a entrar — ver el informe de la tanda.
function NextStepPromptModal({
  prompt,
  onClose,
  onCreate,
  onCreateOther,
  onDismiss,
}: {
  prompt: { sourceLabel: string; suggestions: NextStepSuggestion[]; createdKeys: Set<string> }
  onClose: () => void
  onCreate: (s: NextStepSuggestion) => void
  onCreateOther: () => void
  onDismiss: (key: string) => void
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            ✅ {prompt.sourceLabel}
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="card member-form">
          {prompt.suggestions.map((s) => (
            <div key={s.key} className="card" style={{ padding: 8 }}>
              <p style={{ margin: 0 }}>PEPA te propone como siguiente preparativo: «{s.title}»</p>
              <div className="filter-row" style={{ marginTop: 6, flexWrap: 'wrap' }}>
                <button type="button" disabled={prompt.createdKeys.has(s.key)} onClick={() => onCreate(s)}>
                  {prompt.createdKeys.has(s.key) ? '✓ Creado' : 'Crear preparativo'}
                </button>
                <button type="button" className="link-button" onClick={() => onDismiss(s.key)}>
                  No hace falta
                </button>
              </div>
            </div>
          ))}
          <button type="button" className="link-button" onClick={onCreateOther}>
            + Crear otro
          </button>
        </div>
      </div>
    </div>
  )
}

function EventShoppingSection({ items }: { items: ShoppingItem[] }) {
  const pending = items.filter((i) => i.status === 'pendiente')
  const bought = items.filter((i) => i.status === 'comprado')
  return (
    <div className="card event-card">
      <strong>🛍️ Compras</strong>
      <p className="muted" style={{ fontSize: 12, margin: '2px 0 8px' }}>
        Lo que se ha traspasado a la lista de la compra para este evento — márcalo como comprado o añade más desde
        Compras → Lista de la compra.
      </p>
      {items.length === 0 ? (
        <p className="muted">Todavía no hay nada traspasado a Compras.</p>
      ) : (
        <div className="price-row-list">
          {pending.map((i) => (
            <div key={i.id} className="price-row">
              <span className="price-row-name">{i.name}</span>
              <span className="muted" style={{ fontSize: 12 }}>
                Pendiente
              </span>
            </div>
          ))}
          {bought.map((i) => (
            <div key={i.id} className="price-row">
              <span className="price-row-name" style={{ textDecoration: 'line-through' }}>
                {i.name}
              </span>
              <span className="muted" style={{ fontSize: 12 }}>
                ✓
              </span>
            </div>
          ))}
        </div>
      )}
      <Link to="/compras" className="link-button" style={{ display: 'inline-block', marginTop: 8 }}>
        Ver todo en Compras →
      </Link>
    </div>
  )
}

// Petición real: "Y que va a buscar si pongo en mi casa?" — un enlace
// de mapa hecho con el texto de "Lugar" tal cual no sirve si ese texto
// es informal ("en mi casa"). "Creo que es menos trabajo eligiendo
// directamente la ubicación del sitio en el mapa, como en el
// calendario. Se puede poner Lugar para que aparezca en la invitación
// y Ubicación para enviar a todos" — mismo buscador que ya usa
// Calendario (Nominatim/OpenStreetMap, gratis), pero como campo aparte
// de "Lugar": elegir aquí una sugerencia solo guarda coordenadas, sin
// tocar el texto que se ve en la invitación.
function EventLocationCoordsPicker({
  coords,
  onCoordsChange,
  onPlaceDetails,
  initialAddress,
  initialPlaceId,
}: {
  coords: { latitude: number; longitude: number } | null
  onCoordsChange: (c: { latitude: number; longitude: number } | null) => void
  // Cierre de Fase 2 (Momentos/Google Maps) — opcional: nombre/dirección/place_id del sitio elegido, por
  // separado. Nadie más lo pasa (Calendario), así que su comportamiento no cambia; Momentos y el "Lugar"
  // simple de Eventos (events.venue_address/venue_place_id) lo usan para no perder lo que Google ya daba.
  onPlaceDetails?: (details: { name: string | null; address: string | null; placeId: string | null }) => void
  // Corrección real (bug observado: la dirección postal legible desaparecía al volver a abrir "Gestionar
  // evento") — quien ya tenga una dirección/place_id guardados (events.venue_address/venue_place_id) los
  // pasa aquí para reconstruir el resumen tal cual se guardó, en vez de arrancar siempre en null. Un
  // evento antiguo sin estos campos (solo coords) sigue cayendo al fallback "Ubicación real guardada" de
  // siempre — comportamiento idéntico al actual cuando se omiten estas props.
  initialAddress?: string | null
  initialPlaceId?: string | null
}) {
  const [showMap, setShowMap] = useState(false)
  const [pickedLabel, setPickedLabel] = useState<string | null>(null)
  // Corrección real (comprobada en iPhone): este componente ya reenviaba name/address/placeId hacia
  // MomentForm vía onPlaceDetails, pero nunca se quedaba su propia copia — su PROPIO enlace "Ver en
  // Google Maps" (el de aquí abajo, el que se ve justo al confirmar en el mapa, antes de guardar) caía
  // siempre a coordenadas aunque Google sí hubiera dado un place_id real. Se guardan aquí también, solo
  // para que ESTE enlace y este resumen puedan usarlos — MomentForm sigue teniendo su propia copia
  // (locationAddress/locationPlaceId) para lo que de verdad se guarda, sin relación con esto.
  const [pickedName, setPickedName] = useState<string | null>(null)
  const [pickedAddress, setPickedAddress] = useState<string | null>(initialAddress ?? null)
  const [pickedPlaceId, setPickedPlaceId] = useState<string | null>(initialPlaceId ?? null)

  function handleConfirmMapLocation(result: { latitude: number; longitude: number; label: string | null; name: string | null; address: string | null; placeId: string | null }) {
    onCoordsChange({ latitude: result.latitude, longitude: result.longitude })
    setPickedLabel(result.label)
    setPickedName(result.name)
    setPickedAddress(result.address)
    setPickedPlaceId(result.placeId)
    onPlaceDetails?.({ name: result.name, address: result.address, placeId: result.placeId })
    setShowMap(false)
  }

  function handleClear() {
    onCoordsChange(null)
    setPickedLabel(null)
    setPickedName(null)
    setPickedAddress(null)
    setPickedPlaceId(null)
    // Quitar la ubicación también debe olvidar la dirección/place_id que quien use esta copia (p. ej.
    // ManageEventModal) tenga guardados — si no, "Guardar" volvería a escribirlos aunque coords sea null.
    onPlaceDetails?.({ name: null, address: null, placeId: null })
  }

  return (
    <div>
      <label>
        Ubicación (para el enlace del mapa que reciben los invitados)
        <div className="inline-fields">
          <button type="button" className="link-button" onClick={() => setShowMap(true)}>
            🔍 Buscar en el mapa
          </button>
        </div>
      </label>
      {showMap && (
        <LocationPickerModal
          initialCoords={coords}
          onConfirm={handleConfirmMapLocation}
          onClose={() => setShowMap(false)}
        />
      )}
      {coords && (
        <div style={{ marginTop: 4 }}>
          {/* Nombre y dirección en líneas separadas — un único texto fusionado (antes "✓ {pickedLabel}")
              no dejaba claro cuál de los dos era, sobre todo cuando ambos tienen una pinta similar. */}
          <div className="muted" style={{ fontSize: 12 }}>
            {pickedName ? (
              <>
                <div>✓ {pickedName}</div>
                {pickedAddress && <div>{pickedAddress}</div>}
              </>
            ) : (
              <div>✓ {pickedAddress ?? pickedLabel ?? 'Ubicación real guardada'}</div>
            )}
          </div>
          <div className="filter-row" style={{ marginTop: 4, alignItems: 'center' }}>
            {/* Petición real: "esa ubicación se puede abrir también en Google Maps?" — para comprobar que
                el punto elegido es el correcto antes de guardar, no solo cuando lo reciben los invitados.
                Prioridad real (buildMapsUrl): place_id (abre la ficha exacta del establecimiento) >
                dirección legible (misma precisión, mejor que coordenadas en bruto) > coordenadas (un
                punto marcado a mano, sin dirección resuelta) > texto, nunca al revés. */}
            <a
              href={buildMapsUrl(pickedName ?? pickedLabel ?? '', coords, pickedPlaceId, pickedAddress)}
              target="_blank"
              rel="noopener noreferrer"
              className="link-button"
              style={{ textDecoration: 'none' }}
            >
              🔍 Ver en Google Maps
            </a>
            <button type="button" className="link-button" onClick={handleClear}>
              Quitar
            </button>
          </div>
        </div>
      )}
      <p className="muted" style={{ fontSize: 11, marginTop: 2 }}>
        "Lugar" es lo que verán en la invitación (puede ser "en mi casa" o cualquier cosa); esta búsqueda es solo para que el enlace del mapa lleve a la dirección real.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------
// Configurador — "✨ Cómo queréis que sea vuestra boda", acordeón plegable globalmente y por bloque
// (persistencia simple en localStorage, ver src/state/eventPlanningConfiguratorState.ts). Ceremonia y
// celebración (Fase 2), solo en boda La pareja (Fase 3), Invitados e invitaciones (Fase 4) y Momentos
// especiales (Fase 5, reajustada) están implementados; el resto del documento maestro (Comida y
// celebración, Música/fiesta/entretenimiento, Fotos y recuerdos...) llega en fases posteriores. El orden
// de los bloques NO determina ninguna prioridad de tareas — es puro orden de lectura.
//
// RETOQUE — motor común para cualquier tipo de evento: este componente YA NO devuelve null para eventos
// "simples" (cumpleaños, celebración, personalizado) — antes dependía por completo de la misma condición
// de siempre (ver su definición más abajo), así que un cumpleaños nunca veía NADA de este configurador, ni
// siquiera Invitados e invitaciones o Momentos especiales, que no tienen nada que ver con Ceremonia. Esa
// condición sigue existiendo (sigue siendo la ÚNICA, reutilizada en cabecera/"Gestionar evento"/aquí, para
// que los 3 sitios nunca diverjan — ver su propio comentario), pero ahora decide SOLO si se muestra el
// bloque "🕊️ Ceremonia y celebración" en concreto, nunca si se muestra el configurador entero. En su
// lugar, un evento sin ceremonia ve el bloque "📍 Dónde lo vais a celebrar" (más ligero: una sola pregunta
// de contexto, nunca la dirección exacta — esa sigue viviendo en venueLabel, Gestionar evento, igual que
// siempre) — exactamente la separación "cada bloque decide si tiene algo que mostrar" que ya anunciaba el
// comentario original de este componente.
// ---------------------------------------------------------------------

function EventPlanningConfigurator({
  event,
  onChanged,
  onDerivedDataChanged,
  onOpenMenu,
}: {
  event: FamilyEvent
  onChanged: () => void
  // «Ir a Menú del evento»: abre la tarjeta del menú (el gestor ya no vive dentro del cuestionario).
  onOpenMenu: () => void
  // Fallo 1 (Fase 3) — PairBlock escribe event_tasks/event_budget_items directamente en Supabase; sin
  // esto, Preparativos y la tarjeta-resumen de Presupuesto en EventDetail se quedan con el estado cargado
  // al montar, invisibles hasta recargar la página entera. Mismo hueco que nunca existió con Momentos
  // (Fase 2), que nunca toca esas dos tablas.
  onDerivedDataChanged: () => void
}) {
  const [open, setOpen] = useState(() => loadConfiguratorOpen(event.id))
  // Primer bloque: «Ceremonia y celebración» o «Celebración» (mismo acordeón, recuerda el estado que tuvieran
  // los dos antiguos). Nunca dos bloques paralelos. Empieza PLEGADO: solo se abre si la familia lo abrió antes
  // (clave nueva, o la antigua si la nueva nunca se guardó). Así no se fuerza abierto al entrar.
  const structuredByMoments = isEventStructuredByMoments(event)
  const [celebracionOpen, setCelebracionOpen] = useState(
    () => loadStoredConfiguratorOpen(event.id, 'celebracion') ?? loadStoredConfiguratorOpen(event.id, structuredByMoments ? 'ceremonia_celebracion' : 'lugar_contexto') ?? false,
  )
  // "📍 Dónde lo vais a celebrar" — alternativa ligera a Ceremonia y celebración para eventos SIN ceremonia
  // (cumpleaños, celebración, personalizado, o boda/comunión/bautizo con el módulo "ceremonia" apagado):
  // mutuamente excluyente con el bloque de arriba, nunca los dos a la vez.
  // "👰🤵 La pareja" — segundo bloque, solo para boda (DUAL_LOCATION_EVENT_TYPES también incluye
  // comunión/bautizo, que no tienen "pareja"). Mismo patrón exacto de acordeón por bloque que Ceremonia.
  const [pairOpen, setPairOpen] = useState(() => loadConfiguratorOpen(event.id, 'pareja'))
  // "👥 Invitados e invitaciones" — Fase 4, mismo patrón exacto de acordeón por bloque. A diferencia de
  // "La pareja" (exclusiva de boda), invitados/invitaciones aplica a cualquier evento que llegue a este
  // configurador (boda, comunión, bautizo...) — todos tienen invitados reales (event_guests).
  const [guestsBlockOpen, setGuestsBlockOpen] = useState(() => loadConfiguratorOpen(event.id, 'invitados'))
  // "🎉 Momentos especiales" — Fase 5 (reajustada): igual que Invitados, aplica a CUALQUIER tipo de
  // evento (su catálogo de momentos candidatos varía por tipo, pero el bloque en sí nunca depende de
  // event.type ni de isEventStructuredByMoments).
  const [momentosEspecialesOpen, setMomentosEspecialesOpen] = useState(() => loadConfiguratorOpen(event.id, 'momentos_especiales'))
  // "🍽️ Comida y bebida" — sexto bloque; aplica a cualquier tipo de evento (qué preguntas ve depende de lo que
  // ya se sabe del lugar, los invitados y los momentos, no del tipo).
  const [comidaOpen, setComidaOpen] = useState(() => loadConfiguratorOpen(event.id, 'comida'))
  // "🎭 Personas especiales" (Fase 2, plan de pendientes) — boda/bautizo/comunión. "👪 Familiares" — solo
  // bautizo/comunión (nunca boda, ver el porqué en eventSpecialPeople.ts). Mismo patrón de acordeón.
  const [personasEspecialesOpen, setPersonasEspecialesOpen] = useState(() => loadConfiguratorOpen(event.id, 'personas_especiales'))
  const [familiaresOpen, setFamiliaresOpen] = useState(() => loadConfiguratorOpen(event.id, 'familiares'))
  // "🎵 Música y fiesta" / "📷 Fotos y recuerdos" / "🌿 Otros y decoración" — séptimo/octavo/noveno bloque
  // (tanda "completar el configurador de boda"), exclusivos de boda igual que "La pareja".
  const [musicaFiestaOpen, setMusicaFiestaOpen] = useState(() => loadConfiguratorOpen(event.id, 'musica_fiesta'))
  const [fotosRecuerdosOpen, setFotosRecuerdosOpen] = useState(() => loadConfiguratorOpen(event.id, 'fotos_recuerdos'))
  const [otrosDecoracionOpen, setOtrosDecoracionOpen] = useState(() => loadConfiguratorOpen(event.id, 'otros_decoracion'))

  function toggleOpen() {
    const next = !open
    setOpen(next)
    saveConfiguratorOpen(event.id, null, next)
  }
  function toggleCelebracion() {
    const next = !celebracionOpen
    setCelebracionOpen(next)
    saveConfiguratorOpen(event.id, 'celebracion', next)
  }
  function togglePairBlock() {
    const next = !pairOpen
    setPairOpen(next)
    saveConfiguratorOpen(event.id, 'pareja', next)
  }
  function toggleGuestsBlock() {
    const next = !guestsBlockOpen
    setGuestsBlockOpen(next)
    saveConfiguratorOpen(event.id, 'invitados', next)
  }
  function toggleMomentosEspecialesBlock() {
    const next = !momentosEspecialesOpen
    setMomentosEspecialesOpen(next)
    saveConfiguratorOpen(event.id, 'momentos_especiales', next)
  }
  function toggleComidaBlock() {
    const next = !comidaOpen
    setComidaOpen(next)
    saveConfiguratorOpen(event.id, 'comida', next)
  }
  function togglePersonasEspecialesBlock() {
    const next = !personasEspecialesOpen
    setPersonasEspecialesOpen(next)
    saveConfiguratorOpen(event.id, 'personas_especiales', next)
  }
  function toggleFamiliaresBlock() {
    const next = !familiaresOpen
    setFamiliaresOpen(next)
    saveConfiguratorOpen(event.id, 'familiares', next)
  }
  function toggleMusicaFiestaBlock() {
    const next = !musicaFiestaOpen
    setMusicaFiestaOpen(next)
    saveConfiguratorOpen(event.id, 'musica_fiesta', next)
  }
  function toggleFotosRecuerdosBlock() {
    const next = !fotosRecuerdosOpen
    setFotosRecuerdosOpen(next)
    saveConfiguratorOpen(event.id, 'fotos_recuerdos', next)
  }
  function toggleOtrosDecoracionBlock() {
    const next = !otrosDecoracionOpen
    setOtrosDecoracionOpen(next)
    saveConfiguratorOpen(event.id, 'otros_decoracion', next)
  }

  // Fase 1.1 (plan de pendientes) — resumen general: suma de TODOS los bloques, visible aunque el
  // configurador esté plegado. Carga su PROPIA copia de decisiones/momentos (nunca comparte estado con
  // cada bloque, que sigue gestionando el suyo exactamente igual que antes — cero riesgo de romper nada ya
  // validado) y se refresca cada vez que CUALQUIER bloque guarda algo (bumpRefresh, ver más abajo).
  const [summaryQuestions, setSummaryQuestions] = useState<ConfiguratorQuestionRef[] | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const showPersonasEspeciales = event.type === 'boda' || event.type === 'bautizo' || event.type === 'comunion'
  const showFamiliares = event.type === 'bautizo' || event.type === 'comunion'
  useEffect(() => {
    let cancelled = false
    Promise.all([
      listEventDecisions(event.id),
      structuredByMoments ? listEventMoments(event.id) : Promise.resolve([] as EventMoment[]),
      showPersonasEspeciales ? listEventRolePeople(event.id, 'especial') : Promise.resolve([] as EventRolePerson[]),
      showFamiliares ? listEventRolePeople(event.id, 'familiar') : Promise.resolve([] as EventRolePerson[]),
    ])
      .then(([decisions, momentsRaw, especialPeople, familiarPeople]) => {
        if (cancelled) return
        const realMoments = momentsRaw.filter((m) => !m.isLegacy)
        const hasMomentLocation = momentsRaw.some((m) => Boolean(m.locationLabel?.trim()))
        const momentsCount = hasRealMoments(resolveEventMoments(event, realMoments)) ? realMoments.length : 0
        const foodCtx = buildFoodContext(event, decisions, [], null, hasMomentLocation)
        const refs: ConfiguratorQuestionRef[] = [
          ...listCelebrationQuestions({ event, decisions, hasMomentLocation, structuredByMoments }).map((q) => ({
            sectionKey: 'celebracion',
            sectionLabel: celebrationBlockTitle(event.type, structuredByMoments),
            key: q.key,
            label: q.label,
            status: q.status,
          })),
          ...(event.type === 'boda'
            ? mergeTipoResolucionPairs(listPairBlockQuestions(event, decisions)).map((q) => ({ sectionKey: 'pareja', sectionLabel: 'La pareja', key: q.questionKey, label: q.label, status: q.status }))
            : []),
          ...listGuestsBlockQuestions(decisions, momentsCount).map((q) => ({ sectionKey: 'invitados', sectionLabel: 'Invitados e invitaciones', key: q.questionKey, label: q.label, status: q.status })),
          ...listMomentosEspecialesBlockQuestions(decisions).map((q) => ({ sectionKey: 'momentos_especiales', sectionLabel: 'Momentos especiales', key: q.questionKey, label: q.label, status: q.status })),
          ...listFoodBlockQuestions(foodCtx).map((q) => ({ sectionKey: 'comida', sectionLabel: 'Comida y bebida', key: q.questionKey, label: q.label, status: q.status })),
          ...(showPersonasEspeciales
            ? listEspecialBlockQuestions(decisions, especialPeople.length).map((q) => ({ sectionKey: 'personas_especiales', sectionLabel: 'Personas especiales', key: q.questionKey, label: q.label, status: q.status }))
            : []),
          ...(showFamiliares
            ? listFamiliaresBlockQuestions(decisions, familiarPeople.length).map((q) => ({ sectionKey: 'familiares', sectionLabel: 'Familiares', key: q.questionKey, label: q.label, status: q.status }))
            : []),
          ...(event.type === 'boda'
            ? listMusicaFiestaBlockQuestions(decisions, venueIncludesService(foodCtx.venueCase, decisions, 'musica', foodCtx.legacyIncluded)).map((q) => ({
                sectionKey: 'musica_fiesta',
                sectionLabel: 'Música y fiesta',
                key: q.questionKey,
                label: q.label,
                status: q.status,
              }))
            : []),
          ...(event.type === 'boda'
            ? listFotosRecuerdosBlockQuestions(decisions).map((q) => ({ sectionKey: 'fotos_recuerdos', sectionLabel: 'Fotos y recuerdos', key: q.questionKey, label: q.label, status: q.status }))
            : []),
          ...(event.type === 'boda'
            ? listOtrosDecoracionBlockQuestions(decisions, venueIncludesService(foodCtx.venueCase, decisions, 'decoracion', foodCtx.legacyIncluded)).map((q) => ({
                sectionKey: 'otros_decoracion',
                sectionLabel: 'Otros y decoración',
                key: q.questionKey,
                label: q.label,
                status: q.status,
              }))
            : []),
        ]
        setSummaryQuestions(refs)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id, structuredByMoments, refreshTick])
  const configuratorSummary = summaryQuestions ? computeConfiguratorSummary(summaryQuestions) : null

  function bumpRefresh() {
    setRefreshTick((t) => t + 1)
  }
  const handleChanged = () => {
    bumpRefresh()
    onChanged()
  }
  const handleDerivedDataChanged = () => {
    bumpRefresh()
    onDerivedDataChanged()
  }

  const SECTION_OPEN: Record<string, { open: boolean; setOpen: (v: boolean) => void; storageKey: string }> = {
    celebracion: { open: celebracionOpen, setOpen: setCelebracionOpen, storageKey: 'celebracion' },
    pareja: { open: pairOpen, setOpen: setPairOpen, storageKey: 'pareja' },
    invitados: { open: guestsBlockOpen, setOpen: setGuestsBlockOpen, storageKey: 'invitados' },
    momentos_especiales: { open: momentosEspecialesOpen, setOpen: setMomentosEspecialesOpen, storageKey: 'momentos_especiales' },
    comida: { open: comidaOpen, setOpen: setComidaOpen, storageKey: 'comida' },
    personas_especiales: { open: personasEspecialesOpen, setOpen: setPersonasEspecialesOpen, storageKey: 'personas_especiales' },
    familiares: { open: familiaresOpen, setOpen: setFamiliaresOpen, storageKey: 'familiares' },
    musica_fiesta: { open: musicaFiestaOpen, setOpen: setMusicaFiestaOpen, storageKey: 'musica_fiesta' },
    fotos_recuerdos: { open: fotosRecuerdosOpen, setOpen: setFotosRecuerdosOpen, storageKey: 'fotos_recuerdos' },
    otros_decoracion: { open: otrosDecoracionOpen, setOpen: setOtrosDecoracionOpen, storageKey: 'otros_decoracion' },
  }
  const [focusToken, setFocusToken] = useState(0)
  const [pendingFocus, setPendingFocus] = useState<{ sectionKey: string; questionKey: string; token: number } | null>(null)

  // Abre el acordeón global y el de esa sección si estaban plegados — sin aislar ninguna pregunta
  // concreta (usado por "Secciones sin empezar: N · Ver →", donde no hay ninguna pregunta ya empezada que
  // aislar: se abre la sección entera, tal cual).
  function openSection(sectionKey: string) {
    if (!open) toggleOpen()
    const section = SECTION_OPEN[sectionKey]
    if (section && !section.open) {
      section.setOpen(true)
      saveConfiguratorOpen(event.id, section.storageKey, true)
    }
  }
  // "Cada flecha lleva directamente a la primera pregunta pendiente de esa sección": igual que
  // openSection, pero además pide a ese bloque (vía focusRequest) que aísle esa pregunta concreta.
  function navigateToQuestion(sectionKey: string, questionKey: string) {
    openSection(sectionKey)
    const token = focusToken + 1
    setFocusToken(token)
    setPendingFocus({ sectionKey, questionKey, token })
  }
  function focusRequestFor(sectionKey: string): ConfiguratorFocusRequest | null {
    if (!pendingFocus || pendingFocus.sectionKey !== sectionKey) return null
    return { questionKey: pendingFocus.questionKey, token: pendingFocus.token }
  }

  return (
    <div className="card event-card" style={{ marginTop: 8 }}>
      <button
        type="button"
        className="link-button"
        onClick={toggleOpen}
        style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', textAlign: 'left' }}
        aria-expanded={open}
      >
        <strong>✨ {eventPlanningConfiguratorTitle(event.type)}</strong>
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {configuratorSummary && <ConfiguratorSummaryPanel summary={configuratorSummary} onNavigate={navigateToQuestion} onOpenSection={openSection} />}
      {open && (
        <div style={{ marginTop: 8 }}>
          <div>
            <button
              type="button"
              className="link-button"
              onClick={toggleCelebracion}
              style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', fontWeight: 600, textAlign: 'left' }}
              aria-expanded={celebracionOpen}
            >
              {celebrationBlockTitle(event.type, structuredByMoments)}
              <span aria-hidden="true">{celebracionOpen ? '▾' : '▸'}</span>
            </button>
            {celebracionOpen && (
              <div style={{ marginTop: 4 }}>
                <CelebracionBlock event={event} structured={structuredByMoments} onChanged={handleChanged} onDerivedDataChanged={handleDerivedDataChanged} focusRequest={focusRequestFor('celebracion')} />
              </div>
            )}
          </div>
          {event.type === 'boda' && (
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                className="link-button"
                onClick={togglePairBlock}
                style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', fontWeight: 600, textAlign: 'left' }}
                aria-expanded={pairOpen}
              >
                👰🤵 La pareja
                <span aria-hidden="true">{pairOpen ? '▾' : '▸'}</span>
              </button>
              {pairOpen && (
                <div style={{ marginTop: 4 }}>
                  <PairBlock event={event} onChanged={handleChanged} onDerivedDataChanged={handleDerivedDataChanged} focusRequest={focusRequestFor('pareja')} />
                </div>
              )}
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              className="link-button"
              onClick={toggleGuestsBlock}
              style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', fontWeight: 600, textAlign: 'left' }}
              aria-expanded={guestsBlockOpen}
            >
              👥 Invitados e invitaciones
              <span aria-hidden="true">{guestsBlockOpen ? '▾' : '▸'}</span>
            </button>
            {guestsBlockOpen && (
              <div style={{ marginTop: 4 }}>
                <GuestsDecisionsBlock event={event} onChanged={handleChanged} onDerivedDataChanged={handleDerivedDataChanged} focusRequest={focusRequestFor('invitados')} />
              </div>
            )}
          </div>
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              className="link-button"
              onClick={toggleMomentosEspecialesBlock}
              style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', fontWeight: 600, textAlign: 'left' }}
              aria-expanded={momentosEspecialesOpen}
            >
              🎉 Momentos especiales
              <span aria-hidden="true">{momentosEspecialesOpen ? '▾' : '▸'}</span>
            </button>
            {momentosEspecialesOpen && (
              <div style={{ marginTop: 4 }}>
                <MomentosEspecialesBlock event={event} onDerivedDataChanged={handleDerivedDataChanged} focusRequest={focusRequestFor('momentos_especiales')} />
              </div>
            )}
          </div>
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              className="link-button"
              onClick={toggleComidaBlock}
              style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', fontWeight: 600, textAlign: 'left' }}
              aria-expanded={comidaOpen}
            >
              🍽️ Comida y bebida
              <span aria-hidden="true">{comidaOpen ? '▾' : '▸'}</span>
            </button>
            {comidaOpen && (
              <div style={{ marginTop: 4 }}>
                <ComidaBebidaBlock event={event} onDerivedDataChanged={handleDerivedDataChanged} onOpenMenu={onOpenMenu} focusRequest={focusRequestFor('comida')} />
              </div>
            )}
          </div>
          {showPersonasEspeciales && (
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                className="link-button"
                onClick={togglePersonasEspecialesBlock}
                style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', fontWeight: 600, textAlign: 'left' }}
                aria-expanded={personasEspecialesOpen}
              >
                🎭 Personas especiales
                <span aria-hidden="true">{personasEspecialesOpen ? '▾' : '▸'}</span>
              </button>
              {personasEspecialesOpen && (
                <div style={{ marginTop: 4 }}>
                  <PersonasEspecialesBlock event={event} onDerivedDataChanged={handleDerivedDataChanged} focusRequest={focusRequestFor('personas_especiales')} />
                </div>
              )}
            </div>
          )}
          {showFamiliares && (
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                className="link-button"
                onClick={toggleFamiliaresBlock}
                style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', fontWeight: 600, textAlign: 'left' }}
                aria-expanded={familiaresOpen}
              >
                👪 Familiares
                <span aria-hidden="true">{familiaresOpen ? '▾' : '▸'}</span>
              </button>
              {familiaresOpen && (
                <div style={{ marginTop: 4 }}>
                  <FamiliaresBlock event={event} onDerivedDataChanged={handleDerivedDataChanged} focusRequest={focusRequestFor('familiares')} />
                </div>
              )}
            </div>
          )}
          {event.type === 'boda' && (
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                className="link-button"
                onClick={toggleMusicaFiestaBlock}
                style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', fontWeight: 600, textAlign: 'left' }}
                aria-expanded={musicaFiestaOpen}
              >
                🎵 Música y fiesta
                <span aria-hidden="true">{musicaFiestaOpen ? '▾' : '▸'}</span>
              </button>
              {musicaFiestaOpen && (
                <div style={{ marginTop: 4 }}>
                  <MusicaFiestaBlock event={event} onDerivedDataChanged={handleDerivedDataChanged} focusRequest={focusRequestFor('musica_fiesta')} />
                </div>
              )}
            </div>
          )}
          {event.type === 'boda' && (
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                className="link-button"
                onClick={toggleFotosRecuerdosBlock}
                style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', fontWeight: 600, textAlign: 'left' }}
                aria-expanded={fotosRecuerdosOpen}
              >
                📷 Fotos y recuerdos
                <span aria-hidden="true">{fotosRecuerdosOpen ? '▾' : '▸'}</span>
              </button>
              {fotosRecuerdosOpen && (
                <div style={{ marginTop: 4 }}>
                  <FotosRecuerdosBlock event={event} onDerivedDataChanged={handleDerivedDataChanged} focusRequest={focusRequestFor('fotos_recuerdos')} />
                </div>
              )}
            </div>
          )}
          {event.type === 'boda' && (
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                className="link-button"
                onClick={toggleOtrosDecoracionBlock}
                style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', fontWeight: 600, textAlign: 'left' }}
                aria-expanded={otrosDecoracionOpen}
              >
                🌿 Otros y decoración
                <span aria-hidden="true">{otrosDecoracionOpen ? '▾' : '▸'}</span>
              </button>
              {otrosDecoracionOpen && (
                <div style={{ marginTop: 4 }}>
                  <OtrosDecoracionBlock event={event} onDerivedDataChanged={handleDerivedDataChanged} focusRequest={focusRequestFor('otros_decoracion')} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Fase 1.1 (plan de pendientes) — "✓ 38 decisiones tomadas · 7 pendientes", una línea por sección con
// pendientes ("La pareja · 2 pendientes →") y "Secciones sin empezar: N · Ver →" agrupadas. Visible aunque
// el resto del configurador esté plegado (vive FUERA del `{open && (...)}` del padre).
function ConfiguratorSummaryPanel({
  summary,
  onNavigate,
  onOpenSection,
}: {
  summary: ConfiguratorSummary
  onNavigate: (sectionKey: string, questionKey: string) => void
  onOpenSection: (sectionKey: string) => void
}) {
  const total = summary.decidedCount + summary.pendingCount
  if (total === 0 && summary.notStartedSections.length === 0) return null
  return (
    <div style={{ marginTop: 6, fontSize: 13 }}>
      {total > 0 && (
        <p className="muted" style={{ margin: '0 0 4px' }}>
          ✓ {summary.decidedCount} decisión{summary.decidedCount === 1 ? '' : 'es'} tomada{summary.decidedCount === 1 ? '' : 's'}
          {summary.pendingCount > 0 ? ` · ${summary.pendingCount} pendiente${summary.pendingCount === 1 ? '' : 's'}` : ''}
        </p>
      )}
      {summary.sectionsWithPending.map((s) => (
        <button
          key={s.sectionKey}
          type="button"
          className="link-button"
          style={{ display: 'block', textAlign: 'left', padding: 0, margin: '2px 0' }}
          onClick={() => onNavigate(s.sectionKey, s.firstPendingKey)}
        >
          {s.sectionLabel} · {s.pendingCount} pendiente{s.pendingCount === 1 ? '' : 's'} →
        </button>
      ))}
      {summary.notStartedSections.length > 0 && (
        <button
          type="button"
          className="link-button"
          style={{ display: 'block', textAlign: 'left', padding: 0, margin: '2px 0' }}
          onClick={() => onOpenSection(summary.notStartedSections[0].sectionKey)}
        >
          Secciones sin empezar: {summary.notStartedSections.length} · Ver →
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Primer bloque del configurador: «Ceremonia y celebración» (eventos con ceremonia, organizados por momentos)
// o «Celebración» (el resto). Desde la alta mínima ("Nuevo evento" solo pide nombre, tipo y módulos) aquí viven
// la edad (cumpleaños), la fecha con su estado (◷ Provisional / ✓ Confirmada), el lugar y qué servicios
// incluye ese lugar. Los demás bloques (Comida y bebida, y los que vengan) CONSUMEN esta información; nunca la
// vuelven a preguntar. Ver src/domain/eventCelebration.ts para la regla de la fecha operativa.
// ---------------------------------------------------------------------

const LUGAR_CONTEXTO_OPTIONS: { value: LugarContextoChoice; label: string }[] = [
  { value: 'en_casa', label: 'En casa' },
  { value: 'restaurante_local', label: 'Restaurante / local' },
  { value: 'exterior', label: 'Exterior' },
  { value: 'otro', label: 'Otro lugar' },
  { value: 'todavia_no_lo_sabemos', label: 'Todavía no lo sabemos' },
]

// Edad que cumple (solo cumpleaños): vive dentro de «Celebración», nunca en un bloque aparte. Sigue siendo
// details.ageTurning (invitaciones, sugerencias de regalo y demás lo leen de ahí, sin cambios).
function EventAgeField({ event, onChanged }: { event: FamilyEvent; onChanged: () => void }) {
  const current = ageTurning(event)
  const [value, setValue] = useState(current !== null ? String(current) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const details = { ...event.details }
      const n = Number(value)
      if (value.trim() && Number.isFinite(n) && n >= 0) details.ageTurning = n
      else delete details.ageTurning
      await updateEvent(event.id, { details })
      onChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ marginTop: 6 }}>
      <div className="muted" style={{ fontSize: 13 }}>
        ¿Cuántos años cumple?
      </div>
      {error && <p className="error">{error}</p>}
      <div className="inline-fields">
        <input type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} aria-label="Años que cumple" style={{ maxWidth: 100 }} />
        <button type="button" className="link-button" disabled={saving || String(current ?? '') === value.trim()} onClick={save}>
          {saving ? 'Guardando…' : current !== null && String(current) === value.trim() ? '✓ Guardado' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

// Campos de fecha COMPARTIDOS (Celebración, Ceremonia y celebración y cada momento): primero la fecha, luego la
// hora (opcional) y, con la fecha puesta, si es provisional o confirmada. Cada campo lleva SIEMPRE su etiqueta
// visible (en iPhone un campo de fecha/hora vacío no explica nada por sí solo). El estado de una fecha nueva
// nunca llega preseleccionado. Reglas puras en src/domain/eventDateForm.ts.
function DateTimeStatusFields({
  draft,
  onChange,
  disabled,
  dateHint,
}: {
  draft: DateDraft
  onChange: (next: DateDraft) => void
  disabled?: boolean
  dateHint?: string
}) {
  return (
    <>
      <label>
        {DATE_FIELD_LABEL}
        {dateHint && <span className="muted"> {dateHint}</span>}
        <input type="date" value={draft.date} disabled={disabled} onChange={(e) => onChange({ ...draft, date: e.target.value })} />
      </label>
      <label>
        {TIME_FIELD_LABEL}
        <input type="time" value={draft.time} disabled={disabled} onChange={(e) => onChange({ ...draft, time: e.target.value })} />
      </label>
      <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
        {DATE_STATUS_QUESTION}
      </div>
      <ChoiceRow options={DATE_CHOICES} value={draft.status ?? undefined} disabled={Boolean(disabled)} onSelect={(status) => onChange({ ...draft, status })} />
    </>
  )
}

// Fecha del evento (Celebración simple, o el evento por momentos que aún no tiene ningún momento fechado).
// «Todavía no lo sabemos» es la ALTERNATIVA a poner una fecha (no tenemos fecha), no un tercer estado.
// Guardar fecha escribe fecha + hora + estado JUNTOS en una sola operación (events.event_date / event_time /
// date_status, la única fecha operativa: calendario, cuenta atrás y tareas siguen leyendo ahí). Editar una
// fecha ya guardada actualiza ESA fecha; una hora vacía borra la hora anterior (null, nunca 00:00).
function EventDateField({
  event,
  onChanged,
  todavia,
  onTodavia,
  onDateSaved,
  hint,
}: {
  event: FamilyEvent
  onChanged: () => void
  // true = el usuario respondió «Todavía no lo sabemos» y no hay fecha guardada.
  todavia: boolean
  onTodavia: () => Promise<void>
  // Tras guardar una fecha, la respuesta «Todavía no lo sabemos» anterior ya no es la activa.
  onDateSaved: () => Promise<void>
  hint?: string
}) {
  const [draft, setDraft] = useState<DateDraft>(() => dateDraftFromSaved(event))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDraft(dateDraftFromSaved({ eventDate: event.eventDate, eventTime: event.eventTime, dateStatus: event.dateStatus }))
  }, [event.dateStatus, event.eventDate, event.eventTime])

  async function run(action: () => Promise<void>) {
    setSaving(true)
    setError(null)
    try {
      await action()
      onChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSaving(false)
    }
  }

  // Sin fecha: «Todavía no lo sabemos» (no hay nada que quitar, solo se anota la respuesta).
  function chooseTodavia() {
    void run(async () => {
      await onTodavia()
    })
  }

  // Con fecha: «Quitar fecha» (pide confirmación; no borra el evento). Fecha + hora + estado salen juntos en una
  // sola operación, el Calendario retira su compromiso (updateEvent → syncEventToCalendar) y las tareas relativas
  // a la fecha se recalculan sin fecha. Después el evento queda como «Todavía no lo sabemos».
  function removeDate() {
    if (!window.confirm(REMOVE_DATE_CONFIRM)) return
    void run(async () => {
      await updateEvent(event.id, { dateStatus: 'pendiente', eventDate: null, eventTime: null })
      await recalculateAutoTasks(event.id, event.type, null)
      await onTodavia()
    })
  }

  function saveDate() {
    const problem = validateDateDraft(draft)
    if (problem) {
      setError(problem)
      return
    }
    void run(async () => {
      await updateEvent(event.id, dateDraftToPatch(draft))
      if (draft.date !== event.eventDate) await recalculateAutoTasks(event.id, event.type, draft.date)
      await onDateSaved()
    })
  }

  const label = dateWithStatusLabel(event.eventDate, event.dateStatus)
  const timeLabel = event.eventDate && event.dateStatus !== 'pendiente' && event.eventTime ? ` · 🕐 ${event.eventTime.slice(0, 5)}` : ''
  const dirty = isDateDraftDirty({ eventDate: event.eventDate, eventTime: event.eventTime, dateStatus: event.dateStatus }, draft)

  return (
    <div style={{ marginTop: 6 }}>
      <div className="muted" style={{ fontSize: 13 }}>
        ¿Cuándo es?
      </div>
      {label && (
        <p style={{ margin: '2px 0', fontWeight: 600 }}>
          📅 {label}
          {timeLabel}
        </p>
      )}
      {hint && (
        <p className="muted" style={{ fontSize: 12, margin: '2px 0' }}>
          {hint}
        </p>
      )}
      {error && <p className="error">{error}</p>}
      <div className="filter-row" style={{ flexWrap: 'wrap' }}>
        {event.eventDate ? (
          <button type="button" className="chip" disabled={saving} onClick={removeDate}>
            {REMOVE_DATE_LABEL}
          </button>
        ) : (
          <button type="button" className={'chip' + (todavia ? ' chip-active' : '')} disabled={saving} onClick={chooseTodavia}>
            Todavía no lo sabemos
          </button>
        )}
      </div>
      <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
        {event.eventDate ? 'Para cambiarla, modifica los datos y guarda:' : todavia ? 'Cuando sepáis el día, ponedlo aquí:' : 'o pon el día:'}
      </p>
      <DateTimeStatusFields draft={draft} onChange={(next) => setDraft(next)} disabled={saving} />
      <button type="button" className="link-button" disabled={saving || (!dirty && Boolean(event.eventDate))} onClick={saveDate} style={{ marginTop: 4 }}>
        {saving ? 'Guardando…' : 'Guardar fecha'}
      </button>
    </div>
  )
}

// Lugar registrado (nombre + dirección) con «Cambiar ubicación»; si todavía no hay, el mismo editor de siempre
// (nombre + buscador de Google Maps). Reutiliza CasaLocationManualPicker: la única infraestructura de selección
// de ubicación del evento, ya validada (venue_label / address / place_id / coordenadas).
function VenuePlaceBlock({ event, onChanged }: { event: FamilyEvent; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const hasPlace = Boolean(event.venueLabel?.trim()) || (event.venueLatitude != null && event.venueLongitude != null)
  if (hasPlace && !editing) {
    return (
      <div className="card" style={{ padding: 8, marginTop: 6 }}>
        <strong style={{ fontSize: 13 }}>📍 Ubicación del evento</strong>
        <p className="muted" style={{ margin: '2px 0', fontSize: 13 }}>
          {event.venueLabel || 'Sin nombre'}
          {event.venueAddress && <br />}
          {event.venueAddress}
        </p>
        <button type="button" className="link-button" onClick={() => setEditing(true)}>
          Cambiar ubicación
        </button>
      </div>
    )
  }
  return (
    <div className="card" style={{ padding: 8, marginTop: 6 }}>
      <CasaLocationManualPicker
        event={event}
        noCasaConfigured={false}
        onSaved={() => {
          setEditing(false)
          onChanged()
        }}
      />
    </div>
  )
}

function CelebracionBlock({
  event,
  structured,
  onChanged,
  onDerivedDataChanged,
  focusRequest,
}: {
  event: FamilyEvent
  structured: boolean
  onChanged: () => void
  onDerivedDataChanged: () => void
  focusRequest?: ConfiguratorFocusRequest | null
}) {
  const { localFocus, setLocalFocus, ref: focusRef } = useConfiguratorQuestionFocus(focusRequest)
  const [decisions, setDecisions] = useState<EventDecision[]>([])
  const [moments, setMoments] = useState<EventMoment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  function reload(): Promise<void> {
    return Promise.all([listEventDecisions(event.id), structured ? listEventMoments(event.id) : Promise.resolve([] as EventMoment[])])
      .then(([d, m]) => {
        setDecisions(d)
        setMoments(m)
      })
      .catch((err) => setError(errorMessage(err, 'No se pudo cargar')))
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id, structured])
  // MomentsEditor puede crear/editar/borrar momentos mientras este bloque está montado.
  useEventMomentsChangeSignal(event.id, reload)

  const hasMomentLocation = moments.some((m) => Boolean(m.locationLabel?.trim()))
  const hasDatedMoment = moments.some((m) => m.momentDate)

  // Lo que dependía de «qué incluye el lugar» / «es en casa» en Comida y bebida se reconcilia con las reglas
  // de siempre (se retira solo lo no tocado). Sin decisiones de comida todavía, no escribe nada.
  async function afterVenueDecision() {
    await reload()
    const actions = await reconcileFoodForVenueChange(event, hasMomentLocation)
    // Comida y bebida (si está abierto) vuelve a leer lo que ha cambiado aquí.
    notifyEventMomentsChanged(event.id)
    if (actions.length > 0) {
      onDerivedDataChanged()
      const message = describeEffects(actions)
      if (message) showToast(message)
    }
  }

  async function saveDecision(blockKey: string, questionKey: string, answer: Record<string, unknown>, isCustomOption = false, reconcileFood = false) {
    setSavingKey(questionKey)
    setError(null)
    try {
      await upsertEventDecision(event.id, { blockKey, questionKey, answer, isCustomOption })
      if (reconcileFood) await afterVenueDecision()
      else await reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSavingKey(null)
    }
  }

  if (loading) return null

  const facts = { event, decisions, hasMomentLocation, structuredByMoments: structured }
  const summary = summarizeCelebrationBlock(facts)
  const decisionSummary = buildCelebrationDecisionSummary(facts)
  const contextoDecision = decisions.find((d) => d.questionKey === LUGAR_CONTEXTO_QUESTION_KEY)
  const contexto = contextoDecision?.answer as unknown as LugarContextoAnswer | undefined
  const venueCase = resolveVenueCase(event, decisions, hasMomentLocation)
  const servicesLabel = venueServicesQuestionLabel(venueCase)
  const servicesAnswer = effectiveVenueServicesAnswer(decisions, event.includedServices)
  const showPlace =
    !structured && contexto?.choice !== 'en_casa' && (contexto?.choice === 'restaurante_local' || contexto?.choice === 'exterior' || contexto?.choice === 'otro' || Boolean(event.venueLabel?.trim()))

  return (
    <div ref={focusRef} className="card" style={{ padding: 8 }}>
      {summary && (
        <p className="muted" style={{ fontSize: 13, margin: '0 0 6px' }}>
          {summary}
        </p>
      )}
      <DecisionSummaryDetails summary={decisionSummary} onSelect={setLocalFocus} />
      {error && <p className="error">{error}</p>}

      {!structured && event.type === 'cumpleanos' && questionIsVisible(localFocus, 'edad') && <EventAgeField event={event} onChanged={onChanged} />}

      {structured && (
        <>
          <p className="muted" style={{ fontSize: 13, margin: '0 0 4px' }}>
            Ceremonia, celebración o cualquier otro momento con su propia fecha, hora y lugar — al invitar a cada familia, eliges a cuáles va.
          </p>
          <MomentsEditor event={event} onChanged={onChanged} />
        </>
      )}

      {questionIsVisible(localFocus, 'fecha') &&
        (!structured || !hasDatedMoment ? (
          <EventDateField
            event={event}
            onChanged={onChanged}
            todavia={!event.eventDate && decisions.some((d) => d.questionKey === CELEBRATION_DATE_QUESTION_KEY)}
            onTodavia={() => upsertEventDecision(event.id, { blockKey: CELEBRATION_BLOCK_KEY, questionKey: CELEBRATION_DATE_QUESTION_KEY, answer: { choice: 'todavia_no_lo_sabemos' } }).then(() => reload())}
            onDateSaved={async () => {
              // Con una fecha guardada, «Todavía no lo sabemos» deja de ser la respuesta activa.
              const previous = decisions.find((d) => d.questionKey === CELEBRATION_DATE_QUESTION_KEY)
              if (previous) await deleteEventDecision(previous.id)
              await reload()
            }}
            hint={structured ? 'Cuando pongas fecha a un momento, la del evento pasará a calcularse de ellos.' : undefined}
          />
        ) : (
          <p style={{ margin: '8px 0 0', fontSize: 13 }}>
            📅 Fecha del evento: <strong>{dateWithStatusLabel(event.eventDate, event.dateStatus) ?? 'por decidir'}</strong>
            <span className="muted"> — la del primer momento con fecha.</span>
          </p>
        ))}

      {questionIsVisible(localFocus, 'lugar') && (
        <>
          <CustomAwareQuestion
            event={event}
            questionLabel={structured ? '¿Dónde será la celebración?' : '¿Dónde lo vais a celebrar?'}
            options={LUGAR_CONTEXTO_OPTIONS}
            questionKey={LUGAR_CONTEXTO_QUESTION_KEY}
            decision={contextoDecision}
            savingKey={savingKey}
            onSave={(answer) => saveDecision('lugar_contexto', LUGAR_CONTEXTO_QUESTION_KEY, answer as unknown as Record<string, unknown>, answer.choice === 'otro', true)}
          />
          {!contexto && event.venueType && (
            <p style={{ fontSize: 13, margin: '2px 0' }}>
              ✓ Información que ya teníamos del evento:{' '}
              {event.venueType === 'restaurante_local' ? 'restaurante / local con servicios' : event.venueType === 'casa_propia' ? 'casa o espacio propio' : 'otro lugar'}
            </p>
          )}
          {/* «En casa» → proponer la Casa familiar (validado por separado): la DECISIÓN de contexto y la UBICACIÓN
              física (events.venue_*) son dos cosas distintas; el evento guarda su propia copia, sin vínculo vivo. */}
          {!structured && contexto?.choice === 'en_casa' && <CasaLocationBlock event={event} onChanged={onChanged} />}
          {showPlace && <VenuePlaceBlock event={event} onChanged={onChanged} />}
        </>
      )}

      {servicesLabel && questionIsVisible(localFocus, 'servicios') && (
        <VenueServicesQuestion
          label={servicesLabel}
          existing={servicesAnswer}
          fromLegacy={venueServicesFromLegacy(decisions, event.includedServices)}
          legacyOnly={legacyOnlyServiceLabels(event.includedServices)}
          saving={savingKey === VENUE_SERVICES_QUESTION_KEY}
          onSave={(a) => saveDecision(VENUE_SERVICES_BLOCK_KEY, VENUE_SERVICES_QUESTION_KEY, a as unknown as Record<string, unknown>, false, true)}
        />
      )}
      {localFocus && (
        <button type="button" className="link-button" onClick={() => setLocalFocus(null)} style={{ marginTop: 6 }}>
          Ver todas las preguntas
        </button>
      )}
    </div>
  )
}

// Corrección real (siguiente mejora tras validar la persistencia de ubicación) — al elegir "En casa" en
// "Dónde lo vais a celebrar", PEPA comprueba si la familia ya tiene una "Casa" guardada en 📍 Ubicación
// (location_places) y la PROPONE, nunca la asigna en silencio. Casa se identifica por name === 'Casa'
// (auditado: location_places no tiene ningún tipo/slug/categoría dedicado — category es texto libre sin
// lista cerrada, igual que name — así que no hay nada mejor que comparar) y solo entre los lugares de
// esta familia (listPlaces() ya aplica la RLS de siempre, igual que el resto de esta pantalla).
//
// Al confirmar, se COPIA una instantánea (venueLabel/venueLatitude/venueLongitude/venueAddress/
// venuePlaceId) a events.venue_* — nunca una referencia viva a location_places.id. Si la familia cambia
// su Casa real seis meses después, los eventos que ya la copiaron no se mueven solos. venuePlaceId queda
// siempre null (Casa nunca tiene uno); venueAddress se intenta rellenar con reverseGeocode() de las
// coordenadas de Casa (misma función ya usada por LocationPickerModal, nunca un segundo flujo) — si falla
// (cupo diario, red) se deja en null sin más, exactamente el mismo fallback por coordenadas ya validado.
function CasaLocationBlock({ event, onChanged }: { event: FamilyEvent; onChanged: () => void }) {
  const [casa, setCasa] = useState<LocationPlace | null | undefined>(undefined) // undefined = cargando
  // Dirección legible de Casa, resuelta UNA sola vez para mostrarla ANTES de confirmar (en vez de
  // coordenadas en bruto) — null mientras se resuelve o si reverseGeocode falla/no da nada; en ambos
  // casos el fallback es el mismo texto humano, nunca un número de latitud/longitud.
  const [casaAddress, setCasaAddress] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [skipProposal, setSkipProposal] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listPlaces()
      .then((places) => setCasa(places.find((p) => p.name.trim().toLowerCase() === 'casa') ?? null))
      .catch(() => setCasa(null))
  }, [])

  // RETOQUE (petición real: "las coordenadas son poco útiles") — reutiliza reverseGeocode(), la MISMA
  // infraestructura que ya usa el resto del flujo de ubicación, nunca una llamada nueva. Depende solo de
  // `casa` (estado, no se recalcula en cada render) — se dispara una única vez, al resolverse Casa; un
  // reintento posterior del usuario (Sí/No/Cambiar ubicación) reutiliza este mismo resultado, nunca pide
  // otra vez a Google. `cancelled` evita escribir estado si el componente se desmonta antes de responder.
  useEffect(() => {
    if (!casa) return
    let cancelled = false
    reverseGeocode(casa.latitude, casa.longitude)
      .then((address) => {
        if (!cancelled) setCasaAddress(address)
      })
      .catch(() => {
        if (!cancelled) setCasaAddress(null)
      })
    return () => {
      cancelled = true
    }
  }, [casa])

  const hasVenue = event.venueLatitude != null && event.venueLongitude != null
  const showSummary = hasVenue && !editing

  async function handleConfirmCasa() {
    if (!casa) return
    setConfirming(true)
    setError(null)
    try {
      // Reutiliza la dirección ya resuelta por el efecto de arriba — null si todavía no ha llegado o si
      // falló, exactamente el mismo fallback por coordenadas ya validado; nunca una segunda llamada.
      await updateEvent(event.id, {
        venueLabel: event.venueLabel?.trim() ? event.venueLabel : casa.name,
        venueLatitude: casa.latitude,
        venueLongitude: casa.longitude,
        venueAddress: casaAddress,
        venuePlaceId: null,
      })
      setEditing(false)
      setSkipProposal(false)
      onChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setConfirming(false)
    }
  }

  if (casa === undefined) return null

  if (showSummary) {
    return (
      <div className="card" style={{ padding: 8, marginTop: 6 }}>
        <strong style={{ fontSize: 13 }}>📍 Ubicación del evento</strong>
        <p className="muted" style={{ margin: '2px 0', fontSize: 13 }}>
          {event.venueLabel || 'Sin nombre'}
          {event.venueAddress && <br />}
          {event.venueAddress}
        </p>
        <button type="button" className="link-button" onClick={() => setEditing(true)}>
          Cambiar ubicación
        </button>
      </div>
    )
  }

  const showProposal = casa && !skipProposal

  return (
    <div className="card" style={{ padding: 8, marginTop: 6 }}>
      {error && <p className="error">{error}</p>}
      {showProposal ? (
        <>
          <p style={{ margin: '0 0 4px', fontSize: 13 }}>Tenéis una ubicación «{casa.name}» guardada en PEPA.</p>
          <p className="muted" style={{ margin: '0 0 6px', fontSize: 12 }}>
            {casaAddress ?? (casa.category ? `${casa.category} · Ubicación Casa guardada` : 'Ubicación Casa guardada')}
          </p>
          <p style={{ margin: '0 0 6px', fontSize: 13 }}>¿Es aquí donde lo vais a celebrar?</p>
          <div className="filter-row">
            <button type="button" onClick={handleConfirmCasa} disabled={confirming}>
              {confirming ? 'Guardando…' : 'Sí, usar esta ubicación'}
            </button>
            <button type="button" className="link-button" disabled={confirming} onClick={() => setSkipProposal(true)}>
              No, elegir otra
            </button>
          </div>
        </>
      ) : (
        <CasaLocationManualPicker
          event={event}
          onSaved={() => {
            setEditing(false)
            setSkipProposal(false)
            onChanged()
          }}
          noCasaConfigured={!casa}
        />
      )}
    </div>
  )
}

// Formulario mínimo de "elegir otra ubicación" dentro del flujo de Casa — reutiliza EventLocationCoordsPicker
// tal cual (la única infraestructura de selección de ubicación principal del evento, ya corregida),
// nunca un segundo buscador. Mismo par Lugar+picker que ya usa "Gestionar evento", autocontenido aquí
// para no obligar a salir de este bloque.
function CasaLocationManualPicker({ event, onSaved, noCasaConfigured }: { event: FamilyEvent; onSaved: () => void; noCasaConfigured: boolean }) {
  const [venueLabel, setVenueLabel] = useState(event.venueLabel ?? '')
  const [venueCoords, setVenueCoords] = useState(
    event.venueLatitude != null && event.venueLongitude != null ? { latitude: event.venueLatitude, longitude: event.venueLongitude } : null,
  )
  const [venueAddress, setVenueAddress] = useState(event.venueAddress ?? null)
  const [venuePlaceId, setVenuePlaceId] = useState(event.venuePlaceId ?? null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await updateEvent(event.id, {
        venueLabel: venueLabel || null,
        venueLatitude: venueCoords?.latitude ?? null,
        venueLongitude: venueCoords?.longitude ?? null,
        venueAddress,
        venuePlaceId,
      })
      onSaved()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {noCasaConfigured && (
        <p className="muted" style={{ margin: '0 0 6px', fontSize: 13 }}>
          No tenéis una ubicación «Casa» guardada en PEPA.
        </p>
      )}
      <label>
        Lugar (como se ve en la invitación)
        <input type="text" value={venueLabel} onChange={(e) => setVenueLabel(e.target.value)} placeholder="Ej. en mi casa, Restaurante La Terraza…" />
      </label>
      <EventLocationCoordsPicker
        coords={venueCoords}
        onCoordsChange={setVenueCoords}
        initialAddress={venueAddress}
        initialPlaceId={venuePlaceId}
        onPlaceDetails={(details) => {
          setVenueAddress(details.address)
          setVenuePlaceId(details.placeId)
        }}
      />
      {error && <p className="error">{error}</p>}
      <button type="button" onClick={handleSave} disabled={saving} style={{ marginTop: 6 }}>
        {saving ? 'Guardando…' : 'Guardar ubicación'}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------
// "👰🤵 La pareja" — primer uso real de event_decisions (ver src/domain/eventPairDecisions.ts para el
// motor puro: qué genera cada respuesta y cómo se reconcilia). Revelado progresivo: nunca se muestran las
// preguntas de "cómo lo resolvéis"/proveedor hasta que una respuesta anterior las hace relevantes.
// ---------------------------------------------------------------------

const VESTUARIO_TIPO_OPTIONS: { value: VestuarioTipoChoice; label: string }[] = [
  { value: 'vestido', label: 'Vestido' },
  { value: 'traje', label: 'Traje' },
  { value: 'otro', label: 'Otro tipo de vestuario' },
  { value: 'todavia_no_lo_sabemos', label: 'Todavía no lo sabemos' },
]

const VESTUARIO_RESOLUCION_OPTIONS: { value: VestuarioResolucionChoice; label: string }[] = [
  { value: 'ya_lo_tenemos', label: 'Ya lo tenemos' },
  { value: 'elegir_comprar', label: 'Tenemos que elegirlo/comprarlo/encargarlo' },
  { value: 'buscando_proveedor', label: 'Estamos buscando dónde/proveedor' },
  { value: 'otro', label: 'Otra situación' },
  { value: 'todavia_no_lo_sabemos', label: 'Todavía no lo sabemos' },
]

const PELUQUERIA_NECESIDAD_OPTIONS: { value: PeluqueriaNecesidadChoice; label: string }[] = [
  { value: 'peluqueria', label: 'Peluquería' },
  { value: 'maquillaje', label: 'Maquillaje' },
  { value: 'ambos', label: 'Ambos' },
  { value: 'no', label: 'No' },
  { value: 'todavia_no_lo_sabemos', label: 'Todavía no lo sabemos' },
  { value: 'otro', label: 'Otra opción' },
]

const PELUQUERIA_RESOLUCION_OPTIONS: { value: PeluqueriaResolucionChoice; label: string }[] = [
  { value: 'ya_lo_tenemos', label: 'Ya lo tenemos' },
  { value: 'buscando', label: 'Estamos buscando' },
  { value: 'todavia_no_lo_sabemos', label: 'Todavía no lo sabemos' },
]

const COMPLEMENTOS_CHOICE_OPTIONS: { value: ComplementosChoice; label: string }[] = [
  { value: 'preparar', label: 'Queremos preparar complementos' },
  { value: 'no_necesitamos', label: 'No necesitaremos' },
  { value: 'todavia_no_lo_sabemos', label: 'Todavía no lo sabemos' },
]

const FLORAL_CHOICE_OPTIONS: { value: FloralChoice; label: string }[] = [
  { value: 'preparamos', label: 'Lo preparamos nosotros' },
  { value: 'floristeria', label: 'Floristería/proveedor' },
  { value: 'ya_lo_tenemos', label: 'Ya lo tenemos' },
  { value: 'todavia_no_lo_sabemos', label: 'Todavía no lo sabemos' },
  { value: 'otro', label: 'Otro' },
]

const ALIANZAS_OPTIONS: { value: AlianzasChoice; label: string }[] = [
  { value: 'elegir', label: 'Tenemos que elegirlas' },
  { value: 'comprar_encargar', label: 'Tenemos que comprarlas/encargarlas' },
  { value: 'ya_las_tenemos', label: 'Ya las tenemos' },
  { value: 'no_tendremos', label: 'No tendremos' },
  { value: 'todavia_no_lo_sabemos', label: 'Todavía no lo sabemos' },
  { value: 'otro', label: 'Otra opción' },
]

const DETALLE_ESPECIAL_TIPO_OPTIONS: { value: DetalleEspecialTipoChoice; label: string }[] = [
  { value: 'regalo', label: 'Regalo' },
  { value: 'carta', label: 'Carta' },
  { value: 'sorpresa', label: 'Sorpresa' },
  { value: 'otro', label: 'Otro' },
  { value: 'no', label: 'No' },
  { value: 'todavia_no_lo_sabemos', label: 'Todavía no lo sabemos' },
]

const DETALLE_ESPECIAL_RESOLUCION_OPTIONS: { value: DetalleEspecialResolucionChoice; label: string }[] = [
  { value: 'ya_lo_tenemos', label: 'Ya lo tenemos' },
  { value: 'tenemos_que_prepararlo', label: 'Tenemos que prepararlo' },
  { value: 'buscando', label: 'Estamos buscando' },
  { value: 'otro', label: 'Otra situación' },
  { value: 'todavia_no_lo_sabemos', label: 'Todavía no lo sabemos' },
]

const CUSTOM_ACTION_OPTIONS: { value: CustomAction; label: string }[] = [
  { value: 'preparar', label: 'Prepararlo' },
  { value: 'buscar_contratar', label: 'Buscar o contratar' },
  { value: 'resuelto', label: 'Ya está resuelto' },
  { value: 'todavia_no_lo_sabemos', label: 'Todavía por decidir' },
  { value: 'otro', label: 'Otro' },
]

const CUSTOM_COST_OPTIONS: { value: CustomHasCost; label: string }[] = [
  { value: 'si', label: 'Sí' },
  { value: 'no', label: 'No' },
  { value: 'todavia_no_lo_sabemos', label: 'Todavía no lo sabemos' },
]

// Motor explícito para cualquier opción personalizada ("otro") de todo el bloque — nunca se interpreta el
// texto libre de `label` para decidir si genera tarea/coste: lo deciden exclusivamente `action`/`hasCost`.
function CustomResolutionFields({ value, disabled, onChange }: { value: CustomResolution; disabled: boolean; onChange: (next: CustomResolution) => void }) {
  const needsCost = value.action === 'buscar_contratar' || value.action === 'otro'
  return (
    <div className="card" style={{ padding: 8, marginTop: 4 }}>
      <label>
        ¿Qué es?
        <input type="text" value={value.label} disabled={disabled} onChange={(e) => onChange({ ...value, label: e.target.value })} />
      </label>
      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
        ¿Qué hay que hacer?
      </div>
      <ChoiceRow options={CUSTOM_ACTION_OPTIONS} value={value.action} disabled={disabled} onSelect={(v) => onChange({ ...value, action: v })} />
      {needsCost && (
        <>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            ¿Tendrá coste?
          </div>
          <ChoiceRow options={CUSTOM_COST_OPTIONS} value={value.hasCost ?? undefined} disabled={disabled} onSelect={(v) => onChange({ ...value, hasCost: v })} />
        </>
      )}
    </div>
  )
}

// Vinculación mínima con Proveedores (§3 de la corrección final): solo relacionar un proveedor YA
// existente con esta decisión — nunca crea uno nuevo ni compara precios/condiciones.
function ProviderLinker({ event, decision }: { event: FamilyEvent; decision: EventDecision }) {
  const [providers, setProviders] = useState<EventProvider[]>([])
  const [linked, setLinked] = useState<EventDecisionProvider[]>([])
  const [selected, setSelected] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    Promise.all([listEventProviders(event.id), listDecisionProviders(decision.id)])
      .then(([p, l]) => {
        setProviders(p)
        setLinked(l)
      })
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar los proveedores')))
  }
  useEffect(reload, [decision.id, event.id])

  async function handleLink() {
    if (!selected) return
    setSaving(true)
    setError(null)
    try {
      await linkDecisionProvider(event.id, decision.id, selected)
      setSelected('')
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo relacionar'))
    } finally {
      setSaving(false)
    }
  }

  const linkedIds = new Set(linked.map((l) => l.providerId))
  const available = providers.filter((p) => !linkedIds.has(p.id) && !p.archived)

  return (
    <div style={{ marginTop: 4 }}>
      {error && <p className="error">{error}</p>}
      {linked.map((l) => (
        <div key={l.id} className="inline-fields" style={{ alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 12 }}>
            📇 {providers.find((p) => p.id === l.providerId)?.name ?? 'Proveedor'}
          </span>
          <ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Quitar relación con proveedor" onConfirm={() => unlinkDecisionProvider(l.id).then(reload)} />
        </div>
      ))}
      {available.length > 0 ? (
        <div className="inline-fields" style={{ marginTop: 2 }}>
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Relacionar proveedor ya existente…</option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.type ? ` (${p.type})` : ''}
              </option>
            ))}
          </select>
          <button type="button" className="link-button" disabled={!selected || saving} onClick={handleLink}>
            Relacionar
          </button>
        </div>
      ) : (
        providers.length === 0 && (
          <p className="muted" style={{ fontSize: 12 }}>
            Todavía no hay proveedores en este evento — podrás relacionar uno real en cuanto lo deis de alta en 📇 Proveedores y ofertas.
          </p>
        )
      )}
    </div>
  )
}

// Reutilizado por Vestuario/Alianzas/Detalle especial: una pregunta de elección única cuya opción "otro"
// pasa siempre por el motor explícito de CustomResolutionFields, nunca por interpretar el texto libre.
function CustomAwareQuestion<C extends string>({
  event,
  questionLabel,
  options,
  questionKey,
  decision,
  savingKey,
  onSave,
}: {
  event: FamilyEvent
  questionLabel: string
  options: { value: C; label: string }[]
  questionKey: string
  decision: EventDecision | undefined
  savingKey: string | null
  onSave: (answer: { choice: C; custom?: CustomResolution }) => void
}) {
  const saving = savingKey === questionKey
  const existing = decision?.answer as unknown as { choice: C; custom?: CustomResolution } | undefined
  const [draft, setDraft] = useState<{ choice: C; custom?: CustomResolution } | null>(null)
  const current = draft ?? existing

  function selectChoice(choice: C) {
    if ((choice as string) === 'otro') {
      setDraft({ choice, custom: existing?.custom ?? { label: '', action: 'preparar', hasCost: null } })
      return
    }
    setDraft(null)
    onSave({ choice })
  }
  function updateCustom(next: CustomResolution) {
    if (!current) return
    setDraft({ choice: current.choice, custom: next })
  }
  function saveCustom() {
    if (!current?.custom?.label.trim()) return
    onSave({ choice: current.choice, custom: current.custom })
    setDraft(null)
  }

  return (
    <div style={{ marginTop: 6 }}>
      <div className="muted" style={{ fontSize: 13 }}>
        {questionLabel}
      </div>
      <ChoiceRow options={options} value={current?.choice} disabled={saving} onSelect={selectChoice} />
      {current?.choice === ('otro' as C) && current.custom && (
        <>
          <CustomResolutionFields value={current.custom} disabled={saving} onChange={updateCustom} />
          <button type="button" className="link-button" disabled={saving || !current.custom.label.trim()} onClick={saveCustom}>
            Guardar
          </button>
          {current.custom.action === 'buscar_contratar' && decision && <ProviderLinker event={event} decision={decision} />}
        </>
      )}
    </div>
  )
}

// Vestuario — mismo patrón de 2 niveles que Peluquería/maquillaje: el tipo (qué llevará) nunca genera
// nada por sí solo, solo responde a QUÉ; la resolución (cómo está resuelto), revelada solo cuando el tipo
// es concreto, es la única que puede generar Preparativo/Presupuesto.
function VestuarioQuestion({
  event,
  slot,
  decisions,
  savingKey,
  onSaveTipo,
  onSaveResolucion,
}: {
  event: FamilyEvent
  slot: PartnerSlot
  decisions: EventDecision[]
  savingKey: string | null
  onSaveTipo: (slot: PartnerSlot, answer: VestuarioTipoAnswer) => void
  onSaveResolucion: (slot: PartnerSlot, answer: VestuarioResolucionAnswer) => void
}) {
  const name = partnerName(event, slot)
  const tipoKey = pairQuestionKey(slot, 'vestuario')
  const tipoDecision = decisions.find((d) => d.questionKey === tipoKey)
  const tipo = tipoDecision?.answer as unknown as VestuarioTipoAnswer | undefined
  const saving = savingKey === tipoKey
  const [customLabelDraft, setCustomLabelDraft] = useState<string | null>(null)

  function selectTipo(choice: VestuarioTipoChoice) {
    if (choice === 'otro') {
      setCustomLabelDraft(tipo?.customLabel ?? '')
      return
    }
    setCustomLabelDraft(null)
    onSaveTipo(slot, { choice })
  }
  function saveCustomTipo() {
    if (!customLabelDraft?.trim()) return
    onSaveTipo(slot, { choice: 'otro', customLabel: customLabelDraft.trim() })
    setCustomLabelDraft(null)
  }

  const resolucionKey = pairQuestionKey(slot, 'vestuario.resolucion')
  const resolucionDecision = decisions.find((d) => d.questionKey === resolucionKey)
  const existingResolucion = resolucionDecision?.answer as unknown as VestuarioResolucionAnswer | undefined
  const [resolucionDraft, setResolucionDraft] = useState<VestuarioResolucionAnswer | null>(null)
  const currentResolucion = resolucionDraft ?? existingResolucion
  const savingResolucion = savingKey === resolucionKey
  const showResolucion = tipo !== undefined && tipo.choice !== 'todavia_no_lo_sabemos'

  function selectResolucion(choice: VestuarioResolucionChoice) {
    if (choice === 'otro') {
      setResolucionDraft({ choice, custom: existingResolucion?.custom ?? { label: '', action: 'preparar', hasCost: null } })
      return
    }
    setResolucionDraft(null)
    onSaveResolucion(slot, { choice })
  }
  function updateResolucionCustom(next: CustomResolution) {
    if (!currentResolucion) return
    setResolucionDraft({ choice: 'otro', custom: next })
  }
  function saveResolucionCustom() {
    if (!currentResolucion?.custom?.label.trim()) return
    onSaveResolucion(slot, { choice: 'otro', custom: currentResolucion.custom })
    setResolucionDraft(null)
  }

  return (
    <div style={{ marginTop: 6 }}>
      <div className="muted" style={{ fontSize: 13 }}>
        ¿Cómo vais con el vestuario de {name}?
      </div>
      <ChoiceRow options={VESTUARIO_TIPO_OPTIONS} value={tipo?.choice} disabled={saving} onSelect={selectTipo} />
      {tipo?.choice === 'otro' && (
        <div className="inline-fields" style={{ marginTop: 4 }}>
          <input type="text" value={customLabelDraft ?? tipo.customLabel ?? ''} disabled={saving} placeholder="¿Qué tipo de vestuario?" onChange={(e) => setCustomLabelDraft(e.target.value)} />
          <button type="button" className="link-button" disabled={saving || !(customLabelDraft ?? '').trim()} onClick={saveCustomTipo}>
            Guardar
          </button>
        </div>
      )}
      {showResolucion && (
        <div style={{ marginTop: 4 }}>
          <div className="muted" style={{ fontSize: 12 }}>
            ¿Cómo está resuelto?
          </div>
          <ChoiceRow options={VESTUARIO_RESOLUCION_OPTIONS} value={currentResolucion?.choice} disabled={savingResolucion} onSelect={selectResolucion} />
          {currentResolucion?.choice === 'otro' && currentResolucion.custom && (
            <>
              <CustomResolutionFields value={currentResolucion.custom} disabled={savingResolucion} onChange={updateResolucionCustom} />
              <button type="button" className="link-button" disabled={savingResolucion || !currentResolucion.custom.label.trim()} onClick={saveResolucionCustom}>
                Guardar
              </button>
              {currentResolucion.custom.action === 'buscar_contratar' && resolucionDecision && <ProviderLinker event={event} decision={resolucionDecision} />}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// Detalle especial — mismo patrón de 2 niveles: el tipo (regalo/carta/sorpresa/otro) nunca genera nada por
// sí solo; la resolución, revelada solo cuando el tipo implica preparación, es la única que genera.
function DetalleEspecialQuestion({
  decisions,
  savingKey,
  onSaveTipo,
  onSaveResolucion,
}: {
  decisions: EventDecision[]
  savingKey: string | null
  onSaveTipo: (answer: DetalleEspecialTipoAnswer) => void
  onSaveResolucion: (answer: DetalleEspecialResolucionAnswer) => void
}) {
  const tipoDecision = decisions.find((d) => d.questionKey === DETALLE_ESPECIAL_QUESTION_KEY)
  const tipo = tipoDecision?.answer as unknown as DetalleEspecialTipoAnswer | undefined
  const saving = savingKey === DETALLE_ESPECIAL_QUESTION_KEY
  const [customLabelDraft, setCustomLabelDraft] = useState<string | null>(null)

  function selectTipo(choice: DetalleEspecialTipoChoice) {
    if (choice === 'otro') {
      setCustomLabelDraft(tipo?.customLabel ?? '')
      return
    }
    setCustomLabelDraft(null)
    onSaveTipo({ choice })
  }
  function saveCustomTipo() {
    if (!customLabelDraft?.trim()) return
    onSaveTipo({ choice: 'otro', customLabel: customLabelDraft.trim() })
    setCustomLabelDraft(null)
  }

  const resolucionDecision = decisions.find((d) => d.questionKey === DETALLE_ESPECIAL_RESOLUCION_QUESTION_KEY)
  const existingResolucion = resolucionDecision?.answer as unknown as DetalleEspecialResolucionAnswer | undefined
  const [resolucionDraft, setResolucionDraft] = useState<DetalleEspecialResolucionAnswer | null>(null)
  const currentResolucion = resolucionDraft ?? existingResolucion
  const savingResolucion = savingKey === DETALLE_ESPECIAL_RESOLUCION_QUESTION_KEY
  const showResolucion = tipo !== undefined && tipo.choice !== 'no' && tipo.choice !== 'todavia_no_lo_sabemos'

  function selectResolucion(choice: DetalleEspecialResolucionChoice) {
    if (choice === 'otro') {
      setResolucionDraft({ choice, custom: existingResolucion?.custom ?? { label: '', action: 'preparar', hasCost: null } })
      return
    }
    setResolucionDraft(null)
    onSaveResolucion({ choice })
  }
  function updateResolucionCustom(next: CustomResolution) {
    if (!currentResolucion) return
    setResolucionDraft({ choice: 'otro', custom: next })
  }
  function saveResolucionCustom() {
    if (!currentResolucion?.custom?.label.trim()) return
    onSaveResolucion({ choice: 'otro', custom: currentResolucion.custom })
    setResolucionDraft(null)
  }

  return (
    <div style={{ marginTop: 6 }}>
      <div className="muted" style={{ fontSize: 13 }}>
        ¿Queréis preparar algo especial el uno para el otro?
      </div>
      <ChoiceRow options={DETALLE_ESPECIAL_TIPO_OPTIONS} value={tipo?.choice} disabled={saving} onSelect={selectTipo} />
      {tipo?.choice === 'otro' && (
        <div className="inline-fields" style={{ marginTop: 4 }}>
          <input type="text" value={customLabelDraft ?? tipo.customLabel ?? ''} disabled={saving} placeholder="¿Qué es?" onChange={(e) => setCustomLabelDraft(e.target.value)} />
          <button type="button" className="link-button" disabled={saving || !(customLabelDraft ?? '').trim()} onClick={saveCustomTipo}>
            Guardar
          </button>
        </div>
      )}
      {showResolucion && (
        <div style={{ marginTop: 4 }}>
          <div className="muted" style={{ fontSize: 12 }}>
            ¿Cómo está resuelto?
          </div>
          <ChoiceRow options={DETALLE_ESPECIAL_RESOLUCION_OPTIONS} value={currentResolucion?.choice} disabled={savingResolucion} onSelect={selectResolucion} />
          {currentResolucion?.choice === 'otro' && currentResolucion.custom && (
            <>
              <CustomResolutionFields value={currentResolucion.custom} disabled={savingResolucion} onChange={updateResolucionCustom} />
              <button type="button" className="link-button" disabled={savingResolucion || !currentResolucion.custom.label.trim()} onClick={saveResolucionCustom}>
                Guardar
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function PeluqueriaQuestion({
  event,
  slot,
  decisions,
  savingKey,
  onSaveNecesidad,
  onSaveResolucion,
}: {
  event: FamilyEvent
  slot: PartnerSlot
  decisions: EventDecision[]
  savingKey: string | null
  onSaveNecesidad: (slot: PartnerSlot, answer: PeluqueriaNecesidadAnswer) => void
  onSaveResolucion: (slot: PartnerSlot, answer: PeluqueriaResolucionAnswer) => void
}) {
  const name = partnerName(event, slot)
  const necesidadKey = pairQuestionKey(slot, 'peluqueria_maquillaje')
  const necesidadDecision = decisions.find((d) => d.questionKey === necesidadKey)
  const necesidad = necesidadDecision?.answer as unknown as PeluqueriaNecesidadAnswer | undefined
  const saving = savingKey === necesidadKey
  const [customDraft, setCustomDraft] = useState<string | null>(null)

  function selectNecesidad(choice: PeluqueriaNecesidadChoice) {
    if (choice === 'otro') {
      setCustomDraft(necesidad?.customLabel ?? '')
      return
    }
    setCustomDraft(null)
    onSaveNecesidad(slot, { choice })
  }
  function saveCustomNecesidad() {
    if (!customDraft?.trim()) return
    onSaveNecesidad(slot, { choice: 'otro', customLabel: customDraft.trim() })
    setCustomDraft(null)
  }

  const resolucionKey = pairQuestionKey(slot, 'peluqueria_maquillaje.resolucion')
  const resolucionDecision = decisions.find((d) => d.questionKey === resolucionKey)
  const resolucion = resolucionDecision?.answer as unknown as PeluqueriaResolucionAnswer | undefined
  const savingResolucion = savingKey === resolucionKey
  const showResolucion = necesidad && necesidad.choice !== 'no' && necesidad.choice !== 'todavia_no_lo_sabemos'

  return (
    <div style={{ marginTop: 6 }}>
      <div className="muted" style={{ fontSize: 13 }}>
        ¿Necesitará peluquería o maquillaje {name}?
      </div>
      <ChoiceRow options={PELUQUERIA_NECESIDAD_OPTIONS} value={necesidad?.choice} disabled={saving} onSelect={selectNecesidad} />
      {necesidad?.choice === 'otro' && (
        <div className="inline-fields" style={{ marginTop: 4 }}>
          <input type="text" value={customDraft ?? necesidad.customLabel ?? ''} disabled={saving} placeholder="¿Qué necesita?" onChange={(e) => setCustomDraft(e.target.value)} />
          <button type="button" className="link-button" disabled={saving || !(customDraft ?? '').trim()} onClick={saveCustomNecesidad}>
            Guardar
          </button>
        </div>
      )}
      {showResolucion && (
        <div style={{ marginTop: 4 }}>
          <div className="muted" style={{ fontSize: 12 }}>
            ¿Cómo lo resolvéis?
          </div>
          <ChoiceRow
            options={PELUQUERIA_RESOLUCION_OPTIONS}
            value={resolucion?.choice}
            disabled={savingResolucion}
            onSelect={(v) => onSaveResolucion(slot, { choice: v })}
          />
          {resolucion?.choice === 'buscando' && resolucionDecision && <ProviderLinker event={event} decision={resolucionDecision} />}
        </div>
      )}
    </div>
  )
}

function ComplementosQuestion({
  event,
  slot,
  decision,
  savingKey,
  onSave,
}: {
  event: FamilyEvent
  slot: PartnerSlot
  decision: EventDecision | undefined
  savingKey: string | null
  onSave: (answer: ComplementosAnswer) => void
}) {
  const name = partnerName(event, slot)
  const key = pairQuestionKey(slot, 'complementos')
  const saving = savingKey === key
  const existing = decision?.answer as unknown as ComplementosAnswer | undefined
  // Corrección real (iPhone): sin decisión ni borrador, `current` debe quedar undefined — nunca un
  // objeto de repuesto con choice:'todavia_no_lo_sabemos', que hacía que ese chip apareciera marcado sin
  // que nadie lo hubiera elegido. Los arrays vacíos se resuelven con `?? []` solo donde hacen falta.
  const [draft, setDraft] = useState<ComplementosAnswer | null>(null)
  const current = draft ?? existing
  const [customInput, setCustomInput] = useState('')

  function selectChoice(choice: ComplementosChoice) {
    if (choice === 'preparar') {
      setDraft({ choice, selected: current?.selected ?? [], customItems: current?.customItems ?? [] })
      return
    }
    setDraft(null)
    onSave({ choice, selected: [], customItems: [] })
  }
  function toggleSelected(item: string) {
    const selected = current?.selected ?? []
    const nextSelected = selected.includes(item) ? selected.filter((x) => x !== item) : [...selected, item]
    setDraft({ choice: 'preparar', selected: nextSelected, customItems: current?.customItems ?? [] })
  }
  function addCustom() {
    if (!customInput.trim()) return
    setDraft({ choice: 'preparar', selected: current?.selected ?? [], customItems: [...(current?.customItems ?? []), customInput.trim()] })
    setCustomInput('')
  }
  function removeCustom(item: string) {
    setDraft({ choice: 'preparar', selected: current?.selected ?? [], customItems: (current?.customItems ?? []).filter((x) => x !== item) })
  }
  function save() {
    if (!current) return
    onSave(current)
    setDraft(null)
  }

  return (
    <div style={{ marginTop: 6 }}>
      <div className="muted" style={{ fontSize: 13 }}>
        ¿Qué complementos necesitáis preparar para {name}?
      </div>
      <ChoiceRow options={COMPLEMENTOS_CHOICE_OPTIONS} value={current?.choice} disabled={saving} onSelect={selectChoice} />
      {current?.choice === 'preparar' && (
        <>
          <div className="filter-row" style={{ flexWrap: 'wrap', marginTop: 4 }}>
            {COMPLEMENTOS_OPTIONS.map((o) => (
              <button key={o} type="button" className={'chip' + ((current.selected ?? []).includes(o) ? ' chip-active' : '')} disabled={saving} onClick={() => toggleSelected(o)}>
                {o}
              </button>
            ))}
            {(current.customItems ?? []).map((o) => (
              <button key={o} type="button" className="chip chip-active" disabled={saving} onClick={() => removeCustom(o)}>
                {o} ✕
              </button>
            ))}
          </div>
          <div className="inline-fields" style={{ marginTop: 4 }}>
            <input type="text" value={customInput} placeholder="Otro complemento" disabled={saving} onChange={(e) => setCustomInput(e.target.value)} />
            <button type="button" className="link-button" disabled={saving || !customInput.trim()} onClick={addCustom}>
              + Añadir
            </button>
          </div>
          <button type="button" className="link-button" disabled={saving} onClick={save} style={{ marginTop: 4 }}>
            Guardar complementos
          </button>
        </>
      )}
    </div>
  )
}

// Corrección real (iPhone): marcar Ramo/Prendido ≠ responder su resolución — son dos decisiones
// distintas. `selected` (events.details, nunca event_decisions) es solo "la familia contempla este
// elemento"; `decision` es la resolución real, y solo existe cuando se elige expresamente una. Marcar la
// casilla nunca guarda "todavía no lo sabemos" como respuesta ficticia — eso solo se guarda si alguien
// pulsa ese chip de verdad.
function FloralItemQuestion({
  event,
  slot,
  item,
  selected,
  decision,
  savingKey,
  onToggleSelected,
  onSave,
}: {
  event: FamilyEvent
  slot: PartnerSlot
  item: { key: FloralItemKey; label: string; icon: string }
  selected: boolean
  decision: EventDecision | undefined
  savingKey: string | null
  onToggleSelected: (checked: boolean) => void
  onSave: (answer: FloralAnswer) => void
}) {
  const name = partnerName(event, slot)
  const key = pairQuestionKey(slot, `floral.${item.key}`)
  const saving = savingKey === key
  const existing = decision?.answer as unknown as FloralAnswer | undefined
  const [draft, setDraft] = useState<FloralAnswer | null>(null)
  const current = draft ?? existing

  function selectChoice(choice: FloralChoice) {
    if (choice === 'otro') {
      setDraft({ choice, custom: existing?.custom ?? { label: '', action: 'preparar', hasCost: null } })
      return
    }
    setDraft(null)
    onSave({ choice })
  }
  function updateCustom(next: CustomResolution) {
    if (!current) return
    setDraft({ choice: 'otro', custom: next })
  }
  function saveCustom() {
    if (!current?.custom?.label.trim()) return
    onSave({ choice: 'otro', custom: current.custom })
    setDraft(null)
  }

  return (
    <div style={{ marginTop: 4 }}>
      {/* El <label> base de la app es flex-direction:column — sin flexDirection:'row' explícito, la
          casilla y el texto quedaban apilados en vez de en una sola fila compacta (mismo gotcha ya
          conocido en INCLUDABLE_SERVICES_BY_TYPE). Toda la fila es pulsable porque el <label> envuelve
          el input, no solo el propio checkbox. */}
      <label className="inline-fields" style={{ flexDirection: 'row', alignItems: 'center', cursor: 'pointer' }}>
        <input type="checkbox" checked={selected} disabled={saving} onChange={(e) => onToggleSelected(e.target.checked)} />
        <span>
          {item.icon} {item.label}
        </span>
      </label>
      {selected && (
        <div style={{ marginLeft: 20 }}>
          <div className="muted" style={{ fontSize: 12 }}>
            ¿Cómo resolvéis {item.label.toLowerCase()} de {name}?
          </div>
          <ChoiceRow options={FLORAL_CHOICE_OPTIONS} value={current?.choice} disabled={saving} onSelect={selectChoice} />
          {current?.choice === 'otro' && current.custom && (
            <>
              <CustomResolutionFields value={current.custom} disabled={saving} onChange={updateCustom} />
              <button type="button" className="link-button" disabled={saving || !current.custom.label.trim()} onClick={saveCustom}>
                Guardar
              </button>
              {current.custom.action === 'buscar_contratar' && decision && <ProviderLinker event={event} decision={decision} />}
            </>
          )}
          {current?.choice === 'floristeria' && decision && <ProviderLinker event={event} decision={decision} />}
        </div>
      )}
    </div>
  )
}

// "+ Otro complemento floral" — una decisión floral sin ítem fijo (ramo/prendido): va directa al motor
// explícito de CustomResolutionFields, nunca a interpretar su propio nombre.
function CustomFloralItem({
  event,
  decision,
  savingKey,
  onSave,
  onRemove,
}: {
  event: FamilyEvent
  decision: EventDecision
  savingKey: string | null
  onSave: (custom: CustomResolution) => void
  onRemove: () => void
}) {
  const saving = savingKey === decision.questionKey
  const existing = (decision.answer as unknown as FloralAnswer).custom ?? { label: '', action: 'preparar' as CustomAction, hasCost: null }
  const [draft, setDraft] = useState(existing)

  return (
    <div className="card" style={{ padding: 8, marginTop: 4 }}>
      <CustomResolutionFields value={draft} disabled={saving} onChange={setDraft} />
      <div className="filter-row" style={{ marginTop: 4 }}>
        <button type="button" className="link-button" disabled={saving || !draft.label.trim()} onClick={() => onSave(draft)}>
          Guardar
        </button>
        <button type="button" className="link-button" disabled={saving} onClick={onRemove}>
          Quitar
        </button>
      </div>
      {draft.action === 'buscar_contratar' && <ProviderLinker event={event} decision={decision} />}
    </div>
  )
}

function PairBlock({
  event,
  onChanged,
  onDerivedDataChanged,
  focusRequest,
}: {
  event: FamilyEvent
  onChanged: () => void
  onDerivedDataChanged: () => void
  focusRequest?: ConfiguratorFocusRequest | null
}) {
  const { localFocus, setLocalFocus, ref: focusRef } = useConfiguratorQuestionFocus(focusRequest)
  const [decisions, setDecisions] = useState<EventDecision[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  function reload(): Promise<void> {
    return listEventDecisions(event.id)
      .then((d) => setDecisions(d.filter((x) => x.blockKey === 'pareja')))
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar las decisiones')))
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id])

  function findDecision(questionKey: string): EventDecision | undefined {
    return decisions.find((d) => d.questionKey === questionKey)
  }

  // Feedback (§12-13 de la corrección aprobada) — un único toast agrupado por acción real, construido
  // SIEMPRE a partir de lo que applyPairDecisionGeneration ejecutó de verdad (nunca de la respuesta
  // elegida). Si además queda una partida resuelta sin importe, el modal de cierre de coste se abre
  // directamente y el toast se pospone — nunca "Preparativo completado" seguido del modal.
  const [costPrompt, setCostPrompt] = useState<{ item: { id: string; category: string }; taskCompleted: boolean } | null>(null)

  function handleEffects(actions: ReconcileAction[], pendingBudgetItem: { id: string; category: string } | null) {
    if (pendingBudgetItem) {
      setCostPrompt({ item: pendingBudgetItem, taskCompleted: actions.some((a) => a.op === 'complete_task') })
      return
    }
    const message = describeEffects(actions)
    if (message) showToast(message)
  }

  // Fallo 1 (prueba real en iPhone) — PairBlock escribe event_tasks/event_budget_items directamente en
  // Supabase; EventDetail (Preparativos en línea, tarjeta-resumen de Presupuesto) mantiene su propio
  // estado cargado solo al montar y nunca se entera. onDerivedDataChanged() SIEMPRE se llama DESPUÉS de
  // que la escritura haya terminado con éxito (dentro del try, tras los await), nunca antes ni en el
  // catch — recargar antes de confirmar la escritura mostraría el estado viejo igual que antes.
  async function saveQuestion(questionKey: string, answer: Record<string, unknown>, isCustomOption: boolean, desired: DesiredPairGeneration) {
    setSavingKey(questionKey)
    setError(null)
    try {
      const decision = await upsertEventDecision(event.id, { blockKey: 'pareja', questionKey, answer, isCustomOption })
      const { actions, pendingBudgetItem } = await applyPairDecisionGeneration(event.id, decision.id, desired)
      await reload()
      onDerivedDataChanged()
      handleEffects(actions, pendingBudgetItem)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSavingKey(null)
    }
  }

  async function saveVestuarioTipo(slot: PartnerSlot, answer: VestuarioTipoAnswer) {
    const key = pairQuestionKey(slot, 'vestuario')
    setSavingKey(key)
    setError(null)
    try {
      const tipoDecision = await upsertEventDecision(event.id, {
        blockKey: 'pareja',
        questionKey: key,
        answer: answer as unknown as Record<string, unknown>,
        isCustomOption: answer.choice === 'otro',
      })
      // Residuo del modelo de 1 solo nivel (corrección real, iPhone): esta misma clave generaba
      // directamente un Preparativo/Presupuesto antes de existir la resolución — el tipo nunca debe
      // generar nada, así que se reconcilia SIEMPRE a "nada", lo que también limpia cualquier resto
      // heredado de esa época en cuanto se vuelve a guardar el tipo.
      let { actions } = await applyPairDecisionGeneration(event.id, tipoDecision.id, { taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false, groupKind: null, groupDefaultName: null })
      let pendingBudgetItem: { id: string; category: string } | null = null
      const resDecision = findDecision(pairQuestionKey(slot, 'vestuario.resolucion'))
      if (resDecision) {
        const resAnswer = resDecision.answer as unknown as VestuarioResolucionAnswer
        const result = await applyPairDecisionGeneration(event.id, resDecision.id, desiredForVestuarioResolucion(answer, resAnswer, partnerName(event, slot)))
        actions = [...actions, ...result.actions]
        pendingBudgetItem = result.pendingBudgetItem
      }
      await reload()
      onDerivedDataChanged()
      handleEffects(actions, pendingBudgetItem)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSavingKey(null)
    }
  }

  async function saveVestuarioResolucion(slot: PartnerSlot, answer: VestuarioResolucionAnswer) {
    const tipoDecision = findDecision(pairQuestionKey(slot, 'vestuario'))
    if (!tipoDecision) return
    const resKey = pairQuestionKey(slot, 'vestuario.resolucion')
    setSavingKey(resKey)
    setError(null)
    try {
      const tipo = tipoDecision.answer as unknown as VestuarioTipoAnswer
      const decision = await upsertEventDecision(event.id, { blockKey: 'pareja', questionKey: resKey, answer: answer as unknown as Record<string, unknown>, isCustomOption: answer.choice === 'otro' })
      const { actions, pendingBudgetItem } = await applyPairDecisionGeneration(event.id, decision.id, desiredForVestuarioResolucion(tipo, answer, partnerName(event, slot)))
      await reload()
      onDerivedDataChanged()
      handleEffects(actions, pendingBudgetItem)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSavingKey(null)
    }
  }

  async function saveNecesidad(slot: PartnerSlot, answer: PeluqueriaNecesidadAnswer) {
    const key = pairQuestionKey(slot, 'peluqueria_maquillaje')
    setSavingKey(key)
    setError(null)
    try {
      await upsertEventDecision(event.id, { blockKey: 'pareja', questionKey: key, answer: answer as unknown as Record<string, unknown>, isCustomOption: answer.choice === 'otro' })
      // La necesidad en sí nunca ha generado nada directamente en ningún momento de este desarrollo —
      // solo la resolución, si ya existía — así que no hace falta el mismo autosaneado que en Vestuario.
      let actions: ReconcileAction[] = []
      let pendingBudgetItem: { id: string; category: string } | null = null
      const resDecision = findDecision(pairQuestionKey(slot, 'peluqueria_maquillaje.resolucion'))
      if (resDecision) {
        const resAnswer = resDecision.answer as unknown as PeluqueriaResolucionAnswer
        const result = await applyPairDecisionGeneration(event.id, resDecision.id, desiredForPeluqueriaResolucion(answer, resAnswer, partnerName(event, slot)))
        actions = result.actions
        pendingBudgetItem = result.pendingBudgetItem
      }
      await reload()
      onDerivedDataChanged()
      handleEffects(actions, pendingBudgetItem)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSavingKey(null)
    }
  }

  async function saveResolucion(slot: PartnerSlot, answer: PeluqueriaResolucionAnswer) {
    const necesidadDecision = findDecision(pairQuestionKey(slot, 'peluqueria_maquillaje'))
    if (!necesidadDecision) return
    const resKey = pairQuestionKey(slot, 'peluqueria_maquillaje.resolucion')
    setSavingKey(resKey)
    setError(null)
    try {
      const necesidad = necesidadDecision.answer as unknown as PeluqueriaNecesidadAnswer
      const decision = await upsertEventDecision(event.id, { blockKey: 'pareja', questionKey: resKey, answer: answer as unknown as Record<string, unknown>, isCustomOption: false })
      const { actions, pendingBudgetItem } = await applyPairDecisionGeneration(event.id, decision.id, desiredForPeluqueriaResolucion(necesidad, answer, partnerName(event, slot)))
      await reload()
      onDerivedDataChanged()
      handleEffects(actions, pendingBudgetItem)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSavingKey(null)
    }
  }

  async function saveDetalleTipo(answer: DetalleEspecialTipoAnswer) {
    setSavingKey(DETALLE_ESPECIAL_QUESTION_KEY)
    setError(null)
    try {
      const tipoDecision = await upsertEventDecision(event.id, {
        blockKey: 'pareja',
        questionKey: DETALLE_ESPECIAL_QUESTION_KEY,
        answer: answer as unknown as Record<string, unknown>,
        isCustomOption: answer.choice === 'otro',
      })
      // Mismo autosaneado que Vestuario — esta clave también generaba directamente bajo el modelo de 1
      // solo nivel.
      let { actions } = await applyPairDecisionGeneration(event.id, tipoDecision.id, { taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false, groupKind: null, groupDefaultName: null })
      let pendingBudgetItem: { id: string; category: string } | null = null
      const resDecision = findDecision(DETALLE_ESPECIAL_RESOLUCION_QUESTION_KEY)
      if (resDecision) {
        const resAnswer = resDecision.answer as unknown as DetalleEspecialResolucionAnswer
        const result = await applyPairDecisionGeneration(event.id, resDecision.id, desiredForDetalleEspecialResolucion(answer, resAnswer))
        actions = [...actions, ...result.actions]
        pendingBudgetItem = result.pendingBudgetItem
      }
      await reload()
      onDerivedDataChanged()
      handleEffects(actions, pendingBudgetItem)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSavingKey(null)
    }
  }

  async function saveDetalleResolucion(answer: DetalleEspecialResolucionAnswer) {
    const tipoDecision = findDecision(DETALLE_ESPECIAL_QUESTION_KEY)
    if (!tipoDecision) return
    setSavingKey(DETALLE_ESPECIAL_RESOLUCION_QUESTION_KEY)
    setError(null)
    try {
      const tipo = tipoDecision.answer as unknown as DetalleEspecialTipoAnswer
      const decision = await upsertEventDecision(event.id, {
        blockKey: 'pareja',
        questionKey: DETALLE_ESPECIAL_RESOLUCION_QUESTION_KEY,
        answer: answer as unknown as Record<string, unknown>,
        isCustomOption: answer.choice === 'otro',
      })
      const { actions, pendingBudgetItem } = await applyPairDecisionGeneration(event.id, decision.id, desiredForDetalleEspecialResolucion(tipo, answer))
      await reload()
      onDerivedDataChanged()
      handleEffects(actions, pendingBudgetItem)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSavingKey(null)
    }
  }

  async function removeFloral(questionKey: string, decision: EventDecision) {
    setSavingKey(questionKey)
    setError(null)
    try {
      await applyPairDecisionGeneration(event.id, decision.id, { taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false, groupKind: null, groupDefaultName: null })
      await deleteEventDecision(decision.id)
      await reload()
      onDerivedDataChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo quitar'))
    } finally {
      setSavingKey(null)
    }
  }

  // Corrección real (iPhone) — marcar/desmarcar Ramo/Prendido nunca escribe una decisión ficticia: solo
  // actualiza events.details (igual que los nombres de la pareja, merge explícito). Si al desmarcar ya
  // existía una resolución real, se reconcilia primero (prístina se borra, enriquecida se desvincula) y
  // SOLO ENTONCES se borra la propia decisión — la información nunca desaparece en silencio.
  async function setFloralSelected(slot: PartnerSlot, item: FloralItemKey, selected: boolean) {
    const key = pairQuestionKey(slot, `floral.${item}`)
    setSavingKey(key)
    setError(null)
    try {
      if (!selected) {
        const decision = findDecision(key)
        if (decision) {
          await applyPairDecisionGeneration(event.id, decision.id, { taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false, groupKind: null, groupDefaultName: null })
          await deleteEventDecision(decision.id)
          onDerivedDataChanged()
        }
      }
      await updateEvent(event.id, { details: withFloralSelected(event, slot, item, selected) })
      onChanged()
      await reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSavingKey(null)
    }
  }

  async function addCustomFloral(slot: PartnerSlot) {
    const key = pairQuestionKey(slot, `floral.custom:${crypto.randomUUID()}`)
    setSavingKey(key)
    setError(null)
    try {
      await upsertEventDecision(event.id, {
        blockKey: 'pareja',
        questionKey: key,
        answer: { choice: 'otro', custom: { label: '', action: 'preparar', hasCost: null } },
        isCustomOption: true,
      })
      await reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir'))
    } finally {
      setSavingKey(null)
    }
  }

  if (loading) return null
  const summary = summarizePairBlock(event, decisions)
  const decisionSummary = buildPairDecisionSummary(event, decisions)

  // Vestuario/Peluquería/Detalle especial ya renderizan tipo+resolución juntos en un único componente —
  // una u otra clave enfocada debe mostrar el componente entero (sus "dependencias necesarias").
  function matches(...keys: string[]): boolean {
    return !localFocus || keys.includes(localFocus)
  }

  return (
    <div ref={focusRef} className="card" style={{ padding: 8 }}>
      {summary && (
        <p className="muted" style={{ fontSize: 13, margin: '0 0 6px' }}>
          {summary}
        </p>
      )}
      <DecisionSummaryDetails summary={decisionSummary} onSelect={setLocalFocus} />
      {error && <p className="error">{error}</p>}
      {PARTNER_SLOTS.map((slot) => {
        const name = partnerName(event, slot)
        const complementosKey = pairQuestionKey(slot, 'complementos')
        const complementosDecision = findDecision(complementosKey)
        const complementosAnswer = complementosDecision?.answer as unknown as ComplementosAnswer | undefined
        const vestuarioKey = pairQuestionKey(slot, 'vestuario')
        const peluqueriaKey = pairQuestionKey(slot, 'peluqueria_maquillaje')
        return (
          <div key={slot} className="card" style={{ padding: 8, marginTop: 8 }}>
            <strong>{name}</strong>
            {matches(vestuarioKey, `${vestuarioKey}.resolucion`) && (
              <VestuarioQuestion event={event} slot={slot} decisions={decisions} savingKey={savingKey} onSaveTipo={saveVestuarioTipo} onSaveResolucion={saveVestuarioResolucion} />
            )}
            {matches(peluqueriaKey, `${peluqueriaKey}.resolucion`) && (
              <PeluqueriaQuestion event={event} slot={slot} decisions={decisions} savingKey={savingKey} onSaveNecesidad={saveNecesidad} onSaveResolucion={saveResolucion} />
            )}
            {matches(complementosKey) && (
              <ComplementosQuestion
                event={event}
                slot={slot}
                decision={complementosDecision}
                savingKey={savingKey}
                onSave={(answer) => saveQuestion(complementosKey, answer as unknown as Record<string, unknown>, false, desiredForComplementos(answer, name))}
              />
            )}
            {/* Corrección real (iPhone): los florales aparecían SIEMPRE, antes incluso de responder
                Complementos generales. Revelado único: solo "Queremos preparar complementos" los muestra —
                Sin empezar/No necesitaremos/Todavía no lo sabemos los ocultan, sin excepción permanente.
                RETOQUE (petición real: "Paco no tiene esa posibilidad") — ese revelado único ocultaba
                datos florales REALES ya guardados en cuanto Complementos generales (zapatos/joyas/corbata,
                un concepto sin relación) dejaba de ser 'preparar' o nunca llegaba a responderse. Ahora
                también se revela si esta persona ya tiene cualquier actividad floral real
                (hasFloralActivity, mismo criterio que ya usaba el contador "✓ N decididas" de arriba) —
                nunca se vuelve a esconder un dato ya dado. */}
            {(complementosAnswer?.choice === 'preparar' || hasFloralActivity(event, slot, decisions)) && (
              <>
                {!localFocus && (
                  <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                    💐 Complementos florales
                  </div>
                )}
                {floralItemsForSlot(event, slot, decisions)
                  .filter((item) => matches(pairQuestionKey(slot, `floral.${item.key}`)))
                  .map((item) => {
                    const key = pairQuestionKey(slot, `floral.${item.key}`)
                    const decision = findDecision(key)
                    const selected = decision !== undefined || floralItemSelected(event, slot, item.key)
                    return (
                      <FloralItemQuestion
                        key={item.key}
                        event={event}
                        slot={slot}
                        item={item}
                        selected={selected}
                        decision={decision}
                        savingKey={savingKey}
                        onToggleSelected={(checked) => setFloralSelected(slot, item.key, checked)}
                        onSave={(answer) => saveQuestion(key, answer as unknown as Record<string, unknown>, answer.choice === 'otro', desiredForFloral(answer, item.label, name))}
                      />
                    )
                  })}
                {decisions
                  .filter((d) => d.questionKey.startsWith(pairQuestionKey(slot, 'floral.custom:')) && matches(d.questionKey))
                  .map((d) => (
                    <CustomFloralItem
                      key={d.id}
                      event={event}
                      decision={d}
                      savingKey={savingKey}
                      onSave={(custom) =>
                        saveQuestion(d.questionKey, { choice: 'otro', custom }, true, desiredForFloral({ choice: 'otro', custom }, 'Complemento floral', name))
                      }
                      onRemove={() => removeFloral(d.questionKey, d)}
                    />
                  ))}
                {!localFocus && (
                  <button type="button" className="link-button" onClick={() => addCustomFloral(slot)} style={{ marginTop: 4 }}>
                    + Otro complemento floral
                  </button>
                )}
              </>
            )}
          </div>
        )
      })}
      {matches(ALIANZAS_QUESTION_KEY, DETALLE_ESPECIAL_QUESTION_KEY, DETALLE_ESPECIAL_RESOLUCION_QUESTION_KEY) && (
        <div className="card" style={{ padding: 8, marginTop: 8 }}>
          <strong>Los dos</strong>
          {matches(ALIANZAS_QUESTION_KEY) && (
            <CustomAwareQuestion
              event={event}
              questionLabel="¿Cómo vais con las alianzas?"
              options={ALIANZAS_OPTIONS}
              questionKey={ALIANZAS_QUESTION_KEY}
              decision={findDecision(ALIANZAS_QUESTION_KEY)}
              savingKey={savingKey}
              onSave={(answer) =>
                saveQuestion(ALIANZAS_QUESTION_KEY, answer as unknown as Record<string, unknown>, answer.choice === 'otro', desiredForAlianzas(answer as AlianzasAnswer))
              }
            />
          )}
          {matches(DETALLE_ESPECIAL_QUESTION_KEY, DETALLE_ESPECIAL_RESOLUCION_QUESTION_KEY) && (
            <DetalleEspecialQuestion decisions={decisions} savingKey={savingKey} onSaveTipo={saveDetalleTipo} onSaveResolucion={saveDetalleResolucion} />
          )}
        </div>
      )}
      {localFocus && (
        <button type="button" className="link-button" onClick={() => setLocalFocus(null)} style={{ marginTop: 6 }}>
          Ver todas las preguntas
        </button>
      )}
      {costPrompt && (
        <BudgetAmountPromptModal
          item={costPrompt.item}
          onClose={() => {
            if (costPrompt.taskCompleted) showToast(TASK_COMPLETED_MESSAGE)
            setCostPrompt(null)
          }}
          onSaved={() => {
            showToast(costPrompt.taskCompleted ? TASK_COMPLETED_AND_BUDGET_UPDATED_MESSAGE : BUDGET_UPDATED_MESSAGE)
            onDerivedDataChanged()
            setCostPrompt(null)
          }}
        />
      )}
    </div>
  )
}

// Cierre de coste reutilizable (§6-7 de la corrección aprobada) — trabaja siempre sobre una partida REAL
// ya existente, identificada por su id; el título mostrado es el propio `category` ya guardado, nunca un
// texto fijo por tipo de pregunta. Guardar/Sin coste actualizan esa misma partida; Ahora no no escribe
// nada — la partida sigue "Sin importe todavía" hasta que alguien la rellene, aquí o desde Presupuesto.
function BudgetAmountPromptModal({
  item,
  onClose,
  onSaved,
}: {
  item: { id: string; category: string }
  onClose: () => void
  onSaved: () => void
}) {
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(value: number) {
    setSaving(true)
    setError(null)
    try {
      await updateEventBudgetItem(item.id, { plannedAmount: value })
      onSaved()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
      setSaving(false)
    }
  }

  const amountValue = Number(amount.replace(',', '.'))
  const amountValid = amount.trim() !== '' && !Number.isNaN(amountValue) && amountValue >= 0

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            {item.category}
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        <label>
          ¿Cuánto ha costado?
          <input type="number" min={0} step="0.01" inputMode="decimal" value={amount} disabled={saving} onChange={(e) => setAmount(e.target.value)} placeholder="€" autoFocus />
        </label>
        <div className="filter-row" style={{ marginTop: 8 }}>
          <button type="button" onClick={() => save(amountValue)} disabled={saving || !amountValid}>
            Guardar
          </button>
          <button type="button" className="link-button" onClick={() => save(0)} disabled={saving}>
            Sin coste
          </button>
          <button type="button" className="link-button" onClick={onClose} disabled={saving}>
            Ahora no
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Fase 4 — "👥 Invitados e invitaciones", segundo uso real de event_decisions (el primero fue "La pareja",
// src/domain/eventPairDecisions.ts). Reutiliza el motor entero tal cual — DesiredPairGeneration,
// reconcilePairGeneration (vía applyPairDecisionGeneration), CustomAwareQuestion, CustomResolutionFields,
// ProviderLinker, BudgetAmountPromptModal, el mismo patrón de toast agrupado — sin tocar ni una línea de
// "La pareja", que queda exactamente como estaba (Fase 3, cerrada y validada).
// ---------------------------------------------------------------------

const LISTA_OPTIONS: { value: ListaInvitadosChoice; label: string }[] = [
  { value: 'ya_la_tenemos', label: 'Sí, ya la tenemos' },
  { value: 'tenemos_que_prepararla', label: 'Tenemos que prepararla' },
  { value: 'todavia_no_lo_sabemos', label: 'Todavía no lo sabemos' },
  { value: 'otro', label: 'Otro' },
]
const INVITADOS_PREGUNTAS_OPTIONS: { value: InvitadosPreguntasChoice; label: string }[] = [
  { value: 'si', label: 'Sí' },
  { value: 'no', label: 'No' },
  { value: 'todavia_no_lo_sabemos', label: 'Todavía no lo sabemos' },
]
const MOMENTOS_OPTIONS: { value: MomentosChoice; label: string }[] = [
  { value: 'todos_a_todos', label: 'Sí, todos a todos' },
  { value: 'depende', label: 'Depende del invitado o familia' },
  { value: 'todavia_no_lo_sabemos', label: 'Todavía no lo sabemos' },
  { value: 'otro', label: 'Otro' },
]
const NINOS_OPTIONS: { value: NinosChoice; label: string }[] = [
  { value: 'si', label: 'Sí' },
  { value: 'no', label: 'No' },
  { value: 'todavia_no_lo_sabemos', label: 'Todavía no lo sabemos' },
  { value: 'otro', label: 'Otro' },
]
const INVITACION_OPTIONS: { value: InvitacionChoice; label: string }[] = [
  { value: 'con_pepa', label: 'Con PEPA' },
  { value: 'externa', label: 'Con una invitación externa' },
  { value: 'todavia_no_lo_sabemos', label: 'Todavía no lo sabemos' },
  { value: 'otro', label: 'Otro' },
]
const NINOS_NECESIDADES_CHOICE_OPTIONS: { value: NinosNecesidadesAnswer['choice']; label: string }[] = [
  { value: 'preparar', label: 'Sí, hay que preverlo' },
  { value: 'no_necesitamos', label: 'No necesitamos nada especial' },
  { value: 'todavia_no_lo_sabemos', label: 'Todavía no lo sabemos' },
]

// Ajuste de UX (tras validación manual) — puerta de DESCUBRIMIENTO del sistema genérico "📋 Preguntas a
// los invitados" (GuestQuestionForm/event_guest_questions, ya implementado): "Sí" revela tres accesos, ni
// mutuamente excluyentes ni un wizard. "🍽️ Elección de menú" es un simple interruptor conceptual
// (wantsMenu) — nunca crea fila en event_guest_questions, las opciones reales siguen siendo de una fase
// futura todavía sin construir. "🚗 Transporte"/"✏️ Otra pregunta" abren el MISMO GuestQuestionForm que ya
// usa "+ Añadir pregunta a los invitados" — nunca un segundo formulario — así que lo que se crea aquí
// aparece en la misma lista de siempre, editable igual.
function InvitadosPreguntasQuestion({
  event,
  existing,
  saving,
  onSave,
  onQuestionCreated,
}: {
  event: FamilyEvent
  existing: InvitadosPreguntasAnswer | undefined
  saving: boolean
  onSave: (answer: InvitadosPreguntasAnswer) => void
  onQuestionCreated: () => void
}) {
  const [openForm, setOpenForm] = useState<'transporte' | 'otra' | null>(null)
  const wantsMenu = effectiveWantsMenu(existing)

  function selectChoice(choice: InvitadosPreguntasChoice) {
    setOpenForm(null)
    onSave(choice === 'si' ? { choice, wantsMenu } : { choice })
  }

  return (
    <div style={{ marginTop: 6 }}>
      <div className="muted" style={{ fontSize: 13 }}>
        ¿Queréis incluir alguna pregunta para los invitados en la invitación?
      </div>
      <ChoiceRow options={INVITADOS_PREGUNTAS_OPTIONS} value={existing?.choice} disabled={saving} onSelect={selectChoice} />
      {existing?.choice === 'si' && (
        <div style={{ marginTop: 6 }}>
          <div className="muted" style={{ fontSize: 13 }}>
            ¿Qué queréis preguntar?
          </div>
          <div className="filter-row" style={{ flexWrap: 'wrap', marginTop: 4 }}>
            <button
              type="button"
              className={'chip' + (wantsMenu ? ' chip-active' : '')}
              disabled={saving}
              onClick={() => onSave({ choice: 'si', wantsMenu: !wantsMenu })}
            >
              🍽️ Elección de menú
            </button>
            <button type="button" className="chip" disabled={saving} onClick={() => setOpenForm('transporte')}>
              🚗 Transporte
            </button>
            <button type="button" className="chip" disabled={saving} onClick={() => setOpenForm('otra')}>
              ✏️ Otra pregunta
            </button>
          </div>
          {wantsMenu && (
            <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Las opciones reales de menú (Carne/Pescado/Vegetariano...) se definirán más adelante, en la futura sección de comida del evento.
            </p>
          )}
          {openForm && (
            <GuestQuestionForm
              event={event}
              initialPrompt={openForm === 'transporte' ? '¿Necesitáis transporte?' : undefined}
              initialOptions={openForm === 'transporte' ? [{ id: null, label: 'Sí' }, { id: null, label: 'No' }] : undefined}
              onCancel={() => setOpenForm(null)}
              onSaved={() => {
                setOpenForm(null)
                onQuestionCreated()
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}

function GuestsDecisionsBlock({
  event,
  onChanged,
  onDerivedDataChanged,
  focusRequest,
}: {
  event: FamilyEvent
  onChanged: () => void
  onDerivedDataChanged: () => void
  focusRequest?: ConfiguratorFocusRequest | null
}) {
  const { localFocus, setLocalFocus, ref: focusRef } = useConfiguratorQuestionFocus(focusRequest)
  const [decisions, setDecisions] = useState<EventDecision[]>([])
  const [guests, setGuests] = useState<EventGuest[]>([])
  const [moments, setMoments] = useState<EventMoment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [costPrompt, setCostPrompt] = useState<{ item: { id: string; category: string }; taskCompleted: boolean } | null>(null)

  function reload(): Promise<void> {
    return Promise.all([listEventDecisions(event.id), listEventGuests(event.id), listEventMoments(event.id)])
      .then(([d, g, m]) => {
        setDecisions(d.filter((x) => x.blockKey === 'invitados'))
        setGuests(g)
        setMoments(m)
      })
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar las decisiones')))
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id])
  // MomentsEditor (bloque hermano "🕊️ Ceremonia y celebración") puede crear/editar/borrar momentos reales
  // mientras este bloque ya está montado — sin esto, "¿Todos los invitados...?" se quedaría con el
  // recuento de momentos que había al abrir la pantalla, sin enterarse de los nuevos (mismo mecanismo que
  // ya usa el propio MomentsEditor para mantener sincronizadas sus dos instancias a la vez).
  useEventMomentsChangeSignal(event.id, reload)

  function findDecision(questionKey: string): EventDecision | undefined {
    return decisions.find((d) => d.questionKey === questionKey)
  }

  function handleEffects(actions: ReconcileAction[], pendingBudgetItem: { id: string; category: string } | null) {
    if (pendingBudgetItem) {
      setCostPrompt({ item: pendingBudgetItem, taskCompleted: actions.some((a) => a.op === 'complete_task') })
      return
    }
    const message = describeEffects(actions)
    if (message) showToast(message)
  }

  async function saveQuestion(questionKey: string, answer: Record<string, unknown>, isCustomOption: boolean, desired: DesiredPairGeneration) {
    setSavingKey(questionKey)
    setError(null)
    try {
      const decision = await upsertEventDecision(event.id, { blockKey: 'invitados', questionKey, answer, isCustomOption })
      const { actions, pendingBudgetItem } = await applyPairDecisionGeneration(event.id, decision.id, desired)
      await reload()
      onDerivedDataChanged()
      handleEffects(actions, pendingBudgetItem)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSavingKey(null)
    }
  }

  // Momentos nunca genera Preparativo/Presupuesto (desired siempre NONE) — solo guarda el enfoque y, si es
  // "todos a todos", asigna de verdad vía setGuestMoments (event_guest_moments es la fuente de la
  // asignación real, la decisión solo guarda la configuración elegida).
  async function saveMomentos(answer: MomentosAnswer) {
    setSavingKey(GUESTS_MOMENTOS_QUESTION_KEY)
    setError(null)
    try {
      await upsertEventDecision(event.id, {
        blockKey: 'invitados',
        questionKey: GUESTS_MOMENTOS_QUESTION_KEY,
        answer: answer as unknown as Record<string, unknown>,
        isCustomOption: answer.choice === 'otro',
      })
      if (answer.choice === 'todos_a_todos') {
        const momentIds = moments.map((m) => m.id)
        await Promise.all(guests.map((g) => setGuestMoments(g, momentIds)))
        notifyEventMomentsChanged(event.id)
      }
      await reload()
      onChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSavingKey(null)
    }
  }

  // Si la respuesta deja de ser "sí" (p.ej. pasa a "no" o "todavía no lo sabemos"), la necesidad de cada
  // ítem accionable (Animación/Monitor) realmente desaparece — hay que reconciliar sus Preparativos/
  // Presupuestos prístinos (nunca dejarlos huérfanos) y borrar también la propia respuesta de necesidades,
  // igual que hace saveNinosNecesidades al desmarcar un ítem.
  async function saveNinos(answer: NinosAnswer) {
    setSavingKey(GUESTS_NINOS_QUESTION_KEY)
    setError(null)
    try {
      await upsertEventDecision(event.id, {
        blockKey: 'invitados',
        questionKey: GUESTS_NINOS_QUESTION_KEY,
        answer: answer as unknown as Record<string, unknown>,
        isCustomOption: answer.choice === 'otro',
      })
      let allActions: ReconcileAction[] = []
      if (answer.choice !== 'si') {
        for (const itemKey of Object.keys(NINOS_NECESIDAD_ACCIONABLE) as NinosNecesidadItemKey[]) {
          const existing = findDecision(guestsNinosNecesidadItemKey(itemKey))
          if (!existing) continue
          const result = await applyPairDecisionGeneration(event.id, existing.id, desiredForNinosNecesidadItem(false, itemKey))
          allActions = [...allActions, ...result.actions]
          await deleteEventDecision(existing.id)
        }
        const necesidades = findDecision(GUESTS_NINOS_NECESIDADES_QUESTION_KEY)
        if (necesidades) await deleteEventDecision(necesidades.id)
      }
      await reload()
      if (allActions.length > 0) onDerivedDataChanged()
      handleEffects(allActions, null)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSavingKey(null)
    }
  }

  // Cada necesidad accionable (Animación/Monitor) se reconcilia como su propia sub-decisión — el simple
  // hecho de marcarla YA es "hay que buscarlo/contratarlo" (nunca existe un "ya lo tenemos" con sentido
  // para un animador o un monitor), así que un único nivel por ítem es fiel a la petición. Menú
  // infantil/Zona o mesa se guardan en la propia respuesta pero no generan nada todavía (alimentarán
  // fases futuras de Menú/Distribución).
  async function saveNinosNecesidades(answer: NinosNecesidadesAnswer) {
    setSavingKey(GUESTS_NINOS_NECESIDADES_QUESTION_KEY)
    setError(null)
    try {
      await upsertEventDecision(event.id, { blockKey: 'invitados', questionKey: GUESTS_NINOS_NECESIDADES_QUESTION_KEY, answer: answer as unknown as Record<string, unknown>, isCustomOption: false })
      let allActions: ReconcileAction[] = []
      let pendingBudgetItem: { id: string; category: string } | null = null
      for (const itemKey of Object.keys(NINOS_NECESIDAD_ACCIONABLE) as NinosNecesidadItemKey[]) {
        const meta = NINOS_NECESIDAD_ACCIONABLE[itemKey]
        const selected = answer.choice === 'preparar' && answer.selected.includes(meta.label)
        const subKey = guestsNinosNecesidadItemKey(itemKey)
        if (!selected) {
          const existing = findDecision(subKey)
          if (existing) {
            const result = await applyPairDecisionGeneration(event.id, existing.id, desiredForNinosNecesidadItem(false, itemKey))
            allActions = [...allActions, ...result.actions]
            await deleteEventDecision(existing.id)
          }
          continue
        }
        const subDecision = await upsertEventDecision(event.id, { blockKey: 'invitados', questionKey: subKey, answer: { selected: true }, isCustomOption: false })
        const result = await applyPairDecisionGeneration(event.id, subDecision.id, desiredForNinosNecesidadItem(true, itemKey))
        allActions = [...allActions, ...result.actions]
        pendingBudgetItem = result.pendingBudgetItem ?? pendingBudgetItem
      }
      await reload()
      onDerivedDataChanged()
      handleEffects(allActions, pendingBudgetItem)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSavingKey(null)
    }
  }

  if (loading) return null
  const realMoments = moments.filter((m) => !m.isLegacy)
  const momentsCount = hasRealMoments(resolveEventMoments(event, realMoments)) ? realMoments.length : 0
  const summary = summarizeGuestsBlock(decisions, momentsCount)
  const decisionSummary = buildGuestsDecisionSummary(decisions, momentsCount)
  const ninosDecision = findDecision(GUESTS_NINOS_QUESTION_KEY)
  const ninos = ninosDecision?.answer as unknown as NinosAnswer | undefined
  const necesidadesDecision = findDecision(GUESTS_NINOS_NECESIDADES_QUESTION_KEY)
  const necesidadesExisting = necesidadesDecision?.answer as unknown as NinosNecesidadesAnswer | undefined

  return (
    <div ref={focusRef} className="card" style={{ padding: 8 }}>
      {summary && (
        <p className="muted" style={{ fontSize: 13, margin: '0 0 6px' }}>
          {summary}
        </p>
      )}
      <DecisionSummaryDetails summary={decisionSummary} onSelect={setLocalFocus} />
      {error && <p className="error">{error}</p>}
      {questionIsVisible(localFocus, GUESTS_LISTA_QUESTION_KEY) && (
        <CustomAwareQuestion
          event={event}
          questionLabel="¿Tenéis clara la lista de invitados?"
          options={LISTA_OPTIONS}
          questionKey={GUESTS_LISTA_QUESTION_KEY}
          decision={findDecision(GUESTS_LISTA_QUESTION_KEY)}
          savingKey={savingKey}
          onSave={(answer) => saveQuestion(GUESTS_LISTA_QUESTION_KEY, answer as unknown as Record<string, unknown>, answer.choice === 'otro', desiredForListaInvitados(answer as ListaInvitadosAnswer))}
        />
      )}
      {questionIsVisible(localFocus, GUESTS_PREGUNTAS_QUESTION_KEY) && (
        <InvitadosPreguntasQuestion
          event={event}
          existing={findDecision(GUESTS_PREGUNTAS_QUESTION_KEY)?.answer as unknown as InvitadosPreguntasAnswer | undefined}
          saving={savingKey === GUESTS_PREGUNTAS_QUESTION_KEY}
          onSave={(answer) =>
            saveQuestion(GUESTS_PREGUNTAS_QUESTION_KEY, answer as unknown as Record<string, unknown>, false, desiredForInvitadosPreguntas(answer))
          }
          onQuestionCreated={() => showToast('✓ Pregunta guardada')}
        />
      )}
      {momentsCount >= 2 && questionIsVisible(localFocus, GUESTS_MOMENTOS_QUESTION_KEY) && (
        <CustomAwareQuestion
          event={event}
          questionLabel="¿Todos los invitados irán a todos los momentos?"
          options={MOMENTOS_OPTIONS}
          questionKey={GUESTS_MOMENTOS_QUESTION_KEY}
          decision={findDecision(GUESTS_MOMENTOS_QUESTION_KEY)}
          savingKey={savingKey}
          onSave={(answer) => saveMomentos(answer as MomentosAnswer)}
        />
      )}
      {questionIsVisible(localFocus, GUESTS_NINOS_QUESTION_KEY) && (
        <CustomAwareQuestion
          event={event}
          questionLabel="¿Vendrán niños?"
          options={NINOS_OPTIONS}
          questionKey={GUESTS_NINOS_QUESTION_KEY}
          decision={ninosDecision}
          savingKey={savingKey}
          onSave={(answer) => saveNinos(answer as NinosAnswer)}
        />
      )}
      {ninos?.choice === 'si' && questionIsVisible(localFocus, GUESTS_NINOS_NECESIDADES_QUESTION_KEY) && (
        <NinosNecesidadesQuestion existing={necesidadesExisting} saving={savingKey === GUESTS_NINOS_NECESIDADES_QUESTION_KEY} onSave={saveNinosNecesidades} />
      )}
      {questionIsVisible(localFocus, GUESTS_INVITACION_QUESTION_KEY) && (
        <CustomAwareQuestion
          event={event}
          questionLabel="¿Cómo vais a gestionar la invitación?"
          options={INVITACION_OPTIONS}
          questionKey={GUESTS_INVITACION_QUESTION_KEY}
          decision={findDecision(GUESTS_INVITACION_QUESTION_KEY)}
          savingKey={savingKey}
          onSave={(answer) => saveQuestion(GUESTS_INVITACION_QUESTION_KEY, answer as unknown as Record<string, unknown>, answer.choice === 'otro', desiredForInvitacion(answer as InvitacionAnswer))}
        />
      )}
      {localFocus && (
        <button type="button" className="link-button" onClick={() => setLocalFocus(null)} style={{ marginTop: 6 }}>
          Ver todas las preguntas
        </button>
      )}
      {costPrompt && (
        <BudgetAmountPromptModal
          item={costPrompt.item}
          onClose={() => {
            if (costPrompt.taskCompleted) showToast(TASK_COMPLETED_MESSAGE)
            setCostPrompt(null)
          }}
          onSaved={() => {
            showToast(costPrompt.taskCompleted ? TASK_COMPLETED_AND_BUDGET_UPDATED_MESSAGE : BUDGET_UPDATED_MESSAGE)
            onDerivedDataChanged()
            setCostPrompt(null)
          }}
        />
      )}
    </div>
  )
}

// Mismo patrón exacto que ComplementosQuestion (revelado único, multi-selección + "Otro" en texto libre) —
// solo dos de las cuatro opciones (Animación/Monitor) implican buscar/contratar algo; Menú infantil y
// Zona o mesa se guardan igual pero no generan ningún Preparativo todavía.
function NinosNecesidadesQuestion({
  existing,
  saving,
  onSave,
}: {
  existing: NinosNecesidadesAnswer | undefined
  saving: boolean
  onSave: (answer: NinosNecesidadesAnswer) => void
}) {
  const [draft, setDraft] = useState<NinosNecesidadesAnswer | null>(null)
  const current = draft ?? existing
  const [customInput, setCustomInput] = useState('')

  function selectChoice(choice: NinosNecesidadesAnswer['choice']) {
    if (choice === 'preparar') {
      setDraft({ choice, selected: current?.selected ?? [], customItems: current?.customItems ?? [] })
      return
    }
    setDraft(null)
    onSave({ choice, selected: [], customItems: [] })
  }
  function toggleSelected(item: string) {
    const selected = current?.selected ?? []
    const next = { choice: 'preparar' as const, selected: selected.includes(item) ? selected.filter((x) => x !== item) : [...selected, item], customItems: current?.customItems ?? [] }
    setDraft(next)
    onSave(next)
  }
  function addCustom() {
    if (!customInput.trim()) return
    const next = { choice: 'preparar' as const, selected: current?.selected ?? [], customItems: [...(current?.customItems ?? []), customInput.trim()] }
    setDraft(next)
    onSave(next)
    setCustomInput('')
  }
  function removeCustom(item: string) {
    const next = { choice: 'preparar' as const, selected: current?.selected ?? [], customItems: (current?.customItems ?? []).filter((x) => x !== item) }
    setDraft(next)
    onSave(next)
  }

  return (
    <div style={{ marginTop: 6 }}>
      <div className="muted" style={{ fontSize: 13 }}>
        ¿Necesitáis prever algo especial para los niños?
      </div>
      <ChoiceRow options={NINOS_NECESIDADES_CHOICE_OPTIONS} value={current?.choice} disabled={saving} onSelect={selectChoice} />
      {current?.choice === 'preparar' && (
        <>
          <div className="filter-row" style={{ flexWrap: 'wrap', marginTop: 4 }}>
            {NINOS_NECESIDADES_OPTIONS.map((o) => (
              <button key={o} type="button" className={'chip' + ((current.selected ?? []).includes(o) ? ' chip-active' : '')} disabled={saving} onClick={() => toggleSelected(o)}>
                {o}
              </button>
            ))}
            {(current.customItems ?? []).map((o) => (
              <button key={o} type="button" className="chip chip-active" disabled={saving} onClick={() => removeCustom(o)}>
                {o} ✕
              </button>
            ))}
          </div>
          <div className="inline-fields" style={{ marginTop: 4 }}>
            <input type="text" value={customInput} placeholder="Otra necesidad" disabled={saving} onChange={(e) => setCustomInput(e.target.value)} />
            <button type="button" className="link-button" disabled={saving || !customInput.trim()} onClick={addCustom}>
              + Añadir
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// "🎉 Momentos especiales" (fase 5, reajustada) — selección múltiple sobre un catálogo fijo por tipo de
// evento (domain/eventSpecialMoments.ts), nunca genera nada por sí sola; solo "Primer baile" (boda) revela
// la única pregunta contextual de esta fase ("¿Necesitáis clases de baile?"), que sí puede generar un
// Preparativo (nunca presupuesto ni proveedor). No crea ni toca event_moments.
// ---------------------------------------------------------------------

const CLASES_BAILE_OPTIONS: { value: ClasesBaileChoice; label: string }[] = [
  { value: 'si', label: 'Sí' },
  { value: 'no', label: 'No' },
  { value: 'todavia_no_lo_sabemos', label: 'Todavía no lo sabemos' },
]

function MomentosEspecialesQuestion({
  catalog,
  existing,
  saving,
  onSave,
}: {
  catalog: MomentoEspecialCatalogItem[]
  existing: MomentosEspecialesAnswer | undefined
  saving: boolean
  onSave: (answer: MomentosEspecialesAnswer) => void
}) {
  const [draft, setDraft] = useState<MomentosEspecialesAnswer | null>(null)
  const current = draft ?? existing
  const [customInput, setCustomInput] = useState('')
  const isTerminal = current?.choice === 'ninguno' || current?.choice === 'todavia_no_lo_sabemos'

  function toggleSelected(key: MomentoEspecialKey) {
    const selected = current?.selected ?? []
    const next: MomentosEspecialesAnswer = {
      choice: 'seleccionar',
      selected: selected.includes(key) ? selected.filter((x) => x !== key) : [...selected, key],
      customItems: isTerminal ? [] : current?.customItems ?? [],
    }
    setDraft(next)
    onSave(next)
  }
  function addCustom() {
    if (!customInput.trim()) return
    const next: MomentosEspecialesAnswer = { choice: 'seleccionar', selected: current?.selected ?? [], customItems: [...(current?.customItems ?? []), customInput.trim()] }
    setDraft(next)
    onSave(next)
    setCustomInput('')
  }
  function removeCustom(item: string) {
    const next: MomentosEspecialesAnswer = { choice: 'seleccionar', selected: current?.selected ?? [], customItems: (current?.customItems ?? []).filter((x) => x !== item) }
    setDraft(next)
    onSave(next)
  }
  function selectTerminal(choice: 'ninguno' | 'todavia_no_lo_sabemos') {
    const next: MomentosEspecialesAnswer = { choice, selected: [], customItems: [] }
    setDraft(next)
    onSave(next)
  }

  return (
    <div style={{ marginTop: 6 }}>
      <div className="muted" style={{ fontSize: 13 }}>
        ¿Qué momentos especiales queréis incluir?
      </div>
      <div className="filter-row" style={{ flexWrap: 'wrap', marginTop: 4 }}>
        {catalog.map((item) => (
          <button
            key={item.key}
            type="button"
            className={'chip' + (!isTerminal && (current?.selected ?? []).includes(item.key) ? ' chip-active' : '')}
            disabled={saving}
            onClick={() => toggleSelected(item.key)}
          >
            {item.label}
          </button>
        ))}
        {!isTerminal &&
          (current?.customItems ?? []).map((item) => (
            <button key={item} type="button" className="chip chip-active" disabled={saving} onClick={() => removeCustom(item)}>
              {item} ✕
            </button>
          ))}
      </div>
      {!isTerminal && (
        <div className="inline-fields" style={{ marginTop: 4 }}>
          <input type="text" value={customInput} placeholder="Otro momento especial" disabled={saving} onChange={(e) => setCustomInput(e.target.value)} />
          <button type="button" className="link-button" disabled={saving || !customInput.trim()} onClick={addCustom}>
            + Añadir
          </button>
        </div>
      )}
      <div className="filter-row" style={{ flexWrap: 'wrap', marginTop: 4 }}>
        <button
          type="button"
          className={'chip' + (current?.choice === 'todavia_no_lo_sabemos' ? ' chip-active' : '')}
          disabled={saving}
          onClick={() => selectTerminal('todavia_no_lo_sabemos')}
        >
          Todavía no lo sabemos
        </button>
        <button type="button" className={'chip' + (current?.choice === 'ninguno' ? ' chip-active' : '')} disabled={saving} onClick={() => selectTerminal('ninguno')}>
          Ninguno en especial
        </button>
      </div>
    </div>
  )
}

function ClasesBaileQuestion({ existing, saving, onSave }: { existing: ClasesBaileAnswer | undefined; saving: boolean; onSave: (answer: ClasesBaileAnswer) => void }) {
  return (
    <div style={{ marginTop: 6 }}>
      <div className="muted" style={{ fontSize: 13 }}>
        ¿Necesitáis clases de baile?
      </div>
      <ChoiceRow options={CLASES_BAILE_OPTIONS} value={existing?.choice} disabled={saving} onSelect={(choice) => onSave({ choice })} />
    </div>
  )
}

const CANCION_PRIMER_BAILE_OPTIONS: { value: CancionPrimerBaileChoice; label: string }[] = [
  { value: 'si', label: 'Sí' },
  { value: 'todavia_no_lo_sabemos', label: 'Todavía no' },
  { value: 'sin_cancion_concreta', label: 'No queremos elegir una canción concreta' },
]

// A2 — título/artista solo se piden (y solo se guardan) con choice==='si', y son opcionales de verdad:
// se puede guardar "Sí" sin rellenarlos todavía. Campos de texto libres, PEPA nunca sugiere ni completa.
function CancionPrimerBaileQuestion({
  existing,
  saving,
  onSave,
}: {
  existing: CancionPrimerBaileAnswer | undefined
  saving: boolean
  onSave: (answer: CancionPrimerBaileAnswer) => void
}) {
  const [titulo, setTitulo] = useState(existing?.titulo ?? '')
  const [artista, setArtista] = useState(existing?.artista ?? '')
  return (
    <div style={{ marginTop: 6 }}>
      <div className="muted" style={{ fontSize: 13 }}>
        ¿Tenéis clara la canción del primer baile?
      </div>
      <ChoiceRow
        options={CANCION_PRIMER_BAILE_OPTIONS}
        value={existing?.choice}
        disabled={saving}
        onSelect={(choice) => onSave(choice === 'si' ? { choice, titulo: titulo || null, artista: artista || null } : { choice })}
      />
      {existing?.choice === 'si' && (
        <div className="inline-fields" style={{ marginTop: 4 }}>
          <input
            type="text"
            value={titulo}
            placeholder="Título (opcional)"
            disabled={saving}
            onChange={(e) => setTitulo(e.target.value)}
            onBlur={() => onSave({ choice: 'si', titulo: titulo || null, artista: artista || null })}
          />
          <input
            type="text"
            value={artista}
            placeholder="Artista (opcional)"
            disabled={saving}
            onChange={(e) => setArtista(e.target.value)}
            onBlur={() => onSave({ choice: 'si', titulo: titulo || null, artista: artista || null })}
          />
        </div>
      )}
    </div>
  )
}

function MomentosEspecialesBlock({
  event,
  onDerivedDataChanged,
  focusRequest,
}: {
  event: FamilyEvent
  onDerivedDataChanged: () => void
  // Fase 1.1/1.2 (plan de pendientes) — ver useConfiguratorQuestionFocus.ts.
  focusRequest?: ConfiguratorFocusRequest | null
}) {
  const { localFocus, setLocalFocus, ref: focusRef } = useConfiguratorQuestionFocus(focusRequest)
  const [decisions, setDecisions] = useState<EventDecision[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  function reload(): Promise<void> {
    return listEventDecisions(event.id)
      .then((d) => setDecisions(d.filter((x) => x.blockKey === 'momentos_especiales')))
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar las decisiones')))
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id])

  function findDecision(questionKey: string): EventDecision | undefined {
    return decisions.find((d) => d.questionKey === questionKey)
  }

  // Si "Primer baile" deja de estar seleccionado, la necesidad de clases de baile realmente desaparece —
  // reconciliar su Preparativo prístino (nunca dejarlo huérfano) y borrar la propia sub-decisión, mismo
  // criterio que saveNinos con las necesidades accionables cuando "¿Vendrán niños?" deja de ser "sí".
  async function saveSeleccion(answer: MomentosEspecialesAnswer) {
    setSavingKey(MOMENTOS_ESPECIALES_QUESTION_KEY)
    setError(null)
    try {
      await upsertEventDecision(event.id, {
        blockKey: 'momentos_especiales',
        questionKey: MOMENTOS_ESPECIALES_QUESTION_KEY,
        answer: answer as unknown as Record<string, unknown>,
        isCustomOption: false,
      })
      let allActions: ReconcileAction[] = []
      if (!answer.selected.includes('primer_baile')) {
        const existing = findDecision(CLASES_BAILE_QUESTION_KEY)
        if (existing) {
          const result = await applyPairDecisionGeneration(event.id, existing.id, desiredForClasesBaile(undefined))
          allActions = [...allActions, ...result.actions]
          await deleteEventDecision(existing.id)
        }
      }
      await reload()
      if (allActions.length > 0) onDerivedDataChanged()
      const message = describeEffects(allActions)
      if (message) showToast(message)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSavingKey(null)
    }
  }

  async function saveClasesBaile(answer: ClasesBaileAnswer) {
    setSavingKey(CLASES_BAILE_QUESTION_KEY)
    setError(null)
    try {
      const decision = await upsertEventDecision(event.id, {
        blockKey: 'momentos_especiales',
        questionKey: CLASES_BAILE_QUESTION_KEY,
        answer: answer as unknown as Record<string, unknown>,
        isCustomOption: false,
      })
      const { actions } = await applyPairDecisionGeneration(event.id, decision.id, desiredForClasesBaile(answer))
      await reload()
      if (actions.length > 0) onDerivedDataChanged()
      const message = describeEffects(actions)
      if (message) showToast(message)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSavingKey(null)
    }
  }

  // A2 (tanda del configurador de boda) — puramente informativa (desiredForCancionPrimerBaile es
  // siempre NONE); se llama igual a applyPairDecisionGeneration por coherencia con el resto del motor.
  // A diferencia de saveSeleccion con CLASES_BAILE_QUESTION_KEY, NUNCA se borra esta decisión al
  // desmarcar "Primer baile" — listMomentosEspecialesBlockQuestions ya la oculta sin tocar sus datos.
  async function saveCancionPrimerBaile(answer: CancionPrimerBaileAnswer) {
    setSavingKey(CANCION_PRIMER_BAILE_QUESTION_KEY)
    setError(null)
    try {
      const decision = await upsertEventDecision(event.id, {
        blockKey: 'momentos_especiales',
        questionKey: CANCION_PRIMER_BAILE_QUESTION_KEY,
        answer: answer as unknown as Record<string, unknown>,
        isCustomOption: false,
      })
      const { actions } = await applyPairDecisionGeneration(event.id, decision.id, desiredForCancionPrimerBaile(answer))
      await reload()
      if (actions.length > 0) onDerivedDataChanged()
      const message = describeEffects(actions)
      if (message) showToast(message)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSavingKey(null)
    }
  }

  if (loading) return null
  const seleccionDecision = findDecision(MOMENTOS_ESPECIALES_QUESTION_KEY)
  const seleccion = seleccionDecision?.answer as unknown as MomentosEspecialesAnswer | undefined
  const catalog = MOMENTOS_ESPECIALES_CATALOG[event.type]
  const clasesBaileDecision = findDecision(CLASES_BAILE_QUESTION_KEY)
  const clasesBaile = clasesBaileDecision?.answer as unknown as ClasesBaileAnswer | undefined
  const cancionDecision = findDecision(CANCION_PRIMER_BAILE_QUESTION_KEY)
  const cancion = cancionDecision?.answer as unknown as CancionPrimerBaileAnswer | undefined
  const summary = summarizeMomentosEspecialesBlock(decisions)
  const decisionSummary = buildMomentosEspecialesDecisionSummary(decisions)

  return (
    <div ref={focusRef} className="card" style={{ padding: 8 }}>
      {summary && (
        <p className="muted" style={{ fontSize: 13, margin: '0 0 6px' }}>
          {summary}
        </p>
      )}
      <DecisionSummaryDetails summary={decisionSummary} onSelect={setLocalFocus} />
      {error && <p className="error">{error}</p>}
      {questionIsVisible(localFocus, MOMENTOS_ESPECIALES_QUESTION_KEY) && (
        <MomentosEspecialesQuestion catalog={catalog} existing={seleccion} saving={savingKey === MOMENTOS_ESPECIALES_QUESTION_KEY} onSave={saveSeleccion} />
      )}
      {questionIsVisible(localFocus, CLASES_BAILE_QUESTION_KEY) && seleccion?.selected.includes('primer_baile') && (
        <ClasesBaileQuestion existing={clasesBaile} saving={savingKey === CLASES_BAILE_QUESTION_KEY} onSave={saveClasesBaile} />
      )}
      {questionIsVisible(localFocus, CANCION_PRIMER_BAILE_QUESTION_KEY) && seleccion?.selected.includes('primer_baile') && (
        <CancionPrimerBaileQuestion existing={cancion} saving={savingKey === CANCION_PRIMER_BAILE_QUESTION_KEY} onSave={saveCancionPrimerBaile} />
      )}
      {localFocus && (
        <button type="button" className="link-button" onClick={() => setLocalFocus(null)} style={{ marginTop: 6 }}>
          Ver todas las preguntas
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// "🍽️ Comida y bebida" — sexto bloque del configurador. Mismo motor de decisiones que el resto
// (event_decisions + DesiredPairGeneration + reconcilePairGeneration), ver src/domain/eventFood.ts. PEPA da
// estructura, conexiones y recordatorios, pero NO decide por la familia: nunca inventa recetas, cantidades,
// raciones, proveedores, precios ni necesidades. Lo que ya sabe (lugar y sus servicios, niños, elección de
// menú, Momentos especiales) lo hereda y lo muestra como contexto, sin volver a preguntarlo.
// ---------------------------------------------------------------------

const FOOD_QUIEN_OPTIONS: { value: QuienChoice; label: string }[] = [
  { value: 'catering', label: '🚚 Catering' },
  { value: 'restaurante', label: '🍴 Restaurante / empresa externa' },
  { value: 'nosotros', label: '👩‍🍳 La preparamos nosotros' },
  { value: 'combinar', label: '🔀 Combinaremos varias opciones' },
  { value: 'no_habra', label: '🚫 No habrá comida' },
  { value: 'todavia_no_lo_sabemos', label: '⏳ Todavía no lo sabemos' },
  { value: 'otro', label: '✏️ Otro' },
]

const FOOD_QUIEN_WAY_OPTIONS: { value: QuienWay; label: string }[] = [
  { value: 'catering', label: '🚚 Catering' },
  { value: 'restaurante', label: '🍴 Restaurante / empresa externa' },
  { value: 'nosotros', label: '👩‍🍳 Prepararemos parte nosotros' },
]

const FOOD_CONTRATACION_OPTIONS: { value: ContratacionChoice; label: string }[] = [
  { value: 'si', label: 'Sí' },
  { value: 'buscando', label: 'Lo estamos buscando' },
  { value: 'todavia_no_lo_sabemos', label: 'Todavía no lo sabemos' },
  { value: 'otro', label: 'Otro' },
]

const FOOD_MENU_ESTADO_OPTIONS: { value: MenuEstadoChoice; label: string }[] = [
  { value: 'decidido', label: 'Sí, ya está decidido' },
  { value: 'por_decidir', label: 'Tenemos que decidirlo' },
  { value: 'todavia_no_lo_sabemos', label: 'Todavía no lo sabemos' },
]

const FOOD_GUARDAR_OPTIONS: { value: GuardarMenuChoice; label: string }[] = [
  { value: 'si', label: 'Sí' },
  { value: 'ahora_no', label: 'Ahora no' },
]

const FOOD_MENU_INFANTIL_OPTIONS: { value: MenuInfantilChoice; label: string }[] = [
  { value: 'mismo_menu', label: 'Mismo menú' },
  { value: 'menu_infantil', label: 'Menú infantil (sus platos van en Menú del evento)' },
  { value: 'alternativa', label: 'Alternativa concreta' },
  { value: 'incluido', label: 'Incluido por restaurante/catering' },
  { value: 'todavia_no_lo_sabemos', label: 'Todavía no decidido' },
  { value: 'otro', label: 'Otro' },
  // Respuestas anteriores: se siguen mostrando para no perder lo que ya habíais elegido.
  { value: 'pedir', label: 'Tenemos que pedirlo (anterior)' },
  { value: 'nosotros', label: 'Lo prepararemos nosotros (anterior)' },
]

const FOOD_TARTA_OPTIONS: { value: TartaChoice; label: string }[] = [
  { value: 'encargar', label: 'Sí, la encargaremos' },
  { value: 'nosotros', label: 'Sí, la prepararemos nosotros' },
  { value: 'resuelta', label: 'Sí, ya la tenemos resuelta' },
  { value: 'no', label: 'No' },
  { value: 'todavia_no_lo_sabemos', label: 'Todavía no lo sabemos' },
  { value: 'otro', label: 'Otro' },
]

const FOOD_BEBIDAS_OPTIONS: { value: BebidasChoice; label: string }[] = [
  { value: 'servicio_comida', label: 'Las incluye el servicio de comida' },
  { value: 'nosotros', label: 'Las compramos/preparamos nosotros' },
  { value: 'aparte', label: 'Las encargaremos aparte' },
  { value: 'todavia_no_lo_sabemos', label: 'Todavía no lo sabemos' },
  { value: 'otro', label: 'Otro' },
]

function FoodInheritedLine({ children }: { children: ReactNode }) {
  return <p style={{ fontSize: 13, margin: '6px 0 0' }}>{children}</p>
}

// «Resumen de decisiones» — misma forma plegable en los cinco bloques del configurador (Comida y bebida,
// Celebración, La pareja, Invitados, Momentos especiales). Nunca es una fuente de verdad: solo muestra lo
// que ya calculó buildXDecisionSummary a partir de las decisiones reales.
// Fase 1.2 (plan de pendientes) — cada entrada del resumen es ahora un enlace a su propia pregunta: pulsarla
// aísla esa pregunta (ver focusedKey en cada bloque XxxBlock) y hace scroll hasta ella, sin perder las demás
// respuestas ya guardadas. onSelect es opcional para no romper ningún otro sitio que todavía renderice este
// resumen de solo lectura (no hay ninguno hoy, pero mantiene el componente utilizable sin forzar el callback).
function DecisionSummaryDetails({ summary, onSelect }: { summary: DecisionSummary; onSelect?: (key: string) => void }) {
  if (summary.taken.length === 0 && summary.pending.length === 0) return null
  function Row({ item, icon, statusLabel }: { item: DecisionSummaryItem; icon: string; statusLabel: string }) {
    const content = (
      <>
        {icon} {item.text} · {statusLabel} {onSelect && '→'}
      </>
    )
    return onSelect ? (
      <button type="button" className="link-button" style={{ display: 'block', textAlign: 'left', padding: 0 }} onClick={() => onSelect(item.key)}>
        {content}
      </button>
    ) : (
      <div>{content}</div>
    )
  }
  return (
    <details style={{ fontSize: 13, margin: '0 0 6px' }}>
      <summary className="muted">Resumen de decisiones</summary>
      {summary.taken.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>DECISIONES TOMADAS</div>
          {summary.taken.map((item) => (
            <Row key={item.key} item={item} icon="✓" statusLabel={item.statusLabel ?? 'Resuelto'} />
          ))}
        </div>
      )}
      {summary.pending.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>POR DECIDIR</div>
          {summary.pending.map((item) => (
            <Row key={item.key} item={item} icon="○" statusLabel={item.statusLabel ?? 'Pendiente'} />
          ))}
        </div>
      )}
    </details>
  )
}

// «¿Qué incluye el lugar contratado?» — información TRANSVERSAL del lugar (no exclusiva de comida).
// «Ninguno» es incompatible con cualquier servicio; «Otro» es texto libre que nunca se interpreta.
function VenueServicesQuestion({
  label,
  existing,
  fromLegacy,
  legacyOnly,
  saving,
  onSave,
}: {
  label: string
  existing: VenueServicesAnswer | undefined
  // true = la respuesta efectiva viene del alta antigua (events.included_services): es información que ya
  // teníamos, no una sugerencia — se muestra como seleccionada, sin pedir ningún clic.
  fromLegacy: boolean
  legacyOnly: string[]
  saving: boolean
  onSave: (answer: VenueServicesAnswer) => void
}) {
  const [customInput, setCustomInput] = useState('')
  const isTerminal = existing?.choice === 'ninguno' || existing?.choice === 'todavia_no_lo_sabemos'
  const selected = existing?.choice === 'seleccionar' ? existing.selected : []
  const customItems = existing?.choice === 'seleccionar' ? existing.customItems : []

  function addCustom() {
    const text = customInput.trim()
    if (!text) return
    onSave(withVenueServiceCustomItems(existing, [...customItems, text]))
    setCustomInput('')
  }

  return (
    <div style={{ marginTop: 6 }}>
      <div className="muted" style={{ fontSize: 13 }}>
        {label}
      </div>
      {fromLegacy && existing && (
        <p style={{ fontSize: 13, margin: '2px 0' }}>
          ✓ Información que ya teníamos del evento: {existing.selected.map((k) => `${VENUE_SERVICES.find((x) => x.key === k)?.icon ?? ''} ${venueServiceLabel(k)}`).join(' · ')}
          {legacyOnly.length > 0 ? ` (y también ${legacyOnly.join(', ')})` : ''}
        </p>
      )}
      <div className="filter-row" style={{ flexWrap: 'wrap', marginTop: 4 }}>
        {VENUE_SERVICES.map((s) => (
          <button
            key={s.key}
            type="button"
            className={'chip' + (selected.includes(s.key) ? ' chip-active' : '')}
            disabled={saving}
            onClick={() => onSave(toggleVenueService(existing, s.key))}
          >
            {s.icon} {s.label}
          </button>
        ))}
        {customItems.map((item) => (
          <button key={item} type="button" className="chip chip-active" disabled={saving} onClick={() => onSave(withVenueServiceCustomItems(existing, customItems.filter((x) => x !== item)))}>
            ✏️ {item} ✕
          </button>
        ))}
      </div>
      <div className="inline-fields" style={{ marginTop: 4 }}>
        <input type="text" value={customInput} placeholder="✏️ Otro servicio" disabled={saving} onChange={(e) => setCustomInput(e.target.value)} />
        <button type="button" className="link-button" disabled={saving || !customInput.trim()} onClick={addCustom}>
          + Añadir
        </button>
      </div>
      <div className="filter-row" style={{ flexWrap: 'wrap', marginTop: 4 }}>
        <button type="button" className={'chip' + (existing?.choice === 'ninguno' ? ' chip-active' : '')} disabled={saving} onClick={() => onSave(withVenueServicesNinguno())}>
          🚫 Ninguno
        </button>
        <button
          type="button"
          className={'chip' + (existing?.choice === 'todavia_no_lo_sabemos' ? ' chip-active' : '')}
          disabled={saving}
          onClick={() => onSave(withVenueServicesUnknown())}
        >
          ⏳ Todavía no lo sabemos
        </button>
      </div>
      {isTerminal && existing?.choice === 'ninguno' && <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>Anotado: el lugar no incluye ningún servicio.</p>}
    </div>
  )
}

function FoodQuienQuestion({ existing, saving, onSave }: { existing: QuienAnswer | undefined; saving: boolean; onSave: (answer: QuienAnswer) => void }) {
  const [labelDraft, setLabelDraft] = useState<string | null>(null)

  function select(choice: QuienChoice) {
    if (choice === 'otro') {
      setLabelDraft(existing?.customLabel ?? '')
      return
    }
    setLabelDraft(null)
    onSave(choice === 'combinar' ? { choice, combinar: existing?.combinar ?? [] } : { choice })
  }
  function toggleWay(way: QuienWay) {
    const current = existing?.combinar ?? []
    onSave({ choice: 'combinar', combinar: current.includes(way) ? current.filter((w) => w !== way) : [...current, way] })
  }

  const showOtro = labelDraft !== null || existing?.choice === 'otro'
  return (
    <div style={{ marginTop: 6 }}>
      <div className="muted" style={{ fontSize: 13 }}>
        ¿Quién se encargará de la comida?
      </div>
      <ChoiceRow options={FOOD_QUIEN_OPTIONS} value={labelDraft !== null ? 'otro' : existing?.choice} disabled={saving} onSelect={select} />
      {existing?.choice === 'combinar' && labelDraft === null && (
        <>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            ¿Qué vías combinaréis? (marcarlas no crea ningún trabajo por sí solo)
          </div>
          <div className="filter-row" style={{ flexWrap: 'wrap' }}>
            {FOOD_QUIEN_WAY_OPTIONS.map((o) => (
              <button key={o.value} type="button" className={'chip' + ((existing.combinar ?? []).includes(o.value) ? ' chip-active' : '')} disabled={saving} onClick={() => toggleWay(o.value)}>
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
      {showOtro && (
        <div className="inline-fields" style={{ marginTop: 4 }}>
          <input type="text" value={labelDraft ?? existing?.customLabel ?? ''} placeholder="¿Quién o cómo?" disabled={saving} onChange={(e) => setLabelDraft(e.target.value)} />
          <button
            type="button"
            className="link-button"
            disabled={saving || !(labelDraft ?? existing?.customLabel ?? '').trim()}
            onClick={() => {
              onSave({ choice: 'otro', customLabel: (labelDraft ?? existing?.customLabel ?? '').trim() })
              setLabelDraft(null)
            }}
          >
            Guardar
          </button>
        </div>
      )}
    </div>
  )
}

function FoodMomentosQuestion({
  catalog,
  existing,
  saving,
  onSave,
}: {
  catalog: MomentoComidaDef[]
  existing: MomentosComidaAnswer | undefined
  saving: boolean
  onSave: (answer: MomentosComidaAnswer) => void
}) {
  const [customInput, setCustomInput] = useState('')
  const isTerminal = existing?.choice === 'todavia_no_lo_sabemos'
  const selected = existing?.choice === 'seleccionar' ? existing.selected : []
  const customItems = existing?.choice === 'seleccionar' ? existing.customItems : []

  return (
    <div style={{ marginTop: 6 }}>
      <div className="muted" style={{ fontSize: 13 }}>
        ¿Qué momentos de comida habrá?
      </div>
      <div className="filter-row" style={{ flexWrap: 'wrap', marginTop: 4 }}>
        {catalog.map((m) => (
          <button
            key={m.key}
            type="button"
            className={'chip' + (selected.includes(m.key) ? ' chip-active' : '')}
            disabled={saving}
            onClick={() => onSave({ choice: 'seleccionar', selected: selected.includes(m.key) ? selected.filter((k) => k !== m.key) : [...selected, m.key], customItems })}
          >
            {m.label}
          </button>
        ))}
        {customItems.map((item) => (
          <button key={item} type="button" className="chip chip-active" disabled={saving} onClick={() => onSave({ choice: 'seleccionar', selected, customItems: customItems.filter((x) => x !== item) })}>
            {item} ✕
          </button>
        ))}
        <button type="button" className={'chip' + (isTerminal ? ' chip-active' : '')} disabled={saving} onClick={() => onSave({ choice: 'todavia_no_lo_sabemos', selected: [], customItems: [] })}>
          Todavía no lo sabemos
        </button>
      </div>
      {!isTerminal && (
        <div className="inline-fields" style={{ marginTop: 4 }}>
          <input type="text" value={customInput} placeholder="Otro momento" disabled={saving} onChange={(e) => setCustomInput(e.target.value)} />
          <button
            type="button"
            className="link-button"
            disabled={saving || !customInput.trim()}
            onClick={() => {
              onSave({ choice: 'seleccionar', selected, customItems: [...customItems, customInput.trim()] })
              setCustomInput('')
            }}
          >
            + Añadir
          </button>
        </div>
      )}
    </div>
  )
}

// «¿Quieres guardar el menú en PEPA?» → Sí → el menú se trabaja en la tarjeta «Menú del evento». Aquí solo está la
// PREGUNTA (decisión) y un acceso sencillo; el gestor completo (platos, secciones, importación, recetas, compras)
// ya NO vive dentro del cuestionario.
function FoodMenuSavePrompt({
  items,
  scope,
  answer,
  saving,
  onAnswer,
  onOpenMenu,
  menuModuleEnabled,
}: {
  items: EventMenuItem[]
  scope: 'principal' | 'infantil'
  answer: GuardarMenuAnswer | undefined
  saving: boolean
  onAnswer: (answer: GuardarMenuAnswer) => void
  onOpenMenu: () => void
  menuModuleEnabled: boolean
}) {
  const infantil = scope === 'infantil'
  const hasItems = items.some((i) => (sectionKeyForCategory(i.category) === 'menu_infantil') === infantil)

  return (
    <div style={{ marginTop: 6 }}>
      <div className="muted" style={{ fontSize: 13 }}>
        {infantil ? '¿Quieres guardar el menú infantil en PEPA?' : '¿Quieres guardar el menú en PEPA?'}
      </div>
      <ChoiceRow options={FOOD_GUARDAR_OPTIONS} value={answer?.choice} disabled={saving} onSelect={(choice) => onAnswer({ choice })} />
      {(answer?.choice === 'si' || hasItems) && <FoodMenuLink hasItems={hasItems} onOpenMenu={onOpenMenu} menuModuleEnabled={menuModuleEnabled} />}
    </div>
  )
}

function FoodMenuLink({ hasItems, onOpenMenu, menuModuleEnabled }: { hasItems: boolean; onOpenMenu: () => void; menuModuleEnabled: boolean }) {
  if (!menuModuleEnabled) {
    return (
      <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
        Para guardar y trabajar el menú, activa «Menú del evento» en las secciones del evento.
      </p>
    )
  }
  return (
    <div style={{ marginTop: 4 }}>
      <button type="button" className="chip" onClick={onOpenMenu}>
        {hasItems ? '🍽️ Ir a Menú del evento' : '🍽️ Crear / gestionar menú'}
      </button>
    </div>
  )
}

// Opciones que podrán escoger los invitados en su invitación (event_menu_options) — la decisión de si
// eligen menú se hereda de Invitados (nunca se vuelve a preguntar aquí). CRUD completo, destinatario
// (adultos/niños/todos), orden, y conteo de lo que ha elegido cada persona. Crear opciones nunca invalida
// respuestas ya recibidas ni reenvía nada: quien ya respondió queda «sin elegir» hasta que elija.
function GuestMenuOptionsPanel({ event, guests, members }: { event: FamilyEvent; guests: EventGuest[]; members: EventGuestMember[] }) {
  const [options, setOptions] = useState<EventMenuOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newAudience, setNewAudience] = useState<EventMenuOptionAudience>('todos')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)

  function reload() {
    return listEventMenuOptions(event.id)
      .then(setOptions)
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar las opciones')))
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id])

  async function run(action: () => Promise<void>, failure: string) {
    setError(null)
    try {
      await action()
      await reload()
    } catch (err) {
      setError(errorMessage(err, failure))
    }
  }

  function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    void run(async () => {
      await addEventMenuOption(event.id, newName, newAudience)
      setNewName('')
    }, 'No se pudo añadir la opción')
  }

  // Cambiar el nombre o la audiencia de una opción YA elegida: nunca se reasignan elecciones; solo se
  // avisa — con el recuento REAL en servidor (countMenuOptionChoices), no con `members` tal como estaba
  // al abrir la pantalla: si otra sesión acaba de guardar una elección, el aviso ya lo refleja.
  async function confirmChangeWithChoices(option: EventMenuOption, change: string): Promise<boolean> {
    const chosen = await countMenuOptionChoices(option.id)
    if (chosen === 0) return true
    return window.confirm(`Esta opción ya ha sido elegida por ${chosen} persona${chosen === 1 ? '' : 's'} (${change}). Sus elecciones se mantienen tal cual: no se reasignan a otra opción. ¿Continuar?`)
  }

  async function handleDeleteOption(option: EventMenuOption) {
    const chosen = await countMenuOptionChoices(option.id)
    const warning = chosen > 0 ? `${chosen} persona${chosen === 1 ? '' : 's'} había${chosen === 1 ? '' : 'n'} elegido «${option.name}»: quedará${chosen === 1 ? '' : 'n'} «sin elegir» (no se borra nada más). ¿Quitar la opción?` : `¿Quitar «${option.name}»?`
    if (!window.confirm(warning)) return
    void run(() => deleteEventMenuOption(option.id), 'No se pudo quitar la opción')
  }

  function move(index: number, delta: -1 | 1) {
    const a = options[index]
    const b = options[index + delta]
    if (!a || !b) return
    void run(() => swapEventMenuOptionOrder(a, b), 'No se pudo reordenar')
  }

  if (loading) return null
  const respondedBefore = options.length > 0 ? guestsRespondedWithoutMenuChoice(guests, members) : 0
  const withoutMembers = options.length > 0 ? guestsWithoutMembers(guests, members) : 0

  return (
    <div className="card" style={{ padding: 8, marginTop: 8 }}>
      <strong style={{ fontSize: 14 }}>Elección de menú para los invitados</strong>
      <p style={{ fontSize: 13, margin: '2px 0 6px' }}>Habéis indicado que los invitados podrán elegir. Añade las opciones que podrán escoger.</p>
      {error && <p className="error">{error}</p>}
      {options.map((o, index) => (
        <div key={o.id} className="inline-fields" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          {editing?.id === o.id ? (
            <>
              <input type="text" value={editing.name} style={{ flex: 1 }} onChange={(e) => setEditing({ id: o.id, name: e.target.value })} aria-label="Nombre de la opción" />
              <button
                type="button"
                className="link-button"
                disabled={!editing.name.trim()}
                onClick={() => {
                  const value = editing.name
                  void confirmChangeWithChoices(o, 'se verá el nuevo nombre').then((ok) => {
                    if (!ok) return
                    setEditing(null)
                    void run(() => updateEventMenuOption(o.id, { name: value }), 'No se pudo renombrar')
                  })
                }}
              >
                Guardar
              </button>
              <button type="button" className="link-button" onClick={() => setEditing(null)}>
                Cancelar
              </button>
            </>
          ) : (
            <>
              <span style={{ flex: 1 }}>{o.name}</span>
              <select value={o.audience} aria-label={`Para quién es ${o.name}`} onChange={(e) => {
                const audience = e.target.value as EventMenuOptionAudience
                void confirmChangeWithChoices(o, 'cambia a quién va dirigida').then((ok) => {
                  if (!ok) return
                  void run(() => updateEventMenuOption(o.id, { audience }), 'No se pudo cambiar')
                })
              }}>
                {MENU_OPTION_AUDIENCES.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
              <button type="button" className="link-button" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Subir">
                ↑
              </button>
              <button type="button" className="link-button" disabled={index === options.length - 1} onClick={() => move(index, 1)} aria-label="Bajar">
                ↓
              </button>
              <button type="button" className="link-button" onClick={() => setEditing({ id: o.id, name: o.name })}>
                Renombrar
              </button>
              <button type="button" className="icon-button" aria-label={`Quitar ${o.name}`} onClick={() => handleDeleteOption(o)}>
                ✕
              </button>
            </>
          )}
        </div>
      ))}
      {options.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Todavía no hay opciones. Ejemplos: Carne, Pescado, Vegetariano, Infantil.</p>}
      <form onSubmit={handleAdd} className="inline-fields" style={{ marginTop: 6 }}>
        <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="+ Nueva opción" style={{ flex: 1 }} />
        <select value={newAudience} onChange={(e) => setNewAudience(e.target.value as EventMenuOptionAudience)} aria-label="Para quién">
          {MENU_OPTION_AUDIENCES.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
        <button type="submit">Añadir</button>
      </form>
      {respondedBefore > 0 && <p style={{ fontSize: 13, margin: '6px 0 0' }}>ℹ️ {alreadyRespondedMessage(respondedBefore)} Siguen siendo válidas y quedan «sin elegir».</p>}
      {withoutMembers > 0 && (
        <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
          {withoutMembers} invitaci{withoutMembers === 1 ? 'ón no tiene' : 'ones no tienen'} personas con nombre: para que puedan elegir menú, desglósalas en Invitados.
        </p>
      )}
      {options.length > 0 && (
        <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
          Lo que ha elegido cada persona se ve en «Menú del evento» → Comensales.
        </p>
      )}
      <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
        PEPA no envía nada por su cuenta: si quieres que alguien que ya respondió elija menú, reenvíale el enlace de su invitación desde Invitados.
      </p>
    </div>
  )
}

// Las necesidades alimentarias (resumen, quiénes son, alta de necesidades y «¿Las habéis tenido en cuenta en el
// menú?») se trabajan en «Menú del evento» → Comensales. Aquí solo un recordatorio con acceso.
function FoodNeedsPointer({ needsCount, reviewPending, onOpenMenu, menuModuleEnabled }: { needsCount: number; reviewPending: boolean; onOpenMenu: () => void; menuModuleEnabled: boolean }) {
  if (!menuModuleEnabled || (needsCount === 0 && !reviewPending)) return null
  return (
    <div style={{ marginTop: 8 }}>
      <p style={{ fontSize: 13, margin: 0 }}>
        🥗 {needsCount} necesidad{needsCount === 1 ? '' : 'es'} alimentaria{needsCount === 1 ? '' : 's'} registrada{needsCount === 1 ? '' : 's'}
        {reviewPending ? ' · falta indicar si las habéis tenido en cuenta en el menú' : ''}.
      </p>
      <button type="button" className="chip" onClick={onOpenMenu}>
        Ver en Menú del evento
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------
// "🎭 Personas especiales" (boda/bautizo/comunión) y "👪 Familiares" (bautizo/comunión) — Fase 2 del plan
// de pendientes. Mismo motor de decisiones que el resto del configurador; el roster (quién es quién) vive
// en event_role_people (migración 0216), reutilizado tal cual por las dos categorías.
// ---------------------------------------------------------------------

const GRUPO_ALCANCE_OPTIONS: { value: GrupoAlcanceChoice; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'algunos', label: 'Solo algunos' },
  { value: 'ninguno', label: 'Ninguno' },
  { value: 'todavia_no_lo_sabemos', label: 'Todavía no lo sabemos' },
]
const HAY_PERSONAS_OPTIONS: { value: HayPersonasChoice; label: string }[] = [
  { value: 'si', label: 'Sí' },
  { value: 'no', label: 'No' },
  { value: 'todavia_no_lo_sabemos', label: 'Todavía no lo sabemos' },
]

// Selector de "a quién" (cuando choice === 'algunos'): checkboxes simples sobre el roster ya creado.
function PersonSubsetPicker({ people, selectedIds, onChange }: { people: EventRolePerson[]; selectedIds: string[]; onChange: (ids: string[]) => void }) {
  return (
    <div className="filter-row" style={{ flexWrap: 'wrap', marginTop: 4 }}>
      {people.map((p) => {
        const checked = selectedIds.includes(p.id)
        return (
          <button
            key={p.id}
            type="button"
            className={'chip' + (checked ? ' chip-active' : '')}
            onClick={() => onChange(checked ? selectedIds.filter((id) => id !== p.id) : [...selectedIds, p.id])}
          >
            {p.name || p.roles[0] || 'Sin nombre'}
          </button>
        )
      })}
    </div>
  )
}

// Tanda "Complementos por persona" — fila de UNA persona dentro de "Complementos especiales": sus propios
// chips del catálogo + "+Otro" libre, independientes de cualquier otra persona (nunca se copia la
// selección de una persona a otra). Guarda en cuanto se toca un chip, igual que el resto del bloque.
function ComplementoPersonaRow({
  person,
  assignment,
  onChange,
  disabled,
}: {
  person: EventRolePerson
  assignment: ComplementoPersonaAsignacion
  onChange: (next: ComplementoPersonaAsignacion) => void
  disabled?: boolean
}) {
  const [addingCustom, setAddingCustom] = useState(false)
  const [customText, setCustomText] = useState('')

  function toggleItem(item: string) {
    const items = assignment.items.includes(item) ? assignment.items.filter((i) => i !== item) : [...assignment.items, item]
    onChange({ ...assignment, items })
  }
  function removeCustom(text: string) {
    onChange({ ...assignment, customItems: assignment.customItems.filter((c) => c !== text) })
  }
  function addCustom() {
    const text = customText.trim()
    setAddingCustom(false)
    setCustomText('')
    if (!text || assignment.customItems.includes(text)) return
    onChange({ ...assignment, customItems: [...assignment.customItems, text] })
  }

  return (
    <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #eee' }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{person.name || 'Sin nombre'}</div>
      <div className="filter-row" style={{ flexWrap: 'wrap', marginTop: 2 }}>
        {ESPECIAL_COMPLEMENTOS_CATALOG.map((item) => (
          <button key={item} type="button" disabled={disabled} className={'chip' + (assignment.items.includes(item) ? ' chip-active' : '')} onClick={() => toggleItem(item)}>
            {item}
          </button>
        ))}
        {assignment.customItems.map((c) => (
          <button key={c} type="button" disabled={disabled} className="chip chip-active" onClick={() => removeCustom(c)} aria-label={`Quitar «${c}»`}>
            {c} ✕
          </button>
        ))}
        {addingCustom ? (
          <input
            type="text"
            autoFocus
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            onBlur={addCustom}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCustom()
              }
            }}
            placeholder="Otro complemento…"
            style={{ maxWidth: 160 }}
          />
        ) : (
          <button type="button" className="chip" disabled={disabled} onClick={() => setAddingCustom(true)}>
            +Otro
          </button>
        )}
      </div>
    </div>
  )
}

// Alta/edición de una persona del roster: nombre (opcional solo en Familiares), papeles (chips sugeridos +
// "+Otro papel" libre) y, mientras escribe el nombre, sugerencia de coincidencia con Invitados — nunca un
// vínculo automático, solo una pregunta que hay que confirmar.
function RolePersonForm({
  category,
  roleSuggestions,
  roleFieldLabel,
  nameRequired,
  existing,
  guestCandidates,
  onSave,
  onCancel,
}: {
  category: 'especial' | 'familiar'
  roleSuggestions: string[]
  roleFieldLabel: string
  nameRequired: boolean
  existing?: EventRolePerson
  guestCandidates: GuestMatchCandidate[]
  onSave: (input: { name: string | null; roles: string[]; guestMemberId: string | null }) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(existing?.name ?? '')
  const [roles, setRoles] = useState<string[]>(existing?.roles ?? [])
  const [customRole, setCustomRole] = useState('')
  const [guestMemberId, setGuestMemberId] = useState<string | null>(existing?.guestMemberId ?? null)
  const [dismissedMatches, setDismissedMatches] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const matches = guestMemberId || dismissedMatches ? [] : suggestGuestMatches(name, guestCandidates)

  function toggleRole(role: string) {
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]))
  }
  function addCustomRole() {
    if (!customRole.trim()) return
    setRoles((prev) => [...prev, customRole.trim()])
    setCustomRole('')
  }

  async function handleSave() {
    if (nameRequired && !name.trim()) {
      setError('Ponle un nombre.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave({ name: name.trim() ? name.trim() : null, roles, guestMemberId })
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
      setSaving(false)
    }
  }

  return (
    <div className="card" style={{ padding: 8, marginTop: 6 }}>
      {error && <p className="error">{error}</p>}
      <label>
        Nombre{nameRequired ? '' : ' (opcional)'}
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setDismissedMatches(false)
          }}
        />
      </label>
      {matches.length > 0 && (
        <div className="card member-form" style={{ marginTop: 4 }}>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            ¿Es la misma persona que ya tenéis en Invitados?
          </p>
          <div className="filter-row" style={{ flexWrap: 'wrap', marginTop: 4 }}>
            {matches.map((m) => (
              <button key={m.id} type="button" className="chip" onClick={() => setGuestMemberId(m.id)}>
                Sí, es {m.name}
              </button>
            ))}
            <button type="button" className="link-button" onClick={() => setDismissedMatches(true)}>
              No, es otra persona
            </button>
          </div>
        </div>
      )}
      {guestMemberId && (
        <p className="muted" style={{ fontSize: 12, margin: '4px 0' }}>
          🔗 Vinculada con Invitados.{' '}
          <button type="button" className="link-button" onClick={() => setGuestMemberId(null)}>
            Quitar vínculo
          </button>
        </p>
      )}
      <div className="muted" style={{ fontSize: 12, fontWeight: 600, marginTop: 6 }}>
        {roleFieldLabel}
      </div>
      {roleSuggestions.length > 0 && (
        <div className="filter-row" style={{ flexWrap: 'wrap', marginTop: 4 }}>
          {roleSuggestions.map((r) => (
            <button key={r} type="button" className={'chip' + (roles.includes(r) ? ' chip-active' : '')} onClick={() => toggleRole(r)}>
              {r}
            </button>
          ))}
        </div>
      )}
      {roles.filter((r) => !roleSuggestions.includes(r)).length > 0 && (
        <div className="filter-row" style={{ flexWrap: 'wrap', marginTop: 4 }}>
          {roles
            .filter((r) => !roleSuggestions.includes(r))
            .map((r) => (
              <button key={r} type="button" className="chip chip-active" onClick={() => toggleRole(r)}>
                {r} ✕
              </button>
            ))}
        </div>
      )}
      <div className="inline-fields" style={{ marginTop: 4 }}>
        <input type="text" value={customRole} onChange={(e) => setCustomRole(e.target.value)} placeholder={category === 'especial' ? 'Otro papel…' : 'Otro parentesco…'} />
        <button type="button" className="link-button" onClick={addCustomRole} disabled={!customRole.trim()}>
          + Añadir
        </button>
      </div>
      <div className="filter-row" style={{ marginTop: 8 }}>
        <button type="button" onClick={() => void handleSave()} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="link-button" onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

function RolePeopleList({
  people,
  onEdit,
  onDelete,
}: {
  people: EventRolePerson[]
  onEdit: (p: EventRolePerson) => void
  onDelete: (p: EventRolePerson) => void
}) {
  if (people.length === 0) return null
  return (
    <div className="event-list" style={{ marginTop: 6 }}>
      {people.map((p) => (
        <div key={p.id} className="inline-fields" style={{ alignItems: 'center' }}>
          <span style={{ flex: 1 }}>
            {p.name || <span className="muted">Sin nombre</span>}
            {p.roles.length > 0 && <span className="muted"> · {p.roles.join(', ')}</span>}
            {p.guestMemberId && <span title="Vinculada con Invitados"> 🔗</span>}
          </span>
          <button type="button" className="link-button" onClick={() => onEdit(p)}>
            Editar
          </button>
          <ConfirmIconButton icon="✕" className="icon-button" ariaLabel={`Quitar a ${p.name ?? 'esta persona'}`} onConfirm={() => onDelete(p)} />
        </div>
      ))}
    </div>
  )
}

function PersonasEspecialesBlock({
  event,
  onDerivedDataChanged,
  focusRequest,
}: {
  event: FamilyEvent
  onDerivedDataChanged: () => void
  focusRequest?: ConfiguratorFocusRequest | null
}) {
  const { localFocus, setLocalFocus, ref: focusRef } = useConfiguratorQuestionFocus(focusRequest)
  const [decisions, setDecisions] = useState<EventDecision[]>([])
  const [people, setPeople] = useState<EventRolePerson[]>([])
  const [guestMembers, setGuestMembers] = useState<EventGuestMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [addingPerson, setAddingPerson] = useState(false)
  const [editingPerson, setEditingPerson] = useState<EventRolePerson | null>(null)

  function reload(): Promise<void> {
    return Promise.all([listEventDecisions(event.id), listEventRolePeople(event.id, 'especial'), listEventGuestMembersForEvent(event.id)])
      .then(([d, p, gm]) => {
        setDecisions(d.filter((x) => x.blockKey === 'personas_especiales'))
        setPeople(p)
        setGuestMembers(gm)
      })
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar las decisiones')))
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id])

  function findDecision(questionKey: string): EventDecision | undefined {
    return decisions.find((d) => d.questionKey === questionKey)
  }

  async function saveHay(answer: HayPersonasAnswer) {
    setSavingKey(ESPECIAL_HAY_QUESTION_KEY)
    setError(null)
    try {
      await upsertEventDecision(event.id, { blockKey: 'personas_especiales', questionKey: ESPECIAL_HAY_QUESTION_KEY, answer: answer as unknown as Record<string, unknown>, isCustomOption: false })
      await reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSavingKey(null)
    }
  }

  async function saveGrouped(questionKey: string, answer: Record<string, unknown>, desired: DesiredPairGeneration) {
    setSavingKey(questionKey)
    setError(null)
    try {
      const decision = await upsertEventDecision(event.id, { blockKey: 'personas_especiales', questionKey, answer, isCustomOption: false })
      const { actions } = await applyPairDecisionGeneration(event.id, decision.id, desired)
      await reload()
      if (actions.length > 0) onDerivedDataChanged()
      const message = describeEffects(actions)
      if (message) showToast(message)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSavingKey(null)
    }
  }

  // Tanda "Preparativos desglosados" — variante de saveGrouped SOLO para complementos: UN
  // DesiredPairGeneration POR PERSONA (desiredForEspecialComplementosPorPersona), nunca uno único para
  // todo el grupo. applyPairDecisionGenerationPerPerson reutiliza el MISMO motor de reconciliación
  // (reconcilePairGeneration) una vez por persona — nunca uno paralelo ni un segundo camino de escritura.
  async function saveComplementos(answer: ComplementosEspecialesAnswer) {
    setSavingKey(ESPECIAL_COMPLEMENTOS_QUESTION_KEY)
    setError(null)
    try {
      const decision = await upsertEventDecision(event.id, {
        blockKey: 'personas_especiales',
        questionKey: ESPECIAL_COMPLEMENTOS_QUESTION_KEY,
        answer: answer as unknown as Record<string, unknown>,
        isCustomOption: false,
      })
      const peopleById = new Map(people.map((p) => [p.id, p]))
      const desiredList = desiredForEspecialComplementosPorPersona(answer, peopleById)
      const results = await applyPairDecisionGenerationPerPerson(event.id, decision.id, desiredList)
      await reload()
      const allActions = results.flatMap((r) => r.actions)
      if (allActions.length > 0) onDerivedDataChanged()
      const message = describeEffects(allActions)
      if (message) showToast(message)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSavingKey(null)
    }
  }

  async function savePerson(input: { name: string | null; roles: string[]; guestMemberId: string | null }) {
    if (editingPerson) await updateEventRolePerson(editingPerson.id, input)
    else await addEventRolePerson(event.id, 'especial', input)
    setAddingPerson(false)
    setEditingPerson(null)
    await reload()
  }

  // Reconciliación (tanda Personas especiales/Complementos/Regalos) — hasta esta tanda, borrar una persona
  // nunca limpiaba su id de ninguna respuesta ya guardada (auditado: no existía ningún camino que lo
  // hiciera). Ahora, si la persona borrada estaba en el subconjunto o en una asignación de vestimenta/
  // complementos/regalos, se vuelve a guardar esa respuesta sin ella — nunca un borrado silencioso fuera
  // del motor: cada guardado pasa otra vez por saveGrouped/saveComplementos, que reconcilian la tarea
  // asociada (detach/delete según isTaskUntouched) exactamente igual que cualquier otro cambio de verdad.
  async function deletePerson(p: EventRolePerson) {
    await deleteEventRolePerson(p.id)
    if (vestimenta?.selectedPersonIds.includes(p.id)) {
      await saveGrouped(ESPECIAL_VESTIMENTA_QUESTION_KEY, { ...vestimenta, selectedPersonIds: vestimenta.selectedPersonIds.filter((id) => id !== p.id) }, NONE_ESPECIAL)
    }
    if (complementosNormalized && (complementosNormalized.selectedPersonIds.includes(p.id) || (complementosNormalized.assignments ?? []).some((a) => a.personId === p.id))) {
      await saveComplementos({
        ...complementosNormalized,
        selectedPersonIds: complementosNormalized.selectedPersonIds.filter((id) => id !== p.id),
        assignments: (complementosNormalized.assignments ?? []).filter((a) => a.personId !== p.id),
      })
    }
    if (regalos?.selectedPersonIds.includes(p.id)) {
      const nextRegalos = { ...regalos, selectedPersonIds: regalos.selectedPersonIds.filter((id) => id !== p.id) }
      await saveGrouped(ESPECIAL_REGALOS_QUESTION_KEY, nextRegalos, desiredForEspecialRegalos(nextRegalos))
    }
    await reload()
  }

  if (loading) return null
  const hayDecision = findDecision(ESPECIAL_HAY_QUESTION_KEY)
  const hay = hayDecision?.answer as unknown as HayPersonasAnswer | undefined
  const vestimenta = findDecision(ESPECIAL_VESTIMENTA_QUESTION_KEY)?.answer as unknown as VestimentaCoordinadaAnswer | undefined
  const complementosRaw = findDecision(ESPECIAL_COMPLEMENTOS_QUESTION_KEY)?.answer as unknown as ComplementosEspecialesAnswer | undefined
  const complementosNormalized = complementosRaw ? normalizeComplementosAnswer(complementosRaw, people.map((p) => p.id)) : undefined
  const regalos = findDecision(ESPECIAL_REGALOS_QUESTION_KEY)?.answer as unknown as RegalosEspecialesAnswer | undefined
  const summary = summarizeEspecialBlock(decisions, people.length)
  const decisionSummary = buildEspecialDecisionSummary(decisions, people.length)
  const roleSuggestions = ESPECIAL_ROLE_SUGGESTIONS[event.type]
  const guestCandidates: GuestMatchCandidate[] = guestMembers.filter((m) => !people.some((p) => p.guestMemberId === m.id) || m.id === editingPerson?.guestMemberId).map((m) => ({ id: m.id, name: m.name }))

  return (
    <div ref={focusRef} className="card" style={{ padding: 8 }}>
      {summary && (
        <p className="muted" style={{ fontSize: 13, margin: '0 0 6px' }}>
          {summary}
        </p>
      )}
      <DecisionSummaryDetails summary={decisionSummary} onSelect={setLocalFocus} />
      {error && <p className="error">{error}</p>}
      {questionIsVisible(localFocus, ESPECIAL_HAY_QUESTION_KEY) && (
        <div>
          <div className="muted" style={{ fontSize: 13 }}>
            ¿Habrá personas con un papel especial?
          </div>
          <p className="muted" style={{ fontSize: 12, margin: '2px 0' }}>
            Por ejemplo: padrino, madrina, testigos, damas de honor…
          </p>
          <ChoiceRow options={HAY_PERSONAS_OPTIONS} value={hay?.choice} disabled={savingKey === ESPECIAL_HAY_QUESTION_KEY} onSelect={(choice) => saveHay({ choice })} />
        </div>
      )}
      {hay?.choice === 'si' && questionIsVisible(localFocus, ESPECIAL_HAY_QUESTION_KEY) && (
        <div style={{ marginTop: 8 }}>
          <RolePeopleList people={people} onEdit={setEditingPerson} onDelete={(p) => void deletePerson(p)} />
          {(addingPerson || editingPerson) && (
            <RolePersonForm
              category="especial"
              roleSuggestions={roleSuggestions}
              roleFieldLabel="Papel o papeles"
              nameRequired
              existing={editingPerson ?? undefined}
              guestCandidates={guestCandidates}
              onSave={savePerson}
              onCancel={() => {
                setAddingPerson(false)
                setEditingPerson(null)
              }}
            />
          )}
          {!addingPerson && !editingPerson && (
            <button type="button" className="link-button" onClick={() => setAddingPerson(true)} style={{ marginTop: 4 }}>
              + Añadir persona
            </button>
          )}
        </div>
      )}
      {hay?.choice === 'si' && people.length > 0 && questionIsVisible(localFocus, ESPECIAL_VESTIMENTA_QUESTION_KEY) && (
        <div style={{ marginTop: 8 }}>
          <div className="muted" style={{ fontSize: 13 }}>
            Vestimenta coordinada
          </div>
          <ChoiceRow
            options={GRUPO_ALCANCE_OPTIONS}
            value={vestimenta?.choice}
            disabled={savingKey === ESPECIAL_VESTIMENTA_QUESTION_KEY}
            onSelect={(choice) =>
              saveGrouped(
                ESPECIAL_VESTIMENTA_QUESTION_KEY,
                { choice, selectedPersonIds: choice === 'algunos' ? (vestimenta?.selectedPersonIds ?? []) : [], note: vestimenta?.note ?? null },
                NONE_ESPECIAL,
              )
            }
          />
          {vestimenta?.choice === 'algunos' && (
            <PersonSubsetPicker
              people={people}
              selectedIds={vestimenta.selectedPersonIds}
              onChange={(ids) => saveGrouped(ESPECIAL_VESTIMENTA_QUESTION_KEY, { choice: 'algunos', selectedPersonIds: ids, note: vestimenta.note }, NONE_ESPECIAL)}
            />
          )}
          {(vestimenta?.choice === 'todos' || vestimenta?.choice === 'algunos') && (
            <input
              type="text"
              placeholder="Nota (opcional): p. ej. testigos en azul marino…"
              defaultValue={vestimenta.note ?? ''}
              onBlur={(e) => saveGrouped(ESPECIAL_VESTIMENTA_QUESTION_KEY, { choice: vestimenta.choice, selectedPersonIds: vestimenta.selectedPersonIds, note: e.target.value || null }, NONE_ESPECIAL)}
              style={{ marginTop: 4 }}
            />
          )}
        </div>
      )}
      {hay?.choice === 'si' && people.length > 0 && questionIsVisible(localFocus, ESPECIAL_COMPLEMENTOS_QUESTION_KEY) && (
        <div style={{ marginTop: 8 }}>
          <div className="muted" style={{ fontSize: 13 }}>
            Complementos especiales
          </div>
          <ChoiceRow
            options={GRUPO_ALCANCE_OPTIONS}
            value={complementosNormalized?.choice}
            disabled={savingKey === ESPECIAL_COMPLEMENTOS_QUESTION_KEY}
            onSelect={(choice) =>
              saveComplementos({
                choice,
                selectedPersonIds: choice === 'algunos' ? (complementosNormalized?.selectedPersonIds ?? []) : [],
                assignments: complementosNormalized?.assignments ?? [],
                note: complementosNormalized?.note ?? null,
              })
            }
          />
          {(complementosNormalized?.choice === 'todos' || complementosNormalized?.choice === 'algunos') && (
            <>
              {complementosNormalized.choice === 'algunos' && (
                <PersonSubsetPicker
                  people={people}
                  selectedIds={complementosNormalized.selectedPersonIds}
                  onChange={(ids) => saveComplementos({ ...complementosNormalized, selectedPersonIds: ids })}
                />
              )}
              {/* Tanda "Complementos por persona" — ya nunca un único complemento compartido por todo el
                  grupo (petición real: "no asignar automáticamente el mismo complemento a todos"): cada
                  persona del subconjunto tiene su propia fila. */}
              {resolveEspecialScopePersonIds(
                complementosNormalized.choice,
                complementosNormalized.selectedPersonIds,
                people.map((p) => p.id),
              ).map((personId) => {
                const person = people.find((p) => p.id === personId)
                if (!person) return null
                const assignment = complementosNormalized.assignments?.find((a) => a.personId === personId) ?? { personId, items: [], customItems: [] }
                return (
                  <ComplementoPersonaRow
                    key={personId}
                    person={person}
                    assignment={assignment}
                    disabled={savingKey === ESPECIAL_COMPLEMENTOS_QUESTION_KEY}
                    onChange={(next) => {
                      const others = (complementosNormalized.assignments ?? []).filter((a) => a.personId !== personId)
                      saveComplementos({ ...complementosNormalized, assignments: [...others, next] })
                    }}
                  />
                )
              })}
            </>
          )}
        </div>
      )}
      {hay?.choice === 'si' && people.length > 0 && questionIsVisible(localFocus, ESPECIAL_REGALOS_QUESTION_KEY) && (
        <div style={{ marginTop: 8 }}>
          <div className="muted" style={{ fontSize: 13 }}>
            Regalos o detalles
          </div>
          <ChoiceRow
            options={GRUPO_ALCANCE_OPTIONS}
            value={regalos?.choice}
            disabled={savingKey === ESPECIAL_REGALOS_QUESTION_KEY}
            onSelect={(choice) => {
              const next: RegalosEspecialesAnswer = { choice, selectedPersonIds: choice === 'algunos' ? (regalos?.selectedPersonIds ?? []) : [] }
              saveGrouped(ESPECIAL_REGALOS_QUESTION_KEY, next as unknown as Record<string, unknown>, desiredForEspecialRegalos(next))
            }}
          />
          {regalos?.choice === 'algunos' && (
            <PersonSubsetPicker
              people={people}
              selectedIds={regalos.selectedPersonIds}
              onChange={(ids) => {
                const next = { ...regalos, selectedPersonIds: ids }
                saveGrouped(ESPECIAL_REGALOS_QUESTION_KEY, next as unknown as Record<string, unknown>, desiredForEspecialRegalos(next))
              }}
            />
          )}
          {(regalos?.choice === 'todos' || regalos?.choice === 'algunos') && (
            <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
              Se apunta un preparativo general ("Decidir regalos para personas especiales"). Qué regalar y a quién se gestiona en 🎁 Detalles/🎀 Regalos.
            </p>
          )}
        </div>
      )}
      {localFocus && (
        <button type="button" className="link-button" onClick={() => setLocalFocus(null)} style={{ marginTop: 6 }}>
          Ver todas las preguntas
        </button>
      )}
    </div>
  )
}

function FamiliaresBlock({ event, onDerivedDataChanged, focusRequest }: { event: FamilyEvent; onDerivedDataChanged: () => void; focusRequest?: ConfiguratorFocusRequest | null }) {
  const { localFocus, setLocalFocus, ref: focusRef } = useConfiguratorQuestionFocus(focusRequest)
  const [decisions, setDecisions] = useState<EventDecision[]>([])
  const [people, setPeople] = useState<EventRolePerson[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [addingPerson, setAddingPerson] = useState(false)
  const [editingPerson, setEditingPerson] = useState<EventRolePerson | null>(null)

  function reload(): Promise<void> {
    return Promise.all([listEventDecisions(event.id), listEventRolePeople(event.id, 'familiar')])
      .then(([d, p]) => {
        setDecisions(d.filter((x) => x.blockKey === 'familiares'))
        setPeople(p)
      })
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar las decisiones')))
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id])

  async function savePerson(input: { name: string | null; roles: string[]; guestMemberId: string | null }) {
    if (editingPerson) await updateEventRolePerson(editingPerson.id, input)
    else await addEventRolePerson(event.id, 'familiar', input)
    setAddingPerson(false)
    setEditingPerson(null)
    await reload()
  }
  async function deletePerson(p: EventRolePerson) {
    await deleteEventRolePerson(p.id)
    await reload()
  }
  async function saveNecesidades(answer: FamiliaresNecesidadesAnswer) {
    setSavingKey(FAMILIARES_NECESIDADES_QUESTION_KEY)
    setError(null)
    try {
      await upsertEventDecision(event.id, { blockKey: 'familiares', questionKey: FAMILIARES_NECESIDADES_QUESTION_KEY, answer: answer as unknown as Record<string, unknown>, isCustomOption: false })
      await reload()
      onDerivedDataChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSavingKey(null)
    }
  }

  if (loading) return null
  const necesidades = decisions.find((d) => d.questionKey === FAMILIARES_NECESIDADES_QUESTION_KEY)?.answer as unknown as FamiliaresNecesidadesAnswer | undefined
  const summary = summarizeFamiliaresBlock(decisions, people.length)
  const decisionSummary = buildFamiliaresDecisionSummary(decisions, people.length)

  return (
    <div ref={focusRef} className="card" style={{ padding: 8 }}>
      {summary && (
        <p className="muted" style={{ fontSize: 13, margin: '0 0 6px' }}>
          {summary}
        </p>
      )}
      <DecisionSummaryDetails summary={decisionSummary} onSelect={setLocalFocus} />
      {error && <p className="error">{error}</p>}
      <RolePeopleList people={people} onEdit={setEditingPerson} onDelete={(p) => void deletePerson(p)} />
      {(addingPerson || editingPerson) && (
        <RolePersonForm
          category="familiar"
          roleSuggestions={[...FAMILIARES_PARENTESCO_OPTIONS]}
          roleFieldLabel="Parentesco"
          nameRequired={false}
          existing={editingPerson ?? undefined}
          guestCandidates={[]}
          onSave={savePerson}
          onCancel={() => {
            setAddingPerson(false)
            setEditingPerson(null)
          }}
        />
      )}
      {!addingPerson && !editingPerson && (
        <button type="button" className="link-button" onClick={() => setAddingPerson(true)} style={{ marginTop: 4 }}>
          + Añadir otra persona
        </button>
      )}
      {people.length > 0 && questionIsVisible(localFocus, FAMILIARES_NECESIDADES_QUESTION_KEY) && (
        <div style={{ marginTop: 8 }}>
          <div className="muted" style={{ fontSize: 13 }}>
            ¿Qué necesitan los familiares?
          </div>
          <div className="filter-row" style={{ flexWrap: 'wrap', marginTop: 4 }}>
            {FAMILIARES_NECESIDAD_OPTIONS.map((o) => {
              const checked = necesidades?.selected.includes(o.value) ?? false
              return (
                <button
                  key={o.value}
                  type="button"
                  className={'chip' + (checked ? ' chip-active' : '')}
                  disabled={savingKey === FAMILIARES_NECESIDADES_QUESTION_KEY}
                  onClick={() => {
                    const selected = checked ? (necesidades?.selected ?? []).filter((s) => s !== o.value) : [...(necesidades?.selected ?? []), o.value]
                    void saveNecesidades({ selected, alcance: necesidades?.alcance ?? 'todos', selectedPersonIds: necesidades?.selectedPersonIds ?? [] })
                  }}
                >
                  {o.label}
                </button>
              )
            })}
          </div>
          {(necesidades?.selected.length ?? 0) > 0 && (
            <>
              <ChoiceRow
                options={[
                  { value: 'todos', label: 'Todos los familiares' },
                  { value: 'algunos', label: 'Solo algunos' },
                ]}
                value={necesidades?.alcance}
                disabled={savingKey === FAMILIARES_NECESIDADES_QUESTION_KEY}
                onSelect={(alcance) => void saveNecesidades({ selected: necesidades?.selected ?? [], alcance, selectedPersonIds: alcance === 'algunos' ? (necesidades?.selectedPersonIds ?? []) : [] })}
              />
              {necesidades?.alcance === 'algunos' && (
                <PersonSubsetPicker
                  people={people}
                  selectedIds={necesidades.selectedPersonIds}
                  onChange={(ids) => void saveNecesidades({ selected: necesidades.selected, alcance: 'algunos', selectedPersonIds: ids })}
                />
              )}
            </>
          )}
        </div>
      )}
      {localFocus && (
        <button type="button" className="link-button" onClick={() => setLocalFocus(null)} style={{ marginTop: 6 }}>
          Ver todas las preguntas
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// "🎵 Música y fiesta" — séptimo bloque del configurador (tanda "completar configurador de boda").
// REGLA "no preguntar dos veces": si el lugar ya incluye música (eventVenueServices.ts), la pregunta
// principal se sustituye por una confirmación de "¿algo más?" — nunca una segunda forma de preguntar lo
// mismo. Muy breve a propósito: nunca listas de canciones ni horarios musicales (eso es del DJ/grupo).
// ---------------------------------------------------------------------
const MUSICA_EXTRA_CONFIRM_OPTIONS: { value: MusicaExtraConfirmChoice; label: string }[] = [
  { value: 'si', label: 'Sí' },
  { value: 'no', label: 'No' },
  { value: 'todavia_no_lo_sabemos', label: 'Todavía no lo sabemos' },
]
const ANIMACION_OPTIONS: { value: AnimacionChoice; label: string }[] = [
  { value: 'si', label: 'Sí' },
  { value: 'no', label: 'No' },
  { value: 'todavia_no_lo_sabemos', label: 'Todavía no lo sabemos' },
]

function MusicaFiestaBlock({
  event,
  onDerivedDataChanged,
  focusRequest,
}: {
  event: FamilyEvent
  onDerivedDataChanged: () => void
  focusRequest?: ConfiguratorFocusRequest | null
}) {
  const { localFocus, setLocalFocus, ref: focusRef } = useConfiguratorQuestionFocus(focusRequest)
  const [decisions, setDecisions] = useState<EventDecision[]>([])
  const [moments, setMoments] = useState<EventMoment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  function reload(): Promise<void> {
    return Promise.all([listEventDecisions(event.id), listEventMoments(event.id)])
      .then(([d, mo]) => {
        setDecisions(d.filter((x) => x.blockKey === MUSICA_FIESTA_BLOCK_KEY))
        setMoments(mo)
      })
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar las decisiones')))
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id])
  // El bloque "Ceremonia y celebración" avisa cuando cambia el lugar o lo que incluye.
  useEventMomentsChangeSignal(event.id, () => void reload())

  function findDecision(questionKey: string): EventDecision | undefined {
    return decisions.find((d) => d.questionKey === questionKey)
  }

  async function saveMusica(answer: MusicaAnswer) {
    setSavingKey(MUSICA_QUESTION_KEY)
    setError(null)
    try {
      const decision = await upsertEventDecision(event.id, { blockKey: MUSICA_FIESTA_BLOCK_KEY, questionKey: MUSICA_QUESTION_KEY, answer: answer as unknown as Record<string, unknown>, isCustomOption: false })
      const { actions } = await applyPairDecisionGeneration(event.id, decision.id, desiredForMusica(answer))
      await reload()
      if (actions.length > 0) onDerivedDataChanged()
      const message = describeEffects(actions)
      if (message) showToast(message)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSavingKey(null)
    }
  }

  // Si dejan de querer "algo más", el catálogo elegido para lo adicional deja de tener sentido — se
  // reconcilia (nunca huérfano) y se borra la sub-decisión, mismo criterio que Primer baile/clases de baile.
  async function saveMusicaExtraConfirm(answer: MusicaExtraConfirmAnswer) {
    setSavingKey(MUSICA_EXTRA_CONFIRM_QUESTION_KEY)
    setError(null)
    try {
      await upsertEventDecision(event.id, { blockKey: MUSICA_FIESTA_BLOCK_KEY, questionKey: MUSICA_EXTRA_CONFIRM_QUESTION_KEY, answer: answer as unknown as Record<string, unknown>, isCustomOption: false })
      let allActions: ReconcileAction[] = []
      if (answer.choice !== 'si') {
        const existing = findDecision(MUSICA_QUESTION_KEY)
        if (existing) {
          const result = await applyPairDecisionGeneration(event.id, existing.id, desiredForMusica(undefined))
          allActions = [...allActions, ...result.actions]
          await deleteEventDecision(existing.id)
        }
      }
      await reload()
      if (allActions.length > 0) onDerivedDataChanged()
      const message = describeEffects(allActions)
      if (message) showToast(message)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSavingKey(null)
    }
  }

  async function saveAnimacion(answer: AnimacionAnswer) {
    setSavingKey(ANIMACION_QUESTION_KEY)
    setError(null)
    try {
      const decision = await upsertEventDecision(event.id, { blockKey: MUSICA_FIESTA_BLOCK_KEY, questionKey: ANIMACION_QUESTION_KEY, answer: answer as unknown as Record<string, unknown>, isCustomOption: false })
      const { actions } = await applyPairDecisionGeneration(event.id, decision.id, desiredForAnimacion(answer))
      await reload()
      if (actions.length > 0) onDerivedDataChanged()
      const message = describeEffects(actions)
      if (message) showToast(message)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSavingKey(null)
    }
  }

  if (loading) return null
  const hasMomentLocation = moments.some((m) => Boolean(m.locationLabel?.trim()))
  const venueCase = resolveVenueCase(event, decisions, hasMomentLocation)
  const venueHasMusic = venueIncludesService(venueCase, decisions, 'musica', event.includedServices ?? null)
  const musicaDecision = findDecision(MUSICA_QUESTION_KEY)
  const musica = musicaDecision?.answer as unknown as MusicaAnswer | undefined
  const extraConfirmDecision = findDecision(MUSICA_EXTRA_CONFIRM_QUESTION_KEY)
  const extraConfirm = extraConfirmDecision?.answer as unknown as MusicaExtraConfirmAnswer | undefined
  const animacionDecision = findDecision(ANIMACION_QUESTION_KEY)
  const animacion = animacionDecision?.answer as unknown as AnimacionAnswer | undefined
  const summary = summarizeMusicaFiestaBlock(decisions)
  const decisionSummary = buildMusicaFiestaDecisionSummary(decisions, venueHasMusic)

  return (
    <div ref={focusRef} className="card" style={{ padding: 8 }}>
      {summary && (
        <p className="muted" style={{ fontSize: 13, margin: '0 0 6px' }}>
          {summary}
        </p>
      )}
      <DecisionSummaryDetails summary={decisionSummary} onSelect={setLocalFocus} />
      {error && <p className="error">{error}</p>}
      {venueHasMusic ? (
        <>
          {questionIsVisible(localFocus, MUSICA_EXTRA_CONFIRM_QUESTION_KEY) && (
            <div style={{ marginTop: 6 }}>
              <div className="muted" style={{ fontSize: 13 }}>
                🎵 El lugar ya incluye música. ¿Queréis añadir algo más?
              </div>
              <ChoiceRow options={MUSICA_EXTRA_CONFIRM_OPTIONS} value={extraConfirm?.choice} disabled={savingKey === MUSICA_EXTRA_CONFIRM_QUESTION_KEY} onSelect={(choice) => saveMusicaExtraConfirm({ choice })} />
            </div>
          )}
          {questionIsVisible(localFocus, MUSICA_QUESTION_KEY) && extraConfirm?.choice === 'si' && (
            <MusicaCatalogQuestion label="¿Qué más de música queréis añadir?" existing={musica} saving={savingKey === MUSICA_QUESTION_KEY} onSave={saveMusica} />
          )}
        </>
      ) : (
        questionIsVisible(localFocus, MUSICA_QUESTION_KEY) && (
          <MusicaCatalogQuestion label="¿Cómo vais a organizar la música?" existing={musica} saving={savingKey === MUSICA_QUESTION_KEY} onSave={saveMusica} />
        )
      )}
      {questionIsVisible(localFocus, ANIMACION_QUESTION_KEY) && (
        <div style={{ marginTop: 6 }}>
          <div className="muted" style={{ fontSize: 13 }}>
            ¿Habrá animación o entretenimiento adicional?
          </div>
          <ChoiceRow options={ANIMACION_OPTIONS} value={animacion?.choice} disabled={savingKey === ANIMACION_QUESTION_KEY} onSelect={(choice) => saveAnimacion({ choice, selected: animacion?.selected ?? [], customItems: animacion?.customItems ?? [] })} />
          {animacion?.choice === 'si' && (
            <AnimacionCatalogPicker
              answer={animacion}
              saving={savingKey === ANIMACION_QUESTION_KEY}
              onChange={(next) => saveAnimacion(next)}
            />
          )}
        </div>
      )}
      {localFocus && (
        <button type="button" className="link-button" onClick={() => setLocalFocus(null)} style={{ marginTop: 6 }}>
          Ver todas las preguntas
        </button>
      )}
    </div>
  )
}

// Catálogo DJ/directo/propia + Sin música/Todavía no lo sabemos + Otro libre — mismo patrón que
// MomentosEspecialesQuestion, reutilizado aquí con su propio título (fijo o "¿algo más?").
function MusicaCatalogQuestion({ label, existing, saving, onSave }: { label: string; existing: MusicaAnswer | undefined; saving: boolean; onSave: (answer: MusicaAnswer) => void }) {
  const [draft, setDraft] = useState<MusicaAnswer | null>(null)
  const current = draft ?? existing
  const [customInput, setCustomInput] = useState('')
  const isTerminal = current?.choice === 'sin_musica' || current?.choice === 'todavia_no_lo_sabemos'

  function toggleSelected(key: (typeof MUSICA_CATALOG)[number]['key']) {
    const selected = current?.choice === 'seleccionar' ? current.selected : []
    const next: MusicaAnswer = { choice: 'seleccionar', selected: selected.includes(key) ? selected.filter((x) => x !== key) : [...selected, key], customItems: current?.choice === 'seleccionar' ? current.customItems : [] }
    setDraft(next)
    onSave(next)
  }
  function addCustom() {
    if (!customInput.trim()) return
    const next: MusicaAnswer = { choice: 'seleccionar', selected: current?.choice === 'seleccionar' ? current.selected : [], customItems: [...(current?.choice === 'seleccionar' ? current.customItems : []), customInput.trim()] }
    setDraft(next)
    onSave(next)
    setCustomInput('')
  }
  function removeCustom(item: string) {
    const next: MusicaAnswer = { choice: 'seleccionar', selected: current?.choice === 'seleccionar' ? current.selected : [], customItems: (current?.choice === 'seleccionar' ? current.customItems : []).filter((x) => x !== item) }
    setDraft(next)
    onSave(next)
  }
  function selectTerminal(choice: 'sin_musica' | 'todavia_no_lo_sabemos') {
    const next: MusicaAnswer = { choice, selected: [], customItems: [] }
    setDraft(next)
    onSave(next)
  }

  return (
    <div style={{ marginTop: 6 }}>
      <div className="muted" style={{ fontSize: 13 }}>
        {label}
      </div>
      <div className="filter-row" style={{ flexWrap: 'wrap', marginTop: 4 }}>
        {MUSICA_CATALOG.map((item) => (
          <button key={item.key} type="button" className={'chip' + (!isTerminal && current?.choice === 'seleccionar' && current.selected.includes(item.key) ? ' chip-active' : '')} disabled={saving} onClick={() => toggleSelected(item.key)}>
            {item.label}
          </button>
        ))}
        {!isTerminal &&
          current?.choice === 'seleccionar' &&
          current.customItems.map((item) => (
            <button key={item} type="button" className="chip chip-active" disabled={saving} onClick={() => removeCustom(item)}>
              {item} ✕
            </button>
          ))}
      </div>
      {!isTerminal && (
        <div className="inline-fields" style={{ marginTop: 4 }}>
          <input type="text" value={customInput} placeholder="Otra opción" disabled={saving} onChange={(e) => setCustomInput(e.target.value)} />
          <button type="button" className="link-button" disabled={saving || !customInput.trim()} onClick={addCustom}>
            + Añadir
          </button>
        </div>
      )}
      <div className="filter-row" style={{ flexWrap: 'wrap', marginTop: 4 }}>
        <button type="button" className={'chip' + (current?.choice === 'todavia_no_lo_sabemos' ? ' chip-active' : '')} disabled={saving} onClick={() => selectTerminal('todavia_no_lo_sabemos')}>
          Todavía no lo sabemos
        </button>
        <button type="button" className={'chip' + (current?.choice === 'sin_musica' ? ' chip-active' : '')} disabled={saving} onClick={() => selectTerminal('sin_musica')}>
          Sin música
        </button>
      </div>
    </div>
  )
}

// Catálogo de animación (admite varios) — mismo lenguaje visual que MusicaCatalogQuestion, pero sin
// estados terminales propios: el Sí/No/Todavía ya lo decide ChoiceRow por encima.
function AnimacionCatalogPicker({ answer, saving, onChange }: { answer: AnimacionAnswer; saving: boolean; onChange: (next: AnimacionAnswer) => void }) {
  const [customInput, setCustomInput] = useState('')
  function toggle(key: (typeof ANIMACION_CATALOG)[number]['key']) {
    const selected = answer.selected.includes(key) ? answer.selected.filter((x) => x !== key) : [...answer.selected, key]
    onChange({ ...answer, selected })
  }
  function addCustom() {
    if (!customInput.trim()) return
    onChange({ ...answer, customItems: [...answer.customItems, customInput.trim()] })
    setCustomInput('')
  }
  function removeCustom(item: string) {
    onChange({ ...answer, customItems: answer.customItems.filter((x) => x !== item) })
  }
  return (
    <div className="filter-row" style={{ flexWrap: 'wrap', marginTop: 4 }}>
      {ANIMACION_CATALOG.map((item) => (
        <button key={item.key} type="button" className={'chip' + (answer.selected.includes(item.key) ? ' chip-active' : '')} disabled={saving} onClick={() => toggle(item.key)}>
          {item.label}
        </button>
      ))}
      {answer.customItems.map((item) => (
        <button key={item} type="button" className="chip chip-active" disabled={saving} onClick={() => removeCustom(item)}>
          {item} ✕
        </button>
      ))}
      <input type="text" value={customInput} placeholder="Otra opción" disabled={saving} onChange={(e) => setCustomInput(e.target.value)} style={{ maxWidth: 140 }} />
      <button type="button" className="link-button" disabled={saving || !customInput.trim()} onClick={addCustom}>
        + Añadir
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------
// "📷 Fotos y recuerdos" — octavo bloque del configurador. Tres decisiones independientes (cobertura del
// día, sesión aparte, vídeo); "profesional"/"otro fotógrafo" reutilizan ProviderLinker TAL CUAL (vincular
// un proveedor ya existente, nunca un segundo mecanismo de vinculación). Fase 11 (Parte G4) — la cobertura
// del día es un catálogo COMBINABLE (profesional + familiares/amigos + nuestra cuenta a la vez, mismo
// patrón que MusicaCatalogQuestion), con "Sin cobertura"/"Todavía no lo sabemos" como estados terminales
// mutuamente excluyentes entre sí y con el catálogo.
// ---------------------------------------------------------------------
function CoberturaFotosQuestion({ existing, saving, onSave }: { existing: CoberturaFotosAnswer | undefined; saving: boolean; onSave: (answer: CoberturaFotosAnswer) => void }) {
  const [draft, setDraft] = useState<CoberturaFotosAnswer | null>(null)
  const current = draft ?? existing
  const isTerminal = current?.choice === 'sin_cobertura' || current?.choice === 'todavia_no_lo_sabemos'

  function toggleSelected(key: CoberturaFotosKey) {
    const selected = current?.choice === 'seleccionar' ? current.selected : []
    const next: CoberturaFotosAnswer = { choice: 'seleccionar', selected: selected.includes(key) ? selected.filter((x) => x !== key) : [...selected, key] }
    setDraft(next)
    onSave(next)
  }
  function selectTerminal(choice: 'sin_cobertura' | 'todavia_no_lo_sabemos') {
    const next: CoberturaFotosAnswer = { choice, selected: [] }
    setDraft(next)
    onSave(next)
  }

  return (
    <div>
      <div className="filter-row" style={{ flexWrap: 'wrap', marginTop: 4 }}>
        {COBERTURA_FOTOS_CATALOG.map((item) => (
          <button key={item.key} type="button" className={'chip' + (!isTerminal && current?.choice === 'seleccionar' && current.selected.includes(item.key) ? ' chip-active' : '')} disabled={saving} onClick={() => toggleSelected(item.key)}>
            {item.label}
          </button>
        ))}
      </div>
      <div className="filter-row" style={{ flexWrap: 'wrap', marginTop: 4 }}>
        <button type="button" className={'chip' + (current?.choice === 'todavia_no_lo_sabemos' ? ' chip-active' : '')} disabled={saving} onClick={() => selectTerminal('todavia_no_lo_sabemos')}>
          Todavía no lo sabemos
        </button>
        <button type="button" className={'chip' + (current?.choice === 'sin_cobertura' ? ' chip-active' : '')} disabled={saving} onClick={() => selectTerminal('sin_cobertura')}>
          Sin cobertura organizada
        </button>
      </div>
    </div>
  )
}
const SESION_FOTOS_OPTIONS: { value: SesionFotosChoice; label: string }[] = [
  { value: 'preboda', label: 'Preboda' },
  { value: 'postboda', label: 'Postboda' },
  { value: 'ambas', label: 'Ambas' },
  { value: 'no', label: 'No' },
  { value: 'todavia_no_lo_sabemos', label: 'Todavía no lo sabemos' },
]
const SESION_FOTOS_QUIEN_OPTIONS: { value: SesionFotosQuien; label: string }[] = [
  { value: 'mismo_fotografo', label: 'El mismo fotógrafo/a' },
  { value: 'otro', label: 'Otro/a' },
  { value: 'pendiente', label: 'Pendiente de decidir' },
]
const VIDEO_OPTIONS: { value: VideoChoice; label: string }[] = [
  { value: 'profesional', label: 'Videógrafo/a profesional' },
  { value: 'familiares_amigos', label: 'Familiares o amigos' },
  { value: 'nuestra_cuenta', label: 'Por nuestra cuenta' },
  { value: 'no', label: 'No' },
  { value: 'todavia_no_lo_sabemos', label: 'Todavía no lo sabemos' },
]

function FotosRecuerdosBlock({
  event,
  onDerivedDataChanged,
  focusRequest,
}: {
  event: FamilyEvent
  onDerivedDataChanged: () => void
  focusRequest?: ConfiguratorFocusRequest | null
}) {
  const { localFocus, setLocalFocus, ref: focusRef } = useConfiguratorQuestionFocus(focusRequest)
  const [decisions, setDecisions] = useState<EventDecision[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  function reload(): Promise<void> {
    return listEventDecisions(event.id)
      .then((d) => setDecisions(d.filter((x) => x.blockKey === FOTOS_RECUERDOS_BLOCK_KEY)))
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar las decisiones')))
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id])

  function findDecision(questionKey: string): EventDecision | undefined {
    return decisions.find((d) => d.questionKey === questionKey)
  }

  async function saveCobertura(answer: CoberturaFotosAnswer) {
    setSavingKey(COBERTURA_FOTOS_QUESTION_KEY)
    setError(null)
    try {
      const decision = await upsertEventDecision(event.id, { blockKey: FOTOS_RECUERDOS_BLOCK_KEY, questionKey: COBERTURA_FOTOS_QUESTION_KEY, answer: answer as unknown as Record<string, unknown>, isCustomOption: false })
      const { actions } = await applyPairDecisionGeneration(event.id, decision.id, desiredForCoberturaFotos(answer))
      await reload()
      if (actions.length > 0) onDerivedDataChanged()
      const message = describeEffects(actions)
      if (message) showToast(message)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSavingKey(null)
    }
  }

  async function saveSesion(answer: SesionFotosAnswer) {
    setSavingKey(SESION_FOTOS_QUESTION_KEY)
    setError(null)
    try {
      const decision = await upsertEventDecision(event.id, { blockKey: FOTOS_RECUERDOS_BLOCK_KEY, questionKey: SESION_FOTOS_QUESTION_KEY, answer: answer as unknown as Record<string, unknown>, isCustomOption: false })
      const { actions } = await applyPairDecisionGeneration(event.id, decision.id, desiredForSesionFotos(answer))
      await reload()
      if (actions.length > 0) onDerivedDataChanged()
      const message = describeEffects(actions)
      if (message) showToast(message)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSavingKey(null)
    }
  }

  async function saveVideo(answer: VideoAnswer) {
    setSavingKey(VIDEO_QUESTION_KEY)
    setError(null)
    try {
      const decision = await upsertEventDecision(event.id, { blockKey: FOTOS_RECUERDOS_BLOCK_KEY, questionKey: VIDEO_QUESTION_KEY, answer: answer as unknown as Record<string, unknown>, isCustomOption: false })
      const { actions } = await applyPairDecisionGeneration(event.id, decision.id, desiredForVideo(answer))
      await reload()
      if (actions.length > 0) onDerivedDataChanged()
      const message = describeEffects(actions)
      if (message) showToast(message)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSavingKey(null)
    }
  }

  if (loading) return null
  const coberturaDecision = findDecision(COBERTURA_FOTOS_QUESTION_KEY)
  const cobertura = normalizeCoberturaFotosAnswer(coberturaDecision?.answer)
  const sesionDecision = findDecision(SESION_FOTOS_QUESTION_KEY)
  const sesion = sesionDecision?.answer as unknown as SesionFotosAnswer | undefined
  const videoDecision = findDecision(VIDEO_QUESTION_KEY)
  const video = videoDecision?.answer as unknown as VideoAnswer | undefined
  const summary = summarizeFotosRecuerdosBlock(decisions)
  const decisionSummary = buildFotosRecuerdosDecisionSummary(decisions)
  const sesionTieneFecha = sesion?.choice === 'preboda' || sesion?.choice === 'postboda' || sesion?.choice === 'ambas'

  return (
    <div ref={focusRef} className="card" style={{ padding: 8 }}>
      {summary && (
        <p className="muted" style={{ fontSize: 13, margin: '0 0 6px' }}>
          {summary}
        </p>
      )}
      <DecisionSummaryDetails summary={decisionSummary} onSelect={setLocalFocus} />
      {error && <p className="error">{error}</p>}
      {questionIsVisible(localFocus, COBERTURA_FOTOS_QUESTION_KEY) && (
        <div style={{ marginTop: 6 }}>
          <div className="muted" style={{ fontSize: 13 }}>
            ¿Cómo vais a organizar las fotos del día de la boda?
          </div>
          <CoberturaFotosQuestion existing={cobertura} saving={savingKey === COBERTURA_FOTOS_QUESTION_KEY} onSave={saveCobertura} />
          {cobertura?.choice === 'seleccionar' && cobertura.selected.includes('profesional') && coberturaDecision && <ProviderLinker event={event} decision={coberturaDecision} />}
        </div>
      )}
      {questionIsVisible(localFocus, SESION_FOTOS_QUESTION_KEY) && (
        <div style={{ marginTop: 6 }}>
          <div className="muted" style={{ fontSize: 13 }}>
            ¿Queréis hacer una sesión de fotos aparte?
          </div>
          <ChoiceRow
            options={SESION_FOTOS_OPTIONS}
            value={sesion?.choice}
            disabled={savingKey === SESION_FOTOS_QUESTION_KEY}
            onSelect={(choice) => saveSesion({ choice, quien: sesion?.quien ?? null, fecha: sesion?.fecha ?? null })}
          />
          {sesionTieneFecha && (
            <>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                ¿Con quién?
              </div>
              <ChoiceRow
                options={SESION_FOTOS_QUIEN_OPTIONS}
                value={sesion?.quien ?? undefined}
                disabled={savingKey === SESION_FOTOS_QUESTION_KEY}
                onSelect={(quien) => saveSesion({ choice: sesion!.choice, quien, fecha: sesion?.fecha ?? null })}
              />
              <input
                type="date"
                defaultValue={sesion?.fecha ?? ''}
                disabled={savingKey === SESION_FOTOS_QUESTION_KEY}
                onBlur={(e) => saveSesion({ choice: sesion!.choice, quien: sesion?.quien ?? null, fecha: e.target.value || null })}
                style={{ marginTop: 4 }}
              />
              {sesion?.quien === 'otro' && sesionDecision && <ProviderLinker event={event} decision={sesionDecision} />}
            </>
          )}
        </div>
      )}
      {questionIsVisible(localFocus, VIDEO_QUESTION_KEY) && (
        <div style={{ marginTop: 6 }}>
          <div className="muted" style={{ fontSize: 13 }}>
            ¿Queréis grabar la boda en vídeo?
          </div>
          <ChoiceRow options={VIDEO_OPTIONS} value={video?.choice} disabled={savingKey === VIDEO_QUESTION_KEY} onSelect={(choice) => saveVideo({ choice })} />
          {video?.choice === 'profesional' && videoDecision && <ProviderLinker event={event} decision={videoDecision} />}
        </div>
      )}
      {localFocus && (
        <button type="button" className="link-button" onClick={() => setLocalFocus(null)} style={{ marginTop: 6 }}>
          Ver todas las preguntas
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// "🌿 Otros y decoración" — noveno y último bloque nuevo del configurador. NO sustituye al módulo
// "🎨 Decoración" (ideas/materiales/compras/encargos/presupuesto siguen viviendo allí) — las zonas
// elegidas se pueden enviar como ideas de partida con "+ Enviar a Decoración" (acción manual y explícita,
// nunca automática en cada guardado; comprueba nombres ya existentes para no duplicar con un doble toque).
// "¿Hay algo más?" admite necesidades libres, cada una convertible a Preparativo solo si lo decide la
// familia — nunca una tarea arbitraria generada sola.
// ---------------------------------------------------------------------
const DECORACION_EXTRA_CONFIRM_OPTIONS: { value: DecoracionExtraConfirmChoice; label: string }[] = [
  { value: 'si', label: 'Sí' },
  { value: 'no', label: 'No' },
  { value: 'todavia_no_lo_sabemos', label: 'Todavía no lo sabemos' },
]
const DECORACION_ORGANIZACION_OPTIONS: { value: DecoracionOrganizacionChoice; label: string }[] = [
  { value: 'contrataremos', label: 'La contrataremos' },
  { value: 'nosotros', label: 'La haremos nosotros' },
  { value: 'combinacion', label: 'Combinación' },
  { value: 'todavia_no_lo_sabemos', label: 'Todavía no lo sabemos' },
]

function OtrosDecoracionBlock({
  event,
  onDerivedDataChanged,
  focusRequest,
}: {
  event: FamilyEvent
  onDerivedDataChanged: () => void
  focusRequest?: ConfiguratorFocusRequest | null
}) {
  const { localFocus, setLocalFocus, ref: focusRef } = useConfiguratorQuestionFocus(focusRequest)
  const [decisions, setDecisions] = useState<EventDecision[]>([])
  const [moments, setMoments] = useState<EventMoment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [sendingZonas, setSendingZonas] = useState(false)
  const [necesidadInput, setNecesidadInput] = useState('')

  function reload(): Promise<void> {
    return Promise.all([listEventDecisions(event.id), listEventMoments(event.id)])
      .then(([d, mo]) => {
        setDecisions(d.filter((x) => x.blockKey === OTROS_DECORACION_BLOCK_KEY))
        setMoments(mo)
      })
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar las decisiones')))
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id])
  useEventMomentsChangeSignal(event.id, () => void reload())

  function findDecision(questionKey: string): EventDecision | undefined {
    return decisions.find((d) => d.questionKey === questionKey)
  }

  async function saveDecoracionOrganizacion(answer: DecoracionOrganizacionAnswer) {
    setSavingKey(DECORACION_ORGANIZACION_QUESTION_KEY)
    setError(null)
    try {
      const decision = await upsertEventDecision(event.id, { blockKey: OTROS_DECORACION_BLOCK_KEY, questionKey: DECORACION_ORGANIZACION_QUESTION_KEY, answer: answer as unknown as Record<string, unknown>, isCustomOption: false })
      const { actions } = await applyPairDecisionGeneration(event.id, decision.id, desiredForDecoracionOrganizacion(answer))
      await reload()
      if (actions.length > 0) onDerivedDataChanged()
      const message = describeEffects(actions)
      if (message) showToast(message)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSavingKey(null)
    }
  }

  async function saveDecoracionExtraConfirm(answer: DecoracionExtraConfirmAnswer) {
    setSavingKey(DECORACION_EXTRA_CONFIRM_QUESTION_KEY)
    setError(null)
    try {
      const decision = await upsertEventDecision(event.id, { blockKey: OTROS_DECORACION_BLOCK_KEY, questionKey: DECORACION_EXTRA_CONFIRM_QUESTION_KEY, answer: answer as unknown as Record<string, unknown>, isCustomOption: false })
      const { actions } = await applyPairDecisionGeneration(event.id, decision.id, desiredForDecoracionExtraConfirm(answer))
      await reload()
      if (actions.length > 0) onDerivedDataChanged()
      const message = describeEffects(actions)
      if (message) showToast(message)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSavingKey(null)
    }
  }

  async function saveZonas(next: DecoracionZonasAnswer) {
    setSavingKey(DECORACION_ZONAS_QUESTION_KEY)
    setError(null)
    try {
      await upsertEventDecision(event.id, { blockKey: OTROS_DECORACION_BLOCK_KEY, questionKey: DECORACION_ZONAS_QUESTION_KEY, answer: next as unknown as Record<string, unknown>, isCustomOption: false })
      await reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSavingKey(null)
    }
  }

  // Acción MANUAL y explícita (nunca automática en cada guardado) — comprueba nombres ya existentes en
  // Decoración para que tocar el botón dos veces no duplique las mismas ideas.
  async function sendZonasToDecoracion(zonas: DecoracionZonasAnswer, zonasDecisionId: string | null) {
    setSendingZonas(true)
    setError(null)
    try {
      const existing = await listEventDecorationItems(event.id)
      const existingNames = new Set(existing.map((i) => i.name.toLowerCase()))
      const labels = [...zonas.selected.map((k) => DECORACION_ZONAS_CATALOG.find((c) => c.key === k)?.label ?? k), ...zonas.customItems]
      const toAdd = labels.filter((l) => !existingNames.has(`decoración: ${l}`.toLowerCase()))
      for (const l of toAdd) {
        await addEventDecorationItem(event.id, `Decoración: ${l}`, null, zonasDecisionId)
      }
      showToast(toAdd.length > 0 ? `✅ ${toAdd.length} idea${toAdd.length === 1 ? '' : 's'} enviada${toAdd.length === 1 ? '' : 's'} a Decoración` : 'Ya estaban todas en Decoración')
    } catch (err) {
      setError(errorMessage(err, 'No se pudo enviar a Decoración'))
    } finally {
      setSendingZonas(false)
    }
  }

  async function saveNecesidades(next: OtraNecesidadItem[]) {
    setSavingKey(OTRAS_NECESIDADES_QUESTION_KEY)
    setError(null)
    try {
      const answer: OtrasNecesidadesAnswer = { items: next }
      await upsertEventDecision(event.id, { blockKey: OTROS_DECORACION_BLOCK_KEY, questionKey: OTRAS_NECESIDADES_QUESTION_KEY, answer: answer as unknown as Record<string, unknown>, isCustomOption: false })
      await reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSavingKey(null)
    }
  }

  function addNecesidad() {
    if (!necesidadInput.trim()) return
    const necesidadesDecision = findDecision(OTRAS_NECESIDADES_QUESTION_KEY)
    const existing = (necesidadesDecision?.answer as unknown as OtrasNecesidadesAnswer | undefined)?.items ?? []
    void saveNecesidades([...existing, { id: crypto.randomUUID(), text: necesidadInput.trim(), taskId: null }])
    setNecesidadInput('')
  }

  function removeNecesidad(id: string) {
    const necesidadesDecision = findDecision(OTRAS_NECESIDADES_QUESTION_KEY)
    const existing = (necesidadesDecision?.answer as unknown as OtrasNecesidadesAnswer | undefined)?.items ?? []
    void saveNecesidades(existing.filter((n) => n.id !== id))
  }

  // "Convertir en preparativo" es un alta manual directa (addEventTask, decisionId null → source
  // 'manual') — NUNCA pasa por el motor de reconciliación: es un Preparativo suelto de toda la vida, no
  // una decisión que PEPA deba mantener sincronizada. taskId se guarda para no poder convertirla dos veces.
  async function convertNecesidad(item: OtraNecesidadItem) {
    setError(null)
    try {
      const taskId = await addEventTask(event.id, item.text)
      const necesidadesDecision = findDecision(OTRAS_NECESIDADES_QUESTION_KEY)
      const existing = (necesidadesDecision?.answer as unknown as OtrasNecesidadesAnswer | undefined)?.items ?? []
      await saveNecesidades(existing.map((n) => (n.id === item.id ? { ...n, taskId } : n)))
      onDerivedDataChanged()
      showToast(`✅ "${item.text}" añadido a Preparativos`)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo crear el preparativo'))
    }
  }

  if (loading) return null
  const hasMomentLocation = moments.some((m) => Boolean(m.locationLabel?.trim()))
  const venueCase = resolveVenueCase(event, decisions, hasMomentLocation)
  const venueHasDecoracion = venueIncludesService(venueCase, decisions, 'decoracion', event.includedServices ?? null)
  const organizacionDecision = findDecision(DECORACION_ORGANIZACION_QUESTION_KEY)
  const organizacion = organizacionDecision?.answer as unknown as DecoracionOrganizacionAnswer | undefined
  const extraConfirmDecision = findDecision(DECORACION_EXTRA_CONFIRM_QUESTION_KEY)
  const extraConfirm = extraConfirmDecision?.answer as unknown as DecoracionExtraConfirmAnswer | undefined
  const zonasDecision = findDecision(DECORACION_ZONAS_QUESTION_KEY)
  const zonas = zonasDecision?.answer as unknown as DecoracionZonasAnswer | undefined
  const necesidadesDecision = findDecision(OTRAS_NECESIDADES_QUESTION_KEY)
  const necesidades = (necesidadesDecision?.answer as unknown as OtrasNecesidadesAnswer | undefined)?.items ?? []
  const summary = summarizeOtrosDecoracionBlock(decisions, venueHasDecoracion)
  const decisionSummary = buildOtrosDecoracionDecisionSummary(decisions, venueHasDecoracion)

  return (
    <div ref={focusRef} className="card" style={{ padding: 8 }}>
      {summary && (
        <p className="muted" style={{ fontSize: 13, margin: '0 0 6px' }}>
          {summary}
        </p>
      )}
      <DecisionSummaryDetails summary={decisionSummary} onSelect={setLocalFocus} />
      {error && <p className="error">{error}</p>}
      {venueHasDecoracion
        ? questionIsVisible(localFocus, DECORACION_EXTRA_CONFIRM_QUESTION_KEY) && (
            <div style={{ marginTop: 6 }}>
              <div className="muted" style={{ fontSize: 13 }}>
                🌿 El lugar ya incluye decoración. ¿Queréis decoración adicional?
              </div>
              <ChoiceRow options={DECORACION_EXTRA_CONFIRM_OPTIONS} value={extraConfirm?.choice} disabled={savingKey === DECORACION_EXTRA_CONFIRM_QUESTION_KEY} onSelect={(choice) => saveDecoracionExtraConfirm({ choice })} />
            </div>
          )
        : questionIsVisible(localFocus, DECORACION_ORGANIZACION_QUESTION_KEY) && (
            <div style={{ marginTop: 6 }}>
              <div className="muted" style={{ fontSize: 13 }}>
                ¿Cómo vais a organizar la decoración?
              </div>
              <ChoiceRow options={DECORACION_ORGANIZACION_OPTIONS} value={organizacion?.choice} disabled={savingKey === DECORACION_ORGANIZACION_QUESTION_KEY} onSelect={(choice) => saveDecoracionOrganizacion({ choice })} />
            </div>
          )}
      {questionIsVisible(localFocus, DECORACION_ZONAS_QUESTION_KEY) && (
        <div style={{ marginTop: 6 }}>
          <div className="muted" style={{ fontSize: 13 }}>
            ¿Qué zonas queréis decorar? (opcional)
          </div>
          <div className="filter-row" style={{ flexWrap: 'wrap', marginTop: 4 }}>
            {DECORACION_ZONAS_CATALOG.map((item) => {
              const selected = zonas?.selected.includes(item.key) ?? false
              return (
                <button
                  key={item.key}
                  type="button"
                  className={'chip' + (selected ? ' chip-active' : '')}
                  disabled={savingKey === DECORACION_ZONAS_QUESTION_KEY}
                  onClick={() => {
                    const base = zonas ?? { selected: [], customItems: [] }
                    const nextSelected = selected ? base.selected.filter((k) => k !== item.key) : [...base.selected, item.key]
                    void saveZonas({ selected: nextSelected, customItems: base.customItems })
                  }}
                >
                  {item.label}
                </button>
              )
            })}
          </div>
          {zonas && (zonas.selected.length > 0 || zonas.customItems.length > 0) && (
            <button type="button" className="link-button" disabled={sendingZonas} style={{ marginTop: 4 }} onClick={() => void sendZonasToDecoracion(zonas, zonasDecision?.id ?? null)}>
              {sendingZonas ? 'Enviando…' : '+ Enviar a Decoración'}
            </button>
          )}
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        <div className="muted" style={{ fontSize: 13 }}>
          ¿Hay algo más que queráis organizar? (opcional)
        </div>
        <div className="event-list" style={{ marginTop: 4 }}>
          {necesidades.map((n) => (
            <div key={n.id} className="inline-fields" style={{ alignItems: 'center' }}>
              <span style={{ flex: 1 }}>{n.text}</span>
              {n.taskId ? (
                <span className="muted" style={{ fontSize: 12 }}>
                  ✓ En Preparativos
                </span>
              ) : (
                <button type="button" className="link-button" onClick={() => void convertNecesidad(n)}>
                  Convertir en preparativo
                </button>
              )}
              <ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Quitar" onConfirm={() => removeNecesidad(n.id)} />
            </div>
          ))}
        </div>
        <div className="inline-fields" style={{ marginTop: 4 }}>
          <input type="text" value={necesidadInput} placeholder="Escribid lo que necesitéis…" onChange={(e) => setNecesidadInput(e.target.value)} />
          <button type="button" className="link-button" disabled={!necesidadInput.trim()} onClick={addNecesidad}>
            + Añadir
          </button>
        </div>
      </div>
      {localFocus && (
        <button type="button" className="link-button" onClick={() => setLocalFocus(null)} style={{ marginTop: 6 }}>
          Ver todas las preguntas
        </button>
      )}
    </div>
  )
}

function ComidaBebidaBlock({
  event,
  onDerivedDataChanged,
  onOpenMenu,
  focusRequest,
}: {
  event: FamilyEvent
  onDerivedDataChanged: () => void
  onOpenMenu: () => void
  focusRequest?: ConfiguratorFocusRequest | null
}) {
  const { localFocus, setLocalFocus, ref: focusRef } = useConfiguratorQuestionFocus(focusRequest)
  const [decisions, setDecisions] = useState<EventDecision[]>([])
  const [menuItems, setMenuItems] = useState<EventMenuItem[]>([])
  const [guests, setGuests] = useState<EventGuest[]>([])
  const [members, setMembers] = useState<EventGuestMember[]>([])
  const [needs, setNeeds] = useState<EventDietaryNeed[]>([])
  const [moments, setMoments] = useState<EventMoment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [costPrompt, setCostPrompt] = useState<{ item: { id: string; category: string }; taskCompleted: boolean } | null>(null)
  const [recovery, setRecovery] = useState<{ prompt: MomentRecoveryPrompt; answer: MomentosComidaAnswer } | null>(null)

  function reloadAll(): Promise<void> {
    return Promise.all([listEventDecisions(event.id), listEventMenuItems(event.id), listEventGuests(event.id), listEventGuestMembersForEvent(event.id), listEventDietaryNeeds(event.id), listEventMoments(event.id)])
      .then(([d, m, g, gm, n, mo]) => {
        setMoments(mo)
        setDecisions(d)
        setMenuItems(m)
        setGuests(g)
        setMembers(gm)
        setNeeds(n)
      })
      .catch((err) => setError(errorMessage(err, 'No se pudo cargar Comida y bebida')))
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    void reloadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id])
  // El primer bloque (Celebración) avisa cuando cambia el lugar o lo que incluye: aquí solo se vuelve a leer.
  useEventMomentsChangeSignal(event.id, () => void reloadAll())

  const needsState = useMemo(() => computeFoodNeedsState(guests, members, needs), [guests, members, needs])
  const hasMomentLocation = moments.some((m) => Boolean(m.locationLabel?.trim()))
  const ctx = useMemo(() => buildFoodContext(event, decisions, menuItems, needsState, hasMomentLocation), [event, decisions, menuItems, needsState, hasMomentLocation])

  function handleEffects(actions: ReconcileAction[], pendingBudgetItem: { id: string; category: string } | null, planCreated: number) {
    if (pendingBudgetItem) {
      setCostPrompt({ item: pendingBudgetItem, taskCompleted: actions.some((a) => a.op === 'complete_task') })
      return
    }
    const message = describeEffects(actions)
    if (message) showToast(message)
    else if (planCreated > 0) showToast('✅ Añadido al Plan del día')
  }

  // Guarda una respuesta y reconcilia SOLO lo que depende de ella (dependentFoodKeys): nunca todo el bloque.
  async function saveFood(questionKey: string, answer: Record<string, unknown>, isCustomOption = false, resolution?: DayPlanResolution) {
    setSavingKey(questionKey)
    setError(null)
    try {
      // ANTES de guardar nada: si se marca un momento y ya hay un independiente que procedía de él, se PREGUNTA.
      // Cancelar el diálogo no ha persistido nada, así que el momento sigue desmarcado (la pantalla no miente).
      if (questionKey === FOOD_MOMENTOS_KEY && !resolution && event.enabledModules.includes('plan_dia')) {
        const prompt = momentRecoveryPrompt(event.type, momentosComidaAnswer(decisions), answer as unknown as MomentosComidaAnswer, ctx, await listEventDayPlan(event.id))
        if (prompt) {
          setRecovery({ prompt, answer: answer as unknown as MomentosComidaAnswer })
          return
        }
      }
      const blockKey = questionKey === VENUE_SERVICES_QUESTION_KEY ? VENUE_SERVICES_BLOCK_KEY : FOOD_BLOCK_KEY
      const saved = await upsertEventDecision(event.id, { blockKey, questionKey, answer, isCustomOption })
      const nextDecisions = [...decisions.filter((d) => d.questionKey !== questionKey), saved]
      const nextCtx = buildFoodContext(event, nextDecisions, menuItems, needsState, hasMomentLocation)
      let allActions: ReconcileAction[] = []
      let pendingBudgetItem: { id: string; category: string } | null = null
      for (const key of dependentFoodKeys(questionKey)) {
        const row = nextDecisions.find((d) => d.questionKey === key)
        if (!row) continue
        const result = await applyFoodDecisionGeneration(event, key, row.id, desiredForFoodKey(key, nextCtx))
        allActions = [...allActions, ...result.actions]
        pendingBudgetItem = result.pendingBudgetItem ?? pendingBudgetItem
      }
      let planCreated = 0
      const momentosRow = nextDecisions.find((d) => d.questionKey === FOOD_MOMENTOS_KEY)
      if (momentosRow && [FOOD_MOMENTOS_KEY, FOOD_QUIEN_KEY, VENUE_SERVICES_QUESTION_KEY].includes(questionKey) && event.enabledModules.includes('plan_dia')) {
        const plan = await applyFoodDayPlan(event.id, event.type, momentosRow.id, desiredDayPlanMoments(event.type, nextCtx), resolution)
        planCreated = plan.created
        if (plan.created > 0 || plan.removed > 0 || plan.adopted > 0) onDerivedDataChanged()
        if (plan.adopted > 0 && plan.created === 0) showToast('✅ Recuperado en el Plan del día')
      }
      setDecisions(nextDecisions)
      if (allActions.length > 0) onDerivedDataChanged()
      handleEffects(allActions, pendingBudgetItem, planCreated)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSavingKey(null)
    }
  }


  if (loading) return null

  const find = (key: string) => decisions.find((d) => d.questionKey === key)
  const answerOf = <T,>(key: string): T | undefined => find(key)?.answer as unknown as T | undefined
  const venueCase = ctx.venueCase
  const included = includedByVenueLines(ctx)
  const quien = quienAnswer(ctx)
  const estado = menuEstadoAnswer(ctx)
  const infantilNeeded = ninosNeedMenuInfantil(decisions)
  const infantil = answerOf<MenuInfantilAnswer>(FOOD_MENU_INFANTIL_KEY)
  const tartaWarning = tartaContradiction(decisions)
  const summary = summarizeFoodBlock(ctx)
  const decisionSummary = buildFoodDecisionSummary(ctx)
  const foodExists = foodWillExist(ctx)
  const menuModuleEnabled = event.enabledModules.includes('menu_compra')
  const showMainMenu = foodExists && (cooksThemselves(quien) || menuItems.some((i) => sectionKeyForCategory(i.category) !== 'menu_infantil'))
  const tartaDecision = find(FOOD_TARTA_KEY)
  const bebidasDecision = find(FOOD_BEBIDAS_KEY)
  const contratacionDecision = find(FOOD_CONTRATACION_KEY)
  // Indicador compacto: si el menú infantil sigue pendiente, se ve sin tener que abrir «Resumen de
  // decisiones» (que está plegado por defecto). Misma fuente que el resumen, nunca un segundo cálculo.
  const infantilPending = decisionSummary.pending.some((p) => p.key === FOOD_MENU_INFANTIL_KEY)

  return (
    <div ref={focusRef} className="card" style={{ padding: 8 }}>
      {summary && (
        <p className="muted" style={{ fontSize: 13, margin: '0 0 6px' }}>
          {summary}
        </p>
      )}
      {infantilPending && <p style={{ fontSize: 13, margin: '0 0 6px' }}>⏳ Falta decidir el menú infantil</p>}
      <DecisionSummaryDetails summary={decisionSummary} onSelect={setLocalFocus} />
      {error && <p className="error">{error}</p>}

      {/* A) Lo que ya sabemos del lugar — se decide en el primer bloque («Ceremonia y celebración» / «Celebración»);
          aquí solo se CONSUME, nunca se vuelve a preguntar qué incluye el lugar. */}
      {venueCase === 'casa' && <FoodInheritedLine>🏠 La celebración será en casa.</FoodInheritedLine>}
      {included.map((line) => (
        <FoodInheritedLine key={line}>{line}</FoodInheritedLine>
      ))}

      {/* B) Quién se encarga de la comida (solo si el lugar no la incluye) */}
      {quienApplies(ctx) && questionIsVisible(localFocus, FOOD_QUIEN_KEY) && (
        <FoodQuienQuestion existing={quien} saving={savingKey === FOOD_QUIEN_KEY} onSave={(a) => saveFood(FOOD_QUIEN_KEY, a as unknown as Record<string, unknown>, a.choice === 'otro')} />
      )}

      {/* C) Contratación (solo si es una vía externa) */}
      {contratacionApplies(ctx) && questionIsVisible(localFocus, FOOD_CONTRATACION_KEY) && (
        <div style={{ marginTop: 6 }}>
          <div className="muted" style={{ fontSize: 13 }}>
            ¿Lo tenéis ya contratado?
          </div>
          <ChoiceRow
            options={FOOD_CONTRATACION_OPTIONS}
            value={answerOf<ContratacionAnswer>(FOOD_CONTRATACION_KEY)?.choice}
            disabled={savingKey === FOOD_CONTRATACION_KEY}
            onSelect={(choice) => saveFood(FOOD_CONTRATACION_KEY, { choice }, false)}
          />
          {(answerOf<ContratacionAnswer>(FOOD_CONTRATACION_KEY)?.choice === 'si' || answerOf<ContratacionAnswer>(FOOD_CONTRATACION_KEY)?.choice === 'buscando') && contratacionDecision && (
            <ProviderLinker event={event} decision={contratacionDecision} />
          )}
        </div>
      )}

      {/* D) Momentos de comida */}
      {recovery && (
        <RecoverMomentDialog
          prompt={recovery.prompt}
          onCancel={() => setRecovery(null)}
          onRecover={async (itemId) => {
            const pending = recovery
            setRecovery(null)
            await saveFood(FOOD_MOMENTOS_KEY, pending.answer as unknown as Record<string, unknown>, false, { adopt: { [pending.prompt.key]: itemId } })
          }}
          onCreate={async () => {
            const pending = recovery
            setRecovery(null)
            await saveFood(FOOD_MOMENTOS_KEY, pending.answer as unknown as Record<string, unknown>, false, { forceCreate: [pending.prompt.key] })
          }}
        />
      )}
      {foodExists && questionIsVisible(localFocus, FOOD_MOMENTOS_KEY) && (
        <>
          <FoodMomentosQuestion catalog={MOMENTOS_COMIDA_CATALOG[event.type]} existing={momentosComidaAnswer(decisions)} saving={savingKey === FOOD_MOMENTOS_KEY} onSave={(a) => saveFood(FOOD_MOMENTOS_KEY, a as unknown as Record<string, unknown>)} />
          <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>
            {event.enabledModules.includes('plan_dia')
              ? 'Los momentos que marques se añaden al Plan del día, sin hora.'
              : 'Se guardan aquí. Para verlos en el Plan del día, activa ese apartado del evento.'}
          </p>
        </>
      )}

      {/* E) Estado del menú + F) guardar/importar/organizar */}
      {foodExists && questionIsVisible(localFocus, FOOD_MENU_ESTADO_KEY) && (
        <div style={{ marginTop: 6 }}>
          <div className="muted" style={{ fontSize: 13 }}>
            ¿Tenéis decidido el menú?
          </div>
          <ChoiceRow options={FOOD_MENU_ESTADO_OPTIONS} value={estado?.choice} disabled={savingKey === FOOD_MENU_ESTADO_KEY} onSelect={(choice) => saveFood(FOOD_MENU_ESTADO_KEY, { choice }, false)} />
          {estado?.choice === 'decidido' && (
            <FoodMenuSavePrompt
              items={menuItems}
              scope="principal"
              answer={answerOf<GuardarMenuAnswer>(FOOD_MENU_GUARDAR_KEY)}
              saving={savingKey === FOOD_MENU_GUARDAR_KEY}
              onAnswer={(a) => saveFood(FOOD_MENU_GUARDAR_KEY, a as unknown as Record<string, unknown>)}
              onOpenMenu={onOpenMenu}
              menuModuleEnabled={menuModuleEnabled}
            />
          )}
          {estado?.choice !== 'decidido' && showMainMenu && <FoodMenuLink hasItems={menuItems.length > 0} onOpenMenu={onOpenMenu} menuModuleEnabled={menuModuleEnabled} />}
        </div>
      )}

      {/* G) Elección de menú por los invitados (se hereda de Invitados) */}
      {guestsChooseMenu(decisions) && <GuestMenuOptionsPanel event={event} guests={guests} members={members} />}

      {/* H) Menú infantil (solo si Invitados ya marcó que lo necesitáis) */}
      {infantilNeeded && questionIsVisible(localFocus, FOOD_MENU_INFANTIL_KEY) && (
        <div style={{ marginTop: 8 }}>
          <FoodInheritedLine>👧🧒 Necesitáis menú infantil</FoodInheritedLine>
          <CustomAwareQuestion
            event={event}
            questionLabel="¿Cómo vais a resolver el menú infantil?"
            options={FOOD_MENU_INFANTIL_OPTIONS}
            questionKey={FOOD_MENU_INFANTIL_KEY}
            decision={find(FOOD_MENU_INFANTIL_KEY)}
            savingKey={savingKey}
            onSave={(a) => saveFood(FOOD_MENU_INFANTIL_KEY, a as unknown as Record<string, unknown>, a.choice === 'otro')}
          />
          {infantil?.choice === 'incluido' && (
            <FoodMenuSavePrompt
              items={menuItems}
              scope="infantil"
              answer={answerOf<GuardarMenuAnswer>(FOOD_MENU_INFANTIL_GUARDAR_KEY)}
              saving={savingKey === FOOD_MENU_INFANTIL_GUARDAR_KEY}
              onAnswer={(a) => saveFood(FOOD_MENU_INFANTIL_GUARDAR_KEY, a as unknown as Record<string, unknown>)}
              onOpenMenu={onOpenMenu}
              menuModuleEnabled={menuModuleEnabled}
            />
          )}
          {/* 'menu_infantil' y 'alternativa' llevan sus platos a la MISMA sección «Menú infantil» que la
              opción heredada 'nosotros' (sus platos ya viven ahí, ver eventFood.ts) — mismo enlace, sin
              inventar una sección nueva para una sola variante. */}
          {(infantil?.choice === 'nosotros' || infantil?.choice === 'menu_infantil' || infantil?.choice === 'alternativa') && (
            <FoodMenuLink hasItems={menuItems.some((i) => sectionKeyForCategory(i.category) === 'menu_infantil')} onOpenMenu={onOpenMenu} menuModuleEnabled={menuModuleEnabled} />
          )}
        </div>
      )}

      {/* I) Tarta (Comida y bebida decide si habrá y cómo se consigue; Momentos especiales, el ritual) */}
      {!venueIncludes(ctx, 'tarta') && questionIsVisible(localFocus, FOOD_TARTA_KEY) && (
        <div style={{ marginTop: 8 }}>
          <CustomAwareQuestion
            event={event}
            questionLabel="¿Habrá tarta?"
            options={FOOD_TARTA_OPTIONS}
            questionKey={FOOD_TARTA_KEY}
            decision={tartaDecision}
            savingKey={savingKey}
            onSave={(a) => saveFood(FOOD_TARTA_KEY, a as unknown as Record<string, unknown>, a.choice === 'otro')}
          />
          {answerOf<TartaAnswer>(FOOD_TARTA_KEY)?.choice === 'encargar' && tartaDecision && <ProviderLinker event={event} decision={tartaDecision} />}
          {tartaWarning && <p style={{ fontSize: 13, margin: '4px 0 0' }}>⚠️ {tartaWarning}</p>}
        </div>
      )}

      {/* J) Bebidas (solo si el lugar no las incluye y habrá comida) */}
      {!venueIncludes(ctx, 'bebidas') && foodExists && questionIsVisible(localFocus, FOOD_BEBIDAS_KEY) && (
        <div style={{ marginTop: 8 }}>
          <CustomAwareQuestion
            event={event}
            questionLabel="¿Y las bebidas?"
            options={FOOD_BEBIDAS_OPTIONS}
            questionKey={FOOD_BEBIDAS_KEY}
            decision={bebidasDecision}
            savingKey={savingKey}
            onSave={(a) => saveFood(FOOD_BEBIDAS_KEY, a as unknown as Record<string, unknown>, a.choice === 'otro')}
          />
          {answerOf<BebidasAnswer>(FOOD_BEBIDAS_KEY)?.choice === 'aparte' && bebidasDecision && <ProviderLinker event={event} decision={bebidasDecision} />}
        </div>
      )}

      {/* K) Necesidades alimentarias: información y aviso, no un interrogatorio */}
      {questionIsVisible(localFocus, FOOD_NECESIDADES_KEY) && (
        <FoodNeedsPointer
          needsCount={needsState.activeNeeds.length}
          reviewPending={needsReviewApplies(needsState) && !answerOf<NecesidadesAnswer>(FOOD_NECESIDADES_KEY)}
          onOpenMenu={onOpenMenu}
          menuModuleEnabled={menuModuleEnabled}
        />
      )}
      {localFocus && (
        <button type="button" className="link-button" onClick={() => setLocalFocus(null)} style={{ marginTop: 6 }}>
          Ver todas las preguntas
        </button>
      )}

      {costPrompt && (
        <BudgetAmountPromptModal
          item={costPrompt.item}
          onClose={() => {
            if (costPrompt.taskCompleted) showToast(TASK_COMPLETED_MESSAGE)
            setCostPrompt(null)
          }}
          onSaved={() => {
            showToast(costPrompt.taskCompleted ? TASK_COMPLETED_AND_BUDGET_UPDATED_MESSAGE : BUDGET_UPDATED_MESSAGE)
            onDerivedDataChanged()
            setCostPrompt(null)
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Fase 2 — Momentos genéricos (event_moments, modelo creado en la Fase 1). Sustituye a la antigua
// CeremoniaSection (2 ubicaciones fijas, Ceremonia/Celebración): un evento puede tener cualquier número
// de momentos libres, cada uno con su propio nombre/fecha/hora/lugar. ÚNICA fuente de verdad: este mismo
// componente se monta tanto dentro de "Gestionar evento" como dentro del configurador del dashboard —
// mismas funciones de datos (listEventMoments/addEventMoment/updateEventMoment/deleteEventMoment/
// reorderEventMoments, Fase 1), nunca una copia local propia ni una segunda llamada que pudiera divergir.
// ---------------------------------------------------------------------

const MOMENT_TITLE_SUGGESTIONS = ['Matrimonio civil', 'Ceremonia religiosa', 'Ceremonia simbólica', 'Celebración', 'Comida', 'Fiesta', 'Brunch']

function momentSummaryLine(m: EventMoment, eventDateStatus: FamilyEvent['dateStatus'] = 'confirmada'): string {
  const status = momentDateStatus(m, eventDateStatus)
  const date = m.momentDate ? `${formatSpanishDate(m.momentDate)}${status ? ` · ${dateStatusLabel(status)}` : ''}` : 'Fecha por decidir'
  const time = m.momentTime ? m.momentTime.slice(0, 5) : 'Hora por decidir'
  return `${date} · ${time}`
}

interface MomentFormValues {
  title: string
  momentDate: string | null
  momentTime: string | null
  locationLabel: string | null
  locationAddress: string | null
  locationPlaceId: string | null
  coords: { latitude: number; longitude: number } | null
  dateStatus: 'provisional' | 'confirmada' | null
}

function MomentForm({
  initial,
  eventDateStatus,
  onCancel,
  onSave,
}: {
  initial?: EventMoment
  eventDateStatus: FamilyEvent['dateStatus']
  onCancel: () => void
  onSave: (patch: MomentFormValues) => Promise<void>
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [momentDate, setMomentDate] = useState(initial?.momentDate ?? '')
  // Una fecha NUEVA no llega con estado preseleccionado (hay que elegirlo); un momento que ya tenía fecha
  // conserva el estado que tuviera (o el del evento, si heredaba).
  const [dateStatus, setDateStatus] = useState<DateChoice | null>(initial ? momentDateStatus(initial, eventDateStatus) : null)
  const [momentTime, setMomentTime] = useState(initial?.momentTime?.slice(0, 5) ?? '')
  const [locationLabel, setLocationLabel] = useState(initial?.locationLabel ?? '')
  // Cierre de Fase 2 (Google Maps) — dirección/place_id por separado del nombre visible. locationLabel
  // sigue siendo el nombre que ve el invitado (editable libremente); estos dos solo los rellena el
  // buscador de Google Maps, nunca se escriben a mano.
  const [locationAddress, setLocationAddress] = useState(initial?.locationAddress ?? null)
  const [locationPlaceId, setLocationPlaceId] = useState(initial?.locationPlaceId ?? null)
  const [coords, setCoords] = useState(
    initial?.locationLatitude != null && initial?.locationLongitude != null ? { latitude: initial.locationLatitude, longitude: initial.locationLongitude } : null,
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Petición real: "no obligar a que el nombre visible sea exactamente el nombre de Google" — si la
  // familia ya escribió un nombre propio ("Casa de los abuelos"), elegir una ubicación en el mapa nunca
  // lo sustituye, solo guarda dirección/coordenadas/place_id por detrás. Con el campo vacío, se rellena
  // con el nombre real de Google y, si no tiene nombre (una dirección suelta), con la propia dirección.
  function handlePlaceDetails(details: { name: string | null; address: string | null; placeId: string | null }) {
    setLocationAddress(details.address)
    setLocationPlaceId(details.placeId)
    if (!locationLabel.trim()) setLocationLabel(details.name ?? details.address ?? '')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    // La fecha de un momento es opcional; pero si hay fecha, hay que decir si es provisional o confirmada.
    if (momentDate && !dateStatus) {
      setError(MISSING_STATUS_MESSAGE)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave({
        title: title.trim(),
        momentDate: momentDate || null,
        // Hora vacía = null: se borra la anterior (nunca 00:00).
        momentTime: momentTime || null,
        locationLabel: locationLabel.trim() || null,
        locationAddress,
        locationPlaceId,
        coords,
        dateStatus: momentDate ? dateStatus : null,
      })
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
      setSaving(false)
    }
  }

  return (
    <form className="card member-form" onSubmit={handleSubmit} style={{ marginTop: 8 }}>
      {error && <p className="error">{error}</p>}
      <label>
        Nombre del momento
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Ceremonia, Matrimonio civil…" autoFocus />
      </label>
      {!initial && (
        <div className="filter-row" style={{ marginTop: 2 }}>
          {MOMENT_TITLE_SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="chip" onClick={() => setTitle(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      <DateTimeStatusFields
        draft={{ date: momentDate, time: momentTime, status: dateStatus }}
        onChange={(next) => {
          setMomentDate(next.date)
          setMomentTime(next.time)
          setDateStatus(next.status)
        }}
        disabled={saving}
        dateHint="(opcional — puede decidirse más adelante)"
      />
      <label>
        Lugar <span className="muted">(como se ve en la invitación, opcional — puedes dejar tu propio nombre, p. ej. "Casa de los abuelos")</span>
        <input type="text" value={locationLabel} onChange={(e) => setLocationLabel(e.target.value)} />
      </label>
      <EventLocationCoordsPicker coords={coords} onCoordsChange={setCoords} onPlaceDetails={handlePlaceDetails} />
      {locationAddress && (
        <p className="muted" style={{ fontSize: 12, marginTop: -4 }}>
          📍 {locationAddress}
        </p>
      )}
      <div className="filter-row" style={{ marginTop: 4 }}>
        <button type="submit" disabled={saving || !title.trim()}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="link-button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function MomentCard({
  moment,
  eventDateStatus,
  guestCount,
  canMoveUp,
  canMoveDown,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  moment: EventMoment
  eventDateStatus: FamilyEvent['dateStatus']
  guestCount: number
  canMoveUp: boolean
  canMoveDown: boolean
  onEdit: () => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const coords = moment.locationLatitude != null && moment.locationLongitude != null ? { latitude: moment.locationLatitude, longitude: moment.locationLongitude } : null
  // Cierre de Fase 2 (Google Maps) — "Ver ubicación" usa lo más preciso disponible: place_id primero,
  // luego coordenadas, luego texto (misma prioridad en buildMapsUrl); la dirección real (si existe) manda
  // sobre el nombre libre como texto de búsqueda de respaldo.
  const mapsHref = buildMapsUrl(moment.locationAddress ?? moment.locationLabel ?? '', coords, moment.locationPlaceId)
  // Cierre de Fase 2 — el aviso de invitados vinculados ya no vive permanentemente en la ficha (ocupaba
  // demasiado espacio y parecía una advertencia constante); solo aparece al pulsar Eliminar, como mensaje
  // de confirmación.
  const deleteConfirmMessage =
    guestCount > 0
      ? `Este momento tiene ${guestCount} invitado${guestCount === 1 ? '' : 's'} vinculado${guestCount === 1 ? '' : 's'}. Si lo eliminas, dejará${guestCount === 1 ? '' : 'n'} de estar invitado${guestCount === 1 ? '' : 's'} a este momento. ¿Quieres continuar?`
      : '¿Seguro?'
  return (
    <div className="card event-task-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 600 }}>{moment.title}</div>
          <div className="muted" style={{ fontSize: 13 }}>
            {momentSummaryLine(moment, eventDateStatus)}
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            {moment.locationLabel || 'Lugar por decidir'}
          </div>
          {/* Cierre de Fase 2 (Google Maps) — dirección legible como línea secundaria, nunca coordenadas
              como sustituto: si no hay dirección (ubicación antigua, o el usuario solo tecleó un nombre
              sin buscarlo en el mapa), simplemente no se muestra esta línea. */}
          {moment.locationAddress && (
            <div className="muted" style={{ fontSize: 12 }}>
              {moment.locationAddress}
            </div>
          )}
          {(moment.locationLabel || moment.locationAddress) && (
            <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="link-button" style={{ textDecoration: 'none', fontSize: 13 }}>
              📍 Ver ubicación
            </a>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flex: 'none' }}>
          <div className="filter-row" style={{ gap: 4 }}>
            <button type="button" className="link-button" onClick={onMoveUp} disabled={!canMoveUp} aria-label={`Mover "${moment.title}" antes`}>
              ↑
            </button>
            <button type="button" className="link-button" onClick={onMoveDown} disabled={!canMoveDown} aria-label={`Mover "${moment.title}" después`}>
              ↓
            </button>
          </div>
          <button type="button" className="link-button" onClick={onEdit}>
            Editar
          </button>
          <ConfirmButton
            label="Eliminar"
            confirmLabel="Eliminar"
            confirmMessage={deleteConfirmMessage}
            className="link-button"
            onConfirm={onDelete}
            ariaLabel={`Eliminar momento "${moment.title}"`}
          />
        </div>
      </div>
    </div>
  )
}

function MomentsEditor({ event, onChanged }: { event: FamilyEvent; onChanged: () => void }) {
  const [moments, setMoments] = useState<EventMoment[] | null>(null)
  const [guestCounts, setGuestCounts] = useState<Map<string, number>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [addingOpen, setAddingOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Se carga SIEMPRE desde event_moments (nunca se copia nada al abrir la pantalla) — resolveEventMoments
  // solo sintetiza una vista de lectura a partir de los campos heredados cuando la tabla está vacía para
  // este evento (Fase 1); no inserta nada en la base de datos por sí sola.
  async function load() {
    try {
      const [real, links] = await Promise.all([listEventMoments(event.id), listEventGuestMoments(event.id)])
      setMoments(resolveEventMoments(event, real))
      const counts = new Map<string, number>()
      for (const link of links) counts.set(link.momentId, (counts.get(link.momentId) ?? 0) + 1)
      setGuestCounts(counts)
    } catch (err) {
      setError(errorMessage(err, 'No se pudieron cargar los momentos'))
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id])

  // Cierre de Fase 2 — hay 2 instancias de MomentsEditor montadas a la vez (Gestionar evento + el
  // configurador del dashboard). Sin esto, cada una solo refrescaba su propio estado tras su propia
  // mutación — la otra se quedaba con el dato antiguo hasta desmontar/remontar. Se suscribe aquí (recarga
  // cuando CUALQUIER instancia, incluida esta misma, avisa de un cambio) y se avisa al final de las 4
  // mutaciones de abajo.
  useEventMomentsChangeSignal(event.id, load)

  async function handleAdd(input: MomentFormValues) {
    await addEventMoment(event.id, {
      title: input.title,
      momentDate: input.momentDate,
      momentTime: input.momentTime,
      locationLabel: input.locationLabel,
      locationLatitude: input.coords?.latitude ?? null,
      locationLongitude: input.coords?.longitude ?? null,
      locationAddress: input.locationAddress,
      locationPlaceId: input.locationPlaceId,
      dateStatus: input.dateStatus,
    })
    setAddingOpen(false)
    // La fecha del evento (única fuente operativa) se mantiene coherente con los momentos.
    await syncOperationalDateFromMoments(event.id)
    await load()
    onChanged()
    notifyEventMomentsChanged(event.id)
  }

  // Un momento "legacy" (sintetizado por resolveEventMoments) no tiene fila real todavía — guardar una
  // edición lo crea por primera vez (materializarlo), nunca pisa un dato que ya existiera.
  async function handleEditSave(moment: EventMoment, patch: MomentFormValues) {
    if (moment.isLegacy) {
      await addEventMoment(event.id, {
        title: patch.title,
        momentDate: patch.momentDate,
        momentTime: patch.momentTime,
        locationLabel: patch.locationLabel,
        locationLatitude: patch.coords?.latitude ?? null,
        locationLongitude: patch.coords?.longitude ?? null,
        locationAddress: patch.locationAddress,
        locationPlaceId: patch.locationPlaceId,
        dateStatus: patch.dateStatus,
      })
    } else {
      await updateEventMoment(moment.id, {
        title: patch.title,
        momentDate: patch.momentDate,
        momentTime: patch.momentTime,
        locationLabel: patch.locationLabel,
        locationLatitude: patch.coords?.latitude ?? null,
        locationLongitude: patch.coords?.longitude ?? null,
        locationAddress: patch.locationAddress,
        locationPlaceId: patch.locationPlaceId,
        dateStatus: patch.dateStatus,
      })
    }
    setEditingId(null)
    await syncOperationalDateFromMoments(event.id)
    await load()
    onChanged()
    notifyEventMomentsChanged(event.id)
  }

  async function handleDelete(moment: EventMoment) {
    if (moment.isLegacy) {
      // No hay fila real que borrar: "eliminar" vacía el par de campos heredados correspondiente —
      // nunca se crea una fila nueva solo para borrarla.
      if (moment.title === 'Ceremonia') {
        await updateEvent(event.id, { ceremonyLocationLabel: null, ceremonyLocationLatitude: null, ceremonyLocationLongitude: null, ceremonyTime: null })
      } else {
        await updateEvent(event.id, { celebrationLocationLabel: null, celebrationLocationLatitude: null, celebrationLocationLongitude: null })
      }
    } else {
      await deleteEventMoment(moment.id)
    }
    await syncOperationalDateFromMoments(event.id)
    await load()
    onChanged()
    notifyEventMomentsChanged(event.id)
  }

  async function handleReorder(moment: EventMoment, direction: -1 | 1) {
    if (!moments) return
    const realMoments = moments.filter((m) => !m.isLegacy)
    const index = realMoments.findIndex((m) => m.id === moment.id)
    const swapIndex = index + direction
    if (index === -1 || swapIndex < 0 || swapIndex >= realMoments.length) return
    const reordered = [...realMoments]
    ;[reordered[index], reordered[swapIndex]] = [reordered[swapIndex], reordered[index]]
    await reorderEventMoments(reordered.map((m) => m.id))
    await load()
    notifyEventMomentsChanged(event.id)
  }

  if (moments === null) return <p className="muted">Cargando…</p>

  const realMomentIds = moments.filter((m) => !m.isLegacy).map((m) => m.id)

  return (
    <div>
      {error && <p className="error">{error}</p>}
      {moments.length === 0 && !addingOpen && <p className="muted">Todavía no hay ningún momento añadido.</p>}
      <div className="event-list">
        {moments.map((moment) => {
          if (editingId === moment.id) {
            return <MomentForm key={moment.id} initial={moment} eventDateStatus={event.dateStatus} onCancel={() => setEditingId(null)} onSave={(patch) => handleEditSave(moment, patch)} />
          }
          const realIndex = realMomentIds.indexOf(moment.id)
          return (
            <MomentCard
              key={moment.id}
              moment={moment}
              eventDateStatus={event.dateStatus}
              guestCount={guestCounts.get(moment.id) ?? 0}
              canMoveUp={realIndex > 0}
              canMoveDown={realIndex !== -1 && realIndex < realMomentIds.length - 1}
              onEdit={() => setEditingId(moment.id)}
              onDelete={() => handleDelete(moment)}
              onMoveUp={() => handleReorder(moment, -1)}
              onMoveDown={() => handleReorder(moment, 1)}
            />
          )
        })}
      </div>
      {addingOpen ? (
        <MomentForm eventDateStatus={event.dateStatus} onCancel={() => setAddingOpen(false)} onSave={handleAdd} />
      ) : (
        <button type="button" className="link-button" onClick={() => setAddingOpen(true)} style={{ marginTop: 8 }}>
          + Añadir momento
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Fase 3 (reestructuración del diseñador) — Invitación del evento: crear
// y editar el diseño en capas vive aquí, en su propio módulo, en vez de
// dentro de Invitados (auditoría 2026-09-27: mezclaba "diseñar" con
// "enviar"). Invitados conserva únicamente el envío/RSVP (InvitationModal,
// más abajo), que sigue leyendo esta misma invitación vía getEventInvitation.
// ---------------------------------------------------------------------

function InvitationSection({ event }: { event: FamilyEvent }) {
  const [invitation, setInvitation] = useState<EventInvitation | null>(null)
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null)
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showEditor, setShowEditor] = useState(false)

  function reload() {
    setLoading(true)
    setError(null)
    getEventInvitation(event.id)
      .then(async (inv) => {
        setInvitation(inv)
        if (!inv) {
          setBackgroundUrl(null)
          setPhotoUrls({})
          return
        }
        if (inv.backgroundImagePath) {
          getInvitationPhotoUrl(inv.backgroundImagePath)
            .then(setBackgroundUrl)
            .catch(() => setBackgroundUrl(null))
        } else {
          setBackgroundUrl(null)
        }
        const paths = inv.canvas.layers.map((l) => l.photoPath).filter((p): p is string => !!p)
        const urls = await Promise.all(paths.map((p) => getInvitationPhotoUrl(p).catch(() => null)))
        const map: Record<string, string> = {}
        paths.forEach((p, i) => {
          if (urls[i]) map[p] = urls[i] as string
        })
        setPhotoUrls(map)
      })
      .catch((err) => setError(errorMessage(err, 'No se pudo cargar la invitación')))
      .finally(() => setLoading(false))
  }
  useEffect(reload, [event.id])

  // Fase 3 Bloque 3 — bug real encontrado al probar "Plantilla importada": un diseño hecho solo de foto de
  // fondo (sin ninguna capa encima) tiene layers.length === 0, así que "solo capas" decía "sin crear
  // todavía" aunque el usuario SÍ tuviera un fondo propio guardado. Cuenta como diseño real si hay capas O
  // fondo importado — vacío de verdad (ni una cosa ni la otra) es el único caso que no cuenta.
  const hasDesign = !!invitation && (invitation.canvas.layers.length > 0 || !!invitation.backgroundImagePath)

  // Fase 3 Bloque 5B (secciones 26-27) — solo se afirma "actualizada" cuando de verdad se puede comprobar
  // (al menos una capa con procedencia real). Una invitación sin ninguna capa `source` (anterior a este
  // bloque, o compuesta enteramente a mano con texto libre) se queda en un estado neutro — nunca se inventa
  // certeza que no se tiene.
  const trackedEventDataChanges = invitation && invitationHasTrackedEventData(invitation.canvas.layers) ? getInvitationEventDataChanges(invitation.canvas.layers, event) : null

  return (
    <div className="card event-card" style={{ marginTop: 8 }}>
      <strong>💌 Invitación</strong>
      {error && <p className="error">{error}</p>}
      {loading && (
        <p className="muted" style={{ margin: '8px 0' }}>
          Cargando…
        </p>
      )}
      {!loading && hasDesign && invitation && (
        <>
          {trackedEventDataChanges !== null &&
            (trackedEventDataChanges.length === 0 ? (
              <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>✓ Invitación actualizada — los datos coinciden con los del evento.</p>
            ) : (
              <p style={{ fontSize: 12, margin: '4px 0 0', color: '#92400E' }}>⚠️ La invitación puede contener información anterior.</p>
            ))}
          <div style={{ marginTop: 8, maxWidth: 320 }}>
            <InvitationCanvasView canvas={invitation.canvas} templateKey={invitation.templateKey} photoUrls={photoUrls} backgroundImageUrl={backgroundUrl} />
          </div>
          <button type="button" className="link-button" onClick={() => setShowEditor(true)} style={{ marginTop: 8 }}>
            🎨 {trackedEventDataChanges && trackedEventDataChanges.length > 0 ? 'Revisar invitación' : 'Editar diseño'}
          </button>
        </>
      )}
      {!loading && !hasDesign && (
        <>
          <p className="muted" style={{ margin: '8px 0' }}>Todavía no has creado la invitación de este evento.</p>
          <button type="button" onClick={() => setShowEditor(true)}>
            + Crear invitación
          </button>
        </>
      )}
      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        Para enviarla a los invitados, ve a 👥 Invitados.
      </p>
      {showEditor && (
        <InvitationCanvasEditor
          event={event}
          onClose={() => setShowEditor(false)}
          onSaved={() => {
            setShowEditor(false)
            reload()
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Invitados.
// ---------------------------------------------------------------------

const GUEST_FILTER_OPTIONS: { value: EventGuestRsvpStatus | 'todos'; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  ...RSVP_STATUS_OPTIONS,
]

function GuestsSection({ event, onOpenInvitation }: { event: FamilyEvent; onOpenInvitation: () => void }) {
  const [guests, setGuests] = useState<EventGuest[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [invitationGuest, setInvitationGuest] = useState<EventGuest | null>(null)
  const [showExport, setShowExport] = useState(false)
  const [statusFilter, setStatusFilter] = useState<EventGuestRsvpStatus | 'todos'>('todos')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [manualShare, setManualShare] = useState<{ title: string; text: string } | null>(null)
  const hasScope = DUAL_LOCATION_EVENT_TYPES.includes(event.type)
  // Fase 4 — asignación real por invitado cuando "Invitados e invitaciones" → Momentos → "Depende del
  // invitado o familia". event_guest_moments es la única fuente de la asignación real (nunca se duplica
  // dentro de la propia decisión); aquí solo se lee para pintar las casillas y se escribe con setGuestMoments.
  const [moments, setMomentsState] = useState<EventMoment[]>([])
  const [guestMomentLinksState, setGuestMomentLinksState] = useState<EventGuestMoment[]>([])
  const [momentosDecision, setMomentosDecision] = useState<EventDecision | undefined>(undefined)

  function reload() {
    listEventGuests(event.id)
      .then(setGuests)
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar los invitados')))
    Promise.all([listEventMoments(event.id), listEventGuestMoments(event.id), listEventDecisions(event.id)])
      .then(([m, links, decisions]) => {
        setMomentsState(m.filter((x) => !x.isLegacy))
        setGuestMomentLinksState(links)
        setMomentosDecision(decisions.find((d) => d.blockKey === 'invitados' && d.questionKey === GUESTS_MOMENTOS_QUESTION_KEY))
      })
      .catch(() => {})
  }
  useEffect(reload, [event.id])
  const momentosChoice = (momentosDecision?.answer as unknown as MomentosAnswer | undefined)?.choice
  const showPerGuestMoments = momentosChoice === 'depende' && moments.length >= 2

  async function handleGuestMomentsChange(guest: EventGuest, momentId: string, checked: boolean) {
    const current = guestMomentLinksState.filter((l) => l.guestId === guest.id).map((l) => l.momentId)
    const next = checked ? Array.from(new Set([...current, momentId])) : current.filter((id) => id !== momentId)
    try {
      await setGuestMoments(guest, next)
      notifyEventMomentsChanged(event.id)
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    }
  }

  const totalPeople = guests.reduce((sum, g) => sum + g.adultsCount + g.childrenCount, 0)
  const confirmed = guests.filter((g) => g.rsvpStatus === 'confirmado')
  const confirmedAdults = confirmed.reduce((sum, g) => sum + (g.rsvpAdultsCount ?? g.adultsCount), 0)
  const confirmedChildren = confirmed.reduce((sum, g) => sum + (g.rsvpChildrenCount ?? g.childrenCount), 0)
  const pending = guests.filter((g) => g.rsvpStatus === 'pendiente')
  const notAttending = guests.filter((g) => g.rsvpStatus === 'no_asiste').length
  const unsure = guests.filter((g) => g.rsvpStatus === 'no_seguro').length
  const visibleGuests = statusFilter === 'todos' ? guests : guests.filter((g) => g.rsvpStatus === statusFilter)

  async function handleRsvpStatusChange(guest: EventGuest, status: EventGuestRsvpStatus) {
    try {
      await updateEventGuest(guest.id, {
        rsvpStatus: status,
        rsvpAdultsCount: status === 'confirmado' ? (guest.rsvpAdultsCount ?? guest.adultsCount) : null,
        rsvpChildrenCount: status === 'confirmado' ? (guest.rsvpChildrenCount ?? guest.childrenCount) : null,
      })
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    }
  }

  // Petición de la Skill: "Provide Remind pending as a manual share
  // workflow. PEPA prepares text; user shares through native share
  // sheet" — un único aviso con los nombres, nunca se manda solo.
  async function handleRemindPending() {
    const text = `Recordatorio: todavía falta por confirmar ${pending.length === 1 ? 'la asistencia de' : 'la asistencia de'} ${pending
      .map((g) => g.displayName)
      .join(', ')} a "${event.title}". ¡Avisadnos cuando podáis! 🙏`
    try {
      const shown = await shareText({ title: event.title, text })
      setNotice(shown ? null : 'Copiado al portapapeles.')
    } catch {
      setManualShare({ title: event.title, text })
    }
  }

  return (
    <div className="card event-card" style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
        <strong>👥 Invitados</strong>
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          <button type="button" className="link-button" onClick={() => setShowExport(true)}>
            📤 Exportar invitados
          </button>
        </div>
      </div>
      <p className="muted" style={{ margin: '4px 0' }}>
        {guests.length} {guests.length === 1 ? 'invitado/grupo' : 'invitados/grupos'} · {totalPeople} personas en total · {confirmedAdults + confirmedChildren}{' '}
        confirmadas ({confirmedAdults} adultos, {confirmedChildren} niños) · {pending.length} pendientes · {notAttending} no asisten · {unsure} no seguros
      </p>
      {notice && <p className="points-badge">{notice}</p>}
      {error && <p className="error">{error}</p>}
      <EventOpenLinkBlock event={event} />
      <GuestQuestionsBlock event={event} />
      {pending.length > 0 && (
        <button type="button" className="link-button" onClick={handleRemindPending}>
          🔔 Recordar a pendientes ({pending.length})
        </button>
      )}
      {guests.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as EventGuestRsvpStatus | 'todos')}>
            {GUEST_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="event-list" style={{ marginTop: 8 }}>
        {visibleGuests.map((g) => (
          <div key={g.id} className="card task-card">
            <div className="task-card-main" style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>{g.displayName}</strong>
                <div>
                  <button type="button" className="link-button" onClick={() => setInvitationGuest(g)}>
                    💌 Invitación
                  </button>
                  <ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Borrar invitado" onConfirm={() => deleteEventGuest(g.id).then(reload)} />
                </div>
              </div>
              <p className="muted" style={{ margin: '2px 0' }}>
                {g.adultsCount} adultos, {g.childrenCount} niños
                {g.notes ? ` · ${g.notes}` : ''}
              </p>
              <GuestBreakdownSection guest={g} />
              <div className="filter-row" style={{ flexWrap: 'wrap' }}>
                <select value={g.rsvpStatus} onChange={(e) => handleRsvpStatusChange(g, e.target.value as EventGuestRsvpStatus)}>
                  {RSVP_STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {hasScope && !showPerGuestMoments && (
                  <select
                    value={g.inviteScope ?? 'ambas'}
                    onChange={(e) => updateEventGuest(g.id, { inviteScope: e.target.value as EventGuestInviteScope }).then(reload)}
                  >
                    {INVITE_SCOPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {/* Fase 4 — "Invitados e invitaciones" → Momentos → "Depende del invitado o familia": con 2+
                  momentos reales, esta casilla por momento sustituye al desplegable heredado de
                  ceremonia/celebración (que solo distinguía dos ubicaciones fijas) — event_guest_moments es
                  ahora la fuente real, resolveGuestInvitedMoments ya la prioriza sobre inviteScope. */}
              {showPerGuestMoments && (
                <div className="filter-row" style={{ flexWrap: 'wrap', marginTop: 4 }}>
                  {moments.map((m) => {
                    const checked = guestMomentLinksState.some((l) => l.guestId === g.id && l.momentId === m.id)
                    return (
                      <button
                        key={m.id}
                        type="button"
                        className={'chip' + (checked ? ' chip-active' : '')}
                        onClick={() => handleGuestMomentsChange(g, m.id, !checked)}
                      >
                        {m.title}
                      </button>
                    )
                  })}
                </div>
              )}
              {g.rsvpStatus === 'confirmado' && (
                <div className="inline-fields" style={{ marginTop: 4 }}>
                  <label style={{ flex: 1 }}>
                    Adultos que vienen
                    <input
                      type="number"
                      min={0}
                      value={g.rsvpAdultsCount ?? 0}
                      onChange={(e) => updateEventGuest(g.id, { rsvpAdultsCount: Number(e.target.value) }).then(reload)}
                    />
                  </label>
                  <label style={{ flex: 1 }}>
                    Niños que vienen
                    <input
                      type="number"
                      min={0}
                      value={g.rsvpChildrenCount ?? 0}
                      onChange={(e) => updateEventGuest(g.id, { rsvpChildrenCount: Number(e.target.value) }).then(reload)}
                    />
                  </label>
                </div>
              )}
              {/* Validación real en iPhone: la nota que el invitado escribe en su RSVP público ("Nota
                  (alergia, algún comentario...)") se guardaba y confirmaba bien, pero no había dónde
                  consultarla — auditoría confirmó que el dato (EventGuest.rsvpNote) llega correcto hasta
                  aquí, solo faltaba pintarlo. Nunca se clasifica como "alergia" a la fuerza (puede ser
                  cualquier comentario) — se muestra tal cual, solo cuando existe, sin ocupar hueco si no. */}
              {g.rsvpNote && (
                <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                  📝 Nota: {g.rsvpNote}
                </p>
              )}
            </div>
          </div>
        ))}
        {guests.length === 0 && <p className="muted">Todavía no hay invitados.</p>}
        {guests.length > 0 && visibleGuests.length === 0 && <p className="muted">Nadie con ese estado por ahora.</p>}
      </div>
      <button type="button" className="link-button" onClick={() => setShowAdd(true)}>
        + Añadir invitado
      </button>
      {showAdd && (
        <AddGuestModal
          event={event}
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false)
            reload()
          }}
        />
      )}
      {invitationGuest && <InvitationModal event={event} guest={invitationGuest} onClose={() => setInvitationGuest(null)} onCreateInvitation={onOpenInvitation} />}
      {manualShare && <ShareFallbackModal title={manualShare.title} text={manualShare.text} onClose={() => setManualShare(null)} />}
      {showExport && <GuestExportModal event={event} onClose={() => setShowExport(false)} />}
    </div>
  )
}

// ---------------------------------------------------------------------
// Fase 4 — enlace de RSVP abierto. Petición de la Skill: "For informal
// events, an open RSVP link may allow recipient to type minimal
// identification and adult/child counts" — cada envío crea un
// invitado nuevo directamente (ver event-rsvp), sin pasar por aquí.
// ---------------------------------------------------------------------

function EventOpenLinkBlock({ event }: { event: FamilyEvent }) {
  const [token, setToken] = useState(event.openRsvpToken)
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [manualShare, setManualShare] = useState<{ title: string; text: string } | null>(null)
  // Cierre de Fase 2 — enlace abierto: sin invitado concreto, así que todos los momentos reales se
  // consideran visibles (mismo criterio que ya tenía inviteScope:null → 'ambas').
  const [moments, setMoments] = useState<EventMoment[]>([])

  useEffect(() => {
    if (event.openRsvpToken) getEventOpenRsvpUrl(event.id).then(setUrl).catch(() => {})
    listEventMoments(event.id).then(setMoments).catch(() => {})
  }, [event.id, event.openRsvpToken])

  async function handleActivate() {
    setLoading(true)
    setError(null)
    try {
      const newUrl = await getEventOpenRsvpUrl(event.id)
      setUrl(newUrl)
      setToken('activo')
    } catch (err) {
      setError(errorMessage(err, 'No se pudo activar el enlace'))
    } finally {
      setLoading(false)
    }
  }

  async function handleRegenerate() {
    setLoading(true)
    setError(null)
    try {
      const newUrl = await regenerateEventOpenRsvpUrl(event.id)
      setUrl(newUrl)
      setNotice('Enlace nuevo generado — el anterior ha dejado de funcionar.')
    } catch (err) {
      setError(errorMessage(err, 'No se pudo regenerar'))
    } finally {
      setLoading(false)
    }
  }

  async function handleDisable() {
    setLoading(true)
    setError(null)
    try {
      await disableEventOpenLink(event.id)
      setToken(null)
      setUrl(null)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo desactivar'))
    } finally {
      setLoading(false)
    }
  }

  async function handleShare() {
    if (!url) return
    const resolvedMoments = resolveEventMoments(event, moments)
    const mapLines = hasRealMoments(resolvedMoments) ? momentsLocationMapLines(resolvedMoments) : eventLocationMapLines(event, { inviteScope: null })
    const text = [`Confirma tu asistencia a "${event.title}" aquí: ${url}`, ...mapLines].join('\n')
    try {
      const shown = await shareText({ title: event.title, text })
      setNotice(shown ? null : 'Copiado al portapapeles.')
    } catch {
      setManualShare({ title: event.title, text })
    }
  }

  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #eee' }}>
      <strong style={{ fontSize: 13 }}>🔗 Enlace abierto (opcional)</strong>
      <p className="muted" style={{ fontSize: 12, margin: '2px 0 4px' }}>
        Para invitar sin lista cerrada — quien lo abre escribe su nombre y cuántos vienen, y crea su propio invitado.
      </p>
      {error && <p className="error">{error}</p>}
      {notice && <p className="points-badge">{notice}</p>}
      {!token && (
        <button type="button" className="link-button" onClick={handleActivate} disabled={loading}>
          {loading ? 'Activando…' : 'Activar enlace abierto'}
        </button>
      )}
      {token && (
        <div className="filter-row" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="link-button" onClick={handleShare} disabled={!url}>
            📤 Compartir
          </button>
          <button type="button" className="link-button" onClick={handleRegenerate} disabled={loading}>
            🔄 Regenerar
          </button>
          <button type="button" className="link-button" onClick={handleDisable} disabled={loading}>
            🚫 Desactivar
          </button>
        </div>
      )}
      {manualShare && <ShareFallbackModal title={manualShare.title} text={manualShare.text} onClose={() => setManualShare(null)} />}
    </div>
  )
}

const GUEST_QUESTION_SCOPE_OPTIONS: { value: GuestQuestionScope; label: string }[] = [
  { value: 'persona', label: 'Cada persona' },
  { value: 'invitacion', label: 'Una respuesta por familia/invitación' },
]

// Una opción dentro del formulario — id null = texto nuevo, todavía sin fila en
// event_guest_question_options; id real = opción ya existente (editar solo cambia su label, conservando
// su identidad, nunca borra+crea) — así una respuesta ya guardada (que apunta a option_id, nunca al
// texto) nunca se desvincula por corregir una errata.
interface GuestQuestionOptionDraft {
  id: string | null
  label: string
}

// "📋 Preguntas a los invitados" — capacidad genérica, deliberadamente aparte de la elección de menú
// (event_menu_options, ya implementada): la familia define sus propias preguntas de opción múltiple
// ("¿Qué preferís de postre?"), cada una respondida por persona o por invitación entera. Solo CRUD de
// preguntas/opciones desde aquí — las respuestas las escribe únicamente el RSVP público.
//
// Edición (petición real, tras validación manual) — el mismo formulario sirve para crear Y para editar:
// con `questionId` presente, "Guardar pregunta" actualiza la MISMA pregunta (mismo id) en vez de crear una
// nueva. Antes de permitir cambios estructurales, se audita si YA existen respuestas reales
// (getEventGuestQuestionAnswerStats, solo option_id agregado — nunca un visor de quién respondió qué):
// - Texto de la pregunta / obligatoria↔opcional: nunca tocan una respuesta ya guardada (apuntan a
//   question_id, nunca al texto ni a este flag) — siempre libres, con o sin respuestas.
// - Renombrar una opción ya existente: mismo criterio, conserva su option_id — libre siempre.
// - Quitar una opción que YA tiene respuestas: esas respuestas pasarían a apuntar a un option_id
//   borrado (on delete set null) — la elección registrada se perdería de vista, aunque la fila de
//   respuesta sobreviva. Nunca se hace en silencio: pide confirmación explícita primero (ConfirmButton,
//   mismo patrón ya usado en toda la app para "esto afecta a otra cosa").
// - Cambiar quién responde (scope) con respuestas ya existentes: SE BLOQUEA del todo, no se pide
//   confirmación — no existe una forma segura de "migrar" respuestas por persona a una única respuesta
//   por invitación (o al revés) sin inventar a cuál de varias personas pertenecería la respuesta
//   conjunta, o viceversa; mezclar las dos formas en la misma pregunta sería un dato estructuralmente
//   incoherente, no solo una pérdida de información puntual como al quitar una opción.
function GuestQuestionForm({
  event,
  questionId,
  initialPrompt,
  initialOptions,
  initialScope,
  initialRequired,
  onCancel,
  onSaved,
}: {
  event: FamilyEvent
  // Presente = editar esta pregunta ya existente (conserva su id); ausente = crear una nueva.
  questionId?: string
  // Petición real (ajuste UX de Invitados e invitaciones): "🚗 Transporte" abre este mismo formulario con
  // una propuesta ya escrita (pregunta + opciones) — editable del todo antes de guardar, nunca impuesta.
  // "✏️ Otra pregunta" (y el "+ Añadir pregunta a los invitados" de siempre) lo abre en blanco, omitiendo
  // estas props.
  initialPrompt?: string
  initialOptions?: GuestQuestionOptionDraft[]
  initialScope?: GuestQuestionScope
  initialRequired?: boolean
  onCancel: () => void
  onSaved: () => void
}) {
  const [prompt, setPrompt] = useState(initialPrompt ?? '')
  const [scope, setScope] = useState<GuestQuestionScope>(initialScope ?? 'persona')
  const [required, setRequired] = useState(initialRequired ?? false)
  const [optionInput, setOptionInput] = useState('')
  const [optionList, setOptionList] = useState<GuestQuestionOptionDraft[]>(initialOptions ?? [])
  const [answerStats, setAnswerStats] = useState<{ total: number; answeredOptionIds: string[] } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!questionId) return
    getEventGuestQuestionAnswerStats(questionId)
      .then(setAnswerStats)
      .catch(() => {})
  }, [questionId])

  function addOption() {
    if (!optionInput.trim()) return
    setOptionList((prev) => [...prev, { id: null, label: optionInput.trim() }])
    setOptionInput('')
  }
  // Corrige una opción ya en la lista (sea nueva o ya existente) — el texto se edita en el sitio, nunca
  // quitando y volviendo a añadir, que para una opción ya existente perdería su id (ver handleSave).
  function updateOptionLabel(index: number, label: string) {
    setOptionList((prev) => prev.map((o, i) => (i === index ? { ...o, label } : o)))
  }
  // Una opción sin respuestas se quita directamente; una con respuestas usa el ConfirmButton de doble
  // toque de la fila (ver render) en vez de pasar por aquí.
  function removeOption(index: number) {
    setOptionList((prev) => prev.filter((_, i) => i !== index))
  }

  const scopeLocked = Boolean(questionId) && (answerStats?.total ?? 0) > 0

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!prompt.trim() || optionList.length === 0) return
    setSaving(true)
    setError(null)
    try {
      if (questionId) {
        await updateEventGuestQuestion(questionId, { prompt: prompt.trim(), scope, required })
        for (const opt of optionList) {
          if (opt.id) {
            const original = (initialOptions ?? []).find((o) => o.id === opt.id)
            if (original && original.label !== opt.label) await updateEventGuestQuestionOption(opt.id, opt.label)
          } else {
            await addEventGuestQuestionOption(questionId, event.id, opt.label)
          }
        }
        const keptIds = new Set(optionList.filter((o) => o.id).map((o) => o.id))
        for (const original of initialOptions ?? []) {
          if (original.id && !keptIds.has(original.id)) await deleteEventGuestQuestionOption(original.id)
        }
      } else {
        const question = await addEventGuestQuestion(event.id, { prompt: prompt.trim(), scope, required })
        for (const opt of optionList) {
          await addEventGuestQuestionOption(question.id, event.id, opt.label)
        }
      }
      onSaved()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="card" style={{ padding: 8, marginTop: 6 }}>
      <label>
        Pregunta
        <input type="text" value={prompt} placeholder='Ej. "¿Qué preferís de postre?"' disabled={saving} onChange={(e) => setPrompt(e.target.value)} />
      </label>
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        Respuestas
      </div>
      {optionList.length > 0 && (
        <div style={{ marginTop: 2 }}>
          {optionList.map((o, i) => (
            <div key={o.id ?? `new-${i}`} className="inline-fields" style={{ marginTop: 4 }}>
              <input type="text" value={o.label} disabled={saving} onChange={(e) => updateOptionLabel(i, e.target.value)} />
              {o.id && answerStats?.answeredOptionIds.includes(o.id) ? (
                <ConfirmButton
                  label="✕"
                  confirmLabel="Quitar de todos modos"
                  confirmMessage="Esta pregunta ya tiene respuestas con esta opción — quitarla hará que esas respuestas dejen de mostrar qué habían elegido."
                  className="icon-button"
                  ariaLabel={`Quitar opción "${o.label}"`}
                  onConfirm={() => removeOption(i)}
                />
              ) : (
                <button type="button" className="icon-button" aria-label={`Quitar opción "${o.label}"`} disabled={saving} onClick={() => removeOption(i)}>
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="inline-fields" style={{ marginTop: 4 }}>
        <input type="text" value={optionInput} placeholder="Nueva respuesta" disabled={saving} onChange={(e) => setOptionInput(e.target.value)} />
        <button type="button" className="link-button" disabled={saving || !optionInput.trim()} onClick={addOption}>
          + Añadir opción
        </button>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        ¿Quién responde?
      </div>
      <ChoiceRow options={GUEST_QUESTION_SCOPE_OPTIONS} value={scope} disabled={saving || scopeLocked} onSelect={setScope} />
      {scopeLocked && (
        <p className="muted" style={{ fontSize: 12, marginTop: 2 }}>
          Esta pregunta ya tiene respuestas — no se puede cambiar quién responde.
        </p>
      )}
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
        <input type="checkbox" checked={required} disabled={saving} onChange={(e) => setRequired(e.target.checked)} />
        Respuesta obligatoria
      </label>
      {error && <p className="error">{error}</p>}
      <div className="filter-row" style={{ marginTop: 8 }}>
        <button type="submit" disabled={saving || !prompt.trim() || optionList.length === 0}>
          {questionId ? 'Guardar cambios' : 'Guardar pregunta'}
        </button>
        <button type="button" className="link-button" disabled={saving} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function GuestQuestionsBlock({ event }: { event: FamilyEvent }) {
  const [questions, setQuestions] = useState<EventGuestQuestion[]>([])
  const [options, setOptions] = useState<EventGuestQuestionOption[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    Promise.all([listEventGuestQuestions(event.id), listEventGuestQuestionOptionsForEvent(event.id)])
      .then(([q, o]) => {
        setQuestions(q)
        setOptions(o)
      })
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar las preguntas')))
  }
  useEffect(reload, [event.id])

  async function handleToggleActive(question: EventGuestQuestion) {
    try {
      await updateEventGuestQuestion(question.id, { active: !question.active })
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    }
  }

  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #eee' }}>
      <strong style={{ fontSize: 13 }}>📋 Preguntas a los invitados (opcional)</strong>
      <p className="muted" style={{ fontSize: 12, margin: '2px 0 4px' }}>
        Además de confirmar asistencia (y, si procede, su menú), podéis añadir vuestras propias preguntas — cada invitado activo las verá al confirmar.
      </p>
      {error && <p className="error">{error}</p>}
      {questions.map((q) =>
        editingQuestionId === q.id ? (
          <GuestQuestionForm
            key={q.id}
            event={event}
            questionId={q.id}
            initialPrompt={q.prompt}
            initialScope={q.scope}
            initialRequired={q.required}
            initialOptions={options.filter((o) => o.questionId === q.id).map((o) => ({ id: o.id, label: o.label }))}
            onCancel={() => setEditingQuestionId(null)}
            onSaved={() => {
              setEditingQuestionId(null)
              reload()
            }}
          />
        ) : (
          <div key={q.id} className="card task-card" style={{ marginTop: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{q.prompt}</strong>
              <div>
                <button type="button" className="link-button" onClick={() => setEditingQuestionId(q.id)}>
                  ✏️ Editar
                </button>
                <button type="button" className="link-button" onClick={() => handleToggleActive(q)}>
                  {q.active ? 'Desactivar' : 'Activar'}
                </button>
                <ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Borrar pregunta" onConfirm={() => deleteEventGuestQuestion(q.id).then(reload)} />
              </div>
            </div>
            <p className="muted" style={{ margin: '2px 0', fontSize: 12 }}>
              {q.scope === 'persona' ? 'Cada persona responde' : 'Una respuesta por familia/invitación'} · {q.required ? 'Obligatoria' : 'Opcional'} ·{' '}
              {q.active ? 'Activa' : 'Inactiva'}
            </p>
            <div className="filter-row" style={{ flexWrap: 'wrap' }}>
              {options
                .filter((o) => o.questionId === q.id)
                .map((o) => (
                  <span key={o.id} className="chip">
                    {o.label}
                  </span>
                ))}
            </div>
          </div>
        ),
      )}
      {showAdd ? (
        <GuestQuestionForm
          event={event}
          onCancel={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false)
            reload()
          }}
        />
      ) : (
        <button type="button" className="link-button" onClick={() => setShowAdd(true)} style={{ marginTop: 6 }}>
          + Añadir pregunta a los invitados
        </button>
      )}
    </div>
  )
}

// Eventos Fase 14B — desglose OPCIONAL de personas dentro de una
// unidad invitada (event_guest_members, Fase 14A). Colapsado por
// defecto: una unidad sin desglose se ve igual que antes salvo por
// este botón nuevo. adults_count/children_count de la unidad NUNCA se
// tocan aquí (siguen siendo la fuente de verdad, Fase 14A/14B); el
// aviso de descuadre es solo informativo, nunca bloquea guardar.
// Corrective visual Fase 14B (capturas reales de iPhone): el enlace de
// contraer pegado justo al de añadir persona se leía como una sola
// acción, y el formulario inline (Nombre | Tipo | Guardar | Cancelar)
// se salía de la tarjeta en móvil. Ahora: acción única y clara cuando
// no hay nadie desglosado ("👥 Añadir nombres de invitados", sin la
// palabra técnica "desglosar"), cabecera compacta pulsable con
// contador real cuando ya hay alguien ("👥 Personas · X de Y"), y el
// alta/edición se hace en un modal/bottom-sheet aparte (mismo
// .modal-overlay/.modal-sheet que el resto de PEPA) en vez de un
// formulario horizontal metido en la tarjeta. Ni el modelo de datos,
// ni la RLS, ni los recuentos, ni la Fase 14C/14D se tocan — solo
// presentación.
function GuestBreakdownSection({ guest }: { guest: EventGuest }) {
  const [expanded, setExpanded] = useState(false)
  const [members, setMembers] = useState<EventGuestMember[]>([])
  const [loaded, setLoaded] = useState(false)
  // undefined = modal cerrado; null = modo "añadir"; EventGuestMember = modo "editar" esa persona.
  const [modalMember, setModalMember] = useState<EventGuestMember | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  function reloadMembers() {
    listEventGuestMembers(guest.id)
      .then((m) => {
        setMembers(m)
        setLoaded(true)
      })
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar las personas')))
  }
  // Se carga siempre (no solo al expandir): la cabecera colapsada ya
  // necesita saber si hay alguna persona para decidir qué texto mostrar.
  useEffect(reloadMembers, [guest.id])

  const status = computeGuestBreakdownStatus(guest, members)
  const totalDeclared = guest.adultsCount + guest.childrenCount

  async function handleDeletePerson(id: string) {
    try {
      await deleteEventGuestMember(id)
      reloadMembers()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo eliminar'))
    }
  }

  if (!loaded) return null

  if (members.length === 0) {
    return (
      <>
        <button type="button" className="link-button" onClick={() => setModalMember(null)}>
          👥 Añadir nombres de invitados
        </button>
        {modalMember !== undefined && (
          <GuestPersonModal
            guest={guest}
            member={modalMember}
            hasExistingMembers={false}
            onClose={() => setModalMember(undefined)}
            onSaved={() => {
              setModalMember(undefined)
              setExpanded(true)
              reloadMembers()
            }}
          />
        )}
      </>
    )
  }

  return (
    <div style={{ margin: '4px 0' }}>
      <button
        type="button"
        className="guest-breakdown-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span>
          👥 Personas · {status.totalMembers} de {totalDeclared}
        </span>
        <span className="guest-breakdown-chevron" aria-hidden="true">
          {expanded ? '︿' : '⌄'}
        </span>
      </button>
      {expanded && (
        <div className="guest-breakdown-body">
          {error && <p className="error">{error}</p>}
          {(status.adultsExceeded || status.childrenExceeded) && (
            <p className="muted" style={{ color: '#b45309' }}>
              ⚠️ Hay más {status.adultsExceeded && status.childrenExceeded ? 'adultos y niños' : status.adultsExceeded ? 'adultos' : 'niños'} desglosados
              que los contados para este grupo ({guest.adultsCount} adultos, {guest.childrenCount} niños).
            </p>
          )}
          {members.map((m) => (
            <div key={m.id} className="guest-breakdown-person-row">
              <span className="guest-breakdown-person-name">
                {m.name} ({m.personType === 'adulto' ? 'adulto' : 'niño'})
              </span>
              <button type="button" className="link-button" onClick={() => setModalMember(m)}>
                Editar
              </button>
              <ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Borrar persona" onConfirm={() => handleDeletePerson(m.id)} />
            </div>
          ))}
          <button type="button" className="link-button" onClick={() => setModalMember(null)}>
            + Añadir persona
          </button>
        </div>
      )}
      {modalMember !== undefined && (
        <GuestPersonModal
          guest={guest}
          member={modalMember}
          hasExistingMembers={members.length > 0}
          onClose={() => setModalMember(undefined)}
          onSaved={() => {
            setModalMember(undefined)
            reloadMembers()
          }}
        />
      )}
    </div>
  )
}

// Modal/bottom-sheet compartido para añadir Y editar una persona
// desglosada — mismo componente en los dos casos (título y valores
// precargados cambian según `member`), en vez de un segundo formulario
// inline distinto para editar.
function GuestPersonModal({
  guest,
  member,
  hasExistingMembers,
  onClose,
  onSaved,
}: {
  guest: EventGuest
  member: EventGuestMember | null
  hasExistingMembers: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(member?.name ?? '')
  const [personType, setPersonType] = useState<EventGuestMemberType>(member?.personType ?? 'adulto')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isEdit = member !== null

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!name.trim()) {
      setError('Ponle un nombre.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (member) {
        await updateEventGuestMember(member.id, { name, personType })
      } else {
        // Fase 14C — transición grupo→personas: si es la primera persona
        // de esta unidad y el grupo ya tenía mesa asignada, se traslada
        // como mesa inicial de esa persona (única fuente sin ambigüedad;
        // a partir de la 2ª persona ya no hay una mesa de grupo que copiar).
        const initialTableId = hasExistingMembers ? null : guest.tableId
        await addEventGuestMember(guest, { name, personType, tableId: initialTableId })
      }
      onSaved()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            {isEdit ? 'Editar persona' : 'Añadir persona'}
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <form className="card member-form" onSubmit={handleSubmit}>
          {error && <p className="error">{error}</p>}
          <label>
            Nombre
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del invitado" autoFocus />
          </label>
          <label>
            Tipo
            <select value={personType} onChange={(e) => setPersonType(e.target.value as EventGuestMemberType)}>
              <option value="adulto">Adulto</option>
              <option value="nino">Niño</option>
            </select>
          </label>
          <div className="form-actions">
            <button type="submit" disabled={saving}>
              {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Guardar persona'}
            </button>
            <button type="button" className="link-button" onClick={onClose}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AddGuestModal({ event, onClose, onAdded }: { event: FamilyEvent; onClose: () => void; onAdded: () => void }) {
  const [displayName, setDisplayName] = useState('')
  const [adultsCount, setAdultsCount] = useState('1')
  const [childrenCount, setChildrenCount] = useState('0')
  const [notes, setNotes] = useState('')
  const [inviteScope, setInviteScope] = useState<EventGuestInviteScope>('ambas')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasScope = DUAL_LOCATION_EVENT_TYPES.includes(event.type)

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!displayName.trim()) {
      setError('Ponle un nombre.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await addEventGuest(event.id, {
        displayName,
        adultsCount: Number(adultsCount) || 0,
        childrenCount: Number(childrenCount) || 0,
        notes: notes || null,
        inviteScope: hasScope ? inviteScope : null,
      })
      onAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Nuevo invitado
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <form className="card member-form" onSubmit={handleSubmit}>
          {error && <p className="error">{error}</p>}
          <label>
            Nombre o familia
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Familia García" autoFocus />
          </label>
          <div className="inline-fields">
            <label style={{ flex: 1 }}>
              Adultos
              <input type="number" min={0} value={adultsCount} onChange={(e) => setAdultsCount(e.target.value)} />
            </label>
            <label style={{ flex: 1 }}>
              Niños
              <input type="number" min={0} value={childrenCount} onChange={(e) => setChildrenCount(e.target.value)} />
            </label>
          </div>
          {hasScope && (
            <label>
              A qué está invitado
              <select value={inviteScope} onChange={(e) => setInviteScope(e.target.value as EventGuestInviteScope)}>
                {INVITE_SCOPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Notas (opcional)
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Alergia, comentario..." />
          </label>
          <button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Añadir'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Presupuesto.
// ---------------------------------------------------------------------

function BudgetSection({ event }: { event: FamilyEvent }) {
  const [items, setItems] = useState<EventBudgetItem[]>([])
  const [spent, setSpent] = useState<number | null>(null)
  // Fase 3 (bug real: un encargo resuelto con proveedor y 100€ no aparecía en Presupuesto aunque sí
  // estaba en Pagos y fianzas) — resolveEventTaskGroup crea el event_payment pero NUNCA toca
  // event_budget_items (ver cabecera de resolveEventTaskGroup): son cosas distintas a propósito. En vez
  // de fusionarlas, se enseña "Comprometido vía encargos" aparte — la suma de total_amount de TODOS los
  // pagos del evento, se hayan pagado ya o no — para que ese compromiso deje de estar invisible sin
  // mezclarse con lo "Planeado" (una intención de presupuesto) ni lo "Gastado en Economía" (dinero que de
  // verdad salió de una cuenta).
  const [committed, setCommitted] = useState<number | null>(null)
  // Fase 9 (Parte D, prompt maestro) — "Pagado" distinto de "Comprometido": cuánto de ese compromiso se
  // ha pagado de verdad ya (suma de depositPaid de los mismos pagos), nunca inventado ni igualado al
  // total — un encargo comprometido a 500€ con 200€ pagados no es "pagado 500€".
  const [paidOfCommitted, setPaidOfCommitted] = useState<number | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Bloque 11 (cola nocturna) — un concepto propuesto por PEPA llega sin importe (plannedAmount:null);
  // sin poder editar una partida ya creada, la única forma de ponerle cifra sería borrarla y rehacerla.
  const [editingItemId, setEditingItemId] = useState<string | null>(null)

  function reload() {
    listEventBudgetItems(event.id)
      .then(setItems)
      .catch((err) => setError(errorMessage(err, 'No se pudo cargar el presupuesto')))
    listEventPayments(event.id)
      .then((payments) => {
        setCommitted(payments.reduce((sum, p) => sum + p.totalAmount, 0))
        setPaidOfCommitted(payments.reduce((sum, p) => sum + p.depositPaid, 0))
      })
      .catch(() => {
        setCommitted(null)
        setPaidOfCommitted(null)
      })
    if (event.tagId) {
      // Petición real: "no sé en qué circunstancias se podría dar que
      // se haga un traspaso entre cuentas por un cumpleaños pero más
      // vale prevenir así que inclúyelo" — mismo criterio que ya usa
      // toda Economía (isInternalTransferCategory): un traspaso entre
      // cuentas propias, si alguna vez llevara esta etiqueta por error,
      // no debe contar como gasto real del evento.
      Promise.all([listExpenses(), listBudgetCategories()])
        .then(([expenses, categories]) =>
          setSpent(
            expenses
              .filter((e) => e.tagId === event.tagId && !e.isIncome && !isInternalTransferCategory(e.category, categories))
              .reduce((sum, e) => sum + e.amount, 0),
          ),
        )
        .catch(() => setSpent(null))
    }
  }
  useEffect(reload, [event.id, event.tagId])

  const planned = items.reduce((sum, i) => sum + (i.plannedAmount ?? 0), 0)

  return (
    <div className="card event-card" style={{ marginTop: 8 }}>
      <strong>💰 Presupuesto</strong>
      <p className="muted" style={{ margin: '4px 0' }}>
        Planeado: <strong>{planned.toFixed(2)} €</strong>
        {spent !== null && (
          <>
            {' · '}Gastado en Economía: <strong>{spent.toFixed(2)} €</strong>
          </>
        )}
      </p>
      {spent !== null && (
        <p className="muted" style={{ fontSize: 12 }}>
          Se suma solo lo etiquetado "{event.title}" en Economía — pon esa etiqueta a los gastos del evento para que cuenten aquí, sin duplicar nada.
        </p>
      )}
      {committed !== null && committed > 0 && (
        <p className="muted" style={{ margin: '4px 0' }}>
          Comprometido vía encargos: <strong>{committed.toFixed(2)} €</strong>
        </p>
      )}
      {committed !== null && committed > 0 && (
        <p className="muted" style={{ fontSize: 12 }}>
          Suma del total de cada pago en "🧾 Pagos y fianzas" (resuelto o no), se haya pagado ya o no — aparte de lo Planeado y de lo Gastado en Economía, nunca sumado con ellos.
        </p>
      )}
      {committed !== null && committed > 0 && paidOfCommitted !== null && (
        <p className="muted" style={{ margin: '4px 0' }}>
          Pagado de lo comprometido: <strong>{paidOfCommitted.toFixed(2)} €</strong> de {committed.toFixed(2)} €
        </p>
      )}
      {error && <p className="error">{error}</p>}
      <div className="event-list">
        {items.map((i) =>
          editingItemId === i.id ? (
            <EditBudgetItemInline key={i.id} item={i} onDone={() => setEditingItemId(null)} onSaved={() => { setEditingItemId(null); reload() }} />
          ) : (
            // Un <div> con onClick, no un <button> — ConfirmIconButton ya monta su propio <button> dentro
            // y HTML no permite anidar botones (mismo patrón que MovementRow, FinanceScreen.tsx).
            <div key={i.id} className="inline-fields" style={{ alignItems: 'center', cursor: 'pointer' }} onClick={() => setEditingItemId(i.id)}>
              <span style={{ flex: 1 }}>{i.category}</span>
              {/* Bloque 11 (cola nocturna) — un concepto propuesto por PEPA (o creado a mano sin importe
                  todavía) tiene plannedAmount:null; nunca se enseña como "0,00 €", que parecería una cifra
                  real puesta a propósito. Tocar la fila la abre para editar (mismo patrón que Movimientos). */}
              <span className={i.plannedAmount == null ? 'muted' : undefined}>{i.plannedAmount == null ? 'Sin importe todavía' : `${i.plannedAmount.toFixed(2)} €`}</span>
              {/* La fila entera abre la edición al tocarla — este botón no debe además "colarse" como un
                  toque a la fila (entraría en edición Y armaría el borrado a la vez). */}
              <span onClick={(e) => e.stopPropagation()}>
                <ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Borrar partida" onConfirm={() => deleteEventBudgetItem(i.id).then(reload)} />
              </span>
            </div>
          ),
        )}
        {items.length === 0 && <p className="muted">Todavía no hay partidas de presupuesto.</p>}
      </div>
      <button type="button" className="link-button" onClick={() => setShowAdd(true)}>
        + Añadir partida
      </button>
      {showAdd && (
        <AddBudgetItemModal
          eventId={event.id}
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false)
            reload()
          }}
        />
      )}
    </div>
  )
}

function AddBudgetItemModal({ eventId, onClose, onAdded }: { eventId: string; onClose: () => void; onAdded: () => void }) {
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!category.trim()) {
      setError('Ponle un nombre a la partida.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      // Bloque 11 (cola nocturna) — un importe en blanco es "todavía no lo sé" (plannedAmount:null),
      // nunca "0,00 €": antes Number('') || 0 colaba un cero silencioso como si fuera una cifra real.
      await addEventBudgetItem(eventId, category, amount.trim() === '' ? null : Number(amount))
      onAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Nueva partida
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <form className="card member-form" onSubmit={handleSubmit}>
          {error && <p className="error">{error}</p>}
          <label>
            Concepto
            <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Tarta, local, invitaciones..." autoFocus />
          </label>
          <label>
            Presupuesto (€)
            <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Añadir'}
          </button>
        </form>
      </div>
    </div>
  )
}

// Bloque 11 (cola nocturna) — edita una partida ya creada, EN LA MISMA FILA (sin modal aparte): es lo
// único que hacía falta para poder ponerle importe real a un concepto que PEPA propuso sin precio (o
// corregir uno ya puesto), sin tener que borrarla y rehacerla.
function EditBudgetItemInline({ item, onDone, onSaved }: { item: EventBudgetItem; onDone: () => void; onSaved: () => void }) {
  const [category, setCategory] = useState(item.category)
  const [amount, setAmount] = useState(item.plannedAmount == null ? '' : String(item.plannedAmount))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!category.trim()) {
      setError('Ponle un nombre a la partida.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateEventBudgetItem(item.id, { category, plannedAmount: amount.trim() === '' ? null : Number(amount) })
      onSaved()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
      setSaving(false)
    }
  }

  return (
    <form className="inline-fields" style={{ alignItems: 'center' }} onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}>
      {error && <p className="error">{error}</p>}
      <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} style={{ flex: 1 }} autoFocus />
      <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Sin importe" style={{ width: 100 }} />
      <button type="submit" disabled={saving}>
        {saving ? 'Guardando…' : 'Guardar'}
      </button>
      <button type="button" className="link-button" onClick={onDone}>
        Cancelar
      </button>
    </form>
  )
}

// ---------------------------------------------------------------------
// Proveedores.
// ---------------------------------------------------------------------

// PEPA Eventos, prompt maestro Parte A7 — "Guardar en contactos" genera un .vcf real (nunca modifica la
// ficha de PEPA) y lo manda al menú nativo de compartir; si el teléfono/navegador no lo soporta, lo
// descarga directamente (en iPhone/Android/ordenador, abrir ese archivo ya ofrece "Añadir a Contactos"
// por sí solo — mejor plan B que un texto suelto). Un solo sitio para las dos pantallas de Proveedores
// (registro global y dentro de un evento), nunca una copia de esta lógica por pantalla.
async function saveProviderToContacts(provider: { name: string; type?: string | null; contactPerson?: string | null; phone?: string | null; email?: string | null; website?: string | null; address?: string | null; notes?: string | null }) {
  const vcf = buildVcf(provider)
  const filename = `${provider.name.replace(/[^\p{L}\p{N} ]/gu, '').trim() || 'proveedor'}.vcf`
  const file = new File([vcf], filename, { type: 'text/vcard;charset=utf-8' })
  if (canShareFiles([file])) {
    const shared = await shareFiles([file], { title: provider.name })
    if (shared) return
  }
  downloadTextFile(filename, vcf, 'text/vcard;charset=utf-8')
}

// PEPA Eventos, prompt maestro Parte A1/A2 — registro GLOBAL de proveedores, accesible desde Eventos →
// Inicio sin depender de entrar en un evento (nunca filtrado por evento). Fase 2 del encargo: CRUD +
// búsqueda funcionando de verdad — el rediseño visual en fichas compactas desplegables (A4) llega en la
// Fase 3, reutilizando esta misma pantalla y datos, nunca un sistema paralelo.
// PEPA — prompt maestro "Continuidad automática", Bloque B1: menú ⋯ de acciones de un proveedor, mismo
// patrón ya usado en Familia (member-row-more/member-row-actions, FamilyScreen.tsx) en vez de inventar
// uno nuevo. Editar, llamar/email/copiar y "Guardar en contactos" son comunes a las 2 pantallas de
// proveedores (registro global y por evento); "extraActions" son las propias de cada una (Desvincular
// aquí, Archivar/Reactivar allá).
function ProviderCardMenu({
  provider,
  open,
  onToggle,
  onEdit,
  extraActions,
}: {
  provider: ProviderGlobal
  open: boolean
  onToggle: () => void
  onEdit: () => void
  extraActions: ReactNode
}) {
  const [copied, setCopied] = useState(false)
  return (
    <>
      <button type="button" className="member-row-more" aria-label={`Acciones de ${provider.name}`} aria-expanded={open} onClick={onToggle}>
        ⋯
      </button>
      {open && (
        <div className="member-row-actions">
          <button type="button" className="link-button" onClick={onEdit}>
            ✏️ Editar
          </button>
          {provider.phone && (
            <a className="link-button" href={`tel:${provider.phone}`}>
              📞 Llamar
            </a>
          )}
          {provider.email && (
            <>
              <a className="link-button" href={`mailto:${provider.email}`}>
                ✉️ Email
              </a>
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  navigator.clipboard
                    .writeText(provider.email!)
                    .then(() => {
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    })
                    .catch(() => {})
                }}
              >
                {copied ? '✓ Copiado' : '📋 Copiar email'}
              </button>
            </>
          )}
          <button type="button" className="link-button" onClick={() => void saveProviderToContacts(provider)}>
            📱 Guardar en contactos
          </button>
          {extraActions}
        </div>
      )}
    </>
  )
}

function ProvidersGlobalScreen({ onBack }: { onBack: () => void }) {
  const [providers, setProviders] = useState<ProviderGlobal[]>([])
  const [query, setQuery] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [showIntro, setShowIntro] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    listProvidersGlobal()
      .then(setProviders)
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar los proveedores')))
  }
  useEffect(reload, [])

  const q = query.trim().toLowerCase()
  const filtered = providers
    .filter((p) => p.archived === showArchived)
    .filter((p) => (q ? [p.name, p.type, p.phone, p.email, p.contactPerson].some((v) => v?.toLowerCase().includes(q)) : true))

  return (
    <div>
      <button type="button" className="link-button" onClick={onBack}>
        ← Volver a Eventos
      </button>
      <h2 className="section-title">📇 Proveedores y ofertas</h2>
      <button type="button" className="link-button" style={{ fontSize: 12 }} onClick={() => setShowIntro((v) => !v)}>
        {showIntro ? '▾' : '▸'} ℹ️ Qué es esto
      </button>
      {showIntro && (
        <p className="muted" style={{ fontSize: 13 }}>
          Toda la agenda de proveedores de la familia, de cualquier evento — un proveedor descartado en una boda sigue aquí para un cumpleaños o una comunión.
        </p>
      )}
      {error && <p className="error">{error}</p>}
      {showAdd ? (
        <AddProviderGlobalForm
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false)
            reload()
          }}
        />
      ) : (
        <button type="button" style={{ marginTop: 8 }} onClick={() => setShowAdd(true)}>
          + Nuevo proveedor
        </button>
      )}
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por nombre, categoría, servicio o teléfono…"
        style={{ marginTop: 8, width: '100%' }}
      />
      <div className="filter-row" style={{ marginTop: 8 }}>
        <button type="button" className={'chip' + (!showArchived ? ' chip-active' : '')} onClick={() => setShowArchived(false)}>
          Activos
        </button>
        <button type="button" className={'chip' + (showArchived ? ' chip-active' : '')} onClick={() => setShowArchived(true)}>
          Archivados
        </button>
      </div>
      <div className="event-list" style={{ marginTop: 8 }}>
        {filtered.length === 0 && (
          <p className="muted">
            {q ? 'Nada coincide con esa búsqueda.' : showArchived ? 'No hay proveedores archivados.' : 'Todavía no hay proveedores — añade el primero.'}
          </p>
        )}
        {filtered.map((p) =>
          editingId === p.id ? (
            <EditProviderGlobalForm key={p.id} provider={p} onDone={() => setEditingId(null)} onSaved={() => { setEditingId(null); reload() }} />
          ) : (
            <div key={p.id} className="card" style={{ padding: 8 }}>
              <div className="inline-fields" style={{ alignItems: 'center' }}>
                <span style={{ flex: 1 }}>
                  <strong>{p.name}</strong>
                  {p.type ? ` · ${p.type}` : ''}
                  {p.phone ? ` · ${p.phone}` : ''}
                </span>
                <ProviderCardMenu
                  provider={p}
                  open={menuOpenId === p.id}
                  onToggle={() => setMenuOpenId((cur) => (cur === p.id ? null : p.id))}
                  onEdit={() => setEditingId(p.id)}
                  extraActions={
                    <ConfirmButton
                      label={p.archived ? '♻️ Reactivar' : '📦 Archivar'}
                      confirmMessage={p.archived ? `¿Reactivar «${p.name}»? Volverá a aparecer en los selectores.` : `¿Archivar «${p.name}»? Deja de aparecer en los selectores, pero conserva su historial.`}
                      onConfirm={() => updateProviderGlobal(p.id, { archived: !p.archived }).then(reload)}
                    />
                  }
                />
              </div>
              {(p.contactPerson || p.email || p.website || p.address) && (
                <p className="muted" style={{ fontSize: 12, margin: '2px 0' }}>
                  {[p.contactPerson, p.email, p.website, p.address].filter(Boolean).join(' · ')}
                </p>
              )}
              {p.notes && (
                <p className="muted" style={{ fontSize: 12, margin: '2px 0' }}>
                  📝 {p.notes}
                </p>
              )}
              <ProviderOffersPanel eventId={null} globalProviderId={p.id} providerName={p.name} />
            </div>
          ),
        )}
      </div>
    </div>
  )
}

function AddProviderGlobalForm({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')
  const [address, setAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // PEPA Eventos, prompt maestro Parte A6 — "Importar datos con foto" solo rellena lo que esté VACÍO:
  // nunca sobrescribe algo que la familia ya haya escrito a mano, sin avisar.
  const [importedExtra, setImportedExtra] = useState(false)
  function applyImported(r: ProviderContactScanResult) {
    if (!name && r.name) setName(r.name)
    if (!type && r.type) setType(r.type)
    if (!contactPerson && r.contactPerson) setContactPerson(r.contactPerson)
    if (!phone && r.phone) setPhone(r.phone)
    if (!email && r.email) setEmail(r.email)
    if (!website && r.website) setWebsite(r.website)
    if (!address && r.address) setAddress(r.address)
    if (r.contactPerson || r.phone || r.email || r.website || r.address) setImportedExtra(true)
  }

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!name.trim()) {
      setError('Ponle un nombre.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await addProviderGlobal({
        name,
        type: type || null,
        contactPerson: contactPerson || null,
        phone: phone || null,
        email: email || null,
        website: website || null,
        address: address || null,
      })
      onAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="card member-form" style={{ padding: 8, marginTop: 6 }} onSubmit={handleSubmit}>
      {error && <p className="error">{error}</p>}
      <ImportProviderPhotoButton onImported={applyImported} />
      <label>
        Nombre
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      <label style={{ marginTop: 6 }}>
        Categoría o servicio (opcional)
        <input type="text" value={type} onChange={(e) => setType(e.target.value)} placeholder="Catering, fotógrafo, floristería..." />
      </label>
      <ProviderExtraFields
        contactPerson={contactPerson}
        setContactPerson={setContactPerson}
        phone={phone}
        setPhone={setPhone}
        email={email}
        setEmail={setEmail}
        website={website}
        setWebsite={setWebsite}
        address={address}
        setAddress={setAddress}
        forceOpen={importedExtra}
      />
      <div className="filter-row" style={{ marginTop: 8 }}>
        <button type="submit" disabled={saving}>
          {saving ? 'Guardando…' : 'Añadir proveedor'}
        </button>
        <button type="button" className="link-button" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function EditProviderGlobalForm({ provider, onDone, onSaved }: { provider: ProviderGlobal; onDone: () => void; onSaved: () => void }) {
  const [name, setName] = useState(provider.name)
  const [type, setType] = useState(provider.type ?? '')
  const [contactPerson, setContactPerson] = useState(provider.contactPerson ?? '')
  const [phone, setPhone] = useState(provider.phone ?? '')
  const [email, setEmail] = useState(provider.email ?? '')
  const [website, setWebsite] = useState(provider.website ?? '')
  const [address, setAddress] = useState(provider.address ?? '')
  const [notes, setNotes] = useState(provider.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hadExtraData = Boolean(provider.contactPerson || provider.phone || provider.email || provider.website || provider.address)

  async function save() {
    if (!name.trim()) {
      setError('Ponle un nombre.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateProviderGlobal(provider.id, {
        name,
        type: type || null,
        contactPerson: contactPerson || null,
        phone: phone || null,
        email: email || null,
        website: website || null,
        address: address || null,
        notes: notes || null,
      })
      onSaved()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card member-form" style={{ padding: 8 }}>
      {error && <p className="error">{error}</p>}
      <label>
        Nombre
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      <label style={{ marginTop: 6 }}>
        Categoría o servicio (opcional)
        <input type="text" value={type} onChange={(e) => setType(e.target.value)} placeholder="Catering, fotógrafo, floristería..." />
      </label>
      <ProviderExtraFields
        contactPerson={contactPerson}
        setContactPerson={setContactPerson}
        phone={phone}
        setPhone={setPhone}
        email={email}
        setEmail={setEmail}
        website={website}
        setWebsite={setWebsite}
        address={address}
        setAddress={setAddress}
        forceOpen={hadExtraData}
      />
      <label style={{ marginTop: 6 }}>
        Notas (opcional)
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </label>
      <div className="filter-row" style={{ marginTop: 8 }}>
        <button type="button" onClick={() => void save()} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="link-button" onClick={onDone}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

// PEPA Eventos, prompt maestro Parte A3 — dentro de un evento se ve EXCLUSIVAMENTE lo vinculado a él: los
// proveedores de la agenda familiar (registro global, Fase 2) con los que este evento tiene relación,
// nunca los de otros eventos. "De interés"/"Todos"/"Descartados" es el estado LOCAL de ese vínculo
// (event_provider_links) — descartar o desvincular aquí nunca borra nada del registro global ni afecta a
// otros eventos (A3: "un proveedor descartado para una boda puede volver a ser útil para un cumpleaños").
// La ficha que se edita es siempre la global (EditProviderGlobalForm, ya usada en Proveedores y ofertas
// de Inicio) — una sola fuente de datos, nunca un duplicado por evento.
function ProvidersSection({ eventId }: { eventId: string }) {
  const [links, setLinks] = useState<EventProviderLink[]>([])
  const [globals, setGlobals] = useState<ProviderGlobal[]>([])
  const [habitualCounts, setHabitualCounts] = useState<Map<string, number>>(new Map())
  const [filter, setFilter] = useState<EventProviderLinkStatus | 'todos'>('interesado')
  const [editingGlobalId, setEditingGlobalId] = useState<string | null>(null)
  const [showLink, setShowLink] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [showIntro, setShowIntro] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    Promise.all([listEventProviderLinks(eventId), listProvidersGlobal()])
      .then(([ls, gs]) => {
        setLinks(ls)
        setGlobals(gs)
        // A2: "habitual" = vinculado a 2 o más eventos — se calcula, nunca se guarda aparte (no hay
        // marca que desincronizar). N llamadas pequeñas (una por proveedor vinculado aquí), nunca un
        // listado global de todos los vínculos de la familia.
        Promise.all(ls.map((l) => countProviderGlobalEventLinks(l.globalProviderId).then((n) => [l.globalProviderId, n] as const)))
          .then((pairs) => setHabitualCounts(new Map(pairs)))
          .catch(() => {})
      })
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar los proveedores')))
  }
  useEffect(reload, [eventId])

  const globalById = new Map(globals.map((g) => [g.id, g]))
  const visibleLinks = links.filter((l) => (filter === 'todos' ? true : l.status === filter))
  const descartadosCount = links.filter((l) => l.status === 'descartado').length
  const linkedGlobalIds = new Set(links.map((l) => l.globalProviderId))
  const availableToLink = globals.filter((g) => !g.archived && !linkedGlobalIds.has(g.id))

  async function handleLink(global: ProviderGlobal) {
    setError(null)
    try {
      await linkProviderGlobalToEvent(eventId, global)
      setShowLink(false)
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo vincular'))
    }
  }

  async function handleToggleDiscard(link: EventProviderLink) {
    setError(null)
    try {
      await setEventProviderLinkStatus(link.id, link.status === 'descartado' ? 'interesado' : 'descartado')
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo cambiar el estado'))
    }
  }

  return (
    <div className="card event-card" style={{ marginTop: 8 }}>
      <strong>📇 Proveedores y ofertas</strong>
      <button type="button" className="link-button" style={{ fontSize: 11, display: 'block', margin: '2px 0' }} onClick={() => setShowIntro((v) => !v)}>
        {showIntro ? '▾' : '▸'} ℹ️ Qué es esto
      </button>
      {showIntro && (
        <p className="muted" style={{ fontSize: 12, margin: '2px 0 6px' }}>
          Proveedores de la agenda familiar vinculados a este evento. Descartar aquí no los borra del registro global — siguen disponibles para otros eventos.
        </p>
      )}
      {error && <p className="error">{error}</p>}
      <div className="filter-row" style={{ flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setShowAdd(true)}>
          + Nuevo proveedor
        </button>
        <button type="button" onClick={() => setShowLink(true)}>
          + Vincular proveedor existente
        </button>
      </div>
      {showAdd && (
        <AddProviderAndLinkForm
          eventId={eventId}
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false)
            reload()
          }}
        />
      )}
      {showLink && (
        <LinkExistingProviderForm
          options={availableToLink}
          onClose={() => setShowLink(false)}
          onLink={handleLink}
        />
      )}
      <div className="filter-row" style={{ flexWrap: 'wrap', marginTop: 8 }}>
        <button type="button" className={'chip' + (filter === 'interesado' ? ' chip-active' : '')} onClick={() => setFilter('interesado')}>
          De interés
        </button>
        <button type="button" className={'chip' + (filter === 'todos' ? ' chip-active' : '')} onClick={() => setFilter('todos')}>
          Todos
        </button>
        <button type="button" className={'chip' + (filter === 'descartado' ? ' chip-active' : '')} onClick={() => setFilter('descartado')}>
          Descartados{descartadosCount > 0 ? ` (${descartadosCount})` : ''}
        </button>
      </div>
      <div className="event-list" style={{ marginTop: 8 }}>
        {visibleLinks.length === 0 && (
          <p className="muted">
            {filter === 'descartado'
              ? 'No hay proveedores descartados.'
              : filter === 'interesado'
                ? 'Todavía no hay proveedores de interés — vincula uno del registro familiar o crea uno nuevo.'
                : 'Todavía no hay proveedores vinculados a este evento.'}
          </p>
        )}
        {visibleLinks.map((link) => {
          const g = globalById.get(link.globalProviderId)
          if (!g) return null
          return editingGlobalId === g.id ? (
            <EditProviderGlobalForm key={link.id} provider={g} onDone={() => setEditingGlobalId(null)} onSaved={() => { setEditingGlobalId(null); reload() }} />
          ) : (
            <div key={link.id} className="card" style={{ padding: 8, opacity: link.status === 'descartado' ? 0.7 : 1 }}>
              <div className="inline-fields" style={{ alignItems: 'center' }}>
                <span style={{ flex: 1 }}>
                  <strong>{g.name}</strong>
                  {g.type ? ` · ${g.type}` : ''}
                  {g.phone ? ` · ${g.phone}` : ''}
                  {(habitualCounts.get(g.id) ?? 0) >= 2 ? ' · ⭐ Habitual' : ''}
                </span>
                <ProviderCardMenu
                  provider={g}
                  open={menuOpenId === link.id}
                  onToggle={() => setMenuOpenId((cur) => (cur === link.id ? null : link.id))}
                  onEdit={() => setEditingGlobalId(g.id)}
                  extraActions={
                    <>
                      <button type="button" className="link-button" onClick={() => void handleToggleDiscard(link)}>
                        {link.status === 'descartado' ? '↩️ Recuperar' : '🗑 Descartar'}
                      </button>
                      <ConfirmButton
                        label="Desvincular"
                        confirmMessage={`¿Desvincular «${g.name}» de este evento? Sigue disponible en el registro familiar.`}
                        onConfirm={() => unlinkProviderFromEvent(link.id).then(reload)}
                      />
                    </>
                  }
                />
              </div>
              {(g.contactPerson || g.email || g.website || g.address) && (
                <p className="muted" style={{ fontSize: 12, margin: '2px 0' }}>
                  {[g.contactPerson, g.email, g.website, g.address].filter(Boolean).join(' · ')}
                </p>
              )}
              <ProviderOffersPanel eventId={eventId} globalProviderId={g.id} providerName={g.name} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function LinkExistingProviderForm({ options, onClose, onLink }: { options: ProviderGlobal[]; onClose: () => void; onLink: (g: ProviderGlobal) => void }) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const filtered = options.filter((g) => (q ? [g.name, g.type, g.phone].some((v) => v?.toLowerCase().includes(q)) : true))
  return (
    <div className="card member-form" style={{ padding: 8, marginTop: 6 }}>
      <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar en el registro familiar…" autoFocus style={{ width: '100%' }} />
      <div className="event-list" style={{ marginTop: 6, maxHeight: 220, overflowY: 'auto' }}>
        {filtered.length === 0 && (
          <p className="muted" style={{ fontSize: 12 }}>
            {options.length === 0 ? 'Todos los proveedores de la familia ya están vinculados a este evento.' : 'Nada coincide con esa búsqueda.'}
          </p>
        )}
        {filtered.map((g) => (
          <button key={g.id} type="button" className="link-button" style={{ display: 'block', width: '100%', textAlign: 'left' }} onClick={() => onLink(g)}>
            {g.name}
            {g.type ? ` · ${g.type}` : ''}
          </button>
        ))}
      </div>
      <button type="button" className="link-button" onClick={onClose} style={{ marginTop: 6 }}>
        Cancelar
      </button>
    </div>
  )
}

function AddProviderAndLinkForm({ eventId, onClose, onAdded }: { eventId: string; onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')
  const [address, setAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // PEPA Eventos, prompt maestro Parte A6 — "Importar datos con foto" solo rellena lo que esté VACÍO:
  // nunca sobrescribe algo que la familia ya haya escrito a mano, sin avisar.
  const [importedExtra, setImportedExtra] = useState(false)
  function applyImported(r: ProviderContactScanResult) {
    if (!name && r.name) setName(r.name)
    if (!type && r.type) setType(r.type)
    if (!contactPerson && r.contactPerson) setContactPerson(r.contactPerson)
    if (!phone && r.phone) setPhone(r.phone)
    if (!email && r.email) setEmail(r.email)
    if (!website && r.website) setWebsite(r.website)
    if (!address && r.address) setAddress(r.address)
    if (r.contactPerson || r.phone || r.email || r.website || r.address) setImportedExtra(true)
  }

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!name.trim()) {
      setError('Ponle un nombre.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const global = await addProviderGlobal({
        name,
        type: type || null,
        contactPerson: contactPerson || null,
        phone: phone || null,
        email: email || null,
        website: website || null,
        address: address || null,
      })
      await linkProviderGlobalToEvent(eventId, global)
      onAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="card member-form" style={{ padding: 8, marginTop: 6 }} onSubmit={handleSubmit}>
      {error && <p className="error">{error}</p>}
      <ImportProviderPhotoButton onImported={applyImported} />
      <label>
        Nombre
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      <label style={{ marginTop: 6 }}>
        Categoría o servicio (opcional)
        <input type="text" value={type} onChange={(e) => setType(e.target.value)} placeholder="Catering, fotógrafo, floristería..." />
      </label>
      <ProviderExtraFields
        contactPerson={contactPerson}
        setContactPerson={setContactPerson}
        phone={phone}
        setPhone={setPhone}
        email={email}
        setEmail={setEmail}
        website={website}
        setWebsite={setWebsite}
        address={address}
        setAddress={setAddress}
        forceOpen={importedExtra}
      />
      <p className="muted" style={{ fontSize: 11, marginTop: 4 }}>
        Se guarda en el registro familiar — podrás reutilizarlo en otros eventos más adelante.
      </p>
      <div className="filter-row" style={{ marginTop: 8 }}>
        <button type="submit" disabled={saving}>
          {saving ? 'Guardando…' : 'Añadir y vincular'}
        </button>
        <button type="button" className="link-button" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

// PEPA Eventos, prompt maestro Parte A6 — "Importar datos con foto": fotografía de una tarjeta de visita,
// captura de Google Maps o documento similar → IA (analyze-provider-contact-document) extrae los datos →
// REVISIÓN EDITABLE → solo al pulsar "Usar estos datos" se aplican al formulario (onImported). Nunca se
// aplica solo: ver el merge en cada formulario (solo rellena campos que el usuario tenga vacíos, nunca
// sobrescribe algo ya escrito sin avisar).
function ImportProviderPhotoButton({ onImported }: { onImported: (result: ProviderContactScanResult) => void }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ProviderContactScanResult | null>(null)

  async function handleFile(file: File) {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const scanned = await analyzeProviderContactDocument(file)
      if (!scanned.name && !scanned.phone && !scanned.email && !scanned.address && !scanned.website && !scanned.contactPerson) {
        setError('No se ha podido leer ningún dato en esta imagen — prueba con otra foto, o rellena los datos a mano.')
      } else {
        setResult(scanned)
      }
    } catch (err) {
      setError(errorMessage(err, 'No se pudo leer el documento'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card" style={{ padding: 8, marginTop: 6 }}>
      {/* PEPA — prompt maestro B5: mismo selector de Cámara/Galería/Archivo de siempre, nunca un
          <input type=file> suelto aparte. */}
      <FileOrPdfPicker
        file={null}
        sheetTitle="Importar datos del proveedor"
        onChange={(file) => {
          if (file) void handleFile(file)
        }}
      />
      {loading && (
        <p className="muted" style={{ fontSize: 12 }}>
          Leyendo la imagen…
        </p>
      )}
      {error && (
        <p className="error" style={{ fontSize: 12 }}>
          {error}
        </p>
      )}
      {result && (
        <div className="card" style={{ padding: 8, marginTop: 6 }}>
          <p className="muted" style={{ fontSize: 12 }}>
            Esto es lo que se ha leído — revísalo, podrás corregirlo después:
          </p>
          <p style={{ fontSize: 13, margin: '2px 0' }}>
            {[result.name, result.type, result.contactPerson, result.phone, result.email, result.website, result.address].filter(Boolean).join(' · ')}
          </p>
          <div className="filter-row">
            <button
              type="button"
              className="link-button"
              onClick={() => {
                onImported(result)
                setResult(null)
              }}
            >
              Usar estos datos
            </button>
            <button type="button" className="link-button" onClick={() => setResult(null)}>
              Descartar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Campos ampliados (Fase 5): plegados detrás de "+ Más datos" salvo que el proveedor ya tenga alguno
// rellenado — mismo criterio de "low-effort path por defecto" que el resto de la app (petición real:
// app para usuarios perezosos, no un formulario de empresa).
function ProviderExtraFields({
  contactPerson,
  setContactPerson,
  phone,
  setPhone,
  email,
  setEmail,
  website,
  setWebsite,
  address,
  setAddress,
  forceOpen,
}: {
  contactPerson: string
  setContactPerson: (v: string) => void
  phone: string
  setPhone: (v: string) => void
  email: string
  setEmail: (v: string) => void
  website: string
  setWebsite: (v: string) => void
  address: string
  setAddress: (v: string) => void
  forceOpen: boolean
}) {
  const [open, setOpen] = useState(forceOpen)
  // PEPA Eventos, prompt maestro Parte A6 — "Importar datos con foto" puede rellenar estos campos
  // mientras siguen plegados; forceOpen reacciona (no solo el valor inicial) para que la familia vea de
  // inmediato lo que se acaba de importar, sin tener que adivinar que hay que desplegar "+ Más datos".
  useEffect(() => {
    if (forceOpen) setOpen(true)
  }, [forceOpen])
  if (!open) {
    return (
      <button type="button" className="link-button" onClick={() => setOpen(true)}>
        + Más datos (persona de contacto, teléfono, email, web, dirección)
      </button>
    )
  }
  return (
    <>
      <label>
        Persona de contacto (opcional)
        <input type="text" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
      </label>
      <label>
        Teléfono / WhatsApp (opcional)
        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </label>
      <label>
        Email (opcional)
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>
        Web (opcional)
        <input type="text" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://..." />
      </label>
      <label>
        Dirección (opcional)
        <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} />
      </label>
    </>
  )
}

// ---------------------------------------------------------------------
// Pagos / fianzas.
// ---------------------------------------------------------------------

// Status según los importes, igual que ya calcula addEventPayment al crear uno — reutilizado aquí para
// que editar el importe pagado a mano (Fase 2, "corregir un pagado del todo por error") recalcule el
// mismo estado, en vez de dejarlo desincronizado.
function paymentStatusForAmounts(totalAmount: number, depositPaid: number): EventPaymentStatus {
  return depositPaid <= 0 ? 'pendiente' : depositPaid >= totalAmount ? 'pagado' : 'parcial'
}

const PAYMENT_STATUS_LABELS: Record<EventPaymentStatus, string> = {
  pendiente: '⏳ Pendiente',
  parcial: '◐ Parcial',
  pagado: '✓ Pagado',
}

function PaymentsSection({ event }: { event: FamilyEvent }) {
  const eventId = event.id
  const [payments, setPayments] = useState<EventPayment[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linkingReminderId, setLinkingReminderId] = useState<string | null>(null)
  // Fase 2 (bug real: "pagado del todo" sin forma de corregirlo) — editar el importe pagado está SIEMPRE
  // disponible, nunca solo mientras remaining > 0, para poder deshacer una marca accidental sin borrar el
  // pago entero.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  // Fase 9 (Parte E, prompt maestro) — tarjetas compactas plegables (mismo patrón ▸/▾ ya usado en
  // Ofertas/Servicios) + un filtro simple por estado, para no tener que desplazarse entre todos los pagos
  // solo para ver los pendientes. Nunca genera movimientos bancarios — eso no cambia aquí.
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<'todos' | 'pendientes' | 'pagados'>('todos')

  function toggleOpen(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function reload() {
    listEventPayments(eventId)
      .then(setPayments)
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar los pagos')))
  }
  useEffect(reload, [eventId])

  async function handleRemindPayment(p: EventPayment) {
    setLinkingReminderId(p.id)
    setError(null)
    try {
      await linkPaymentReminder(p, event.title)
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo poner el recordatorio'))
    } finally {
      setLinkingReminderId(null)
    }
  }

  async function saveEditingDeposit(p: EventPayment) {
    const depositPaid = Number(editingValue)
    if (Number.isNaN(depositPaid) || depositPaid < 0) {
      setError('El importe pagado no es válido.')
      return
    }
    try {
      await updateEventPayment(p.id, { depositPaid, status: paymentStatusForAmounts(p.totalAmount, depositPaid) })
      setEditingId(null)
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo corregir el importe pagado'))
    }
  }

  const pendingCount = payments.filter((p) => p.status !== 'pagado').length
  const visiblePayments = payments.filter((p) => (filter === 'todos' ? true : filter === 'pagados' ? p.status === 'pagado' : p.status !== 'pagado'))

  return (
    <div className="card event-card" style={{ marginTop: 8 }}>
      <strong>🧾 Pagos y fianzas</strong>
      {error && <p className="error">{error}</p>}
      {payments.length > 0 && (
        <div className="filter-row" style={{ marginTop: 6, flexWrap: 'wrap' }}>
          <button type="button" className={'chip' + (filter === 'todos' ? ' chip-active' : '')} onClick={() => setFilter('todos')}>
            Todos
          </button>
          <button type="button" className={'chip' + (filter === 'pendientes' ? ' chip-active' : '')} onClick={() => setFilter('pendientes')}>
            Pendientes{pendingCount > 0 ? ` (${pendingCount})` : ''}
          </button>
          <button type="button" className={'chip' + (filter === 'pagados' ? ' chip-active' : '')} onClick={() => setFilter('pagados')}>
            Pagados del todo
          </button>
        </div>
      )}
      <div className="event-list" style={{ marginTop: 8 }}>
        {visiblePayments.map((p) => {
          const remaining = p.totalAmount - p.depositPaid
          const open = openIds.has(p.id)
          return (
            <div key={p.id} className="card task-card">
              <div className="inline-fields" style={{ alignItems: 'center', cursor: 'pointer', width: '100%' }} onClick={() => toggleOpen(p.id)}>
                <span style={{ flex: 1 }}>
                  {open ? '▾' : '▸'} <strong>{p.concept}</strong>
                  {p.providerName && <span className="muted" style={{ fontSize: 12 }}> · {p.providerName}</span>}
                </span>
                <span className="muted" style={{ fontSize: 12 }}>
                  {p.totalAmount.toFixed(2)} € · {PAYMENT_STATUS_LABELS[p.status]}
                </span>
              </div>
              {open && (
                <div className="task-card-main" style={{ width: '100%', marginTop: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <span onClick={(e) => e.stopPropagation()}>
                      <ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Borrar pago" onConfirm={() => deleteEventPayment(p.id).then(reload)} />
                    </span>
                  </div>
                  {editingId === p.id ? (
                    <div className="inline-fields" style={{ alignItems: 'center', margin: '2px 0' }}>
                      <span className="muted">{p.totalAmount.toFixed(2)} € · pagado</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        style={{ width: 90 }}
                        autoFocus
                      />
                      <button type="button" className="link-button" onClick={() => saveEditingDeposit(p)}>
                        Guardar
                      </button>
                      <button type="button" className="link-button" onClick={() => setEditingId(null)}>
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <p className="muted" style={{ margin: '2px 0' }}>
                      {p.totalAmount.toFixed(2)} € · pagado {p.depositPaid.toFixed(2)} € · pendiente {remaining.toFixed(2)} €
                      {p.dueDate ? ` · vence ${p.dueDate}` : ''}
                      {' · '}
                      <button
                        type="button"
                        className="link-button"
                        style={{ display: 'inline', padding: 0 }}
                        onClick={() => {
                          setEditingId(p.id)
                          setEditingValue(String(p.depositPaid))
                        }}
                      >
                        ✏️ Corregir lo pagado
                      </button>
                    </p>
                  )}
                  {remaining > 0 && (
                    <ConfirmButton
                      label="Marcar como pagado del todo"
                      confirmMessage={`¿Marcar los ${remaining.toFixed(2)} € que quedan como pagados (total ${p.totalAmount.toFixed(2)} €)?`}
                      onConfirm={() => updateEventPayment(p.id, { depositPaid: p.totalAmount, status: 'pagado' }).then(reload)}
                    />
                  )}
                  {p.dueDate && remaining > 0 && !p.reminderCalendarEventId && (
                    <button type="button" className="link-button" onClick={() => handleRemindPayment(p)} disabled={linkingReminderId === p.id}>
                      {linkingReminderId === p.id ? 'Poniendo…' : '🔔 Recordarme'}
                    </button>
                  )}
                  {p.reminderCalendarEventId && <span className="muted" style={{ fontSize: 12 }}>🔔 Recordatorio puesto</span>}
                </div>
              )}
            </div>
          )
        })}
        {visiblePayments.length === 0 && (
          <p className="muted">
            {filter === 'todos' ? 'Todavía no hay pagos apuntados.' : filter === 'pendientes' ? 'No hay pagos pendientes.' : 'Todavía no hay ningún pago marcado como pagado del todo.'}
          </p>
        )}
      </div>
      <button type="button" className="link-button" onClick={() => setShowAdd(true)}>
        + Añadir pago
      </button>
      {showAdd && (
        <AddPaymentModal
          eventId={eventId}
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false)
            reload()
          }}
        />
      )}
    </div>
  )
}

function AddPaymentModal({ eventId, onClose, onAdded }: { eventId: string; onClose: () => void; onAdded: () => void }) {
  const [concept, setConcept] = useState('')
  const [totalAmount, setTotalAmount] = useState('')
  const [depositPaid, setDepositPaid] = useState('0')
  const [dueDate, setDueDate] = useState('')
  const [providerId, setProviderId] = useState('')
  const [providers, setProviders] = useState<EventProvider[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listEventProviders(eventId).then((all) => setProviders(all.filter((p) => !p.archived))).catch(() => {})
  }, [eventId])

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!concept.trim()) {
      setError('Ponle un concepto.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const provider = providerId ? providers.find((p) => p.id === providerId) : undefined
      await addEventPayment(eventId, {
        concept,
        totalAmount: Number(totalAmount) || 0,
        depositPaid: Number(depositPaid) || 0,
        dueDate: dueDate || null,
        providerId: provider?.id ?? null,
        providerName: provider?.name ?? null,
      })
      onAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Nuevo pago
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <form className="card member-form" onSubmit={handleSubmit}>
          {error && <p className="error">{error}</p>}
          <label>
            Concepto
            <input type="text" value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Fianza del local..." autoFocus />
          </label>
          <div className="inline-fields">
            <label style={{ flex: 1 }}>
              Total (€)
              <input type="number" min={0} step="0.01" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} />
            </label>
            <label style={{ flex: 1 }}>
              Ya pagado (€)
              <input type="number" min={0} step="0.01" value={depositPaid} onChange={(e) => setDepositPaid(e.target.value)} />
            </label>
          </div>
          <label>
            Vence (opcional)
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
          {providers.length > 0 && (
            <label>
              Proveedor (opcional)
              <select value={providerId} onChange={(e) => setProviderId(e.target.value)}>
                <option value="">Sin proveedor</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Añadir'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Invitaciones + RSVP público (Fase 2) — plantilla rellenable (tema de
// color, texto autorrelleno editable) y enlace personalizado por
// invitado, compartido con el menú nativo del móvil. El editor en
// capas de verdad (arrastrar/pellizcar/rotar) llega en la Fase 3.
// ---------------------------------------------------------------------

function InvitationModal({
  event,
  guest,
  onClose,
  onCreateInvitation,
}: {
  event: FamilyEvent
  guest: EventGuest
  onClose: () => void
  onCreateInvitation: () => void
}) {
  const sortedTemplates = useMemo(() => sortInvitationTemplatesForEvent(INVITATION_TEMPLATES, event), [event])
  const [templateKey, setTemplateKey] = useState(sortedTemplates[0].key)
  const [message, setMessage] = useState('¡Nos encantaría contar contigo!')
  const [rsvpUrl, setRsvpUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [manualShare, setManualShare] = useState<{ title: string; text: string } | null>(null)
  const [customCanvas, setCustomCanvas] = useState<InvitationCanvas | null>(null)
  const [customTemplateKey, setCustomTemplateKey] = useState<string | null>(null)
  const [customBackgroundUrl, setCustomBackgroundUrl] = useState<string | null>(null)
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  // Cierre de Fase 2 — event_moments es la fuente de verdad cuando existe; eventLocationLines/
  // eventLocationMapLines (heredadas) solo se usan si el evento todavía no tiene momentos reales.
  const [moments, setMoments] = useState<EventMoment[]>([])
  const [guestMomentLinks, setGuestMomentLinks] = useState<EventGuestMoment[]>([])

  useEffect(() => {
    getGuestRsvpUrl(guest.id)
      .then(setRsvpUrl)
      .catch((err) => setError(errorMessage(err, 'No se pudo generar el enlace')))
      .finally(() => setLoading(false))
    listEventMoments(event.id).then(setMoments).catch(() => {})
    listEventGuestMoments(event.id).then(setGuestMomentLinks).catch(() => {})
    // El diseño en capas (Fase 3) es opcional — si no se ha creado
    // ninguno todavía, seguimos con la tarjeta de tema simple de
    // siempre; un fallo aquí no debe bloquear el enlace de RSVP.
    getEventInvitation(event.id)
      .then(async (invitation) => {
        // Mismo criterio que InvitationSection: un diseño hecho solo de foto de fondo (sin capas encima)
        // también es un diseño real — no solo "hay capas".
        if (!invitation || (invitation.canvas.layers.length === 0 && !invitation.backgroundImagePath)) return
        setCustomCanvas(invitation.canvas)
        setCustomTemplateKey(invitation.templateKey)
        if (invitation.backgroundImagePath) {
          getInvitationPhotoUrl(invitation.backgroundImagePath)
            .then(setCustomBackgroundUrl)
            .catch(() => {})
        }
        const paths = invitation.canvas.layers.map((l) => l.photoPath).filter((p): p is string => !!p)
        const urls = await Promise.all(paths.map((p) => getInvitationPhotoUrl(p).catch(() => null)))
        const map: Record<string, string> = {}
        paths.forEach((p, i) => {
          if (urls[i]) map[p] = urls[i] as string
        })
        setPhotoUrls(map)
      })
      .catch(() => {})
  }, [guest.id, event.id])

  const template = INVITATION_TEMPLATES.find((t) => t.key === templateKey) ?? INVITATION_TEMPLATES[0]
  const resolvedMoments = resolveEventMoments(event, moments)
  const usingRealMoments = hasRealMoments(resolvedMoments)
  const guestMoments = resolveGuestInvitedMoments(guest, resolvedMoments, guestMomentLinks)
  const infoLines = [eventDateLine(event), ...(usingRealMoments ? momentsLocationLines(guestMoments, event.dateStatus) : eventLocationLines(event, guest))]

  // Petición real: "prepara que cuando se mande la invitación se mande
  // automáticamente también la ubicación" — la invitación es una
  // imagen (no se puede hacer clicable nada dentro), así que el enlace
  // de mapa real va en el mismo texto que la acompaña al compartir, no
  // hace falta un paso aparte.
  function buildShareText(): string {
    const mapLines = usingRealMoments ? momentsLocationMapLines(guestMoments) : eventLocationMapLines(event, guest)
    return [`${EVENT_TYPE_META[event.type].icon} ${event.title}`, ...infoLines, ...mapLines, '', message, '', `Confirma tu asistencia aquí: ${rsvpUrl}`].join('\n')
  }

  async function handleShare() {
    if (!rsvpUrl) return
    setSharing(true)
    setNotice(null)
    try {
      // Bloque 1 (cola nocturna) — si hay un diseño propio (customCanvas), se intenta adjuntar también la
      // imagen (PNG) de la invitación, no solo el texto. Si la generación de la imagen falla por lo que sea
      // (red, plantilla rara, librería de captura) o el navegador no puede compartir archivos aquí, se cae
      // sin más al plan de siempre (solo texto) — nunca bloquea el envío por no conseguir la imagen.
      const text = buildShareText()
      if (customCanvas) {
        const file = await exportInvitationImage({
          canvas: customCanvas,
          templateKey: customTemplateKey,
          photoUrls,
          backgroundImageUrl: customBackgroundUrl,
          eventTitle: event.title,
        })
        if (file && canShareFiles([file])) {
          const shown = await shareFiles([file], { title: event.title, text })
          if (shown) {
            setNotice(null)
            return
          }
        }
      }
      const shown = await shareText({ title: event.title, text })
      setNotice(shown ? null : 'Copiado al portapapeles.')
    } catch {
      setManualShare({ title: event.title, text: buildShareText() })
    } finally {
      setSharing(false)
    }
  }

  async function handleRegenerate() {
    setLoading(true)
    setError(null)
    try {
      const url = await regenerateGuestRsvpUrl(guest.id)
      setRsvpUrl(url)
      setNotice('Enlace nuevo generado — el anterior ha dejado de funcionar.')
    } catch (err) {
      setError(errorMessage(err, 'No se pudo regenerar'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Invitación para {guest.displayName}
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        {notice && <p className="points-badge">{notice}</p>}

        {customCanvas ? (
          <InvitationCanvasView canvas={customCanvas} templateKey={customTemplateKey} photoUrls={photoUrls} backgroundImageUrl={customBackgroundUrl} />
        ) : (
          <>
            <p className="muted" style={{ fontSize: 13 }}>Elige un tema — el texto sale relleno solo, y se puede editar antes de mandarlo.</p>
            <button
              type="button"
              className="link-button"
              onClick={() => {
                onClose()
                onCreateInvitation()
              }}
            >
              🎨 Crear invitación con foto, texto y emoji a tu gusto
            </button>
            <InvitationTemplatePicker templates={sortedTemplates} selectedKey={templateKey} onSelect={(t) => setTemplateKey(t.key)} />

            <div
              style={{
                position: 'relative',
                overflow: 'hidden',
                marginTop: 12,
                borderRadius: 16,
                padding: 20,
                background: template.gradient,
                color: template.text,
                textAlign: 'center',
                aspectRatio: template.imageAspect ? `${template.imageAspect} / 1` : '3 / 4',
              }}
            >
              <InvitationBackground templateKey={template.key} />
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ fontSize: 28 }}>{EVENT_TYPE_META[event.type].icon}</div>
                <strong style={{ fontSize: 18 }}>{event.title}</strong>
                {infoLines.map((l) => (
                  <p key={l} style={{ margin: '6px 0', fontSize: 13, opacity: 0.9 }}>
                    {l}
                  </p>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Validación real en iPhone: "quiero añadir una firma de marca pequeña y elegante, asociada a la
            invitación/mensaje" — nunca dentro del lienzo (nunca una InvitationLayer, nunca toca el diseño
            del usuario ni el PNG exportado) ni en el texto de WhatsApp (un mensaje de texto no puede
            incrustar el logo real, y "usar el asset oficial" exige una imagen) — vive aquí, en la propia
            tarjeta de la app donde se revisa la invitación antes de compartirla. Mismo asset oficial que el
            resto de la marca (pepa-face-reference-official, ver InvitationModal/RsvpFooter/LoginScreen —
            una única fuente visual, nunca un dibujo nuevo ni un emoji sustituto). */}
        <p className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginTop: 8 }}>
          <img src={pepaFaceReference} alt="" style={{ width: 16, height: 16, borderRadius: '50%' }} />
          Creado con PEPA
        </p>

        <label style={{ marginTop: 12, display: 'block' }}>
          Mensaje
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} />
        </label>

        <p className="muted" style={{ fontSize: 12, marginTop: 8, wordBreak: 'break-all' }}>
          {loading ? 'Generando enlace de confirmación…' : rsvpUrl}
        </p>

        <button type="button" onClick={handleShare} disabled={loading || sharing || !rsvpUrl} style={{ marginTop: 8 }}>
          {sharing ? 'Compartiendo…' : '📤 Compartir invitación'}
        </button>
        {!loading && rsvpUrl && (
          <button type="button" className="link-button" onClick={handleRegenerate} style={{ marginTop: 8 }}>
            🔄 Regenerar enlace (invalida el anterior)
          </button>
        )}
      </div>
      {manualShare && <ShareFallbackModal title={manualShare.title} text={manualShare.text} onClose={() => setManualShare(null)} />}
    </div>
  )
}

// ---------------------------------------------------------------------
// Fase 3 — Mesas. Asignación simple, sin plano 3D.
// ---------------------------------------------------------------------

function TablesSection({ event }: { event: FamilyEvent }) {
  const [tables, setTables] = useState<EventTableSeat[]>([])
  const [guests, setGuests] = useState<EventGuest[]>([])
  const [members, setMembers] = useState<EventGuestMember[]>([])
  const [newName, setNewName] = useState('')
  const [newCapacity, setNewCapacity] = useState('')
  const [error, setError] = useState<string | null>(null)

  function reload() {
    listEventTables(event.id)
      .then(setTables)
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar las mesas')))
    listEventGuests(event.id)
      .then(setGuests)
      .catch(() => {})
    listEventGuestMembersForEvent(event.id)
      .then(setMembers)
      .catch(() => {})
  }
  useEffect(reload, [event.id])

  // Fase 14C — agrupado por unidad, para saber sin JOIN adicional si
  // cada invitado está desglosado en personas o sigue en modo unidad.
  const membersByGuestId = useMemo(() => {
    const map: Record<string, EventGuestMember[]> = {}
    for (const m of members) (map[m.guestId] ??= []).push(m)
    return map
  }, [members])

  async function handleAdd(ev: FormEvent) {
    ev.preventDefault()
    if (!newName.trim()) return
    try {
      await addEventTable(event.id, newName, newCapacity ? Number(newCapacity) : null)
      setNewName('')
      setNewCapacity('')
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir'))
    }
  }

  async function handleAssignAllGroup(guestMembers: EventGuestMember[], tableId: string | null) {
    try {
      await Promise.all(guestMembers.map((m) => updateEventGuestMember(m.id, { tableId })))
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo asignar la mesa'))
    }
  }

  return (
    <div className="card event-card" style={{ marginTop: 8 }}>
      <strong>🪑 Mesas</strong>
      {error && <p className="error">{error}</p>}
      <div className="event-list" style={{ marginTop: 8 }}>
        {tables.map((t) => {
          const seatedCount = computeTableOccupancy(t, guests, membersByGuestId)
          const overCapacity = t.capacity != null && seatedCount > t.capacity
          const namesHere = [
            ...guests.filter((g) => (membersByGuestId[g.id]?.length ?? 0) === 0 && g.tableId === t.id).map((g) => g.displayName),
            ...members.filter((m) => m.tableId === t.id).map((m) => m.name),
          ]
          return (
            <div key={t.id} className="card task-card">
              <div className="task-card-main" style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong style={overCapacity ? { color: '#b45309' } : undefined}>
                    {t.name}
                    {t.capacity ? ` (${seatedCount}/${t.capacity})` : ` (${seatedCount})`}
                    {overCapacity ? ' ⚠️' : ''}
                  </strong>
                  <ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Borrar mesa" onConfirm={() => deleteEventTable(t.id).then(reload)} />
                </div>
                <p className="muted" style={{ margin: '2px 0' }}>
                  {namesHere.length === 0 ? 'Sin invitados asignados.' : namesHere.join(', ')}
                </p>
              </div>
            </div>
          )
        })}
        {tables.length === 0 && <p className="muted">Todavía no hay mesas.</p>}
      </div>
      <form onSubmit={handleAdd} className="inline-fields" style={{ marginTop: 8 }}>
        <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="+ Añadir mesa" style={{ flex: 1 }} />
        <input type="number" min={0} value={newCapacity} onChange={(e) => setNewCapacity(e.target.value)} placeholder="Aforo" style={{ width: 70 }} />
        <button type="submit">Añadir</button>
      </form>
      {guests.length > 0 && tables.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <p className="muted" style={{ fontSize: 13 }}>
            Asignar invitados a una mesa:
          </p>
          <div className="event-list">
            {guests.map((g) => {
              const guestMembers = membersByGuestId[g.id] ?? []
              if (guestMembers.length === 0) {
                return (
                  <div key={g.id} className="inline-fields" style={{ alignItems: 'center' }}>
                    <span style={{ flex: 1 }}>{g.displayName}</span>
                    <select value={g.tableId ?? ''} onChange={(e) => assignGuestTable(g.id, e.target.value || null).then(reload)}>
                      <option value="">Sin mesa</option>
                      {tables.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              }
              const status = computeGuestSeatingStatus(g, guestMembers)
              return (
                <div key={g.id} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>{g.displayName}</strong>
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        const value = e.target.value
                        if (value === '') return
                        handleAssignAllGroup(guestMembers, value === GROUP_ASSIGN_NONE ? null : value)
                        e.target.value = ''
                      }}
                    >
                      <option value="" disabled>
                        Asignar todo el grupo a…
                      </option>
                      <option value={GROUP_ASSIGN_NONE}>Sin mesa</option>
                      {tables.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="muted" style={{ margin: '2px 0', fontSize: 13 }}>
                    {status.seatedIdentifiedCount}/{status.identifiedCount} personas sentadas
                    {status.unidentifiedCount > 0 ? ` · ${status.unidentifiedCount} por nombrar (sin mesa asignable)` : ''}
                  </p>
                  {guestMembers.map((m) => (
                    <div key={m.id} className="inline-fields" style={{ alignItems: 'center', marginLeft: 12 }}>
                      <span style={{ flex: 1 }}>
                        {m.name} ({m.personType === 'adulto' ? 'adulto' : 'niño'})
                      </span>
                      <select value={m.tableId ?? ''} onChange={(e) => updateEventGuestMember(m.id, { tableId: e.target.value || null }).then(reload)}>
                        <option value="">Sin mesa</option>
                        {tables.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Fase 3 — Decoración. Opcional; PEPA propone, la familia elige todo/
// algo/nada.
// ---------------------------------------------------------------------

function DecorationSection({ eventId }: { eventId: string }) {
  const [items, setItems] = useState<EventDecorationItem[]>([])
  const [newName, setNewName] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    listEventDecorationItems(eventId)
      .then(setItems)
      .catch((err) => setError(errorMessage(err, 'No se pudo cargar la decoración')))
  }
  useEffect(reload, [eventId])

  async function handleAdd(ev: FormEvent) {
    ev.preventDefault()
    if (!newName.trim()) return
    try {
      await addEventDecorationItem(eventId, newName)
      setNewName('')
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir'))
    }
  }

  async function handleTransfer(item: EventDecorationItem) {
    try {
      await transferDecorationItemToShopping(item)
      setNotice(`✓ "${item.name}" añadido a Compras.`)
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo traspasar'))
    }
  }

  return (
    <div className="card event-card" style={{ marginTop: 8 }}>
      <strong>🎈 Decoración</strong>
      {notice && <p className="points-badge">{notice}</p>}
      {error && <p className="error">{error}</p>}
      <div className="event-list" style={{ marginTop: 8 }}>
        {items.map((i) => (
          <div key={i.id} className="inline-fields" style={{ alignItems: 'center' }}>
            <select value={i.status} onChange={(e) => updateEventDecorationItem(i.id, { status: e.target.value as EventDecorationItem['status'] }).then(reload)}>
              <option value="idea">Idea</option>
              <option value="elegido">Elegido</option>
              <option value="comprado">Comprado</option>
            </select>
            <span style={{ flex: 1 }}>
              {i.name}
              {i.transferredToShopping ? ' · ✓ en Compras' : ''}
            </span>
            {!i.transferredToShopping && (
              <button type="button" className="link-button" onClick={() => handleTransfer(i)}>
                → Compras
              </button>
            )}
            <ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Borrar" onConfirm={() => deleteEventDecorationItem(i.id).then(reload)} />
          </div>
        ))}
        {items.length === 0 && <p className="muted">Ninguna idea todavía — no hace falta decoración si no la quieres.</p>}
      </div>
      <form onSubmit={handleAdd} className="inline-fields" style={{ marginTop: 8 }}>
        <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="+ Añadir idea" style={{ flex: 1 }} />
        <button type="submit">Añadir</button>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------------
// Fase 3 — Actividades / juegos. Contextual y opcional.
// ---------------------------------------------------------------------

function ActivitiesSection({ eventId }: { eventId: string }) {
  const [activities, setActivities] = useState<EventActivity[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    listEventActivities(eventId)
      .then(setActivities)
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar las actividades')))
  }
  useEffect(reload, [eventId])

  async function handleTransfer(activity: EventActivity) {
    try {
      await transferActivityMaterialsToShopping(activity)
      setNotice(`✓ Material de "${activity.title}" añadido a Compras.`)
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo traspasar'))
    }
  }

  return (
    <div className="card event-card" style={{ marginTop: 8 }}>
      <strong>🎲 Actividades y juegos</strong>
      {notice && <p className="points-badge">{notice}</p>}
      {error && <p className="error">{error}</p>}
      <div className="event-list" style={{ marginTop: 8 }}>
        {activities.map((a) => (
          <div key={a.id} className="card task-card">
            <div className="task-card-main" style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{a.title}</strong>
                <ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Borrar actividad" onConfirm={() => deleteEventActivity(a.id).then(reload)} />
              </div>
              <p className="muted" style={{ margin: '2px 0' }}>
                {[a.ageRange, a.durationMinutes ? `${a.durationMinutes} min` : null].filter(Boolean).join(' · ')}
              </p>
              {a.materialsNote && (
                <p className="muted" style={{ margin: '2px 0' }}>
                  Material: {a.materialsNote}
                  {a.transferredToShopping ? ' · ✓ en Compras' : ''}
                </p>
              )}
              {a.materialsNote && !a.transferredToShopping && (
                <button type="button" className="link-button" onClick={() => handleTransfer(a)}>
                  → Compras
                </button>
              )}
            </div>
          </div>
        ))}
        {activities.length === 0 && <p className="muted">Todavía no hay actividades apuntadas.</p>}
      </div>
      <button type="button" className="link-button" onClick={() => setShowAdd(true)}>
        + Añadir actividad
      </button>
      {showAdd && (
        <AddActivityModal
          eventId={eventId}
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false)
            reload()
          }}
        />
      )}
    </div>
  )
}

function AddActivityModal({ eventId, onClose, onAdded }: { eventId: string; onClose: () => void; onAdded: () => void }) {
  const [title, setTitle] = useState('')
  const [ageRange, setAgeRange] = useState('')
  const [durationMinutes, setDurationMinutes] = useState('')
  const [materialsNote, setMaterialsNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!title.trim()) {
      setError('Ponle un nombre.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await addEventActivity(eventId, {
        title,
        ageRange: ageRange || null,
        durationMinutes: durationMinutes ? Number(durationMinutes) : null,
        materialsNote: materialsNote || null,
      })
      onAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Nueva actividad
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <form className="card member-form" onSubmit={handleSubmit}>
          {error && <p className="error">{error}</p>}
          <label>
            Nombre
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Búsqueda del tesoro..." autoFocus />
          </label>
          <div className="inline-fields">
            <label style={{ flex: 1 }}>
              Edad (opcional)
              <input type="text" value={ageRange} onChange={(e) => setAgeRange(e.target.value)} placeholder="4-8 años" />
            </label>
            <label style={{ flex: 1 }}>
              Duración (min)
              <input type="number" min={0} value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} />
            </label>
          </div>
          <label>
            Material necesario (opcional)
            <input type="text" value={materialsNote} onChange={(e) => setMaterialsNote(e.target.value)} placeholder="Globos, premios..." />
          </label>
          <button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Añadir'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Fase 3 — Detalles/recuerdos (por tipo de artículo) + Detalles
// especiales (por persona) — un único módulo 'detalles' con dos formas
// distintas a propósito.
// ---------------------------------------------------------------------

// Tanda "Transición inteligente entre preparativos" — props nuevas (tasks/onTasksChanged) SOLO para poder
// proponer, nunca ejecutar sin permiso: cuando TODOS los destinatarios de "Regalos o detalles" tienen ya
// una idea decidida, se ofrece (1) marcar como completado el preparativo "Decidir regalos para personas
// especiales" y (2) crear "Comprar/encargar regalos para personas especiales" con el desglose por persona
// — cada una con su propia confirmación aparte, reutilizando updateEventTask/addEventTask de siempre
// (nunca un escritor nuevo). Mismo motor de "Siguiente preparativo" en espíritu (proponer, aceptar o
// rechazar, nunca duplicar) aunque esta tanda vive en su propia tarjeta en vez de reutilizar el modal
// compartido de Encargos — DetailsSection no formaba parte del árbol que tiene acceso a ese estado y
// separarlo así evita arriesgar el mecanismo ya validado en iPhone.
const DECIDIR_REGALOS_TASK_TITLE = 'Decidir regalos para personas especiales'
const COMPRAR_REGALOS_TASK_TITLE = 'Comprar/encargar regalos para personas especiales'

function DetailsSection({ eventId, tasks, onTasksChanged }: { eventId: string; tasks: EventTask[]; onTasksChanged: () => void }) {
  const [favors, setFavors] = useState<EventFavorItem[]>([])
  const [specials, setSpecials] = useState<EventSpecialDetail[]>([])
  const [members, setMembers] = useState<EventGuestMember[]>([])
  // Fase 2 (plan de pendientes) — "alimentar el módulo de Detalles/Regalos": el roster de "🎭 Personas
  // especiales" se ofrece como alta rápida en AddSpecialDetailModal, nunca se crea nada aquí por su cuenta.
  const [rolePeople, setRolePeople] = useState<EventRolePerson[]>([])
  // Tanda "Detalles para personas especiales: regalos pendientes" — para saber a quién corresponde
  // mostrar como destinatario automático (ver missingRecipients más abajo) sin esperar a que haya un
  // registro creado a mano.
  const [decisions, setDecisions] = useState<EventDecision[]>([])
  const [showAddFavor, setShowAddFavor] = useState(false)
  const [showAddSpecial, setShowAddSpecial] = useState(false)
  // Bug real corregido (validación iPhone): antes no había ningún camino para editar un registro ya
  // creado — solo borrar y volver a crear. editingSpecial abre el MISMO AddSpecialDetailModal en modo
  // edición (ver su prop `editing`), nunca un segundo formulario.
  const [editingSpecial, setEditingSpecial] = useState<EventSpecialDetail | null>(null)
  // "+ Añadir idea" de un destinatario pendiente abre el mismo alta de siempre, ya precargada con esa
  // persona — nunca crea nada por su cuenta, el usuario sigue teniendo que escribir la idea y confirmar.
  const [prefillRolePersonId, setPrefillRolePersonId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    listEventFavorItems(eventId)
      .then(setFavors)
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar los detalles')))
    listEventSpecialDetails(eventId)
      .then(setSpecials)
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar los detalles especiales')))
    // Fase 14D — para el selector opcional "vincular a una persona
    // desglosada"; recipientName sigue siendo el dato que manda, esto
    // es solo un enlace informativo adicional.
    listEventGuestMembersForEvent(eventId)
      .then(setMembers)
      .catch(() => {})
    listEventRolePeople(eventId, 'especial')
      .then(setRolePeople)
      .catch(() => {})
    listEventDecisions(eventId)
      .then(setDecisions)
      .catch(() => {})
  }
  useEffect(reload, [eventId])

  function memberName(memberId: string | null): string | null {
    return memberId ? (members.find((m) => m.id === memberId)?.name ?? null) : null
  }

  // "La decisión de Personas especiales es la fuente de verdad de a quién le toca regalo; la gestión
  // concreta vive aquí" — quien esté en el subconjunto de la pregunta de Regalos pero TODAVÍA no tenga
  // ningún registro vinculado (role_person_id) aparece igual, sin obligar a "+ Añadir persona especial".
  const regalosAnswer = decisions.find((d) => d.questionKey === ESPECIAL_REGALOS_QUESTION_KEY)?.answer as unknown as RegalosEspecialesAnswer | undefined
  const regalosRecipientIds = regalosAnswer
    ? resolveEspecialScopePersonIds(regalosAnswer.choice, regalosAnswer.selectedPersonIds, rolePeople.map((p) => p.id))
    : []
  const linkedRolePersonIds = new Set(specials.map((s) => s.rolePersonId).filter((id): id is string => !!id))
  const missingRecipients = rolePeople.filter((p) => regalosRecipientIds.includes(p.id) && !linkedRolePersonIds.has(p.id))

  // "Transición inteligente" — SOLO cuando hay destinatarios de verdad y TODOS (ninguno sin registro,
  // ninguno con la idea todavía en blanco) tienen ya su idea de regalo decidida. "Decidido" = existe un
  // registro vinculado a esa persona con `detail` no vacío — no hace falta que ya esté comprado/preparado.
  const recipientSpecials = regalosRecipientIds.map((id) => specials.find((s) => s.rolePersonId === id)).filter((s): s is EventSpecialDetail => !!s)
  const allRecipientsHaveDetail = regalosRecipientIds.length > 0 && regalosRecipientIds.every((id) => specials.some((s) => s.rolePersonId === id && !!s.detail))
  const allRecipientsPurchased = allRecipientsHaveDetail && recipientSpecials.every((s) => s.status !== 'pendiente')
  const decidirTask = tasks.find((t) => t.title === DECIDIR_REGALOS_TASK_TITLE && !t.done)
  const comprarTaskExists = tasks.some((t) => t.title === COMPRAR_REGALOS_TASK_TITLE && !t.done)
  const [dismissedDecidirPrompt, setDismissedDecidirPrompt] = useState(false)
  const [dismissedComprarPrompt, setDismissedComprarPrompt] = useState(false)
  const [creatingComprarTask, setCreatingComprarTask] = useState(false)

  async function completeDecidirRegalosTask() {
    if (!decidirTask) return
    await updateEventTask(decidirTask.id, { done: true })
    onTasksChanged()
  }

  async function createComprarRegalosTask() {
    setCreatingComprarTask(true)
    try {
      const breakdown = recipientSpecials.map((s) => `${s.recipientName} — ${s.detail}`).join('\n')
      await addEventTask(eventId, COMPRAR_REGALOS_TASK_TITLE, null, null, { notes: breakdown })
      onTasksChanged()
    } finally {
      setCreatingComprarTask(false)
      setDismissedComprarPrompt(true)
    }
  }

  return (
    <div className="card event-card" style={{ marginTop: 8 }}>
      <strong>🎁 Detalles / recuerdos</strong>
      <p className="muted" style={{ fontSize: 13 }}>
        Para los invitados en general, y aparte, para personas concretas (padrinos, testigos...).
      </p>
      {error && <p className="error">{error}</p>}

      <p className="muted" style={{ margin: '8px 0 4px', fontSize: 13, fontWeight: 600 }}>
        Recuerdos para invitados
      </p>
      <div className="event-list">
        {favors.map((f) => (
          <div key={f.id} className="inline-fields" style={{ alignItems: 'center' }}>
            <select value={f.status} onChange={(e) => updateEventFavorItem(f.id, { status: e.target.value as EventFavorItem['status'] }).then(reload)}>
              <option value="pendiente">Pendiente</option>
              <option value="encargado">Encargado</option>
              <option value="listo">Listo</option>
            </select>
            <span style={{ flex: 1 }}>
              {f.itemType}
              {f.quantityNeeded ? ` · ${f.quantityNeeded}` : ''}
              {f.supplier ? ` · ${f.supplier}` : ''}
            </span>
            <ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Borrar" onConfirm={() => deleteEventFavorItem(f.id).then(reload)} />
          </div>
        ))}
        {favors.length === 0 && <p className="muted">Ninguno todavía.</p>}
      </div>
      <button type="button" className="link-button" onClick={() => setShowAddFavor(true)}>
        + Añadir recuerdo
      </button>

      <p className="muted" style={{ margin: '12px 0 4px', fontSize: 13, fontWeight: 600 }}>
        Detalles para personas especiales
      </p>
      <div className="event-list">
        {specials.map((s) => (
          <div key={s.id} className="inline-fields" style={{ alignItems: 'center' }}>
            <select
              value={s.status}
              onChange={(e) => updateEventSpecialDetail(s.id, { status: e.target.value as EventSpecialDetail['status'] }).then(reload)}
            >
              <option value="pendiente">Pendiente</option>
              <option value="comprado">Comprado</option>
              <option value="preparado">Preparado</option>
            </select>
            <span style={{ flex: 1 }}>
              {s.recipientName}
              {s.relationship ? ` (${s.relationship})` : ''}
              {s.detail ? ` · ${s.detail}` : ''}
              {!s.detail ? ' · Regalo por decidir' : ''}
              {memberName(s.memberId) ? ` · 👤 ${memberName(s.memberId)}` : ''}
            </span>
            <button type="button" className="link-button" onClick={() => setEditingSpecial(s)}>
              Editar
            </button>
            <ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Borrar" onConfirm={() => deleteEventSpecialDetail(s.id).then(reload)} />
          </div>
        ))}
        {/* Destinatarios de "Regalos o detalles" (Personas especiales) todavía sin ningún registro propio —
            aparecen igual, sin tener que pulsar "+ Añadir persona especial" primero (petición real). Tocar
            "+ Añadir idea" abre el mismo alta de siempre, ya precargada con esta persona. */}
        {missingRecipients.map((p) => (
          <div key={`missing-${p.id}`} className="inline-fields" style={{ alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: 12 }}>
              Pendiente
            </span>
            <span style={{ flex: 1 }}>
              {p.name || 'Sin nombre'}
              {p.roles.length > 0 ? ` (${p.roles.join(', ')})` : ''} · Regalo por decidir
            </span>
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setPrefillRolePersonId(p.id)
                setShowAddSpecial(true)
              }}
            >
              + Añadir idea
            </button>
          </div>
        ))}
        {specials.length === 0 && missingRecipients.length === 0 && <p className="muted">Ninguno todavía.</p>}
      </div>
      <button type="button" className="link-button" onClick={() => setShowAddSpecial(true)}>
        + Añadir persona especial
      </button>

      {/* "Transición inteligente" (plan de pendientes) — PEPA propone, nunca ejecuta sin permiso. Cada
          aviso tiene su propia confirmación/descarte aparte, y nunca se repite solo (dismissedX) ni
          duplica si ya existe la tarea siguiente (comprarTaskExists) o ya no hace falta (decidirTask). */}
      {allRecipientsHaveDetail && decidirTask && !dismissedDecidirPrompt && (
        <div className="card" style={{ marginTop: 8, padding: 10 }}>
          <p style={{ margin: '0 0 6px', fontSize: 13 }}>
            💡 Todos los regalos para personas especiales están decididos. ¿Marcar "{DECIDIR_REGALOS_TASK_TITLE}" como completado?
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => completeDecidirRegalosTask()}>
              Marcar como hecho
            </button>
            <button type="button" className="link-button" onClick={() => setDismissedDecidirPrompt(true)}>
              Ahora no
            </button>
          </div>
        </div>
      )}
      {allRecipientsHaveDetail && !allRecipientsPurchased && !comprarTaskExists && !dismissedComprarPrompt && (
        <div className="card" style={{ marginTop: 8, padding: 10 }}>
          <p style={{ margin: '0 0 6px', fontSize: 13 }}>
            💡 PEPA te propone como siguiente preparativo: «{COMPRAR_REGALOS_TASK_TITLE}», con el desglose por persona.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" disabled={creatingComprarTask} onClick={() => createComprarRegalosTask()}>
              {creatingComprarTask ? 'Creando…' : 'Crear preparativo'}
            </button>
            <button type="button" className="link-button" onClick={() => setDismissedComprarPrompt(true)}>
              No hace falta
            </button>
          </div>
        </div>
      )}

      {showAddFavor && (
        <AddFavorModal
          eventId={eventId}
          onClose={() => setShowAddFavor(false)}
          onAdded={() => {
            setShowAddFavor(false)
            reload()
          }}
        />
      )}
      {showAddSpecial && (
        <AddSpecialDetailModal
          eventId={eventId}
          members={members}
          rolePeople={rolePeople}
          initialRolePersonId={prefillRolePersonId}
          onClose={() => {
            setShowAddSpecial(false)
            setPrefillRolePersonId(null)
          }}
          onAdded={() => {
            setShowAddSpecial(false)
            setPrefillRolePersonId(null)
            reload()
          }}
        />
      )}
      {editingSpecial && (
        <AddSpecialDetailModal
          eventId={eventId}
          members={members}
          rolePeople={rolePeople}
          editing={editingSpecial}
          onClose={() => setEditingSpecial(null)}
          onAdded={() => {
            setEditingSpecial(null)
            reload()
          }}
        />
      )}
    </div>
  )
}

function AddFavorModal({ eventId, onClose, onAdded }: { eventId: string; onClose: () => void; onAdded: () => void }) {
  const [itemType, setItemType] = useState('')
  const [quantityNeeded, setQuantityNeeded] = useState('')
  const [supplier, setSupplier] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!itemType.trim()) {
      setError('Dile qué es.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await addEventFavorItem(eventId, { itemType, quantityNeeded: quantityNeeded ? Number(quantityNeeded) : null, supplier: supplier || null })
      onAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Nuevo recuerdo
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <form className="card member-form" onSubmit={handleSubmit}>
          {error && <p className="error">{error}</p>}
          <label>
            Qué es
            <input type="text" value={itemType} onChange={(e) => setItemType(e.target.value)} placeholder="Bolsa de chuches, estuche..." autoFocus />
          </label>
          <label>
            Cantidad necesaria (opcional)
            <input type="number" min={0} value={quantityNeeded} onChange={(e) => setQuantityNeeded(e.target.value)} />
          </label>
          <label>
            Proveedor (opcional)
            <input type="text" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          </label>
          <button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Añadir'}
          </button>
        </form>
      </div>
    </div>
  )
}

// Bug real corregido (validación iPhone): antes solo se podía ALTA — editar un registro existente
// obligaba a borrarlo y crearlo de nuevo. Ahora el mismo formulario sirve para ambos casos: `editing`
// (opcional) precarga todos los campos y cambia "Añadir" por "Guardar", llamando a
// updateEventSpecialDetail en vez de addEventSpecialDetail — nunca un segundo componente.
function AddSpecialDetailModal({
  eventId,
  members,
  rolePeople = [],
  editing,
  initialRolePersonId,
  onClose,
  onAdded,
}: {
  eventId: string
  members: EventGuestMember[]
  // Fase 2 (plan de pendientes) — roster de "🎭 Personas especiales": elegir uno rellena nombre y papel(es)
  // de un tirón, pero el nombre sigue siendo editable — nunca sustituye la alta manual de siempre.
  rolePeople?: EventRolePerson[]
  editing?: EventSpecialDetail | null
  // Tanda "Regalos pendientes" — al tocar "+ Añadir idea" sobre un destinatario sin registro todavía, el
  // alta llega ya con esa persona elegida (mismo fillFromRolePerson de siempre), sin obligar a repetir el
  // "Elegir de Personas especiales" a mano.
  initialRolePersonId?: string | null
  onClose: () => void
  onAdded: () => void
}) {
  const [recipientName, setRecipientName] = useState(editing?.recipientName ?? '')
  const [relationship, setRelationship] = useState(editing?.relationship ?? '')
  const [detail, setDetail] = useState(editing?.detail ?? '')
  const [memberId, setMemberId] = useState(editing?.memberId ?? '')
  const [rolePersonId, setRolePersonId] = useState(editing?.rolePersonId ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialRolePersonId && !editing) fillFromRolePerson(initialRolePersonId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRolePersonId])

  function fillFromRolePerson(personId: string) {
    const person = rolePeople.find((p) => p.id === personId)
    if (!person) return
    if (person.name) setRecipientName(person.name)
    if (person.roles.length > 0) setRelationship(person.roles.join(', '))
    if (person.guestMemberId) setMemberId(person.guestMemberId)
    setRolePersonId(person.id)
  }

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!recipientName.trim()) {
      setError('Ponle un nombre.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (editing) {
        await updateEventSpecialDetail(editing.id, {
          recipientName,
          relationship: relationship || null,
          detail: detail || null,
          rolePersonId: rolePersonId || null,
        })
      } else {
        await addEventSpecialDetail(eventId, { recipientName, relationship: relationship || null, detail: detail || null, memberId: memberId || null, rolePersonId: rolePersonId || null })
      }
      onAdded()
    } catch (err) {
      setError(errorMessage(err, editing ? 'No se pudo guardar' : 'No se pudo añadir'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            {editing ? 'Editar detalle' : 'Persona especial'}
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <form className="card member-form" onSubmit={handleSubmit}>
          {error && <p className="error">{error}</p>}
          {rolePeople.length > 0 && (
            <label>
              Elegir de "🎭 Personas especiales" (opcional)
              <select value="" onChange={(e) => fillFromRolePerson(e.target.value)}>
                <option value="">Escribir a mano…</option>
                {rolePeople.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || 'Sin nombre'}
                    {p.roles.length > 0 ? ` · ${p.roles.join(', ')}` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Nombre
            <input type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Abuela Pepa" autoFocus />
          </label>
          <label>
            Relación (opcional)
            <input type="text" value={relationship} onChange={(e) => setRelationship(e.target.value)} placeholder="Madrina, testigo..." />
          </label>
          <label>
            Idea de detalle (opcional)
            <input type="text" value={detail} onChange={(e) => setDetail(e.target.value)} />
          </label>
          {members.length > 0 && (
            <label>
              Vincular a una persona desglosada de Invitados (opcional)
              <select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
                <option value="">Sin vincular</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : editing ? 'Guardar' : 'Añadir'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Fase 3 — Regalos recibidos. PRIVADO, opcional.
// ---------------------------------------------------------------------

function GiftsSection({ eventId }: { eventId: string }) {
  const [gifts, setGifts] = useState<EventGiftReceived[]>([])
  const [members, setMembers] = useState<EventGuestMember[]>([])
  // Fase 2 (plan de pendientes) — mismo roster de "🎭 Personas especiales" que Detalles, como alta rápida.
  const [rolePeople, setRolePeople] = useState<EventRolePerson[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    listEventGifts(eventId)
      .then(setGifts)
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar los regalos')))
    // Fase 14D — para el selector opcional "vincular a una persona
    // desglosada"; guestName sigue siendo el dato que manda (sirve
    // también para regalos de varias personas a la vez, sin N:M).
    listEventGuestMembersForEvent(eventId)
      .then(setMembers)
      .catch(() => {})
    listEventRolePeople(eventId, 'especial')
      .then(setRolePeople)
      .catch(() => {})
  }
  useEffect(reload, [eventId])

  const totalCash = gifts.reduce((sum, g) => sum + (g.cashAmount ?? 0), 0)
  const memberName = (memberId: string | null): string | null => (memberId ? (members.find((m) => m.id === memberId)?.name ?? null) : null)

  return (
    <div className="card event-card" style={{ marginTop: 8 }}>
      <strong>🎀 Regalos recibidos</strong>
      <p className="muted" style={{ fontSize: 12 }}>
        Privado — nunca se muestra en la página pública de RSVP.
      </p>
      {error && <p className="error">{error}</p>}
      {gifts.length > 0 && (
        <p className="muted" style={{ margin: '4px 0' }}>
          Total en efectivo: <strong>{totalCash.toFixed(2)} €</strong>
        </p>
      )}
      <div className="event-list">
        {gifts.map((g) => (
          <div key={g.id} className="inline-fields" style={{ alignItems: 'center' }}>
            <span style={{ flex: 1 }}>
              {g.guestName}
              {g.giftDescription ? ` · ${g.giftDescription}` : ''}
              {g.cashAmount ? ` · ${g.cashAmount.toFixed(2)} €` : ''}
              {memberName(g.memberId) ? ` · 👤 ${memberName(g.memberId)}` : ''}
            </span>
            <ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Borrar" onConfirm={() => deleteEventGift(g.id).then(reload)} />
          </div>
        ))}
        {gifts.length === 0 && <p className="muted">Todavía no hay nada apuntado.</p>}
      </div>
      <button type="button" className="link-button" onClick={() => setShowAdd(true)}>
        + Añadir regalo
      </button>
      {showAdd && (
        <AddGiftModal
          eventId={eventId}
          members={members}
          rolePeople={rolePeople}
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false)
            reload()
          }}
        />
      )}
    </div>
  )
}

function AddGiftModal({
  eventId,
  members,
  rolePeople = [],
  onClose,
  onAdded,
}: {
  eventId: string
  members: EventGuestMember[]
  rolePeople?: EventRolePerson[]
  onClose: () => void
  onAdded: () => void
}) {
  const [guestName, setGuestName] = useState('')
  const [giftDescription, setGiftDescription] = useState('')
  const [cashAmount, setCashAmount] = useState('')
  const [memberId, setMemberId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function fillFromRolePerson(personId: string) {
    const person = rolePeople.find((p) => p.id === personId)
    if (!person) return
    if (person.name) setGuestName(person.name)
    if (person.guestMemberId) setMemberId(person.guestMemberId)
  }

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!guestName.trim()) {
      setError('Ponle un nombre.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await addEventGift(eventId, {
        guestName,
        giftDescription: giftDescription || null,
        cashAmount: cashAmount ? Number(cashAmount) : null,
        memberId: memberId || null,
      })
      onAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Nuevo regalo
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <form className="card member-form" onSubmit={handleSubmit}>
          {error && <p className="error">{error}</p>}
          {rolePeople.length > 0 && (
            <label>
              Elegir de "🎭 Personas especiales" (opcional)
              <select value="" onChange={(e) => fillFromRolePerson(e.target.value)}>
                <option value="">Escribir a mano…</option>
                {rolePeople.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || 'Sin nombre'}
                    {p.roles.length > 0 ? ` · ${p.roles.join(', ')}` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            De quién
            <input type="text" value={guestName} onChange={(e) => setGuestName(e.target.value)} autoFocus />
          </label>
          <label>
            Qué regaló (opcional)
            <input type="text" value={giftDescription} onChange={(e) => setGiftDescription(e.target.value)} />
          </label>
          <label>
            Importe en efectivo (opcional)
            <input type="number" min={0} step="0.01" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} />
          </label>
          {members.length > 0 && (
            <label>
              Vincular a una persona desglosada de Invitados (opcional)
              <select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
                <option value="">Sin vincular</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Añadir'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Fase 3 — Plan del día. Cronológico; protagonista el día del evento.
// ---------------------------------------------------------------------

// (La sección vive en src/ui/EventDayPlan.tsx: Plan del día editable, Fase 1.)

// ---------------------------------------------------------------------
// Fase 3 — modo "día del evento". Petición de la Skill: el día del
// evento, la pantalla debe destacar lo inmediato (asistencia
// confirmada, compras pendientes, próximo momento del plan) — nunca se
// muestra si el evento no está en marcha o la fecha no está confirmada.
// ---------------------------------------------------------------------

function EventDayBanner({ event }: { event: FamilyEvent }) {
  const [confirmedPeople, setConfirmedPeople] = useState<number | null>(null)
  const [pendingPurchases, setPendingPurchases] = useState(0)
  const [nextPlanItem, setNextPlanItem] = useState<EventDayPlanItem | null>(null)

  useEffect(() => {
    if (event.enabledModules.includes('invitados')) {
      listEventGuests(event.id).then((guests) => {
        const confirmed = guests.filter((g) => g.rsvpStatus === 'confirmado')
        setConfirmedPeople(confirmed.reduce((sum, g) => sum + (g.rsvpAdultsCount ?? g.adultsCount) + (g.rsvpChildrenCount ?? g.childrenCount), 0))
      })
    }
    // El menú ya no se «traspasa» a Compras entero (solo ingredientes de recetas que la familia elige), así que ya
    // no cuenta aquí como pendiente.
    Promise.all([event.enabledModules.includes('decoracion') ? listEventDecorationItems(event.id) : Promise.resolve([])]).then(([decoration]) => {
      setPendingPurchases(decoration.filter((i) => !i.transferredToShopping).length)
    })
    if (event.enabledModules.includes('plan_dia')) {
      listEventDayPlan(event.id).then((items) => {
        const now = new Date().toTimeString().slice(0, 5)
        setNextPlanItem(items.find((i) => !i.itemTime || i.itemTime.slice(0, 5) >= now) ?? null)
      })
    }
  }, [event.id, event.enabledModules])

  return (
    <div className="card event-card" style={{ marginTop: 8, background: '#eef2ff', borderColor: '#c7d2fe' }}>
      <strong>🎉 ¡Hoy es el día!</strong>
      <div className="event-list" style={{ marginTop: 4 }}>
        {confirmedPeople !== null && <p style={{ margin: '2px 0' }}>👥 {confirmedPeople} personas confirmadas</p>}
        {pendingPurchases > 0 && <p style={{ margin: '2px 0' }}>🛒 {pendingPurchases} cosas todavía sin pasar a Compras</p>}
        {nextPlanItem && (
          <p style={{ margin: '2px 0' }}>
            🗓️ Siguiente: {nextPlanItem.itemTime ? `${nextPlanItem.itemTime.slice(0, 5)} · ` : ''}
            {nextPlanItem.title}
          </p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Fase 3 — Conclusiones de PEPA por reglas. Contextual, no un panel
// gigante aparte (petición de la Skill) — se enseña solo si hay algo
// que decir de verdad.
// ---------------------------------------------------------------------

function PepaConclusions({ event }: { event: FamilyEvent }) {
  const [conclusions, setConclusions] = useState<EventConclusionType[]>([])

  useEffect(() => {
    Promise.all([
      event.enabledModules.includes('invitados') ? listEventGuests(event.id) : Promise.resolve([]),
      event.enabledModules.includes('tareas') ? listEventTasks(event.id) : Promise.resolve([]),
      event.enabledModules.includes('pagos') ? listEventPayments(event.id) : Promise.resolve([]),
      event.enabledModules.includes('presupuesto') ? listEventBudgetItems(event.id) : Promise.resolve([]),
      event.tagId && event.enabledModules.includes('presupuesto') ? listExpenses() : Promise.resolve(null),
      event.tagId && event.enabledModules.includes('presupuesto') ? listBudgetCategories() : Promise.resolve([]),
    ]).then(async ([guests, tasks, payments, budgetItems, expenses, categories]) => {
      const plannedBudget = budgetItems.reduce((sum, i) => sum + (i.plannedAmount ?? 0), 0)
      const spentBudget = expenses
        ? expenses
            .filter((e) => e.tagId === event.tagId && !e.isIncome && !isInternalTransferCategory(e.category, categories))
            .reduce((sum, e) => sum + e.amount, 0)
        : null
      // Comida y bebida — aviso persistente «ya han confirmado todos y hay necesidades alimentarias».
      const foodNeeds = await loadEventFoodNeedsAlert(event.id, guests).catch(() => undefined)
      setConclusions(
        computeEventConclusions({
          rsvpDeadline: event.rsvpDeadline,
          guests,
          tasks,
          payments,
          plannedBudget,
          spentBudget,
          foodNeeds,
        }),
      )
    })
  }, [event.id, event.enabledModules, event.rsvpDeadline, event.tagId])

  if (conclusions.length === 0) return null

  return (
    <div className="card event-card" style={{ marginTop: 8, background: '#fdf4ff', borderColor: '#f0abfc' }}>
      <strong>🧠 Pepa dice</strong>
      <div className="event-list" style={{ marginTop: 4 }}>
        {conclusions.map((c) => (
          <p key={c.id} style={{ margin: '2px 0' }}>
            {c.icon} {c.text}
          </p>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Fase 4 — "Organízamelo Pepa". Petición de la Skill (08-data-
// integration-ai.md): "Show a summary of proposed writes before user
// confirms" — nada se escribe hasta que el usuario pulsa "Aplicar", y
// puede destildar cualquier línea suelta antes de confirmar.
// ---------------------------------------------------------------------

// Retoque UX (2026-09-30, tras validar en producción) — junta los nombres visibles de EVENT_SERVICE_META
// en una frase natural ("comida, bebidas y decoración"), reutilizando el MISMO vocabulario que ya usa el
// checklist del paso 2 del alta — nunca uno nuevo. Puramente de presentación: no decide nada.
function joinSpanishList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
}

// La propuesta razona con lo que el lugar incluye, que ahora se decide en el primer bloque del configurador
// (o, en eventos antiguos, viene del alta antigua). Se lee ANTES de montar el modal para que los conceptos
// propuestos ya lo tengan en cuenta desde el primer render.
function OrganizamePepaModal(props: { event: FamilyEvent; onClose: () => void; onApplied: () => void }) {
  const [includedServices, setIncludedServices] = useState<EventServiceId[] | null>(null)
  useEffect(() => {
    listEventDecisions(props.event.id)
      .then((d) => setIncludedServices(venueServiceIdsForPlan(d, props.event.includedServices)))
      .catch(() => setIncludedServices(props.event.includedServices ?? []))
  }, [props.event.id, props.event.includedServices])
  if (includedServices === null) return null
  return <OrganizamePepaModalContent {...props} includedServices={includedServices} />
}

function OrganizamePepaModalContent({
  event,
  includedServices,
  onClose,
  onApplied,
}: {
  event: FamilyEvent
  includedServices: EventServiceId[]
  onClose: () => void
  onApplied: () => void
}) {
  const plan = generateEventPlan(event, { venueType: event.venueType, includedServices })
  // Retoque UX — informativo únicamente (no cambia `plan`): si el evento no respondió el paso 2, o
  // respondió que no hay servicios incluidos, includedServices queda vacío y esta frase no se muestra.
  const includedServicesSentence =
    includedServices.length > 0 ? `Pepa ha tenido en cuenta que el lugar incluye ${joinSpanishList(includedServices.map((s) => EVENT_SERVICE_META[s].label.toLowerCase()))}.` : null
  const [modulesChecked, setModulesChecked] = useState(() => new Set(plan.missingModules))
  const [budgetChecked, setBudgetChecked] = useState(() => new Set(plan.budgetItems.map((_, i) => i)))
  const [menuChecked, setMenuChecked] = useState(() => new Set(plan.menuItems.map((_, i) => i)))
  const [decorationChecked, setDecorationChecked] = useState(() => new Set(plan.decorationItems.map((_, i) => i)))
  const [activitiesChecked, setActivitiesChecked] = useState(() => new Set(plan.activities.map((_, i) => i)))
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggle<T>(set: Set<T>, setSet: (s: Set<T>) => void, i: T) {
    const next = new Set(set)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    setSet(next)
  }

  const totalCount = budgetChecked.size + menuChecked.size + decorationChecked.size + activitiesChecked.size

  async function handleApply() {
    setApplying(true)
    setError(null)
    try {
      if (modulesChecked.size > 0) {
        await addEnabledModules(event.id, event.enabledModules, [...modulesChecked])
      }
      await Promise.all([
        ...plan.budgetItems.filter((_, i) => budgetChecked.has(i)).map((b) => addEventBudgetItem(event.id, b.category, null)),
        ...plan.menuItems.filter((_, i) => menuChecked.has(i)).map((m) => addEventMenuItem(event.id, m.name)),
        ...plan.decorationItems.filter((_, i) => decorationChecked.has(i)).map((d) => addEventDecorationItem(event.id, d.name)),
        ...plan.activities.filter((_, i) => activitiesChecked.has(i)).map((a) => addEventActivity(event.id, { title: a.title, ageRange: a.ageRange ?? null })),
      ])
      onApplied()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo aplicar la propuesta'))
    } finally {
      setApplying(false)
    }
  }

  const nothingToPropose = plan.budgetItems.length + plan.menuItems.length + plan.decorationItems.length + plan.activities.length === 0

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            🪄 Organízamelo Pepa
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        <p className="muted" style={{ fontSize: 13 }}>
          Propuesta típica de {EVENT_TYPE_META[event.type].label.toLowerCase()} — destilda lo que no te haga falta antes de aplicar. Las tareas no están
          aquí porque ya se crearon solas al hacer el evento.
        </p>
        {includedServicesSentence && (
          <p className="muted" style={{ fontSize: 13 }}>
            ✨ {includedServicesSentence}
          </p>
        )}

        {nothingToPropose && plan.missingModules.length === 0 && <p className="muted">Este tipo de evento no tiene ninguna propuesta automática de partida.</p>}

        {plan.missingModules.length > 0 && (
          <>
            <strong style={{ fontSize: 13 }}>Módulos que hacen falta para esto</strong>
            <div className="event-list" style={{ marginTop: 4 }}>
              {plan.missingModules.map((m) => {
                const meta = EVENT_MODULES.find((em) => em.key === m)
                return (
                  // Retoque UX (2026-09-30) — flexDirection:'row' explícito: el <label> base de la app es
                  // flex-direction:column (para "Nombre\n<input>"), y .inline-fields solo pone display:flex
                  // sin fijar la dirección, así que sin esto el checkbox y el texto quedaban uno debajo del
                  // otro en vez de en la misma fila.
                  <label key={m} className="inline-fields" style={{ alignItems: 'center', flexDirection: 'row' }}>
                    <input type="checkbox" checked={modulesChecked.has(m)} onChange={() => toggle(modulesChecked, setModulesChecked, m)} />
                    <span>
                      {meta?.icon} {meta?.label}
                    </span>
                  </label>
                )
              })}
            </div>
          </>
        )}

        {plan.budgetItems.length > 0 && (
          <>
            <strong style={{ fontSize: 13, display: 'block', marginTop: 10 }}>💰 Presupuesto</strong>
            <div className="event-list" style={{ marginTop: 4 }}>
              {plan.budgetItems.map((b, i) => (
                <label key={b.category} className="inline-fields" style={{ alignItems: 'center', flexDirection: 'row' }}>
                  <input type="checkbox" checked={budgetChecked.has(i)} onChange={() => toggle(budgetChecked, setBudgetChecked, i)} />
                  {/* Retoque UX (2026-09-30) — nombre + subtexto en una sola columna compacta, en vez de
                      dos <span> separados a lo ancho de la fila (obligaba a más alto en móvil). */}
                  <span style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <span>{b.category}</span>
                    {/* Bloque 11 (cola nocturna) — PEPA propone el CONCEPTO, nunca un importe inventado;
                        se pone la cifra real después, desde Presupuesto. */}
                    <span className="muted" style={{ fontSize: 12 }}>
                      Sin importe todavía
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </>
        )}

        {plan.menuItems.length > 0 && (
          <>
            <strong style={{ fontSize: 13, display: 'block', marginTop: 10 }}>🍽️ Menú</strong>
            <div className="event-list" style={{ marginTop: 4 }}>
              {plan.menuItems.map((m, i) => (
                <label key={m.name} className="inline-fields" style={{ alignItems: 'center', flexDirection: 'row' }}>
                  <input type="checkbox" checked={menuChecked.has(i)} onChange={() => toggle(menuChecked, setMenuChecked, i)} />
                  <span>{m.name}</span>
                </label>
              ))}
            </div>
          </>
        )}

        {plan.decorationItems.length > 0 && (
          <>
            <strong style={{ fontSize: 13, display: 'block', marginTop: 10 }}>🎈 Decoración</strong>
            <div className="event-list" style={{ marginTop: 4 }}>
              {plan.decorationItems.map((d, i) => (
                <label key={d.name} className="inline-fields" style={{ alignItems: 'center', flexDirection: 'row' }}>
                  <input type="checkbox" checked={decorationChecked.has(i)} onChange={() => toggle(decorationChecked, setDecorationChecked, i)} />
                  <span>{d.name}</span>
                </label>
              ))}
            </div>
          </>
        )}

        {plan.activities.length > 0 && (
          <>
            <strong style={{ fontSize: 13, display: 'block', marginTop: 10 }}>🎲 Actividades</strong>
            <div className="event-list" style={{ marginTop: 4 }}>
              {plan.activities.map((a, i) => (
                <label key={a.title} className="inline-fields" style={{ alignItems: 'center', flexDirection: 'row' }}>
                  <input type="checkbox" checked={activitiesChecked.has(i)} onChange={() => toggle(activitiesChecked, setActivitiesChecked, i)} />
                  <span>{a.title}</span>
                </label>
              ))}
            </div>
          </>
        )}

        {!nothingToPropose && (
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            Pepa va a añadir {totalCount} {totalCount === 1 ? 'elemento' : 'elementos'} en total.
          </p>
        )}

        <button type="button" onClick={handleApply} disabled={applying || (nothingToPropose && modulesChecked.size === 0)} style={{ marginTop: 12 }}>
          {applying ? 'Aplicando…' : 'Aplicar'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Fase 4 — plantillas personales. Petición de la Skill
// (06-custom-event.md): "Do not copy old live RSVP/expense state into
// new occurrences" — solo se guarda la configuración, nunca datos en
// marcha (ver saveEventTemplate).
// ---------------------------------------------------------------------

function SaveTemplateModal({ event, onClose, onSaved }: { event: FamilyEvent; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(event.title)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!name.trim()) {
      setError('Ponle un nombre a la plantilla.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await saveEventTemplate(name, event)
      onSaved()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar la plantilla'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Guardar como plantilla
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <p className="muted" style={{ fontSize: 13 }}>
          Se guarda el tipo, el tema y los módulos activados — nunca invitados, RSVP ni gastos. Útil para eventos que se repiten (la comida de Navidad, el
          cumpleaños de cada año...).
        </p>
        <form className="card member-form" onSubmit={handleSubmit}>
          {error && <p className="error">{error}</p>}
          <label>
            Nombre de la plantilla
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Comida de Navidad" autoFocus />
          </label>
          <button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar plantilla'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Fase 4 — resumen final al archivar (master-spec, punto 16: "Provide
// an end summary such as: budget vs spent, final attendance, task
// completion, net cost where gifts received are tracked").
// ---------------------------------------------------------------------

function EndSummaryModal({ event, onClose, onConfirmed }: { event: FamilyEvent; onClose: () => void; onConfirmed: () => void }) {
  const [loading, setLoading] = useState(true)
  const [confirmedPeople, setConfirmedPeople] = useState(0)
  const [taskStats, setTaskStats] = useState({ done: 0, total: 0 })
  const [plannedBudget, setPlannedBudget] = useState<number | null>(null)
  const [spentBudget, setSpentBudget] = useState<number | null>(null)
  const [cashGifts, setCashGifts] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([
      event.enabledModules.includes('invitados') ? listEventGuests(event.id) : Promise.resolve([]),
      event.enabledModules.includes('tareas') ? listEventTasks(event.id) : Promise.resolve([]),
      event.enabledModules.includes('presupuesto') ? listEventBudgetItems(event.id) : Promise.resolve([]),
      event.tagId && event.enabledModules.includes('presupuesto') ? listExpenses() : Promise.resolve(null),
      event.enabledModules.includes('regalos') ? listEventGifts(event.id) : Promise.resolve([]),
      event.tagId && event.enabledModules.includes('presupuesto') ? listBudgetCategories() : Promise.resolve([]),
    ]).then(([guests, tasks, budgetItems, expenses, gifts, categories]) => {
      const confirmed = guests.filter((g) => g.rsvpStatus === 'confirmado')
      setConfirmedPeople(confirmed.reduce((sum, g) => sum + (g.rsvpAdultsCount ?? g.adultsCount) + (g.rsvpChildrenCount ?? g.childrenCount), 0))
      setTaskStats({ done: tasks.filter((t) => t.done).length, total: tasks.length })
      if (event.enabledModules.includes('presupuesto')) {
        setPlannedBudget(budgetItems.reduce((sum, i) => sum + (i.plannedAmount ?? 0), 0))
        setSpentBudget(
          expenses
            ? expenses
                .filter((e) => e.tagId === event.tagId && !e.isIncome && !isInternalTransferCategory(e.category, categories))
                .reduce((sum, e) => sum + e.amount, 0)
            : null,
        )
      }
      if (event.enabledModules.includes('regalos')) {
        setCashGifts(gifts.reduce((sum, g) => sum + (g.cashAmount ?? 0), 0))
      }
      setLoading(false)
    })
  }, [event.id, event.enabledModules, event.tagId])

  const netCost = spentBudget !== null && cashGifts !== null ? spentBudget - cashGifts : null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Resumen de {event.title}
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        {loading ? (
          <p className="muted">Calculando…</p>
        ) : (
          <div className="event-list">
            {event.enabledModules.includes('invitados') && <p>👥 Asistencia final: {confirmedPeople} personas confirmadas</p>}
            {taskStats.total > 0 && (
              <p>
                ✅ Tareas: {taskStats.done} de {taskStats.total} hechas
              </p>
            )}
            {plannedBudget !== null && (
              <p>
                💰 Presupuesto: {plannedBudget.toFixed(2)} € planeados{spentBudget !== null ? ` · ${spentBudget.toFixed(2)} € gastados` : ''}
              </p>
            )}
            {cashGifts !== null && <p>🎀 Regalos en efectivo: {cashGifts.toFixed(2)} €</p>}
            {netCost !== null && <p>🧮 Coste neto (gastado menos regalos): {netCost.toFixed(2)} €</p>}
            {confirmedPeople === 0 && taskStats.total === 0 && plannedBudget === null && cashGifts === null && (
              <p className="muted">No hay datos suficientes todavía para un resumen — se puede archivar igual.</p>
            )}
          </div>
        )}
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Archivar guarda todo esto tal cual está — invitados, presupuesto, tareas e invitación no se borran, y se puede reactivar cuando quieras.
        </p>
        <ConfirmButton label="📦 Archivar" confirmLabel="Confirmar" onConfirm={onConfirmed} />
      </div>
    </div>
  )
}
