// Fase 2 (plan de pendientes) — "🎭 Personas especiales" (boda/bautizo/comunión: padrino, madrina,
// testigos, damas de honor...) y "👪 Familiares" (bautizo/comunión: madre, padre, hermano/a, abuelo/a...).
// Mismo motor de decisiones que el resto del configurador (event_decisions + DesiredPairGeneration +
// reconcilePairGeneration, ver eventPairDecisions.ts) — nunca una segunda fuente de verdad. El roster en sí
// (quién es quién) vive aparte, en event_role_people (migración 0216), reutilizado como CRUD simple.
//
// Alcance deliberado de esta tanda (para no inventar estructura que no se pidió ni multiplicar preguntas):
// - "Permitir definir grupos y excepciones" (vestimenta/complementos) se resuelve con un único subconjunto
//   de personas ("todos"/"algunos" + a quién) más una nota libre para el matiz ("testigos en azul marino,
//   damas en burdeos") — no un editor de varios grupos independientes.
// - Los momentos especiales (alianzas, arras, primer baile...) NO referencian todavía a ninguna persona
//   (auditado: eventSpecialMoments.ts no tiene ningún campo de participante) — "relacionar un momento con
//   una persona ya identificada" no tiene hoy ningún caso real que conectar, así que no se inventa.
import { decisionStatus, FLORAL_GROUP_DEFAULT_NAME, FLORAL_GROUP_KIND, type DecisionStatus } from '@/domain/eventPairDecisions'
import type { DesiredPairGeneration } from '@/domain/eventPairDecisions'
import type { EventDecision, EventRolePerson, EventType } from '@/domain/types'

// ---------------------------------------------------------------------
// Roster — catálogos sugeridos (texto libre, nunca una lista cerrada: "+Otro papel"/"+Añadir otra
// persona" siempre admite cualquier cosa).
// ---------------------------------------------------------------------

// Comunión explícitamente NO impone padrino/madrina como figuras obligatorias — sin sugerencias fijas,
// la familia escribe el papel que corresponda con "+Otro papel" si lo necesita.
export const ESPECIAL_ROLE_SUGGESTIONS: Record<EventType, string[]> = {
  boda: ['Padrino', 'Madrina', 'Testigo', 'Dama de honor', 'Caballero de honor'],
  bautizo: ['Padrino', 'Madrina'],
  comunion: [],
  cumpleanos: [],
  celebracion: [],
  personalizado: [],
}

export const FAMILIARES_PARENTESCO_OPTIONS = ['Madre', 'Padre', 'Hermano/a', 'Abuelo/a', 'Tutor/a', 'Otro'] as const
export type FamiliaresParentesco = (typeof FAMILIARES_PARENTESCO_OPTIONS)[number]

export const ESPECIAL_COMPLEMENTOS_CATALOG = ['Prendido floral', 'Ramo', 'Pulsera/corsage floral', 'Tocado'] as const

// ---------------------------------------------------------------------
// Coincidencia con Invitados — NUNCA automática, solo sugiere. Comparación simple (sin distinguir
// mayúsculas/acentos): suficiente para una confirmación explícita del usuario, sin la complejidad de un
// motor de fuzzy-matching (eso es para reconocimiento de voz, ver voiceQuery.ts, un caso distinto).
// ---------------------------------------------------------------------

function normalizeName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

export interface GuestMatchCandidate {
  id: string
  name: string
}

// Coincide si el nombre escrito es (o contiene/está contenido en) el nombre real de un invitado
// desglosado — nunca al revés de una sola letra ("Ana" no coincide con cualquier nombre que empiece por
// A). Exige al menos 3 caracteres para evitar falsos positivos con nombres muy cortos.
export function suggestGuestMatches(name: string, candidates: GuestMatchCandidate[]): GuestMatchCandidate[] {
  const normalized = normalizeName(name)
  if (normalized.length < 3) return []
  return candidates.filter((c) => {
    const candidateNormalized = normalizeName(c.name)
    return candidateNormalized.length >= 3 && (candidateNormalized.includes(normalized) || normalized.includes(candidateNormalized))
  })
}

// ---------------------------------------------------------------------
// "🎭 Personas especiales" — preguntas conjuntas (nunca una por persona).
// ---------------------------------------------------------------------

