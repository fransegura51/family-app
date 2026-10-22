// Sinónimos y expresiones habituales para el buscador de la Ayuda (palabras ya normalizadas: sin tildes, en minúsculas). Cada grupo son palabras que la gente usa para lo
// mismo. Se aplican SOLO a la pregunta y con menos peso que la palabra escrita; nunca inventan contenido: el buscador solo devuelve fichas que existen.
export const SYNONYM_GROUPS: string[][] = [
  ['gasto', 'pago', 'movimiento', 'apunte', 'cobro'],
  ['cita', 'evento', 'agendar', 'reunion', 'quedada', 'compromiso'],
  ['compra', 'supermercado', 'super', 'mercadona', 'lista'],
  ['borrar', 'eliminar', 'quitar', 'suprimir'],
  ['anadir', 'agregar', 'crear', 'nuevo', 'nueva', 'apuntar', 'dar de alta'],
  ['editar', 'modificar', 'cambiar', 'corregir', 'actualizar'],
  ['contrasena', 'clave', 'password'],
  ['correo', 'email', 'mail', 'e-mail'],
  ['usuario', 'cuenta', 'perfil', 'login'],
  ['entrar', 'acceder', 'iniciar', 'login', 'sesion'],
  ['salir', 'cerrar', 'desconectar'],
  ['foto', 'imagen', 'fotografia', 'imagenes', 'fotos'],
  ['telefono', 'movil', 'celular', 'smartphone'],
  ['aviso', 'notificacion', 'alerta', 'recordatorio', 'alarma'],
  ['hijo', 'nino', 'nina', 'peque', 'menor', 'hija', 'bebe'],
  ['familiar', 'miembro', 'persona', 'integrante'],
  ['receta', 'plato', 'comida', 'cocinar', 'cocina'],
  ['menu', 'cena', 'almuerzo', 'desayuno'],
  ['banco', 'cuenta bancaria', 'bancaria', 'iban'],
  ['dinero', 'euros', 'economia', 'finanzas', 'presupuesto'],
  ['cumpleanos', 'cumple', 'aniversario', 'natalicio'],
  ['mapa', 'ubicacion', 'localizar', 'localizacion', 'gps', 'posicion'],
  ['invitar', 'invitacion', 'invitado', 'convidar'],
  ['compartir', 'mandar', 'enviar', 'pasar'],
  ['ayuda', 'tutorial', 'guia', 'explicacion', 'instrucciones'],
  ['ajuste', 'configuracion', 'preferencia', 'opcion', 'settings'],
  ['puntos', 'premio', 'recompensa', 'estrellas'],
  ['documento', 'papel', 'dni', 'pasaporte', 'carnet', 'archivo', 'pdf'],
  ['voz', 'hablar', 'dictar', 'micro', 'microfono'],
  ['tarea', 'pendiente', 'recado', 'todo'],
  ['semana', 'semanal'],
  ['mes', 'mensual'],
  ['pin', 'bloqueo', 'candado', 'huella'],
  ['peso', 'medida', 'altura', 'crecimiento', 'percentil'],
  ['ticket', 'recibo', 'factura'],
  ['tienda', 'comercio'],
  ['calendario', 'agenda'],
  ['comunidad', 'foro', 'red'],
]

// Índice palabra → palabras equivalentes.
export const SYNONYMS: ReadonlyMap<string, readonly string[]> = (() => {
  const m = new Map<string, Set<string>>()
  for (const group of SYNONYM_GROUPS) {
    for (const w of group) {
      if (w.includes(' ')) continue
      const set = m.get(w) ?? new Set<string>()
      for (const other of group) if (other !== w && !other.includes(' ')) set.add(other)
      m.set(w, set)
    }
  }
  return new Map([...m.entries()].map(([k, v]) => [k, [...v]]))
})()
