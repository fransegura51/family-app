// Qué miembros tiene CalendarScreen filtrados ahora mismo (su fila de
// chips "Todos" / cada persona), para que Pepa pueda contestar
// preguntas del calendario ya acotadas a esas personas sin tener que
// nombrarlas — petición real: "que puedas filtrar por cada miembro...
// y que Pepa detecte solamente las tareas de ese miembro". Un nombre
// dicho explícitamente en la propia pregunta ("¿qué tiene Eric hoy?")
// sigue ganando siempre a este filtro. Variable de módulo simple,
// mismo patrón que calendarSelection.ts — viven en el mismo árbol de
// React de la SPA, no hace falta Context ni eventos.
// Vacío = sin filtrar, se ve/contesta de toda la familia.
let memberIds: string[] = []

export function setCalendarMemberFilter(ids: string[]): void {
  memberIds = ids
}

export function getCalendarMemberFilter(): string[] {
  return memberIds
}
