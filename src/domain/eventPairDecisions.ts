// Fase 3 (Eventos → "✨ Cómo queréis que sea vuestra boda" → "👰🤵 La pareja") — motor de decisiones puro
// del segundo bloque del configurador. Sin Supabase aquí: toda la generación/reconciliación es
// determinista y testeable; src/data/events.ts solo ejecuta lo que estas funciones deciden.
//
// Principio aprobado: "todavía no lo sabemos" es una respuesta válida (⏳ Por decidir), nunca la ausencia
// de fila — y una pregunta nunca respondida es "Sin empezar", no "por decidir". Ninguna respuesta
// "todavía no lo sabemos" genera nunca Preparativo/Presupuesto/Proveedor. Una opción personalizada
// ("otro") nunca se interpreta por el texto libre que contiene — siempre usa el motor explícito de
// CustomResolution (qué hay que hacer / si tendrá coste), nunca se adivina a partir de la etiqueta.
import type { EventBudgetItem, EventDecision, EventTask, FamilyEvent } from '@/domain/types'

export type DecisionStatus = 'sin_empezar' | 'decidida' | 'por_decidir'

export type CustomAction = 'preparar' | 'buscar_contratar' | 'resuelto' | 'todavia_no_lo_sabemos' | 'otro'
export type CustomHasCost = 'si' | 'no' | 'todavia_no_lo_sabemos'

export interface CustomResolution {
  label: string
  action: CustomAction
  hasCost: CustomHasCost | null
}

export type VestuarioChoice = 'vestido' | 'traje' | 'otro' | 'ya_lo_tenemos' | 'todavia_no_lo_sabemos'
export interface VestuarioAnswer {
  choice: VestuarioChoice
  custom?: CustomResolution
}

export type PeluqueriaNecesidadChoice = 'peluqueria' | 'maquillaje' | 'ambos' | 'otro' | 'no' | 'todavia_no_lo_sabemos'
export interface PeluqueriaNecesidadAnswer {
  choice: PeluqueriaNecesidadChoice
  customLabel?: string
}

export type PeluqueriaResolucionChoice = 'ya_lo_tenemos' | 'buscando' | 'todavia_no_lo_sabemos'
export interface PeluqueriaResolucionAnswer {
  choice: PeluqueriaResolucionChoice
}

export type ComplementosChoice = 'preparar' | 'no_necesitamos' | 'todavia_no_lo_sabemos'
export interface ComplementosAnswer {
  choice: ComplementosChoice
  selected: string[]
  customItems: string[]
}

export type FloralItemKey = 'ramo' | 'prendido'
export type FloralChoice = 'preparamos' | 'floristeria' | 'ya_lo_tenemos' | 'otro' | 'todavia_no_lo_sabemos'
export interface FloralAnswer {
  choice: FloralChoice
  custom?: CustomResolution
}

export type AlianzasChoice = 'elegir' | 'comprar_encargar' | 'ya_las_tenemos' | 'no_tendremos' | 'otro' | 'todavia_no_lo_sabemos'
export interface AlianzasAnswer {
  choice: AlianzasChoice
  custom?: CustomResolution
}

export type DetalleEspecialChoice = 'regalo' | 'carta' | 'sorpresa' | 'otro' | 'no' | 'todavia_no_lo_sabemos'
export interface DetalleEspecialAnswer {
  choice: DetalleEspecialChoice
  custom?: CustomResolution
}

export const COMPLEMENTOS_OPTIONS = ['Zapatos', 'Joyas', 'Corbata/pajarita', 'Gemelos'] as const

export const FLORAL_ITEMS: { key: FloralItemKey; label: string; icon: string }[] = [
  { key: 'ramo', label: 'Ramo', icon: '💐' },
  { key: 'prendido', label: 'Flor de solapa / prendido', icon: '🌸' },
]

