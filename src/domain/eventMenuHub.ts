// Eventos → «Menú del evento»: reglas puras del espacio operativo del menú. Sin Supabase ni React.
//
// Separación de papeles:
//   · «Comida y bebida» (configurador) = TOMAR DECISIONES (quién se encarga, momentos, menú decidido, infantil…).
//   · «Menú del evento» = TRABAJAR con el resultado. LEE esas decisiones y los datos de Invitados/RSVP; no crea
//     copias de ninguna de ellas (una sola fuente de verdad).
//
// Nada aquí inventa recetas, ingredientes, cantidades ni raciones, ni deduce una alergia de un nombre de plato
// más allá del aviso ya existente de «posible conflicto» (que siempre pide confirmar con quien cocina).
import { cooksThemselves, quienAnswer, venueIncludes, type FoodContext } from '@/domain/eventFood'
import { DIETARY_CATEGORIES, DIETARY_KIND_LABELS, findMenuConflicts, needAttends, needLine, type MenuConflict } from '@/domain/eventDietaryNeeds'
import { MENU_SECTIONS, sectionKeyForCategory } from '@/domain/eventFoodMenu'
import type { EventDietaryCategory, EventDietaryNeed, EventGuest, EventGuestMember, EventGuestQuestion, EventMenuReviewStatus, EventGuestQuestionAnswer, EventGuestQuestionOption, EventMenuItem } from '@/domain/types'

