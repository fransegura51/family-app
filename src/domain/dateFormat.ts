// Formato único de fechas que ve la persona en PEPA (España): DD/MM/AAAA y DD/MM/AAAA HH:mm (24 h).
// Solo PRESENTACIÓN: lo que se guarda y se intercambia sigue siendo ISO (2026-10-16, timestamps con zona).
// Una fecha de calendario (sin hora) se trocea como texto: nunca pasa por Date, así que no se desplaza de día por la zona horaria.

const DAY_ONLY = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/

/** "2026-10-16" (o "2026-10-16T..." si solo importa el día) → "16/10/2026". Vacío/null → fallback; algo que no es fecha se devuelve tal cual. */
export function formatDate(iso: string | null | undefined, fallback = ''): string {
  if (!iso) return fallback
  const m = DAY_ONLY.exec(iso)
  if (!m) return iso
  return `${m[3]}/${m[2]}/${m[1]}`
}

function partsOf(d: Date, timeZone?: string) {
  const parts = new Intl.DateTimeFormat('es-ES', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return { y: get('year'), mo: get('month'), d: get('day'), h: get('hour'), mi: get('minute') }
}

function toValidDate(ts: string | number | Date | null | undefined): Date | null {
  if (ts == null || ts === '') return null
  const d = ts instanceof Date ? ts : new Date(ts)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Marca de tiempo → "16/10/2026" en la zona del dispositivo (o la indicada, p. ej. 'Europe/Madrid'). */
export function formatDateFromTimestamp(ts: string | number | Date | null | undefined, timeZone?: string, fallback = ''): string {
  const d = toValidDate(ts)
  if (!d) return fallback
  const p = partsOf(d, timeZone)
  return `${p.d}/${p.mo}/${p.y}`
}

/** Marca de tiempo → "16/10/2026 18:30" (24 h; el horario de verano/invierno lo resuelve la zona). */
export function formatDateTime(ts: string | number | Date | null | undefined, timeZone?: string, fallback = ''): string {
  const d = toValidDate(ts)
  if (!d) return fallback
  const p = partsOf(d, timeZone)
  return `${p.d}/${p.mo}/${p.y} ${p.h}:${p.mi}`
}

/** Marca de tiempo → "18:30" (24 h). */
export function formatTime(ts: string | number | Date | null | undefined, timeZone?: string, fallback = ''): string {
  const d = toValidDate(ts)
  if (!d) return fallback
  const p = partsOf(d, timeZone)
  return `${p.h}:${p.mi}`
}

/** Rango de días "01/10/2026 – 16/10/2026". */
export function formatDateRange(from: string | null | undefined, to: string | null | undefined): string {
  return `${formatDate(from)} – ${formatDate(to)}`
}
