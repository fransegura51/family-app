// Vistas previas al compartir enlaces (WhatsApp, Telegram, iMessage…): lógica PURA de la función `share-preview`.
//
// Sin APIs de Deno ni imports «npm:»: la ejecutan tal cual las pruebas del proyecto (src/domain/sharePreview.test.ts) y la función recibe el acceso a datos «por la puerta»
// (`PreviewDb`), igual que las funciones de Comunidad (ver communityServer.ts).
//
// PRIVACIDAD (decisión de diseño aprobada):
//  - Comunidad exige cuenta adulta registrada y la lectura anónima está apagada. Por eso aquí SOLO se publica el TÍTULO de una publicación OFICIAL (is_official = true, publicada y
//    no excluida: consejos, artículos y menús de Pepa y del Equipo PEPA). Con la descripción genérica de siempre. Nunca el cuerpo, el autor, las fotos ni los comentarios.
//    Una publicación de una persona, una oculta/eliminada o un id que no existe dan EXACTAMENTE la misma tarjeta genérica de marca (no se filtra cuál es el caso).
//  - Lista de deseos: el invitado ya tiene acceso público con el token de la URL (wishlist-guest). Aquí se lee lo mínimo: el nombre de quien tiene la lista. Ni regalos ni reservas.
//  - TODO texto se ESCAPA antes de entrar en el HTML y las longitudes se recortan. La dirección a la que se redirige a las personas se construye aquí con ids/tokens ya
//    validados; jamás se copia una dirección recibida en la petición.

export const BRAND = 'PEPA Family App'
export const DEFAULT_APP_BASE = 'https://fransegura51.github.io/family-app'
export const COMMUNITY_IMAGE_PATH = '/comunidad-og.jpg'
export const FAMILY_IMAGE_PATH = '/pwa-512.png'

export const COMMUNITY_GENERIC_DESCRIPTION =
  'Un artículo de Pepa en Comunidad PEPA. Entra con tu cuenta de PEPA (mayores de 18 años) para leerlo.'
export const COMMUNITY_CARD_DESCRIPTION =
  'Comunidad PEPA: consejos, artículos y menús de Pepa y de otras familias. Entra con tu cuenta de PEPA (mayores de 18 años) para leer.'
export const WISHLIST_GENERIC_TITLE = '🎁 Lista de deseos'
export const WISHLIST_GENERIC_DESCRIPTION = 'Te han compartido una lista de deseos en PEPA Family App. Ábrela para ver los regalos y reservar uno, sin crear cuenta.'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// generate_wishlist_guest_token: encode(gen_random_bytes(24), 'hex') = 48 caracteres hexadecimales.
const WISHLIST_TOKEN_RE = /^[0-9a-f]{48}$/i
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_RE.test(value)
export const isWishlistToken = (value: unknown): value is string => typeof value === 'string' && WISHLIST_TOKEN_RE.test(value)

// Sirve para texto y para atributos entre comillas (también tapa la comilla simple y el acento grave).
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;')
}

// Texto corto y seguro: sin caracteres de control ni saltos, sin correos, espacios colapsados y recortado (sin partir un emoji por la mitad).
export function cleanLine(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  const text = value
    .slice(0, max * 4)
    .replace(/[\u0000-\u001F\u007F\u2028\u2029]/g, ' ')
    .replace(EMAIL_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= max) return text
  let cut = text.slice(0, max - 1)
  if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1)
  return cut.replace(/[\s.,;:!?-]+$/, '') + '…'
}

export interface PreviewConfig {
  /** Dirección de la app, sin barra final. */
  appBase: string
  /** Dirección pública de ESTA función tal como la ve la gente (sin parámetros); se usa para og:url. Opcional. */
  selfUrl?: string
}

export interface SharePreview {
  title: string
  description: string
  /** Imagen absoluta (1200×630 o cuadrada ≥ 300). */
  image: string
  /** Dirección a la que se redirige a las personas (siempre dentro de la app). */
  redirectUrl: string
  /** og:url: la dirección que se compartió (si no se conoce, la de destino). */
  canonicalUrl: string
}

const trimSlash = (s: string) => s.replace(/\/+$/, '')

export function communityTarget(appBase: string, id?: string): string {
  const base = trimSlash(appBase)
  return id && isUuid(id) ? `${base}/comunidad/p/${id}` : `${base}/comunidad`
}

export function wishlistTarget(appBase: string, token?: string): string {
  const base = trimSlash(appBase)
  return token && isWishlistToken(token) ? `${base}/?deseos=${token}` : `${base}/`
}

// Datos mínimos de una publicación para decidir la vista previa (lo único que la función lee de ella).
export interface OfficialPostRow {
  title?: unknown
  kind?: unknown
  is_official?: unknown
  status?: unknown
  ai_excluded?: unknown
}

// Solo una publicación oficial, publicada y no excluida enseña su título. Cualquier otra cosa: tarjeta genérica.
export function communityPreview(row: OfficialPostRow | null, id: string, config: PreviewConfig): SharePreview {
  const appBase = trimSlash(config.appBase)
  const redirectUrl = communityTarget(appBase, id)
  const base = { image: appBase + COMMUNITY_IMAGE_PATH, redirectUrl, canonicalUrl: config.selfUrl ?? redirectUrl }
  const title = row && row.is_official === true && row.status === 'published' && row.ai_excluded !== true ? cleanLine(row.title, 90) : ''
  if (!title) return { ...base, title: 'Comunidad PEPA', description: COMMUNITY_CARD_DESCRIPTION }
  const kind = row?.kind
  const description = kind === 'articulo' ? COMMUNITY_GENERIC_DESCRIPTION : COMMUNITY_GENERIC_DESCRIPTION.replace('Un artículo de Pepa', 'Una publicación de Pepa').replace('leerlo', 'leerla')
  return { ...base, title, description }
}