// Categorías internas del motor — solo para poder sugerir/reutilizar proveedores ya dados de alta, nunca
// para restringir el campo "Tipo" libre que la familia puede escribir a mano en Proveedores.
export const DECISION_PROVIDER_CATEGORIES: Record<string, string> = {
  floristeria: 'Floristería',
  peluqueria_maquillaje: 'Peluquería/Maquillaje',
}

export const PARTNER_SLOTS = ['partner1', 'partner2'] as const
export type PartnerSlot = (typeof PARTNER_SLOTS)[number]

// El rol solo adapta sugerencias/textos (p. ej. qué chip de vestuario se destaca primero) — nunca
// restringe las opciones disponibles ni sustituye a sexo/género.
export type PartnerRole = 'novia' | 'novio' | 'otro'
export const PARTNER_ROLE_OPTIONS: { value: PartnerRole; label: string }[] = [
  { value: 'novia', label: 'Novia' },
  { value: 'novio', label: 'Novio' },
  { value: 'otro', label: 'Otro' },
]

export function partnerName(event: Pick<FamilyEvent, 'details'>, slot: PartnerSlot): string {
  const details = event.details as { partner1Name?: string | null; partner2Name?: string | null }
  const raw = slot === 'partner1' ? details.partner1Name : details.partner2Name
  const trimmed = raw?.trim()
  return trimmed ? trimmed : slot === 'partner1' ? 'Pareja 1' : 'Pareja 2'
}

export function pairQuestionKey(slot: PartnerSlot, suffix: string): string {
  return `pareja.${slot}.${suffix}`
}

export const ALIANZAS_QUESTION_KEY = 'pareja.alianzas'
export const DETALLE_ESPECIAL_QUESTION_KEY = 'pareja.detalle_especial'

function findDecision(decisions: EventDecision[], questionKey: string): EventDecision | undefined {
  return decisions.find((d) => d.questionKey === questionKey)
}

// Estado de UNA pregunta: "sin fila" = Sin empezar, choice === 'todavia_no_lo_sabemos' (en el nivel
// principal o dentro de una resolución "otro") = ⏳ Por decidir, cualquier otra respuesta = Decidida.
export function decisionStatus(decision: EventDecision | undefined): DecisionStatus {
  if (!decision) return 'sin_empezar'
  const answer = decision.answer as { choice?: string; custom?: { action?: string } }
  if (answer.choice === 'todavia_no_lo_sabemos') return 'por_decidir'
  if (answer.choice === 'otro' && answer.custom?.action === 'todavia_no_lo_sabemos') return 'por_decidir'
  return 'decidida'
}

export interface PairQuestionInfo {
  questionKey: string
  blockKey: 'pareja'
  label: string
  status: DecisionStatus
}

