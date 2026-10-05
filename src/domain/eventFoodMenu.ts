// Eventos — "Comida y bebida": menú estructurado y elección de menú de los invitados (puro).
//
// Modelo (sin tabla paralela, extensión compatible de event_menu_items, migración 0192):
//   evento → sección (event_menu_items.category) → plato (event_menu_items.name) → receta OPCIONAL
//   (event_menu_items.recipe_id).
// Un plato puede ser solo «Paella», sin receta. NO hay motor de raciones ni de escalado: PEPA nunca inventa
// recetas, ingredientes, cantidades ni raciones.
//
// Esta estructura (platos con sección, nota y origen) deja preparada la futura generación de un «Menú
// oficial» (platos → plantilla → imprimir/compartir) sin construir ningún editor gráfico ahora.
import type { EventGuest, EventGuestMember, EventMenuItem, EventMenuOption, EventMenuOptionAudience } from '@/domain/types'

export interface MenuSectionDef {
  key: string
  label: string
}

// Orden y nombres tal cual los pidió la familia. No hace falta rellenarlas todas.
export const MENU_SECTIONS: MenuSectionDef[] = [
  { key: 'aperitivo', label: 'Aperitivo / picoteo' },
  { key: 'entrantes', label: 'Entrantes' },
  { key: 'primer_plato', label: 'Primer plato' },
  { key: 'plato_principal', label: 'Plato principal' },
  { key: 'guarniciones', label: 'Guarniciones' },
  { key: 'menu_infantil', label: 'Menú infantil' },
  { key: 'postres', label: 'Postres' },
  { key: 'tarta', label: 'Tarta' },
  { key: 'merienda', label: 'Merienda' },
  { key: 'cena', label: 'Cena' },
  { key: 'recena', label: 'Recena' },
  { key: 'bebidas', label: 'Bebidas' },
  { key: 'otro', label: 'Otro' },
]

export const MENU_INFANTIL_SECTION_LABEL = 'Menú infantil'

