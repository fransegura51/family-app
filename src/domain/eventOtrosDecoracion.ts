// Eventos → "✨ Cómo queréis que sea vuestra boda" → "🌿 Otros y decoración" (tanda del configurador de
// boda, noveno y último bloque nuevo). NO sustituye al módulo "🎨 Decoración" ya existente (ideas,
// materiales, compras, encargos y presupuesto siguen viviendo allí) — este bloque solo decide CÓMO se
// organiza la decoración y, si quieren, envía las zonas elegidas como ideas de partida a ese módulo.
//
// REGLA TRANSVERSAL "no preguntar dos veces": igual que Música, si el lugar ya incluye decoración
// (eventVenueServices.ts, clave 'decoracion'), la pregunta de organización se sustituye por una
// confirmación de "¿algo más?" — nunca se vuelve a preguntar si está incluida.
import { decisionStatus, type DesiredPairGeneration, type DecisionStatus } from '@/domain/eventPairDecisions'
import type { EventDecision } from '@/domain/types'

const NONE: DesiredPairGeneration = { taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false, groupKind: null, groupDefaultName: null }

export const OTROS_DECORACION_BLOCK_KEY = 'otros_decoracion'

// ---------------------------------------------------------------------
// Organización de la decoración — si el lugar la incluye, solo se pregunta por algo adicional
// (DECORACION_EXTRA_CONFIRM_QUESTION_KEY); si no, cómo se organiza de cero.
// ---------------------------------------------------------------------
export const DECORACION_EXTRA_CONFIRM_QUESTION_KEY = 'otros_decoracion.decoracion_extra_confirm'
export type DecoracionExtraConfirmChoice = 'si' | 'no' | 'todavia_no_lo_sabemos'
export interface DecoracionExtraConfirmAnswer {
  choice: DecoracionExtraConfirmChoice
}

export const DECORACION_ORGANIZACION_QUESTION_KEY = 'otros_decoracion.decoracion_organizacion'
export type DecoracionOrganizacionChoice = 'contrataremos' | 'nosotros' | 'combinacion' | 'todavia_no_lo_sabemos'
export interface DecoracionOrganizacionAnswer {
  choice: DecoracionOrganizacionChoice
}

// ---------------------------------------------------------------------
// Zonas/elementos a decorar — opcional, selección múltiple; nunca una lista de compras anticipada (solo
// guarda QUÉ zonas, nada de materiales/cantidades — eso es exclusivo del módulo Decoración).
// ---------------------------------------------------------------------
export const DECORACION_ZONAS_QUESTION_KEY = 'otros_decoracion.zonas'
export type DecoracionZonaKey = 'ceremonia' | 'mesas' | 'entrada' | 'photocall' | 'zona_fiesta'
export interface DecoracionZonaCatalogItem {
  key: DecoracionZonaKey
  label: string
}
export const DECORACION_ZONAS_CATALOG: DecoracionZonaCatalogItem[] = [
  { key: 'ceremonia', label: 'Ceremonia' },
  { key: 'mesas', label: 'Mesas' },
  { key: 'entrada', label: 'Entrada' },
  { key: 'photocall', label: 'Photocall' },
  { key: 'zona_fiesta', label: 'Zona de fiesta' },
]
// Orden de recuperación de requisitos (Parte G5) — cuando la organización es "combinación" (una parte
// se contrata, otra la hace la familia), cada zona seleccionada puede llevar su propia asignación.
// Opcional de verdad: una zona sin asignación todavía no cuenta como "mal" ni bloquea nada, solo queda
// sin desglosar (ver decoracionZonasSinAsignar); con "contrataremos" o "nosotros" (sin combinación) no
// tiene sentido preguntarlo — todas las zonas comparten ya una única respuesta.
export type DecoracionZonaAsignacion = 'contratada' | 'nosotros'

export interface DecoracionZonasAnswer {
  selected: DecoracionZonaKey[]
  customItems: string[]
  assignacion?: Partial<Record<DecoracionZonaKey, DecoracionZonaAsignacion>>
}

// Solo tiene sentido en "combinación" — con cualquier otra organización (o sin decidir todavía), la
// pregunta de qué zona es cuál no aplica, así que nunca hay nada "sin asignar" que mostrar.
export function decoracionZonasSinAsignar(organizacion: DecoracionOrganizacionChoice | undefined, zonas: DecoracionZonasAnswer | undefined): DecoracionZonaKey[] {
  if (organizacion !== 'combinacion' || !zonas) return []
  return zonas.selected.filter((z) => !zonas.assignacion?.[z])
}