// «🎁 Lista de deseos de [nombre]» con el nombre que ya ve cualquiera que abra la lista. Sin nombre (token desconocido): tarjeta genérica, igual que si no existiera.
export function wishlistPreview(ownerName: unknown, token: string, config: PreviewConfig): SharePreview {
  const appBase = trimSlash(config.appBase)
  const redirectUrl = wishlistTarget(appBase, token)
  const base = { image: appBase + FAMILY_IMAGE_PATH, redirectUrl, canonicalUrl: config.selfUrl ?? redirectUrl }
  const name = cleanLine(ownerName, 60)
  if (!name) return { ...base, title: WISHLIST_GENERIC_TITLE, description: WISHLIST_GENERIC_DESCRIPTION }
  return {
    ...base,
    title: `🎁 Lista de deseos de ${name}`,
    description: `${name} te ha compartido su lista de deseos. Ábrela para ver los regalos y reservar uno, sin crear cuenta.`,
  }
}

// Robots y vistas previas de apps de mensajería: reciben solo las metas (sin redirección, para que no se queden con la página de destino).
const BOT_RE = /(facebookexternalhit|whatsapp|telegrambot|twitterbot|slackbot|linkedinbot|discordbot|skypeuripreview|applebot|googlebot|bingbot|bot\b|crawler|spider|preview)/i
export function isPreviewBot(userAgent: string | null | undefined): boolean {
  return !!userAgent && BOT_RE.test(userAgent)
}

// Script de redirección: la dirección va como cadena JSON con < > & escritos como \uXXXX (no puede cerrar la etiqueta).
function jsString(value: string): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}

export function renderPreviewHtml(p: SharePreview, opts: { redirect: boolean }): string {
  const t = escapeHtml(p.title)
  const d = escapeHtml(p.description)
  const img = escapeHtml(p.image)
  const url = escapeHtml(p.canonicalUrl)
  const go = escapeHtml(p.redirectUrl)
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t} · ${escapeHtml(BRAND)}</title>
<meta name="description" content="${d}">
<meta name="robots" content="noindex, nofollow">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${escapeHtml(BRAND)}">
<meta property="og:locale" content="es_ES">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:image" content="${img}">
<meta property="og:url" content="${url}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${img}">
${opts.redirect ? `<meta http-equiv="refresh" content="0;url=${go}">\n` : ''}</head>
<body>
<p><a href="${go}">${t}</a> · ${escapeHtml(BRAND)}</p>
${opts.redirect ? `<script>location.replace(${jsString(p.redirectUrl)})</script>\n` : ''}</body>
</html>
`
}

// Lo que la función necesita de la base de datos. Cada método hace UNA consulta mínima con la clave de servicio y devuelve null si no hay nada.
export interface PreviewDb {
  post(id: string): Promise<OfficialPostRow | null>
  wishlistOwnerName(token: string): Promise<string | null>
}

export type ParsedRequest = { kind: 'comunidad'; id: string } | { kind: 'deseos'; token: string }

// ?c=<uuid de publicación>  o  ?d=<token de lista de deseos>. Cualquier otra forma = null (400).
export function parseShareRequest(url: URL): ParsedRequest | null {
  const c = url.searchParams.get('c')
  const d = url.searchParams.get('d')
  if (c !== null && d === null) return isUuid(c) ? { kind: 'comunidad', id: c.toLowerCase() } : null
  if (d !== null && c === null) return isWishlistToken(d) ? { kind: 'deseos', token: d.toLowerCase() } : null
  return null
}

const HEADERS_BASE = {
  'Content-Type': 'text/html; charset=utf-8',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
}

function plain(status: number, text: string): Response {
  return new Response(text, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })
}

export async function handleSharePreview(req: Request, db: PreviewDb, config: PreviewConfig): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'HEAD') return plain(405, 'Método no permitido')
  const parsed = parseShareRequest(new URL(req.url))
  if (!parsed) return plain(400, 'Enlace no válido')
  const cfg: PreviewConfig = { ...config, selfUrl: config.selfUrl ? selfUrlFor(config.selfUrl, parsed) : undefined }
  let preview: SharePreview
  try {
    preview =
      parsed.kind === 'comunidad'
        ? communityPreview(await db.post(parsed.id), parsed.id, cfg)
        : wishlistPreview(await db.wishlistOwnerName(parsed.token), parsed.token, cfg)
  } catch {
    // Fallo de la base: tarjeta genérica de marca (nunca se enseña el error) y sin caché, para que se reintente.
    preview =
      parsed.kind === 'comunidad' ? communityPreview(null, parsed.id, cfg) : wishlistPreview(null, parsed.token, cfg)
    return new Response(req.method === 'HEAD' ? null : renderPreviewHtml(preview, { redirect: !isPreviewBot(req.headers.get('user-agent')) }), {
      status: 200,
      headers: { ...HEADERS_BASE, 'Cache-Control': 'no-store' },
    })
  }
  const body = renderPreviewHtml(preview, { redirect: !isPreviewBot(req.headers.get('user-agent')) })
  // Caché corta: las apps de mensajería piden la misma dirección muchas veces y así no se consulta la base cada vez. «Vary» porque el cuerpo cambia según el agente.
  return new Response(req.method === 'HEAD' ? null : body, { status: 200, headers: { ...HEADERS_BASE, 'Cache-Control': 'public, max-age=300', Vary: 'User-Agent' } })
}

function selfUrlFor(selfUrl: string, parsed: ParsedRequest): string {
  const base = selfUrl.split('?')[0]
  return parsed.kind === 'comunidad' ? `${base}?c=${parsed.id}` : `${base}?d=${parsed.token}`
}