function norm(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

// Categorías que ya existían antes de esta fase (MENU_PLAN_TEMPLATES y entradas a mano) se reconocen como
// alias de las secciones nuevas SOLO para agruparlas al mostrarlas; la fila nunca se reescribe.
const SECTION_ALIASES: Record<string, string> = {
  aperitivo: 'aperitivo',
  'aperitivo / picoteo': 'aperitivo',
  picoteo: 'aperitivo',
  snacks: 'aperitivo',
  entrantes: 'entrantes',
  entrante: 'entrantes',
  principal: 'plato_principal',
  principales: 'plato_principal',
  'primer plato': 'primer_plato',
  'segundo plato': 'plato_principal',
  'plato principal': 'plato_principal',
  menu: 'plato_principal',
  comida: 'plato_principal',
  guarniciones: 'guarniciones',
  guarnicion: 'guarniciones',
  'menu infantil': 'menu_infantil',
  postre: 'postres',
  postres: 'postres',
  dulces: 'postres',
  chuches: 'postres',
  tarta: 'tarta',
  'tarta nupcial': 'tarta',
  merienda: 'merienda',
  cena: 'cena',
  recena: 'recena',
  bebidas: 'bebidas',
  bebida: 'bebidas',
  'barra libre': 'bebidas',
  otro: 'otro',
}

export function sectionKeyForCategory(category: string | null): string | null {
  if (!category) return null
  return SECTION_ALIASES[norm(category)] ?? null
}

export interface MenuSectionGroup {
  key: string
  label: string
  items: EventMenuItem[]
}

// Agrupa los platos por sección en el orden del catálogo. Las categorías que no se reconocen conservan
// su propio nombre al final; los platos sin sección van en «Sin sección». Nada se descarta.
export function groupMenuBySection(items: EventMenuItem[]): MenuSectionGroup[] {
  const byKey = new Map<string, MenuSectionGroup>()
  const extras = new Map<string, MenuSectionGroup>()
  const noSection: EventMenuItem[] = []
  for (const item of items) {
    const key = sectionKeyForCategory(item.category)
    if (key) {
      const def = MENU_SECTIONS.find((s) => s.key === key)!
      const group = byKey.get(key) ?? { key, label: def.label, items: [] }
      group.items.push(item)
      byKey.set(key, group)
    } else if (item.category && item.category.trim()) {
      const label = item.category.trim()
      const group = extras.get(label) ?? { key: `extra:${label}`, label, items: [] }
      group.items.push(item)
      extras.set(label, group)
    } else {
      noSection.push(item)
    }
  }
  const ordered = MENU_SECTIONS.map((s) => byKey.get(s.key)).filter((g): g is MenuSectionGroup => Boolean(g))
  const result = [...ordered, ...extras.values()]
  if (noSection.length > 0) result.push({ key: 'sin_seccion', label: 'Sin sección', items: noSection })
  return result
}

export function menuItemsOfSection(items: EventMenuItem[], sectionKey: string): EventMenuItem[] {
  return items.filter((i) => sectionKeyForCategory(i.category) === sectionKey)
}

export function sectionLabel(sectionKey: string): string {
  return MENU_SECTIONS.find((s) => s.key === sectionKey)?.label ?? sectionKey
}

// Un plato enlazado a una receta con ingredientes puede ofrecer pasarlos a Compras (flujo existente).
export function dishesWithRecipe(items: EventMenuItem[]): EventMenuItem[] {
  return items.filter((i) => i.recipeId !== null)
}

// ---------------------------------------------------------------------
// Importación: propuesta estructurada → platos. La propuesta NUNCA se guarda sola.
// ---------------------------------------------------------------------
// Un elemento de la propuesta, en el ORDEN en que aparece en el documento. La IA solo PROPONE el tipo y la sección:
// ninguna de las dos decide la posición. Todo texto significativo se conserva; lo que parece prescindible
// (título decorativo, precio, condiciones) llega DESMARCADO (include:false) para que decida quien revisa, nunca
// descartado en silencio.
export type ImportItemKind = 'dish' | 'heading' | 'note'
export interface ImportedItemProposal {
  text: string
  kind: ImportItemKind
  // Sección SUGERIDA (solo platos): metadato de clasificación, nunca criterio de orden.
  section: string | null
  note: string | null
  include: boolean
}
export interface MenuImportProposal {
  items: ImportedItemProposal[]
}

export const MENU_IMPORT_EXPLANATION =
  'Guarda tu menú en PEPA. Haz una foto o sube el PDF y PEPA intentará organizarlo por ti. Cuando tus invitados hayan confirmado, podremos ayudarte a detectar platos que conviene revisar por sus alergias o necesidades alimentarias.'

// Limpia lo que devuelve la IA antes de enseñarlo. CONSERVA EL ORDEN del documento y NO deduplica (el mismo texto en
// dos posiciones puede ser intencionado). Acepta también la respuesta antigua agrupada por secciones (se aplana en el
// orden recibido) por si la función de servidor aún no se ha actualizado.
export function sanitizeImportProposal(raw: unknown): MenuImportProposal {
  const proposal: MenuImportProposal = { items: [] }
  if (!raw || typeof raw !== 'object') return proposal
  const r = raw as { items?: unknown; sections?: unknown; extraNotes?: unknown }
  const clean = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().slice(0, max) : '')

  if (Array.isArray(r.items)) {
    for (const entry of r.items.slice(0, 300)) {
      const rec = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : null
      const text = clean(typeof entry === 'string' ? entry : (rec?.text ?? rec?.name), 200)
      if (!text) continue
      const rawKind = typeof rec?.kind === 'string' ? rec.kind : 'dish'
      // «skip» = la IA cree que es prescindible: se muestra, desmarcado. Nada se descarta en silencio.
      const kind: ImportItemKind = rawKind === 'heading' ? 'heading' : rawKind === 'note' || rawKind === 'skip' ? 'note' : 'dish'
      const section = kind === 'dish' ? clean(rec?.section, 80) || null : null
      proposal.items.push({ text, kind, section: section ? canonicalSectionLabel(section) : null, note: clean(rec?.note, 300) || null, include: rawKind !== 'skip' })
    }
  } else if (Array.isArray(r.sections)) {
    for (const s of r.sections) {
      if (!s || typeof s !== 'object') continue
      const section = clean((s as { section?: unknown }).section, 80)
      const dishesRaw = (s as { dishes?: unknown }).dishes
      if (!Array.isArray(dishesRaw)) continue
      for (const d of dishesRaw) {
        const text = clean(typeof d === 'string' ? d : (d as { name?: unknown })?.name, 200)
        if (!text) continue
        proposal.items.push({ text, kind: 'dish', section: section ? canonicalSectionLabel(section) : null, note: clean((d as { note?: unknown })?.note, 300) || null, include: true })
      }
    }
  }
  // Textos sueltos que el documento traía (precio, condiciones…): llegan como notas DESMARCADAS al final.
  if (Array.isArray(r.extraNotes)) {
    for (const n of r.extraNotes.slice(0, 10)) {
      const text = clean(n, 300)
      if (text) proposal.items.push({ text, kind: 'note', section: null, note: null, include: false })
    }
  }
  return proposal
}

