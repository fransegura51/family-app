// Eventos → "✨ Cómo queréis que sea vuestra boda" → "📷 Fotos y recuerdos" (tanda del configurador de
// boda, octavo bloque). Tres decisiones independientes: cobertura fotográfica del día, sesión aparte
// (preboda/postboda) y vídeo — cada servicio puede ir con un proveedor distinto o compartir uno (sin
// duplicar presupuesto cuando comparten).
//
// Deliberadamente fuera de este bloque: "Proyección de fotos o vídeo" (mostrar algo DURANTE el evento) ya
// vive en "🎉 Momentos especiales" — esto es sobre CONSEGUIR las fotos/el vídeo, no sobre proyectarlos.
import { decisionStatus, type DesiredPairGeneration, type DecisionStatus } from '@/domain/eventPairDecisions'
import type { EventDecision } from '@/domain/types'

const NONE: DesiredPairGeneration = { taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false, groupKind: null, groupDefaultName: null }

export const FOTOS_RECUERDOS_BLOCK_KEY = 'fotos_recuerdos'

// ---------------------------------------------------------------------
// "¿Cómo vais a organizar las fotos del día de la boda?" — opciones mutuamente excluyentes (una
// estrategia, no un catálogo acumulable).
// ---------------------------------------------------------------------
export const COBERTURA_FOTOS_QUESTION_KEY = 'fotos_recuerdos.cobertura'
export type CoberturaFotosChoice = 'profesional' | 'familiares_amigos' | 'nuestra_cuenta' | 'todavia_no_lo_sabemos' | 'sin_cobertura'
export interface CoberturaFotosAnswer {
  choice: CoberturaFotosChoice
}

// ---------------------------------------------------------------------
// "¿Queréis hacer una sesión de fotos aparte?" — Preboda/Postboda/Ambas/No/Todavía no lo sabemos. Con
// sesión, quién la hace (mismo fotógrafo ya contratado / otro / pendiente) y fecha opcional — "mismo
// fotógrafo" nunca genera un segundo proveedor/presupuesto, es el mismo compromiso.
// ---------------------------------------------------------------------
export const SESION_FOTOS_QUESTION_KEY = 'fotos_recuerdos.sesion'
export type SesionFotosChoice = 'preboda' | 'postboda' | 'ambas' | 'no' | 'todavia_no_lo_sabemos'
export type SesionFotosQuien = 'mismo_fotografo' | 'otro' | 'pendiente'
export interface SesionFotosAnswer {
  choice: SesionFotosChoice
  quien?: SesionFotosQuien | null
  fecha?: string | null
}

// ---------------------------------------------------------------------
// "¿Queréis grabar la boda en vídeo?" — mismo patrón de excluyentes que la cobertura de fotos.
// ---------------------------------------------------------------------
export const VIDEO_QUESTION_KEY = 'fotos_recuerdos.video'
export type VideoChoice = 'profesional' | 'familiares_amigos' | 'nuestra_cuenta' | 'no' | 'todavia_no_lo_sabemos'
export interface VideoAnswer {
  choice: VideoChoice
}

export function summarizeFotosRecuerdosBlock(decisions: EventDecision[]): string {
  const statuses = listFotosRecuerdosBlockQuestions(decisions).map((q) => q.status)
  const decided = statuses.filter((s) => s === 'decidida').length
  const pending = statuses.filter((s) => s === 'por_decidir').length
  const notStarted = statuses.filter((s) => s === 'sin_empezar').length
  const parts: string[] = []
  if (decided > 0) parts.push(`✓ ${decided} decidida${decided === 1 ? '' : 's'}`)
  if (pending > 0) parts.push(`⏳ ${pending} por decidir`)
  if (notStarted > 0) parts.push(`${notStarted} sin empezar`)
  return parts.join(' · ')
}

export interface FotosRecuerdosQuestionInfo {
  questionKey: string
  blockKey: 'fotos_recuerdos'
  label: string
  status: DecisionStatus
}

export function listFotosRecuerdosBlockQuestions(decisions: EventDecision[]): FotosRecuerdosQuestionInfo[] {
  return [
    { questionKey: COBERTURA_FOTOS_QUESTION_KEY, blockKey: 'fotos_recuerdos', label: '¿Cómo vais a organizar las fotos del día de la boda?', status: decisionStatus(decisions.find((d) => d.questionKey === COBERTURA_FOTOS_QUESTION_KEY)) },
    { questionKey: SESION_FOTOS_QUESTION_KEY, blockKey: 'fotos_recuerdos', label: '¿Queréis hacer una sesión de fotos aparte?', status: decisionStatus(decisions.find((d) => d.questionKey === SESION_FOTOS_QUESTION_KEY)) },
    { questionKey: VIDEO_QUESTION_KEY, blockKey: 'fotos_recuerdos', label: '¿Queréis grabar la boda en vídeo?', status: decisionStatus(decisions.find((d) => d.questionKey === VIDEO_QUESTION_KEY)) },
  ]
}

// Solo "profesional" implica contratar a alguien de fuera — familiares/amigos y "por nuestra cuenta" son
// autogestionados, nunca generan presupuesto ni proveedor (igual criterio que Música).
export function desiredForCoberturaFotos(answer: CoberturaFotosAnswer | undefined): DesiredPairGeneration {
  if (!answer || answer.choice !== 'profesional') return NONE
  return { taskTitle: 'Contratar fotógrafo/a para el día de la boda', budgetCategory: 'Fotografía', providerCategory: 'Fotografía', resolved: false, groupKind: null, groupDefaultName: null }
}

// "Mismo fotógrafo" reutiliza el compromiso ya contratado (nunca un segundo proveedor/presupuesto) — solo
// genera un Preparativo para acordar la fecha. "Otro" sí implica un proveedor/presupuesto propio. "No"/
// "Todavía no lo sabemos" no generan nada.
export function desiredForSesionFotos(answer: SesionFotosAnswer | undefined): DesiredPairGeneration {
  if (!answer || (answer.choice !== 'preboda' && answer.choice !== 'postboda' && answer.choice !== 'ambas')) return NONE
  const label = answer.choice === 'ambas' ? 'preboda y postboda' : answer.choice
  if (answer.quien === 'otro') {
    return { taskTitle: `Organizar sesión de fotos (${label}) con otro fotógrafo/a`, budgetCategory: 'Fotografía — sesión aparte', providerCategory: 'Fotografía', resolved: false, groupKind: null, groupDefaultName: null }
  }
  return { taskTitle: `Organizar sesión de fotos (${label})`, budgetCategory: null, providerCategory: null, resolved: false, groupKind: null, groupDefaultName: null }
}

export function desiredForVideo(answer: VideoAnswer | undefined): DesiredPairGeneration {
  if (!answer || answer.choice !== 'profesional') return NONE
  return { taskTitle: 'Contratar videógrafo/a', budgetCategory: 'Vídeo', providerCategory: 'Vídeo', resolved: false, groupKind: null, groupDefaultName: null }
}
