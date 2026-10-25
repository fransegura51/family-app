// Identificadores ANTIGUOS de tutoriales (Configuración, Cuentas y Avisos) que ya no existen como tutorial propio: apuntan al capítulo que ahora cubre su contenido.
// Así se conservan los enlaces antiguos (fichas, voz, `next`) y el progreso ya guardado.
export const ALIASES_F: Record<string, string> = {
  // «Tus ajustes en varios dispositivos» no tenía botón propio: pasó a la explicación «Qué ajustes son tuyos y cuáles son de toda la familia». El capítulo más cercano son los colores.
  'tut-configuracion-sincronizacion': 'tut-configuracion-colores',
  // «Cambiar el orden del menú» es ahora el capítulo «Elegir las 4 secciones fijas» de la serie de Inicio (los mismos pasos: la lista de «Organizar menú» y las flechas ↑ ↓).
  'tut-configuracion-orden-menu': 'tut-ini-secciones-fijas',
  // Cuentas: estos recorridos solo señalaban o explicaban (la pantalla de bloqueo y la de entrada no se pueden mostrar desde dentro; cerrar sesión y borrar la cuenta no se guían).
  // Ahora son visita y explicaciones «Entiende cómo funciona»; el identificador antiguo abre el capítulo más cercano.
  'tut-cuentas-olvide-pin': 'tut-cuentas-pin',
  'tut-cuentas-cerrar-sesion': 'tut-cuentas-pin',
  'tut-cuentas-borrar-cuenta': 'tut-cuentas-pin',
  'tut-cuentas-entrar': 'tut-cuentas-correo-contrasena',
}
