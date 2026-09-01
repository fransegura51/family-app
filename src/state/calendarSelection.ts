// Qué día tiene abierto CalendarScreen ahora mismo (su ventana emergente
// de un día concreto), para que "Apunta por voz" pueda usarlo como fecha
// por defecto cuando no se dice ninguna — "marco el 17 y digo 'taller
// coche' sin fecha, que me lo ponga el 17, no siempre hoy" (bug real:
// VoiceCapture vive fuera de CalendarScreen y no tenía forma de saberlo).
// Variable de módulo simple en vez de Context/eventos: los dos viven en
// el mismo árbol de React de la SPA, no hace falta más.
let selectedDate: string | null = null

export function setSelectedCalendarDate(date: string | null): void {
  selectedDate = date
}

export function getSelectedCalendarDate(): string | null {
  return selectedDate
}
