// Fase 4 (Eventos → "✨ Cómo queréis que sea vuestra boda" → "👥 Invitados e invitaciones") — mismo motor
// de decisiones que "La pareja" (src/domain/eventPairDecisions.ts), reutilizado tal cual: DesiredPairGeneration,
// reconcilePairGeneration, isTaskUntouched/isBudgetItemUntouched, describeEffects y el propio CustomResolution
// (¿qué es? / ¿qué hay que hacer? / ¿tendrá coste?) no se reimplementan aquí, se importan directamente — es
// exactamente la generalización que pedía la auditoría, sin tocar ni una línea del motor de "La pareja".
//
// "Todavía no lo sabemos" sigue siendo una respuesta válida (⏳ Por decidir), nunca la ausencia de fila; una
// opción personalizada nunca se interpreta por el texto libre que contiene (misma regla que "La pareja").
import type { CustomAction, CustomHasCost, CustomResolution, DesiredPairGeneration } from '@/domain/eventPairDecisions'
import { decisionStatus, type DecisionStatus } from '@/domain/eventPairDecisions'
import type { EventDecision } from '@/domain/types'

const NONE: DesiredPairGeneration = { taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false }
const RESOLVED: DesiredPairGeneration = { taskTitle: null, budgetCategory: null, providerCategory: null, resolved: true }

function fromCustom(custom: CustomResolution | undefined, taskTitle: (label: string) => string, budgetCategory: (label: string) => string): DesiredPairGeneration {
  if (!custom) return NONE
  if (custom.action === 'resuelto') return RESOLVED
  if (custom.action === 'todavia_no_lo_sabemos') return NONE
  if (custom.action === 'preparar') return { taskTitle: taskTitle(custom.label), budgetCategory: null, providerCategory: null, resolved: false }
  return { taskTitle: taskTitle(custom.label), budgetCategory: custom.hasCost === 'si' ? budgetCategory(custom.label) : null, providerCategory: null, resolved: false }
}

export const GUESTS_LISTA_QUESTION_KEY = 'invitados.lista'
export const GUESTS_MENU_QUESTION_KEY = 'invitados.menu_invitacion'
export const GUESTS_MOMENTOS_QUESTION_KEY = 'invitados.momentos'
export const GUESTS_NINOS_QUESTION_KEY = 'invitados.ninos'
export const GUESTS_NINOS_NECESIDADES_QUESTION_KEY = 'invitados.ninos.necesidades'
export const GUESTS_INVITACION_QUESTION_KEY = 'invitados.invitacion'
export function guestsNinosNecesidadItemKey(itemKey: NinosNecesidadItemKey): string {
  return `invitados.ninos.necesidad.${itemKey}`
}

// ---------------------------------------------------------------------
// 1. Lista de invitados
// ---------------------------------------------------------------------
export type ListaInvitadosChoice = 'ya_la_tenemos' | 'tenemos_que_prepararla' | 'otro' | 'todavia_no_lo_sabemos'
export interface ListaInvitadosAnswer {
  choice: ListaInvitadosChoice
  custom?: CustomResolution
}

// "Ya la tenemos" es RESOLVED, no NONE: si antes se había respondido "tenemos que prepararla" (lo que
// generó un Preparativo), pasar a "ya la tenemos" debe completarlo y mandarlo a Historial — nunca
// borrarlo (resuelto ≠ cancelado, misma regla ya validada en "La pareja"). Sin Preparativo previo, RESOLVED
// con existingTask=undefined no genera ninguna acción (ver reconcilePairGeneration), así que es seguro
// aunque sea la primera respuesta.
export function desiredForListaInvitados(answer: ListaInvitadosAnswer): DesiredPairGeneration {
  if (answer.choice === 'todavia_no_lo_sabemos') return NONE
  if (answer.choice === 'ya_la_tenemos') return RESOLVED
  if (answer.choice === 'tenemos_que_prepararla') return { taskTitle: 'Preparar lista de invitados', budgetCategory: null, providerCategory: null, resolved: false }
  return fromCustom(answer.custom, (label) => `Lista de invitados: ${label}`, (label) => `Lista de invitados: ${label}`)
}

