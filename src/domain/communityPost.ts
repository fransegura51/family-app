// Comunidad PEPA — lógica pura de la página de una publicación (sin red ni React): fuentes de un artículo oficial, textos de la encuesta con la hora de Madrid,
// porcentajes, fechas legibles y contadores optimistas.
import type { PollView, PostPhoto } from '@/domain/community'
import { MADRID_TZ } from '@/domain/communityComments'
import { safeLink } from '@/domain/communityRichText'

// ---- Contadores optimistas (me gusta, guardados) ---------------------------------------------------------------------------------------------------

// Cambia al instante el estado de un botón y su contador; si el servidor falla, quien lo usa vuelve al valor anterior.
export function toggleCount(active: boolean, count: number): { active: boolean; count: number } {
  return { active: !active, count: Math.max(0, count + (active ? -1 : 1)) }
}

export function sortPhotos(photos: PostPhoto[] | null | undefined): PostPhoto[] {
  return [...(photos ?? [])].sort((a, b) => a.position - b.position)
}

// ---- Fechas ----------------------------------------------------------------------------------------------------------------------------------------------

// «hace 5 min», «hace 3 h», «hace 2 días»; a partir de una semana, la fecha.
export function relativeTimeEs(iso: string, nowMs: number = Date.now()): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const diff = Math.max(0, nowMs - t)
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'ahora mismo'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  if (d < 7) return d === 1 ? 'hace 1 día' : `hace ${d} días`
  const sameYear = new Date(t).getFullYear() === new Date(nowMs).getFullYear()
  return new Intl.DateTimeFormat('es-ES', { timeZone: MADRID_TZ, day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) }).format(new Date(t))
}

export function formatLongDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('es-ES', { timeZone: MADRID_TZ, day: 'numeric', month: 'long', year: 'numeric' }).format(d)
}

// «el sábado 17 de octubre a las 10:00 (hora de Madrid)». Usa la zona Europe/Madrid, así que el cambio de horario de verano/invierno sale bien solo.
export function formatMadridMoment(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const parts = new Intl.DateTimeFormat('es-ES', { timeZone: MADRID_TZ, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `el ${get('weekday')} ${get('day')} de ${get('month')} a las ${get('hour')}:${get('minute')} (hora de Madrid)`
}

// ---- Encuesta oficial ---------------------------------------------------------------------------------------------------------------------------------

export type PollPhase = 'scheduled' | 'open' | 'closed'

// La fase se decide también con la hora, por si el trabajo programado del servidor (cada 5 minutos) aún no ha actualizado el estado.
export function pollPhase(poll: Pick<PollView, 'status' | 'opensAt' | 'closesAt'>, nowMs: number = Date.now()): PollPhase {
  if (poll.status === 'closed' || nowMs >= new Date(poll.closesAt).getTime()) return 'closed'
  if (nowMs < new Date(poll.opensAt).getTime()) return 'scheduled'
  return 'open'
}

export function pollTimeMessage(poll: Pick<PollView, 'status' | 'opensAt' | 'closesAt'>, nowMs: number = Date.now()): string {
  const phase = pollPhase(poll, nowMs)
  if (phase === 'scheduled') return `La encuesta se abrirá ${formatMadridMoment(poll.opensAt)}.`
  if (phase === 'open') return `Encuesta abierta. Se cierra ${formatMadridMoment(poll.closesAt)}.`
  return `Encuesta cerrada ${formatMadridMoment(poll.closesAt)}. Estos son los resultados finales.`
}

// Porcentajes enteros que suman 100 (método del mayor resto) para que las barras no den 99 % ni 101 %.
export function pollPercents(counts: number[] | null | undefined, total: number | null | undefined): number[] {
  const list = counts ?? []
  const sum = total && total > 0 ? total : list.reduce((a, b) => a + b, 0)
  if (!sum || list.length === 0) return list.map(() => 0)
  const raw = list.map((c) => (c / sum) * 100)
  const floors = raw.map((r) => Math.floor(r))
  let left = 100 - floors.reduce((a, b) => a + b, 0)
  const order = raw.map((r, i) => ({ i, rest: r - Math.floor(r) })).sort((a, b) => b.rest - a.rest)
  for (const o of order) {
    if (left <= 0) break
    floors[o.i] += 1
    left -= 1
  }
  return floors
}

// ---- Fuentes de un artículo oficial ------------------------------------------------------------------------------------------------------------

export interface ArticleSource {
  title: string
  publisher: string | null
  date: string | null
  // Solo enlaces http/https seguros (el resto se ignora y la fuente se enseña sin enlace).
  href: string | null
  host: string | null
}

export interface ArticleSourcesInfo {
  sources: ArticleSource[]
  methodology: string | null
  comparison: string | null
}

function text(v: unknown, max = 400): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

// Fecha de una fuente: «2026-03-14» → «14 de marzo de 2026»; «2026-03» → «marzo de 2026»; «2025» → «2025»; otro texto, tal cual.
export function formatSourceDate(raw: string | null): string | null {
  if (!raw) return null
  const full = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw)
  if (full) return new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(Date.UTC(+full[1], +full[2] - 1, +full[3])))
  const month = /^(\d{4})-(\d{2})$/.exec(raw)
  if (month) return new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(Date.UTC(+month[1], +month[2] - 1, 1)))
  return raw.slice(0, 40)
}

// El servidor guarda las fuentes como JSON libre: {"sources":[{"title","publisher","url","date"}],"methodology","comparison"}. Se lee con cuidado y nada se pinta como HTML.
export function parseArticleSources(raw: unknown): ArticleSourcesInfo {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const list = Array.isArray(obj.sources) ? obj.sources : []
  const sources: ArticleSource[] = []
  for (const item of list.slice(0, 20)) {
    if (!item || typeof item !== 'object') continue
    const s = item as Record<string, unknown>
    const title = text(s.title, 200)
    if (!title) continue
    const link = typeof s.url === 'string' ? safeLink(s.url) : null
    sources.push({ title, publisher: text(s.publisher ?? s.editorial, 120), date: formatSourceDate(text(s.date, 40)), href: link?.href ?? null, host: link?.host ?? null })
  }
  return { sources, methodology: text(obj.methodology, 1500), comparison: text(obj.comparison, 1500) }
}

export const POLL_NOT_REPRESENTATIVE_NOTE = 'Las encuestas de PEPA no son muestras representativas.'
