// Rutas reales de la app a las que la Ayuda puede llevar («Llévame»). Debe coincidir con las rutas de src/App.tsx (una prueba lo comprueba): si se añade o quita una
// pantalla, se toca aquí en el mismo cambio. Las rutas con parámetros dinámicos no están: la Ayuda solo lleva a pantallas, nunca a datos concretos de una familia.
export const KNOWN_APP_ROUTES: readonly string[] = [
  '/',
  '/calendario',
  '/eventos',
  '/puntos',
  '/compras',
  '/familia',
  '/alimentacion',
  '/dinero',
  '/ubicacion',
  '/actividad',
  '/cumpleanos',
  '/contactos',
  '/galeria',
  '/documentos',
  '/listas',
  '/menu-organizar',
  '/ayuda',
  '/sugerencias',
  '/resenas',
  '/comunidad',
  // Centro de Administración (solo cuentas propietarias): lo usan las fichas y recorridos marcados con `ownerOnly`.
  '/administracion',
]

// Ruta de Comunidad (varias pantallas bajo /comunidad/…): la Ayuda solo lleva a su portada.
export function isKnownHelpPath(path: string): boolean {
  return KNOWN_APP_ROUTES.includes(path)
}
