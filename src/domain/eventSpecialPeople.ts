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
import { decisionStatus, type DecisionStatus } from '@/domain/eventPairDecisions'
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
export interface ComplementosEspecialesAnswer {
  choice: GrupoAlcanceChoice
  selectedPersonIds: string[]
  selected: string[]
  customItems: string[]
  note: string | null
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

// "Conectar con Decoración/Flores y Preparativos sin crear automáticamente una tarea por persona": como
// mucho UN preparativo general para todo el grupo, nunca uno por persona — mismo principio que ya aplica
// en todo este motor (ver eventPairDecisions.ts, cabecera).
export function desiredForEspecialComplementos(answer: ComplementosEspecialesAnswer): DesiredPairGeneration {
  if (answer.choice === 'ninguno' || answer.choice === 'todavia_no_lo_sabemos') return NONE
  if (answer.selected.length === 0 && answer.customItems.length === 0) return NONE
  return { taskTitle: 'Preparar complementos de personas especiales', budgetCategory: null, providerCategory: null, resolved: false, groupKind: null, groupDefaultName: null }
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
