// Centro Editorial de Comunidad (Contenido oficial): piezas PURAS (sin red ni React) de la reorganización en secciones, tarjetas compactas, contadores, filtros y
// paginación. Todo sale del MISMO registro (las propuestas oficiales y la lista de menús): los contadores, las listas y el programa semanal no mantienen estados
// propios. Ninguna función de aquí publica, aprueba ni cambia nada.
import type { MenuRow, Proposal, ProposalStatus } from '@/domain/communityAdmin'
import type { EditorialItemRow } from '@/domain/communityEditorial'

export type CenterSectionId = 'resumen' | 'articulos' | 'encuestas' | 'menus' | 'programacion' | 'historial'

export const CENTER_SECTIONS: { id: CenterSectionId; label: string; icon: string }[] = [
  { id: 'resumen', label: 'Resumen', icon: '📊' },
  { id: 'articulos', label: 'Artículos', icon: '📰' },
  { id: 'encuestas', label: 'Encuestas', icon: '🗳️' },
  { id: 'menus', label: 'Menús semanales', icon: '🍽️' },
  { id: 'programacion', label: 'Programación y configuración', icon: '🗓️' },
  { id: 'historial', label: 'Historial y errores', icon: '📜' },
]

export function parseCenterSection(v: string | null): CenterSectionId {
  return CENTER_SECTIONS.find((s) => s.id === v)?.id ?? 'resumen'
}

export type CenterKind = 'article' | 'tip' | 'poll' | 'menu'

// Una fila ÚNICA y compacta para cualquier contenido oficial (propuesta o menú): lo justo para la tarjeta de la lista. El contenido completo solo se pinta en el detalle.
export interface CenterItem {
  id: string
  kind: CenterKind
  title: string
  topicLabel: string | null
  status: ProposalStatus
  version: number
  // Día de referencia para filtrar y ordenar (AAAA-MM-DD): el de publicación (prevista o efectiva), el de su hueco del programa o la semana del menú.
  date: string | null
  // Texto corto de la fecha: «Se publica el …», «Semana del …».
  dateText: string
  stateText: string
  // Hay un error que requiere intervención (publicación fallida).
  hasError: boolean
  errorText: string | null
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const isoDay = (v: string | null): string | null => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null)

// «2 de noviembre»: sin zona horaria (las fechas del programa ya son días de Madrid; las de publicación se pasan por `madridDay`).
export function dayMonthText(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  return `${Number(m[3])} de ${MONTHS[Number(m[2]) - 1] ?? m[2]}`
}

type MadridDay = (v: string | null) => string | null

export function fromProposal(p: Proposal, topicLabel: string | null, madridDay: MadridDay): CenterItem {
  const pubDay = madridDay(p.publishAt)
  const date = pubDay ?? isoDay(p.slotDate)
  const hasError = Boolean(p.publishError) && p.status !== 'published'
  let dateText = ''
  if (p.status === 'published') dateText = date ? `Publicado: ${dayMonthText(date)}` : 'Publicado'
  else if (p.status === 'approved') dateText = pubDay ? `Se publica el ${dayMonthText(pubDay)}` : 'Aprobado'
  else if (p.slotDate) dateText = `Previsto: ${dayMonthText(p.slotDate)}`
  else if (p.proposedAt) dateText = `Propuesto: ${dayMonthText(madridDay(p.proposedAt) ?? p.proposedAt)}`
  return {
    id: p.id,
    kind: p.kind,
    title: p.title,
    topicLabel,
    status: p.status,
    version: p.version,
    date: date ?? madridDay(p.proposedAt),
    dateText,
    stateText: hasError ? 'Error de publicación' : p.status === 'proposed' ? 'Pendiente de revisar' : p.status === 'approved' ? 'Aprobado' : p.status === 'rejected' ? 'Rechazado' : 'Publicado',
    hasError,
    errorText: hasError ? p.publishError : null,
  }
}

