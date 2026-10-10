// Eventos → "✨ Cómo queréis que sea vuestra boda" → "🎵 Música y fiesta" (tanda del configurador de
// boda, séptimo bloque). Muy breve a propósito (petición explícita): solo dos preguntas, sin listas de
// canciones ni horarios musicales detallados — eso es responsabilidad del DJ/grupo contratado, no de PEPA.
//
// REGLA TRANSVERSAL "no preguntar dos veces": "¿qué incluye el lugar?" (eventVenueServices.ts) ya tiene la
// clave 'musica' — cuando el lugar la incluye, la pregunta principal (MUSICA_QUESTION_KEY) NUNCA se
// plantea de cero: se sustituye por una confirmación aparte (MUSICA_EXTRA_CONFIRM_QUESTION_KEY, "¿Queréis
// añadir algo más de música?") y solo si responden que sí se despliega el mismo catálogo de opciones. Así
// "Incluida en el lugar" nunca es una respuesta más del catálogo — es un hecho ya conocido, no una elección.
//
// Deliberadamente fuera de este bloque: Primer baile, Corte de la tarta, Discursos/brindis, Ramo, Salida
// especial, Sorpresa, Proyección de fotos/vídeo — todo eso ya vive en "🎉 Momentos especiales"
// (eventSpecialMoments.ts) y no se repite aquí.
import { decisionStatus, type DesiredPairGeneration, type DecisionStatus } from '@/domain/eventPairDecisions'
import type { EventDecision } from '@/domain/types'

const NONE: DesiredPairGeneration = { taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false, groupKind: null, groupDefaultName: null }

export const MUSICA_FIESTA_BLOCK_KEY = 'musica_fiesta'

// ---------------------------------------------------------------------
// "¿Cómo vais a organizar la música?" — catálogo cerrado (DJ/directo/propia, compatibles entre sí) +
// "Sin música"/"Todavía no lo sabemos" como estados terminales + "Otra opción" en texto libre. Mismo
// patrón que MomentosEspecialesAnswer/VenueServicesAnswer: nunca se reinventa la forma.
// ---------------------------------------------------------------------
export const MUSICA_QUESTION_KEY = 'musica_fiesta.musica'

export type MusicaKey = 'dj' | 'directo' | 'propia'
export interface MusicaCatalogItem {
  key: MusicaKey
  label: string
}
export const MUSICA_CATALOG: MusicaCatalogItem[] = [
  { key: 'dj', label: '🎧 DJ' },
  { key: 'directo', label: '🎸 Música en directo' },
  { key: 'propia', label: '📱 Música propia (playlist)' },
]

export type MusicaChoice = 'seleccionar' | 'sin_musica' | 'todavia_no_lo_sabemos'
export interface MusicaAnswer {
  choice: MusicaChoice
  selected: MusicaKey[]
  customItems: string[]
}

// Aclaración del usuario tras revisar el conflicto con "muy breve a propósito" (Parte G2, orden de
// recuperación de requisitos): SIN horarios ni plan de actuación del DJ — pero sí, de forma opcional y
// compacta, en qué partes del evento habrá DJ o música en directo. Nunca obligatoria, nunca genera tarea
// ni presupuesto (igual que la canción de un momento): es solo información para quien la quiera dejar.
export const MUSICA_PARTES_QUESTION_KEY = 'musica_fiesta.musica_partes'
export type MusicaParteKey = 'ceremonia' | 'coctel' | 'comida' | 'baile' | 'fiesta'
export interface MusicaPartesCatalogItem {
  key: MusicaParteKey
  label: string
}
export const MUSICA_PARTES_CATALOG: MusicaPartesCatalogItem[] = [
  { key: 'ceremonia', label: 'Ceremonia' },
  { key: 'coctel', label: 'Cóctel' },
  { key: 'comida', label: 'Comida' },
  { key: 'baile', label: 'Baile' },
  { key: 'fiesta', label: 'Fiesta' },
]
export interface MusicaPartesAnswer {
  selected: MusicaParteKey[]
}

export function desiredForMusicaPartes(_answer: MusicaPartesAnswer | undefined): DesiredPairGeneration {
  return NONE
}

// Cuando el lugar YA incluye música: en vez de la pregunta principal, esta confirmación aparte. "Sí"
// revela el mismo catálogo (MusicaAnswer, MUSICA_QUESTION_KEY) para lo ADICIONAL — nunca una segunda
// forma de respuesta paralela.
export const MUSICA_EXTRA_CONFIRM_QUESTION_KEY = 'musica_fiesta.musica_extra_confirm'
export type MusicaExtraConfirmChoice = 'si' | 'no' | 'todavia_no_lo_sabemos'
export interface MusicaExtraConfirmAnswer {
  choice: MusicaExtraConfirmChoice
}

// ---------------------------------------------------------------------
// "¿Habrá animación o entretenimiento adicional?" — Sí/No/Todavía no lo sabemos; con Sí, catálogo breve
// (admite varios) + "Otra opción" libre. Nunca fotomatón/animador como pregunta aparte si la respuesta es
// "No" — revelado progresivo, igual que el resto del configurador.
// ---------------------------------------------------------------------
export const ANIMACION_QUESTION_KEY = 'musica_fiesta.animacion'

export type AnimacionTipoKey = 'fotomaton' | 'animador' | 'espectaculo'
export interface AnimacionCatalogItem {
  key: AnimacionTipoKey
  label: string
}
export const ANIMACION_CATALOG: AnimacionCatalogItem[] = [
  { key: 'fotomaton', label: '📸 Fotomatón' },
  { key: 'animador', label: '🎤 Animador/a' },
  { key: 'espectaculo', label: '🎭 Espectáculo' },
]