export const ESPECIAL_HAY_QUESTION_KEY = 'personas_especiales.hay'
export const ESPECIAL_VESTIMENTA_QUESTION_KEY = 'personas_especiales.vestimenta'
export const ESPECIAL_COMPLEMENTOS_QUESTION_KEY = 'personas_especiales.complementos'
export const ESPECIAL_REGALOS_QUESTION_KEY = 'personas_especiales.regalos'

export type HayPersonasChoice = 'si' | 'no' | 'todavia_no_lo_sabemos'
export interface HayPersonasAnswer {
  choice: HayPersonasChoice
}

// Mismas 4 opciones para vestimenta y regalos; complementos añade el catálogo de abajo.
export type GrupoAlcanceChoice = 'todos' | 'algunos' | 'ninguno' | 'todavia_no_lo_sabemos'
export interface VestimentaCoordinadaAnswer {
  choice: GrupoAlcanceChoice
  // Solo relevante con choice === 'algunos' — a qué personas del roster afecta.
  selectedPersonIds: string[]
  note: string | null
}
// Tanda "Complementos por persona" — qué complemento(s) concretos lleva CADA persona (María → Prendido
// floral, Ana → Ramo), nunca el mismo complemento asignado a todas a la vez sin que nadie lo haya elegido
// así. items = subconjunto de ESPECIAL_COMPLEMENTOS_CATALOG; customItems = texto libre de "+Otro".
export interface ComplementoPersonaAsignacion {
  personId: string
  items: string[]
  customItems: string[]
}

export interface ComplementosEspecialesAnswer {
  choice: GrupoAlcanceChoice
  selectedPersonIds: string[]
  // Asignación concreta por persona — sustituye a la pareja "selected/customItems" de antes de esta tanda
  // (un único complemento compartido por todo el grupo). Ausente en una respuesta guardada ANTES de esta
  // tanda — usa normalizeComplementosAnswer() para leerla sin perder lo que ya estaba marcado.
  assignments?: ComplementoPersonaAsignacion[]
  /** @deprecated formato previo a "complementos por persona" — solo para normalizeComplementosAnswer(). */
  selected?: string[]
  /** @deprecated formato previo a "complementos por persona" — solo para normalizeComplementosAnswer(). */
  customItems?: string[]
  note: string | null
}

// Migra una respuesta ANTIGUA (un `selected`/`customItems` único, compartido por todo el subconjunto) al
// formato por persona, sin perder nada: cada persona que estaba en el subconjunto recibe la MISMA
// asignación que ya tenía — es la única lectura fiel posible de un dato que no distinguía por persona. Una
// respuesta que YA trae `assignments` se devuelve tal cual (nunca se reinterpreta dos veces).
export function normalizeComplementosAnswer(answer: ComplementosEspecialesAnswer, allPeopleIds: string[]): ComplementosEspecialesAnswer {
  if (answer.assignments) return answer
  const scopeIds = resolveEspecialScopePersonIds(answer.choice, answer.selectedPersonIds, allPeopleIds)
  const legacySelected = answer.selected ?? []
  const legacyCustom = answer.customItems ?? []
  if (legacySelected.length === 0 && legacyCustom.length === 0) return { ...answer, assignments: [] }
  return { ...answer, assignments: scopeIds.map((personId) => ({ personId, items: [...legacySelected], customItems: [...legacyCustom] })) }
}

// Reutilizado por vestimenta/complementos/regalos: "todos" son TODAS las personas del roster actual (no
// una lista guardada que pudiera quedarse desfasada), "algunos" son justo las elegidas, "ninguno"/"todavía
// no lo sabemos" no afectan a nadie todavía.
export function resolveEspecialScopePersonIds(choice: GrupoAlcanceChoice, selectedPersonIds: string[], allPeopleIds: string[]): string[] {
  if (choice === 'todos') return allPeopleIds
  if (choice === 'algunos') return selectedPersonIds
  return []
}
export interface RegalosEspecialesAnswer {
  choice: GrupoAlcanceChoice
  selectedPersonIds: string[]
}

export interface EspecialQuestionInfo {
  questionKey: string
  blockKey: 'personas_especiales'
  label: string
  status: DecisionStatus
}

