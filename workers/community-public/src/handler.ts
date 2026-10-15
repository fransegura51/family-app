// (Manejador sin la entrada del Worker: aquí viven `handle` y las constantes; `index.ts` solo exporta el `fetch`, porque un Worker de módulos
// NO admite otras exportaciones que no sean manejadores y workerd se niega a arrancar.)
// Cloudflare Worker de la LECTURA PÚBLICA de Comunidad PEPA (enlaces de WhatsApp, vistas previas y Google).
//
// Qué hace: atiende las direcciones públicas, pide a Supabase los datos públicos (funciones `community_public_*`, de solo lectura y solo para lo
// publicado y visible) y devuelve HTML completo con metadatos. El HTML lo genera `src/domain/communityPublicPage.ts` (el mismo archivo que prueba Vitest);
// aquí solo hay rutas, llamadas a Supabase, caché y cabeceras de seguridad.
//
// Rutas (todas relativas a la ruta de PUBLIC_BASE; con PUBLIC_BASE = https://pepafamilyapp.es/c):
//   GET /c/p/<uuid>     publicación (200, o 404 «ya no está disponible» con noindex)
//   GET /c/img/<ruta>   foto de Comunidad (`<id perfil>/<uuid>.jpg|png|webp`): el bucket de Supabase es PRIVADO; el Worker la pide con la clave anónima y solo
//                       llega si cuelga de contenido publicado (política de Storage). Cualquier otro caso: 404 neutro. Caché 120 s. Nunca acepta una URL del cliente.
//   GET /c/sitemap.xml  mapa del sitio con las publicaciones visibles
//   GET /c/robots.txt   robots (OJO: Google solo hace caso al robots.txt de la RAÍZ del dominio; ver README)
//   GET /c o /c/        redirige a la Comunidad dentro de la aplicación
//   cualquier otra      404 neutro con noindex
//
// Caché (Cache API de Cloudflare, por dirección canónica, sin tener en cuenta ?parámetros):
//   publicaciones: 60 s «frescas» + 60 s sirviendo la copia vieja mientras se refresca en segundo plano (stale-while-revalidate).
//   404: solo 10 s (para que una publicación recién creada no se quede «no disponible», y lo borrado deje de verse enseguida).
//   fallos al hablar con Supabase: 503 y NUNCA se guardan en caché (un fallo temporal no debe parecer «borrado» a Google).
import { COMMUNITY_MEDIA_BUCKET, isCommunityPhotoPath } from '../../../src/domain/communityPhotoPath'
import {
  isUuid,
  publicPageCsp,
  renderGonePage,
  renderPostPage,
  renderRobotsTxt,
  renderSitemapXml,
  renderUnavailablePage,
  type PublicPageConfig,
} from '../../../src/domain/communityPublicPage'
import { handleReport } from './report'

export interface Env {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  APP_BASE: string
  PUBLIC_BASE: string
  DEFAULT_IMAGE?: string
  // «Denunciar contenido» de visitantes (src/report.ts). Turnstile solo se usa si están LAS DOS; REPORT_SALT es secreta y opcional.
  TURNSTILE_SITE_KEY?: string
  TURNSTILE_SECRET?: string
  REPORT_SALT?: string
}

// Lo mínimo que necesitamos de la Cache API y del contexto de ejecución (así se prueba sin Cloudflare).
export interface CacheLike {
  match(request: Request): Promise<Response | undefined>
  put(request: Request, response: Response): Promise<void>
}
export interface Deps {
  fetch: (input: string, init?: RequestInit) => Promise<Response>
  cache: CacheLike | null
  waitUntil: (promise: Promise<unknown>) => void
  now: () => number
}

export const POST_FRESH_SECONDS = 60
export const POST_STALE_SECONDS = 60
export const GONE_FRESH_SECONDS = 10
export const SITEMAP_FRESH_SECONDS = 300
export const SITEMAP_STALE_SECONDS = 300
export const SITEMAP_MAX_URLS = 5000
export const IMAGE_FRESH_SECONDS = 120
export const IMAGE_MISSING_SECONDS = 20
export const IMAGE_MAX_BYTES = 3 * 1024 * 1024
const UPSTREAM_TIMEOUT_MS = 6000

// Resultado ya construido de una petición, antes de convertirlo en Response (y lo que se guarda en la caché).
interface Built {
  status: number
  body: string
  contentType: string
  fresh: number
  stale: number
  noindex?: boolean
  noStore?: boolean
  retryAfter?: number
}

