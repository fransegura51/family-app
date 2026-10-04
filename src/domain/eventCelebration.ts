// Eventos — primer bloque del configurador: «Ceremonia y celebración» (eventos con ceremonia, organizados
// por momentos) o «Celebración» (el resto). Es donde viven, a partir de la alta mínima, la edad (cumpleaños),
// la fecha con su estado (◷ Provisional / ✓ Confirmada), el lugar y qué servicios incluye ese lugar. El resto
// de bloques (Comida y bebida, y los que vengan) CONSUMEN esta información; nunca la vuelven a preguntar.
//
// Puro, sin Supabase. Reutiliza el motor de estados (decisionStatus) y la arquitectura de momentos que ya
// existen; no crea ningún bloque paralelo («Datos generales», «Datos del cumpleaños»...).
import { decisionStatus, type DecisionStatus } from '@/domain/eventPairDecisions'
import { lugarContextoStatus } from '@/domain/eventLocationContext'
import { resolveVenueCase, venueServicesStatus } from '@/domain/eventVenueServices'
import type { EventDecision, EventMoment, EventType, FamilyEvent } from '@/domain/types'

export const CELEBRATION_BLOCK_KEY = 'celebracion'
// «Todavía no lo sabemos» sobre la fecha: es una respuesta (⏳ por decidir), distinta de no haber abierto la
// pregunta nunca (sin empezar). La fecha en sí NO se guarda aquí, sino en events.event_date / date_status.
export const CELEBRATION_DATE_QUESTION_KEY = 'celebracion.fecha'

export type DateStatusValue = FamilyEvent['dateStatus']

export const DATE_STATUS_CHOICES: { value: DateStatusValue; label: string }[] = [
  { value: 'pendiente', label: 'Todavía no lo sabemos' },
  { value: 'provisional', label: '◷ Provisional' },
  { value: 'confirmada', label: '✓ Confirmada' },
]

export function dateStatusLabel(status: DateStatusValue): string {
  if (status === 'provisional') return '◷ Provisional'
  if (status === 'confirmada') return '✓ Confirmada'
  return 'Todavía no lo sabemos'
}

const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// «14 febrero 2027» — sin pasar por Date (evita desfases de zona horaria con fechas ISO sin hora).
export function longSpanishDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  if (!y || !m || !d) return isoDate
  return `${d} ${MONTHS_ES[m - 1]} ${y}`
}

// «14 febrero 2027 · ◷ Provisional». Sin fecha: null (el llamador decide qué mostrar).
export function dateWithStatusLabel(isoDate: string | null, status: DateStatusValue): string | null {
  if (!isoDate || status === 'pendiente') return null
  return `${longSpanishDate(isoDate)} · ${dateStatusLabel(status)}`
}

// Un momento sin estado propio HEREDA el del evento (así valían todos los momentos anteriores a esta
// versión). Con fecha pero heredando «pendiente» (incoherente) se trata como provisional: hay fecha, pero no
// consta que esté cerrada — nunca se promociona sola a confirmada.
export function momentDateStatus(moment: Pick<EventMoment, 'momentDate' | 'dateStatus'>, eventDateStatus: DateStatusValue): 'provisional' | 'confirmada' | null {
  if (!moment.momentDate) return null
  if (moment.dateStatus === 'provisional' || moment.dateStatus === 'confirmada') return moment.dateStatus
  return eventDateStatus === 'confirmada' ? 'confirmada' : 'provisional'
}

// REGLA DE LA FECHA OPERATIVA (única fuente: events.event_date + events.date_status; calendario, cuenta
// atrás, tareas, RSVP e invitaciones siguen leyendo ahí):
//  · Evento con una sola celebración (sin momentos): la fecha del bloque «Celebración» ES la del evento.
//  · Evento por momentos: la fecha del evento es la del PRIMER día con fecha (el momento fechado más
//    temprano; a igualdad, el de menor orden) y hereda el estado de ESE momento. Los momentos conservan sus
//    propias fechas/estados: nada se duplica ni se destruye.
//  · Sin ningún momento fechado no se toca la fecha del evento.
export function deriveOperationalDate(
  moments: Pick<EventMoment, 'momentDate' | 'dateStatus' | 'sortOrder' | 'isLegacy'>[],
  eventDateStatus: DateStatusValue,
): { eventDate: string; dateStatus: 'provisional' | 'confirmada' } | null {
  const dated = moments.filter((m) => !m.isLegacy && m.momentDate)
  if (dated.length === 0) return null
  const first = [...dated].sort((a, b) => (a.momentDate as string).localeCompare(b.momentDate as string) || a.sortOrder - b.sortOrder)[0]
  const status = momentDateStatus(first, eventDateStatus)
  return { eventDate: first.momentDate as string, dateStatus: status ?? 'provisional' }
}

