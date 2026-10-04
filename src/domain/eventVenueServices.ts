// Eventos — "¿Qué incluye el lugar?" (fase "🍽️ Comida y bebida"). Información TRANSVERSAL del lugar de
// celebración: qué servicios presta ya el sitio contratado. Se guarda como una decisión más
// (event_decisions, block_key 'lugar_servicios') y la consumen la comida y bebida hoy y, mañana, otras
// fases (decoración, música, alojamiento) sin volver a preguntarlo — por eso vive en su propio módulo y no
// dentro del de comida.
//
// Principios:
//  · "Incluido en el lugar contratado" NO significa "sección resuelta": es solo información recordada.
//    Una sección puede mostrar "✓ Incluido en el lugar contratado" y seguir admitiendo cosas propias.
//  · Decoración, Música, Barra libre y Alojamiento solo se GUARDAN aquí para fases futuras — esta fase no
//    deriva nada de ellos.
//  · "Otro" es texto libre: NUNCA se interpreta ni se deriva nada de lo que contiene.
//  · "Ninguno" es excluyente con cualquier servicio concreto.
//  · Un lugar que no parece un negocio NO se supone una vivienda particular: solo "En casa" explícito lo es.
import { decisionStatus, type DecisionStatus } from '@/domain/eventPairDecisions'
import type { EventDecision, EventServiceId, FamilyEvent } from '@/domain/types'
import { LUGAR_CONTEXTO_QUESTION_KEY, type LugarContextoAnswer } from '@/domain/eventLocationContext'

export const VENUE_SERVICES_BLOCK_KEY = 'lugar_servicios'
export const VENUE_SERVICES_QUESTION_KEY = 'lugar.servicios_incluidos'

export type VenueServiceKey = 'comida' | 'bebidas' | 'tarta' | 'personal' | 'mobiliario' | 'decoracion' | 'musica' | 'barra_libre' | 'alojamiento'

export const VENUE_SERVICES: { key: VenueServiceKey; label: string; icon: string }[] = [
  { key: 'comida', label: 'Comida / menú', icon: '🍽️' },
  { key: 'bebidas', label: 'Bebidas', icon: '🥤' },
  { key: 'tarta', label: 'Tarta', icon: '🎂' },
  { key: 'personal', label: 'Personal / camareros', icon: '👨‍🍳' },
  { key: 'mobiliario', label: 'Mobiliario', icon: '🪑' },
  { key: 'decoracion', label: 'Decoración', icon: '🌿' },
  { key: 'musica', label: 'Música', icon: '🎵' },
  { key: 'barra_libre', label: 'Barra libre', icon: '🍸' },
  { key: 'alojamiento', label: 'Alojamiento', icon: '🛏️' },
]

export type VenueServicesChoice = 'seleccionar' | 'ninguno' | 'todavia_no_lo_sabemos'
export interface VenueServicesAnswer {
  choice: VenueServicesChoice
  selected: VenueServiceKey[]
  // "✏️ Otro" — solo texto. Ningún código de este módulo (ni de ningún otro) lo interpreta.
  customItems: string[]
}

// Caso de lugar:
//  · 'contratado' (A): razonablemente un negocio contratado (restaurante, salón, local) → "¿Qué incluye el
//    lugar contratado?"
//  · 'incierto'   (B): hay un sitio/dirección pero no se puede asegurar que sea un negocio ni una casa →
//    "¿El lugar de celebración incluye algún servicio?"
//  · 'casa'       (C): se dijo expresamente "En casa" → no se pregunta nada.
//  · 'desconocido': todavía no hay ningún dato de lugar → no se pregunta nada (no hay de qué hablar aún).
export type VenueCase = 'contratado' | 'incierto' | 'casa' | 'desconocido'

type VenueFacts = Pick<FamilyEvent, 'venueType' | 'venueLabel' | 'venueAddress' | 'venueLatitude' | 'venueLongitude' | 'celebrationLocationLabel'>

function findDecision(decisions: EventDecision[], questionKey: string): EventDecision | undefined {
  return decisions.find((d) => d.questionKey === questionKey)
}

