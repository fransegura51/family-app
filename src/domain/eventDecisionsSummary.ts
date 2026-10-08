// «Decisiones tomadas y por decidir», en lenguaje natural, para cada bloque del configurador. Comida y
// bebida fue el primero (buildFoodDecisionSummary); esta misma forma se repite ahora para Celebración,
// La pareja, Invitados e invitaciones y Momentos especiales. Siempre se DERIVA de las respuestas reales
// (event_decisions) y de los estados que ya calcula cada list*BlockQuestions — nunca es una fuente de
// verdad nueva. Una pregunta sin responder, con «todavía no lo sabemos» o «por decidir», aparece como POR
// DECIDIR; una pregunta todavía no relevante (revelado progresivo: p. ej. la resolución de un vestuario
// antes de elegir el tipo) sencillamente no está en la lista de list*BlockQuestions y por tanto no aparece
// aquí tampoco — eso ya lo decide cada módulo de dominio, no se reimplementa.
import { listFoodBlockQuestions, type FoodContext } from '@/domain/eventFood'
import { listCelebrationQuestions, ageTurning, longSpanishDate, type CelebrationFacts } from '@/domain/eventCelebration'
import { listPairBlockQuestions, type PairQuestionInfo } from '@/domain/eventPairDecisions'
import { listGuestsBlockQuestions } from '@/domain/eventGuestDecisions'
import { listMomentosEspecialesBlockQuestions, CLASES_BAILE_QUESTION_KEY, MOMENTOS_ESPECIALES_QUESTION_KEY } from '@/domain/eventSpecialMoments'
import { ESPECIAL_HAY_QUESTION_KEY, ESPECIAL_REGALOS_QUESTION_KEY, listEspecialBlockQuestions, listFamiliaresBlockQuestions } from '@/domain/eventSpecialPeople'
import type { EventDecision, FamilyEvent } from '@/domain/types'

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

// «Decidir: ...» con la pregunta en minúscula tras el signo — misma frase para los cuatro bloques nuevos.
function pendingText(label: string): string {
  const question = label.replace(/^¿|\?$/g, '')
  return `Decidir: ${question.charAt(0).toLowerCase()}${question.slice(1)}`
}

// ---------------------------------------------------------------------
// Celebración / Ceremonia y celebración
// ---------------------------------------------------------------------
// A diferencia de Comida y bebida, estas preguntas no viven todas en una fila de event_decisions con la
// misma clave que expone listCelebrationQuestions (p. ej. 'fecha' resume events.event_date/date_status
// y, en su caso, celebracion.fecha) — así que el texto de «tomada» se construye a partir de los mismos
// hechos (CelebrationFacts) que ya usa el bloque, nunca releyendo una clave que no existe.
const CELEBRATION_TAKEN_TEXT: Record<string, (facts: CelebrationFacts) => string> = {
  edad: (f) => `Cumple ${ageTurning(f.event)} años`,
  fecha: (f) => (f.event.eventDate ? `La fecha está decidida (${longSpanishDate(f.event.eventDate)})` : 'La fecha está decidida'),
  lugar: () => 'El lugar está decidido',
  servicios: () => 'Lo que incluye el lugar está decidido',
}

export function buildCelebrationDecisionSummary(facts: CelebrationFacts): DecisionSummary {
  const taken: DecisionSummaryItem[] = []
  const pending: DecisionSummaryItem[] = []
  for (const q of listCelebrationQuestions(facts)) {
    if (q.status !== 'decidida') {
      pending.push({ key: q.key, text: pendingText(q.label) })
      continue
    }
    taken.push({ key: q.key, text: CELEBRATION_TAKEN_TEXT[q.key]?.(facts) ?? q.label.replace(/^¿|\?$/g, '') })
  }
  return { taken, pending }
}

