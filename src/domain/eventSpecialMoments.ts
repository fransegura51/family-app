// Eventos → "✨ Cómo queréis que sea vuestro evento" → "🎉 Momentos especiales" — fase 5 (reajustada).
// `event_moments` es lugar+hora (Ceremonia/Comida/Fiesta); un "momento especial" es justo lo contrario:
// un acto simbólico que ocurre DENTRO de uno de esos momentos (primer baile, corte de tarta, discursos...)
// — nunca crea ni toca event_moments, nunca un motor paralelo. Selección múltiple sobre un catálogo fijo
// por tipo de evento (en código, igual que MENU_PLAN_TEMPLATES/ACTIVITY_PLAN_TEMPLATES en domain/events.ts)
// + "Otro momento especial" en texto libre — guardado entero en UNA fila de event_decisions, mismo motor
// que listGuestsBlockQuestions/decisionStatus, sin tabla nueva.
//
// Deliberadamente fuera del catálogo: "juegos"/animación (ya es "🎲 Actividades y juegos", no se duplica
// aquí) y cualquier cosa de contratación de música/DJ/fotógrafo (bloques futuros 6/7). "Proyección de
// fotos o vídeo" es mostrar algo durante el evento (un vídeo/montaje) — nunca "hacer fotos"/contratar
// fotógrafo/photocall, eso es la futura fase "📷 Fotos y recuerdos".
import type { CustomAction, CustomHasCost, CustomResolution, DesiredPairGeneration } from '@/domain/eventPairDecisions'
import { decisionStatus, type DecisionStatus } from '@/domain/eventPairDecisions'
import type { EventDecision, EventType } from '@/domain/types'

const NONE: DesiredPairGeneration = { taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false, groupKind: null, groupDefaultName: null }

export const MOMENTOS_ESPECIALES_QUESTION_KEY = 'momentos_especiales.seleccion'

export type MomentoEspecialKey =
  | 'primer_baile'
  | 'corte_tarta'
  | 'discursos'
  | 'ramo'
  | 'salida_especial'
  | 'sorpresa'
  | 'proyeccion'
  | 'velas_tarta'
  | 'apertura_regalos'
  | 'tarta'
  | 'brindis'

export interface MomentoEspecialCatalogItem {
  key: MomentoEspecialKey
  label: string
}

const BODA_CATALOG: MomentoEspecialCatalogItem[] = [
  { key: 'primer_baile', label: 'Primer baile' },
  { key: 'corte_tarta', label: 'Corte de la tarta' },
  { key: 'discursos', label: 'Discursos o brindis' },
  { key: 'ramo', label: 'Ramo' },
  { key: 'salida_especial', label: 'Salida especial' },
  { key: 'sorpresa', label: 'Sorpresa' },
  { key: 'proyeccion', label: 'Proyección de fotos o vídeo' },
]
const CUMPLEANOS_CATALOG: MomentoEspecialCatalogItem[] = [
  { key: 'velas_tarta', label: 'Velas / tarta' },
  { key: 'sorpresa', label: 'Sorpresa' },
  { key: 'apertura_regalos', label: 'Apertura de regalos' },
  { key: 'proyeccion', label: 'Proyección de fotos o vídeo' },
]
const COMUNION_BAUTIZO_CATALOG: MomentoEspecialCatalogItem[] = [
  { key: 'tarta', label: 'Tarta' },
  { key: 'brindis', label: 'Brindis o discurso' },
  { key: 'apertura_regalos', label: 'Apertura de regalos' },
  { key: 'proyeccion', label: 'Proyección de fotos o vídeo' },
]
// Aniversario/fiesta/comida/cena/celebración/personalizado y cualquier tipo futuro no listado aparte —
// todos caen hoy en 'celebracion'/'personalizado' (no son EventType propios), así que comparten el mismo
// catálogo genérico.
const GENERICO_CATALOG: MomentoEspecialCatalogItem[] = [
  { key: 'tarta', label: 'Tarta' },
  { key: 'brindis', label: 'Brindis o discurso' },
  { key: 'sorpresa', label: 'Sorpresa' },
  { key: 'proyeccion', label: 'Proyección de fotos o vídeo' },
]

export const MOMENTOS_ESPECIALES_CATALOG: Record<EventType, MomentoEspecialCatalogItem[]> = {
  boda: BODA_CATALOG,
  cumpleanos: CUMPLEANOS_CATALOG,
  comunion: COMUNION_BAUTIZO_CATALOG,
  bautizo: COMUNION_BAUTIZO_CATALOG,
  celebracion: GENERICO_CATALOG,
  personalizado: GENERICO_CATALOG,
}

export type MomentosEspecialesChoice = 'seleccionar' | 'ninguno' | 'todavia_no_lo_sabemos'
export interface MomentosEspecialesAnswer {
  choice: MomentosEspecialesChoice
  selected: MomentoEspecialKey[]
  customItems: string[]
}

export function momentosEspecialesStatus(decisions: EventDecision[]): DecisionStatus {
  return decisionStatus(decisions.find((d) => d.questionKey === MOMENTOS_ESPECIALES_QUESTION_KEY))
}

