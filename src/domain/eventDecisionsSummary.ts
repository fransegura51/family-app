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
import {
  listMomentosEspecialesBlockQuestions,
  CLASES_BAILE_QUESTION_KEY,
  MOMENTOS_ESPECIALES_QUESTION_KEY,
  MOMENTOS_CON_CANCION,
  MOMENTO_ESPECIAL_LABELS,
  cancionQuestionKey,
  type CancionMomentoAnswer,
} from '@/domain/eventSpecialMoments'
import {
  listMusicaFiestaBlockQuestions,
  MUSICA_QUESTION_KEY,
  MUSICA_EXTRA_CONFIRM_QUESTION_KEY,
  ANIMACION_QUESTION_KEY,
  MUSICA_CATALOG,
  ANIMACION_CATALOG,
  type MusicaAnswer,
  type AnimacionAnswer,
} from '@/domain/eventMusicaFiesta'
import {
  listFotosRecuerdosBlockQuestions,
  COBERTURA_FOTOS_QUESTION_KEY,
  COBERTURA_FOTOS_CATALOG,
  SESION_FOTOS_QUESTION_KEY,
  VIDEO_QUESTION_KEY,
  normalizeCoberturaFotosAnswer,
  type SesionFotosAnswer,
} from '@/domain/eventFotosRecuerdos'
import {
  listOtrosDecoracionBlockQuestions,
  DECORACION_EXTRA_CONFIRM_QUESTION_KEY,
  DECORACION_ORGANIZACION_QUESTION_KEY,
  DECORACION_ZONAS_QUESTION_KEY,
  DECORACION_ZONAS_CATALOG,
  type DecoracionZonasAnswer,
} from '@/domain/eventOtrosDecoracion'
import {
  ESPECIAL_HAY_QUESTION_KEY,
  ESPECIAL_VESTIMENTA_QUESTION_KEY,
  ESPECIAL_COMPLEMENTOS_QUESTION_KEY,
  ESPECIAL_REGALOS_QUESTION_KEY,
  listEspecialBlockQuestions,
  listFamiliaresBlockQuestions,
} from '@/domain/eventSpecialPeople'
import type { EventDecision, FamilyEvent } from '@/domain/types'