function norm(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

// ---------------------------------------------------------------------
// Quién se encarga de la comida → qué herramientas se ofrecen
// ---------------------------------------------------------------------
export type MenuToolsMode =
  | 'familia' // la preparamos nosotros / en casa
  | 'proveedor' // restaurante, catering, empresa externa o comida incluida en el lugar
  | 'mixto' // combinaremos varias opciones (incluye a la familia)
  | 'esperando' // todavía no se ha decidido cómo se organizará la comida
  | 'sin_comida' // no habrá comida

// La decisión «¿Quién se encargará de la comida?» (y lo que incluya el lugar) gobierna TODO. Se lee de
// FoodContext, la misma fuente que usa «Comida y bebida»; esta pantalla no guarda ninguna copia.
// Abre ESA receta (no el listado) y deja el evento de origen para volver al Menú del evento.
export function recipeLinkPath(recipeId: string, eventId: string): string {
  return `/alimentacion?tab=Recetas&receta=${encodeURIComponent(recipeId)}&volver=${encodeURIComponent(eventId)}`
}

// Vuelta al Menú del evento (mismo destino que usa la navegación real de Eventos: ?event= y ?modulo=).
export function eventMenuPath(eventId: string): string {
  return `/eventos?event=${encodeURIComponent(eventId)}&modulo=menu_compra`
}

export function menuToolsMode(ctx: FoodContext): MenuToolsMode {
  if (venueIncludes(ctx, 'comida')) return 'proveedor'
  const quien = quienAnswer(ctx)
  if (!quien) return 'esperando'
  switch (quien.choice) {
    case 'nosotros':
      return 'familia'
    case 'catering':
    case 'restaurante':
      return 'proveedor'
    case 'no_habra':
      return 'sin_comida'
    case 'combinar': {
      const ways = quien.combinar ?? []
      if (ways.length === 0) return 'esperando'
      if (!cooksThemselves(quien)) return 'proveedor'
      return ways.some((w) => w !== 'nosotros') ? 'mixto' : 'familia'
    }
    default:
      return 'esperando' // «todavía no lo sabemos» y «otro»: sin interpretar
  }
}

export type DishOrigin = 'familia' | 'proveedor'

// Origen efectivo de un plato. Solo en un evento MIXTO es una elección por plato (prepared_by); en el resto lo
// decide la decisión del evento. Sin indicar (null) en un evento mixto = todavía no participa en herramientas.
export function dishOrigin(mode: MenuToolsMode, preparedBy: DishOrigin | null): DishOrigin | null {
  if (mode === 'familia') return 'familia'
  if (mode === 'proveedor') return 'proveedor'
  if (mode === 'mixto') return preparedBy
  return null
}

// ¿Se ofrecen Recetas y Lista de la compra para este plato? Solo si lo prepara la familia.
export function dishHasKitchenTools(mode: MenuToolsMode, preparedBy: DishOrigin | null, kind: EventMenuItem['kind'] = 'dish'): boolean {
  // Un encabezado o una nota no son comida: nunca ofrecen receta ni Compras.
  return kind === 'dish' && dishOrigin(mode, preparedBy) === 'familia'
}

// ¿Se muestran los accesos generales a Recetas / Lista de la compra?
export function showKitchenLinks(mode: MenuToolsMode): boolean {
  return mode === 'familia' || mode === 'mixto'
}

export const TOOLS_WAITING_MESSAGE = 'Cuando decidáis quién se encarga de la comida (en «Comida y bebida»), aparecerán aquí las herramientas que correspondan.'
export const NO_FOOD_MESSAGE = 'Habéis indicado que no habrá comida en este evento.'

// ---------------------------------------------------------------------
// Secciones del menú: qué se ve, en qué orden, cuáles ha creado o ocultado la familia
// ---------------------------------------------------------------------
export interface StoredSection {
  key: string // clave del catálogo (aperitivo, entrantes…) o «custom:…» para las creadas por la familia
  label: string
  hidden: boolean
  custom?: boolean
}

// Las que se ven de partida; el resto está a un toque en «Gestionar secciones». Nadie está obligado a usar todas.
export const DEFAULT_VISIBLE_SECTION_KEYS = ['aperitivo', 'entrantes', 'plato_principal', 'postres']

export function defaultSections(infantilNeeded: boolean): StoredSection[] {
  return MENU_SECTIONS.map((s) => ({
    key: s.key,
    label: s.label,
    hidden: !(DEFAULT_VISIBLE_SECTION_KEYS.includes(s.key) || (s.key === 'menu_infantil' && infantilNeeded)),
  }))
}

// Valida lo guardado (jsonb) sin fiarse de él: lo que no encaja se descarta; null = nunca se configuró.
export function normalizeStoredSections(raw: unknown): StoredSection[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const seen = new Set<string>()
  const out: StoredSection[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    if (typeof e.key !== 'string' || !e.key || seen.has(e.key)) continue
    const catalog = MENU_SECTIONS.find((s) => s.key === e.key)
    const label = catalog ? catalog.label : typeof e.label === 'string' ? e.label.trim() : ''
    if (!label) continue
    seen.add(e.key)
    out.push({ key: e.key, label, hidden: e.hidden === true, ...(catalog ? {} : { custom: true }) })
  }
  return out.length > 0 ? out : null
}

export interface SectionView {
  key: string
  label: string
  custom: boolean
  // Configurada como oculta pero visible porque contiene platos (nunca se esconden platos).
  forced: boolean
  // Agrupa platos cuya sección no es del catálogo ni creada por la familia (datos antiguos o importados).
  virtual: boolean
  items: EventMenuItem[]
}

function itemMatchesSection(item: EventMenuItem, section: StoredSection): boolean {
  if (!section.custom) return sectionKeyForCategory(item.category) === section.key
  return item.category !== null && norm(item.category) === norm(section.label)
}

// Lo que se muestra: las secciones configuradas (o las de partida), con sus platos. Una sección oculta que aún
// tiene platos se ve igualmente (forced). Los platos sin sección conocida se agrupan aparte: NADA se descarta.
export function resolveMenuSections(stored: StoredSection[] | null, allItems: EventMenuItem[], infantilNeeded: boolean): { visible: SectionView[]; hidden: SectionView[]; config: StoredSection[] } {
  // La sección clasifica PLATOS; los encabezados y notas del menú no pertenecen a ninguna.
  const items = allItems.filter((i) => i.kind === 'dish')
  const config = completeSections(stored ?? defaultSections(infantilNeeded))
  const claimed = new Set<string>()
  const views: SectionView[] = config.map((s) => {
    const mine = items.filter((i) => itemMatchesSection(i, s))
    mine.forEach((i) => claimed.add(i.id))
    return { key: s.key, label: s.label, custom: Boolean(s.custom), forced: s.hidden && mine.length > 0, virtual: false, items: mine }
  })
  const visible = views.filter((v, idx) => !config[idx].hidden || v.items.length > 0)
  const hidden = views.filter((v, idx) => config[idx].hidden && v.items.length === 0)

  const leftovers = items.filter((i) => !claimed.has(i.id))
  const extras = new Map<string, SectionView>()
  for (const item of leftovers) {
    const label = item.category?.trim() || 'Sin sección'
    const key = item.category?.trim() ? `extra:${norm(label)}` : 'sin_seccion'
    const view = extras.get(key) ?? { key, label, custom: false, forced: false, virtual: true, items: [] }
    view.items.push(item)
    extras.set(key, view)
  }
  return { visible: [...visible, ...extras.values()], hidden, config }
}

// Una configuración guardada antes de existir una sección nueva del catálogo no la pierde: se añade oculta.
function completeSections(sections: StoredSection[]): StoredSection[] {
  const present = new Set(sections.map((s) => s.key))
  const missing = MENU_SECTIONS.filter((s) => !present.has(s.key)).map((s) => ({ key: s.key, label: s.label, hidden: true }))
  return [...sections, ...missing]
}

// Solo se puede ocultar una sección SIN platos. Con platos hay que moverlos o borrarlos antes (nunca se pierden).
export function canHideSection(view: Pick<SectionView, 'items' | 'virtual'>): boolean {
  return !view.virtual && view.items.length === 0
}

export function setSectionHidden(config: StoredSection[], key: string, hidden: boolean): StoredSection[] {
  return config.map((s) => (s.key === key ? { ...s, hidden } : s))
}

export interface AddSectionResult {
  config: StoredSection[]
  error: string | null
  // true = ya existía (catálogo o propia) y solo se ha vuelto a mostrar.
  revived: boolean
}

export const DUPLICATE_SECTION_MESSAGE = 'Esa sección ya existe: la he vuelto a mostrar.'
export const EMPTY_SECTION_MESSAGE = 'Escribe el nombre de la sección.'

export function addCustomSection(config: StoredSection[], rawLabel: string): AddSectionResult {
  const label = rawLabel.trim().replace(/\s+/g, ' ').slice(0, 60)
  if (!label) return { config, error: EMPTY_SECTION_MESSAGE, revived: false }
  const knownKey = sectionKeyForCategory(label)
  const existing = config.find((s) => (knownKey ? s.key === knownKey : norm(s.label) === norm(label)))
  if (existing) return { config: setSectionHidden(config, existing.key, false), error: null, revived: true }
  const key = `custom:${norm(label).replace(/[^a-z0-9]+/g, '-')}`
  return { config: [...config, { key, label, hidden: false, custom: true }], error: null, revived: false }
}

// Una sección creada por la familia, vacía, se puede quitar del todo; las del catálogo solo se ocultan.
export function removeCustomSection(config: StoredSection[], key: string): StoredSection[] {
  return config.filter((s) => !(s.key === key && s.custom))
}

// Reordena las secciones VISIBLES (arrastrando o con Subir/Bajar). Las ocultas conservan su lugar relativo.
export function reorderVisibleSections(config: StoredSection[], visibleKeysInOrder: string[]): StoredSection[] {
  const visibleKeys = new Set(visibleKeysInOrder)
  const queue = [...visibleKeysInOrder]
  const byKey = new Map(config.map((s) => [s.key, s]))
  return config.map((s) => (visibleKeys.has(s.key) ? (byKey.get(queue.shift() as string) as StoredSection) : s))
}

// Etiqueta que se guarda en event_menu_items.category al poner un plato en una sección.
export function categoryForSection(view: Pick<SectionView, 'label' | 'virtual'>): string | null {
  return view.virtual && view.label === 'Sin sección' ? null : view.label
}

// ---------------------------------------------------------------------
// Comensales (lo que PEPA YA sabe de Invitados/RSVP; aquí solo se resume)
// ---------------------------------------------------------------------
export interface DinersSummary {
  totalGuests: number
  confirmedGuests: number
  confirmedPeople: number
  confirmedAdults: number
  confirmedChildren: number
  // Invitaciones sin respuesta firme: pendientes y «no seguro» (misma definición que computeFoodNeedsState).
  openGuests: number
  openPeople: number
  declinedGuests: number
  allResponded: boolean
}

function declared(g: EventGuest): { adults: number; children: number } {
  return { adults: g.adultsCount, children: g.childrenCount }
}

export function computeDiners(guests: EventGuest[]): DinersSummary {
  let confirmedAdults = 0
  let confirmedChildren = 0
  let confirmedGuests = 0
  let openGuests = 0
  let openPeople = 0
  let declinedGuests = 0
  for (const g of guests) {
    if (g.rsvpStatus === 'confirmado') {
      confirmedGuests += 1
      confirmedAdults += g.rsvpAdultsCount ?? g.adultsCount
      confirmedChildren += g.rsvpChildrenCount ?? g.childrenCount
    } else if (g.rsvpStatus === 'no_asiste') {
      declinedGuests += 1
    } else {
      openGuests += 1
      const d = declared(g)
      openPeople += Math.max(1, d.adults + d.children)
    }
  }
  const attending = guests.filter((g) => g.rsvpStatus !== 'no_asiste').length
  return {
    totalGuests: guests.length,
    confirmedGuests,
    confirmedPeople: confirmedAdults + confirmedChildren,
    confirmedAdults,
    confirmedChildren,
    openGuests,
    openPeople,
    declinedGuests,
    allResponded: guests.length > 0 && openGuests === 0 && attending > 0,
  }
}

// ---------------------------------------------------------------------
// Necesidades alimentarias: agrupadas, con QUIÉN y el texto ORIGINAL de cada persona
// ---------------------------------------------------------------------
export interface NeedGroup {
  key: string
  category: EventDietaryNeed['category']
  alergia: boolean
  line: string // «2 necesitan comida sin gluten», «1 ha indicado alergia al marisco»
  people: { id: string; name: string; originalText: string }[]
}

function personName(need: EventDietaryNeed, guests: EventGuest[], members: EventGuestMember[]): string {
  const guest = guests.find((g) => g.id === need.guestId)
  const member = need.memberId ? members.find((m) => m.id === need.memberId) : undefined
  return member ? `${member.name}${guest && guest.displayName !== member.name ? ` (${guest.displayName})` : ''}` : (guest?.displayName ?? 'Invitado')
}

// Solo las necesidades de quien asiste (las de invitaciones que declinan no cuentan). El texto que escribió la
// persona se conserva SIEMPRE tal cual; la clasificación («Sin gluten») es solo operativa y no un diagnóstico.
export function groupNeeds(needs: EventDietaryNeed[], guests: EventGuest[], members: EventGuestMember[]): NeedGroup[] {
  const groups = new Map<string, NeedGroup>()
  for (const need of needs.filter((n) => needAttends(n, guests, members))) {
    const alergia = need.kind === 'alergia'
    const key = `${need.category}:${alergia ? 'a' : 'n'}`
    const group = groups.get(key) ?? { key, category: need.category, alergia, line: '', people: [] }
    const id = need.memberId ?? `g:${need.guestId}`
    if (!group.people.some((p) => p.id === id)) group.people.push({ id, name: personName(need, guests, members), originalText: need.originalText })
    groups.set(key, group)
  }
  return [...groups.values()].map((g) => ({ ...g, line: needLine(g.category, g.alergia, g.people.length) }))
}

// ---------------------------------------------------------------------
// Cruce menú ↔ necesidades: AVISO para revisar, nunca una certeza
// ---------------------------------------------------------------------
export interface ConflictInfo {
  dishId: string
  category: EventDietaryNeed['category']
  headline: string // «Posible conflicto con una necesidad alimentaria de 1 comensal»
  detail: string // «Sin marisco (alergia): María»
  people: string[]
}

export function conflictInfo(conflicts: MenuConflict[], activeNeeds: EventDietaryNeed[], guests: EventGuest[], members: EventGuestMember[]): Map<string, ConflictInfo[]> {
  const byDish = new Map<string, ConflictInfo[]>()
  for (const c of conflicts) {
    const matching = activeNeeds.filter((n) => n.category === c.category)
    const names = [...new Set(matching.map((n) => personName(n, guests, members)))]
    const alergia = matching.some((n) => n.kind === 'alergia')
    const n = names.length
    const info: ConflictInfo = {
      dishId: c.dishId,
      category: c.category,
      headline: `Posible conflicto con una necesidad alimentaria de ${n} comensal${n === 1 ? '' : 'es'}`,
      detail: `${DIETARY_CATEGORIES[c.category].label}${alergia ? ' (alergia)' : ''}: ${names.join(', ')}`,
      people: names,
    }
    byDish.set(c.dishId, [...(byDish.get(c.dishId) ?? []), info])
  }
  return byDish
}

// ---------------------------------------------------------------------
// Preguntas a los invitados CLASIFICADAS como de comida (event_guest_questions.topic = 'comida')
// ---------------------------------------------------------------------
export interface FoodQuestionResult {
  question: EventGuestQuestion
  options: { id: string | null; label: string; people: string[] }[]
}

// Solo las preguntas que la familia marcó como de comida; las respuestas son las que ya guarda el RSVP
// (event_guest_question_answers): aquí no se copia nada. NUNCA se decide por palabras del texto.
export function foodQuestionResults(
  questions: EventGuestQuestion[],
  options: EventGuestQuestionOption[],
  answers: EventGuestQuestionAnswer[],
  guests: EventGuest[],
  members: EventGuestMember[],
): FoodQuestionResult[] {
  const guestById = new Map(guests.map((g) => [g.id, g]))
  const memberById = new Map(members.map((m) => [m.id, m]))
  return questions
    .filter((q) => q.topic === 'comida' && q.active)
    .map((question) => {
      const own = options.filter((o) => o.questionId === question.id).sort((a, b) => a.sortOrder - b.sortOrder)
      const rows = answers.filter((a) => a.questionId === question.id)
      const groups = own.map((o) => ({ id: o.id as string | null, label: o.label, people: [] as string[] }))
      for (const answer of rows) {
        const guest = guestById.get(answer.guestId)
        if (!guest || guest.rsvpStatus === 'no_asiste') continue
        const member = answer.memberId ? memberById.get(answer.memberId) : undefined
        if (member && member.rsvpAttending === false) continue
        const name = member ? `${member.name}${guest.displayName !== member.name ? ` (${guest.displayName})` : ''}` : guest.displayName
        const target = groups.find((g) => g.id === answer.optionId)
        if (target) target.people.push(name)
      }
      return { question, options: groups }
    })
}

// Preguntas todavía SIN clasificar (la familia decide si son de comida; PEPA no lo adivina).
export function unclassifiedQuestions(questions: EventGuestQuestion[]): EventGuestQuestion[] {
  return questions.filter((q) => q.topic === null && q.active)
}

// ---------------------------------------------------------------------
// Alternativas por comensal (2.ª tanda): cada conflicto de un plato se desglosa POR PERSONA. El plato general
// no cambia; la alternativa es de esa persona y se vuelve a comprobar contra SUS necesidades (nunca es «segura»).
// ---------------------------------------------------------------------
export interface PersonConflictRow {
  dishId: string
  needId: string
  category: EventDietaryCategory
  personLabel: string // «Jorge (Familia Ramón)»
  detail: string // «Sin marisco · Alergia»
  personNeeds: EventDietaryNeed[] // todas las necesidades activas de ESA persona
}

export function personConflictRows(conflicts: MenuConflict[], activeNeeds: EventDietaryNeed[], guests: EventGuest[], members: EventGuestMember[]): PersonConflictRow[] {
  const rows: PersonConflictRow[] = []
  for (const c of conflicts) {
    for (const n of activeNeeds) {
      if (n.category !== c.category) continue
      rows.push({
        dishId: c.dishId,
        needId: n.id,
        category: c.category,
        personLabel: personName(n, guests, members),
        detail: `${DIETARY_CATEGORIES[c.category].label}${n.kind ? ` · ${DIETARY_KIND_LABELS[n.kind]}` : ''}`,
        personNeeds: activeNeeds.filter((o) => o.guestId === n.guestId && (o.memberId ?? null) === (n.memberId ?? null)),
      })
    }
  }
  return rows
}

// Comprueba el TEXTO de una alternativa contra las necesidades de su persona. Un resultado vacío NO significa segura.
export function alternativeConflicts(altText: string, personNeeds: EventDietaryNeed[]): MenuConflict[] {
  return findMenuConflicts([{ id: 'alternativa', name: altText, notes: null }], personNeeds)
}

export function alternativeKey(dishId: string, needId: string): string {
  return `${dishId}:${needId}`
}

// Etiquetas de los estados de revisión de una alternativa (en el dominio: la UI las importa, los tests no cargan Supabase).
export const REVIEW_STATUS_LABELS: Record<EventMenuReviewStatus, string> = {
  pendiente: 'Pendiente de revisar',
  alternativa_prevista: 'Alternativa prevista',
  confirmado_preparador: 'Confirmado con quien prepara la comida',
  confirmado_restaurante: 'Confirmado con restaurante/catering',
}
