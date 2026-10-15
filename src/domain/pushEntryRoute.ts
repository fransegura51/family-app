// Dirección de entrada al tocar un aviso (push web/PWA y app nativa).
//
// PEPA se sirve en GitHub Pages sin «fallback» de SPA, así que la ruta real viaja en la query:
//   «?/comunidad/p/<id>?nuevos=1~and~c=<id>»
// y el script de `index.html` (contraparte de `public/404.html`) la descodifica ANTES de que arranque React Router:
// parte la query por «&», cambia «~and~» por «&» dentro de cada trozo y une los trozos con «?».
// Por eso un «&» real de la ruta del aviso (p. ej. «?nuevos=1&c=<id>», que genera el servidor en la migración 0271)
// DEBE viajar como «~and~»: si no, el descodificador lo toma por separador y lo convierte en «?»
// («nuevos» pasaba a valer «1?c=…» y «c» desaparecía; INC-04 de la auditoría).
//
// INC-06: el aviso trae además el id de su entrada en la campana (clave «n»). Viaja como el parámetro «aviso» al final de la ruta
// («…?evento=<id>~and~fecha=<día>~and~aviso=<id>») y la app lo usa para marcar ese aviso como leído (NotificationOpenMarker).
import { appendQueryParam, NOTIFICATION_PARAM, notificationIdFromPushData } from './notificationDeepLink'

// Solo rutas internas de la app («/algo»): nunca «//otra-web» ni barras invertidas.
export function isInternalPushPath(path: unknown): path is string {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') && !path.includes('\\')
}

// Lo que se guarda en la notificación: la ruta (texto, como siempre) o { url, n } (avisos con id de campana).
function pathOf(data: unknown): unknown {
  return typeof data === 'object' && data !== null ? (data as { url?: unknown }).url : data
}

// Ruta del aviso -> valor de la query de entrada («/calendario» si no viene o no es una ruta interna).
// Acepta la ruta sola (avisos antiguos ya mostrados) o los datos del aviso { url, n }.
export function pushEntryQuery(data: unknown, fallback = '/calendario'): string {
  const path = pathOf(data)
  let safe = isInternalPushPath(path) ? path : fallback
  const notificationId = notificationIdFromPushData(data)
  if (notificationId) safe = appendQueryParam(safe, NOTIFICATION_PARAM, notificationId)
  return safe.replace(/&/g, '~and~')
}

// Dirección completa de entrada (`base` = raíz de la app o ámbito del service worker, acabada en «/»).
export function pushEntryUrl(base: string, data: unknown, fallback = '/calendario'): string {
  return `${base}?${pushEntryQuery(data, fallback)}`
}