export interface DecisionSummaryItem {
  key: string
  text: string
  // Tanda "Resúmenes de decisiones compactos" — sustituye a la palabra genérica "Resuelto"/"Pendiente"
  // por la respuesta real, con el mínimo texto posible (p. ej. "2", "Algunos", "Todavía no lo sabemos").
  // Opcional y SOLO poblado por los bloques que ya lo calculan (ver buildEspecialDecisionSummary) — un
  // bloque que no lo rellena sigue mostrando el genérico de siempre, sin ningún cambio de comportamiento.
  statusLabel?: string
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
  const cancionKeys = new Map(MOMENTOS_CON_CANCION.map((momento) => [cancionQuestionKey(momento), momento]))
  for (const q of listMomentosEspecialesBlockQuestions(decisions)) {
    // Canción de un momento especial (A2, generalizado por la Parte G3) — statusLabel dinámico (el
    // título real si lo hay), no una frase fija de TAKEN_TEXT; mismo criterio que "Resúmenes de
    // decisiones compactos" del resto de la app.
    const momento = cancionKeys.get(q.questionKey)
    if (momento) {
      const text = `Canción de "${MOMENTO_ESPECIAL_LABELS[momento]}"`
      if (q.status !== 'decidida') {
        pending.push({ key: q.questionKey, text, statusLabel: 'Todavía no lo sabemos' })
        continue
      }
      const answer = decisions.find((d) => d.questionKey === q.questionKey)?.answer as unknown as CancionMomentoAnswer | undefined
      const statusLabel = answer?.choice === 'si' ? answer.titulo?.trim() || 'Sí' : 'Sin canción concreta'
      taken.push({ key: q.questionKey, text, statusLabel })
      continue
    }
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
// "🎵 Música y fiesta" (séptimo bloque, tanda del configurador de boda) — statusLabel real (catálogo
// elegido / "Incluida en el lugar" / "Sin música"...) en vez del genérico "Resuelto", mismo criterio que
// el resto de bloques recientes.
// ---------------------------------------------------------------------
function labelsForSummary(catalog: { key: string; label: string }[], selected: string[], customItems: string[]): string {
  const labels = selected.map((k) => catalog.find((c) => c.key === k)?.label.replace(/^\p{Emoji}\s*/u, '') ?? k)
  return [...labels, ...customItems].join(', ')
}

// venueHasMusic: igual que listMusicaFiestaBlockQuestions, lo resuelve quien llama (eventVenueServices.ts).
export function buildMusicaFiestaDecisionSummary(decisions: EventDecision[], venueHasMusic: boolean): DecisionSummary {
  const taken: DecisionSummaryItem[] = []
  const pending: DecisionSummaryItem[] = []
  for (const q of listMusicaFiestaBlockQuestions(decisions, venueHasMusic)) {
    if (q.questionKey === MUSICA_EXTRA_CONFIRM_QUESTION_KEY) {
      if (q.status !== 'decidida') {
        pending.push({ key: q.questionKey, text: 'Música', statusLabel: 'Todavía no lo sabemos' })
        continue
      }
      const choice = choiceOf(decisions, q.questionKey)
      taken.push({ key: q.questionKey, text: 'Música', statusLabel: choice === 'si' ? 'Incluida + algo más' : 'Incluida en el lugar' })
      continue
    }
    if (q.questionKey === MUSICA_QUESTION_KEY) {
      if (q.status !== 'decidida') {
        pending.push({ key: q.questionKey, text: 'Música', statusLabel: 'Todavía no lo sabemos' })
        continue
      }
      const answer = decisions.find((d) => d.questionKey === q.questionKey)?.answer as unknown as MusicaAnswer | undefined
      const statusLabel =
        answer?.choice === 'sin_musica' ? 'Sin música' : answer?.choice === 'seleccionar' ? labelsForSummary(MUSICA_CATALOG, answer.selected, answer.customItems) || 'Sin música' : 'Decidido'
      taken.push({ key: q.questionKey, text: 'Música', statusLabel })
      continue
    }
    if (q.questionKey === ANIMACION_QUESTION_KEY) {
      if (q.status !== 'decidida') {
        pending.push({ key: q.questionKey, text: 'Animación', statusLabel: 'Todavía no lo sabemos' })
        continue
      }
      const answer = decisions.find((d) => d.questionKey === q.questionKey)?.answer as unknown as AnimacionAnswer | undefined
      const statusLabel = answer?.choice === 'no' ? 'No' : answer?.choice === 'si' ? labelsForSummary(ANIMACION_CATALOG, answer.selected, answer.customItems) || 'Sí' : 'Decidido'
      taken.push({ key: q.questionKey, text: 'Animación', statusLabel })
      continue
    }
    pending.push({ key: q.questionKey, text: pendingText(q.label) })
  }
  return { taken, pending }
}

// ---------------------------------------------------------------------
// "📷 Fotos y recuerdos" (octavo bloque, tanda del configurador de boda)
// ---------------------------------------------------------------------
const COBERTURA_FOTOS_SHORT: Record<string, string> = {
  sin_cobertura: 'Sin cobertura organizada',
}
const SESION_FOTOS_SHORT: Record<string, string> = { preboda: 'Preboda', postboda: 'Postboda', ambas: 'Preboda y postboda', no: 'No' }
const VIDEO_SHORT: Record<string, string> = { profesional: 'Videógrafo/a profesional', familiares_amigos: 'Familiares o amigos', nuestra_cuenta: 'Por nuestra cuenta', no: 'No' }

export function buildFotosRecuerdosDecisionSummary(decisions: EventDecision[]): DecisionSummary {
  const taken: DecisionSummaryItem[] = []
  const pending: DecisionSummaryItem[] = []
  for (const q of listFotosRecuerdosBlockQuestions(decisions)) {
    const choice = choiceOf(decisions, q.questionKey)
    if (q.status !== 'decidida' || (choice !== null && PENDING_CHOICES.has(choice))) {
      const text = q.questionKey === COBERTURA_FOTOS_QUESTION_KEY ? 'Fotos del día' : q.questionKey === SESION_FOTOS_QUESTION_KEY ? 'Sesión aparte' : 'Vídeo'
      pending.push({ key: q.questionKey, text, statusLabel: 'Todavía no lo sabemos' })
      continue
    }
    if (q.questionKey === COBERTURA_FOTOS_QUESTION_KEY) {
      const answer = normalizeCoberturaFotosAnswer(decisions.find((d) => d.questionKey === q.questionKey)?.answer)
      const statusLabel =
        (choice && COBERTURA_FOTOS_SHORT[choice]) || (answer?.choice === 'seleccionar' ? labelsForSummary(COBERTURA_FOTOS_CATALOG, answer.selected, []) || 'Decidido' : 'Decidido')
      taken.push({ key: q.questionKey, text: 'Fotos del día', statusLabel })
    } else if (q.questionKey === SESION_FOTOS_QUESTION_KEY) {
      const answer = decisions.find((d) => d.questionKey === q.questionKey)?.answer as unknown as SesionFotosAnswer | undefined
      taken.push({ key: q.questionKey, text: 'Sesión aparte', statusLabel: (choice && SESION_FOTOS_SHORT[choice]) || (answer ? 'Sí' : 'Decidido') })
    } else if (q.questionKey === VIDEO_QUESTION_KEY) {
      taken.push({ key: q.questionKey, text: 'Vídeo', statusLabel: (choice && VIDEO_SHORT[choice]) || 'Decidido' })
    }
  }
  return { taken, pending }
}

// ---------------------------------------------------------------------
// "🌿 Otros y decoración" (noveno y último bloque nuevo, tanda del configurador de boda)
// ---------------------------------------------------------------------
const DECORACION_ORGANIZACION_SHORT: Record<string, string> = { contrataremos: 'La contrataremos', nosotros: 'La haremos nosotros', combinacion: 'Combinación' }

// venueHasDecoracion: igual criterio que buildMusicaFiestaDecisionSummary con venueHasMusic.
export function buildOtrosDecoracionDecisionSummary(decisions: EventDecision[], venueHasDecoracion: boolean): DecisionSummary {
  const taken: DecisionSummaryItem[] = []
  const pending: DecisionSummaryItem[] = []
  for (const q of listOtrosDecoracionBlockQuestions(decisions, venueHasDecoracion)) {
    if (q.questionKey === DECORACION_EXTRA_CONFIRM_QUESTION_KEY) {
      if (q.status !== 'decidida') {
        pending.push({ key: q.questionKey, text: 'Decoración', statusLabel: 'Todavía no lo sabemos' })
        continue
      }
      const choice = choiceOf(decisions, q.questionKey)
      taken.push({ key: q.questionKey, text: 'Decoración', statusLabel: choice === 'si' ? 'Incluida + algo más' : 'Incluida en el lugar' })
      continue
    }
    if (q.questionKey === DECORACION_ORGANIZACION_QUESTION_KEY) {
      const choice = choiceOf(decisions, q.questionKey)
      if (q.status !== 'decidida' || (choice !== null && PENDING_CHOICES.has(choice))) {
        pending.push({ key: q.questionKey, text: 'Decoración', statusLabel: 'Todavía no lo sabemos' })
        continue
      }
      taken.push({ key: q.questionKey, text: 'Decoración', statusLabel: (choice && DECORACION_ORGANIZACION_SHORT[choice]) || 'Decidido' })
      continue
    }
    if (q.questionKey === DECORACION_ZONAS_QUESTION_KEY) {
      const answer = decisions.find((d) => d.questionKey === q.questionKey)?.answer as unknown as DecoracionZonasAnswer | undefined
      const statusLabel = answer ? labelsForSummary(DECORACION_ZONAS_CATALOG, answer.selected, answer.customItems) || 'Ninguna' : 'Ninguna'
      taken.push({ key: q.questionKey, text: 'Zonas a decorar', statusLabel })
    }
  }
  return { taken, pending }
}

// ---------------------------------------------------------------------
// "🎭 Personas especiales" / "👪 Familiares" (Fase 2, plan de pendientes)
// ---------------------------------------------------------------------
// Tanda "Resúmenes de decisiones compactos" (sustituye al antiguo ESPECIAL_TAKEN_TEXT de frases largas:
// "No habrá regalos para personas especiales"/"Habrá personas con un papel especial" — mismo criterio de
// "mínimo texto posible" pedido explícitamente, ahora con el estado real en vez de una frase fija).
//
// Texto corto de pregunta ("Vestimenta" en vez de "Vestimenta
// coordinada") SOLO para la fila del resumen; la pregunta real, dentro del bloque, conserva su etiqueta
// larga de siempre (no se toca listEspecialBlockQuestions).
const ESPECIAL_SHORT_LABEL: Record<string, string> = {
  [ESPECIAL_VESTIMENTA_QUESTION_KEY]: 'Vestimenta',
  [ESPECIAL_COMPLEMENTOS_QUESTION_KEY]: 'Complementos',
  [ESPECIAL_REGALOS_QUESTION_KEY]: 'Regalos',
}

const GRUPO_ALCANCE_SHORT_LABEL: Record<string, string> = {
  todos: 'Todos',
  algunos: 'Algunos',
  ninguno: 'Ninguno',
  todavia_no_lo_sabemos: 'Todavía no lo sabemos',
}

export function buildEspecialDecisionSummary(decisions: EventDecision[], peopleCount: number): DecisionSummary {
  const taken: DecisionSummaryItem[] = []
  const pending: DecisionSummaryItem[] = []
  for (const q of listEspecialBlockQuestions(decisions, peopleCount)) {
    const choice = choiceOf(decisions, q.questionKey)
    // Fase 1 (Personas especiales): "¿Habrá...?" se resume como "Personas especiales · N" (o "· Sí" si
    // todavía no hay nadie añadido — nunca se inventa un número) / "· No". El resto de preguntas de este
    // bloque comparten las mismas 4 respuestas (todos/algunos/ninguno/todavía no lo sabemos): "todavía no
    // lo sabemos" se trata como POR DECIDIR (no es una decisión tomada) pero, a diferencia de una pregunta
    // nunca respondida, muestra su propio estado con fidelidad en vez del genérico "Decidir: …".
    if (q.questionKey === ESPECIAL_HAY_QUESTION_KEY) {
      if (q.status !== 'decidida' || choice === null) {
        pending.push({ key: q.questionKey, text: pendingText(q.label) })
        continue
      }
      taken.push({ key: q.questionKey, text: 'Personas especiales', statusLabel: choice === 'si' ? (peopleCount > 0 ? String(peopleCount) : 'Sí') : 'No' })
      continue
    }
    const shortLabel = ESPECIAL_SHORT_LABEL[q.questionKey] ?? q.label.replace(/^¿|\?$/g, '')
    if (choice === 'todavia_no_lo_sabemos') {
      pending.push({ key: q.questionKey, text: shortLabel, statusLabel: GRUPO_ALCANCE_SHORT_LABEL.todavia_no_lo_sabemos })
      continue
    }
    if (q.status !== 'decidida' || choice === null || PENDING_CHOICES.has(choice)) {
      pending.push({ key: q.questionKey, text: pendingText(q.label) })
      continue
    }
    taken.push({ key: q.questionKey, text: shortLabel, statusLabel: GRUPO_ALCANCE_SHORT_LABEL[choice] })
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
