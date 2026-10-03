import { type CSSProperties, FormEvent, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import eventosHeaderImg from '@/assets/eventos/eventos-header.jpg'
import pepaFaceReference from '@/assets/brand/references/pepa-face-reference-official.jpg'
import { SectionBreadcrumb, type BreadcrumbLevel } from '@/ui/SectionBreadcrumb'
import { useSectionHome, useLocationFlag } from '@/ui/useSectionHome'
import {
  addEventActivity,
  addEventBudgetItem,
  addEventDayPlanItem,
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
  deleteEventDayPlanItem,
  deleteEventDecision,
  deleteEventDecorationItem,
  deleteEventFavorItem,
  deleteEventGift,
  deleteEventGuest,
  deleteEventGuestMember,
  deleteEventGuestQuestion,
  deleteEventGuestQuestionOption,
  deleteEventMenuItem,
  deleteEventMoment,
  deleteEventPayment,
  deleteEventProvider,
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
  transferMenuToShopping,
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
import { REMINDER_UNIT_OPTIONS, reminderLabel, reminderMinutesFrom, type EventReminder, type ReminderUnit } from '@/domain/reminders'
import { isInternalTransferCategory } from '@/domain/finance'
import { errorMessage } from '@/domain/errorMessage'
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
  INCLUDABLE_SERVICES_BY_TYPE,
  INVITATION_TEMPLATES,
  isOverdueTask,
  isToday,
  momentsLocationLines,
  momentsLocationMapLines,
  rankUpcomingTasks,
  RECOMMENDED_MODULES,
  resolveEventMoments,
  resolveGuestInvitedMoments,
  sortInvitationTemplatesForEvent,
} from '@/domain/events'
import { loadConfiguratorOpen, saveConfiguratorOpen } from '@/state/eventPlanningConfiguratorState'
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
  FLORAL_ITEMS,
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
import { LUGAR_CONTEXTO_QUESTION_KEY, lugarContextoStatus, type LugarContextoAnswer, type LugarContextoChoice } from '@/domain/eventLocationContext'
import {
  CLASES_BAILE_QUESTION_KEY,
  desiredForClasesBaile,
  MOMENTOS_ESPECIALES_CATALOG,
  MOMENTOS_ESPECIALES_QUESTION_KEY,
  summarizeMomentosEspecialesBlock,
  type ClasesBaileAnswer,
  type ClasesBaileChoice,
  type MomentoEspecialCatalogItem,
  type MomentoEspecialKey,
  type MomentosEspecialesAnswer,
} from '@/domain/eventSpecialMoments'
import { notifyEventMomentsChanged, useEventMomentsChangeSignal } from '@/state/eventMomentsSync'
import { showToast } from '@/state/toast'
// Fase 8 — reutiliza el formateador DD/MM/YYYY que ya existe en
// Previsión (Economía) en vez de escribir uno nuevo para Eventos; es
// una función pura sin ninguna dependencia de Previsión/Economía.
import { formatSpanishDate } from '@/domain/forecastInstallmentPlanForm'
import { pastelPalette } from '@/domain/colors'
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
  EventProvider,
  EventServiceId,
  EventSpecialDetail,
  EventTableSeat,
  EventTask,
  EventTemplate,
  EventType,
  EventVenueType,
  FamilyEvent,
  FamilyMember,
  GuestQuestionScope,
  ShoppingItem,
  InvitationCanvas,
} from '@/domain/types'
import { canShareFiles, shareFiles, shareText } from '@/services/share'
import { exportInvitationImage } from '@/services/invitationExport'
import { ConfirmButton, ConfirmIconButton } from '@/ui/ConfirmButton'
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
const DATE_STATUS_OPTIONS: { value: FamilyEvent['dateStatus']; label: string }[] = [
  { value: 'pendiente', label: 'Todavía sin fecha' },
  { value: 'provisional', label: 'Fecha provisional' },
  { value: 'confirmada', label: 'Fecha confirmada' },
]

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
  const [searchParams, setSearchParams] = useSearchParams()
  const [initialModule, setInitialModule] = useState<EventModuleKey | null>(null)
  // "Eventos" del breadcrumb siempre vuelve a la lista (Inicio), incluso ya estando en /eventos.
  // initialModule se resetea también: si no, el próximo evento que se abra (normal, no por deep-link)
  // heredaría un módulo que ya no tiene sentido en vez de abrir en su propio Inicio.
  useSectionHome(() => {
    setSelectedId(null)
    setInitialModule(null)
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
          !selected
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

      {selected ? (
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

function CreateEventModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [type, setType] = useState<EventType>('cumpleanos')
  const [title, setTitle] = useState('')
  const [subtype, setSubtype] = useState(CELEBRATION_SUBTYPES[0])
  const [ageTurning, setAgeTurning] = useState('')
  const [dateStatus, setDateStatus] = useState<FamilyEvent['dateStatus']>('pendiente')
  const [eventDate, setEventDate] = useState('')
  // Fase 1 del "inicio inteligente" (2026-09-30) — paso 1/2 del alta: dónde se celebra y, solo si hay
  // servicios, qué incluye ya. '' = no respondido todavía (nunca se envía como '', ver handleSubmit).
  const [venueType, setVenueType] = useState<EventVenueType | ''>('')
  const [includedServices, setIncludedServices] = useState<EventServiceId[]>([])
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
  const includableServices = INCLUDABLE_SERVICES_BY_TYPE[type]
  // Solo cuando el paso 1 dice explícitamente "hay servicios incluidos" — 'casa_propia' y 'otro' no
  // presuponen nada, nunca se muestra el checklist para esos dos casos (petición explícita: "otro" no
  // implica que exista ningún proveedor).
  const showIncludedServicesStep = venueType === 'restaurante_local' && includableServices.length > 0

  function handleTypeChange(next: EventType) {
    setType(next)
    setModules(RECOMMENDED_MODULES[next])
    // El checklist de servicios depende del tipo (INCLUDABLE_SERVICES_BY_TYPE) — una selección de un
    // tipo anterior podría ya no significar nada en el nuevo tipo, así que se limpia.
    setIncludedServices([])
  }

  function toggleIncludedService(id: EventServiceId) {
    setIncludedServices((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
  }

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
    if (type === 'cumpleanos' && !ageTurning.trim()) {
      setError('¿Cuántos años cumple?')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const details: Record<string, unknown> = {}
      if (type === 'cumpleanos') details.ageTurning = Number(ageTurning)
      const id = await createEvent({
        type,
        subtype: type === 'celebracion' ? subtype : null,
        title,
        dateStatus,
        eventDate: dateStatus === 'pendiente' ? null : eventDate || null,
        details,
        enabledModules: modules,
        theme,
        venueType: venueType || null,
        includedServices: showIncludedServicesStep && includedServices.length > 0 ? includedServices : null,
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
          {type === 'cumpleanos' && (
            <label>
              ¿Cuántos años cumple?
              <input type="number" min={0} value={ageTurning} onChange={(e) => setAgeTurning(e.target.value)} />
            </label>
          )}
          <label>
            Fecha
            <select value={dateStatus} onChange={(e) => setDateStatus(e.target.value as FamilyEvent['dateStatus'])}>
              {DATE_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {dateStatus !== 'pendiente' && (
            <label>
              {dateStatus === 'provisional' ? 'Fecha provisional' : 'Fecha'}
              <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
            </label>
          )}

          {/* Fase 1 del "inicio inteligente" (2026-09-30) — paso 1: dónde se celebra. En los tipos con
              doble ubicación (boda/comunión/bautizo) se pregunta por la celebración/banquete, nunca por
              la ceremonia — esa ya tiene su propio campo (CeremoniaSection, tras crear el evento) y una
              iglesia/parroquia nunca "incluye" catering/música/decoración, así que no aporta nada aquí. */}
          <label>
            {DUAL_LOCATION_EVENT_TYPES.includes(type) ? '¿Dónde es la celebración (después de la ceremonia)?' : '¿Dónde se celebra?'}
            <select value={venueType} onChange={(e) => setVenueType(e.target.value as EventVenueType | '')}>
              <option value="">Prefiero no decirlo ahora</option>
              <option value="restaurante_local">Restaurante/local con servicios incluidos</option>
              <option value="casa_propia">Casa o espacio propio, lo organizamos nosotros</option>
              <option value="otro">Otro</option>
            </select>
          </label>
          {showIncludedServicesStep && (
            <label>
              ¿Qué incluye ya el lugar/proveedor?
              <div className="filter-row" style={{ flexWrap: 'wrap' }}>
                {includableServices.map((s) => {
                  const checked = includedServices.includes(s)
                  return (
                    <button key={s} type="button" className={'chip' + (checked ? ' chip-active' : '')} onClick={() => toggleIncludedService(s)}>
                      {EVENT_SERVICE_META[s].label}
                    </button>
                  )
                })}
              </div>
              <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Lo que marques aquí no hace falta volver a presupuestarlo aparte — pero seguirás pudiendo
                decidir sabor, colores, contacto del proveedor y todo lo demás desde el propio evento.
              </p>
            </label>
          )}

          {/* Paso 3 — sustituye el antiguo "Recomendado"/"Elegir yo": los 14 módulos están siempre
              visibles, los recomendados llegan premarcados, y el usuario decide libremente (marcar,
              desmarcar, combinar) — nunca ocultos, nunca bloqueados. */}
          <strong style={{ marginTop: 8 }}>¿Qué quieres organizar en PEPA?</strong>
          <p className="muted" style={{ fontSize: 12, margin: '-4px 0 0' }}>
            ✨ Pepa te recomienda {recommendedModules.length} de {EVENT_MODULES.length} módulos para este evento.
          </p>
          <ModulePickerChips modules={modules} onChange={setModules} recommended={new Set(recommendedModules)} />
          <p className="muted" style={{ fontSize: 12 }}>
            Podrás activar o desactivar módulos más adelante desde el propio evento.
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
  const [newTaskTitle, setNewTaskTitle] = useState('')
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
    listEventTasks(event.id)
      .then(setTasks)
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar las tareas')))
  }
  useEffect(reloadTasks, [event.id])

  const pendingTasks = tasks.filter((t) => !t.done)
  const visibleTasks = showAllTasks ? pendingTasks : pendingTasks.slice(0, 5)
  // Bloque 9 — nunca se borran solas: mismo array `tasks` de siempre, solo el lado done:true.
  const completedTasks = tasks.filter((t) => t.done)
  const hasTasksModule = event.enabledModules.includes('tareas')

  async function handleAddTask(ev: FormEvent) {
    ev.preventDefault()
    if (!newTaskTitle.trim()) return
    try {
      await addEventTask(event.id, newTaskTitle)
      setNewTaskTitle('')
      reloadTasks()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir la tarea'))
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
  const hasMenuModule = event.enabledModules.includes('menu_compra')
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
  const deepLinkHighlightTaskId = initialModule === 'tareas' ? (rankUpcomingTasks(tasks)[0]?.task.id ?? null) : null

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
    hasMenuModule,
    menuItemsTotal: menuItems.length,
    menuItemsTransferred: menuItems.filter((i) => i.transferred).length,
    nextMilestone: statusSummary.nextMilestone,
  })

  // "Pepa te recomienda" — hasta 3 tareas pendientes, vencidas primero
  // y luego las más próximas (rankUpcomingTasks, domain/events.ts).
  const upcomingTasks = rankUpcomingTasks(tasks).slice(0, 3)

  // Fase 11 — "recordatorio cuando aporte valor": solo se pide para las
  // hasta 3 tareas que ya se muestran aquí, nunca para todas las
  // tareas del evento. Reutiliza listEventReminders (Fase 10, mismo
  // almacén que Calendario) — desaparece sola si la tarea deja de
  // estar entre las recomendadas (p. ej. al resolverse).
  const [upcomingReminders, setUpcomingReminders] = useState<Record<string, EventReminder>>({})
  useEffect(() => {
    const linked = rankUpcomingTasks(tasks)
      .slice(0, 3)
      .map((r) => r.task)
      .filter((t): t is EventTask & { calendarEventId: string } => t.calendarEventId != null)
    if (linked.length === 0) {
      setUpcomingReminders({})
      return
    }
    Promise.all(linked.map((t) => listEventReminders(t.calendarEventId).then((rs) => [t.id, rs[0]] as const)))
      .then((pairs) => setUpcomingReminders(Object.fromEntries(pairs.filter((p): p is [string, EventReminder] => !!p[1]))))
      .catch(() => {})
  }, [tasks])

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
  // "Menú y compra": las dos aparecen o desaparecen juntas.
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
        const pending = menuItems.filter((i) => !i.transferred).length
        stat = menuItems.length === 0 ? 'Sin elementos' : pending > 0 ? `${pending} sin traspasar` : 'Todo traspasado'
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
            <div className="event-list" style={{ marginTop: 8 }}>
              {visibleTasks.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  responsible={familyMembers.find((m) => m.id === t.assignedMemberId) ?? null}
                  highlighted={t.id === deepLinkHighlightTaskId}
                  onToggleDone={() => updateEventTask(t.id, { done: true }).then(reloadTasks)}
                  onEdit={() => setEditingTaskId(t.id)}
                  onDelete={() => deleteEventTask(t.id).then(reloadTasks)}
                />
              ))}
            </div>
            {pendingTasks.length > 5 && (
              <button type="button" className="link-button" onClick={() => setShowAllTasks((v) => !v)}>
                {showAllTasks ? 'Ver menos' : `Ver todas (${pendingTasks.length})`}
              </button>
            )}
            <form onSubmit={handleAddTask} className="inline-fields" style={{ marginTop: 8 }}>
              <input type="text" value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} placeholder="+ Añadir tarea" style={{ flex: 1 }} />
              <button type="submit">Añadir</button>
            </form>
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
                        responsible={familyMembers.find((m) => m.id === t.assignedMemberId) ?? null}
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
                familyMembers={familyMembers}
                onClose={() => setEditingTaskId(null)}
                onSaved={() => {
                  setEditingTaskId(null)
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
        return <MenuSection key={`menu-${refreshKey}`} eventId={event.id} />
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
        return <DetailsSection eventId={event.id} />
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
                <button
                  type="button"
                  className="event-status-badge"
                  onClick={() => setShowManage(true)}
                  title={event.dateStatus === 'confirmada' ? 'Fecha confirmada — tocar para editar' : 'Fecha provisional — tocar para editar'}
                  aria-label={event.dateStatus === 'confirmada' ? 'Fecha confirmada' : 'Fecha provisional'}
                >
                  {event.dateStatus === 'confirmada' ? '✔️' : '❓'}
                </button>
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
            {upcomingTasks.map(({ task, priority, daysUntil: d }) => {
              const responsible = familyMembers.find((m) => m.id === task.assignedMemberId)
              const reminder = upcomingReminders[task.id]
              return (
                <div key={task.id} className="inline-fields" style={{ alignItems: 'center' }}>
                  <span className={`event-priority-dot event-priority-${priority}`} aria-hidden="true" />
                  <input type="checkbox" checked={task.done} onChange={() => updateEventTask(task.id, { done: true }).then(reloadTasks)} />
                  <span style={{ flex: 1 }}>
                    {task.title}
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
  const [dateStatus, setDateStatus] = useState(event.dateStatus)
  const [eventDate, setEventDate] = useState(event.eventDate ?? '')
  const [venueLabel, setVenueLabel] = useState(event.venueLabel ?? '')
  const [venueCoords, setVenueCoords] = useState(
    event.venueLatitude != null && event.venueLongitude != null ? { latitude: event.venueLatitude, longitude: event.venueLongitude } : null,
  )
  // Corrección real (bug observado: la dirección postal legible desaparecía al volver a abrir "Gestionar
  // evento") — dirección/place_id del sitio elegido, por separado de venueLabel/venueCoords.
  const [venueAddress, setVenueAddress] = useState(event.venueAddress ?? null)
  const [venuePlaceId, setVenuePlaceId] = useState(event.venuePlaceId ?? null)
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
      const nextDate = dateStatus === 'pendiente' ? null : eventDate || null
      await updateEvent(event.id, {
        title,
        dateStatus,
        eventDate: nextDate,
        venueLabel: venueLabel || null,
        venueLatitude: venueCoords?.latitude ?? null,
        venueLongitude: venueCoords?.longitude ?? null,
        venueAddress: venueAddress,
        venuePlaceId: venuePlaceId,
        theme: theme || null,
        rsvpDeadline: rsvpDeadline || null,
      })
      // Petición de la Skill: "relative tasks update when event date
      // changes" — solo se recalcula si la fecha de verdad ha cambiado.
      if (nextDate !== event.eventDate) await recalculateAutoTasks(event.id, event.type, nextDate)
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
          <label>
            Fecha
            <select value={dateStatus} onChange={(e) => setDateStatus(e.target.value as FamilyEvent['dateStatus'])}>
              {DATE_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {dateStatus !== 'pendiente' && (
            <label>
              {dateStatus === 'provisional' ? 'Fecha provisional' : 'Fecha'}
              <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
            </label>
          )}
          {/* Fase 2 — un evento estructurado por momentos (más abajo, sección "Momentos") no tiene un
              único "Lugar": mostrarlo aquí sería el mismo dato duplicado que ya detectó la auditoría real
              (venue_label = celebration_location_label en "Boda de plata"). Eventos simples (cumpleaños,
              comidas...) siguen exactamente igual que siempre. */}
          {!isEventStructuredByMoments(event) && (
            <>
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
            </>
          )}
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

        {isEventStructuredByMoments(event) && (
          <div className="card event-card" style={{ marginTop: 8 }}>
            <strong>Momentos</strong>
            <p className="muted" style={{ fontSize: 13 }}>
              Ceremonia, celebración o cualquier otro momento con su propio lugar y hora — al invitar a cada familia, eliges a cuáles va.
            </p>
            <MomentsEditor event={event} onChanged={onChanged} />
          </div>
        )}

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
function TaskCard({
  task,
  responsible,
  highlighted = false,
  onToggleDone,
  onEdit,
  onDelete,
}: {
  task: EventTask
  responsible: FamilyMember | null
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
  return (
    <div className={'card event-task-card' + (highlighted ? ' event-task-card-highlighted' : '')}>
      <input type="checkbox" checked={task.done} onChange={onToggleDone} aria-label={`Marcar "${task.title}" como hecha`} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{task.title}</div>
        {(task.dueDate || responsible) && (
          <div className="muted event-task-card-meta">
            {task.dueDate && (
              <span style={overdue ? { color: '#dc2626', fontWeight: 600 } : undefined}>
                📅 {formatSpanishDate(task.dueDate)}
                {overdue ? ' · 🔴 Atrasada' : ''}
              </span>
            )}
            {responsible && <span>👤 {responsible.name}</span>}
          </div>
        )}
      </div>
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
                ✏️ Editar
              </button>
              {onDelete && <ConfirmButton label="🗑️ Borrar" confirmLabel="Borrar" className="link-button" onConfirm={onDelete} />}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function TaskEditModal({
  task,
  familyMembers,
  onClose,
  onSaved,
}: {
  task: EventTask
  familyMembers: FamilyMember[]
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(task.title)
  const [dueDate, setDueDate] = useState(task.dueDate ?? '')
  const [assignedMemberId, setAssignedMemberId] = useState(task.assignedMemberId ?? '')
  // Fase 9 — la propia presencia de calendarEventId es el estado
  // inicial del interruptor; no hay una columna booleana aparte.
  const [showInCalendar, setShowInCalendar] = useState(task.calendarEventId != null)
  // Fase 10 — recordatorio de la tarea: como mucho uno (no una lista),
  // igual que el plazo de RSVP (DEFAULT_DEADLINE_REMINDERS). Solo tiene
  // sentido si la tarea está enlazada al Calendario.
  const [reminderChoice, setReminderChoice] = useState<'none' | 'same_day' | '1_day' | '1_week' | 'custom'>('none')
  const [customAmount, setCustomAmount] = useState('1')
  const [customUnit, setCustomUnit] = useState<ReminderUnit>('dias')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!task.calendarEventId) return
    listEventReminders(task.calendarEventId)
      .then((reminders) => {
        const r = reminders[0]
        if (!r) setReminderChoice('none')
        else if (r.minutesBefore === 0) setReminderChoice('same_day')
        else if (r.minutesBefore === 1440) setReminderChoice('1_day')
        else if (r.minutesBefore === 10080) setReminderChoice('1_week')
        else setReminderChoice('custom')
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function remindersForChoice(): EventReminder[] {
    switch (reminderChoice) {
      case 'none':
        return []
      case 'same_day':
        return [{ minutesBefore: 0, anchor: 'start' }]
      case '1_day':
        return [{ minutesBefore: 1440, anchor: 'start' }]
      case '1_week':
        return [{ minutesBefore: 10080, anchor: 'start' }]
      case 'custom':
        return [{ minutesBefore: reminderMinutesFrom(Number(customAmount) || 1, customUnit), anchor: 'start' }]
    }
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
      await updateEventTask(task.id, { title, dueDate: dueDate || null, assignedMemberId: assignedMemberId || null })
      const wasLinked = task.calendarEventId != null
      let linkedId: string | null = task.calendarEventId
      if (showInCalendar && !wasLinked && dueDate) linkedId = await linkEventTaskToCalendar(task.id)
      else if (!showInCalendar && wasLinked) {
        await unlinkEventTaskFromCalendar(task.id)
        linkedId = null
      }
      if (linkedId) await replaceReminders(linkedId, remindersForChoice())
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
            Editar tarea
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
          <label>
            Fecha
            <input
              type="date"
              value={dueDate}
              onChange={(e) => {
                setDueDate(e.target.value)
                if (!e.target.value) setShowInCalendar(false)
              }}
            />
          </label>
          <label>
            Responsable
            {/* Fase 6 — nunca inferido: "Sin asignar" sigue siéndolo salvo que alguien elija a mano. */}
            <select value={assignedMemberId} onChange={(e) => setAssignedMemberId(e.target.value)}>
              <option value="">Sin asignar</option>
              {familyMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
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
            <label>
              Recordatorio
              <select value={reminderChoice} onChange={(e) => setReminderChoice(e.target.value as typeof reminderChoice)}>
                <option value="none">🔔 Sin aviso</option>
                <option value="same_day">🔔 El mismo día</option>
                <option value="1_day">🔔 1 día antes</option>
                <option value="1_week">🔔 1 semana antes</option>
                <option value="custom">🔔 Personalizado</option>
              </select>
            </label>
          )}
          {showInCalendar && reminderChoice === 'custom' && (
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
          <button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
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
}: {
  event: FamilyEvent
  onChanged: () => void
  // Fallo 1 (Fase 3) — PairBlock escribe event_tasks/event_budget_items directamente en Supabase; sin
  // esto, Preparativos y la tarjeta-resumen de Presupuesto en EventDetail se quedan con el estado cargado
  // al montar, invisibles hasta recargar la página entera. Mismo hueco que nunca existió con Momentos
  // (Fase 2), que nunca toca esas dos tablas.
  onDerivedDataChanged: () => void
}) {
  const [open, setOpen] = useState(() => loadConfiguratorOpen(event.id))
  const [blockOpen, setBlockOpen] = useState(() => loadConfiguratorOpen(event.id, 'ceremonia_celebracion'))
  // "📍 Dónde lo vais a celebrar" — alternativa ligera a Ceremonia y celebración para eventos SIN ceremonia
  // (cumpleaños, celebración, personalizado, o boda/comunión/bautizo con el módulo "ceremonia" apagado):
  // mutuamente excluyente con el bloque de arriba, nunca los dos a la vez.
  const [lugarOpen, setLugarOpen] = useState(() => loadConfiguratorOpen(event.id, 'lugar_contexto'))
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

  function toggleOpen() {
    const next = !open
    setOpen(next)
    saveConfiguratorOpen(event.id, null, next)
  }
  function toggleBlock() {
    const next = !blockOpen
    setBlockOpen(next)
    saveConfiguratorOpen(event.id, 'ceremonia_celebracion', next)
  }
  function toggleLugarBlock() {
    const next = !lugarOpen
    setLugarOpen(next)
    saveConfiguratorOpen(event.id, 'lugar_contexto', next)
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
      {open && (
        <div style={{ marginTop: 8 }}>
          {isEventStructuredByMoments(event) ? (
            <>
              <button
                type="button"
                className="link-button"
                onClick={toggleBlock}
                style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', fontWeight: 600, textAlign: 'left' }}
                aria-expanded={blockOpen}
              >
                🕊️ Ceremonia y celebración
                <span aria-hidden="true">{blockOpen ? '▾' : '▸'}</span>
              </button>
              {blockOpen && (
                <div style={{ marginTop: 4 }}>
                  <MomentsEditor event={event} onChanged={onChanged} />
                </div>
              )}
            </>
          ) : (
            <div>
              <button
                type="button"
                className="link-button"
                onClick={toggleLugarBlock}
                style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', fontWeight: 600, textAlign: 'left' }}
                aria-expanded={lugarOpen}
              >
                📍 Dónde lo vais a celebrar
                <span aria-hidden="true">{lugarOpen ? '▾' : '▸'}</span>
              </button>
              {lugarOpen && (
                <div style={{ marginTop: 4 }}>
                  <LugarContextoBlock event={event} onChanged={onChanged} />
                </div>
              )}
            </div>
          )}
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
                  <PairBlock event={event} onChanged={onChanged} onDerivedDataChanged={onDerivedDataChanged} />
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
                <GuestsDecisionsBlock event={event} onChanged={onChanged} onDerivedDataChanged={onDerivedDataChanged} />
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
                <MomentosEspecialesBlock event={event} onDerivedDataChanged={onDerivedDataChanged} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const LUGAR_CONTEXTO_OPTIONS: { value: LugarContextoChoice; label: string }[] = [
  { value: 'en_casa', label: 'En casa' },
  { value: 'restaurante_local', label: 'Restaurante / local' },
  { value: 'exterior', label: 'Exterior' },
  { value: 'otro', label: 'Otro lugar' },
  { value: 'todavia_no_lo_sabemos', label: 'Todavía no lo sabemos' },
]

// "📍 Dónde lo vais a celebrar" — una sola pregunta de CONTEXTO (nunca la dirección, que sigue viviendo en
// venueLabel/"Gestionar evento"), nunca genera Preparativo/Presupuesto/Proveedor por sí sola (igual que
// Momentos en Invitados): se guarda directamente con upsertEventDecision, sin pasar por
// applyPairDecisionGeneration, porque no hay nada que reconciliar.
function LugarContextoBlock({ event, onChanged }: { event: FamilyEvent; onChanged: () => void }) {
  const [decisions, setDecisions] = useState<EventDecision[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function reload(): Promise<void> {
    return listEventDecisions(event.id)
      .then((d) => setDecisions(d.filter((x) => x.questionKey === LUGAR_CONTEXTO_QUESTION_KEY)))
      .catch((err) => setError(errorMessage(err, 'No se pudo cargar')))
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id])

  async function save(answer: { choice: LugarContextoChoice; custom?: CustomResolution }) {
    setSaving(true)
    setError(null)
    try {
      await upsertEventDecision(event.id, {
        blockKey: 'lugar_contexto',
        questionKey: LUGAR_CONTEXTO_QUESTION_KEY,
        answer: answer as unknown as Record<string, unknown>,
        isCustomOption: answer.choice === 'otro',
      })
      await reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return null
  const decision = decisions.find((d) => d.questionKey === LUGAR_CONTEXTO_QUESTION_KEY)
  const status = lugarContextoStatus(decisions)
  const lugarAnswer = decision?.answer as unknown as LugarContextoAnswer | undefined

  return (
    <div className="card" style={{ padding: 8 }}>
      {status === 'por_decidir' && (
        <p className="muted" style={{ fontSize: 13, margin: '0 0 6px' }}>
          ⏳ por decidir
        </p>
      )}
      {error && <p className="error">{error}</p>}
      <CustomAwareQuestion
        event={event}
        questionLabel="¿Dónde lo vais a celebrar?"
        options={LUGAR_CONTEXTO_OPTIONS}
        questionKey={LUGAR_CONTEXTO_QUESTION_KEY}
        decision={decision}
        savingKey={saving ? LUGAR_CONTEXTO_QUESTION_KEY : null}
        onSave={(answer) => save(answer as LugarContextoAnswer)}
      />
      {/* "En casa" → proponer la Casa familiar (siguiente mejora, validada por separado) — la DECISIÓN
          de contexto ("lo celebramos en casa") y la UBICACIÓN física (events.venue_*) son dos cosas
          distintas a propósito: esto solo entra en juego cuando la decisión ya es 'en_casa', nunca
          guarda nada propio en event_decisions. */}
      {lugarAnswer?.choice === 'en_casa' && <CasaLocationBlock event={event} onChanged={onChanged} />}
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
  const [editing, setEditing] = useState(false)
  const [skipProposal, setSkipProposal] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listPlaces()
      .then((places) => setCasa(places.find((p) => p.name.trim().toLowerCase() === 'casa') ?? null))
      .catch(() => setCasa(null))
  }, [])

  const hasVenue = event.venueLatitude != null && event.venueLongitude != null
  const showSummary = hasVenue && !editing

  async function handleConfirmCasa() {
    if (!casa) return
    setConfirming(true)
    setError(null)
    let address: string | null = null
    try {
      address = await reverseGeocode(casa.latitude, casa.longitude)
    } catch {
      // Dirección solo informativa/opcional — si falla (cupo diario, red), se guarda sin ella y el
      // enlace de mapa sigue funcionando por coordenadas (fallback ya validado).
    }
    try {
      await updateEvent(event.id, {
        venueLabel: event.venueLabel?.trim() ? event.venueLabel : casa.name,
        venueLatitude: casa.latitude,
        venueLongitude: casa.longitude,
        venueAddress: address,
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
            {casa.category ? `${casa.category} · ` : ''}
            {casa.latitude.toFixed(5)}, {casa.longitude.toFixed(5)}
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

function ChoiceRow<T extends string>({
  options,
  value,
  disabled,
  onSelect,
}: {
  options: { value: T; label: string }[]
  value: T | undefined
  disabled: boolean
  onSelect: (value: T) => void
}) {
  return (
    <div className="filter-row" style={{ flexWrap: 'wrap' }}>
      {options.map((o) => (
        <button key={o.value} type="button" className={'chip' + (value === o.value ? ' chip-active' : '')} disabled={disabled} onClick={() => onSelect(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

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
  const available = providers.filter((p) => !linkedIds.has(p.id))

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
            Todavía no hay proveedores en este evento — podrás relacionar uno real en cuanto lo deis de alta en 📇 Proveedores.
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
}: {
  event: FamilyEvent
  onChanged: () => void
  onDerivedDataChanged: () => void
}) {
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
      let { actions } = await applyPairDecisionGeneration(event.id, tipoDecision.id, { taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false })
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
      let { actions } = await applyPairDecisionGeneration(event.id, tipoDecision.id, { taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false })
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
      await applyPairDecisionGeneration(event.id, decision.id, { taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false })
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
          await applyPairDecisionGeneration(event.id, decision.id, { taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false })
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

  return (
    <div className="card" style={{ padding: 8 }}>
      {summary && (
        <p className="muted" style={{ fontSize: 13, margin: '0 0 6px' }}>
          {summary}
        </p>
      )}
      {error && <p className="error">{error}</p>}
      {PARTNER_SLOTS.map((slot) => {
        const name = partnerName(event, slot)
        const complementosKey = pairQuestionKey(slot, 'complementos')
        const complementosDecision = findDecision(complementosKey)
        const complementosAnswer = complementosDecision?.answer as unknown as ComplementosAnswer | undefined
        return (
          <div key={slot} className="card" style={{ padding: 8, marginTop: 8 }}>
            <strong>{name}</strong>
            <VestuarioQuestion event={event} slot={slot} decisions={decisions} savingKey={savingKey} onSaveTipo={saveVestuarioTipo} onSaveResolucion={saveVestuarioResolucion} />
            <PeluqueriaQuestion event={event} slot={slot} decisions={decisions} savingKey={savingKey} onSaveNecesidad={saveNecesidad} onSaveResolucion={saveResolucion} />
            <ComplementosQuestion
              event={event}
              slot={slot}
              decision={complementosDecision}
              savingKey={savingKey}
              onSave={(answer) => saveQuestion(complementosKey, answer as unknown as Record<string, unknown>, false, desiredForComplementos(answer, name))}
            />
            {/* Corrección real (iPhone): los florales aparecían SIEMPRE, antes incluso de responder
                Complementos generales. Revelado único: solo "Queremos preparar complementos" los muestra —
                Sin empezar/No necesitaremos/Todavía no lo sabemos los ocultan, sin excepción permanente. */}
            {complementosAnswer?.choice === 'preparar' && (
              <>
                <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                  💐 Complementos florales
                </div>
                {FLORAL_ITEMS.map((item) => {
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
                  .filter((d) => d.questionKey.startsWith(pairQuestionKey(slot, 'floral.custom:')))
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
                <button type="button" className="link-button" onClick={() => addCustomFloral(slot)} style={{ marginTop: 4 }}>
                  + Otro complemento floral
                </button>
              </>
            )}
          </div>
        )
      })}
      <div className="card" style={{ padding: 8, marginTop: 8 }}>
        <strong>Los dos</strong>
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
        <DetalleEspecialQuestion decisions={decisions} savingKey={savingKey} onSaveTipo={saveDetalleTipo} onSaveResolucion={saveDetalleResolucion} />
      </div>
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
}: {
  event: FamilyEvent
  onChanged: () => void
  onDerivedDataChanged: () => void
}) {
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
  const ninosDecision = findDecision(GUESTS_NINOS_QUESTION_KEY)
  const ninos = ninosDecision?.answer as unknown as NinosAnswer | undefined
  const necesidadesDecision = findDecision(GUESTS_NINOS_NECESIDADES_QUESTION_KEY)
  const necesidadesExisting = necesidadesDecision?.answer as unknown as NinosNecesidadesAnswer | undefined

  return (
    <div className="card" style={{ padding: 8 }}>
      {summary && (
        <p className="muted" style={{ fontSize: 13, margin: '0 0 6px' }}>
          {summary}
        </p>
      )}
      {error && <p className="error">{error}</p>}
      <CustomAwareQuestion
        event={event}
        questionLabel="¿Tenéis clara la lista de invitados?"
        options={LISTA_OPTIONS}
        questionKey={GUESTS_LISTA_QUESTION_KEY}
        decision={findDecision(GUESTS_LISTA_QUESTION_KEY)}
        savingKey={savingKey}
        onSave={(answer) => saveQuestion(GUESTS_LISTA_QUESTION_KEY, answer as unknown as Record<string, unknown>, answer.choice === 'otro', desiredForListaInvitados(answer as ListaInvitadosAnswer))}
      />
      <InvitadosPreguntasQuestion
        event={event}
        existing={findDecision(GUESTS_PREGUNTAS_QUESTION_KEY)?.answer as unknown as InvitadosPreguntasAnswer | undefined}
        saving={savingKey === GUESTS_PREGUNTAS_QUESTION_KEY}
        onSave={(answer) =>
          saveQuestion(GUESTS_PREGUNTAS_QUESTION_KEY, answer as unknown as Record<string, unknown>, false, desiredForInvitadosPreguntas(answer))
        }
        onQuestionCreated={() => showToast('✓ Pregunta guardada')}
      />
      {momentsCount >= 2 && (
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
      <CustomAwareQuestion
        event={event}
        questionLabel="¿Vendrán niños?"
        options={NINOS_OPTIONS}
        questionKey={GUESTS_NINOS_QUESTION_KEY}
        decision={ninosDecision}
        savingKey={savingKey}
        onSave={(answer) => saveNinos(answer as NinosAnswer)}
      />
      {ninos?.choice === 'si' && (
        <NinosNecesidadesQuestion existing={necesidadesExisting} saving={savingKey === GUESTS_NINOS_NECESIDADES_QUESTION_KEY} onSave={saveNinosNecesidades} />
      )}
      <CustomAwareQuestion
        event={event}
        questionLabel="¿Cómo vais a gestionar la invitación?"
        options={INVITACION_OPTIONS}
        questionKey={GUESTS_INVITACION_QUESTION_KEY}
        decision={findDecision(GUESTS_INVITACION_QUESTION_KEY)}
        savingKey={savingKey}
        onSave={(answer) => saveQuestion(GUESTS_INVITACION_QUESTION_KEY, answer as unknown as Record<string, unknown>, answer.choice === 'otro', desiredForInvitacion(answer as InvitacionAnswer))}
      />
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

function MomentosEspecialesBlock({ event, onDerivedDataChanged }: { event: FamilyEvent; onDerivedDataChanged: () => void }) {
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

  if (loading) return null
  const seleccionDecision = findDecision(MOMENTOS_ESPECIALES_QUESTION_KEY)
  const seleccion = seleccionDecision?.answer as unknown as MomentosEspecialesAnswer | undefined
  const catalog = MOMENTOS_ESPECIALES_CATALOG[event.type]
  const clasesBaileDecision = findDecision(CLASES_BAILE_QUESTION_KEY)
  const clasesBaile = clasesBaileDecision?.answer as unknown as ClasesBaileAnswer | undefined
  const summary = summarizeMomentosEspecialesBlock(decisions)

  return (
    <div className="card" style={{ padding: 8 }}>
      {summary && (
        <p className="muted" style={{ fontSize: 13, margin: '0 0 6px' }}>
          {summary}
        </p>
      )}
      {error && <p className="error">{error}</p>}
      <MomentosEspecialesQuestion catalog={catalog} existing={seleccion} saving={savingKey === MOMENTOS_ESPECIALES_QUESTION_KEY} onSave={saveSeleccion} />
      {seleccion?.selected.includes('primer_baile') && (
        <ClasesBaileQuestion existing={clasesBaile} saving={savingKey === CLASES_BAILE_QUESTION_KEY} onSave={saveClasesBaile} />
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

function momentSummaryLine(m: EventMoment): string {
  const date = m.momentDate ? formatSpanishDate(m.momentDate) : 'Fecha por decidir'
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
}

function MomentForm({ initial, onCancel, onSave }: { initial?: EventMoment; onCancel: () => void; onSave: (patch: MomentFormValues) => Promise<void> }) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [momentDate, setMomentDate] = useState(initial?.momentDate ?? '')
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
    setSaving(true)
    setError(null)
    try {
      await onSave({
        title: title.trim(),
        momentDate: momentDate || null,
        momentTime: momentTime || null,
        locationLabel: locationLabel.trim() || null,
        locationAddress,
        locationPlaceId,
        coords,
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
      <label>
        Fecha <span className="muted">(opcional — puede decidirse más adelante)</span>
        <input type="date" value={momentDate} onChange={(e) => setMomentDate(e.target.value)} />
      </label>
      <label>
        Hora <span className="muted">(opcional)</span>
        <input type="time" value={momentTime} onChange={(e) => setMomentTime(e.target.value)} />
      </label>
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
  guestCount,
  canMoveUp,
  canMoveDown,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  moment: EventMoment
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
            {momentSummaryLine(moment)}
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
    })
    setAddingOpen(false)
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
      })
    }
    setEditingId(null)
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
            return <MomentForm key={moment.id} initial={moment} onCancel={() => setEditingId(null)} onSave={(patch) => handleEditSave(moment, patch)} />
          }
          const realIndex = realMomentIds.indexOf(moment.id)
          return (
            <MomentCard
              key={moment.id}
              moment={moment}
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
        <MomentForm onCancel={() => setAddingOpen(false)} onSave={handleAdd} />
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
  const [showAdd, setShowAdd] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Bloque 11 (cola nocturna) — un concepto propuesto por PEPA llega sin importe (plannedAmount:null);
  // sin poder editar una partida ya creada, la única forma de ponerle cifra sería borrarla y rehacerla.
  const [editingItemId, setEditingItemId] = useState<string | null>(null)

  function reload() {
    listEventBudgetItems(event.id)
      .then(setItems)
      .catch((err) => setError(errorMessage(err, 'No se pudo cargar el presupuesto')))
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
// Menú y compra.
// ---------------------------------------------------------------------

function MenuSection({ eventId }: { eventId: string }) {
  const [items, setItems] = useState<EventMenuItem[]>([])
  const [newName, setNewName] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [transferring, setTransferring] = useState(false)

  function reload() {
    listEventMenuItems(eventId)
      .then(setItems)
      .catch((err) => setError(errorMessage(err, 'No se pudo cargar el menú')))
  }
  useEffect(reload, [eventId])

  async function handleAdd(ev: FormEvent) {
    ev.preventDefault()
    if (!newName.trim()) return
    try {
      await addEventMenuItem(eventId, newName)
      setNewName('')
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir'))
    }
  }

  const pending = items.filter((i) => !i.transferred)

  async function handleTransfer() {
    if (pending.length === 0) return
    // Petición de la Skill: "User confirms transfer to PEPA Purchases" —
    // resumen antes de escribir nada, como con cualquier escritura
    // cruzada entre módulos.
    if (!window.confirm(`Se van a crear ${pending.length} producto${pending.length === 1 ? '' : 's'} en Compras. ¿Confirmas?`)) return
    setTransferring(true)
    setError(null)
    try {
      const count = await transferMenuToShopping(eventId)
      setNotice(`✓ ${count} producto${count === 1 ? '' : 's'} añadido${count === 1 ? '' : 's'} a Compras.`)
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo traspasar'))
    } finally {
      setTransferring(false)
    }
  }

  return (
    <div className="card event-card" style={{ marginTop: 8 }}>
      <strong>🍽️ Menú y compra</strong>
      {notice && <p className="points-badge">{notice}</p>}
      {error && <p className="error">{error}</p>}
      <div className="event-list" style={{ marginTop: 8 }}>
        {items.map((i) => (
          <div key={i.id} className="inline-fields" style={{ alignItems: 'center' }}>
            <span style={{ flex: 1 }}>
              {i.name}
              {i.transferred ? ' · ✓ en Compras' : ''}
            </span>
            <ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Borrar producto" onConfirm={() => deleteEventMenuItem(i.id).then(reload)} />
          </div>
        ))}
        {items.length === 0 && <p className="muted">Todavía no hay nada en el menú.</p>}
      </div>
      <form onSubmit={handleAdd} className="inline-fields" style={{ marginTop: 8 }}>
        <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="+ Añadir al menú" style={{ flex: 1 }} />
        <button type="submit">Añadir</button>
      </form>
      {pending.length > 0 && (
        <button type="button" className="link-button" onClick={handleTransfer} disabled={transferring} style={{ marginTop: 8 }}>
          {transferring ? 'Traspasando…' : `→ Confirmar traspaso a Compras (${pending.length})`}
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Proveedores.
// ---------------------------------------------------------------------

function ProvidersSection({ eventId }: { eventId: string }) {
  const [providers, setProviders] = useState<EventProvider[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    listEventProviders(eventId)
      .then(setProviders)
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar los proveedores')))
  }
  useEffect(reload, [eventId])

  return (
    <div className="card event-card" style={{ marginTop: 8 }}>
      <strong>📇 Proveedores</strong>
      {error && <p className="error">{error}</p>}
      <div className="event-list" style={{ marginTop: 8 }}>
        {providers.map((p) => (
          <div key={p.id} className="inline-fields" style={{ alignItems: 'center' }}>
            <span style={{ flex: 1 }}>
              {p.name}
              {p.type ? ` · ${p.type}` : ''}
              {p.contactNote ? ` · ${p.contactNote}` : ''}
            </span>
            <ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Borrar proveedor" onConfirm={() => deleteEventProvider(p.id).then(reload)} />
          </div>
        ))}
        {providers.length === 0 && <p className="muted">Todavía no hay proveedores.</p>}
      </div>
      <button type="button" className="link-button" onClick={() => setShowAdd(true)}>
        + Añadir proveedor
      </button>
      {showAdd && (
        <AddProviderModal
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

function AddProviderModal({ eventId, onClose, onAdded }: { eventId: string; onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [contactNote, setContactNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!name.trim()) {
      setError('Ponle un nombre.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await addEventProvider(eventId, { name, type: type || null, contactNote: contactNote || null })
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
            Nuevo proveedor
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <form className="card member-form" onSubmit={handleSubmit}>
          {error && <p className="error">{error}</p>}
          <label>
            Nombre
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <label>
            Tipo (opcional)
            <input type="text" value={type} onChange={(e) => setType(e.target.value)} placeholder="Catering, fotógrafo..." />
          </label>
          <label>
            Contacto (opcional)
            <input type="text" value={contactNote} onChange={(e) => setContactNote(e.target.value)} placeholder="Teléfono, email..." />
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
// Pagos / fianzas.
// ---------------------------------------------------------------------

function PaymentsSection({ event }: { event: FamilyEvent }) {
  const eventId = event.id
  const [payments, setPayments] = useState<EventPayment[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linkingReminderId, setLinkingReminderId] = useState<string | null>(null)

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

  return (
    <div className="card event-card" style={{ marginTop: 8 }}>
      <strong>🧾 Pagos y fianzas</strong>
      {error && <p className="error">{error}</p>}
      <div className="event-list" style={{ marginTop: 8 }}>
        {payments.map((p) => {
          const remaining = p.totalAmount - p.depositPaid
          return (
            <div key={p.id} className="card task-card">
              <div className="task-card-main" style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>{p.concept}</strong>
                  <ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Borrar pago" onConfirm={() => deleteEventPayment(p.id).then(reload)} />
                </div>
                <p className="muted" style={{ margin: '2px 0' }}>
                  {p.totalAmount.toFixed(2)} € · pagado {p.depositPaid.toFixed(2)} € · pendiente {remaining.toFixed(2)} €
                  {p.dueDate ? ` · vence ${p.dueDate}` : ''}
                </p>
                {remaining > 0 && (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => updateEventPayment(p.id, { depositPaid: p.totalAmount, status: 'pagado' }).then(reload)}
                  >
                    Marcar como pagado del todo
                  </button>
                )}
                {p.dueDate && remaining > 0 && !p.reminderCalendarEventId && (
                  <button type="button" className="link-button" onClick={() => handleRemindPayment(p)} disabled={linkingReminderId === p.id}>
                    {linkingReminderId === p.id ? 'Poniendo…' : '🔔 Recordarme'}
                  </button>
                )}
                {p.reminderCalendarEventId && <span className="muted" style={{ fontSize: 12 }}>🔔 Recordatorio puesto</span>}
              </div>
            </div>
          )
        })}
        {payments.length === 0 && <p className="muted">Todavía no hay pagos apuntados.</p>}
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!concept.trim()) {
      setError('Ponle un concepto.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await addEventPayment(eventId, {
        concept,
        totalAmount: Number(totalAmount) || 0,
        depositPaid: Number(depositPaid) || 0,
        dueDate: dueDate || null,
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
  const infoLines = [eventDateLine(event), ...(usingRealMoments ? momentsLocationLines(guestMoments) : eventLocationLines(event, guest))]

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

function DetailsSection({ eventId }: { eventId: string }) {
  const [favors, setFavors] = useState<EventFavorItem[]>([])
  const [specials, setSpecials] = useState<EventSpecialDetail[]>([])
  const [members, setMembers] = useState<EventGuestMember[]>([])
  const [showAddFavor, setShowAddFavor] = useState(false)
  const [showAddSpecial, setShowAddSpecial] = useState(false)
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
  }
  useEffect(reload, [eventId])

  function memberName(memberId: string | null): string | null {
    return memberId ? (members.find((m) => m.id === memberId)?.name ?? null) : null
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
              {memberName(s.memberId) ? ` · 👤 ${memberName(s.memberId)}` : ''}
            </span>
            <ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Borrar" onConfirm={() => deleteEventSpecialDetail(s.id).then(reload)} />
          </div>
        ))}
        {specials.length === 0 && <p className="muted">Ninguno todavía.</p>}
      </div>
      <button type="button" className="link-button" onClick={() => setShowAddSpecial(true)}>
        + Añadir persona especial
      </button>

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
          onClose={() => setShowAddSpecial(false)}
          onAdded={() => {
            setShowAddSpecial(false)
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

function AddSpecialDetailModal({
  eventId,
  members,
  onClose,
  onAdded,
}: {
  eventId: string
  members: EventGuestMember[]
  onClose: () => void
  onAdded: () => void
}) {
  const [recipientName, setRecipientName] = useState('')
  const [relationship, setRelationship] = useState('')
  const [detail, setDetail] = useState('')
  const [memberId, setMemberId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!recipientName.trim()) {
      setError('Ponle un nombre.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await addEventSpecialDetail(eventId, { recipientName, relationship: relationship || null, detail: detail || null, memberId: memberId || null })
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
            Persona especial
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <form className="card member-form" onSubmit={handleSubmit}>
          {error && <p className="error">{error}</p>}
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
            {saving ? 'Guardando…' : 'Añadir'}
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
  onClose,
  onAdded,
}: {
  eventId: string
  members: EventGuestMember[]
  onClose: () => void
  onAdded: () => void
}) {
  const [guestName, setGuestName] = useState('')
  const [giftDescription, setGiftDescription] = useState('')
  const [cashAmount, setCashAmount] = useState('')
  const [memberId, setMemberId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

function DayPlanSection({ eventId }: { eventId: string }) {
  const [items, setItems] = useState<EventDayPlanItem[]>([])
  const [newTitle, setNewTitle] = useState('')
  const [newTime, setNewTime] = useState('')
  const [error, setError] = useState<string | null>(null)

  function reload() {
    listEventDayPlan(eventId)
      .then(setItems)
      .catch((err) => setError(errorMessage(err, 'No se pudo cargar el plan del día')))
  }
  useEffect(reload, [eventId])

  async function handleAdd(ev: FormEvent) {
    ev.preventDefault()
    if (!newTitle.trim()) return
    try {
      await addEventDayPlanItem(eventId, newTitle, newTime || null)
      setNewTitle('')
      setNewTime('')
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir'))
    }
  }

  return (
    <div className="card event-card" style={{ marginTop: 8 }}>
      <strong>🗓️ Plan del día</strong>
      {error && <p className="error">{error}</p>}
      <div className="event-list" style={{ marginTop: 8 }}>
        {items.map((i) => (
          <div key={i.id} className="inline-fields" style={{ alignItems: 'center' }}>
            <span style={{ fontWeight: 600, minWidth: 48 }}>{i.itemTime ? i.itemTime.slice(0, 5) : '—'}</span>
            <span style={{ flex: 1 }}>{i.title}</span>
            <ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Borrar" onConfirm={() => deleteEventDayPlanItem(i.id).then(reload)} />
          </div>
        ))}
        {items.length === 0 && <p className="muted">Todavía no hay plan del día.</p>}
      </div>
      <form onSubmit={handleAdd} className="inline-fields" style={{ marginTop: 8 }}>
        <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} style={{ width: 90 }} />
        <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="+ Añadir al plan" style={{ flex: 1 }} />
        <button type="submit">Añadir</button>
      </form>
    </div>
  )
}

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
    Promise.all([
      event.enabledModules.includes('menu_compra') ? listEventMenuItems(event.id) : Promise.resolve([]),
      event.enabledModules.includes('decoracion') ? listEventDecorationItems(event.id) : Promise.resolve([]),
    ]).then(([menu, decoration]) => {
      setPendingPurchases(menu.filter((i) => !i.transferred).length + decoration.filter((i) => !i.transferredToShopping).length)
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
    ]).then(([guests, tasks, payments, budgetItems, expenses, categories]) => {
      const plannedBudget = budgetItems.reduce((sum, i) => sum + (i.plannedAmount ?? 0), 0)
      const spentBudget = expenses
        ? expenses
            .filter((e) => e.tagId === event.tagId && !e.isIncome && !isInternalTransferCategory(e.category, categories))
            .reduce((sum, e) => sum + e.amount, 0)
        : null
      setConclusions(
        computeEventConclusions({
          rsvpDeadline: event.rsvpDeadline,
          guests,
          tasks,
          payments,
          plannedBudget,
          spentBudget,
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

function OrganizamePepaModal({ event, onClose, onApplied }: { event: FamilyEvent; onClose: () => void; onApplied: () => void }) {
  // Fase 1 del "inicio inteligente" — el contexto respondido en el alta (o null en un evento creado
  // antes de esta fase, que se comporta exactamente igual que sin contexto) se lee del propio evento
  // guardado, no se vuelve a preguntar aquí.
  const includedServices = event.includedServices ?? []
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
