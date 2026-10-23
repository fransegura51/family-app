import type { ActivityEntry } from '@/data/activity'

// Textos y agrupación de «Actividad reciente». Reglas:
//  - NUNCA se oculta una modificación diferente: solo se juntan las entradas SEGUIDAS que son de la misma persona, tabla y acción y ocurren en una ventana de 2 minutos, diciendo cuántas
//    son y a cuántos elementos afectan. Dos personas distintas, otra tabla, otra acción o un hueco mayor de 2 minutos siempre son entradas separadas.
//  - «Alguien» solo cuando no hay nada más fiable. Si la entrada no tiene persona (la anotó un proceso automático —p. ej. la sincronización con Google— o la cuenta ya no existe) se dice
//    «Un proceso automático de PEPA». Y si la persona puede leer el elemento, se nombra («Dentista»); un evento privado de otra persona no se nombra.
const TABLE_LABELS: Record<string, { one: string; many: string }> = {
  family_members: { one: 'un miembro', many: 'miembros' },
  calendar_events: { one: 'un evento', many: 'eventos' },
  tasks: { one: 'una tarea', many: 'tareas' },
  shopping_items: { one: 'un producto de la lista', many: 'productos de la lista' },
  expenses: { one: 'un gasto', many: 'gastos' },
  automation_rules: { one: 'una regla de automatización', many: 'reglas de automatización' },
}

const ACTION_LABELS: Record<ActivityEntry['action'], string> = {
  insert: 'creó',
  update: 'modificó',
  delete: 'eliminó',
}

export const AUTOMATIC_ACTOR = 'Un proceso automático de PEPA'
export const GROUP_WINDOW_MS = 2 * 60 * 1000

export function describeActivity(entry: ActivityEntry): string {
  const who = entry.actorName ?? (entry.actorId ? 'Alguien' : AUTOMATIC_ACTOR)
  const what = TABLE_LABELS[entry.tableName]?.one ?? entry.tableName
  const verb = ACTION_LABELS[entry.action]
  return `${who} ${verb} ${what}`
}

export interface ActivityGroup {
  key: string
  actorId: string | null
  actorName: string | null
  tableName: string
  action: ActivityEntry['action']
  /** Filas anotadas en el grupo. */
  count: number
  /** Elementos distintos a los que afectan (una misma ficha editada 3 veces seguidas = 1). */
  distinct: number
  recordIds: string[]
  newestAt: string
  oldestAt: string
}

// `entries` de más nueva a más antigua. Agrupa solo entradas consecutivas parecidas dentro de la ventana (medida desde la más nueva del grupo).
export function groupActivity(entries: ActivityEntry[]): ActivityGroup[] {
  const groups: ActivityGroup[] = []
  for (const e of entries) {
    const last = groups[groups.length - 1]
    const t = new Date(e.createdAt).getTime()
    if (last && last.actorId === e.actorId && last.tableName === e.tableName && last.action === e.action && new Date(last.newestAt).getTime() - t <= GROUP_WINDOW_MS) {
      last.count++
      last.oldestAt = e.createdAt
      if (e.recordId && !last.recordIds.includes(e.recordId)) last.recordIds.push(e.recordId)
      last.distinct = Math.max(1, last.recordIds.length)
      continue
    }
    groups.push({
      key: e.id,
      actorId: e.actorId,
      actorName: e.actorName,
      tableName: e.tableName,
      action: e.action,
      count: 1,
      distinct: 1,
      recordIds: e.recordId ? [e.recordId] : [],
      newestAt: e.createdAt,
      oldestAt: e.createdAt,
    })
  }
  return groups
}

export function describeActivityGroup(g: ActivityGroup, names: ReadonlyMap<string, string> = new Map()): string {
  const who = g.actorName ?? (g.actorId ? 'Alguien' : AUTOMATIC_ACTOR)
  const verb = ACTION_LABELS[g.action]
  const label = TABLE_LABELS[g.tableName] ?? { one: g.tableName, many: g.tableName }
  const known = g.recordIds.flatMap((id) => (names.has(id) ? [`«${names.get(id)}»`] : []))
  if (g.distinct <= 1) {
    const base = `${who} ${verb} ${label.one}${known[0] ? `: ${known[0]}` : ''}`
    return g.count > 1 ? `${base} (${g.count} cambios seguidos)` : base
  }
  const shown = known.slice(0, 3)
  const more = g.distinct - shown.length
  const detail = shown.length > 0 ? ` (${shown.join(', ')}${more > 0 ? ` y ${more} más` : ''})` : ''
  return `${who} ${verb} ${g.distinct} ${label.many}${detail}`
}
