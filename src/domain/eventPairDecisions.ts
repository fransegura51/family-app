// Fase 3 (Eventos → "✨ Cómo queréis que sea vuestra boda" → "👰🤵 La pareja") — motor de decisiones puro
// del segundo bloque del configurador. Sin Supabase aquí: toda la generación/reconciliación es
// determinista y testeable; src/data/events.ts solo ejecuta lo que estas funciones deciden.
//
// Principio aprobado: "todavía no lo sabemos" es una respuesta válida (⏳ Por decidir), nunca la ausencia
// de fila — y una pregunta nunca respondida es "Sin empezar", no "por decidir". Ninguna respuesta
// "todavía no lo sabemos" genera nunca Preparativo/Presupuesto/Proveedor. Una opción personalizada
// ("otro") nunca se interpreta por el texto libre que contiene — siempre usa el motor explícito de
// CustomResolution (qué hay que hacer / si tendrá coste), nunca se adivina a partir de la etiqueta.
//
// Corrección real (prueba manual en iPhone): "seleccionar QUÉ queremos" y "decidir CÓMO lo resolvemos"
// son dos decisiones distintas, nunca una sola. Vestuario, Floral (ramo/prendido) y Detalle especial
// siguen todos el mismo patrón de dos niveles: una pregunta de TIPO/selección (qué es) que por sí sola
// nunca genera nada, y una pregunta de RESOLUCIÓN revelada solo cuando el tipo es concreto, que es la
// única que puede generar Preparativo/Presupuesto/relación con Proveedores. Peluquería/maquillaje ya
// tenía este patrón desde el diseño original (necesidad → resolución); Alianzas y Complementos generales
// no lo necesitan porque su nivel único YA es una respuesta de resolución (nunca "qué tipo", ver abajo).
import type { EventBudgetItem, EventDecision, EventTask, FamilyEvent } from '@/domain/types'

export type DecisionStatus = 'sin_empezar' | 'decidida' | 'por_decidir'

export type CustomAction = 'preparar' | 'buscar_contratar' | 'resuelto' | 'todavia_no_lo_sabemos' | 'otro'
export type CustomHasCost = 'si' | 'no' | 'todavia_no_lo_sabemos'

export interface CustomResolution {
  label: string
  action: CustomAction
  hasCost: CustomHasCost | null
}

