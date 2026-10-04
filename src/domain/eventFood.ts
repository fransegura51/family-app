// Eventos — "🍽️ Comida y bebida" (puro, sin Supabase): preguntas del bloque, cuáles son pertinentes en cada
// momento, qué trabajo implica cada respuesta y cómo se reconcilia. Mismo motor que "La pareja" /
// "Invitados" / "Momentos especiales" (event_decisions + DesiredPairGeneration + reconcilePairGeneration):
// NO hay un segundo motor.
//
// Filosofía: PEPA da estructura, conexiones y recordatorios, pero NO decide por la familia y NO es una
// Thermomix. Nunca inventa recetas, ingredientes, cantidades, raciones, proveedores, precios, necesidades,
// momentos ni decisiones; no deduce raciones del número de invitados ni adapta recetas. Tampoco repite lo
// que ya sabe (lugar y sus servicios, Invitados, menú infantil, elección de menú, Momentos especiales...):
// lo hereda y lo muestra como contexto, sin contarlo como pregunta nueva.
//
// Reglas del motor, sin cambios: "seleccionar" ≠ "resolver"; «todavía no lo sabemos» = pendiente (nunca
// genera nada ni cancela información a mano); resuelto ≠ cancelado (completa el Preparativo, no lo borra);
// presupuesto desconocido = null, nunca 0; ningún proveedor ficticio.
import { decisionStatus, type DecisionStatus, type DesiredPairGeneration } from '@/domain/eventPairDecisions'
import { effectiveWantsMenu, GUESTS_NINOS_NECESIDADES_QUESTION_KEY, GUESTS_PREGUNTAS_QUESTION_KEY, type InvitadosPreguntasAnswer, type NinosNecesidadesAnswer } from '@/domain/eventGuestDecisions'
import { MOMENTOS_ESPECIALES_QUESTION_KEY, type MomentosEspecialesAnswer } from '@/domain/eventSpecialMoments'
import { resolveVenueCase, venueIncludesService, type VenueCase } from '@/domain/eventVenueServices'
import { needsReviewApplies, type FoodNeedsState } from '@/domain/eventDietaryNeeds'
import type { CustomResolution } from '@/domain/eventPairDecisions'
import type { EventDayPlanItem, EventDecision, EventMenuItem, EventServiceId, EventTask, EventBudgetItem, EventType, FamilyEvent } from '@/domain/types'
import { generateAutoTasks, type FoodNeedsAlertInput } from '@/domain/events'
import { foodMomentKeyFromSource, foodMomentSourceKey } from '@/domain/eventDayPlan'

export const FOOD_BLOCK_KEY = 'comida'

export const FOOD_QUIEN_KEY = 'comida.quien'
export const FOOD_CONTRATACION_KEY = 'comida.contratacion'
export const FOOD_MOMENTOS_KEY = 'comida.momentos'
export const FOOD_MENU_ESTADO_KEY = 'comida.menu_estado'
export const FOOD_MENU_GUARDAR_KEY = 'comida.menu_guardar'
export const FOOD_MENU_INFANTIL_KEY = 'comida.menu_infantil'
export const FOOD_MENU_INFANTIL_GUARDAR_KEY = 'comida.menu_infantil_guardar'
export const FOOD_TARTA_KEY = 'comida.tarta'
export const FOOD_BEBIDAS_KEY = 'comida.bebidas'
export const FOOD_NECESIDADES_KEY = 'comida.necesidades_revisadas'

const NONE: DesiredPairGeneration = { taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false }
const RESOLVED: DesiredPairGeneration = { taskTitle: null, budgetCategory: null, providerCategory: null, resolved: true }

// Categorías internas para relacionar proveedores reales (nunca crean un proveedor ficticio).
export const FOOD_PROVIDER_CATEGORIES = {
  catering: 'Catering',
  restaurante: 'Restaurante',
  pasteleria: 'Pastelería',
  bebidas: 'Bebidas',
} as const

// ---------------------------------------------------------------------
// Respuestas
// ---------------------------------------------------------------------
export type QuienWay = 'catering' | 'restaurante' | 'nosotros'
export type QuienChoice = 'catering' | 'restaurante' | 'nosotros' | 'combinar' | 'no_habra' | 'todavia_no_lo_sabemos' | 'otro'
export interface QuienAnswer {
  choice: QuienChoice
  // Solo con 'combinar': qué vías conocen. Elegirlas NO crea ningún trabajo.
  combinar?: QuienWay[]
  customLabel?: string
}

export type ContratacionChoice = 'si' | 'buscando' | 'todavia_no_lo_sabemos' | 'otro'
export interface ContratacionAnswer {
  choice: ContratacionChoice
  customLabel?: string
}

