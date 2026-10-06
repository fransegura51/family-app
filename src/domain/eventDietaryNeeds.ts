// Eventos — "Comida y bebida": necesidades alimentarias de los invitados (puro, sin Supabase).
//
// SEPARA tres cosas que nunca deben mezclarse:
//   1. NOTAS: texto libre que ya existía (event_guests.notes, event_guests.rsvp_note). Siguen siendo notas.
//   2. NECESIDADES: filas estructuradas (event_guest_dietary_needs) que conservan el texto ORIGINAL declarado
//      (jamás se sobrescribe), la clasificación OPERATIVA de PEPA (category) y el tipo (kind) solo cuando
//      se puede determinar con seguridad.
//   3. SUGERENCIAS: lo que PEPA detecta en una nota. Nunca cuenta como necesidad hasta que quien organiza
//      la confirma.
//
// Esto sirve para ORGANIZAR el evento, no es un diagnóstico: celiaquía, alergia al trigo y preferencia por
// comer sin gluten NO son equivalentes médicamente; por eso `kind` las distingue cuando el texto lo dice y
// `category` solo indica qué hay que vigilar en el menú. "Intolerancia a la lactosa" → categoría operativa
// "Sin lactosa", sin tocar lo que se declaró.
//
// SEGURIDAD: PEPA nunca certifica que un plato sea seguro. Que no aparezca ningún aviso NO significa que el
// menú sea seguro. Los textos hablan siempre de "posible conflicto" / "conviene revisar" y mandan a
// confirmarlo con el restaurante o el proveedor.
import type {
  EventDietaryCategory,
  EventDietaryKind,
  EventDietaryNeed,
  EventGuest,
  EventGuestMember,
  EventMenuItem,
} from '@/domain/types'

export const FOOD_SAFETY_DISCLAIMER =
  'PEPA es una herramienta de organización y puede equivocarse o no disponer de toda la información. En platos preparados por restaurantes, catering o terceros puede desconocer ingredientes, trazas o contaminación cruzada. Confirma siempre las necesidades alimentarias directamente con la persona afectada y con quien prepare la comida.'

interface CategoryMeta {
  label: string
  // "alergia …" — ya lleva su preposición ("al marisco", "a los frutos secos")
  allergen: string
  // "necesita comida …"
  phrase: string
}

export const DIETARY_CATEGORIES: Record<EventDietaryCategory, CategoryMeta> = {
  gluten: { label: 'Sin gluten', allergen: 'al gluten', phrase: 'sin gluten' },
  lactosa: { label: 'Sin lactosa', allergen: 'a la lactosa', phrase: 'sin lactosa' },
  lacteos: { label: 'Sin lácteos', allergen: 'a los lácteos', phrase: 'sin lácteos' },
  huevo: { label: 'Sin huevo', allergen: 'al huevo', phrase: 'sin huevo' },
  frutos_secos: { label: 'Sin frutos secos', allergen: 'a los frutos secos', phrase: 'sin frutos secos' },
  cacahuete: { label: 'Sin cacahuete', allergen: 'al cacahuete', phrase: 'sin cacahuete' },
  marisco: { label: 'Sin marisco', allergen: 'al marisco', phrase: 'sin marisco' },
  pescado: { label: 'Sin pescado', allergen: 'al pescado', phrase: 'sin pescado' },
  soja: { label: 'Sin soja', allergen: 'a la soja', phrase: 'sin soja' },
  vegetariano: { label: 'Vegetariano', allergen: 'a la carne y el pescado', phrase: 'vegetariana' },
  vegano: { label: 'Vegano', allergen: 'a los productos de origen animal', phrase: 'vegana' },
  sin_cerdo: { label: 'Sin cerdo', allergen: 'al cerdo', phrase: 'sin cerdo' },
  sin_alcohol: { label: 'Sin alcohol', allergen: 'al alcohol', phrase: 'sin alcohol' },
  otra: { label: 'Otra necesidad', allergen: 'algo que han indicado', phrase: 'con alguna necesidad indicada' },
}

export const DIETARY_CATEGORY_KEYS = Object.keys(DIETARY_CATEGORIES) as EventDietaryCategory[]