// Vestuario — tipo (qué llevará, nunca implica por sí solo que haya que comprarlo/elegirlo) + resolución
// (cómo está resuelto, revelada solo cuando el tipo es concreto).
export type VestuarioTipoChoice = 'vestido' | 'traje' | 'otro' | 'todavia_no_lo_sabemos'
export interface VestuarioTipoAnswer {
  choice: VestuarioTipoChoice
  customLabel?: string
}
export type VestuarioResolucionChoice = 'ya_lo_tenemos' | 'elegir_comprar' | 'buscando_proveedor' | 'otro' | 'todavia_no_lo_sabemos'
export interface VestuarioResolucionAnswer {
  choice: VestuarioResolucionChoice
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

// Complementos generales — el nivel único YA es una respuesta de resolución ("queremos prepararlos" es
// una decisión tomada, no un tipo pendiente de resolver); la lista de qué complementos es solo un detalle
// dentro de "preparar" confirmado, nunca una selección de tipo independiente. No tiene el mismo patrón de
// dos niveles que Vestuario/Floral/Detalle especial.
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

// Alianzas — el nivel único YA es una respuesta de resolución ("Tenemos que elegirlas"/"Ya las tenemos"
// son estados de proceso, no un "tipo de alianza" previo) — no existe aquí la ambigüedad de Vestuario.
export type AlianzasChoice = 'elegir' | 'comprar_encargar' | 'ya_las_tenemos' | 'no_tendremos' | 'otro' | 'todavia_no_lo_sabemos'
export interface AlianzasAnswer {
  choice: AlianzasChoice
  custom?: CustomResolution
}

// Detalle especial — mismo patrón de dos niveles que Vestuario/Floral: el tipo (regalo/carta/sorpresa) no
// implica por sí solo que haya que prepararlo o ya esté resuelto.
export type DetalleEspecialTipoChoice = 'regalo' | 'carta' | 'sorpresa' | 'otro' | 'no' | 'todavia_no_lo_sabemos'
export interface DetalleEspecialTipoAnswer {
  choice: DetalleEspecialTipoChoice
  customLabel?: string
}
export type DetalleEspecialResolucionChoice = 'ya_lo_tenemos' | 'tenemos_que_prepararlo' | 'buscando' | 'otro' | 'todavia_no_lo_sabemos'
export interface DetalleEspecialResolucionAnswer {
  choice: DetalleEspecialResolucionChoice
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
export const DETALLE_ESPECIAL_RESOLUCION_QUESTION_KEY = 'pareja.detalle_especial.resolucion'

// Marca de selección de un elemento floral — deliberadamente NUNCA una fila de event_decisions (eso
// falsificaría una respuesta que la familia no ha dado): vive en events.details, igual que los nombres de
// la pareja, mismo merge explícito al guardar. "Seleccionado" y "resuelto" son dos hechos distintos: un
// ítem puede estar marcado sin que exista todavía ninguna decisión de resolución.
function floralSelectedField(slot: PartnerSlot): 'partner1FloralSelected' | 'partner2FloralSelected' {
  return slot === 'partner1' ? 'partner1FloralSelected' : 'partner2FloralSelected'
}

export function floralItemSelected(event: Pick<FamilyEvent, 'details'>, slot: PartnerSlot, item: FloralItemKey): boolean {
  const details = event.details as Record<string, unknown>
  const raw = details[floralSelectedField(slot)]
  return Array.isArray(raw) && raw.includes(item)
}

// Patch de `details` con merge explícito (igual que los nombres) — quien llame debe fusionarlo con
// event.details completo antes de guardar vía updateEvent, nunca sobrescribirlo entero.
export function withFloralSelected(event: Pick<FamilyEvent, 'details'>, slot: PartnerSlot, item: FloralItemKey, selected: boolean): Record<string, unknown> {
  const details = event.details as Record<string, unknown>
  const field = floralSelectedField(slot)
  const current = Array.isArray(details[field]) ? (details[field] as FloralItemKey[]) : []
  const next = selected ? Array.from(new Set([...current, item])) : current.filter((x) => x !== item)
  return { ...details, [field]: next }
}

// Petición real: "esto no debe depender del género" — el catálogo SUGERIDO (las casillas fijas; nunca lo
// que se puede escribir libremente vía "+Otro complemento floral", eso siempre admite cualquier texto
// para cualquier persona) difiere solo por POSICIÓN del slot, igual que el resto de este motor nunca mira
// partnerRole. A la primera persona se le sigue sugiriendo Ramo y Flor de solapa (donde ya funcionaba); a
// la segunda, solo Flor de solapa — Ramo no se sugiere por defecto, pero sigue siendo libre de añadirse
// vía "+Otro" si se quiere. Si YA existe un dato real (selección o decisión) para un ítem que ya no se
// sugeriría, nunca se oculta — comprobado contra los datos reales existentes antes de implementar: ningún
// evento real tiene hoy "ramo" seleccionado para la segunda persona, así que esto no oculta nada ya dado.
export function floralItemsForSlot(event: Pick<FamilyEvent, 'details'>, slot: PartnerSlot, decisions: EventDecision[]): typeof FLORAL_ITEMS {
  if (slot === 'partner1') return FLORAL_ITEMS
  return FLORAL_ITEMS.filter((item) => item.key !== 'ramo' || floralItemSelected(event, slot, item.key) || decisions.some((d) => d.questionKey === pairQuestionKey(slot, `floral.${item.key}`)))
}

// Petición real ("Paco no tiene esa posibilidad"): un elemento floral ya marcado o ya resuelto nunca debe
// depender de la pregunta general de Complementos (zapatos/joyas/corbata/gemelos — un concepto totalmente
// distinto) para seguir siendo visible. Causa raíz auditada: listPairBlockQuestions (el contador
// "✓ N decididas" de arriba) YA trataba un ítem floral como relevante con esta misma condición
// (marcado o con decisión, sin mirar Complementos); solo el RENDER en EventosScreen.tsx exigía además
// Complementos === 'preparar', ocultando visualmente datos reales ya guardados (confirmado en producción:
// pareja.partner2.floral.prendido con respuesta real, invisible porque partner2.complementos nunca se
// había respondido). Esta función unifica el criterio: el bloque floral se revela si Complementos ya dice
// 'preparar' (descubrimiento normal) O si esa persona ya tiene cualquier actividad floral real.
export function hasFloralActivity(event: Pick<FamilyEvent, 'details'>, slot: PartnerSlot, decisions: EventDecision[]): boolean {
  if (FLORAL_ITEMS.some((item) => floralItemSelected(event, slot, item.key))) return true
  const prefix = pairQuestionKey(slot, 'floral.')
  return decisions.some((d) => d.questionKey.startsWith(prefix))
}

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

// Revelado progresivo real: una pregunta de segundo nivel (resolución de vestuario/peluquería/floral/
// detalle especial) solo CUENTA como pregunta relevante cuando la de primer nivel (o, para floral, el
// simple hecho de estar marcado) ya la hace pertinente — antes de eso no es "Sin empezar", simplemente no
// existe todavía como pregunta relevante.
export function listPairBlockQuestions(event: FamilyEvent, decisions: EventDecision[]): PairQuestionInfo[] {
  if (event.type !== 'boda') return []
  const result: PairQuestionInfo[] = []
  for (const slot of PARTNER_SLOTS) {
    const name = partnerName(event, slot)

    const vestuarioKey = pairQuestionKey(slot, 'vestuario')
    const vestuarioDecision = findDecision(decisions, vestuarioKey)
    result.push({ questionKey: vestuarioKey, blockKey: 'pareja', label: `Vestuario de ${name}`, status: decisionStatus(vestuarioDecision) })
    if (vestuarioDecision) {
      const tipo = vestuarioDecision.answer as unknown as VestuarioTipoAnswer
      if (tipo.choice !== 'todavia_no_lo_sabemos') {
        const resolucionKey = pairQuestionKey(slot, 'vestuario.resolucion')
        result.push({
          questionKey: resolucionKey,
          blockKey: 'pareja',
          label: `Cómo está resuelto el vestuario de ${name}`,
          status: decisionStatus(findDecision(decisions, resolucionKey)),
        })
      }
    }

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
      // Marcado (con o sin decisión de resolución todavía) cuenta como pregunta relevante — sin marcar,
      // ni siquiera eso: no existe como pregunta pendiente.
      if (d || floralItemSelected(event, slot, item.key)) {
        result.push({ questionKey: floralKey, blockKey: 'pareja', label: `${item.label} de ${name}`, status: decisionStatus(d) })
      }
    }
    const customPrefix = pairQuestionKey(slot, 'floral.custom:')
    for (const d of decisions.filter((x) => x.questionKey.startsWith(customPrefix))) {
      result.push({ questionKey: d.questionKey, blockKey: 'pareja', label: `Complemento floral de ${name}`, status: decisionStatus(d) })
    }
  }

