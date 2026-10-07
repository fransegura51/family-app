// Fase 1.1 (plan de pendientes) — resumen compacto del configurador ("✓ 38 decisiones tomadas · 7
// pendientes", una línea por sección con pendientes, "Secciones sin empezar: N" agrupadas). Puramente
// derivado de los list*BlockQuestions que YA existen en cada bloque (eventCelebration/eventPairDecisions/
// eventGuestDecisions/eventSpecialMoments/eventFood) — nunca una fuente de verdad nueva, nunca
// recalcula qué es "decidida"/"por decidir"/"sin empezar" (eso ya lo decide decisionStatus en cada bloque).
import type { DecisionStatus } from '@/domain/eventPairDecisions'

// Una pregunta de cualquier bloque, normalizada a la misma forma (cada list*BlockQuestions usa su propio
// nombre de campo para la clave — questionKey en la mayoría, key en Celebración — así que quien llama
// aplana eso aquí, no se reimplementa la lectura de cada bloque).
export interface ConfiguratorQuestionRef {
  sectionKey: string
  sectionLabel: string
  key: string
  label: string
  status: DecisionStatus
}

export interface ConfiguratorSectionPending {
  sectionKey: string
  sectionLabel: string
  pendingCount: number
  // Primera pregunta "por_decidir" de la sección, en el mismo orden en que list*BlockQuestions la devolvió
  // — "cada flecha lleva directamente a la primera pregunta pendiente de esa sección".
  firstPendingKey: string
}

export interface ConfiguratorNotStartedSection {
  sectionKey: string
  sectionLabel: string
}

export interface ConfiguratorSummary {
  decidedCount: number
  pendingCount: number
  sectionsWithPending: ConfiguratorSectionPending[]
  // Sección "sin empezar" = ninguna de sus preguntas tiene todavía una decisión tomada ni pendiente
  // explícita (todo `sin_empezar`) — nunca una sección simplemente vacía porque no aplica a este evento
  // (esas ni siquiera llegan aquí: list*BlockQuestions ya devuelve [] para ellas).
  notStartedSections: ConfiguratorNotStartedSection[]
}

export function computeConfiguratorSummary(questions: ConfiguratorQuestionRef[]): ConfiguratorSummary {
  const sectionOrder: string[] = []
  const bySection = new Map<string, ConfiguratorQuestionRef[]>()
  for (const q of questions) {
    if (!bySection.has(q.sectionKey)) {
      bySection.set(q.sectionKey, [])
      sectionOrder.push(q.sectionKey)
    }
    bySection.get(q.sectionKey)!.push(q)
  }

  let decidedCount = 0
  let pendingCount = 0
  const sectionsWithPending: ConfiguratorSectionPending[] = []
  const notStartedSections: ConfiguratorNotStartedSection[] = []

  for (const sectionKey of sectionOrder) {
    const items = bySection.get(sectionKey)!
    if (items.length === 0) continue
    const sectionLabel = items[0].sectionLabel
    const decided = items.filter((i) => i.status === 'decidida')
    const pending = items.filter((i) => i.status === 'por_decidir')
    decidedCount += decided.length
    pendingCount += pending.length
    if (pending.length > 0) {
      sectionsWithPending.push({ sectionKey, sectionLabel, pendingCount: pending.length, firstPendingKey: pending[0].key })
    } else if (decided.length === 0) {
      // Nada tomado y nada pendiente explícito → la sección entera sigue en "sin empezar".
      notStartedSections.push({ sectionKey, sectionLabel })
    }
  }

  return { decidedCount, pendingCount, sectionsWithPending, notStartedSections }
}
