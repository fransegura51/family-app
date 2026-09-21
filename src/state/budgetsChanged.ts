// Aviso de "los presupuestos han cambiado" para lo que se escribe FUERA de la pantalla de Economía (hoy, Hablar con
// PEPA). Es el mismo mecanismo que ya usan Compras y Calendario ('family-app:compras-changed',
// 'family-app:calendar-changed'): un evento de la ventana; quien muestra presupuestos se suscribe y vuelve a cargar.
export const BUDGETS_CHANGED_EVENT = 'family-app:budgets-changed'

// Se llama SOLO después de que la escritura haya salido bien.
export function notifyBudgetsChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(BUDGETS_CHANGED_EVENT))
}

// Vuelve a cargar cuando avisan. Como mucho una carga a la vez: si llega otro aviso mientras se está cargando, se
// repite UNA vez al terminar (para no perder el último cambio) en vez de lanzar una carga por aviso.
export function subscribeBudgetsChanged(reload: () => Promise<unknown> | void): () => void {
  let running = false
  let again = false
  const run = async (): Promise<void> => {
    if (running) {
      again = true
      return
    }
    running = true
    try {
      await reload()
    } catch {
      // La pantalla ya muestra sus propios errores de carga.
    } finally {
      running = false
      if (again) {
        again = false
        void run()
      }
    }
  }
  const listener = () => void run()
  window.addEventListener(BUDGETS_CHANGED_EVENT, listener)
  return () => window.removeEventListener(BUDGETS_CHANGED_EVENT, listener)
}
