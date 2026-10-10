// "Lista de deseos" (Pequeños Grandes, Fases 12-16 del prompt maestro consolidado, autorización directa
// del usuario 2026-10-10) — funciones puras de dominio. La secrecía real de una reserva vive en RLS
// (migración 0239): ni el destinatario de la lista ni ningún 'child' pueden verla a nivel de fila. Estas
// funciones solo ayudan a la interfaz a explicarlo y a mostrar el estado de un regalo, nunca a decidir
// permisos de verdad (eso ya lo decide el servidor).
import type { WishlistItemReservation } from '@/domain/types'

export type WishlistItemStatus =
  | { kind: 'disponible' }
  | { kind: 'reservado' }
  | { kind: 'conjunto'; count: number }

// `reservations` ya viene filtrada a las activas (undoneAt null) que el viewer puede ver — si el viewer
// es el propio destinatario o un 'child', RLS ya le devuelve 0 filas aunque haya reservas reales: para
// ellos un regalo reservado se ve "disponible" (nunca se filtra aparte aquí, es justo lo que RLS decide).
export function wishlistItemStatus(allowJoint: boolean, reservations: WishlistItemReservation[]): WishlistItemStatus {
  const active = reservations.filter((r) => r.undoneAt == null)
  if (active.length === 0) return { kind: 'disponible' }
  if (allowJoint) return { kind: 'conjunto', count: active.length }
  return { kind: 'reservado' }
}

// Para mostrar "esto es tu propia lista — nunca verás aquí quién reserva nada, es el secreto" en vez de
// enseñar la sección de reservas vacía sin más explicación (que parecería "nadie ha reservado nada").
export function isOwnWishlist(ownerMemberId: string, viewerMemberId: string | null): boolean {
  return viewerMemberId != null && ownerMemberId === viewerMemberId
}

export function wishlistTitle(occasion: string, year: number): string {
  return `${occasion} ${year}`
}
