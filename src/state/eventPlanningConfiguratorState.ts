// Fase 2 del configurador "Cómo queréis que sea vuestro evento" — estado abierto/cerrado del acordeón
// (global y por bloque), persistido en localStorage por evento. Mismo patrón que movementColorMode.ts:
// funciones try/catch, sin romper nada si localStorage no está disponible (privado/bloqueado). No hace
// falta el aviso cross-pestaña de movementColorMode.ts aquí — el acordeón vive en una sola pantalla.

function storageKey(eventId: string, blockKey: string | null): string {
  return blockKey ? `familyapp:event-configurator:${eventId}:block:${blockKey}` : `familyapp:event-configurator:${eventId}:open`
}

// Por defecto abierto: un configurador plegado sin que nadie lo haya tocado todavía escondería el único
// bloque que existe hoy (Ceremonia y celebración) — mejor que la familia lo vea la primera vez.
export function loadConfiguratorOpen(eventId: string, blockKey: string | null = null): boolean {
  try {
    const raw = localStorage.getItem(storageKey(eventId, blockKey))
    return raw === null ? true : raw === 'true'
  } catch {
    return true
  }
}

export function saveConfiguratorOpen(eventId: string, blockKey: string | null, open: boolean): void {
  try {
    localStorage.setItem(storageKey(eventId, blockKey), String(open))
  } catch {
    // localStorage no disponible: se pierde recordar el estado entre visitas, no es crítico.
  }
}