function findDecision(decisions: EventDecision[], questionKey: string): EventDecision | undefined {
  return decisions.find((d) => d.questionKey === questionKey)
}

// Revelado progresivo: vestimenta/complementos/regalos solo son preguntas relevantes cuando "Sí" hay
// personas especiales Y el roster tiene al menos una persona de verdad (responder "Sí" sin añadir a nadie
// todavía no hace relevante nada más).
export function listEspecialBlockQuestions(decisions: EventDecision[], peopleCount: number): EspecialQuestionInfo[] {
  const out: EspecialQuestionInfo[] = []
  const hayDecision = findDecision(decisions, ESPECIAL_HAY_QUESTION_KEY)
  out.push({ questionKey: ESPECIAL_HAY_QUESTION_KEY, blockKey: 'personas_especiales', label: '¿Habrá personas con un papel especial?', status: decisionStatus(hayDecision) })
  const hay = hayDecision?.answer as unknown as HayPersonasAnswer | undefined
  if (hay?.choice === 'si' && peopleCount > 0) {
    out.push({ questionKey: ESPECIAL_VESTIMENTA_QUESTION_KEY, blockKey: 'personas_especiales', label: 'Vestimenta coordinada', status: decisionStatus(findDecision(decisions, ESPECIAL_VESTIMENTA_QUESTION_KEY)) })
    out.push({ questionKey: ESPECIAL_COMPLEMENTOS_QUESTION_KEY, blockKey: 'personas_especiales', label: 'Complementos especiales', status: decisionStatus(findDecision(decisions, ESPECIAL_COMPLEMENTOS_QUESTION_KEY)) })
    out.push({ questionKey: ESPECIAL_REGALOS_QUESTION_KEY, blockKey: 'personas_especiales', label: 'Regalos o detalles', status: decisionStatus(findDecision(decisions, ESPECIAL_REGALOS_QUESTION_KEY)) })
  }
  return out
}

export function summarizeEspecialBlock(decisions: EventDecision[], peopleCount: number): string {
  const statuses = listEspecialBlockQuestions(decisions, peopleCount).map((q) => q.status)
  const decided = statuses.filter((s) => s === 'decidida').length
  const pending = statuses.filter((s) => s === 'por_decidir').length
  const notStarted = statuses.filter((s) => s === 'sin_empezar').length
  const parts: string[] = []
  if (decided > 0) parts.push(`✓ ${decided} decidida${decided === 1 ? '' : 's'}`)
  if (pending > 0) parts.push(`⏳ ${pending} por decidir`)
  if (notStarted > 0) parts.push(`${notStarted} sin empezar`)
  return parts.join(' · ')
}

const NONE: DesiredPairGeneration = { taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false, groupKind: null, groupDefaultName: null }

// Tanda "Preparativos desglosados" — UN DesiredPairGeneration POR PERSONA con al menos un complemento
// asignado (María — Prendido floral / Ana — Ramo), nunca una sola tarea genérica para todo el grupo. Un
// ítem del catálogo (ESPECIAL_COMPLEMENTOS_CATALOG) es estructuralmente floral — los 4 valores lo son
// hoy —, así que agrupa en el mismo "Flores" que ya usa desiredForFloral (mismas constantes exportadas,
// FLORAL_GROUP_KIND/FLORAL_GROUP_DEFAULT_NAME); un texto libre de "+Otro" NUNCA se da por floral — nada de
// coincidencias frágiles de texto, solo lo que ya se sabe con certeza por venir del catálogo cerrado.
export interface ComplementoPersonaDesired {
  personId: string
  desired: DesiredPairGeneration
}

export function desiredForEspecialComplementosPorPersona(
  answer: ComplementosEspecialesAnswer,
  peopleById: Map<string, Pick<EventRolePerson, 'id' | 'name'>>,
): ComplementoPersonaDesired[] {
  if (answer.choice === 'ninguno' || answer.choice === 'todavia_no_lo_sabemos') return []
  const out: ComplementoPersonaDesired[] = []
  for (const a of answer.assignments ?? []) {
    if (a.items.length === 0 && a.customItems.length === 0) continue
    const person = peopleById.get(a.personId)
    if (!person) continue
    const isFloral = a.items.some((i) => (ESPECIAL_COMPLEMENTOS_CATALOG as readonly string[]).includes(i))
    out.push({
      personId: a.personId,
      desired: {
        taskTitle: `${person.name ?? 'Sin nombre'} — ${[...a.items, ...a.customItems].join(', ')}`,
        budgetCategory: null,
        providerCategory: null,
        resolved: false,
        groupKind: isFloral ? FLORAL_GROUP_KIND : null,
        groupDefaultName: isFloral ? FLORAL_GROUP_DEFAULT_NAME : null,
      },
    })
  }
  return out
}

