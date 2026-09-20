// Nota emergente breve ("Fecha anotada en el calendario") que desaparece sola.
// Cualquier parte de la app puede lanzarla con showToast(); ToastHost (montado
// una vez en NavShell) la enseña durante unos segundos. Varias notas lanzadas
// a la vez (p. ej. fecha y recordatorio al guardar) se apilan en la misma nota.
type Listener = (messages: string[]) => void

const listeners = new Set<Listener>()
let current: string[] = []
let timer: number | undefined

function emit() {
  listeners.forEach((l) => l(current))
}

export function showToast(message: string, durationMs = 3000): void {
  if (!current.includes(message)) current = [...current, message]
  emit()
  window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    current = []
    emit()
  }, durationMs)
}

export function subscribeToast(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
