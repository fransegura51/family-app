import { formatDateFromTimestamp } from '@/domain/dateFormat'

// Fecha relativa («Hoy», «Ayer», «Hace N días») que usan las pantallas de administración.
export function formatDate(iso: string | null): string {
  if (!iso) return 'Nunca'
  const d = new Date(iso)
  const days = Math.floor((Date.now() - d.getTime()) / 86400000)
  const when = formatDateFromTimestamp(d)
  if (days === 0) return `Hoy (${when})`
  if (days === 1) return `Ayer (${when})`
  return `Hace ${days} días (${when})`
}
