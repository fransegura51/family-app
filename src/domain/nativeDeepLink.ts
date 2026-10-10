// Enlace de vuelta a la app nativa tras conectar Google Calendar o el banco. El servidor (callbacks de Google y de Enable Banking) manda a una página puente
// de PEPA (public/volver-app.html) que abre «es.pepafamilyapp.app://open/<ruta>?<consulta>»; aquí se convierte en una ruta de DENTRO de la app.
//
// Solo se aceptan unas pocas rutas conocidas (las mismas a las que ya volvía la web): un enlace con otra ruta no lleva a ninguna parte rara.

export const APP_SCHEME = 'es.pepafamilyapp.app'
export const ALLOWED_RETURN_PATHS = ['/', '/calendario', '/dinero'] as const

// Devuelve la ruta interna (con su consulta) o null si el enlace no es de esta app o la ruta no está permitida.
export function parseDeepLink(rawUrl: string): string | null {
  const prefix = `${APP_SCHEME}://open`
  if (!rawUrl.startsWith(prefix)) return null
  const rest = rawUrl.slice(prefix.length) // «/calendario?google=connected» (o vacío)
  const [pathPart, ...queryParts] = rest.split('?')
  const path = pathPart === '' ? '/' : pathPart
  if (!(ALLOWED_RETURN_PATHS as readonly string[]).includes(path)) return null
  const query = queryParts.join('?')
  return query ? `${path}?${query}` : path
}
