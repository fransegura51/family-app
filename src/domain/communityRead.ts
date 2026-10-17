// Comunidad PEPA — «✓ Leído» / «Actualizada» en las tarjetas. El servidor (0287) decide por persona: 'read' (la abrió), 'updated' (la abrió y el contenido cambió
// después) o null (nunca la abrió). Aquí solo se pinta y se recuerda lo abierto en esta sesión, para que al VOLVER ATRÁS a una lista guardada en memoria la tarjeta que
// acabas de abrir ya salga como leída sin volver a pedir la lista.
import type { CommunityCardItem } from '@/domain/community'

export type ReadBadge = 'read' | 'updated' | null

const openedHere = new Set<string>()

export function markOpenedLocally(postId: string): void {
  openedHere.add(postId)
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

export const READ_LABELS: Record<'read' | 'updated', string> = { read: '✓ Leído', updated: 'Actualizada' }
