// Pantallas que cuenta el registro de uso (solo el NOMBRE de la sección, nunca rutas con identificadores ni contenido).
// La app suma, por cuenta y día, cuántas veces se abre y cuántas veces se entra en cada pantalla (migración 0226).

// Clave especial: veces que se abrió la app (no es una pantalla).
export const OPEN_KEY = '_abre'

export const USAGE_SECTIONS: Record<string, string> = {
  inicio: 'Inicio',
  calendario: 'Calendario',
  eventos: 'Eventos',
  puntos: 'Pequeños Grandes',
  compras: 'Compras',
  familia: 'Familia',
  alimentacion: 'Alimentación',
  dinero: 'Dinero',
  ubicacion: 'Ubicación',
  actividad: 'Actividad',
  cumpleanos: 'Cumpleaños',
  contactos: 'Contactos',
  galeria: 'Galería',
  documentos: 'Documentos',
  'menu-organizar': 'Organizar menú',
  ayuda: 'Ayuda',
  sugerencias: 'Sugerencias',
}

// Ruta de la app (sin el prefijo /family-app/, que ya quita el router) → clave de pantalla, o null si no se cuenta
// (el propio panel de administración y las rutas desconocidas no se registran).
export function sectionKeyForPath(pathname: string): string | null {
  const first = pathname.split('?')[0].split('/').filter(Boolean)[0] ?? ''
  if (first === '') return 'inicio'
  return Object.prototype.hasOwnProperty.call(USAGE_SECTIONS, first) ? first : null
}

export function sectionLabel(key: string): string {
  return USAGE_SECTIONS[key] ?? key
}