// Un menú tiene sus propios estados (borrador, programado, publicado, con error, rechazado): se traducen a los mismos cuatro estados del resto, y el error se marca aparte.
export function fromMenu(m: MenuRow, madridDay: MadridDay): CenterItem {
  const status: ProposalStatus = m.state === 'draft' ? 'proposed' : m.state === 'rejected' ? 'rejected' : m.state === 'published' ? 'published' : 'approved'
  const pubDay = madridDay(m.publishAt)
  const hasError = m.state === 'error' || (Boolean(m.publishError) && m.state !== 'published')
  const week = isoDay(m.weekStart)
  let dateText = ''
  if (m.state === 'published') dateText = week ? `Publicado · semana del ${dayMonthText(week)}` : 'Publicado'
  else if (pubDay) dateText = `Sale el ${dayMonthText(pubDay)}`
  else if (week) dateText = `Semana del ${dayMonthText(week)}`
  return {
    id: m.id,
    kind: 'menu',
    title: m.title,
    topicLabel: null,
    status,
    version: m.version,
    date: pubDay ?? week ?? madridDay(m.proposedAt),
    dateText,
    stateText: hasError ? 'Con error' : m.state === 'draft' ? 'Pendiente de revisar' : m.state === 'scheduled' ? 'Programado' : m.state === 'published' ? 'Publicado' : 'Rechazado',
    hasError,
    errorText: hasError ? m.publishError : null,
  }
}

// ---- Contadores del Resumen (siempre calculados del registro real; nunca guardados aparte)
export interface CenterCounts {
  articlesPending: number
  pollsPending: number
  menusPending: number
  approvedScheduled: number
  errors: number
}

export function countCenter(items: readonly CenterItem[]): CenterCounts {
  const out: CenterCounts = { articlesPending: 0, pollsPending: 0, menusPending: 0, approvedScheduled: 0, errors: 0 }
  for (const i of items) {
    if (i.status === 'proposed') {
      if (i.kind === 'poll') out.pollsPending++
      else if (i.kind === 'menu') out.menusPending++
      else out.articlesPending++
    }
    if (i.status === 'approved') out.approvedScheduled++
    if (i.hasError) out.errors++
  }
  return out
}

export const sectionOfKind = (k: CenterKind): CenterSectionId => (k === 'poll' ? 'encuestas' : k === 'menu' ? 'menus' : 'articulos')

// ---- Filtros y búsqueda (sobre la lista ya cargada; no vuelven a pedir nada al servidor)
export interface CenterFilter {
  query: string
  from: string
  to: string
}
export const NO_FILTER: CenterFilter = { query: '', from: '', to: '' }

const plain = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export function filterCenter(items: readonly CenterItem[], f: CenterFilter): CenterItem[] {
  const q = plain(f.query)
  return items.filter((i) => {
    if (q && !plain(i.title).includes(q) && !plain(i.topicLabel ?? '').includes(q)) return false
    if ((f.from || f.to) && !i.date) return false
    if (f.from && i.date && i.date < f.from) return false
    if (f.to && i.date && i.date > f.to) return false
    return true
  })
}

// Orden: lo que lleva error primero, después por fecha (lo más próximo arriba para lo pendiente y programado; lo más reciente arriba para lo ya cerrado).
export function sortCenter(items: readonly CenterItem[], status: ProposalStatus): CenterItem[] {
  const dir = status === 'proposed' || status === 'approved' ? 1 : -1
  return [...items].sort((a, b) => {
    if (a.hasError !== b.hasError) return a.hasError ? -1 : 1
    const da = a.date ?? (dir === 1 ? '9999-12-31' : '0000-01-01')
    const db = b.date ?? (dir === 1 ? '9999-12-31' : '0000-01-01')
    return da === db ? a.title.localeCompare(b.title, 'es') : da < db ? -dir : dir
  })
}

export const PAGE_SIZE = 20
export const pageOf = <T>(items: readonly T[], shown: number): { visible: T[]; remaining: number } => ({ visible: items.slice(0, shown), remaining: Math.max(0, items.length - shown) })

// ---- Programa semanal derivado del MISMO registro: cada hueco con su estado real (no hay estados independientes).
// El programa pide los huecos al servidor; aquí se sustituye el estado de cada hueco por el que tiene en el registro compartido si ahí está más al día.
export function syncProgramRows(rows: readonly EditorialItemRow[], items: ReadonlyMap<string, CenterItem>): EditorialItemRow[] {
  return rows.map((r) => {
    const live = items.get(r.id)
    if (!live) return r
    return { ...r, status: live.status, version: live.version, title: live.title, publishError: live.hasError ? (live.errorText ?? r.publishError ?? 'error') : null }
  })
}