class UpstreamError extends Error {}

function configFrom(env: Env): PublicPageConfig | null {
  const ok = (v: unknown) => typeof v === 'string' && /^https?:\/\/[^\s]+$/i.test(v.trim())
  if (!ok(env.SUPABASE_URL) || !ok(env.APP_BASE) || !ok(env.PUBLIC_BASE) || typeof env.SUPABASE_ANON_KEY !== 'string' || env.SUPABASE_ANON_KEY.length < 20) return null
  const trim = (v: string) => v.trim().replace(/\/+$/, '')
  return {
    publicBase: trim(env.PUBLIC_BASE),
    appBase: trim(env.APP_BASE),
    // El bucket de fotos es PRIVADO (migraciones 0266 y 0277): las páginas apuntan a la ruta `/img` de este mismo Worker, que es quien lo lee.
    mediaBase: `${trim(env.PUBLIC_BASE)}/img`,
    ...(ok(env.DEFAULT_IMAGE) ? { defaultImage: env.DEFAULT_IMAGE!.trim() } : {}),
  }
}

function securityHeaders(config: PublicPageConfig): Record<string, string> {
  return {
    'content-security-policy': publicPageCsp(config),
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'x-frame-options': 'DENY',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  }
}

function toResponse(built: Built, config: PublicPageConfig, method: string): Response {
  const headers = new Headers(securityHeaders(config))
  headers.set('content-type', built.contentType)
  if (built.noStore) headers.set('cache-control', 'no-store')
  else headers.set('cache-control', `public, max-age=${built.fresh}${built.stale > 0 ? `, stale-while-revalidate=${built.stale}` : ''}`)
  if (built.noindex) headers.set('x-robots-tag', 'noindex, nofollow')
  if (built.retryAfter) headers.set('retry-after', String(built.retryAfter))
  return new Response(method === 'HEAD' ? null : built.body, { status: built.status, headers })
}

// Cabeceras con la clave pública. Las claves antiguas (anon) son JWT y van también como Bearer; las nuevas «sb_publishable_…» solo en apikey.
function supabaseHeaders(env: Env): Record<string, string> {
  const key = env.SUPABASE_ANON_KEY
  const headers: Record<string, string> = { apikey: key }
  if (key.startsWith('eyJ')) headers.authorization = `Bearer ${key}`
  return headers
}