export function summarizeMomentosEspecialesBlock(decisions: EventDecision[]): string {
  const status = momentosEspecialesStatus(decisions)
  if (status === 'decidida') return '✓ decidido'
  if (status === 'por_decidir') return '⏳ por decidir'
  return ''
}

export interface MomentosEspecialesQuestionInfo {
  questionKey: string
  blockKey: 'momentos_especiales'
  label: string
  status: DecisionStatus
}

// Mismo revelado progresivo que "La pareja"/"Invitados": la pregunta de clases de baile solo es
// relevante (y por tanto solo aparece) cuando "primer_baile" está entre los momentos seleccionados —
// antes de eso no existe como pregunta, no es "sin empezar".
export function listMomentosEspecialesBlockQuestions(decisions: EventDecision[]): MomentosEspecialesQuestionInfo[] {
  const result: MomentosEspecialesQuestionInfo[] = []
  const seleccionDecision = decisions.find((d) => d.questionKey === MOMENTOS_ESPECIALES_QUESTION_KEY)
  result.push({ questionKey: MOMENTOS_ESPECIALES_QUESTION_KEY, blockKey: 'momentos_especiales', label: '¿Qué momentos especiales queréis?', status: decisionStatus(seleccionDecision) })
  const answer = seleccionDecision?.answer as unknown as MomentosEspecialesAnswer | undefined
  if (answer?.selected?.includes('primer_baile')) {
    result.push({
      questionKey: CLASES_BAILE_QUESTION_KEY,
      blockKey: 'momentos_especiales',
      label: '¿Necesitáis clases de baile?',
      status: decisionStatus(decisions.find((d) => d.questionKey === CLASES_BAILE_QUESTION_KEY)),
    })
    result.push({
      questionKey: CANCION_PRIMER_BAILE_QUESTION_KEY,
      blockKey: 'momentos_especiales',
      label: '¿Tenéis clara la canción del primer baile?',
      status: decisionStatus(decisions.find((d) => d.questionKey === CANCION_PRIMER_BAILE_QUESTION_KEY)),
    })
  }
  return result
}

// ---------------------------------------------------------------------
// "Primer baile" → "¿Necesitáis clases de baile?" — ÚNICA pregunta contextual de esta fase (petición
// explícita: no inventar una pregunta de resolución para cada momento, solo para este caso concreto y
// habitual). Solo "Sí" implica una necesidad real; nunca crea presupuesto ni proveedor (a diferencia de
// Peluquería/Floral en "La pareja") — deliberado, puede decidirse más adelante si hace falta.
// ---------------------------------------------------------------------
export const CLASES_BAILE_QUESTION_KEY = 'momentos_especiales.primer_baile.clases_baile'

export type ClasesBaileChoice = 'si' | 'no' | 'todavia_no_lo_sabemos'
export interface ClasesBaileAnswer {
  choice: ClasesBaileChoice
}

export function desiredForClasesBaile(answer: ClasesBaileAnswer | undefined): DesiredPairGeneration {
  if (!answer || answer.choice !== 'si') return NONE
  return { taskTitle: 'Buscar/organizar clases de baile', budgetCategory: null, providerCategory: null, resolved: false, groupKind: null, groupDefaultName: null }
}

// ---------------------------------------------------------------------
// "Primer baile" → "¿Tenéis clara la canción del primer baile?" (A2, tanda del configurador de boda) —
// AMPLÍA la decisión YA EXISTENTE de "Primer baile", nunca un segundo momento ni una tarea duplicada.
// Puramente informativa: nunca genera Preparativo ni presupuesto (desiredForCancionPrimerBaile es
// siempre NONE), se llama a applyPairDecisionGeneration igual que el resto solo por coherencia con el
// motor (un NONE contra "sin tarea existente" es un no-op real).
// Si "Primer baile" se desmarca, listMomentosEspecialesBlockQuestions (arriba) deja de mostrar esta
// pregunta — pero a diferencia de "clases de baile", AQUÍ NUNCA se borra la fila de event_decisions: la
// petición explícita es conservar el título/artista para una posible reactivación (ver saveSeleccion en
// EventosScreen.tsx, que solo limpia CLASES_BAILE_QUESTION_KEY, nunca esta).
// ---------------------------------------------------------------------
export const CANCION_PRIMER_BAILE_QUESTION_KEY = 'momentos_especiales.primer_baile.cancion'

// 'todavia_no_lo_sabemos' reutiliza el MISMO centinela que decisionStatus() ya reconoce como «por
// decidir» — así "Todavía no" queda pendiente sin tener que tocar esa función genérica.
export type CancionPrimerBaileChoice = 'si' | 'todavia_no_lo_sabemos' | 'sin_cancion_concreta'
export interface CancionPrimerBaileAnswer {
  choice: CancionPrimerBaileChoice
  titulo?: string | null
  artista?: string | null
}

export function desiredForCancionPrimerBaile(_answer: CancionPrimerBaileAnswer | undefined): DesiredPairGeneration {
  return NONE
}

export type { CustomAction, CustomHasCost, CustomResolution, DesiredPairGeneration }
