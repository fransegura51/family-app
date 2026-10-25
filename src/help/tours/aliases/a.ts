// Identificadores ANTIGUOS de tutoriales (Calendario) que ya no existen como tutorial propio: apuntan al capítulo que ahora cubre su contenido.
// Así se conservan los enlaces antiguos (fichas, voz, `next`) y el progreso ya guardado.
export const ALIASES_A: Record<string, string> = {
  // «Crear una tarea» (piloto de 10 pasos): ahora la tarea se explica dentro de «Crear eventos y tareas»; su capítulo 1 dice en qué se diferencia y cada capítulo anota lo que cambia.
  'cal-crear-tarea': 'cal-crear-evento',
  // «Crear una tarea que se repite»: la repetición se enseña una sola vez, en el capítulo «Repeticiones», con las diferencias de la tarea anotadas.
  'tut-calendario-tarea-repetitiva': 'tut-calendario-evento-repetitivo',
}