export type MomentoComidaKey = 'aperitivo' | 'comida' | 'merienda' | 'cena' | 'recena'
export type MomentosComidaChoice = 'seleccionar' | 'todavia_no_lo_sabemos'
export interface MomentosComidaAnswer {
  choice: MomentosComidaChoice
  selected: MomentoComidaKey[]
  // «Otro»: solo se guarda, nunca llega al Plan del día ni se interpreta.
  customItems: string[]
}

export type MenuEstadoChoice = 'decidido' | 'por_decidir' | 'todavia_no_lo_sabemos'
export interface MenuEstadoAnswer {
  choice: MenuEstadoChoice
}

export type GuardarMenuChoice = 'si' | 'ahora_no'
export interface GuardarMenuAnswer {
  choice: GuardarMenuChoice
}

export type MenuInfantilChoice = 'incluido' | 'pedir' | 'nosotros' | 'otro' | 'todavia_no_lo_sabemos'
export interface MenuInfantilAnswer {
  choice: MenuInfantilChoice
  custom?: CustomResolution
}

export type TartaChoice = 'encargar' | 'nosotros' | 'resuelta' | 'no' | 'otro' | 'todavia_no_lo_sabemos'
export interface TartaAnswer {
  choice: TartaChoice
  custom?: CustomResolution
}

export type BebidasChoice = 'servicio_comida' | 'nosotros' | 'aparte' | 'otro' | 'todavia_no_lo_sabemos'
export interface BebidasAnswer {
  choice: BebidasChoice
  custom?: CustomResolution
}

export type NecesidadesChoice = 'si' | 'revisar' | 'todavia_no_lo_sabemos'
export interface NecesidadesAnswer {
  choice: NecesidadesChoice
}

function find(decisions: EventDecision[], key: string): EventDecision | undefined {
  return decisions.find((d) => d.questionKey === key)
}

function answerOf<T>(decisions: EventDecision[], key: string): T | undefined {
  return find(decisions, key)?.answer as T | undefined
}

// ---------------------------------------------------------------------
// Contexto compartido por todas las funciones del bloque
// ---------------------------------------------------------------------
type VenueFacts = Pick<FamilyEvent, 'venueType' | 'venueLabel' | 'venueAddress' | 'venueLatitude' | 'venueLongitude' | 'celebrationLocationLabel'> & Partial<Pick<FamilyEvent, 'includedServices'>>

// Comida y bebida CONSUME la información del primer bloque («Ceremonia y celebración» / «Celebración»): el
// caso de lugar y los servicios incluidos. Nunca los pregunta ni los guarda.
export interface FoodContext {
  venueCase: VenueCase
  decisions: EventDecision[]
  menuItems: Pick<EventMenuItem, 'category'>[]
  needs: FoodNeedsState | null
  // Respuesta histórica del alta antigua (events.included_services), adoptada como información existente.
  legacyIncluded: EventServiceId[] | null
}

export function buildFoodContext(
  event: VenueFacts,
  decisions: EventDecision[],
  menuItems: Pick<EventMenuItem, 'category'>[],
  needs: FoodNeedsState | null,
  hasMomentLocation = false,
): FoodContext {
  return { venueCase: resolveVenueCase(event, decisions, hasMomentLocation), decisions, menuItems, needs, legacyIncluded: event.includedServices ?? null }
}

export function venueIncludes(ctx: FoodContext, key: 'comida' | 'bebidas' | 'tarta'): boolean {
  return venueIncludesService(ctx.venueCase, ctx.decisions, key, ctx.legacyIncluded)
}

export function quienAnswer(ctx: FoodContext): QuienAnswer | undefined {
  return answerOf<QuienAnswer>(ctx.decisions, FOOD_QUIEN_KEY)
}

// Vías externas de comida (necesitan contratación) según «¿Quién se encargará?».
export function externalFoodKinds(quien: QuienAnswer | undefined): ('catering' | 'restaurante')[] {
  if (!quien) return []
  if (quien.choice === 'catering') return ['catering']
  if (quien.choice === 'restaurante') return ['restaurante']
  if (quien.choice === 'combinar') return (quien.combinar ?? []).filter((w): w is 'catering' | 'restaurante' => w === 'catering' || w === 'restaurante')
  return []
}

export function cooksThemselves(quien: QuienAnswer | undefined): boolean {
  if (!quien) return false
  return quien.choice === 'nosotros' || (quien.choice === 'combinar' && (quien.combinar ?? []).includes('nosotros'))
}

// «¿Quién se encargará de la comida?» solo se pregunta cuando el lugar NO incluye comida/menú (si la
// incluye, la respuesta ya se conoce). En casa, o sin servicio conocido, sí se pregunta.
export function quienApplies(ctx: FoodContext): boolean {
  return !venueIncludes(ctx, 'comida')
}