// Revelado progresivo real: una pregunta de segundo nivel (resolución de peluquería/maquillaje, resolución
// de un elemento floral) solo CUENTA como pregunta relevante cuando la de primer nivel ya la hace
// pertinente — antes de eso no es "Sin empezar", simplemente no existe todavía como pregunta.
export function listPairBlockQuestions(event: FamilyEvent, decisions: EventDecision[]): PairQuestionInfo[] {
  if (event.type !== 'boda') return []
  const result: PairQuestionInfo[] = []
  for (const slot of PARTNER_SLOTS) {
    const name = partnerName(event, slot)

    const vestuarioKey = pairQuestionKey(slot, 'vestuario')
    result.push({ questionKey: vestuarioKey, blockKey: 'pareja', label: `Vestuario de ${name}`, status: decisionStatus(findDecision(decisions, vestuarioKey)) })

    const necesidadKey = pairQuestionKey(slot, 'peluqueria_maquillaje')
    const necesidadDecision = findDecision(decisions, necesidadKey)
    result.push({ questionKey: necesidadKey, blockKey: 'pareja', label: `Peluquería y maquillaje de ${name}`, status: decisionStatus(necesidadDecision) })
    if (necesidadDecision) {
      const necesidad = necesidadDecision.answer as unknown as PeluqueriaNecesidadAnswer
      if (necesidad.choice !== 'no' && necesidad.choice !== 'todavia_no_lo_sabemos') {
        const resolucionKey = pairQuestionKey(slot, 'peluqueria_maquillaje.resolucion')
        result.push({
          questionKey: resolucionKey,
          blockKey: 'pareja',
          label: `Cómo resolvéis peluquería/maquillaje de ${name}`,
          status: decisionStatus(findDecision(decisions, resolucionKey)),
        })
      }
    }

    const complementosKey = pairQuestionKey(slot, 'complementos')
    result.push({ questionKey: complementosKey, blockKey: 'pareja', label: `Complementos de ${name}`, status: decisionStatus(findDecision(decisions, complementosKey)) })

    for (const item of FLORAL_ITEMS) {
      const floralKey = pairQuestionKey(slot, `floral.${item.key}`)
      const d = findDecision(decisions, floralKey)
      // Sin marcar el ítem no existe fila — y sin fila no cuenta como pregunta pendiente (sería contar
      // algo que la familia ni siquiera ha abierto todavía).
      if (d) result.push({ questionKey: floralKey, blockKey: 'pareja', label: `${item.label} de ${name}`, status: decisionStatus(d) })
    }
    const customPrefix = pairQuestionKey(slot, 'floral.custom:')
    for (const d of decisions.filter((x) => x.questionKey.startsWith(customPrefix))) {
      result.push({ questionKey: d.questionKey, blockKey: 'pareja', label: `Complemento floral de ${name}`, status: decisionStatus(d) })
    }
  }
  result.push({ questionKey: ALIANZAS_QUESTION_KEY, blockKey: 'pareja', label: 'Alianzas', status: decisionStatus(findDecision(decisions, ALIANZAS_QUESTION_KEY)) })
  result.push({
    questionKey: DETALLE_ESPECIAL_QUESTION_KEY,
    blockKey: 'pareja',
    label: 'Detalle especial entre la pareja',
    status: decisionStatus(findDecision(decisions, DETALLE_ESPECIAL_QUESTION_KEY)),
  })
  return result
}

// Resumen del bloque — modelo reutilizable para el resto del configurador: cuenta decididas/por
// decidir/sin empezar entre las preguntas ACTUALMENTE relevantes (revelado progresivo incluido), omite
// cualquier contador en cero. Nunca un porcentaje global.
export function summarizePairBlock(event: FamilyEvent, decisions: EventDecision[]): string {
  const questions = listPairBlockQuestions(event, decisions)
  const decided = questions.filter((q) => q.status === 'decidida').length
  const pending = questions.filter((q) => q.status === 'por_decidir').length
  const notStarted = questions.filter((q) => q.status === 'sin_empezar').length
  const parts: string[] = []
  if (decided > 0) parts.push(`✓ ${decided} decidida${decided === 1 ? '' : 's'}`)
  if (pending > 0) parts.push(`⏳ ${pending} por decidir`)
  if (notStarted > 0) parts.push(`${notStarted} sin empezar`)
  return parts.join(' · ')
}

// ---------------------------------------------------------------------
// Generación — qué Preparativo/concepto de Presupuesto implica cada respuesta. Como mucho UNA tarea y UN
// concepto de presupuesto por decisión en todo este bloque (nunca una lista), lo que simplifica la
// reconciliación de más abajo a comparar un único título/categoría esperados contra lo ya existente.
// ---------------------------------------------------------------------

export interface DesiredPairGeneration {
  taskTitle: string | null
  budgetCategory: string | null
  // Categoría interna sugerida para relacionar un proveedor real cuando corresponda (no crea nada por
  // sí sola — ver §4: "Estamos buscando" nunca crea un proveedor ficticio).
  providerCategory: string | null
}

