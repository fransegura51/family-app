// «Decisiones tomadas y por decidir» del bloque Comida y bebida, en lenguaje natural. Se construye desde las
// respuestas REALES (event_decisions) y los estados que ya calcula listFoodBlockQuestions. Nunca inventa una decisión:
// una pregunta sin responder, o con «todavía no lo sabemos» o «por decidir», aparece como POR DECIDIR.
import { listFoodBlockQuestions, type FoodContext } from '@/domain/eventFood'
import type { EventDecision } from '@/domain/types'

export interface DecisionSummaryItem {
  key: string
  text: string
}

export interface DecisionSummary {
  taken: DecisionSummaryItem[]
  pending: DecisionSummaryItem[]
}

// Frase natural por pregunta y respuesta. Solo respuestas que cambian algo para la familia; cualquier respuesta
// no mapeada se muestra como decidida con el texto de la pregunta (nunca se descarta en silencio).
const TAKEN_TEXT: Record<string, Record<string, string>> = {
  'comida.quien': {
    catering: 'La comida la pone un catering',
    restaurante: 'La comida la pone un restaurante',
    nosotros: 'Cocinamos nosotros la comida',
    combinar: 'Combinamos varias opciones para la comida',
    no_habra: 'No habrá comida',
  },
  'comida.menu_estado': { decidido: 'El menú está decidido' },
  'comida.menu_infantil': {
    incluido: 'El menú infantil está incluido',
    mismo_menu: 'Los niños comen el mismo menú',
    menu_infantil: 'Hay menú infantil previsto',
    alternativa: 'Los niños tendrán una alternativa concreta',
    pedir: 'El menú infantil hay que pedirlo',
    nosotros: 'El menú infantil lo preparamos nosotros',
  },
  'comida.tarta': {
    encargar: 'Habrá tarta (se encarga)',
    nosotros: 'Habrá tarta (la preparamos nosotros)',
    resuelta: 'La tarta está resuelta',
    no: 'No habrá tarta',
  },
  'comida.bebidas': {
    servicio_comida: 'Las bebidas van incluidas en la comida',
    nosotros: 'Las bebidas las ponemos nosotros',
    aparte: 'Las bebidas van aparte',
  },
  'comida.contratacion': { si: 'La comida está contratada' },
  'comida.necesidades_revisadas': { si: 'Las necesidades alimentarias están revisadas' },
}

// Respuestas que aún no son una decisión: se muestran como POR DECIDIR con la pregunta.
const PENDING_CHOICES = new Set(['todavia_no_lo_sabemos', 'por_decidir', 'revisar'])

function choiceOf(decisions: EventDecision[], questionKey: string): string | null {
  const d = decisions.find((x) => x.questionKey === questionKey)
  const answer = d?.answer as { choice?: string } | undefined
  return answer?.choice ?? null
}

export function buildFoodDecisionSummary(ctx: FoodContext): DecisionSummary {
  const taken: DecisionSummaryItem[] = []
  const pending: DecisionSummaryItem[] = []
  for (const q of listFoodBlockQuestions(ctx)) {
    const choice = choiceOf(ctx.decisions, q.questionKey)
    const question = q.label.replace(/^¿|\?$/g, '')
    // «Todavía no lo sabemos», «por decidir» y «revisar» NO son decisiones tomadas.
    if (q.status !== 'decidida' || (choice !== null && PENDING_CHOICES.has(choice))) {
      pending.push({ key: q.questionKey, text: `Decidir: ${question.charAt(0).toLowerCase()}${question.slice(1)}` })
      continue
    }
    const mapped = choice !== null ? TAKEN_TEXT[q.questionKey]?.[choice] : undefined
    taken.push({ key: q.questionKey, text: mapped ?? q.label.replace(/^¿|\?$/g, '') })
  }
  return { taken, pending }
}
