// Comunidad PEPA — «✓ Leído» / «Actualizada» en las tarjetas. El servidor (0287) decide por persona: 'read' (la abrió), 'updated' (la abrió y el contenido cambió
// después) o null (nunca la abrió). Aquí solo se pinta y se recuerda lo abierto en esta sesión, para que al VOLVER ATRÁS a una lista guardada en memoria la tarjeta que
// acabas de abrir ya salga como leída sin volver a pedir la lista.
import type { CommunityCardItem } from '@/domain/community'

export type ReadBadge = 'read' | 'updated' | null

const openedHere = new Set<string>()

// Quien necesite enterarse de que cambió algo relevante (leído, «me gusta», un comentario) se apunta aquí; no hay consultas periódicas: solo se avisa cuando la persona hace algo.
const stateListeners = new Set<() => void>()

export function onCommunityStateChange(fn: () => void): () => void {
  stateListeners.add(fn)
  return () => stateListeners.delete(fn)
}

export function notifyCommunityStateChange(): void {
  for (const fn of stateListeners) fn()
}

export function markOpenedLocally(postId: string): void {
  const isNew = !openedHere.has(postId)
  openedHere.add(postId)
  if (isNew) notifyCommunityStateChange()
}

export function wasOpenedLocally(postId: string): boolean {
  return openedHere.has(postId)
}

export function clearOpenedLocally(): void {
  openedHere.clear()
}

// Qué etiqueta lleva una tarjeta. Una abierta en esta sesión es «leída» aunque la lista venga de la memoria.
export function readBadge(item: CommunityCardItem): ReadBadge {
  if ('blockedByMe' in item && item.blockedByMe) return null
  if (openedHere.has(item.id)) return 'read'
  const s = (item as { readState?: ReadBadge }).readState
  return s === 'read' || s === 'updated' ? s : null
}

// «No leídas primero» en pantalla: lo no leído (o actualizado) antes que lo leído, de más reciente a más antiguo dentro de cada grupo. El servidor ya lo ordena así; esto reordena en
// el momento una lista recuperada de la memoria al volver de una publicación (la que acabas de abrir pasa al grupo de leídas sin volver a pedir nada).
export function sortUnreadFirst<T extends CommunityCardItem>(items: T[]): T[] {
  const group = (i: T) => (readBadge(i) === 'read' ? 1 : 0)
  const time = (i: T) => ('createdAt' in i && typeof i.createdAt === 'string' ? Date.parse(i.createdAt) || 0 : 0)
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => group(a.item) - group(b.item) || time(b.item) - time(a.item) || a.index - b.index)
    .map((x) => x.item)
}

// «Últimas publicaciones» de Novedades: dos grupos (sin leer y ya leídas) con el orden de «No leídas primero». `grouped` solo es cierto si hay algo sin leer: sin ninguna pendiente
// se enseñan las leídas normalmente, sin encabezados ni bloque vacío.
export function groupByRead<T extends CommunityCardItem>(items: T[]): { unread: T[]; read: T[]; grouped: boolean } {
  const sorted = sortUnreadFirst(items)
  const unread = sorted.filter((i) => readBadge(i) !== 'read')
  const read = sorted.filter((i) => readBadge(i) === 'read')
  return { unread, read, grouped: unread.length > 0 }
}

export const READ_LABELS: Record<'read' | 'updated', string> = { read: '✓ Leído', updated: 'Actualizada' }