const NONE: DesiredPairGeneration = { taskTitle: null, budgetCategory: null, providerCategory: null }

function fromCustom(custom: CustomResolution | undefined, taskTitle: (label: string) => string, budgetCategory: (label: string) => string): DesiredPairGeneration {
  if (!custom) return NONE
  if (custom.action === 'resuelto' || custom.action === 'todavia_no_lo_sabemos') return NONE
  if (custom.action === 'preparar') return { taskTitle: taskTitle(custom.label), budgetCategory: null, providerCategory: null }
  // 'buscar_contratar' | 'otro' — nunca se infiere coste del texto: solo si hasCost === 'si' se genera presupuesto.
  return { taskTitle: taskTitle(custom.label), budgetCategory: custom.hasCost === 'si' ? budgetCategory(custom.label) : null, providerCategory: null }
}

export function desiredForVestuario(answer: VestuarioAnswer, name: string): DesiredPairGeneration {
  if (answer.choice === 'ya_lo_tenemos' || answer.choice === 'todavia_no_lo_sabemos') return NONE
  if (answer.choice === 'otro') return fromCustom(answer.custom, (label) => `Elegir ${label} de ${name}`, (label) => `${label} de ${name}`)
  const word = answer.choice === 'vestido' ? 'Vestido' : 'Traje'
  return { taskTitle: `Elegir ${word.toLowerCase()} de ${name}`, budgetCategory: `${word} de ${name}`, providerCategory: null }
}

export function desiredForPeluqueriaResolucion(necesidad: PeluqueriaNecesidadAnswer, resolucion: PeluqueriaResolucionAnswer | undefined, name: string): DesiredPairGeneration {
  if (necesidad.choice === 'no' || necesidad.choice === 'todavia_no_lo_sabemos') return NONE
  if (!resolucion || resolucion.choice === 'todavia_no_lo_sabemos' || resolucion.choice === 'ya_lo_tenemos') return NONE
  // 'buscando' — nunca crea el proveedor, solo la necesidad (§4/§19).
  return { taskTitle: `Buscar peluquería/maquillaje para ${name}`, budgetCategory: `Peluquería/maquillaje de ${name}`, providerCategory: DECISION_PROVIDER_CATEGORIES.peluqueria_maquillaje }
}

export function desiredForComplementos(answer: ComplementosAnswer, name: string): DesiredPairGeneration {
  if (answer.choice !== 'preparar') return NONE
  if (answer.selected.length === 0 && answer.customItems.length === 0) return NONE
  return { taskTitle: `Preparar complementos de ${name}`, budgetCategory: null, providerCategory: null }
}

export function desiredForFloral(answer: FloralAnswer, itemLabel: string, name: string): DesiredPairGeneration {
  if (answer.choice === 'ya_lo_tenemos' || answer.choice === 'todavia_no_lo_sabemos') return NONE
  if (answer.choice === 'preparamos') return { taskTitle: `Preparar ${itemLabel.toLowerCase()} de ${name}`, budgetCategory: null, providerCategory: null }
  if (answer.choice === 'floristeria') {
    return { taskTitle: `Encargar ${itemLabel.toLowerCase()} de ${name}`, budgetCategory: `${itemLabel} de ${name}`, providerCategory: DECISION_PROVIDER_CATEGORIES.floristeria }
  }
  // 'otro'
  return fromCustom(answer.custom, (label) => `Resolver ${label} de ${name}`, (label) => `${label} de ${name}`)
}

export function desiredForAlianzas(answer: AlianzasAnswer): DesiredPairGeneration {
  if (answer.choice === 'ya_las_tenemos' || answer.choice === 'no_tendremos' || answer.choice === 'todavia_no_lo_sabemos') return NONE
  if (answer.choice === 'elegir' || answer.choice === 'comprar_encargar') {
    return { taskTitle: 'Elegir/Encargar las alianzas', budgetCategory: 'Alianzas', providerCategory: null }
  }
  // 'otro'
  return fromCustom(answer.custom, (label) => `Alianzas: ${label}`, (label) => `Alianzas: ${label}`)
}