// `hasMomentLocation`: en los eventos organizados por momentos el lugar vive en los momentos (no en venue_*);
// que algún momento tenga lugar cuenta como «hay un sitio» (caso incierto), nunca como casa ni negocio.
export function resolveVenueCase(event: VenueFacts, decisions: EventDecision[], hasMomentLocation = false): VenueCase {
  // 1) Lo que la familia ha dicho expresamente en el configurador manda sobre cualquier dato heredado.
  const contexto = findDecision(decisions, LUGAR_CONTEXTO_QUESTION_KEY)?.answer as LugarContextoAnswer | undefined
  if (contexto?.choice === 'en_casa') return 'casa'
  if (contexto?.choice === 'restaurante_local') return 'contratado'

  // 2) Dato heredado del alta del evento (venue_type): también es una afirmación explícita de la familia.
  if (!contexto || contexto.choice === 'todavia_no_lo_sabemos') {
    if (event.venueType === 'casa_propia') return 'casa'
    if (event.venueType === 'restaurante_local') return 'contratado'
  }

  // 3) Hay algún dato de lugar pero no se puede asegurar qué es → caso B (nunca se supone casa ni negocio).
  const hasPlace = hasMomentLocation || Boolean(event.venueLabel?.trim() || event.venueAddress?.trim() || event.celebrationLocationLabel?.trim()) || (event.venueLatitude != null && event.venueLongitude != null)
  if (contexto && (contexto.choice === 'exterior' || contexto.choice === 'otro')) return 'incierto'
  if (hasPlace) return 'incierto'
  return 'desconocido'
}

export function venueServicesQuestionLabel(venueCase: VenueCase): string | null {
  if (venueCase === 'contratado') return '¿Qué incluye el lugar contratado?'
  if (venueCase === 'incierto') return '¿El lugar de celebración incluye algún servicio?'
  return null
}

export function venueServicesAnswer(decisions: EventDecision[]): VenueServicesAnswer | undefined {
  const raw = findDecision(decisions, VENUE_SERVICES_QUESTION_KEY)?.answer as Partial<VenueServicesAnswer> | undefined
  if (!raw || !raw.choice) return undefined
  return { choice: raw.choice, selected: Array.isArray(raw.selected) ? raw.selected : [], customItems: Array.isArray(raw.customItems) ? raw.customItems : [] }
}

export function venueServicesStatus(decisions: EventDecision[], legacyIncluded?: EventServiceId[] | null): DecisionStatus {
  const answer = effectiveVenueServicesAnswer(decisions, legacyIncluded)
  // Quitar la última casilla deja una selección vacía: eso no es una decisión, vuelve a «sin empezar».
  if (answer?.choice === 'seleccionar' && answer.selected.length === 0 && answer.customItems.length === 0) return 'sin_empezar'
  // Una respuesta histórica del propio usuario (events.included_services, del alta antigua) cuenta como
  // decidida: es información que ya teníamos, no una inferencia.
  if (!findDecision(decisions, VENUE_SERVICES_QUESTION_KEY) && answer) return 'decidida'
  return decisionStatus(findDecision(decisions, VENUE_SERVICES_QUESTION_KEY))
}

// ¿El lugar contratado incluye este servicio? Solo cuenta si la familia lo MARCÓ expresamente — y solo
// cuando el lugar no es "En casa" (en casa nunca hay servicios de lugar, aunque hubiera una respuesta vieja).
export function venueIncludesService(venueCase: VenueCase, decisions: EventDecision[], key: VenueServiceKey, legacyIncluded?: EventServiceId[] | null): boolean {
  if (venueCase === 'casa') return false
  const answer = effectiveVenueServicesAnswer(decisions, legacyIncluded)
  return answer?.choice === 'seleccionar' && answer.selected.includes(key)
}

// Alternar un servicio respetando que "Ninguno" es incompatible con cualquier servicio concreto.
export function toggleVenueService(current: VenueServicesAnswer | undefined, key: VenueServiceKey): VenueServicesAnswer {
  const selected = current?.choice === 'seleccionar' ? current.selected : []
  const customItems = current?.choice === 'seleccionar' ? current.customItems : []
  const next = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]
  if (next.length === 0 && customItems.length === 0) return { choice: 'seleccionar', selected: [], customItems: [] }
  return { choice: 'seleccionar', selected: next, customItems }
}

export function withVenueServicesNinguno(): VenueServicesAnswer {
  return { choice: 'ninguno', selected: [], customItems: [] }
}

export function withVenueServicesUnknown(): VenueServicesAnswer {
  return { choice: 'todavia_no_lo_sabemos', selected: [], customItems: [] }
}

