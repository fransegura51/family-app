// Marca de llegada de un destino de la Ayuda (ver src/help/destinations.ts). No cambia el diseño ni lo que se lee: es un elemento vacío e invisible que la pantalla pinta justo
// cuando su vista ya está montada. `reveal` (opcional) es un selector CSS del elemento que debe quedar a la vista al llegar (si no, el siguiente elemento hermano).
export function HelpDestMark({ id, reveal }: { id: string; reveal?: string }) {
  return <span data-help-dest={id} data-help-reveal={reveal} aria-hidden="true" style={{ display: 'none' }} />
}