export function desiredForDetalleEspecial(answer: DetalleEspecialAnswer): DesiredPairGeneration {
  if (answer.choice === 'no' || answer.choice === 'todavia_no_lo_sabemos') return NONE
  if (answer.choice === 'otro') return fromCustom(answer.custom, (label) => `Preparar: ${label}`, (label) => label)
  const texto = answer.choice === 'regalo' ? 'un regalo' : answer.choice === 'carta' ? 'una carta' : 'una sorpresa'
  return { taskTitle: `Preparar ${texto} para el otro`, budgetCategory: null, providerCategory: null }
}

// ---------------------------------------------------------------------
// Reconciliación — nunca "borrar siempre" ni "nunca borrar": un elemento prístino (generado por el motor,
// sin ningún dato añadido por el usuario) que deja de estar implicado se retira de verdad; uno que ya
// tiene información real del usuario se conserva SIEMPRE, solo se desvincula (decision_id → null).
// ---------------------------------------------------------------------

// Prístina = el motor podría haberla creado tal cual sigue, sin que nadie le haya añadido nada encima.
// El título en sí NO forma parte de este chequeo (una tarea con el título exacto pero ya marcada hecha,
// con fecha, responsable o enlazada al Calendario ya NO es prístina) — ver corrección explícita: "no
// compruebes únicamente el título".
export function isTaskUntouched(task: Pick<EventTask, 'source' | 'done' | 'dueDate' | 'assignedMemberId' | 'calendarEventId'>): boolean {
  return task.source === 'auto' && !task.done && task.dueDate === null && task.assignedMemberId === null && task.calendarEventId === null
}

export function isBudgetItemUntouched(item: Pick<EventBudgetItem, 'plannedAmount'>): boolean {
  return item.plannedAmount === null
}

export type ReconcileAction =
  | { op: 'create_task'; title: string }
  | { op: 'update_task'; id: string; title: string }
  | { op: 'delete_task'; id: string }
  | { op: 'detach_task'; id: string }
  | { op: 'create_budget'; category: string }
  | { op: 'update_budget'; id: string; category: string }
  | { op: 'delete_budget'; id: string }
  | { op: 'detach_budget'; id: string }

export function reconcilePairGeneration(
  desired: DesiredPairGeneration,
  existingTask: EventTask | undefined,
  existingBudget: EventBudgetItem | undefined,
): ReconcileAction[] {
  const actions: ReconcileAction[] = []

  if (desired.taskTitle) {
    if (!existingTask) actions.push({ op: 'create_task', title: desired.taskTitle })
    else if (existingTask.title !== desired.taskTitle && isTaskUntouched(existingTask)) {
      actions.push({ op: 'update_task', id: existingTask.id, title: desired.taskTitle })
    }
    // Si el título difiere y la tarea ya no está intacta, se deja tal cual — no se sobrescribe algo que
    // la familia ya ha editado.
  } else if (existingTask) {
    if (isTaskUntouched(existingTask)) actions.push({ op: 'delete_task', id: existingTask.id })
    else actions.push({ op: 'detach_task', id: existingTask.id })
  }

  if (desired.budgetCategory) {
    if (!existingBudget) actions.push({ op: 'create_budget', category: desired.budgetCategory })
    else if (existingBudget.category !== desired.budgetCategory && isBudgetItemUntouched(existingBudget)) {
      actions.push({ op: 'update_budget', id: existingBudget.id, category: desired.budgetCategory })
    }
  } else if (existingBudget) {
    if (isBudgetItemUntouched(existingBudget)) actions.push({ op: 'delete_budget', id: existingBudget.id })
    else actions.push({ op: 'detach_budget', id: existingBudget.id })
  }

  return actions
}
