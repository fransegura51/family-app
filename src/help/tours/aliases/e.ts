// Identificadores ANTIGUOS de tutoriales (Comunidad, Ubicación, Inicio, Hablar con PEPA y Ayuda) que ya no existen como tutorial propio: apuntan al capítulo que ahora cubre su contenido.
// Así se conservan los enlaces antiguos (fichas, voz, `next`) y el progreso ya guardado.
export const ALIASES_E: Record<string, string> = {
  // Comunidad: «Qué es Comunidad PEPA» repetía la visita «Conoce Comunidad»; lo que enseñaba de práctico (el alias y las normas) es el primer capítulo. Seguir una conversación se fundió con guardar.
  'tut-comunidad-que-es': 'tut-comunidad-elegir-alias',
  'tut-comunidad-seguir-conversacion': 'tut-comunidad-guardar-publicacion',
  // Ubicación: «Ver dónde está cada miembro» repetía la visita «Conoce Ubicación»; el capítulo más cercano es compartir la ubicación.
  'tut-ubicacion-ver-miembros': 'tut-ubicacion-compartir-movil',
  // Inicio: «PEPA te avisa» queda en la visita «Conoce Inicio» y en su explicación «Cómo funciona»; la puerta que abre ahora es el recorrido de bienvenida (Inicio de un vistazo).
  'tut-ini-pepa-te-avisa': 'bienvenida',
  // Hablar con PEPA: preguntas y hablar se unieron en «Preguntar a Pepa»; los botones clásicos pasaron al capítulo «Tarjeta y botones de Pepa».
  'tut-pepa-preguntas': 'tut-pepa-hablar',
  'tut-pepa-botones': 'tut-pepa-sin-tarjeta',
}
