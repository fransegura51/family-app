// Bus mínimo de eventos de la aplicación para los tutoriales «Enséñame»: las pantallas reales anuncian «esto se ha guardado» JUSTO DESPUÉS de que el servidor lo confirme (nunca al
// pulsar el botón), y así un tutorial reconoce una acción realizada correctamente en vez de fiarse de un simple clic (que podría fallar por validación o por red).
// No guarda nada, no llama a ningún servidor y, si nadie escucha (la inmensa mayoría del tiempo), no hace nada.
export type HelpEventName = 'calendar.event-created' | 'shopping.product-added' | 'family.member-added'

type Listener = (name: string) => void
const listeners = new Set<Listener>()

export function emitHelpEvent(name: HelpEventName): void {
  for (const l of [...listeners]) {
    try {
      l(name)
    } catch {
      /* un oyente que falla nunca debe romper la pantalla que guarda */
    }
  }
}

export function onHelpEvent(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