// ---------------------------------------------------------------------
// 1b. Menú en la invitación — nunca genera Preparativo/Presupuesto por sí sola (ninguna rama lo hace,
// "otro" incluido se trata igual que el resto de "otro" de este bloque: solo sigue las reglas normales de
// CustomResolution, sin inferir nada del texto libre). Esta pregunta solo guarda SI se va a recoger la
// elección de menú en la invitación — responder "Sí" no obliga a definir las opciones de menú ahora mismo:
// esa definición real vive en la futura fase "Comida y celebración" (event_menu_options, migración 0189).
// El RSVP público (event-rsvp) es quien de verdad conecta las dos cosas: cuando esta decisión está en
// "sí" Y ya existen opciones de menú para el evento, cada invitado puede elegir la suya; si no hay
// opciones todavía, el RSVP no bloquea ni inventa nada (mismo criterio que el resto del módulo).
// ---------------------------------------------------------------------
export type MenuInvitacionChoice = 'si' | 'no' | 'otro' | 'todavia_no_lo_sabemos'
export interface MenuInvitacionAnswer {
  choice: MenuInvitacionChoice
  custom?: CustomResolution
}

export function desiredForMenuInvitacion(answer: MenuInvitacionAnswer): DesiredPairGeneration {
  if (answer.choice === 'si' || answer.choice === 'no' || answer.choice === 'todavia_no_lo_sabemos') return NONE
  return fromCustom(answer.custom, (label) => `Menú en la invitación: ${label}`, (label) => `Menú en la invitación: ${label}`)
}

// ---------------------------------------------------------------------
// 2. Momentos — nunca genera Preparativo/Presupuesto; solo guarda el ENFOQUE (todos/depende/pendiente).
// La asignación real sigue viviendo en event_guest_moments (setGuestMoments), nunca duplicada aquí dentro
// de la propia respuesta — exactamente la separación que pedía la petición ("event_decisions guarda
// decisión/configuración; event_guest_moments guarda asignación real").
// ---------------------------------------------------------------------
export type MomentosChoice = 'todos_a_todos' | 'depende' | 'otro' | 'todavia_no_lo_sabemos'
export interface MomentosAnswer {
  choice: MomentosChoice
  custom?: CustomResolution
}

// ---------------------------------------------------------------------
// 3. Niños — pregunta de primer nivel (¿vendrán niños?) + necesidades reveladas solo si "sí", mismo
// patrón de revelado único que Complementos en "La pareja" (nunca aparecen antes de responder).
// ---------------------------------------------------------------------
export type NinosChoice = 'si' | 'no' | 'otro' | 'todavia_no_lo_sabemos'
export interface NinosAnswer {
  choice: NinosChoice
  custom?: CustomResolution
}

export type NinosNecesidadesChoice = 'preparar' | 'no_necesitamos' | 'todavia_no_lo_sabemos'
export interface NinosNecesidadesAnswer {
  choice: NinosNecesidadesChoice
  selected: string[]
  customItems: string[]
}

export const NINOS_NECESIDADES_OPTIONS = ['Menú infantil', 'Animación / juegos', 'Zona o mesa para niños', 'Monitor'] as const

// Solo estos dos implican de verdad buscar/contratar algo — el resto (Menú infantil, Zona o mesa) se
// guarda como necesidad señalada para que una fase futura (Menú, Distribución) la consuma, pero no genera
// ningún Preparativo por sí sola todavía (petición real: "NO crear un sistema paralelo de menú aquí" /
// "sin crear automáticamente una tarea innecesaria").
export type NinosNecesidadItemKey = 'animacion' | 'monitor'
export const NINOS_NECESIDAD_ACCIONABLE: Record<NinosNecesidadItemKey, { label: string; providerCategory: string }> = {
  animacion: { label: 'Animación / juegos', providerCategory: 'Animación infantil' },
  monitor: { label: 'Monitor', providerCategory: 'Monitor infantil' },
}

// La propia marca (seleccionado/no) YA es la decisión de "hay que buscarlo/contratarlo" — a diferencia de
// Vestuario/Floral no existe aquí un "ya lo tenemos" con sentido (un animador o un monitor no es algo que
// ya se tenga de antes), así que un único nivel por ítem es fiel a la petición, no una simplificación que
// esconda información: "si hay que buscar/contratar" ya es exactamente la condición de estar marcado.
export function desiredForNinosNecesidadItem(selected: boolean, item: NinosNecesidadItemKey): DesiredPairGeneration {
  if (!selected) return NONE
  const meta = NINOS_NECESIDAD_ACCIONABLE[item]
  return { taskTitle: `Buscar/contratar: ${meta.label.toLowerCase()}`, budgetCategory: meta.label, providerCategory: meta.providerCategory, resolved: false }
}

// ---------------------------------------------------------------------
// 4. Invitación — "con_pepa" genera ÚNICAMENTE "Preparar invitación". "Enviar las invitaciones" NO se
// genera aquí a propósito: ya existe como Preparativo automático de siempre (TASK_TEMPLATES, creado al
// crear el evento, para TODOS los tipos de evento, independientemente de esta respuesta) — generarlo
// también desde esta decisión duplicaría exactamente lo que la petición pedía comprobar. "externa" no
// fuerza nada (no obliga a usar el editor de PEPA); "Enviar invitaciones" sigue cubierta por el
// Preparativo ya existente en cualquiera de los dos casos.
export type InvitacionChoice = 'con_pepa' | 'externa' | 'otro' | 'todavia_no_lo_sabemos'
export interface InvitacionAnswer {
  choice: InvitacionChoice
  custom?: CustomResolution
}