// Etiqueta de sección para guardar un plato importado: la del catálogo si la reconocemos; si no, tal cual.
export function canonicalSectionLabel(section: string): string {
  const key = sectionKeyForCategory(section)
  return key ? sectionLabel(key) : section.trim()
}

// ---------------------------------------------------------------------
// Opciones de menú para invitados (event_menu_options) — destinatario y filtro por persona.
// ---------------------------------------------------------------------
export const MENU_OPTION_AUDIENCES: { value: EventMenuOptionAudience; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'adultos', label: 'Adultos' },
  { value: 'ninos', label: 'Niños' },
]

export function menuOptionAudienceLabel(audience: EventMenuOptionAudience): string {
  return MENU_OPTION_AUDIENCES.find((a) => a.value === audience)?.label ?? 'Todos'
}

// Una opción sin destinatario fiable (dato antiguo) se trata como 'todos'. Una persona sin tipo conocido
// ve solo las opciones de 'todos': nunca se adivina si es adulto o niño.
export function optionAppliesToPerson(audience: string | null | undefined, personType: string | null | undefined): boolean {
  const a = audience ?? 'todos'
  if (a === 'todos') return true
  if (a === 'adultos') return personType === 'adulto'
  if (a === 'ninos') return personType === 'nino'
  return true
}

export function optionsForPerson<T extends { audience?: string | null }>(options: T[], personType: string | null | undefined): T[] {
  return options.filter((o) => optionAppliesToPerson(o.audience, personType))
}

export interface MenuChoiceCount {
  optionId: string | null
  name: string
  count: number
  // Nombres de las personas (para el detalle de «quién eligió qué»).
  people: { memberId: string; name: string; guestName: string }[]
}

// Cuántas personas han elegido cada opción. «Sin elegir» cuenta las personas que SÍ van (o aún no han dicho
// que no) y a las que se les ofrece al menos una opción, y todavía no han elegido. Las que dijeron «no
// viene» o las de una invitación que no asiste no cuentan nunca.
export function countMenuChoices(
  options: EventMenuOption[],
  members: EventGuestMember[],
  guests: EventGuest[],
): { counts: MenuChoiceCount[]; unchosen: MenuChoiceCount } {
  const guestById = new Map(guests.map((g) => [g.id, g]))
  const eligible = members.filter((m) => {
    const g = guestById.get(m.guestId)
    if (!g || g.rsvpStatus === 'no_asiste') return false
    return m.rsvpAttending !== false
  })
  const counts: MenuChoiceCount[] = options.map((o) => ({ optionId: o.id, name: o.name, count: 0, people: [] }))
  const unchosen: MenuChoiceCount = { optionId: null, name: 'Sin elegir', count: 0, people: [] }
  for (const m of eligible) {
    const guestName = guestById.get(m.guestId)?.displayName ?? ''
    const entry = { memberId: m.id, name: m.name, guestName }
    const chosen = m.menuOptionId ? counts.find((c) => c.optionId === m.menuOptionId) : undefined
    if (chosen) {
      chosen.count += 1
      chosen.people.push(entry)
    } else if (optionsForPerson(options, m.personType).length > 0) {
      unchosen.count += 1
      unchosen.people.push(entry)
    }
  }
  return { counts, unchosen }
}

// Invitaciones que ya habían respondido ANTES de que existieran opciones (o sin elección registrada).
// Solo informativo: crear opciones nunca invalida respuestas ni reenvía nada.
export function guestsRespondedWithoutMenuChoice(guests: EventGuest[], members: EventGuestMember[]): number {
  return guests.filter((g) => {
    if (g.rsvpStatus === 'pendiente' || g.rsvpStatus === 'no_asiste') return false
    const own = members.filter((m) => m.guestId === g.id && m.rsvpAttending !== false)
    return own.every((m) => m.menuOptionId === null)
  }).length
}

// Invitaciones sin personas con nombre: en la invitación no pueden elegir menú hasta que se desglosen.
export function guestsWithoutMembers(guests: EventGuest[], members: EventGuestMember[]): number {
  return guests.filter((g) => g.rsvpStatus !== 'no_asiste' && !members.some((m) => m.guestId === g.id)).length
}

export function alreadyRespondedMessage(n: number): string {
  return n === 1 ? '1 invitación ya había respondido antes de añadir las opciones de menú.' : `${n} invitaciones ya habían respondido antes de añadir las opciones de menú.`
}