// ---------------------------------------------------------------------
// La pareja — las preguntas de nivel superior (vestuario, peluquería/maquillaje, alianzas, detalle
// especial) se guardan como {choice: ...}; las de resolución y los ítems florales a veces no tienen un
// «choice» con el que mapear una frase concreta (floral es solo una marca) — en esos casos se usa el
// propio label (ya en lenguaje natural, p. ej. «Ramo de Novia») como texto, igual que ya hace
// buildFoodDecisionSummary con cualquier respuesta no mapeada.
const PAIR_TAKEN_TEXT: Record<string, Record<string, string>> = {}

// Fase 1.2 (plan de pendientes) — "agrupar entradas relacionadas para reducir longitud, por ejemplo
// «Vestuario» y «Cómo está resuelto», sin perder información": vestuario, peluquería/maquillaje y detalle
// especial son preguntas de DOS niveles (tipo + resolución, listPairBlockQuestions siempre las devuelve
// adyacentes — la resolución solo aparece justo después de su tipo, nunca antes ni suelta). El tipo por sí
// solo nunca "decide" nada (ver eventPairDecisions.ts) — la fila combinada usa la etiqueta del tipo (más
// natural, "Vestuario de Jennifer") pero el ESTADO de la resolución, la única de las dos que de verdad
// cierra la pregunta. Un tipo todavía sin resolución reconocible (resolución no revelada todavía) se queda
// tal cual, con su propio estado — no hay nada que fusionar.
export function mergeTipoResolucionPairs(questions: PairQuestionInfo[]): PairQuestionInfo[] {
  const merged: PairQuestionInfo[] = []
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    const next = questions[i + 1]
    if (next && next.questionKey === `${q.questionKey}.resolucion`) {
      merged.push({ questionKey: next.questionKey, blockKey: q.blockKey, label: q.label, status: next.status })
      i++
    } else {
      merged.push(q)
    }
  }
  return merged
}

export function buildPairDecisionSummary(event: FamilyEvent, decisions: EventDecision[]): DecisionSummary {
  const taken: DecisionSummaryItem[] = []
  const pending: DecisionSummaryItem[] = []
  for (const q of mergeTipoResolucionPairs(listPairBlockQuestions(event, decisions))) {
    const choice = choiceOf(decisions, q.questionKey)
    if (q.status !== 'decidida' || (choice !== null && PENDING_CHOICES.has(choice))) {
      pending.push({ key: q.questionKey, text: pendingText(q.label) })
      continue
    }
    const mapped = choice !== null ? PAIR_TAKEN_TEXT[q.questionKey]?.[choice] : undefined
    taken.push({ key: q.questionKey, text: mapped ?? q.label })
  }
  return { taken, pending }
}

// ---------------------------------------------------------------------
// Invitados e invitaciones
// ---------------------------------------------------------------------
const GUESTS_TAKEN_TEXT: Record<string, Record<string, string>> = {
  'invitados.lista': { ya_la_tenemos: 'Ya tenéis la lista de invitados', tenemos_que_prepararla: 'Hay que preparar la lista de invitados' },
  'invitados.menu_invitacion': { si: 'Habrá preguntas para los invitados en la invitación', no: 'No habrá preguntas para los invitados' },
  'invitados.momentos': { todos_a_todos: 'Todos los invitados van a todos los momentos', depende: 'Depende del invitado el momento al que va' },
  'invitados.ninos': { si: 'Vendrán niños', no: 'No vendrán niños' },
  'invitados.ninos.necesidades': { preparar: 'Las necesidades de los niños están decididas', no_necesitamos: 'Los niños no tienen necesidades especiales' },
  'invitados.invitacion': { con_pepa: 'La invitación se gestiona con PEPA', externa: 'La invitación se gestiona de forma externa' },
}