export const DIETARY_KIND_LABELS: Record<EventDietaryKind, string> = {
  alergia: 'Alergia',
  intolerancia: 'Intolerancia',
  celiaquia: 'Celiaquía',
  preferencia: 'Preferencia',
  dieta: 'Dieta',
  otro: 'Otro',
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

// ---------------------------------------------------------------------
// Normalización (SUGERENCIA, nunca decisión): del texto declarado a categorías operativas.
// ---------------------------------------------------------------------
interface Rule {
  category: EventDietaryCategory
  pattern: RegExp
}

const CLASSIFY_RULES: Rule[] = [
  { category: 'gluten', pattern: /\b(celiac[oa]s?|celiaqui[ao]|gluten|trigo)\b/ },
  { category: 'lactosa', pattern: /\blactosa\b/ },
  { category: 'lacteos', pattern: /\b(lacteos?|leche)\b/ },
  { category: 'huevo', pattern: /\bhuevos?\b/ },
  { category: 'frutos_secos', pattern: /\b(frutos? secos?|nueces|nuez|almendras?|avellanas?|pistachos?|anacardos?|piñones?|pinones?)\b/ },
  { category: 'cacahuete', pattern: /\b(cacahuetes?|mani)\b/ },
  { category: 'marisco', pattern: /\b(mariscos?|gambas?|langostinos?|cangrejos?|mejillones?|almejas?|crustaceos?|moluscos?)\b/ },
  { category: 'pescado', pattern: /\bpescados?\b/ },
  { category: 'soja', pattern: /\bsoja\b/ },
  { category: 'vegano', pattern: /\b(veganos?|veganas?)\b/ },
  { category: 'vegetariano', pattern: /\bvegetarian[oa]s?\b/ },
  { category: 'sin_cerdo', pattern: /\b(sin cerdo|no come cerdo|no (puede )?comer cerdo)\b/ },
  { category: 'sin_alcohol', pattern: /\b(sin alcohol|no bebe alcohol|no toma alcohol)\b/ },
]

export function classifyKind(text: string, category: EventDietaryCategory): EventDietaryKind | null {
  const t = normalize(text)
  if (category === 'gluten' && /\bceliac|celiaqui/.test(t)) return 'celiaquia'
  if (/\balergi/.test(t)) return 'alergia'
  if (/\bintoleranci/.test(t)) return 'intolerancia'
  if (category === 'vegano' || category === 'vegetariano') return 'dieta'
  if (category === 'sin_cerdo' || category === 'sin_alcohol') return 'preferencia'
  if (/\b(prefiere|preferencia)\b/.test(t)) return 'preferencia'
  // "sin gluten" a secas no dice si es celiaquía, alergia o preferencia: NO se adivina.
  return null
}

export interface DietarySuggestion {
  category: EventDietaryCategory
  kind: EventDietaryKind | null
}

// Un mismo texto puede mencionar varias necesidades ("alergia a frutos secos y sin lactosa"). Devuelve
// una sugerencia por categoría distinta. Un texto sin ninguna palabra reconocida → [] (se guardaría, si la
// familia quiere, como "Otra necesidad" a mano; nunca se inventa una categoría).
export function suggestDietaryNeeds(text: string | null | undefined): DietarySuggestion[] {
  if (!text || !text.trim()) return []
  const t = normalize(text)
  const out: DietarySuggestion[] = []
  for (const rule of CLASSIFY_RULES) {
    if (rule.pattern.test(t) && !out.some((o) => o.category === rule.category)) {
      out.push({ category: rule.category, kind: classifyKind(text, rule.category) })
    }
  }
  // "lactosa" ya cubre la leche: no se sugiere además "lácteos" salvo que lo diga aparte.
  return out
}

// ---------------------------------------------------------------------
// Sugerencias a partir de las NOTAS de los invitados (event_guests.notes / rsvp_note).
// ---------------------------------------------------------------------
export interface NoteSuggestion {
  guestId: string
  guestName: string
  noteSource: 'nota' | 'rsvp'
  text: string
  category: EventDietaryCategory
  kind: EventDietaryKind | null
  // Personas de esa invitación a las que PUEDE corresponder la nota (vacío si la invitación no tiene personas).
  memberCandidates: { id: string; name: string }[]
  // Persona preseleccionada SOLO si es inequívoca (una sola persona en la invitación, o un único nombre citado en la nota).
  // Si no lo es, es null y quien organiza debe elegir al confirmar: nunca se adivina.
  memberId: string | null
}

// Nombre citado en la nota (con límites de palabra y sin tildes). Un único nombre coincidente basta; si coinciden
// varios, no se elige ninguno.
function inferMemberFromText(text: string, candidates: { id: string; name: string }[]): string | null {
  if (candidates.length === 1) return candidates[0].id
  const haystack = normalizeForMatch(text)
  const named = candidates.filter((c) => {
    const needle = normalizeForMatch(c.name)
    return needle.length >= 2 && new RegExp(`(^|[^a-z])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(haystack)
  })
  return named.length === 1 ? named[0].id : null
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

// `dismissed`: sugerencias que la familia ya ha descartado (event_dietary_suggestion_dismissals) — no vuelven a salir.
// `members`: personas de las invitaciones (event_guest_members); opcional para no romper llamadas antiguas.
export function suggestFromGuestNotes(
  guests: EventGuest[],
  needs: EventDietaryNeed[],
  dismissed: { guestId: string; category: EventDietaryCategory }[] = [],
  members: { id: string; guestId: string; name: string }[] = [],
): NoteSuggestion[] {
  const out: NoteSuggestion[] = []
  for (const g of guests) {
    if (g.rsvpStatus === 'no_asiste') continue
    const candidates = members.filter((m) => m.guestId === g.id).map((m) => ({ id: m.id, name: m.name }))
    const sources: { source: 'nota' | 'rsvp'; text: string | null }[] = [
      { source: 'nota', text: g.notes },
      { source: 'rsvp', text: g.rsvpNote },
    ]
    for (const { source, text } of sources) {
      for (const s of suggestDietaryNeeds(text)) {
        const already = needs.some((n) => n.guestId === g.id && n.category === s.category)
        const duplicated = out.some((o) => o.guestId === g.id && o.category === s.category)
        const wasDismissed = dismissed.some((d) => d.guestId === g.id && d.category === s.category)
        if (!already && !duplicated && !wasDismissed) {
          const original = (text ?? '').trim()
          out.push({
            guestId: g.id,
            guestName: g.displayName,
            noteSource: source,
            text: original,
            category: s.category,
            kind: s.kind,
            memberCandidates: candidates,
            memberId: inferMemberFromText(original, candidates),
          })
        }
      }
    }
  }
  return out
}

// ---------------------------------------------------------------------
// Estado de confirmaciones + necesidades de los ASISTENTES.
// ---------------------------------------------------------------------
export interface FoodNeedsState {
  totalGuests: number
  // Personas (adultos + niños) de invitaciones que todavía no han confirmado ni declinado.
  pendingPeople: number
  pendingGuests: number
  allConfirmed: boolean
  // Necesidades que cuentan: de invitaciones que no han declinado y de personas que no han dicho "no viene".
  activeNeeds: EventDietaryNeed[]
  lines: string[]
}

function guestUnitPeople(g: EventGuest): number {
  const a = g.rsvpStatus === 'confirmado' ? (g.rsvpAdultsCount ?? g.adultsCount) : g.adultsCount
  const c = g.rsvpStatus === 'confirmado' ? (g.rsvpChildrenCount ?? g.childrenCount) : g.childrenCount
  return Math.max(1, a + c)
}

export function needAttends(need: EventDietaryNeed, guests: EventGuest[], members: EventGuestMember[]): boolean {
  const guest = guests.find((g) => g.id === need.guestId)
  if (!guest || guest.rsvpStatus === 'no_asiste') return false
  if (need.memberId) {
    const member = members.find((m) => m.id === need.memberId)
    if (member && member.rsvpAttending === false) return false
  }
  return true
}

export function needLine(category: EventDietaryCategory, alergia: boolean, n: number): string {
  const meta = DIETARY_CATEGORIES[category]
  if (alergia) return `${n} ${n === 1 ? 'ha indicado' : 'han indicado'} alergia ${meta.allergen}`
  return `${n} ${n === 1 ? 'necesita' : 'necesitan'} comida ${meta.phrase}`
}

export function dietaryNeedLines(needs: EventDietaryNeed[]): string[] {
  const groups = new Map<string, { category: EventDietaryCategory; alergia: boolean; people: Set<string> }>()
  for (const need of needs) {
    const alergia = need.kind === 'alergia'
    const key = `${need.category}:${alergia ? 'a' : 'n'}`
    const g = groups.get(key) ?? { category: need.category, alergia, people: new Set<string>() }
    g.people.add(need.memberId ?? `g:${need.guestId}`)
    groups.set(key, g)
  }
  return [...groups.values()].map((g) => needLine(g.category, g.alergia, g.people.size))
}

export function computeFoodNeedsState(guests: EventGuest[], members: EventGuestMember[], needs: EventDietaryNeed[]): FoodNeedsState {
  const open = guests.filter((g) => g.rsvpStatus === 'pendiente' || g.rsvpStatus === 'no_seguro')
  const pendingPeople = open.reduce((sum, g) => sum + guestUnitPeople(g), 0)
  const attendingGuests = guests.filter((g) => g.rsvpStatus !== 'no_asiste')
  const activeNeeds = needs.filter((n) => needAttends(n, guests, members))
  return {
    totalGuests: guests.length,
    pendingPeople,
    pendingGuests: open.length,
    // "Todos confirmados" solo tiene sentido con invitados y con alguien que de verdad vaya a asistir.
    allConfirmed: guests.length > 0 && open.length === 0 && attendingGuests.length > 0,
    activeNeeds,
    lines: dietaryNeedLines(activeNeeds),
  }
}

export type FoodNeedsBanner =
  | { kind: 'sin_invitados' }
  | { kind: 'provisional'; title: string; lines: string[] }
  | { kind: 'alerta'; title: string; lines: string[] }
  | { kind: 'positivo'; title: string; lines: string[] }

export function foodNeedsBanner(state: FoodNeedsState): FoodNeedsBanner {
  if (state.totalGuests === 0) return { kind: 'sin_invitados' }
  if (!state.allConfirmed) {
    const n = state.pendingPeople
    if (state.pendingGuests === 0) return { kind: 'sin_invitados' }
    return {
      kind: 'provisional',
      title: `Información provisional · falta${n === 1 ? '' : 'n'} ${n} persona${n === 1 ? '' : 's'} por confirmar.`,
      lines: state.lines,
    }
  }
  if (state.activeNeeds.length > 0) {
    return {
      kind: 'alerta',
      title: '⚠️ Ya han confirmado todos los invitados. Entre los asistentes hay necesidades alimentarias que conviene revisar antes de cerrar el menú.',
      lines: state.lines,
    }
  }
  return { kind: 'positivo', title: '✓ Ya han confirmado todos los invitados. No hay necesidades alimentarias declaradas entre los asistentes.', lines: [] }
}

// ¿Procede la pregunta "¿Habéis tenido en cuenta estas necesidades en el menú?"? Solo con todos
// confirmados y necesidades reales: es lo que decide si cuenta como pregunta pendiente del bloque.
export function needsReviewApplies(state: FoodNeedsState): boolean {
  return state.allConfirmed && state.activeNeeds.length > 0
}

// ---------------------------------------------------------------------
// Cruce menú ↔ necesidades. Heurístico y conservador en el lenguaje: "posible conflicto".
// ---------------------------------------------------------------------
const MEAT = 'carne|jamon|pollo|ternera|cerdo|cordero|chorizo|lomo|salchicha|hamburguesa|bacon|panceta|salchichon|morcilla|cochinillo|solomillo|costilla|pavo|conejo|pato|iberico'
const FISH = 'pescado|salmon|merluza|atun|bacalao|lubina|dorada|rape|boqueron|boquerones|anchoa|anchoas|sardina|sardinas|lenguado|rodaballo|trucha|caballa'
const SHELLFISH = 'marisco|mariscos|gamba|gambas|langostino|langostinos|cangrejo|mejillon|mejillones|almeja|almejas|calamar|calamares|pulpo|ostra|ostras|vieira|cigala|cigalas|bogavante|langosta|percebe|percebes|sepia|chipiron'

const DISH_PATTERNS: Partial<Record<EventDietaryCategory, RegExp>> = {
  gluten: /\b(pan|pasta|macarrones|espagueti|espaguetis|tallarines|pizza|croquetas?|empanad[ao]s?|empanadillas?|rebozad[ao]s?|harina|bizcocho|galletas?|cuscus|trigo|bechamel|lasana|canelones|cerveza|pastel)\b/,
  lactosa: /\b(queso|quesos|leche|nata|mantequilla|yogur|helado|bechamel|flan|natillas|crema|cheesecake)\b/,
  lacteos: /\b(queso|quesos|leche|nata|mantequilla|yogur|helado|bechamel|flan|natillas|crema|cheesecake)\b/,
  huevo: /\b(huevos?|tortilla|mayonesa|mahonesa|merengue|flan|natillas)\b/,
  frutos_secos: /\b(nuez|nueces|almendras?|avellanas?|pistachos?|anacardos?|pinones?|frutos? secos?|turron|mazapan|praline)\b/,
  cacahuete: /\b(cacahuetes?|mani)\b/,
  marisco: new RegExp(`\\b(${SHELLFISH})\\b`),
  pescado: new RegExp(`\\b(${FISH})\\b`),
  soja: /\b(soja|tofu|edamame|salsa de soja)\b/,
  vegetariano: new RegExp(`\\b(${MEAT}|${FISH}|${SHELLFISH})\\b`),
  vegano: new RegExp(`\\b(${MEAT}|${FISH}|${SHELLFISH}|queso|quesos|huevos?|leche|nata|mantequilla|yogur|helado|miel)\\b`),
  sin_cerdo: /\b(cerdo|jamon|chorizo|lomo|panceta|bacon|salchichon|morcilla|cochinillo|iberico|secreto|presa)\b/,
  sin_alcohol: /\b(vino|vinos|cerveza|cervezas|cava|champan|sangria|licor|ginebra|whisky|ron|vodka|brandy|sidra)\b/,
}

export interface MenuConflict {
  dishId: string
  dishName: string
  category: EventDietaryCategory
  people: number
  message: string
}

function peopleWithCategory(needs: EventDietaryNeed[], category: EventDietaryCategory): { people: number; alergia: boolean } {
  const matching = needs.filter((n) => n.category === category)
  const people = new Set(matching.map((n) => n.memberId ?? `g:${n.guestId}`)).size
  return { people, alergia: matching.some((n) => n.kind === 'alergia') }
}

function conflictMessage(dishName: string, category: EventDietaryCategory, people: number, alergia: boolean): string {
  const meta = DIETARY_CATEGORIES[category]
  const who = people === 1 ? 'una persona que' : `${people} personas que`
  const what = alergia
    ? `${people === 1 ? 'ha indicado' : 'han indicado'} alergia ${meta.allergen}`
    : `${people === 1 ? 'necesita' : 'necesitan'} comida ${meta.phrase}`
  return `⚠️ Conviene revisar ‘${dishName}’: entre los asistentes hay ${who} ${what}.`
}

// Solo los PLATOS se cruzan con las necesidades: un encabezado o una nota («Cambio de Tercio») no es un alimento.
export function findMenuConflicts(dishes: (Pick<EventMenuItem, 'id' | 'name' | 'notes'> & { kind?: EventMenuItem['kind'] })[], activeNeeds: EventDietaryNeed[]): MenuConflict[] {
  const categories = [...new Set(activeNeeds.map((n) => n.category))]
  const out: MenuConflict[] = []
  for (const dish of dishes) {
    if (dish.kind !== undefined && dish.kind !== 'dish') continue
    const text = normalize(`${dish.name} ${dish.notes ?? ''}`)
    for (const category of categories) {
      const pattern = DISH_PATTERNS[category]
      if (!pattern || !pattern.test(text)) continue
      const { people, alergia } = peopleWithCategory(activeNeeds, category)
      out.push({ dishId: dish.id, dishName: dish.name, category, people, message: conflictMessage(dish.name, category, people, alergia) })
    }
  }
  return out
}

// Huella estable de lo que influye en el cruce: sirve para recalcular solo cuando algo cambia de verdad
// (menú, necesidades o asistencia), nunca en cada render.
export function conflictInputsSignature(dishes: Pick<EventMenuItem, 'id' | 'name' | 'notes'>[], activeNeeds: EventDietaryNeed[]): string {
  const d = dishes.map((x) => `${x.id}:${x.name}:${x.notes ?? ''}`).join('|')
  const n = activeNeeds.map((x) => `${x.id}:${x.category}:${x.kind ?? ''}`).join('|')
  return `${d}#${n}`
}