// Llamada a una función pública de Supabase. Cualquier fallo (red, tiempo, estado ≠ 2xx, JSON roto) es UpstreamError → 503, nunca «no existe».
async function rpc(name: string, args: Record<string, unknown>, env: Env, deps: Deps): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
  try {
    const headers: Record<string, string> = { ...supabaseHeaders(env), 'content-type': 'application/json', accept: 'application/json' }
    const res = await deps.fetch(`${env.SUPABASE_URL.trim().replace(/\/+$/, '')}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(args),
      signal: controller.signal,
    })
    if (!res.ok) throw new UpstreamError(`${name}: ${res.status}`)
    return (await res.json()) as unknown
  } catch (e) {
    throw e instanceof UpstreamError ? e : new UpstreamError(`${name}: ${e instanceof Error ? e.message : 'error'}`)
  } finally {
    clearTimeout(timer)
  }
}

const html = (status: number, body: string, extra: Partial<Built>): Built => ({ status, body, contentType: 'text/html; charset=utf-8', fresh: 0, stale: 0, ...extra })

const goneBuilt = (config: PublicPageConfig): Built => html(404, renderGonePage(config), { fresh: GONE_FRESH_SECONDS, stale: 0, noindex: true })
const unavailableBuilt = (config: PublicPageConfig): Built => html(503, renderUnavailablePage(config), { noStore: true, noindex: true, retryAfter: 30 })

async function buildPost(id: string, env: Env, config: PublicPageConfig, deps: Deps): Promise<Built> {
  const post = await rpc('community_public_get_post', { p_id: id }, env, deps)
  // null = no existe, está oculta, eliminada, restringida o Comunidad aún no ha abierto: se comporta igual en todos los casos (no se filtra cuál).
  if (post === null || typeof post !== 'object') return goneBuilt(config)
  const isPoll = (post as { kind?: unknown }).kind === 'encuesta'
  const [comments, poll] = await Promise.all([
    rpc('community_public_get_comments', { p_post: id, p_limit: 50 }, env, deps),
    isPoll ? rpc('community_public_get_poll', { p_post: id }, env, deps) : Promise.resolve(null),
  ])
  const page = renderPostPage({ post, comments, poll, config })
  if (page === null) return goneBuilt(config)
  return html(200, page, { fresh: POST_FRESH_SECONDS, stale: POST_STALE_SECONDS })
}

async function buildSitemap(env: Env, config: PublicPageConfig, deps: Deps): Promise<Built> {
  const items = await rpc('community_public_sitemap', { p_limit: SITEMAP_MAX_URLS, p_offset: 0 }, env, deps)
  return { status: 200, body: renderSitemapXml(items, config), contentType: 'application/xml; charset=utf-8', fresh: SITEMAP_FRESH_SECONDS, stale: SITEMAP_STALE_SECONDS }
}

// Guarda en la caché con una vida igual a fresh + stale; los datos de frescura viajan en cabeceras internas.
async function store(deps: Deps, key: Request, built: Built): Promise<void> {
  if (!deps.cache || built.noStore || built.status >= 500) return
  const lifetime = built.fresh + built.stale
  const res = new Response(built.body, {
    status: built.status,
    headers: {
      'content-type': built.contentType,
      'cache-control': `public, max-age=${lifetime}`,
      'x-pepa-born': String(deps.now()),
      'x-pepa-fresh': String(built.fresh),
      'x-pepa-stale': String(built.stale),
      'x-pepa-noindex': built.noindex ? '1' : '0',
    },
  })
  try {
    await deps.cache.put(key, res)
  } catch {
    // Guardar en caché es solo una mejora: si falla, la respuesta se sirve igual.
  }
}

async function cached(request: Request, deps: Deps, config: PublicPageConfig, keyUrl: string, build: () => Promise<Built>): Promise<Response> {
  const key = new Request(keyUrl, { method: 'GET' })
  const hit = deps.cache ? await deps.cache.match(key).catch(() => undefined) : undefined
  if (hit) {
    const born = Number(hit.headers.get('x-pepa-born'))
    const fresh = Number(hit.headers.get('x-pepa-fresh'))
    const stale = Number(hit.headers.get('x-pepa-stale'))
    const age = (deps.now() - born) / 1000
    if (Number.isFinite(born) && Number.isFinite(fresh) && age >= 0 && age <= fresh + stale) {
      const built: Built = {
        status: hit.status,
        body: await hit.text(),
        contentType: hit.headers.get('content-type') ?? 'text/html; charset=utf-8',
        fresh,
        stale,
        noindex: hit.headers.get('x-pepa-noindex') === '1',
      }
      if (age > fresh) {
        // Copia algo vieja: se sirve ya y se renueva por detrás (el fallo de la renovación no se guarda ni molesta).
        deps.waitUntil(
          build()
            .then((fresher) => store(deps, key, fresher))
            .catch(() => undefined),
        )
      }
      return toResponse(built, config, request.method)
    }
  }
  let built: Built
  try {
    built = await build()
  } catch {
    return toResponse(unavailableBuilt(config), config, request.method)
  }
  deps.waitUntil(store(deps, key, built))
  return toResponse(built, config, request.method)
}

// ---------------------------------------------------------------------------------------------------------------------
// Fotos (`/img/<ruta>`)
// ---------------------------------------------------------------------------------------------------------------------
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
type ImageType = (typeof IMAGE_TYPES)[number]
const isImageType = (value: string | null): value is ImageType => value !== null && (IMAGE_TYPES as readonly string[]).includes(value)

// Tipo real según los primeros bytes (no se fía del nombre ni de la cabecera): evita servir como imagen un SVG/HTML renombrado.
function sniffImageType(b: Uint8Array): ImageType | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png'
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  return null
}

// Lee el cuerpo sin pasar de `limit` bytes (null si lo pasa): no se confía en `content-length`, que puede faltar o mentir.
async function readLimited(res: Response, limit: number): Promise<Uint8Array | null> {
  const declared = Number(res.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > limit) return null
  if (!res.body) return new Uint8Array(0)
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}

interface BuiltImage {
  status: 200 | 404 | 503
  bytes: Uint8Array | null
  type: ImageType | null
}

// Los tipos de DOM de TypeScript no reconocen Uint8Array como cuerpo válido aunque en Workers (y en cualquier navegador) lo es.
const asBody = (bytes: Uint8Array): BodyInit => bytes as unknown as BodyInit

const MISSING_IMAGE: BuiltImage = { status: 404, bytes: null, type: null }
const FAILED_IMAGE: BuiltImage = { status: 503, bytes: null, type: null }

// Pide el archivo a Storage con la clave ANÓNIMA. Lo que no sea un 200 con una foto válida (no existe, está oculta, no hay permiso, tipo o tamaño no admitidos,
// redirección…) es un 404 idéntico: no se distingue «oculta» de «inexistente». Solo un fallo de red/servidor (≥ 500, 429, tiempo agotado) es 503 y NO se guarda.
// La dirección se construye aquí con una ruta ya validada: el cliente nunca aporta una URL.
async function fetchImage(path: string, env: Env, deps: Deps): Promise<BuiltImage> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
  try {
    const url = `${env.SUPABASE_URL.trim().replace(/\/+$/, '')}/storage/v1/object/authenticated/${COMMUNITY_MEDIA_BUCKET}/${path}`
    const res = await deps.fetch(url, {
      method: 'GET',
      headers: { ...supabaseHeaders(env), accept: 'image/jpeg,image/png,image/webp' },
      redirect: 'manual',
      signal: controller.signal,
    })
    if (res.status >= 500 || res.status === 429) return FAILED_IMAGE
    if (res.status !== 200) return MISSING_IMAGE
    const declared = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase().replace('image/jpg', 'image/jpeg')
    if (!isImageType(declared)) return MISSING_IMAGE
    const bytes = await readLimited(res, IMAGE_MAX_BYTES)
    if (!bytes || bytes.length === 0) return MISSING_IMAGE
    const real = sniffImageType(bytes)
    if (real === null || real !== declared) return MISSING_IMAGE
    return { status: 200, bytes, type: real }
  } catch {
    return FAILED_IMAGE
  } finally {
    clearTimeout(timer)
  }
}

const IMAGE_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; sandbox",
  'cross-origin-resource-policy': 'cross-origin',
  // La aplicación (otro dominio) descarga la foto de una receta publicada para copiarla a la Cocina: hace falta CORS. Solo contenido público, sin cookies.
  'access-control-allow-origin': '*',
  'referrer-policy': 'no-referrer',
  'content-disposition': 'inline',
}

// `born` = cuándo se pidió a Supabase (para que una copia de la caché anuncie solo el tiempo que le queda y no alargue la vida de lo ocultado).
function imageResponse(built: BuiltImage, method: string, born: number | null, deps: Deps): Response {
  const body = (value: BodyInit): BodyInit | null => (method === 'HEAD' ? null : value)
  if (built.status === 200 && built.bytes && built.type) {
    const left = born === null ? IMAGE_FRESH_SECONDS : Math.max(1, Math.ceil(IMAGE_FRESH_SECONDS - (deps.now() - born) / 1000))
    return new Response(body(asBody(built.bytes)), {
      status: 200,
      headers: { ...IMAGE_HEADERS, 'content-type': built.type, 'content-length': String(built.bytes.length), 'cache-control': `public, max-age=${left}, s-maxage=${left}` },
    })
  }
  if (built.status === 503) {
    return new Response(body('No disponible ahora mismo'), {
      status: 503,
      headers: { ...IMAGE_HEADERS, 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'retry-after': '30', 'x-robots-tag': 'noindex, nofollow' },
    })
  }
  return new Response(body('No disponible'), {
    status: 404,
    headers: {
      ...IMAGE_HEADERS,
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': `public, max-age=${IMAGE_MISSING_SECONDS}, s-maxage=${IMAGE_MISSING_SECONDS}`,
      'x-robots-tag': 'noindex, nofollow',
    },
  })
}

async function storeImage(deps: Deps, key: Request, built: BuiltImage): Promise<void> {
  if (!deps.cache || built.status === 503) return
  const lifetime = built.status === 200 ? IMAGE_FRESH_SECONDS : IMAGE_MISSING_SECONDS
  const res = new Response(built.bytes ? asBody(built.bytes) : null, {
    status: 200, // el estado real (200/404) viaja en una cabecera interna
    headers: {
      'content-type': built.type ?? 'application/octet-stream',
      'cache-control': `public, max-age=${lifetime}`,
      'x-pepa-born': String(deps.now()),
      'x-pepa-status': String(built.status),
    },
  })
  try {
    await deps.cache.put(key, res)
  } catch {
    // Guardar en caché es solo una mejora: si falla, la respuesta se sirve igual.
  }
}

async function serveImage(request: Request, path: string, env: Env, config: PublicPageConfig, deps: Deps): Promise<Response> {
  const method = request.method.toUpperCase()
  // Ruta validada ANTES de tocar nada: sin «..», sin %XX (no se decodifica), solo `<uuid>/<uuid>.<jpg|jpeg|png|webp>` y ≤ 200 caracteres.
  if (!isCommunityPhotoPath(path)) return imageResponse(MISSING_IMAGE, method, null, deps)
  const key = new Request(`${config.mediaBase}/${path}`, { method: 'GET' })
  const hit = deps.cache ? await deps.cache.match(key).catch(() => undefined) : undefined
  if (hit) {
    const born = Number(hit.headers.get('x-pepa-born'))
    const status = Number(hit.headers.get('x-pepa-status'))
    const type = hit.headers.get('content-type')
    const lifetime = status === 200 ? IMAGE_FRESH_SECONDS : IMAGE_MISSING_SECONDS
    const age = (deps.now() - born) / 1000
    if (Number.isFinite(born) && age >= 0 && age <= lifetime) {
      if (status === 404) return imageResponse(MISSING_IMAGE, method, null, deps)
      if (status === 200 && isImageType(type)) return imageResponse({ status: 200, bytes: new Uint8Array(await hit.arrayBuffer()), type }, method, born, deps)
    }
  }
  const built = await fetchImage(path, env, deps)
  deps.waitUntil(storeImage(deps, key, built))
  return imageResponse(built, method, deps.now(), deps)
}

export async function handle(request: Request, env: Env, deps: Deps): Promise<Response> {
  const method = request.method.toUpperCase()
  // POST solo lo admite `/report` (se comprueba más abajo, cuando ya se sabe la ruta): en cualquier otra dirección sigue siendo 405.
  const notAllowed = () => new Response('Método no permitido', { status: 405, headers: { allow: 'GET, HEAD', 'cache-control': 'no-store' } })
  if (method !== 'GET' && method !== 'HEAD' && method !== 'POST') return notAllowed()
  const config = configFrom(env)
  if (!config) {
    // Falta configurar variables: no se enseña qué falta (podría ayudar a un atacante); está explicado en el README.
    return new Response('Servicio sin configurar', { status: 500, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } })
  }

  const url = new URL(request.url)
  const basePath = new URL(config.publicBase).pathname.replace(/\/+$/, '')
  const pathname = url.pathname
  if (basePath && pathname !== basePath && !pathname.startsWith(`${basePath}/`)) return toResponse(goneBuilt(config), config, method)
  const rest = pathname.slice(basePath.length)

  // «Denunciar contenido» para visitantes sin cuenta (formulario GET y envío POST): todo vive en report.ts, sin caché.
  if (rest === '/report' || rest === '/report/') return handleReport(request, env, { publicBase: config.publicBase, appBase: config.appBase }, deps)
  if (method === 'POST') return notAllowed()

  if (rest === '' || rest === '/') {
    return new Response(null, { status: 302, headers: { location: `${config.appBase}/comunidad`, 'cache-control': 'public, max-age=300' } })
  }
  if (rest === '/robots.txt') {
    return toResponse({ status: 200, body: renderRobotsTxt(config), contentType: 'text/plain; charset=utf-8', fresh: 3600, stale: 0 }, config, method)
  }
  if (rest === '/sitemap.xml') {
    return cached(request, deps, config, `${config.publicBase}/sitemap.xml`, () => buildSitemap(env, config, deps))
  }
  if (rest.startsWith('/img/')) return serveImage(request, rest.slice('/img/'.length), env, config, deps)
  const match = /^\/p\/([^/]+)\/?$/.exec(rest)
  if (match) {
    // El id se valida ANTES de tocar Supabase: lo que no es un uuid ni se consulta ni se guarda en caché.
    if (!isUuid(match[1])) return toResponse(goneBuilt(config), config, method)
    const id = match[1].toLowerCase()
    return cached(request, deps, config, `${config.publicBase}/p/${id}`, () => buildPost(id, env, config, deps))
  }
  return toResponse(goneBuilt(config), config, method)
}
