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

export function resolveVenueCase(event: VenueFacts, decisions: EventDecision[]): VenueCase {
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
  const hasPlace = Boolean(event.venueLabel?.trim() || event.venueAddress?.trim() || event.celebrationLocationLabel?.trim()) || (event.venueLatitude != null && event.venueLongitude != null)
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

export function venueServicesStatus(decisions: EventDecision[]): DecisionStatus {
  const answer = venueServicesAnswer(decisions)
  // Quitar la última casilla deja una selección vacía: eso no es una decisión, vuelve a «sin empezar».
  if (answer?.choice === 'seleccionar' && answer.selected.length === 0 && answer.customItems.length === 0) return 'sin_empezar'
  return decisionStatus(findDecision(decisions, VENUE_SERVICES_QUESTION_KEY))
}

// ¿El lugar contratado incluye este servicio? Solo cuenta si la familia lo MARCÓ expresamente — y solo
// cuando el lugar no es "En casa" (en casa nunca hay servicios de lugar, aunque hubiera una respuesta vieja).
export function venueIncludesService(venueCase: VenueCase, decisions: EventDecision[], key: VenueServiceKey): boolean {
  if (venueCase === 'casa') return false
  const answer = venueServicesAnswer(decisions)
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

// Compatibilidad: el alta del evento (events.included_services, vocabulario antiguo) también guardaba qué
// incluía el lugar. NUNCA se preselecciona nada con ello: se ofrece como importación explícita de un toque.
// Solo se traducen los servicios que existen en el vocabulario nuevo.
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