// ¿Va a haber comida? Verdadero si el lugar la incluye o si la familia ha respondido algo distinto de
// «No habrá comida». Sin respuesta y sin servicio de lugar: todavía no se sabe → no se piden más detalles.
export function foodWillExist(ctx: FoodContext): boolean {
  if (venueIncludes(ctx, 'comida')) return true
  const quien = quienAnswer(ctx)
  if (!quien) return false
  return quien.choice !== 'no_habra'
}

export function contratacionApplies(ctx: FoodContext): boolean {
  return quienApplies(ctx) && externalFoodKinds(quienAnswer(ctx)).length > 0
}

// «Menú infantil»: marcado ya en Invitados («Necesidades de los niños») — se hereda, no se vuelve a preguntar.
export function ninosNeedMenuInfantil(decisions: EventDecision[]): boolean {
  const a = answerOf<NinosNecesidadesAnswer>(decisions, GUESTS_NINOS_NECESIDADES_QUESTION_KEY)
  return a?.choice === 'preparar' && Array.isArray(a.selected) && a.selected.includes('Menú infantil')
}

// La elección de menú por los invitados se hereda de Invitados (compatible con filas antiguas sin wantsMenu).
export function guestsChooseMenu(decisions: EventDecision[]): boolean {
  return effectiveWantsMenu(answerOf<InvitadosPreguntasAnswer>(decisions, GUESTS_PREGUNTAS_QUESTION_KEY))
}

export function menuEstadoAnswer(ctx: FoodContext): MenuEstadoAnswer | undefined {
  return answerOf<MenuEstadoAnswer>(ctx.decisions, FOOD_MENU_ESTADO_KEY)
}