  result.push({ questionKey: ALIANZAS_QUESTION_KEY, blockKey: 'pareja', label: 'Alianzas', status: decisionStatus(findDecision(decisions, ALIANZAS_QUESTION_KEY)) })

  const detalleDecision = findDecision(decisions, DETALLE_ESPECIAL_QUESTION_KEY)
  result.push({ questionKey: DETALLE_ESPECIAL_QUESTION_KEY, blockKey: 'pareja', label: 'Detalle especial entre la pareja', status: decisionStatus(detalleDecision) })
  if (detalleDecision) {
    const tipo = detalleDecision.answer as unknown as DetalleEspecialTipoAnswer
    if (tipo.choice !== 'no' && tipo.choice !== 'todavia_no_lo_sabemos') {
      result.push({
        questionKey: DETALLE_ESPECIAL_RESOLUCION_QUESTION_KEY,
        blockKey: 'pareja',
        label: 'Cómo está resuelto el detalle especial',
        status: decisionStatus(findDecision(decisions, DETALLE_ESPECIAL_RESOLUCION_QUESTION_KEY)),
      })
    }
  }
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
// reconciliación de más abajo a comparar un único título/categoría esperados contra lo ya existente. Solo
// las preguntas de RESOLUCIÓN generan — un tipo/selección por sí solo nunca genera nada.
//
// Corrección real (prueba manual en iPhone) — "resuelto" ≠ "cancelado": antes, cualquier respuesta sin
// tarea/presupuesto propios ("ya lo tenemos" igual que "todavía no lo sabemos" igual que "no tendremos")
// colapsaba en el mismo "NONE", y la reconciliación retiraba por igual cualquier tarea prístina asociada.
// Pero "ya lo tenemos" significa que la necesidad SE HA CUMPLIDO — el Preparativo no desaparece, se marca
// hecho y pasa a Completados/Historial. `resolved` lo dice cada función de forma explícita según la
// opción exacta elegida, nunca inferido del texto visible.
// ---------------------------------------------------------------------

export interface DesiredPairGeneration {
  taskTitle: string | null
  budgetCategory: string | null
  // Categoría interna sugerida para relacionar un proveedor real cuando corresponda (no crea nada por
  // sí sola — ver §4: "Estamos buscando" nunca crea un proveedor ficticio).
  providerCategory: string | null
  // true únicamente en las opciones que significan "esto ya está conseguido" (Ya lo tenemos / Ya las
  // tenemos / CustomResolution.action === 'resuelto'). Nunca junto a taskTitle/budgetCategory — una
  // decisión o pide algo nuevo, o certifica que ya estaba resuelto, nunca las dos cosas a la vez.
  resolved: boolean
}

const NONE: DesiredPairGeneration = { taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false }
const RESOLVED: DesiredPairGeneration = { taskTitle: null, budgetCategory: null, providerCategory: null, resolved: true }

function fromCustom(custom: CustomResolution | undefined, taskTitle: (label: string) => string, budgetCategory: (label: string) => string): DesiredPairGeneration {
  if (!custom) return NONE
  if (custom.action === 'resuelto') return RESOLVED
  if (custom.action === 'todavia_no_lo_sabemos') return NONE
  if (custom.action === 'preparar') return { taskTitle: taskTitle(custom.label), budgetCategory: null, providerCategory: null, resolved: false }
  // 'buscar_contratar' | 'otro' — nunca se infiere coste del texto: solo si hasCost === 'si' se genera presupuesto.
  return { taskTitle: taskTitle(custom.label), budgetCategory: custom.hasCost === 'si' ? budgetCategory(custom.label) : null, providerCategory: null, resolved: false }
}

function vestuarioTipoLabel(tipo: VestuarioTipoAnswer): string {
  if (tipo.choice === 'vestido') return 'vestido'
  if (tipo.choice === 'traje') return 'traje'
  return tipo.customLabel || 'vestuario'
}

// El tipo (vestido/traje/otro/todavía no lo sabemos) por sí solo nunca genera nada — responde solo a QUÉ
// llevará, no a si hace falta comprarlo/elegirlo. Solo la resolución genera, y solo cuando el tipo es
// concreto (nunca se llama con tipo.choice === 'todavia_no_lo_sabemos', ver listPairBlockQuestions).
export function desiredForVestuarioResolucion(tipo: VestuarioTipoAnswer, resolucion: VestuarioResolucionAnswer | undefined, name: string): DesiredPairGeneration {
  if (tipo.choice === 'todavia_no_lo_sabemos') return NONE
  if (!resolucion || resolucion.choice === 'todavia_no_lo_sabemos') return NONE
  if (resolucion.choice === 'ya_lo_tenemos') return RESOLVED
  const label = vestuarioTipoLabel(tipo)
  const capitalized = label.charAt(0).toUpperCase() + label.slice(1)
  if (resolucion.choice === 'elegir_comprar') {
    return { taskTitle: `Elegir/comprar ${label} de ${name}`, budgetCategory: `${capitalized} de ${name}`, providerCategory: null, resolved: false }
  }
  if (resolucion.choice === 'buscando_proveedor') {
    return { taskTitle: `Buscar dónde conseguir ${label} de ${name}`, budgetCategory: `${capitalized} de ${name}`, providerCategory: null, resolved: false }
  }
  // 'otro'
  return fromCustom(resolucion.custom, (l) => `Resolver ${l} de ${name}`, (l) => `${l} de ${name}`)
}

export function desiredForPeluqueriaResolucion(necesidad: PeluqueriaNecesidadAnswer, resolucion: PeluqueriaResolucionAnswer | undefined, name: string): DesiredPairGeneration {
  if (necesidad.choice === 'no' || necesidad.choice === 'todavia_no_lo_sabemos') return NONE
  if (!resolucion || resolucion.choice === 'todavia_no_lo_sabemos') return NONE
  if (resolucion.choice === 'ya_lo_tenemos') return RESOLVED
  // 'buscando' — nunca crea el proveedor, solo la necesidad (§4/§19).
  return {
    taskTitle: `Buscar peluquería/maquillaje para ${name}`,
    budgetCategory: `Peluquería/maquillaje de ${name}`,
    providerCategory: DECISION_PROVIDER_CATEGORIES.peluqueria_maquillaje,
    resolved: false,
  }
}

export function desiredForComplementos(answer: ComplementosAnswer, name: string): DesiredPairGeneration {
  if (answer.choice !== 'preparar') return NONE
  if (answer.selected.length === 0 && answer.customItems.length === 0) return NONE
  return { taskTitle: `Preparar complementos de ${name}`, budgetCategory: null, providerCategory: null, resolved: false }
}

export function desiredForFloral(answer: FloralAnswer, itemLabel: string, name: string): DesiredPairGeneration {
  if (answer.choice === 'todavia_no_lo_sabemos') return NONE
  if (answer.choice === 'ya_lo_tenemos') return RESOLVED
  if (answer.choice === 'preparamos') return { taskTitle: `Preparar ${itemLabel.toLowerCase()} de ${name}`, budgetCategory: null, providerCategory: null, resolved: false }
  if (answer.choice === 'floristeria') {
    return {
      taskTitle: `Encargar ${itemLabel.toLowerCase()} de ${name}`,
      budgetCategory: `${itemLabel} de ${name}`,
      providerCategory: DECISION_PROVIDER_CATEGORIES.floristeria,
      resolved: false,
    }
  }
  // 'otro'
  return fromCustom(answer.custom, (label) => `Resolver ${label} de ${name}`, (label) => `${label} de ${name}`)
}

export function desiredForAlianzas(answer: AlianzasAnswer): DesiredPairGeneration {
  if (answer.choice === 'todavia_no_lo_sabemos') return NONE
  // "No tendremos" es cancelación real, no resolución: nunca certifica que las alianzas "ya se
  // consiguieron" — sería marcar como completado algo que en realidad no va a existir.
  if (answer.choice === 'no_tendremos') return NONE
  if (answer.choice === 'ya_las_tenemos') return RESOLVED
  if (answer.choice === 'elegir' || answer.choice === 'comprar_encargar') {
    return { taskTitle: 'Elegir/Encargar las alianzas', budgetCategory: 'Alianzas', providerCategory: null, resolved: false }
  }
  // 'otro'
  return fromCustom(answer.custom, (label) => `Alianzas: ${label}`, (label) => `Alianzas: ${label}`)
}

function detalleTipoLabel(tipo: DetalleEspecialTipoAnswer): string {
  if (tipo.choice === 'regalo') return 'un regalo'
  if (tipo.choice === 'carta') return 'una carta'
  if (tipo.choice === 'sorpresa') return 'una sorpresa'
  return tipo.customLabel || 'algo especial'
}

// El tipo (regalo/carta/sorpresa/otro/no/todavía no lo sabemos) por sí solo nunca genera nada — solo
// responde a QUÉ, no a si hace falta prepararlo. Solo se llama con un tipo que implica preparación (nunca
// 'no'/'todavia_no_lo_sabemos', ver listPairBlockQuestions). Nunca genera presupuesto salvo "otro" con
// coste explícito — igual que el diseño original aprobado.
export function desiredForDetalleEspecialResolucion(tipo: DetalleEspecialTipoAnswer, resolucion: DetalleEspecialResolucionAnswer | undefined): DesiredPairGeneration {
  if (tipo.choice === 'no' || tipo.choice === 'todavia_no_lo_sabemos') return NONE
  if (!resolucion || resolucion.choice === 'todavia_no_lo_sabemos') return NONE
  if (resolucion.choice === 'ya_lo_tenemos') return RESOLVED
  const label = detalleTipoLabel(tipo)
  if (resolucion.choice === 'tenemos_que_prepararlo') return { taskTitle: `Preparar ${label} para el otro`, budgetCategory: null, providerCategory: null, resolved: false }
  if (resolucion.choice === 'buscando') return { taskTitle: `Buscar ${label} para el otro`, budgetCategory: null, providerCategory: null, resolved: false }
  // 'otro'
  return fromCustom(resolucion.custom, (l) => `Preparar: ${l}`, (l) => l)
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
  | { op: 'complete_task'; id: string }
  | { op: 'delete_task'; id: string }
  | { op: 'detach_task'; id: string }
  | { op: 'create_budget'; category: string }
  | { op: 'update_budget'; id: string; category: string }
  | { op: 'delete_budget'; id: string }
  | { op: 'detach_budget'; id: string }

export interface ReconcileResult {
  actions: ReconcileAction[]
  // Partida de presupuesto real, ligada a esta decisión, que acaba de quedar resuelta pero sigue sin
  // importe — candidata a preguntar el coste (ver BudgetAmountPromptModal). Se detecta solo por esta
  // combinación de hechos estructurales (resuelto + partida real + importe null), nunca por palabras
  // como "vestido"/"ramo" — funciona igual para cualquier pregunta presente o futura.
  pendingBudgetItem: { id: string; category: string } | null
}

export function reconcilePairGeneration(desired: DesiredPairGeneration, existingTask: EventTask | undefined, existingBudget: EventBudgetItem | undefined): ReconcileResult {
  const actions: ReconcileAction[] = []

  if (desired.taskTitle) {
    if (!existingTask) actions.push({ op: 'create_task', title: desired.taskTitle })
    else if (existingTask.title !== desired.taskTitle && isTaskUntouched(existingTask)) {
      actions.push({ op: 'update_task', id: existingTask.id, title: desired.taskTitle })
    }
    // Si el título difiere y la tarea ya no está intacta, se deja tal cual — no se sobrescribe algo que
    // la familia ya ha editado.
  } else if (desired.resolved) {
    // Resuelto ≠ cancelado: una tarea pendiente real se completa y se conserva (pasa a Completados/
    // Historial), nunca se borra — independientemente de si sigue "prístina" o no (completar nunca
    // destruye fecha/responsable/calendario, solo añade el hecho de que ya está hecho).
    if (existingTask && !existingTask.done) actions.push({ op: 'complete_task', id: existingTask.id })
  } else if (existingTask) {
    // Cancelado / por decidir: mismo criterio prístino de siempre — nunca borra algo enriquecido.
    if (isTaskUntouched(existingTask)) actions.push({ op: 'delete_task', id: existingTask.id })
    else actions.push({ op: 'detach_task', id: existingTask.id })
  }

  if (desired.budgetCategory) {
    if (!existingBudget) actions.push({ op: 'create_budget', category: desired.budgetCategory })
    else if (existingBudget.category !== desired.budgetCategory && isBudgetItemUntouched(existingBudget)) {
      actions.push({ op: 'update_budget', id: existingBudget.id, category: desired.budgetCategory })
    }
  } else if (!desired.resolved && existingBudget) {
    // Resuelto NUNCA toca el presupuesto, ni para borrarlo ni para desvincularlo — "ya lo tenemos" no
    // significa 0€. La partida se queda exactamente como esté hasta un cierre de coste explícito.
    if (isBudgetItemUntouched(existingBudget)) actions.push({ op: 'delete_budget', id: existingBudget.id })
    else actions.push({ op: 'detach_budget', id: existingBudget.id })
  }

  const pendingBudgetItem =
    desired.resolved && existingBudget && existingBudget.plannedAmount === null ? { id: existingBudget.id, category: existingBudget.category } : null

  return { actions, pendingBudgetItem }
}

// ---------------------------------------------------------------------
// Feedback — el mensaje se construye SIEMPRE a partir de las acciones realmente ejecutadas
// (ReconcileAction[], la verdad de lo que pasó), nunca a partir de qué respuesta se eligió. Una lista
// vacía (o solo updates silenciosos de título/categoría) no produce ningún mensaje.
//
// RETOQUE (petición real, validación de "Momentos especiales" → Primer baile → clases de baile) — borrar
// de verdad un derivado PRÍSTINO (delete_task/delete_budget, al cancelar una respuesta que lo había
// generado) SÍ avisa ahora, con el mismo patrón "✅ Añadido a..." en espejo. `detach_task`/`detach_budget`
// (desvincular un derivado ya tocado a mano, que se CONSERVA tal cual en Preparativos/Presupuesto) sigue
// sin avisar a propósito — nada visible cambia ahí, avisar sería confuso. `update_task`/`update_budget`
// (renombrado silencioso de un derivado pristino cuyo título/categoría cambia) tampoco avisa, igual que
// siempre: no son un alta ni una baja, solo texto.
// ---------------------------------------------------------------------

export const TASK_COMPLETED_MESSAGE = '✓ Preparativo completado'
export const TASK_COMPLETED_AND_BUDGET_UPDATED_MESSAGE = '✓ Preparativo completado · Presupuesto actualizado'
export const BUDGET_UPDATED_MESSAGE = '✓ Presupuesto actualizado'

function joinSpanishList(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
}

export function describeEffects(actions: ReconcileAction[]): string | null {
  const created: string[] = []
  if (actions.some((a) => a.op === 'create_task')) created.push('Preparativos')
  if (actions.some((a) => a.op === 'create_budget')) created.push('Presupuesto')
  if (created.length > 0) return `✅ Añadido a ${joinSpanishList(created)}`
  if (actions.some((a) => a.op === 'complete_task')) return TASK_COMPLETED_MESSAGE
  const removed: string[] = []
  if (actions.some((a) => a.op === 'delete_task')) removed.push('Preparativos')
  if (actions.some((a) => a.op === 'delete_budget')) removed.push('Presupuesto')
  if (removed.length > 0) return `🗑️ Retirado de ${joinSpanishList(removed)}`
  return null
}
