// Cómo se muestran los participantes de un grupo en listas, pagados/pendientes y mensajes. Dominio puro.
//  · first          → «Eric»
//  · first_unique   → solo el nombre; si hay repetidos se diferencian solos: «Lucas A.», «Lucas B.» (si las iniciales coinciden, se amplía el apellido lo necesario)
//  · full           → «Eric García»
//  · surname_first  → «García, Eric»
import { foldText, type Participant } from '@/domain/groups'

export type NameFormat = 'first' | 'first_unique' | 'full' | 'surname_first'
export type SortBy = 'name' | 'surname'

export const NAME_FORMAT_LABEL: Record<NameFormat, string> = {
  first: 'Solo nombre',
  first_unique: 'Solo nombre (diferenciando repetidos)',
  full: 'Nombre y apellidos',
  surname_first: 'Apellidos, nombre',
}
export const NAME_FORMATS = Object.keys(NAME_FORMAT_LABEL) as NameFormat[]
export const SORT_LABEL: Record<SortBy, string> = { name: 'Por nombre', surname: 'Por apellidos' }

export interface NamePrefs {
  format: NameFormat
  sortBy: SortBy
}
export const DEFAULT_NAME_PREFS: NamePrefs = { format: 'full', sortBy: 'name' }

export function isNameFormat(v: unknown): v is NameFormat {
  return typeof v === 'string' && (NAME_FORMATS as string[]).includes(v)
}

type Named = Pick<Participant, 'id' | 'name' | 'surname'>

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

/** Letras del apellido que hacen falta para que cada homónimo quede distinto de los demás: «Lucas A.», «Lucas Alo.» (solo se amplía a quien lo necesita). */
function disambiguate(group: Named[]): Map<string, string> {
  const out = new Map<string, string>()
  const surnames = group.map((p) => clean(p.surname))
  const folded = surnames.map((x) => foldText(x))
  group.forEach((p, i) => {
    const s = surnames[i]
    if (!s) return void out.set(p.id, clean(p.name))
    let n = 1
    while (n < s.length && folded.some((f, j) => j !== i && f.slice(0, n) === folded[i].slice(0, n))) n++
    const shown = s.slice(0, n)
    out.set(p.id, `${clean(p.name)} ${shown.charAt(0).toUpperCase()}${shown.slice(1)}${shown.length < s.length ? '.' : ''}`)
  })
  // Sigue habiendo idénticos (mismo nombre y mismos apellidos, o sin apellidos): se numeran, sin inventar nada más.
  const byLabel = new Map<string, string[]>()
  for (const p of group) byLabel.set(out.get(p.id) ?? '', [...(byLabel.get(out.get(p.id) ?? '') ?? []), p.id])
  for (const [label, ids] of byLabel) if (ids.length > 1) ids.forEach((id, i) => out.set(id, `${label} (${i + 1})`))
  return out
}

/** Nombre a mostrar de cada participante de UNA lista (la diferenciación de repetidos se calcula dentro de esa lista). */
export function displayNames(list: Named[], format: NameFormat): Map<string, string> {
  const out = new Map<string, string>()
  if (format === 'first_unique') {
    const groups = new Map<string, Named[]>()
    for (const p of list) groups.set(foldText(p.name), [...(groups.get(foldText(p.name)) ?? []), p])
    for (const g of groups.values()) {
      if (g.length === 1) out.set(g[0].id, clean(g[0].name))
      else for (const [id, label] of disambiguate(g)) out.set(id, label)
    }
    return out
  }
  for (const p of list) {
    const name = clean(p.name)
    const surname = clean(p.surname)
    if (format === 'first') out.set(p.id, name)
    else if (format === 'surname_first') out.set(p.id, surname ? `${surname}, ${name}` : name)
    else out.set(p.id, [name, surname].filter(Boolean).join(' '))
  }
  return out
}

export function sortByPrefs<T extends Named>(list: T[], sortBy: SortBy): T[] {
  const key = (p: T) => (sortBy === 'surname' ? foldText([p.surname, p.name].filter(Boolean).join(' ')) : foldText([p.name, p.surname].filter(Boolean).join(' ')))
  return [...list].sort((a, b) => key(a).localeCompare(key(b), 'es'))
}

/** Una función `nombre(participante)` ya calculada para una lista. Si le llega alguien que no estaba en la lista, usa «Nombre Apellidos». */
export function makeNamer(list: Named[], prefs: NamePrefs): (p: Named) => string {
  const map = displayNames(list, prefs.format)
  return (p) => map.get(p.id) ?? [clean(p.name), clean(p.surname)].filter(Boolean).join(' ')
}