// ---------------------------------------------------------------------
// "¿Hay algo más que queráis organizar?" — necesidades libres, cada una convertible a Preparativo SOLO si
// el usuario lo decide explícitamente (nunca automático). taskId queda enlazado una vez convertida, para
// no poder convertirla dos veces ni perder el enlace con el Preparativo real.
// ---------------------------------------------------------------------
export const OTRAS_NECESIDADES_QUESTION_KEY = 'otros_decoracion.otras_necesidades'
export interface OtraNecesidadItem {
  id: string
  text: string
  taskId?: string | null
}
export interface OtrasNecesidadesAnswer {
  items: OtraNecesidadItem[]
}

export function summarizeOtrosDecoracionBlock(decisions: EventDecision[], venueHasDecoracion: boolean): string {
  const statuses = listOtrosDecoracionBlockQuestions(decisions, venueHasDecoracion).map((q) => q.status)
  const decided = statuses.filter((s) => s === 'decidida').length
  const pending = statuses.filter((s) => s === 'por_decidir').length
  const notStarted = statuses.filter((s) => s === 'sin_empezar').length
  const parts: string[] = []
  if (decided > 0) parts.push(`✓ ${decided} decidida${decided === 1 ? '' : 's'}`)
  if (pending > 0) parts.push(`⏳ ${pending} por decidir`)
  if (notStarted > 0) parts.push(`${notStarted} sin empezar`)
  return parts.join(' · ')
}

export interface OtrosDecoracionQuestionInfo {
  questionKey: string
  blockKey: 'otros_decoracion'
  label: string
  status: DecisionStatus
}

// venueHasDecoracion: resuelto por quien llama con venueIncludesService(venueCase, decisions,
// 'decoracion', legacyIncluded) — mismo criterio que Música con 'musica'.
export function listOtrosDecoracionBlockQuestions(decisions: EventDecision[], venueHasDecoracion: boolean): OtrosDecoracionQuestionInfo[] {
  const result: OtrosDecoracionQuestionInfo[] = []
  if (venueHasDecoracion) {
    result.push({
      questionKey: DECORACION_EXTRA_CONFIRM_QUESTION_KEY,
      blockKey: 'otros_decoracion',
      label: '¿Queréis decoración adicional a la que ya incluye el lugar?',
      status: decisionStatus(decisions.find((d) => d.questionKey === DECORACION_EXTRA_CONFIRM_QUESTION_KEY)),
    })
  } else {
    result.push({
      questionKey: DECORACION_ORGANIZACION_QUESTION_KEY,
      blockKey: 'otros_decoracion',
      label: '¿Cómo vais a organizar la decoración?',
      status: decisionStatus(decisions.find((d) => d.questionKey === DECORACION_ORGANIZACION_QUESTION_KEY)),
    })
  }
  // Las zonas son siempre opcionales — "sin empezar" (nunca pendiente) hasta que se toque, por eso no se
  // añaden a este listado si no hay fila guardada: no hay nada que "decidir" obligatoriamente.
  const zonasDecision = decisions.find((d) => d.questionKey === DECORACION_ZONAS_QUESTION_KEY)
  if (zonasDecision) {
    result.push({ questionKey: DECORACION_ZONAS_QUESTION_KEY, blockKey: 'otros_decoracion', label: '¿Qué zonas queréis decorar?', status: 'decidida' })
  }
  return result
}

// Decoración "contratada" implica un proveedor/presupuesto; "nosotros"/"combinación" son autogestionados
// (el módulo Decoración ya cubre ideas/materiales/compras, sin duplicar aquí un segundo presupuesto).
export function desiredForDecoracionOrganizacion(answer: DecoracionOrganizacionAnswer | undefined): DesiredPairGeneration {
  if (!answer || answer.choice !== 'contrataremos') return NONE
  return { taskTitle: 'Contratar decoración', budgetCategory: 'Decoración', providerCategory: 'Decoración', resolved: false, groupKind: null, groupDefaultName: null }
}

export function desiredForDecoracionExtraConfirm(answer: DecoracionExtraConfirmAnswer | undefined): DesiredPairGeneration {
  if (!answer || answer.choice !== 'si') return NONE
  return { taskTitle: 'Organizar decoración adicional', budgetCategory: null, providerCategory: null, resolved: false, groupKind: null, groupDefaultName: null }
}