// ---------------------------------------------------------------------
// Título del primer bloque, según el evento
// ---------------------------------------------------------------------
export function celebrationBlockTitle(type: EventType, structuredByMoments: boolean): string {
  if (structuredByMoments) return type === 'boda' ? '💍 Ceremonia y celebración' : '⛪ Ceremonia y celebración'
  return type === 'cumpleanos' ? '🎂 Celebración' : '🎉 Celebración'
}

// ---------------------------------------------------------------------
// Preguntas del bloque y su estado (✓ decididas · ⏳ por decidir · sin empezar)
// ---------------------------------------------------------------------
export interface CelebrationQuestionInfo {
  key: 'edad' | 'fecha' | 'lugar' | 'servicios'
  label: string
  status: DecisionStatus
}

export function ageTurning(event: Pick<FamilyEvent, 'details'>): number | null {
  const age = (event.details as { ageTurning?: unknown }).ageTurning
  return typeof age === 'number' && Number.isFinite(age) ? age : null
}

// Fecha: confirmada = decidida; provisional = ⏳ por decidir (hay fecha útil pero no cerrada); sin fecha:
// «Todavía no lo sabemos» respondido = por decidir, y nunca abierta = sin empezar.
export function celebrationDateStatus(
  event: Pick<FamilyEvent, 'dateStatus' | 'eventDate'>,
  decisions: EventDecision[],
): DecisionStatus {
  if (event.eventDate && event.dateStatus === 'confirmada') return 'decidida'
  if (event.eventDate && event.dateStatus === 'provisional') return 'por_decidir'
  return decisionStatus(decisions.find((d) => d.questionKey === CELEBRATION_DATE_QUESTION_KEY)) === 'sin_empezar' ? 'sin_empezar' : 'por_decidir'
}

// Lugar: ya hay un lugar registrado (también en eventos antiguos, sin haber respondido nunca la pregunta de
// contexto) = decidido; si no, manda la propia pregunta de contexto.
export function celebrationPlaceStatus(
  event: Pick<FamilyEvent, 'venueLabel' | 'venueLatitude' | 'venueLongitude' | 'celebrationLocationLabel'> & Partial<Pick<FamilyEvent, 'venueType'>>,
  decisions: EventDecision[],
  hasMomentLocation: boolean,
): DecisionStatus {
  const contexto = lugarContextoStatus(decisions)
  if (contexto !== 'sin_empezar') return contexto
  // venue_type (alta antigua) es una respuesta histórica del propio usuario sobre dónde se celebra.
  const hasPlace = Boolean(event.venueType) || Boolean(event.venueLabel?.trim() || event.celebrationLocationLabel?.trim()) || (event.venueLatitude != null && event.venueLongitude != null) || hasMomentLocation
  return hasPlace ? 'decidida' : 'sin_empezar'
}

export interface CelebrationFacts {
  event: Pick<FamilyEvent, 'type' | 'details' | 'dateStatus' | 'eventDate' | 'venueType' | 'venueLabel' | 'venueAddress' | 'venueLatitude' | 'venueLongitude' | 'celebrationLocationLabel' | 'includedServices'>
  decisions: EventDecision[]
  hasMomentLocation: boolean
  structuredByMoments: boolean
}

export function listCelebrationQuestions({ event, decisions, hasMomentLocation, structuredByMoments }: CelebrationFacts): CelebrationQuestionInfo[] {
  const out: CelebrationQuestionInfo[] = []
  if (event.type === 'cumpleanos') out.push({ key: 'edad', label: '¿Cuántos años cumple?', status: ageTurning(event) !== null ? 'decidida' : 'sin_empezar' })
  out.push({ key: 'fecha', label: structuredByMoments ? 'Fecha' : '¿Cuándo es?', status: celebrationDateStatus(event, decisions) })
  out.push({ key: 'lugar', label: '¿Dónde se celebra?', status: celebrationPlaceStatus(event, decisions, hasMomentLocation) })
  const venueCase = resolveVenueCase(event, decisions, hasMomentLocation)
  // Los servicios solo se preguntan cuando hay un lugar que pueda incluirlos (contratado o sin poder asegurar
  // qué es); en casa o sin lugar todavía no cuentan como pregunta.
  if (venueCase === 'contratado' || venueCase === 'incierto') {
    out.push({ key: 'servicios', label: '¿Qué incluye el lugar?', status: venueServicesStatus(decisions, event.includedServices) })
  }
  return out
}

export function summarizeCelebrationBlock(facts: CelebrationFacts): string {
  const statuses = listCelebrationQuestions(facts).map((q) => q.status)
  const decided = statuses.filter((s) => s === 'decidida').length
  const pending = statuses.filter((s) => s === 'por_decidir').length
  const notStarted = statuses.filter((s) => s === 'sin_empezar').length
  const parts: string[] = []
  if (decided > 0) parts.push(`✓ ${decided} decidida${decided === 1 ? '' : 's'}`)
  if (pending > 0) parts.push(`⏳ ${pending} por decidir`)
  if (notStarted > 0) parts.push(`${notStarted} sin empezar`)
  return parts.join(' · ')
}