// "Generar un único preparativo general... No generar un preparativo por persona. Si 'todavía no lo
// sabemos', mantener pendiente sin dar por hecho que habrá regalos."
export function desiredForEspecialRegalos(answer: RegalosEspecialesAnswer): DesiredPairGeneration {
  if (answer.choice === 'ninguno' || answer.choice === 'todavia_no_lo_sabemos') return NONE
  return { taskTitle: 'Decidir regalos para personas especiales', budgetCategory: null, providerCategory: null, resolved: false, groupKind: null, groupDefaultName: null }
}

// ---------------------------------------------------------------------
// "👪 Familiares" (bautizo/comunión) — UNA sola pregunta conjunta ("sin multiplicar preguntas").
// ---------------------------------------------------------------------

export const FAMILIARES_NECESIDADES_QUESTION_KEY = 'familiares.necesidades'

export type FamiliarNecesidad = 'vestimenta' | 'complementos' | 'peluqueria' | 'maquillaje'
export const FAMILIARES_NECESIDAD_OPTIONS: { value: FamiliarNecesidad; label: string }[] = [
  { value: 'vestimenta', label: 'Vestimenta especial' },
  { value: 'complementos', label: 'Complementos' },
  { value: 'peluqueria', label: 'Peluquería' },
  { value: 'maquillaje', label: 'Maquillaje' },
]
export interface FamiliaresNecesidadesAnswer {
  selected: FamiliarNecesidad[]
  alcance: 'todos' | 'algunos'
  selectedPersonIds: string[]
}

export interface FamiliarQuestionInfo {
  questionKey: string
  blockKey: 'familiares'
  label: string
  status: DecisionStatus
}

// Relevante solo si ya hay al menos un familiar en el roster — nunca una pregunta "sin empezar" artificial
// cuando todavía no se ha añadido a nadie.
export function listFamiliaresBlockQuestions(decisions: EventDecision[], peopleCount: number): FamiliarQuestionInfo[] {
  if (peopleCount === 0) return []
  return [
    {
      questionKey: FAMILIARES_NECESIDADES_QUESTION_KEY,
      blockKey: 'familiares',
      label: '¿Qué necesitan los familiares?',
      status: decisionStatus(findDecision(decisions, FAMILIARES_NECESIDADES_QUESTION_KEY)),
    },
  ]
}

export function summarizeFamiliaresBlock(decisions: EventDecision[], peopleCount: number): string {
  const statuses = listFamiliaresBlockQuestions(decisions, peopleCount).map((q) => q.status)
  const decided = statuses.filter((s) => s === 'decidida').length
  const pending = statuses.filter((s) => s === 'por_decidir').length
  const notStarted = statuses.filter((s) => s === 'sin_empezar').length
  const parts: string[] = []
  if (decided > 0) parts.push(`✓ ${decided} decidida${decided === 1 ? '' : 's'}`)
  if (pending > 0) parts.push(`⏳ ${pending} por decidir`)
  if (notStarted > 0) parts.push(`${notStarted} sin empezar`)
  return parts.join(' · ')
}

// ---------------------------------------------------------------------
// Roster — agrupar por papel para mostrarlo ordenado (p. ej. todos los "Testigo" juntos).
// ---------------------------------------------------------------------

export function rolePeopleByRole(people: Pick<EventRolePerson, 'id' | 'roles'>[]): Map<string, string[]> {
  const byRole = new Map<string, string[]>()
  for (const person of people) {
    const roles = person.roles.length > 0 ? person.roles : ['Sin papel asignado']
    for (const role of roles) {
      const ids = byRole.get(role) ?? []
      ids.push(person.id)
      byRole.set(role, ids)
    }
  }
  return byRole
}