export type AnimacionChoice = 'si' | 'no' | 'todavia_no_lo_sabemos'
export interface AnimacionAnswer {
  choice: AnimacionChoice
  selected: AnimacionTipoKey[]
  customItems: string[]
}

export function summarizeMusicaFiestaBlock(decisions: EventDecision[]): string {
  const statuses = listMusicaFiestaBlockQuestions(decisions, false).map((q) => q.status)
  const decided = statuses.filter((s) => s === 'decidida').length
  const pending = statuses.filter((s) => s === 'por_decidir').length
  const notStarted = statuses.filter((s) => s === 'sin_empezar').length
  const parts: string[] = []
  if (decided > 0) parts.push(`✓ ${decided} decidida${decided === 1 ? '' : 's'}`)
  if (pending > 0) parts.push(`⏳ ${pending} por decidir`)
  if (notStarted > 0) parts.push(`${notStarted} sin empezar`)
  return parts.join(' · ')
}

export interface MusicaFiestaQuestionInfo {
  questionKey: string
  blockKey: 'musica_fiesta'
  label: string
  status: DecisionStatus
}

// `venueHasMusic`: ya resuelto por quien llama con venueIncludes(ctx, 'musica') (eventVenueServices.ts) —
// este módulo no conoce el lugar directamente, solo reacciona al hecho ya determinado, igual que
// eventFood.ts hace con tarta/bebidas.
export function listMusicaFiestaBlockQuestions(decisions: EventDecision[], venueHasMusic: boolean): MusicaFiestaQuestionInfo[] {
  const result: MusicaFiestaQuestionInfo[] = []
  if (venueHasMusic) {
    const confirmDecision = decisions.find((d) => d.questionKey === MUSICA_EXTRA_CONFIRM_QUESTION_KEY)
    result.push({ questionKey: MUSICA_EXTRA_CONFIRM_QUESTION_KEY, blockKey: 'musica_fiesta', label: '¿Queréis añadir algo más de música?', status: decisionStatus(confirmDecision) })
    const confirmAnswer = confirmDecision?.answer as unknown as MusicaExtraConfirmAnswer | undefined
    if (confirmAnswer?.choice === 'si') {
      result.push({ questionKey: MUSICA_QUESTION_KEY, blockKey: 'musica_fiesta', label: '¿Qué más de música queréis añadir?', status: decisionStatus(decisions.find((d) => d.questionKey === MUSICA_QUESTION_KEY)) })
    }
  } else {
    result.push({ questionKey: MUSICA_QUESTION_KEY, blockKey: 'musica_fiesta', label: '¿Cómo vais a organizar la música?', status: decisionStatus(decisions.find((d) => d.questionKey === MUSICA_QUESTION_KEY)) })
  }
  const musicaAnswer = decisions.find((d) => d.questionKey === MUSICA_QUESTION_KEY)?.answer as unknown as MusicaAnswer | undefined
  if (musicaAnswer?.selected?.includes('dj') || musicaAnswer?.selected?.includes('directo')) {
    result.push({
      questionKey: MUSICA_PARTES_QUESTION_KEY,
      blockKey: 'musica_fiesta',
      label: '¿En qué partes del evento habrá DJ o música en directo?',
      status: decisionStatus(decisions.find((d) => d.questionKey === MUSICA_PARTES_QUESTION_KEY)),
    })
  }
  result.push({ questionKey: ANIMACION_QUESTION_KEY, blockKey: 'musica_fiesta', label: '¿Habrá animación o entretenimiento adicional?', status: decisionStatus(decisions.find((d) => d.questionKey === ANIMACION_QUESTION_KEY)) })
  return result
}

function labelsFor(selected: MusicaKey[], customItems: string[]): string {
  const labels = selected.map((k) => MUSICA_CATALOG.find((c) => c.key === k)?.label ?? k)
  return [...labels, ...customItems].join(', ')
}

// Un proveedor solo tiene sentido si se contrata algo fuera (DJ/directo) — "música propia" es
// autogestionada, nunca genera presupuesto ni proveedor, solo (si acaso) un recordatorio de preparar la
// lista, que tampoco se inventa aquí: "muy breve y práctico" — ningún Preparativo para "música propia"
// sola, la familia ya sabe que tiene que montar su playlist.
export function desiredForMusica(answer: MusicaAnswer | undefined): DesiredPairGeneration {
  if (!answer || answer.choice !== 'seleccionar') return NONE
  if (answer.selected.length === 0 && answer.customItems.length === 0) return NONE
  const needsProvider = answer.selected.includes('dj') || answer.selected.includes('directo') || answer.customItems.length > 0
  if (!needsProvider) return NONE
  return {
    taskTitle: `Contratar música: ${labelsFor(answer.selected, answer.customItems)}`,
    budgetCategory: needsProvider ? 'Música' : null,
    providerCategory: needsProvider ? 'Música' : null,
    resolved: false,
    groupKind: null,
    groupDefaultName: null,
  }
}

export function desiredForAnimacion(answer: AnimacionAnswer | undefined): DesiredPairGeneration {
  if (!answer || answer.choice !== 'si') return NONE
  if (answer.selected.length === 0 && answer.customItems.length === 0) return NONE
  const labels = [...answer.selected.map((k) => ANIMACION_CATALOG.find((c) => c.key === k)?.label ?? k), ...answer.customItems].join(', ')
  return {
    taskTitle: `Organizar animación: ${labels}`,
    budgetCategory: 'Animación',
    providerCategory: 'Animación',
    resolved: false,
    groupKind: null,
    groupDefaultName: null,
  }
}