export function buildGuestsDecisionSummary(decisions: EventDecision[], momentsCount: number): DecisionSummary {
  const taken: DecisionSummaryItem[] = []
  const pending: DecisionSummaryItem[] = []
  for (const q of listGuestsBlockQuestions(decisions, momentsCount)) {
    const choice = choiceOf(decisions, q.questionKey)
    if (q.status !== 'decidida' || (choice !== null && PENDING_CHOICES.has(choice))) {
      pending.push({ key: q.questionKey, text: pendingText(q.label) })
      continue
    }
    const mapped = choice !== null ? GUESTS_TAKEN_TEXT[q.questionKey]?.[choice] : undefined
    taken.push({ key: q.questionKey, text: mapped ?? q.label.replace(/^¿|\?$/g, '') })
  }
  return { taken, pending }
}

// ---------------------------------------------------------------------
// Momentos especiales
// ---------------------------------------------------------------------
const MOMENTOS_ESPECIALES_TAKEN_TEXT: Record<string, Record<string, string>> = {
  [MOMENTOS_ESPECIALES_QUESTION_KEY]: { seleccionar: 'Los momentos especiales están decididos', ninguno: 'No habrá momentos especiales' },
  [CLASES_BAILE_QUESTION_KEY]: { si: 'Haréis clases de baile', no: 'No haréis clases de baile' },
}

export function buildMomentosEspecialesDecisionSummary(decisions: EventDecision[]): DecisionSummary {
  const taken: DecisionSummaryItem[] = []
  const pending: DecisionSummaryItem[] = []
  for (const q of listMomentosEspecialesBlockQuestions(decisions)) {
    const choice = choiceOf(decisions, q.questionKey)
    if (q.status !== 'decidida' || (choice !== null && PENDING_CHOICES.has(choice))) {
      pending.push({ key: q.questionKey, text: pendingText(q.label) })
      continue
    }
    const mapped = choice !== null ? MOMENTOS_ESPECIALES_TAKEN_TEXT[q.questionKey]?.[choice] : undefined
    taken.push({ key: q.questionKey, text: mapped ?? q.label.replace(/^¿|\?$/g, '') })
  }
  return { taken, pending }
}

// ---------------------------------------------------------------------
// "🎭 Personas especiales" / "👪 Familiares" (Fase 2, plan de pendientes)
// ---------------------------------------------------------------------
const ESPECIAL_TAKEN_TEXT: Record<string, Record<string, string>> = {
  [ESPECIAL_HAY_QUESTION_KEY]: { si: 'Habrá personas con un papel especial', no: 'No habrá personas con un papel especial' },
  [ESPECIAL_REGALOS_QUESTION_KEY]: { ninguno: 'No habrá regalos para personas especiales' },
}

export function buildEspecialDecisionSummary(decisions: EventDecision[], peopleCount: number): DecisionSummary {
  const taken: DecisionSummaryItem[] = []
  const pending: DecisionSummaryItem[] = []
  for (const q of listEspecialBlockQuestions(decisions, peopleCount)) {
    const choice = choiceOf(decisions, q.questionKey)
    if (q.status !== 'decidida' || (choice !== null && PENDING_CHOICES.has(choice))) {
      pending.push({ key: q.questionKey, text: pendingText(q.label) })
      continue
    }
    const mapped = choice !== null ? ESPECIAL_TAKEN_TEXT[q.questionKey]?.[choice] : undefined
    taken.push({ key: q.questionKey, text: mapped ?? q.label.replace(/^¿|\?$/g, '') })
  }
  return { taken, pending }
}

export function buildFamiliaresDecisionSummary(decisions: EventDecision[], peopleCount: number): DecisionSummary {
  const taken: DecisionSummaryItem[] = []
  const pending: DecisionSummaryItem[] = []
  for (const q of listFamiliaresBlockQuestions(decisions, peopleCount)) {
    const choice = choiceOf(decisions, q.questionKey)
    if (q.status !== 'decidida' || (choice !== null && PENDING_CHOICES.has(choice))) {
      pending.push({ key: q.questionKey, text: pendingText(q.label) })
      continue
    }
    taken.push({ key: q.questionKey, text: q.label.replace(/^¿|\?$/g, '') })
  }
  return { taken, pending }
}
