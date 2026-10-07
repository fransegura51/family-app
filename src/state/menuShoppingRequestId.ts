// Preparar compra del menú — identidad PERSISTENTE de la operación (bloque D de la tanda de Eventos).
// add_menu_shopping_lines (migración 0203) ya es idempotente por request_id: reintentar con el MISMO id
// nunca duplica. El hueco real era que ese id solo vivía en memoria (useState del modal) — si la app se
// cerraba justo después de confirmar, o el modal se desmontaba antes de recibir la respuesta, al volver
// se generaba un id NUEVO y un reintento podía duplicar la compra. Aquí se persiste en localStorage, por
// evento: mientras exista una confirmación pendiente para ESE evento se reutiliza el mismo id (reintento);
// en cuanto se confirma con éxito se borra, así que la SIGUIENTE compra (otro id) nunca queda bloqueada.
function storageKey(eventId: string): string {
  return `familyapp:menu-shopping-request:${eventId}`
}

// Si ya había una confirmación pendiente para este evento, la reutiliza (reintento); si no, crea una
// nueva y la guarda de inmediato — para que incluso un cierre justo después de leerla la recuerde.
export function pendingMenuShoppingRequestId(eventId: string): string {
  try {
    const existing = localStorage.getItem(storageKey(eventId))
    if (existing) return existing
    const fresh = crypto.randomUUID()
    localStorage.setItem(storageKey(eventId), fresh)
    return fresh
  } catch {
    // localStorage no disponible (privado/bloqueado): se pierde la persistencia entre cierres, pero la
    // propia confirmación sigue funcionando con un id en memoria para esta sesión.
    return crypto.randomUUID()
  }
}

// Tras confirmar con éxito: libera el id para que la próxima compra de este evento sea una operación
// nueva, nunca un reintento de la ya resuelta.
export function clearPendingMenuShoppingRequestId(eventId: string): void {
  try {
    localStorage.removeItem(storageKey(eventId))
  } catch {
    // No hay nada que limpiar si no se pudo guardar.
  }
}
