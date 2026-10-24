// Pantallas en las que un tutorial sigue en marcha. Una entrada exacta ('/comunidad') o un prefijo con comodín ('/comunidad/*', que incluye '/comunidad' y todo lo que cuelga de ella):
// Comunidad tiene varias pantallas bajo /comunidad/… (publicación, editor, borradores) por las que un tutorial pasa sin quedar «fuera de ruta».
export function pathAllowed(allowed: readonly string[], pathname: string): boolean {
  return allowed.some((p) => (p.endsWith('/*') ? pathname === p.slice(0, -2) || pathname.startsWith(p.slice(0, -1)) : pathname === p))
}

/** La parte «real» de una entrada (sin el comodín), para comprobar que es una ruta conocida. */
export const basePath = (p: string): string => (p.endsWith('/*') ? p.slice(0, -2) : p)
