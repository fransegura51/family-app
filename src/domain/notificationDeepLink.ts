// Enlaces de entrada desde un aviso (push web/PWA y app nativa): lógica pura, sin red.
//
// Al tocar un aviso del sistema, el servidor manda en la carga del push el id del aviso del historial de la campana (clave «n», INC-06). El service
// worker y la app nativa lo pasan a la dirección de entrada como el parámetro «aviso»; al arrancar, la app lo lee, marca ESE aviso como leído y lo
// quita de la dirección. NUNCA se confía en la dirección: el id se valida como uuid antes de usarlo y, aun así, el servidor solo deja marcar los
// avisos propios (RLS de user_notifications).

export const NOTIFICATION_PARAM = 'aviso'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

// Id del aviso que trae la dirección (?aviso=<uuid>), o null si no viene o no es un uuid.
export function notificationIdFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get(NOTIFICATION_PARAM)
  return isUuid(value) ? value.toLowerCase() : null
}

// Id del aviso que trae la carga del push o de la notificación nativa ({ url, n }); null si falta o no es un uuid.
export function notificationIdFromPushData(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null
  const n = (data as { n?: unknown }).n
  return isUuid(n) ? n.toLowerCase() : null
}

// Añade un parámetro a una ruta interna («/calendario?evento=…» → «…&aviso=…»), respetando un posible «#».
export function appendQueryParam(path: string, name: string, value: string): string {
  const hashAt = path.indexOf('#')
  const base = hashAt === -1 ? path : path.slice(0, hashAt)
  const hash = hashAt === -1 ? '' : path.slice(hashAt)
  const joiner = base.includes('?') ? '&' : '?'
  return `${base}${joiner}${encodeURIComponent(name)}=${encodeURIComponent(value)}${hash}`
}

// La misma query sin los parámetros indicados («?a=1&aviso=x» → «?a=1»; sin nada que conservar, cadena vacía).
export function searchWithoutParams(search: string, names: string[]): string {
  const params = new URLSearchParams(search)
  for (const name of names) params.delete(name)
  const rest = params.toString()
  return rest ? `?${rest}` : ''
}
