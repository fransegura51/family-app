// Eventos — "📍 Dónde lo vais a celebrar" (reajuste de la fase "Momentos especiales"): pregunta ligera de
// CONTEXTO para eventos que NO se organizan por Ceremonia/Celebración (cumpleaños, celebración,
// personalizado, o boda/comunión/bautizo con el módulo "ceremonia" apagado) — nunca la dirección exacta,
// que sigue viviendo donde ya vivía (events.venueLabel, "Gestionar evento", EventLocationCoordsPicker):
// esto es solo "en casa / restaurante / exterior / otro", para que una futura fase ("Comida y
// celebración") pueda hacer preguntas apropiadas (p. ej. "¿cocináis vosotros?" si es "en casa") sin tener
// que adivinarlo del texto libre de venueLabel. Nunca genera Preparativo/Presupuesto/Proveedor — es pura
// información de contexto, igual de inerte que "Momentos" (MomentosChoice) en Invitados.
import type { CustomResolution } from '@/domain/eventPairDecisions'
import { decisionStatus, type DecisionStatus } from '@/domain/eventPairDecisions'
import type { EventDecision } from '@/domain/types'

export const LUGAR_CONTEXTO_QUESTION_KEY = 'lugar.contexto'

export type LugarContextoChoice = 'en_casa' | 'restaurante_local' | 'exterior' | 'otro' | 'todavia_no_lo_sabemos'
export interface LugarContextoAnswer {
  choice: LugarContextoChoice
  custom?: CustomResolution
}

export function lugarContextoStatus(decisions: EventDecision[]): DecisionStatus {
  return decisionStatus(decisions.find((d) => d.questionKey === LUGAR_CONTEXTO_QUESTION_KEY))
}
