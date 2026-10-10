import { describe, expect, it } from 'vitest'

// "Lista de deseos" (Pequeños Grandes, Fases 12-16, autorización directa del usuario 2026-10-10) — la UI
// nunca sustituye la secrecía real (RLS, migración 0239): si el viewer no debe ver reservas, esta pantalla
// ni siquiera las pide.
const WISHLIST_SCREEN = (import.meta.glob('/src/ui/WishlistScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
  '/src/ui/WishlistScreen.tsx'
]
const WISHLIST_GUEST_SCREEN = (import.meta.glob('/src/ui/WishlistGuestScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
  '/src/ui/WishlistGuestScreen.tsx'
]
const APP_SRC = (import.meta.glob('/src/App.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/App.tsx']
const PEQUENOS_GRANDES_SRC = (import.meta.glob('/src/ui/PequenosGrandesScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
  '/src/ui/PequenosGrandesScreen.tsx'
]

function fn(source: string, signature: string): string {
  const start = source.indexOf(signature)
  expect(start, `no se encontró "${signature}"`).toBeGreaterThan(-1)
  return source.slice(start, source.indexOf('\n}', start) + 2)
}

// Para componentes con JSX (el primer "\n}" suele cerrar un bloque interno, no la función entera) —
// corta hasta la siguiente declaración de función de nivel superior, igual que window_() en los tests de
// EventosScreen.tsx.
function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('PequenosGrandesScreen — Lista de deseos ya no es un "próximamente"', () => {
  it('abre WishlistScreen de verdad, nunca el placeholder antiguo', () => {
    expect(PEQUENOS_GRANDES_SRC).toContain("if (openModule === 'deseos') return <WishlistScreen profile={profile} onBack={() => setOpenModule(null)} />")
    expect(PEQUENOS_GRANDES_SRC).not.toContain('ListaDeseosComingSoon')
    expect(PEQUENOS_GRANDES_SRC).not.toContain('todavía se está construyendo')
  })
})

describe('App.tsx — enlace público de Lista de deseos, mismo patrón que RSVP', () => {
  it('se reconoce por la RAÍZ ("/?deseos=TOKEN"), antes del guardián de sesión', () => {
    const appFn = fn(APP_SRC, 'export function App() {')
    expect(appFn).toContain('wishlistGuestTokenFromLocation()')
    expect(appFn).toContain('<WishlistGuestScreen token={wishlistGuestToken} />')
    // Debe comprobarse ANTES de "return <AuthedApp />" (nunca después, o pasaría primero por el login).
    expect(appFn.indexOf('wishlistGuestTokenFromLocation')).toBeLessThan(appFn.indexOf('<AuthedApp />'))
  })
})

describe('WishlistScreen — el secreto de una reserva es real: ni siquiera se pide si el viewer no debe verla', () => {
  it('canSeeReservations es false para el propio destinatario y para cualquier child', () => {
    const detail = window_(WISHLIST_SCREEN, 'function WishlistDetailScreen(', '\nfunction statusLabel(')
    expect(detail).toContain('const ownWishlist = isOwnWishlist(wishlist.ownerMemberId, viewerMemberId)')
    expect(detail).toContain('const canSeeReservations = !ownWishlist && !isChild')
  })
  it('solo se llama a listWishlistReservationsForItems cuando canSeeReservations es true', () => {
    const detail = window_(WISHLIST_SCREEN, 'function WishlistDetailScreen(', '\nfunction statusLabel(')
    const reloadFn = fn(detail, 'function reload(')
    expect(reloadFn).toContain('if (canSeeReservations && all.length > 0) {')
    expect(reloadFn).toContain('listWishlistReservationsForItems(')
  })
  it('el destinatario ve un aviso de que nunca verá quién reserva — nunca una sección vacía sin explicar', () => {
    expect(WISHLIST_SCREEN).toContain('nunca verás aquí quién reserva cada regalo')
  })
  it('nadie puede reservar en su propia lista (canReserve = !ownWishlist)', () => {
    expect(WISHLIST_SCREEN).toContain('canReserve={!ownWishlist}')
  })
})

describe('WishlistScreen — regalos conjuntos y deshacer la propia reserva', () => {
  it('un regalo conjunto ofrece "unirme", nunca bloquea una segunda reserva', () => {
    const row = window_(WISHLIST_SCREEN, 'function WishlistItemRow(', '\nfunction AddWishlistItemModal(')
    expect(row).toContain("status.kind === 'conjunto' ? '+ Unirme a este regalo'")
  })
  it('deshacer la propia reserva pide confirmación y nunca borra (undoWishlistReservation, nunca delete)', () => {
    const row = window_(WISHLIST_SCREEN, 'function WishlistItemRow(', '\nfunction AddWishlistItemModal(')
    expect(row).toContain('undoWishlistReservation(myReservation.id)')
    expect(row).not.toContain('.delete(')
  })
})

describe('WishlistScreen — compartir con invitados sin cuenta', () => {
  it('genera el enlace con getWishlistGuestUrl y puede renovarlo (invalida el anterior)', () => {
    const detail = window_(WISHLIST_SCREEN, 'function WishlistDetailScreen(', '\nfunction statusLabel(')
    expect(detail).toContain('getWishlistGuestUrl(wishlist.id)')
    expect(detail).toContain('regenerateWishlistGuestUrl(wishlist.id)')
  })
})

describe('WishlistGuestScreen — qué puede hacer un invitado sin cuenta', () => {
  it('nunca pide ni usa un token de sesión de PEPA — solo el token de la URL', () => {
    expect(WISHLIST_GUEST_SCREEN).not.toContain("from '@/data/supabaseClient'")
    expect(WISHLIST_GUEST_SCREEN).not.toContain('auth.getUser')
  })
  it('reservar exige su nombre antes de confirmar', () => {
    const reserveFn = fn(WISHLIST_GUEST_SCREEN, 'async function handleReserve(')
    expect(reserveFn).toContain('Pon tu nombre')
  })
  it('una reserva perdida por la carrera (ya_reservado) se explica con un mensaje claro, nunca un error técnico', () => {
    expect(WISHLIST_GUEST_SCREEN).toContain('Justo se ha adelantado otra persona')
  })
  it('el reservationToken (única forma de deshacer sin cuenta) se guarda en localStorage de ESTE navegador, nunca se manda a ningún sitio más', () => {
    expect(WISHLIST_GUEST_SCREEN).toContain('localStorage.setItem(storageKey(token)')
  })
  it('deshacer sin el token guardado no es posible desde la interfaz — el botón solo aparece con myReservationToken', () => {
    expect(WISHLIST_GUEST_SCREEN).toContain('{myReservationToken && (')
  })
})