// Añadir/quitar un "Otro" libre. Marcar "Otro" también anula "Ninguno" (incompatible).
export function withVenueServiceCustomItems(current: VenueServicesAnswer | undefined, customItems: string[]): VenueServicesAnswer {
  const selected = current?.choice === 'seleccionar' ? current.selected : []
  return { choice: 'seleccionar', selected, customItems: customItems.map((t) => t.trim()).filter(Boolean) }
}

// Compatibilidad: el alta antigua (events.included_services, vocabulario antiguo) guardaba qué incluía el
// lugar. Es una respuesta histórica del propio usuario, no una inferencia: mientras no exista una respuesta
// nueva en el configurador, SE ADOPTA como información ya existente (sin pedir ningún clic) y el usuario
// puede cambiarla cuando quiera. Solo se traducen los servicios que existen en el vocabulario nuevo; la
// fuente de verdad pasa a ser la decisión del configurador en cuanto se toca.
const LEGACY_TO_VENUE: Partial<Record<EventServiceId, VenueServiceKey>> = {
  food: 'comida',
  drinks: 'bebidas',
  cake: 'tarta',
  decoration: 'decoracion',
  music: 'musica',
}

export function legacyIncludedServicesToVenue(included: EventServiceId[] | null | undefined): VenueServiceKey[] {
  if (!included) return []
  const out: VenueServiceKey[] = []
  for (const id of included) {
    const mapped = LEGACY_TO_VENUE[id]
    if (mapped && !out.includes(mapped)) out.push(mapped)
  }
  return out
}

export function venueServiceLabel(key: VenueServiceKey): string {
  return VENUE_SERVICES.find((s) => s.key === key)?.label ?? key
}

// Lo que cuenta HOY como respuesta: la decisión del configurador si existe; si no, lo que el usuario ya
// indicó en el alta antigua (traducido). Nunca se escribe nada al leer.
export function effectiveVenueServicesAnswer(decisions: EventDecision[], legacyIncluded?: EventServiceId[] | null): VenueServicesAnswer | undefined {
  const stored = venueServicesAnswer(decisions)
  if (stored) return stored
  const adopted = legacyIncludedServicesToVenue(legacyIncluded)
  return adopted.length > 0 ? { choice: 'seleccionar', selected: adopted, customItems: [] } : undefined
}

// ¿La respuesta efectiva viene del alta antigua (todavía no se ha tocado en el configurador)?
export function venueServicesFromLegacy(decisions: EventDecision[], legacyIncluded?: EventServiceId[] | null): boolean {
  return !venueServicesAnswer(decisions) && legacyIncludedServicesToVenue(legacyIncluded).length > 0
}

// Servicios del alta antigua que no existen en el catálogo nuevo (fotografía, flores, regalos...): se
// conservan en la base de datos y se muestran como información, pero no forman parte del catálogo.
const LEGACY_ONLY_LABELS: Partial<Record<EventServiceId, string>> = {
  photography: 'fotografía/vídeo',
  flowers: 'flores',
  favors: 'detalles para invitados',
  entertainment: 'entretenimiento',
}
export function legacyOnlyServiceLabels(legacyIncluded?: EventServiceId[] | null): string[] {
  return (legacyIncluded ?? []).map((id) => LEGACY_ONLY_LABELS[id]).filter((l): l is string => Boolean(l))
}

// «Organízamelo Pepa» razona con el vocabulario antiguo de servicios (EventServiceId). La fuente de verdad
// ahora es el catálogo nuevo (decisión del primer bloque): se traduce a ese vocabulario para que la propuesta
// no vuelva a presupuestar lo que el lugar ya incluye. Los servicios del alta antigua que no existen en el
// catálogo nuevo (fotografía, flores...) se conservan tal cual.
const VENUE_TO_LEGACY: Partial<Record<VenueServiceKey, EventServiceId>> = {
  comida: 'food',
  bebidas: 'drinks',
  tarta: 'cake',
  decoracion: 'decoration',
  musica: 'music',
}

export function venueServiceIdsForPlan(decisions: EventDecision[], legacyIncluded?: EventServiceId[] | null): EventServiceId[] {
  const answer = venueServicesAnswer(decisions)
  if (!answer) return legacyIncluded ?? []
  const fromAnswer = answer.choice === 'seleccionar' ? answer.selected.map((k) => VENUE_TO_LEGACY[k]).filter((id): id is EventServiceId => Boolean(id)) : []
  const legacyOnly = (legacyIncluded ?? []).filter((id) => !Object.values(VENUE_TO_LEGACY).includes(id))
  return [...new Set([...fromAnswer, ...legacyOnly])]
}