export function desiredForInvitacion(answer: InvitacionAnswer): DesiredPairGeneration {
  if (answer.choice === 'todavia_no_lo_sabemos') return NONE
  if (answer.choice === 'externa') return NONE
  if (answer.choice === 'con_pepa') return { taskTitle: 'Preparar invitación', budgetCategory: null, providerCategory: null, resolved: false }
  return fromCustom(answer.custom, (label) => `Invitación: ${label}`, (label) => `Invitación: ${label}`)
}

// ---------------------------------------------------------------------
// Estado del bloque — mismo modelo que listPairBlockQuestions/summarizePairBlock: revelado progresivo
// real (una pregunta condicional oculta no cuenta como "sin empezar" hasta que es relevante).
// ---------------------------------------------------------------------
export interface GuestsQuestionInfo {
  questionKey: string
  blockKey: 'invitados'
  label: string
  status: DecisionStatus
}

function findDecision(decisions: EventDecision[], questionKey: string): EventDecision | undefined {
  return decisions.find((d) => d.questionKey === questionKey)
}

// momentsCount = número de event_moments REALES (nunca los sintéticos de ceremonia/celebración heredada,
// que no tienen fila real en event_moments y por tanto no se pueden asignar vía setGuestMoments) — con
// menos de 2 no tiene sentido preguntar "¿todos a todos o depende?" (petición real: "si solo existe un
// momento relevante, no mostrar una pregunta absurda").
export function listGuestsBlockQuestions(decisions: EventDecision[], momentsCount: number): GuestsQuestionInfo[] {
  const result: GuestsQuestionInfo[] = []
  result.push({ questionKey: GUESTS_LISTA_QUESTION_KEY, blockKey: 'invitados', label: 'Lista de invitados', status: decisionStatus(findDecision(decisions, GUESTS_LISTA_QUESTION_KEY)) })
  result.push({ questionKey: GUESTS_MENU_QUESTION_KEY, blockKey: 'invitados', label: '¿Elegirán menú en la invitación?', status: decisionStatus(findDecision(decisions, GUESTS_MENU_QUESTION_KEY)) })

  if (momentsCount >= 2) {
    result.push({
      questionKey: GUESTS_MOMENTOS_QUESTION_KEY,
      blockKey: 'invitados',
      label: '¿Todos los invitados van a todos los momentos?',
      status: decisionStatus(findDecision(decisions, GUESTS_MOMENTOS_QUESTION_KEY)),
    })
  }

  const ninosDecision = findDecision(decisions, GUESTS_NINOS_QUESTION_KEY)
  result.push({ questionKey: GUESTS_NINOS_QUESTION_KEY, blockKey: 'invitados', label: '¿Vendrán niños?', status: decisionStatus(ninosDecision) })
  if (ninosDecision) {
    const ninos = ninosDecision.answer as unknown as NinosAnswer
    if (ninos.choice === 'si') {
      result.push({
        questionKey: GUESTS_NINOS_NECESIDADES_QUESTION_KEY,
        blockKey: 'invitados',
        label: 'Necesidades infantiles',
        status: decisionStatus(findDecision(decisions, GUESTS_NINOS_NECESIDADES_QUESTION_KEY)),
      })
    }
  }

  result.push({ questionKey: GUESTS_INVITACION_QUESTION_KEY, blockKey: 'invitados', label: '¿Cómo gestionáis la invitación?', status: decisionStatus(findDecision(decisions, GUESTS_INVITACION_QUESTION_KEY)) })
  return result
}

export function summarizeGuestsBlock(decisions: EventDecision[], momentsCount: number): string {
  const questions = listGuestsBlockQuestions(decisions, momentsCount)
  const decided = questions.filter((q) => q.status === 'decidida').length
  const pending = questions.filter((q) => q.status === 'por_decidir').length
  const notStarted = questions.filter((q) => q.status === 'sin_empezar').length
  const parts: string[] = []
  if (decided > 0) parts.push(`✓ ${decided} decidida${decided === 1 ? '' : 's'}`)
  if (pending > 0) parts.push(`⏳ ${pending} por decidir`)
  if (notStarted > 0) parts.push(`${notStarted} sin empezar`)
  return parts.join(' · ')
}

export type { CustomAction, CustomHasCost, CustomResolution, DesiredPairGeneration }
