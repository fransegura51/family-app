import { addDays, dayShort, formatMadridSlot, madridDay, mondayOf, weekRangeText, weekdayIndex, type EditorialItemKind, type EditorialItemRow } from '@/domain/communityEditorial'

// Agenda editorial: NUEVA PRESENTACIÓN del programa semanal (las mismas filas de `community_admin_editorial_items`, sin otro origen de datos ni otro sistema de estados).
// Cada publicación se coloca por su fecha y hora EFECTIVAS (la programada si ya está aprobada; si no, la que le tocaría por su hueco), sea del tipo que sea. Una semana
// es la del CONTENIDO (lunes a domingo del hueco): el menú del sábado anterior pertenece a la semana que anuncia, así que sale antes que sus artículos y no se duplica.
// Nada de aquí cambia fechas, estados ni contenidos: solo ordena y describe.

export const PUBLISH_TIME = '10:00'
// Una encuesta abre el sábado y cierra el domingo siguiente a las 17:00 (hora de Madrid): la regla de la reprogramación (migración 0345) y de la programación semanal.
export const POLL_CLOSE_TIME = '17:00'

export interface AgendaRow {
  item: EditorialItemRow
  /** Día de Madrid en que sale (AAAA-MM-DD). */
  day: string
  /** Hora de Madrid («10:00»). */
  time: string
  /** true si es la hora/fecha PREVISTA por el hueco (todavía no hay una programada). */
  planned: boolean
  /** Solo encuestas: cuándo cierra («dom 8 nov, 17:00»). */
  closesText: string | null
}

export interface AgendaDay {
  date: string
  /** «Lun 2 nov». */
  label: string
  rows: AgendaRow[]
}

export interface AgendaWeek {
  monday: string
  /** «Semana del 2 al 8 de noviembre». */
  title: string
  count: number
  pending: number
  days: AgendaDay[]
  /** Días de la semana (lunes a domingo) sin artículo en el programa: «Mié 4 nov». */
  missingArticles: string[]
}

/** «Lun 2 nov» (tres letras para el día de la semana, sin partirse). */
export function agendaDayLabel(day: string): string {
  const [w, ...rest] = dayShort(day).split(' ')
  return `${w.charAt(0).toUpperCase()}${w.slice(1, 3)} ${rest.join(' ')}`
}

const timeOf = (publishAt: string): string => formatMadridSlot(publishAt).split(', ')[1] ?? PUBLISH_TIME

/** Domingo en que cierra una encuesta que abre ese día. */
export function pollCloseDay(openDay: string): string {
  return addDays(openDay, 6 - weekdayIndex(openDay))
}

export function agendaRow(item: EditorialItemRow): AgendaRow {
  const scheduledDay = item.publishAt ? madridDay(item.publishAt) : null
  let day: string
  let time: string
  let planned = false
  if (item.publishAt && scheduledDay) {
    day = scheduledDay
    time = timeOf(item.publishAt)
  } else {
    // Sin programar: el artículo y la encuesta salen en su día a las 10:00; el menú, el sábado anterior a la semana que anuncia.
    day = item.kind === 'menu' ? addDays(mondayOf(item.slotDate), -2) : item.slotDate
    time = PUBLISH_TIME
    planned = true
  }
  const closesText = item.kind === 'poll' ? `${agendaDayLabel(pollCloseDay(day)).replace(/^(\S+)/, (w) => w.toLowerCase())}, ${POLL_CLOSE_TIME}` : null
  return { item, day, time, planned, closesText }
}

const KIND_RANK: Record<EditorialItemKind, number> = { menu: 0, article: 1, poll: 2 }

/** Orden cronológico real (día y hora) y, si coinciden, un orden estable y neutro: hueco, tipo, título e id. No se inventa ninguna prioridad de publicación. */
export function compareAgendaRows(a: AgendaRow, b: AgendaRow): number {
  return (
    (a.day + a.time).localeCompare(b.day + b.time) ||
    a.item.slotDate.localeCompare(b.item.slotDate) ||
    KIND_RANK[a.item.kind] - KIND_RANK[b.item.kind] ||
    a.item.title.localeCompare(b.item.title, 'es') ||
    a.item.id.localeCompare(b.item.id)
  )
}

/** Agrupa el programa por semana de contenido y, dentro, por día efectivo. Lo rechazado no ocupa hueco en el programa (igual que antes). Semanas en orden. */
export function buildAgenda(items: EditorialItemRow[]): AgendaWeek[] {
  const byWeek = new Map<string, AgendaRow[]>()
  for (const i of items) {
    if (i.status === 'rejected') continue
    const mon = mondayOf(i.slotDate)
    byWeek.set(mon, [...(byWeek.get(mon) ?? []), agendaRow(i)])
  }
  return [...byWeek.keys()].sort().map((monday) => {
    const rows = (byWeek.get(monday) ?? []).sort(compareAgendaRows)
    const days: AgendaDay[] = []
    for (const r of rows) {
      const last = days[days.length - 1]
      if (last && last.date === r.day) last.rows.push(r)
      else days.push({ date: r.day, label: agendaDayLabel(r.day), rows: [r] })
    }
    const withArticle = new Set(rows.filter((r) => r.item.kind === 'article').map((r) => r.item.slotDate))
    const missingArticles = withArticle.size === 0 ? [] : Array.from({ length: 7 }, (_, n) => addDays(monday, n)).filter((d) => !withArticle.has(d)).map(agendaDayLabel)
    return { monday, title: weekRangeText(monday), count: rows.length, pending: rows.filter((r) => r.item.status === 'proposed').length, days, missingArticles }
  })
}

/** Semana que se enseña al abrir: la actual o la siguiente que tenga algo; si ya pasaron todas, la última. */
export function defaultAgendaWeek(weeks: AgendaWeek[], currentMonday: string): string | null {
  if (weeks.length === 0) return null
  return (weeks.find((w) => w.monday >= currentMonday) ?? weeks[weeks.length - 1]).monday
}

export type AgendaState = 'proposed' | 'approved' | 'published' | 'rejected' | 'error'

/** Estado REAL del sistema (no hay otro): pendiente, aprobado y programado, publicado, rechazado o con error de publicación. */
export function agendaState(i: Pick<EditorialItemRow, 'status' | 'publishError'>): AgendaState {
  if (i.publishError && i.status !== 'published') return 'error'
  return i.status
}

export const AGENDA_STATE: Record<AgendaState, { glyph: string; label: string }> = {
  proposed: { glyph: '?', label: 'Pendiente de aprobación' },
  approved: { glyph: '✓', label: 'Aprobado y programado' },
  published: { glyph: '●', label: 'Publicado' },
  rejected: { glyph: '×', label: 'Rechazado' },
  error: { glyph: '!', label: 'Error de publicación' },
}

export const AGENDA_KIND: Record<EditorialItemKind, { icon: string; label: string }> = {
  article: { icon: '📰', label: 'Artículo' },
  poll: { icon: '🗳️', label: 'Encuesta' },
  menu: { icon: '🍽️', label: 'Menú' },
}
