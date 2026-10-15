// Dirección de entrada al tocar un aviso (push web/PWA y app nativa).
//
// PEPA se sirve en GitHub Pages sin «fallback» de SPA, así que la ruta real viaja en la query:
//   «?/comunidad/p/<id>?nuevos=1~and~c=<id>»
// y el script de `index.html` (contraparte de `public/404.html`) la descodifica ANTES de que arranque React Router:
// parte la query por «&», cambia «~and~» por «&» dentro de cada trozo y une los trozos con «?».
// Por eso un «&» real de la ruta del aviso (p. ej. «?nuevos=1&c=<id>», que genera el servidor en la migración 0271)
// DEBE viajar como «~and~»: si no, el descodificador lo toma por separador y lo convierte en «?»
// («nuevos» pasaba a valer «1?c=…» y «c» desaparecía; INC-04 de la auditoría).

// Solo rutas internas de la app («/algo»): nunca «//otra-web» ni barras invertidas.
export function isInternalPushPath(path: unknown): path is string {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') && !path.includes('\\')
}

// Ruta del aviso -> valor de la query de entrada («/calendario» si no viene o no es una ruta interna).
export function pushEntryQuery(path: unknown, fallback = '/calendario'): string {
  const safe = isInternalPushPath(path) ? path : fallback
  return safe.replace(/&/g, '~and~')
}

// Dirección completa de entrada (`base` = raíz de la app o ámbito del service worker, acabada en «/»).
export function pushEntryUrl(base: string, path: unknown, fallback = '/calendario'): string {
  return `${base}?${pushEntryQuery(path, fallback)}`
}
