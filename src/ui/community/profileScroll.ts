// Posición de desplazamiento de un perfil de Comunidad en esta pestaña: al volver con «atrás» desde una publicación, «Mis medallas» o «Mis ajustes» se recupera el punto donde estaba la persona.
// Solo vive en esta sesión del navegador (sessionStorage): no viaja a ningún servidor y se gasta al usarla.
const KEY = 'community:profile-scroll:'

export function saveProfileScroll(profileId: string, y: number): void {
  try {
    if (y > 0) window.sessionStorage.setItem(KEY + profileId, String(Math.round(y)))
    else window.sessionStorage.removeItem(KEY + profileId)
  } catch {
    // sin almacenamiento (ventana privada): el perfil se abre arriba.
  }
}

export function takeProfileScroll(profileId: string): number {
  try {
    const v = Number(window.sessionStorage.getItem(KEY + profileId))
    window.sessionStorage.removeItem(KEY + profileId)
    return Number.isFinite(v) && v > 0 ? v : 0
  } catch {
    return 0
  }
}
