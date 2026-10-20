// Cuándo vuelve a pedirse el PIN. Antes solo se pedía al abrir la app desde cero o al recargarla: se podía dejar PEPA «desbloqueada» en segundo plano
// toda la noche. Ahora, si la persona tiene PIN y la app ha estado fuera de la pantalla un minuto o más, al volver se pide de nuevo.
// Un minuto (y no «al instante») para no pedir el PIN cada vez que se contesta un mensaje, se hace una foto o se abre un selector de archivos.
export const RELOCK_AFTER_BACKGROUND_MS = 60_000

export interface RelockInput {
  /** Marca de tiempo (ms) de cuando la app dejó de verse, o null si no se sabe. */
  hiddenAtMs: number | null
  nowMs: number
  hasPin: boolean
  thresholdMs?: number
}

export function shouldRelockAfterBackground({ hiddenAtMs, nowMs, hasPin, thresholdMs = RELOCK_AFTER_BACKGROUND_MS }: RelockInput): boolean {
  if (!hasPin || hiddenAtMs === null) return false
  // Un reloj que retrocede (hora cambiada) se trata como «no ha pasado el tiempo»: no se bloquea por un error de reloj.
  if (nowMs < hiddenAtMs) return false
  return nowMs - hiddenAtMs >= thresholdMs
}

/** Aviso interno: la pantalla de Seguridad lo lanza al activar, cambiar o quitar el PIN para que el bloqueo lo sepa sin recargar. */
export const APP_LOCK_CHANGED_EVENT = 'pepa:app-lock-changed'
