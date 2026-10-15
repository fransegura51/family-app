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
//   GET /c/sitemap.xml  mapa del sitio con las publicaciones visibles
//   GET /c/robots.txt   robots (OJO: Google solo hace caso al robots.txt de la RAÍZ del dominio; ver README)
//   GET /c o /c/        redirige a la Comunidad dentro de la aplicación
//   cualquier otra      404 neutro con noindex
//
// Caché (Cache API de Cloudflare, por dirección canónica, sin tener en cuenta ?parámetros):
//   publicaciones: 60 s «frescas» + 60 s sirviendo la copia vieja mientras se refresca en segundo plano (stale-while-revalidate).
//   404: solo 10 s (para que una publicación recién creada no se quede «no disponible», y lo borrado deje de verse enseguida).
//   fallos al hablar con Supabase: 503 y NUNCA se guardan en caché (un fallo temporal no debe parecer «borrado» a Google).
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

export interface Env {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  APP_BASE: string
  PUBLIC_BASE: string
  DEFAULT_IMAGE?: string
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
    // Bucket PÚBLICO de fotos de Comunidad (migración 0266): las fotos se sirven directamente desde el CDN de Supabase.
    mediaBase: `${trim(env.SUPABASE_URL)}/storage/v1/object/public/community-media`,
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

// Llamada a una función pública de Supabase. Cualquier fallo (red, tiempo, estado ≠ 2xx, JSON roto) es UpstreamError → 503, nunca «no existe».
async function rpc(name: string, args: Record<string, unknown>, env: Env, deps: Deps): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
  try {
    const key = env.SUPABASE_ANON_KEY
    const headers: Record<string, string> = { apikey: key, 'content-type': 'application/json', accept: 'application/json' }
    // Las claves antiguas (anon) son JWT y van también como Bearer; las nuevas «sb_publishable_…» solo en apikey.
    if (key.startsWith('eyJ')) headers.authorization = `Bearer ${key}`
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

export async function handle(request: Request, env: Env, deps: Deps): Promise<Response> {
  const method = request.method.toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') {
    return new Response('Método no permitido', { status: 405, headers: { allow: 'GET, HEAD', 'cache-control': 'no-store' } })
  }
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

  if (rest === '' || rest === '/') {
    return new Response(null, { status: 302, headers: { location: `${config.appBase}/comunidad`, 'cache-control': 'public, max-age=300' } })
  }
  if (rest === '/robots.txt') {
    return toResponse({ status: 200, body: renderRobotsTxt(config), contentType: 'text/plain; charset=utf-8', fresh: 3600, stale: 0 }, config, method)
  }
  if (rest === '/sitemap.xml') {
    return cached(request, deps, config, `${config.publicBase}/sitemap.xml`, () => buildSitemap(env, config, deps))
  }
  const match = /^\/p\/([^/]+)\/?$/.exec(rest)
  if (match) {
    // El id se valida ANTES de tocar Supabase: lo que no es un uuid ni se consulta ni se guarda en caché.
    if (!isUuid(match[1])) return toResponse(goneBuilt(config), config, method)
    const id = match[1].toLowerCase()
    return cached(request, deps, config, `${config.publicBase}/p/${id}`, () => buildPost(id, env, config, deps))
  }
  return toResponse(goneBuilt(config), config, method)
}