const INFANTIL_SECTION_NORM = 'menu infantil'
function hasInfantilItems(items: Pick<EventMenuItem, 'category'>[]): boolean {
  return items.some((i) => (i.category ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim() === INFANTIL_SECTION_NORM)
}

// ---------------------------------------------------------------------
// Preguntas pertinentes + contador del bloque
// ---------------------------------------------------------------------
export interface FoodQuestionInfo {
  questionKey: string
  label: string
  status: DecisionStatus
}

export function listFoodBlockQuestions(ctx: FoodContext): FoodQuestionInfo[] {
  const out: FoodQuestionInfo[] = []
  const status = (key: string): DecisionStatus => {
    // Una selección de momentos vacía no es una decisión (se quitó la última casilla): sigue sin empezar.
    const answer = key === FOOD_MOMENTOS_KEY ? momentosComidaAnswer(ctx.decisions) : undefined
    if (answer?.choice === 'seleccionar' && answer.selected.length === 0 && answer.customItems.length === 0) return 'sin_empezar'
    return decisionStatus(find(ctx.decisions, key))
  }
  const push = (questionKey: string, label: string) => out.push({ questionKey, label, status: status(questionKey) })

  // A) Servicios del lugar: se cuentan en el bloque de lugar/servicios si el caso lo pide.
  // (Se añade desde la UI con venueServicesStatus; aquí solo preguntas propias de comida.)

  if (quienApplies(ctx)) push(FOOD_QUIEN_KEY, '¿Quién se encargará de la comida?')
  if (contratacionApplies(ctx)) push(FOOD_CONTRATACION_KEY, '¿Lo tenéis ya contratado?')

  if (foodWillExist(ctx)) {
    push(FOOD_MOMENTOS_KEY, '¿Qué momentos de comida habrá?')
    push(FOOD_MENU_ESTADO_KEY, '¿Tenéis decidido el menú?')
    const estado = menuEstadoAnswer(ctx)
    const answeredGuardar = Boolean(find(ctx.decisions, FOOD_MENU_GUARDAR_KEY))
    if (estado?.choice === 'decidido' && (answeredGuardar || ctx.menuItems.length === 0)) push(FOOD_MENU_GUARDAR_KEY, '¿Quieres guardar el menú en PEPA?')
  }

  if (ninosNeedMenuInfantil(ctx.decisions)) {
    push(FOOD_MENU_INFANTIL_KEY, '¿Cómo vais a resolver el menú infantil?')
    const infantil = answerOf<MenuInfantilAnswer>(ctx.decisions, FOOD_MENU_INFANTIL_KEY)
    const answeredGuardar = Boolean(find(ctx.decisions, FOOD_MENU_INFANTIL_GUARDAR_KEY))
    if (infantil?.choice === 'incluido' && (answeredGuardar || !hasInfantilItems(ctx.menuItems))) push(FOOD_MENU_INFANTIL_GUARDAR_KEY, '¿Quieres guardar el menú infantil en PEPA?')
  }

  if (!venueIncludes(ctx, 'tarta')) push(FOOD_TARTA_KEY, '¿Habrá tarta?')
  if (!venueIncludes(ctx, 'bebidas') && foodWillExist(ctx)) push(FOOD_BEBIDAS_KEY, '¿Y las bebidas?')

  // Solo cuando TODOS han confirmado y hay necesidades reales. Antes de eso (o si ya no procede) no cuenta
  // como pregunta pendiente: el bloque nunca queda artificialmente abierto por algo futuro.
  if (ctx.needs && needsReviewApplies(ctx.needs)) push(FOOD_NECESIDADES_KEY, '¿Habéis tenido en cuenta las necesidades alimentarias en el menú?')
  return out
}

export function summarizeFoodBlock(ctx: FoodContext, extra: DecisionStatus[] = []): string {
  const statuses = [...listFoodBlockQuestions(ctx).map((q) => q.status), ...extra]
  const decided = statuses.filter((s) => s === 'decidida').length
  const pending = statuses.filter((s) => s === 'por_decidir').length
  const notStarted = statuses.filter((s) => s === 'sin_empezar').length
  const parts: string[] = []
  if (decided > 0) parts.push(`✓ ${decided} decidida${decided === 1 ? '' : 's'}`)
  if (pending > 0) parts.push(`⏳ ${pending} por decidir`)
  if (notStarted > 0) parts.push(`${notStarted} sin empezar`)
  return parts.join(' · ')
}

// Líneas «✓ … incluido en el lugar contratado» (información heredada, no preguntas).
export function includedByVenueLines(ctx: FoodContext): string[] {
  const lines: string[] = []
  if (venueIncludes(ctx, 'comida')) lines.push('✓ Comida / menú incluido en el lugar contratado')
  if (venueIncludes(ctx, 'bebidas')) lines.push('✓ Bebidas incluidas en el lugar contratado')
  if (venueIncludes(ctx, 'tarta')) lines.push('✓ Tarta incluida en el lugar contratado')
  return lines
}

// ---------------------------------------------------------------------
// Qué trabajo implica cada respuesta
// ---------------------------------------------------------------------
function customToDesired(custom: CustomResolution | undefined, taskTitle: (label: string) => string, budgetCategory: (label: string) => string): DesiredPairGeneration {
  if (!custom) return NONE
  if (custom.action === 'resuelto') return RESOLVED
  if (custom.action === 'todavia_no_lo_sabemos') return NONE
  if (custom.action === 'preparar') return { taskTitle: taskTitle(custom.label), budgetCategory: null, providerCategory: null, resolved: false }
  return { taskTitle: taskTitle(custom.label), budgetCategory: custom.hasCost === 'si' ? budgetCategory(custom.label) : null, providerCategory: null, resolved: false }
}

function contratacionTitles(kinds: ('catering' | 'restaurante')[]): { task: string; budget: string; provider: string } {
  if (kinds.length === 2) return { task: 'Buscar catering o restaurante/servicio de comida', budget: 'Catering o restaurante', provider: FOOD_PROVIDER_CATEGORIES.catering }
  if (kinds[0] === 'catering') return { task: 'Buscar catering', budget: 'Catering', provider: FOOD_PROVIDER_CATEGORIES.catering }
  return { task: 'Buscar restaurante/servicio de comida', budget: 'Restaurante o servicio de comida', provider: FOOD_PROVIDER_CATEGORIES.restaurante }
}

export function desiredForContratacion(ctx: FoodContext): DesiredPairGeneration {
  if (!contratacionApplies(ctx)) return NONE
  const answer = answerOf<ContratacionAnswer>(ctx.decisions, FOOD_CONTRATACION_KEY)
  if (!answer) return NONE
  // «Sí»: ya está contratado — nunca se inventa el proveedor (se ofrece enlazar el real) y el coste
  // desconocido sigue siendo null.
  if (answer.choice === 'si') return RESOLVED
  if (answer.choice !== 'buscando') return NONE
  const t = contratacionTitles(externalFoodKinds(quienAnswer(ctx)))
  return { taskTitle: t.task, budgetCategory: t.budget, providerCategory: t.provider, resolved: false }
}

export function desiredForMenuEstado(ctx: FoodContext): DesiredPairGeneration {
  if (!foodWillExist(ctx)) return NONE
  const answer = menuEstadoAnswer(ctx)
  if (!answer) return NONE
  if (answer.choice === 'por_decidir') return { taskTitle: 'Decidir el menú', budgetCategory: null, providerCategory: null, resolved: false }
  if (answer.choice === 'decidido') return RESOLVED
  return NONE
}

export function desiredForMenuInfantil(ctx: FoodContext): DesiredPairGeneration {
  if (!ninosNeedMenuInfantil(ctx.decisions)) return NONE
  const answer = answerOf<MenuInfantilAnswer>(ctx.decisions, FOOD_MENU_INFANTIL_KEY)
  if (!answer) return NONE
  if (answer.choice === 'incluido') return RESOLVED
  if (answer.choice === 'pedir') return { taskTitle: 'Pedir el menú infantil', budgetCategory: null, providerCategory: null, resolved: false }
  if (answer.choice === 'nosotros') return { taskTitle: 'Preparar el menú infantil', budgetCategory: null, providerCategory: null, resolved: false }
  if (answer.choice === 'otro') return customToDesired(answer.custom, (l) => `Menú infantil: ${l}`, (l) => `Menú infantil: ${l}`)
  return NONE
}

export function desiredForTarta(ctx: FoodContext): DesiredPairGeneration {
  // Incluida en el lugar: no hay nada que encargar ni preparar (aunque haya una respuesta anterior).
  if (venueIncludes(ctx, 'tarta')) return NONE
  const answer = answerOf<TartaAnswer>(ctx.decisions, FOOD_TARTA_KEY)
  if (!answer) return NONE
  if (answer.choice === 'encargar') return { taskTitle: 'Encargar la tarta', budgetCategory: 'Tarta', providerCategory: FOOD_PROVIDER_CATEGORIES.pasteleria, resolved: false }
  if (answer.choice === 'nosotros') return { taskTitle: 'Preparar la tarta', budgetCategory: null, providerCategory: null, resolved: false }
  if (answer.choice === 'resuelta') return RESOLVED
  if (answer.choice === 'otro') return customToDesired(answer.custom, (l) => `Tarta: ${l}`, () => 'Tarta')
  // 'no' es una cancelación real; 'todavía no lo sabemos' es pendiente: ninguno genera nada.
  return NONE
}

export function desiredForBebidas(ctx: FoodContext): DesiredPairGeneration {
  if (venueIncludes(ctx, 'bebidas') || !foodWillExist(ctx)) return NONE
  const answer = answerOf<BebidasAnswer>(ctx.decisions, FOOD_BEBIDAS_KEY)
  if (!answer) return NONE
  if (answer.choice === 'servicio_comida') return RESOLVED
  if (answer.choice === 'aparte') return { taskTitle: 'Encargar las bebidas', budgetCategory: 'Bebidas', providerCategory: FOOD_PROVIDER_CATEGORIES.bebidas, resolved: false }
  if (answer.choice === 'nosotros') return { taskTitle: 'Comprar las bebidas', budgetCategory: null, providerCategory: null, resolved: false }
  if (answer.choice === 'otro') return customToDesired(answer.custom, (l) => `Bebidas: ${l}`, () => 'Bebidas')
  return NONE
}

export const NECESIDADES_TASK_TITLE = 'Revisar el menú teniendo en cuenta las necesidades alimentarias'

export function desiredForNecesidades(ctx: FoodContext): DesiredPairGeneration {
  if (!ctx.needs || !needsReviewApplies(ctx.needs)) return NONE
  const answer = answerOf<NecesidadesAnswer>(ctx.decisions, FOOD_NECESIDADES_KEY)
  if (!answer) return NONE
  if (answer.choice === 'revisar') return { taskTitle: NECESIDADES_TASK_TITLE, budgetCategory: null, providerCategory: null, resolved: false }
  if (answer.choice === 'si') return RESOLVED
  return NONE
}

export const FOOD_GENERATING_KEYS = [FOOD_CONTRATACION_KEY, FOOD_MENU_ESTADO_KEY, FOOD_MENU_INFANTIL_KEY, FOOD_TARTA_KEY, FOOD_BEBIDAS_KEY, FOOD_NECESIDADES_KEY] as const

export function desiredForFoodKey(questionKey: string, ctx: FoodContext): DesiredPairGeneration {
  switch (questionKey) {
    case FOOD_CONTRATACION_KEY:
      return desiredForContratacion(ctx)
    case FOOD_MENU_ESTADO_KEY:
      return desiredForMenuEstado(ctx)
    case FOOD_MENU_INFANTIL_KEY:
      return desiredForMenuInfantil(ctx)
    case FOOD_TARTA_KEY:
      return desiredForTarta(ctx)
    case FOOD_BEBIDAS_KEY:
      return desiredForBebidas(ctx)
    case FOOD_NECESIDADES_KEY:
      return desiredForNecesidades(ctx)
    default:
      return NONE
  }
}

// Qué decisiones hay que volver a reconciliar cuando cambia otra: una respuesta de un nivel superior
// (quién cocina, qué incluye el lugar) cambia si las de debajo siguen siendo pertinentes. Se limita a las
// que de verdad dependen — nunca se recalcula todo el bloque en cada pulsación.
export function dependentFoodKeys(changedQuestionKey: string): string[] {
  switch (changedQuestionKey) {
    case 'lugar.servicios_incluidos':
      return [FOOD_CONTRATACION_KEY, FOOD_MENU_ESTADO_KEY, FOOD_TARTA_KEY, FOOD_BEBIDAS_KEY]
    case FOOD_QUIEN_KEY:
      return [FOOD_CONTRATACION_KEY, FOOD_MENU_ESTADO_KEY, FOOD_BEBIDAS_KEY]
    case FOOD_CONTRATACION_KEY:
    case FOOD_MENU_ESTADO_KEY:
    case FOOD_MENU_INFANTIL_KEY:
    case FOOD_TARTA_KEY:
    case FOOD_BEBIDAS_KEY:
    case FOOD_NECESIDADES_KEY:
      return [changedQuestionKey]
    default:
      return []
  }
}

// ---------------------------------------------------------------------
// Adopción de automatismos antiguos (plantilla de Preparativos / Presupuesto de antes del configurador).
// Si una decisión nueva significa lo mismo que un elemento automático PRÍSTINO de antes, se adopta (se le
// asigna decision_id) en vez de duplicarlo. Si la familia ya lo enriqueció o lo modificó, se protege y no
// se toca. Nunca se borra información de nadie.
// ---------------------------------------------------------------------
export const LEGACY_TASK_TITLES: Record<string, string[]> = {
  [FOOD_TARTA_KEY]: ['Confirmar la tarta'],
  [FOOD_MENU_ESTADO_KEY]: ['Confirmar menú y bebidas', 'Confirmar menú', 'Confirmar celebración/menú', 'Confirmar menú con el restaurante'],
  [FOOD_BEBIDAS_KEY]: ['Comprar lo necesario'],
}

export const LEGACY_BUDGET_CATEGORIES: Record<string, string[]> = {
  [FOOD_TARTA_KEY]: ['Tarta'],
  [FOOD_CONTRATACION_KEY]: ['Comida y bebida', 'Restaurante'],
}

// Una tarea heredada es adoptable solo si sigue siendo exactamente lo que generó la plantilla: automática,
// sin hacer, sin responsable, sin enlace a Calendario, sin decisión asociada y con la fecha que la
// plantilla le dio (o sin fecha). Una fecha puesta a mano la hace «enriquecida» → protegida.
export function isAdoptableLegacyTask(task: EventTask, questionKey: string, event: Pick<FamilyEvent, 'type' | 'eventDate'>): boolean {
  const titles = LEGACY_TASK_TITLES[questionKey]
  if (!titles || !titles.includes(task.title)) return false
  if (task.decisionId !== null || task.source !== 'auto' || task.done || task.assignedMemberId !== null || task.calendarEventId !== null) return false
  if (task.dueDate === null) return true
  const template = generateAutoTasks(event.type, event.eventDate).find((t) => t.title === task.title)
  return template !== undefined && template.dueDate === task.dueDate
}

export function isAdoptableLegacyBudget(item: EventBudgetItem, questionKey: string): boolean {
  const categories = LEGACY_BUDGET_CATEGORIES[questionKey]
  if (!categories || !categories.includes(item.category)) return false
  return item.decisionId === null && item.plannedAmount === null
}

// ---------------------------------------------------------------------
// Momentos de comida → Plan del día (sin hora, solo los marcados de verdad)
// ---------------------------------------------------------------------
export interface MomentoComidaDef {
  key: MomentoComidaKey
  label: string
}

const MOMENTOS_BODA: MomentoComidaDef[] = [
  { key: 'aperitivo', label: 'Aperitivo / cóctel' },
  { key: 'comida', label: 'Comida / banquete' },
  { key: 'cena', label: 'Cena / banquete' },
  { key: 'recena', label: 'Recena' },
]
const MOMENTOS_CUMPLEANOS: MomentoComidaDef[] = [
  { key: 'aperitivo', label: 'Aperitivo / picoteo' },
  { key: 'comida', label: 'Comida' },
  { key: 'merienda', label: 'Merienda' },
  { key: 'cena', label: 'Cena' },
]
const MOMENTOS_COMUNION: MomentoComidaDef[] = [
  { key: 'aperitivo', label: 'Aperitivo' },
  { key: 'comida', label: 'Comida' },
  { key: 'merienda', label: 'Merienda / café / dulces' },
]
const MOMENTOS_GENERICO: MomentoComidaDef[] = [
  { key: 'aperitivo', label: 'Aperitivo' },
  { key: 'comida', label: 'Comida' },
  { key: 'merienda', label: 'Merienda' },
  { key: 'cena', label: 'Cena' },
]

export const MOMENTOS_COMIDA_CATALOG: Record<EventType, MomentoComidaDef[]> = {
  boda: MOMENTOS_BODA,
  cumpleanos: MOMENTOS_CUMPLEANOS,
  comunion: MOMENTOS_COMUNION,
  bautizo: MOMENTOS_COMUNION,
  celebracion: MOMENTOS_GENERICO,
  personalizado: MOMENTOS_GENERICO,
}

export function momentosComidaAnswer(decisions: EventDecision[]): MomentosComidaAnswer | undefined {
  return answerOf<MomentosComidaAnswer>(decisions, FOOD_MOMENTOS_KEY)
}

// Momentos que debe tener el Plan del día por esta decisión: solo los del catálogo marcados expresamente, y solo
// si va a haber comida. Se identifican por su CLAVE ESTABLE (aperitivo, comida…), nunca por el texto visible.
// «Otro» y «Todavía no lo sabemos» no derivan nada.
export function desiredDayPlanMoments(eventType: EventType, ctx: FoodContext): MomentoComidaDef[] {
  if (!foodWillExist(ctx)) return []
  const answer = momentosComidaAnswer(ctx.decisions)
  if (!answer || answer.choice !== 'seleccionar') return []
  return MOMENTOS_COMIDA_CATALOG[eventType].filter((d) => answer.selected.includes(d.key))
}

export type DayPlanAction =
  | { op: 'create'; key: MomentoComidaKey; title: string }
  | { op: 'adopt'; id: string }
  | { op: 'delete'; id: string }
  // Se desvincula de la decisión pero CONSERVA su source_key (para poder readoptarlo al volver a marcar el momento).
  | { op: 'detach'; id: string; sourceKey: string | null }

const MOMENT_KEY_BY_LABEL = new Map<string, MomentoComidaKey>(
  Object.values(MOMENTOS_COMIDA_CATALOG)
    .flat()
    .map((d) => [d.label, d.key]),
)

// Solo para filas generadas ANTES de existir source_key y que la migración no pudo etiquetar (p. ej. un duplicado).
function legacyMomentKey(title: string): MomentoComidaKey | null {
  return MOMENT_KEY_BY_LABEL.get(title) ?? null
}

// Un elemento generado es «prístino» si sigue siendo exactamente lo que generó el motor: sin hora, sin nota,
// visible al compartir, sin coincidencia confirmada y con el nombre original de SU momento. Cualquier retoque
// (nombre, hora, nota, visibilidad) es información de la familia → se conserva (solo se desvincula).
export function isDayPlanItemUntouched(
  item: Pick<EventDayPlanItem, 'itemTime' | 'note' | 'title' | 'showOnShare' | 'coincideOkTime'>,
  eventType: EventType,
  key: MomentoComidaKey | null,
): boolean {
  if (key === null) return false
  const original = MOMENTOS_COMIDA_CATALOG[eventType].find((d) => d.key === key)?.label
  return item.itemTime === null && !(item.note && item.note.trim()) && item.showOnShare && item.coincideOkTime === null && original !== undefined && item.title === original
}

// Un momento INDEPENDIENTE recuperable: ya no está bajo el control de ninguna decisión (decision_id null) pero
// conserva su source_key, es decir, su procedencia. Se reconoce SOLO por esa clave, nunca por el título (puede
// haberse renombrado) ni por llamarse igual (uno puesto a mano no tiene clave).
export function recoverableDayPlanItems(items: EventDayPlanItem[], key: MomentoComidaKey): EventDayPlanItem[] {
  return items.filter((i) => i.decisionId === null && foodMomentKeyFromSource(i.sourceKey) === key).sort((x, y) => x.sortOrder - y.sortOrder || (x.createdAt < y.createdAt ? -1 : x.createdAt > y.createdAt ? 1 : 0))
}

// Decisiones EXPLÍCITAS de la familia ante un momento recuperable (cuando vuelve a marcar el momento):
//  · adopt[clave] = id  → recuperar el vínculo con ESA fila (con su nombre, hora, nota y orden tal cual);
//  · forceCreate        → crear uno nuevo aunque haya candidatos (y los candidatos siguen independientes).
export interface DayPlanResolution {
  adopt?: Partial<Record<MomentoComidaKey, string>>
  forceCreate?: MomentoComidaKey[]
}

// Reconciliación por IDENTIDAD ESTABLE (source_key), nunca por el título:
//  · marcado y ya enlazado            → nada (aunque se haya renombrado, puesto hora o nota);
//  · marcado y hay un independiente recuperable → la familia ya eligió (resolution): recuperar ESA fila o crear;
//    sin elección (reconciliaciones que no nacen de marcar el momento, p. ej. cambia el lugar): con UN único
//    candidato se continúa con él; con VARIOS no se escoge ninguno ni se crea (nunca se decide en silencio);
//  · marcado y no existe              → se crea;
//  · desmarcado, enlazado y prístino  → se retira; si la familia lo enriqueció → se desvincula y se conserva;
//  · duplicado (fallo antiguo)        → se limpia el sobrante prístino, o se desvincula si tiene información.
// Un elemento puesto a mano con el mismo nombre es INDEPENDIENTE: no cuenta ni se toca.
export function reconcileDayPlan(eventType: EventType, desired: MomentoComidaDef[], items: EventDayPlanItem[], decisionId: string, resolution: DayPlanResolution = {}): DayPlanAction[] {
  const actions: DayPlanAction[] = []
  const wanted = new Set<MomentoComidaKey>(desired.map((d) => d.key))
  const keyOf = (item: EventDayPlanItem): MomentoComidaKey | null => (foodMomentKeyFromSource(item.sourceKey) as MomentoComidaKey | null) ?? (item.decisionId === decisionId ? legacyMomentKey(item.title) : null)

  const linked = items.filter((i) => i.decisionId === decisionId).sort((a, b) => a.sortOrder - b.sortOrder || (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
  const kept = new Set<MomentoComidaKey>()

  for (const item of linked) {
    const key = keyOf(item)
    if (key !== null && wanted.has(key) && !kept.has(key)) {
      kept.add(key)
      continue
    }
    // Ya no se desea (o es un duplicado de uno que se conserva, o no se puede identificar).
    actions.push(isDayPlanItemUntouched(item, eventType, key) ? { op: 'delete', id: item.id } : { op: 'detach', id: item.id, sourceKey: item.sourceKey ?? (key ? foodMomentSourceKey(key) : null) })
  }

  for (const moment of desired) {
    if (kept.has(moment.key)) continue
    const candidates = recoverableDayPlanItems(items, moment.key)
    const chosen = resolution.adopt?.[moment.key]
    if (chosen && candidates.some((c) => c.id === chosen)) {
      actions.push({ op: 'adopt', id: chosen })
    } else if (resolution.forceCreate?.includes(moment.key) || candidates.length === 0) {
      actions.push({ op: 'create', key: moment.key, title: moment.label })
    } else if (candidates.length === 1) {
      actions.push({ op: 'adopt', id: candidates[0].id })
    }
    // Varios candidatos y sin elección: no se decide por la familia.
  }
  return actions
}

// ¿Hay que PREGUNTAR antes de guardar la nueva selección de momentos? Sí cuando se marca un momento (que va a
// generar algo en el Plan del día) y ya existe algún independiente recuperable de esa misma procedencia. Se llama
// ANTES de persistir nada, para poder cancelar sin dejar la decisión marcada.
export interface MomentRecoveryPrompt {
  key: MomentoComidaKey
  label: string
  candidates: EventDayPlanItem[]
}

export function momentRecoveryPrompt(eventType: EventType, previous: MomentosComidaAnswer | undefined, next: MomentosComidaAnswer, ctx: FoodContext, items: EventDayPlanItem[]): MomentRecoveryPrompt | null {
  if (next.choice !== 'seleccionar' || !foodWillExist(ctx)) return null
  const before = previous?.choice === 'seleccionar' ? previous.selected : []
  for (const def of MOMENTOS_COMIDA_CATALOG[eventType]) {
    if (!next.selected.includes(def.key) || before.includes(def.key)) continue
    const candidates = recoverableDayPlanItems(items, def.key)
    if (candidates.length > 0) return { key: def.key, label: def.label, candidates }
  }
  return null
}

// ---------------------------------------------------------------------
// Tarta: contradicción entre «no habrá tarta» y Momentos especiales (aviso, nunca cambio automático)
// ---------------------------------------------------------------------
export const TARTA_MOMENT_KEYS = ['corte_tarta', 'velas_tarta', 'tarta'] as const

const TARTA_MOMENT_LABEL: Record<string, string> = {
  corte_tarta: 'Corte de la tarta',
  velas_tarta: 'Velas / tarta',
  tarta: 'Tarta',
}

export function tartaContradiction(decisions: EventDecision[]): string | null {
  const tarta = answerOf<TartaAnswer>(decisions, FOOD_TARTA_KEY)
  if (tarta?.choice !== 'no') return null
  const moments = answerOf<MomentosEspecialesAnswer>(decisions, MOMENTOS_ESPECIALES_QUESTION_KEY)
  if (!moments || moments.choice !== 'seleccionar') return null
  const hit = (moments.selected as string[]).find((k) => (TARTA_MOMENT_KEYS as readonly string[]).includes(k))
  if (!hit) return null
  return `Habéis indicado que no habrá tarta, pero tenéis seleccionado ‘${TARTA_MOMENT_LABEL[hit]}’ en Momentos especiales. Revisa una de las dos decisiones.`
}

// ---------------------------------------------------------------------
// Aviso persistente «ya han confirmado todos» (ver computeEventConclusions). Contestar «Sí, están
// contempladas» o «Tenemos que revisarlo» da el aviso por atendido: en el segundo caso ya existe un
// Preparativo que lo sigue, así que el aviso no insiste.
// ---------------------------------------------------------------------
export function foodNeedsAlertInput(state: FoodNeedsState, decisions: EventDecision[]): FoodNeedsAlertInput {
  const answer = answerOf<NecesidadesAnswer>(decisions, FOOD_NECESIDADES_KEY)
  return { allConfirmed: state.allConfirmed, hasNeeds: state.activeNeeds.length > 0, reviewed: answer?.choice === 'si' || answer?.choice === 'revisar' }
}
