// Identificadores ANTIGUOS de tutoriales (Familia, La cocina de Pepa y Pequeños Grandes) que ya no existen como tutorial propio: apuntan al capítulo que ahora cubre su contenido.
// Así se conservan los enlaces antiguos (fichas, voz, `next`) y el progreso ya guardado.
//  - «Ver la actividad reciente» y «El monedero y los objetivos de ahorro» eran recorridos de solo mirar (nivel A): su contenido está ahora en la visita de su sección, y no hay
//    capítulo equivalente, así que apuntan a la visita (que sigue siendo un recorrido real, no un identificador inventado).
//  - «Mi Camino: el viaje por los tres mundos» es ahora el capítulo «Camino o Carrera y quién participa».
export const ALIASES_C: Record<string, string> = {
  'tut-familia-actividad': 'visita-familia',
  'tut-pequenos-mi-camino': 'tut-pequenos-camino-carrera',
  'tut-pequenos-monedero': 'visita-pequenos',
}
