// Comunidad PEPA — LECTURA PÚBLICA (enlaces compartidos por WhatsApp, vistas previas y Google).
//
// TypeScript PURO (sin React, sin DOM, sin red): recibe el JSON público que devuelven las funciones `community_public_*` de Supabase (migraciones 0270 y
// 0272) y devuelve páginas HTML5 completas como texto. Lo usa el Cloudflare Worker (workers/community-public) y las pruebas.
//
// Reglas que se respetan aquí (especificación §1 y §8):
//  - NUNCA se inserta HTML de una persona: todo texto se ESCAPA, el texto enriquecido se convierte con el mismo analizador que usa la app
//    (communityRichText.ts) y se vuelve a pintar como etiquetas fijas (<p>, <strong>, <em>, <ul>, <ol>, <a>).
//  - Los enlaces externos solo pueden ser http/https de sitios con nombre; llevan rel="noopener noreferrer nofollow ugc" y el aviso «sitio externo».
//  - Lo eliminado, oculto o restringido NO llega aquí (la base devuelve null): se pinta una página neutra con noindex y SIN ningún dato del contenido.
//  - Nada privado: no se pintan ids de personas ni de familias, ni nombres reales, ni correos (se tapan por si alguien los escribió en un texto).
//    Solo se leen campos concretos del JSON (lista blanca), así que un campo extra que algún día se colara en la respuesta no llegaría a la página.
import { KIND_ICONS, KIND_LABELS, SECTIONS } from './community'
import type { AnyPostKind } from './community'
import { parseRichText, richTextToPlain, safeLink } from './communityRichText'
import type { Inline } from './communityRichText'

// ---------------------------------------------------------------------------------------------------------------------
// Formas del JSON público (snake_case, tal como sale de la base; todo opcional porque NO nos fiamos de lo que llegue).
// ---------------------------------------------------------------------------------------------------------------------
export interface PublicPhotoJson {
  path?: unknown
  position?: unknown
}

export interface PublicRecipeJson {
  title?: unknown
  servings?: unknown
  ingredients?: unknown
  steps?: unknown
  tags?: unknown
  version?: unknown
  avg_rating?: unknown
  rating_count?: unknown
}

export interface PublicPostJson {
  id?: unknown
  kind?: unknown
  section?: unknown
  topic_label?: unknown
  title?: unknown
  body?: unknown
  excerpt?: unknown
  author_alias?: unknown
  author_avatar?: unknown
  author_is_official?: unknown
  author_deleted?: unknown
  is_official?: unknown
  official_label?: unknown
  article_sources?: unknown
  photos?: unknown
  recipe?: unknown
  like_count?: unknown
  comment_count?: unknown
  created_at?: unknown
  edited_at?: unknown
  last_activity_at?: unknown
}

export interface PublicCommentJson {
  body?: unknown
  photo_path?: unknown
  created_at?: unknown
  edited_at?: unknown
  like_count?: unknown
  author_alias?: unknown
  author_avatar?: unknown
  author_is_official?: unknown
  removed?: unknown
  replies?: unknown
}

export interface PublicPollJson {
  question?: unknown
  options?: unknown
  closes_at?: unknown
  status?: unknown
  final?: unknown
  counts?: unknown
  total_votes?: unknown
}

export interface PublicSitemapItemJson {
  id?: unknown
  updated_at?: unknown
  last_activity_at?: unknown
}

export interface PublicPageConfig {
  /** Dirección pública de las páginas, sin barra final. Ej.: https://pepafamilyapp.es/c */
  publicBase: string
  /** Dirección de la aplicación, sin barra final. Ej.: https://fransegura51.github.io/family-app */
  appBase: string
  /** Dirección pública del almacenamiento de fotos, sin barra final. Ej.: https://xxxx.supabase.co/storage/v1/object/public/community-media */
  mediaBase: string
  /** Imagen para las vistas previas cuando la publicación no tiene fotos. */
  defaultImage?: string
}

export const SITE_NAME = 'Comunidad PEPA'
export const DEFAULT_OG_IMAGE = 'https://fransegura51.github.io/family-app/comunidad-og.jpg'
export const MAX_SITEMAP_URLS = 50000

// ---------------------------------------------------------------------------------------------------------------------
// Utilidades de seguridad
// ---------------------------------------------------------------------------------------------------------------------
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_RE.test(value)

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

export const escapeXml = escapeHtml

// JSON dentro de <script type="application/ld+json">: además de JSON.stringify hay que impedir que un «</script>» o un «<!--» dentro de un texto cierre
// la etiqueta (por eso < > & y los separadores de línea Unicode se escriben como \uXXXX, que sigue siendo JSON válido).
export function jsonLdScript(data: unknown): string {
  const json = JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
  return `<script type="application/ld+json">${json}</script>`
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
// Quita caracteres de control (salvo salto de línea y tabulador) y tapa correos que alguien haya escrito dentro de un texto.
export function cleanText(value: unknown, max = 20000): string {
  if (typeof value !== 'string') return ''
  return value.slice(0, max).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(EMAIL_RE, '[correo oculto]')
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  let cut = text.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  if (space > max * 0.6) cut = cut.slice(0, space)
  // No dejar media pareja de caracteres (emoji) al cortar.
  if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1)
  return cut.replace(/[\s.,;:!?-]+$/, '') + '…'
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const asRecord = (v: unknown): Record<string, unknown> => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

function isoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function longDate(value: unknown): string {
  const iso = isoDate(value)
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso))
  } catch {
    return iso.slice(0, 10)
  }
}

// Alias visible: nunca un correo ni un texto vacío; los eliminados salen como «Usuario eliminado».
function aliasOf(alias: unknown, deleted = false): string {
  if (deleted) return 'Usuario eliminado'
  const text = cleanText(alias, 80).replace(/\s+/g, ' ').trim()
  if (!text || text.includes('@') || text.includes('[correo oculto]')) return 'Usuario'
  return truncate(text, 40)
}

// Avatar: solo un emoji corto (lo guarda así la base); cualquier otra cosa se ignora.
function avatarOf(avatar: unknown): string {
  if (typeof avatar !== 'string') return ''
  const text = avatar.trim()
  if (!text || text.length > 16 || /[<>&"'`\u0000-\u001F]/.test(text)) return ''
  return text
}

// Ruta de foto del almacenamiento público: solo letras, números, guion, punto, barra y guion bajo; sin «..» ni barras dobles.
const PHOTO_PATH_RE = /^[A-Za-z0-9][A-Za-z0-9/_.-]{0,300}$/
export function photoUrl(path: unknown, config: PublicPageConfig): string | null {
  if (typeof path !== 'string' || !PHOTO_PATH_RE.test(path) || path.includes('..') || path.includes('//')) return null
  const base = trimSlash(config.mediaBase)
  if (!/^https?:\/\//i.test(base)) return null
  return `${base}/${path.split('/').map(encodeURIComponent).join('/')}`
}

function trimSlash(url: string): string {
  return String(url ?? '').trim().replace(/\/+$/, '')
}

// Dirección configurada por quien despliega (no viene de personas): aun así solo se aceptan http/https.
function baseUrl(url: string): string {
  const clean = trimSlash(url)
  return /^https?:\/\/[^\s"'<>]+$/i.test(clean) ? clean : ''
}

function originOf(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return ''
  }
}

export function postUrl(id: string, config: PublicPageConfig): string {
  return `${baseUrl(config.publicBase)}/p/${id.toLowerCase()}`
}
const appPostUrl = (id: string, config: PublicPageConfig) => `${baseUrl(config.appBase)}/comunidad/p/${id.toLowerCase()}`
const appHomeUrl = (config: PublicPageConfig) => `${baseUrl(config.appBase)}/comunidad`

// Política de seguridad de contenido para el Worker: sin scripts, solo imágenes de nuestro almacenamiento y de la imagen por defecto.
export function publicPageCsp(config: PublicPageConfig): string {
  const img = ["'self'", originOf(baseUrl(config.mediaBase)), originOf(baseUrl(config.defaultImage ?? DEFAULT_OG_IMAGE))].filter(Boolean)
  return [
    "default-src 'none'",
    `img-src ${Array.from(new Set(img)).join(' ')}`,
    "style-src 'unsafe-inline'",
    "script-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ')
}

// ---------------------------------------------------------------------------------------------------------------------
// Texto enriquecido → HTML escapado
// ---------------------------------------------------------------------------------------------------------------------
export const EXTERNAL_LINK_REL = 'noopener noreferrer nofollow ugc'

function inlineHtml(items: Inline[]): string {
  return items
    .map((item) => {
      if (item.t === 'text') return escapeHtml(item.v).replace(/\n/g, '<br>')
      if (item.t === 'bold') return `<strong>${inlineHtml(item.c)}</strong>`
      if (item.t === 'italic') return `<em>${inlineHtml(item.c)}</em>`
      // Se vuelve a validar el enlace aunque el analizador ya lo haya hecho: esta es la última barrera antes de escribir un href.
      const link = safeLink(item.href)
      if (!link) return escapeHtml(item.label)
      const note = link.shortener ? `sitio externo: ${link.host}, enlace acortado: ten cuidado` : `sitio externo: ${link.host}`
      return `<a href="${escapeHtml(link.href)}" rel="${EXTERNAL_LINK_REL}" target="_blank">${escapeHtml(truncate(item.label, 200))}</a> <span class="ext">(${escapeHtml(note)})</span>`
    })
    .join('')
}

export function richTextToHtml(body: unknown, max = 20000): string {
  return parseRichText(cleanText(body, max))
    .map((block) => {
      if (block.t === 'p') return `<p>${inlineHtml(block.c)}</p>`
      const tag = block.t
      return `<${tag}>${block.items.map((it) => `<li>${inlineHtml(it)}</li>`).join('')}</${tag}>`
    })
    .join('\n')
}

const plainOf = (body: unknown, max = 20000) => richTextToPlain(cleanText(body, max))

// ---------------------------------------------------------------------------------------------------------------------
// Datos normalizados
// ---------------------------------------------------------------------------------------------------------------------
interface Person {
  alias: string
  avatar: string
  official: boolean
}

interface NormComment {
  person: Person
  html: string
  plain: string
  photo: string | null
  createdAt: string | null
  likes: number
  removed: boolean
  replies: NormComment[]
}

function personOf(alias: unknown, avatar: unknown, official: unknown, deleted = false): Person {
  return { alias: aliasOf(alias, deleted), avatar: deleted ? '' : avatarOf(avatar), official: official === true }
}

function normComment(raw: unknown, config: PublicPageConfig, depth: number): NormComment {
  const c = asRecord(raw) as PublicCommentJson
  const removed = c.removed === true
  return {
    person: personOf(c.author_alias, c.author_avatar, c.author_is_official),
    html: removed ? '' : richTextToHtml(c.body, 4000),
    plain: removed ? '' : plainOf(c.body, 4000),
    photo: removed ? null : photoUrl(c.photo_path, config),
    createdAt: isoDate(c.created_at),
    likes: num(c.like_count),
    removed,
    // Un solo nivel de respuestas (igual que la app); las respuestas de respuestas no existen en lo público.
    replies: depth >= 1 ? [] : asArray(c.replies).slice(0, 100).map((r) => normComment(r, config, depth + 1)),
  }
}

export function normalizeComments(raw: unknown, config: PublicPageConfig): NormComment[] {
  return asArray(raw).slice(0, 100).map((c) => normComment(c, config, 0))
}

interface Ingredient {
  text: string
}

function ingredientsOf(raw: unknown): Ingredient[] {
  return asArray(raw)
    .map((i) => {
      if (typeof i === 'string') return { text: cleanText(i, 200).trim() }
      const r = asRecord(i)
      const text = [cleanText(r.quantity, 40), cleanText(r.unit, 40), cleanText(r.name, 200)].map((s) => s.trim()).filter(Boolean).join(' ')
      return { text }
    })
    .filter((i) => i.text)
    .slice(0, 100)
}

// Pasos de la receta como lista de frases (se quitan numeraciones y viñetas del principio).
function stepsOf(raw: unknown): string[] {
  const text = cleanText(raw, 20000)
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•]|\d{1,3}[.)])\s+/, '').trim())
    .filter(Boolean)
    .slice(0, 100)
}

interface Source {
  title: string
  publisher: string
  url: string | null
  date: string
}

function sourcesOf(raw: unknown): Source[] {
  const r = asRecord(raw)
  const list = Array.isArray(raw) ? raw : asArray(r.sources)
  return list
    .map((s) => {
      const o = asRecord(s)
      const link = typeof o.url === 'string' ? safeLink(cleanText(o.url, 500)) : null
      return {
        title: cleanText(o.title, 300).trim(),
        publisher: cleanText(o.publisher, 200).trim(),
        url: link ? link.href : null,
        date: cleanText(o.date, 60).trim(),
      }
    })
    .filter((s) => s.title || s.publisher)
    .slice(0, 30)
}

// ---------------------------------------------------------------------------------------------------------------------
// Estilos (mínimos, móvil primero, modo oscuro automático, contraste suficiente)
// ---------------------------------------------------------------------------------------------------------------------
const STYLES = `
:root{color-scheme:light dark;--bg:#fff;--fg:#1f2430;--muted:#59606e;--line:#dfe3ec;--brand:#3b5bdb;--brand-fg:#fff;--soft:#f3f5fb}
@media (prefers-color-scheme:dark){:root{--bg:#14161c;--fg:#eceef4;--muted:#a9afbd;--line:#2d313c;--brand:#8da2fb;--brand-fg:#14161c;--soft:#1d2028}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:1rem/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overflow-wrap:anywhere}
.skip{position:absolute;left:-999px;top:0;background:var(--brand);color:var(--brand-fg);padding:.75rem 1rem;z-index:10}.skip:focus{left:0}
header.top{border-bottom:1px solid var(--line);background:var(--soft)}
.wrap{max-width:46rem;margin:0 auto;padding:0 16px}
header.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:56px;flex-wrap:wrap;padding-top:8px;padding-bottom:8px}
.brand{font-weight:700;color:var(--fg);text-decoration:none}
a{color:var(--brand)}
a:focus-visible,.btn:focus-visible{outline:3px solid var(--brand);outline-offset:2px}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:8px 18px;border-radius:10px;border:2px solid var(--brand);background:var(--brand);color:var(--brand-fg);font-weight:700;text-decoration:none}
.btn.alt{background:transparent;color:var(--brand)}
nav.crumbs ol{list-style:none;display:flex;flex-wrap:wrap;gap:4px 8px;margin:14px 0 0;padding:0;font-size:.9rem;color:var(--muted)}
nav.crumbs li+li::before{content:"›";margin-right:8px}
main{padding-bottom:40px}
h1{font-size:1.65rem;line-height:1.25;margin:.4em 0 .3em}
h2{font-size:1.25rem;margin:1.6em 0 .5em}
.badges{display:flex;flex-wrap:wrap;gap:6px;margin:14px 0 0;padding:0;list-style:none;font-size:.85rem}
.badges li{background:var(--soft);border:1px solid var(--line);border-radius:999px;padding:2px 10px}
.byline,.stats,.ext,.small{color:var(--muted);font-size:.9rem}
.photos{display:grid;gap:12px;margin:16px 0;padding:0}
.photos li{list-style:none}.photos figure{margin:0}
.photos img,.cphoto{display:block;max-width:100%;height:auto;border-radius:10px;border:1px solid var(--line);background:var(--soft)}
.cphoto{max-width:220px;margin-top:8px}
.card{background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:18px 0}
.cta{display:flex;flex-wrap:wrap;gap:10px;margin:12px 0}
ul.comments,ul.replies{list-style:none;margin:0;padding:0}
ul.comments>li{border-top:1px solid var(--line);padding:14px 0}
ul.replies{margin:10px 0 0 14px;padding-left:12px;border-left:3px solid var(--line)}
ul.replies>li{padding:8px 0}
.removed{color:var(--muted);font-style:italic;margin:0}
.bar{height:10px;border-radius:5px;background:var(--line);overflow:hidden;margin:4px 0 12px}.bar>span{display:block;height:100%;background:var(--brand)}
footer{border-top:1px solid var(--line);padding:18px 0 32px;color:var(--muted);font-size:.85rem}
p,li{margin-top:0}
ul.plain{list-style:none;padding:0}
`

// ---------------------------------------------------------------------------------------------------------------------
// Piezas de HTML
// ---------------------------------------------------------------------------------------------------------------------
function documentHtml(head: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="theme-color" content="#3b5bdb">
${head}
<style>${STYLES}</style>
</head>
<body>
<a class="skip" href="#contenido">Saltar al contenido</a>
${bodyHtml}
</body>
</html>
`
}

function topBar(config: PublicPageConfig): string {
  return `<header class="top"><div class="wrap"><a class="brand" href="${escapeHtml(appHomeUrl(config))}">🏡 ${SITE_NAME}</a><a class="btn alt" href="${escapeHtml(appHomeUrl(config))}">Abrir PEPA</a></div></header>`
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function personHtml(p: Person): string {
  const avatar = p.avatar ? `<span aria-hidden="true">${escapeHtml(p.avatar)}</span> ` : ''
  const official = p.official ? ' <span class="small">(cuenta oficial)</span>' : ''
  return `${avatar}<strong>${escapeHtml(p.alias)}</strong>${official}`
}

function commentHtml(c: NormComment): string {
  const replies = c.replies.length > 0 ? `<ul class="replies">${c.replies.map((r) => `<li>${commentHtml(r)}</li>`).join('')}</ul>` : ''
  if (c.removed) return `<p class="removed">Este comentario ya no está disponible.</p>${replies}`
  const date = c.createdAt ? ` <span class="small">· ${escapeHtml(longDate(c.createdAt))}</span>` : ''
  const photo = c.photo ? `<img class="cphoto" src="${escapeHtml(c.photo)}" alt="Foto del comentario de ${escapeHtml(c.person.alias)}" loading="lazy" decoding="async">` : ''
  const likes = c.likes > 0 ? `<p class="small">❤️ ${plural(c.likes, 'me gusta', 'me gusta')}</p>` : ''
  return `<p class="byline">${personHtml(c.person)}${date}</p>${c.html}${photo}${likes}${replies}`
}

function pollHtml(raw: unknown): string {
  const poll = asRecord(raw) as PublicPollJson
  const question = cleanText(poll.question, 300).trim()
  const options = asArray(poll.options).map((o) => cleanText(o, 200).trim()).filter(Boolean).slice(0, 6)
  if (!question || options.length < 2) return ''
  const final = poll.final === true
  const counts = asArray(poll.counts).map(num)
  const total = counts.length > 0 ? counts.reduce((a, b) => a + b, 0) : num(poll.total_votes)
  const closes = longDate(poll.closes_at)
  if (!final || counts.length !== options.length) {
    // Encuesta aún abierta: los visitantes ven la pregunta, nunca resultados parciales ni votos.
    return `<section class="card" aria-labelledby="encuesta"><h2 id="encuesta">📊 ${escapeHtml(question)}</h2><ul>${options.map((o) => `<li>${escapeHtml(o)}</li>`).join('')}</ul><p class="small">Los resultados se enseñan cuando cierre la encuesta${closes ? ` (${escapeHtml(closes)})` : ''}. Para votar necesitas tu cuenta de PEPA.</p></section>`
  }
  const rows = options
    .map((o, i) => {
      const pct = total > 0 ? Math.round((counts[i] * 100) / total) : 0
      return `<li><span>${escapeHtml(o)}</span> — <strong>${pct} %</strong> <span class="small">(${plural(counts[i], 'voto', 'votos')})</span><div class="bar" aria-hidden="true"><span style="width:${pct}%"></span></div></li>`
    })
    .join('')
  return `<section class="card" aria-labelledby="encuesta"><h2 id="encuesta">📊 ${escapeHtml(question)}</h2><p class="small">Encuesta cerrada${closes ? ` el ${escapeHtml(closes)}` : ''}. Resultados finales con ${plural(total, 'voto', 'votos')}.</p><ul class="plain">${rows}</ul></section>`
}

function sourcesHtml(sources: Source[]): string {
  if (sources.length === 0) return ''
  const items = sources
    .map((s) => {
      const label = escapeHtml([s.title, s.publisher, s.date].filter(Boolean).join(' · '))
      if (!s.url) return `<li>${label}</li>`
      return `<li><a href="${escapeHtml(s.url)}" rel="${EXTERNAL_LINK_REL}" target="_blank">${escapeHtml(s.title || s.publisher)}</a> <span class="ext">(sitio externo)</span>${s.publisher || s.date ? ` <span class="small">${escapeHtml([s.publisher, s.date].filter(Boolean).join(' · '))}</span>` : ''}</li>`
    })
    .join('')
  return `<section aria-labelledby="fuentes"><h2 id="fuentes">Fuentes</h2><ul>${items}</ul></section>`
}

// ---------------------------------------------------------------------------------------------------------------------
// Página de una publicación
// ---------------------------------------------------------------------------------------------------------------------
export interface RenderPostInput {
  post: unknown
  comments?: unknown
  poll?: unknown
  config: PublicPageConfig
}

// null = la entrada no es una publicación válida (el Worker responderá 404). Nunca se pinta algo a medias.
export function renderPostPage({ post: rawPost, comments: rawComments, poll: rawPoll, config }: RenderPostInput): string | null {
  const post = asRecord(rawPost) as PublicPostJson
  if (!isUuid(post.id)) return null
  const id = post.id.toLowerCase()
  const title = cleanText(post.title, 300).replace(/\s+/g, ' ').trim()
  if (!title) return null

  const kind: AnyPostKind | null = typeof post.kind === 'string' && Object.prototype.hasOwnProperty.call(KIND_LABELS, post.kind) ? (post.kind as AnyPostKind) : null
  const kindLabel = kind ? KIND_LABELS[kind] : 'Publicación'
  const kindIcon = kind ? KIND_ICONS[kind] : '💬'
  const sectionInfo = SECTIONS.find((s) => s.id === post.section)
  const topic = cleanText(post.topic_label, 80).trim()
  const deleted = post.author_deleted === true
  const author = personOf(post.author_alias, post.author_avatar, post.author_is_official, deleted)
  const officialLabel = post.is_official === true ? cleanText(post.official_label, 80).trim() : ''

  const canonical = postUrl(id, config)
  const appUrl = appPostUrl(id, config)
  const photos = asArray(post.photos)
    .map((p) => asRecord(p) as PublicPhotoJson)
    .sort((a, b) => num(a.position) - num(b.position))
    .map((p) => photoUrl(p.path, config))
    .filter((u): u is string => !!u)
    .slice(0, 5)

  const bodyPlain = plainOf(post.body, 20000)
  const recipe = post.recipe && typeof post.recipe === 'object' ? (asRecord(post.recipe) as PublicRecipeJson) : null
  const ingredients = recipe ? ingredientsOf(recipe.ingredients) : []
  const steps = recipe ? stepsOf(recipe.steps) : []
  const servings = recipe ? num(recipe.servings) : 0
  const ratingCount = recipe ? num(recipe.rating_count) : 0
  const avgRatingRaw = recipe ? Number(recipe.avg_rating) : NaN
  const avgRating = ratingCount > 0 && Number.isFinite(avgRatingRaw) ? Math.min(5, Math.max(0, avgRatingRaw)) : null
  const tags = recipe ? asArray(recipe.tags).map((t) => cleanText(t, 40).trim()).filter(Boolean).slice(0, 10) : []
  const sources = sourcesOf(post.article_sources)
  const comments = normalizeComments(rawComments, config)
  const likeCount = num(post.like_count)
  const commentCount = Math.max(num(post.comment_count), 0)
  const createdIso = isoDate(post.created_at)
  const editedIso = isoDate(post.edited_at)
  const modifiedIso = [editedIso, isoDate(post.last_activity_at), createdIso].filter(Boolean).sort().pop() ?? null

  // Descripción para buscadores y vistas previas: ≈ 155 caracteres de texto plano.
  const description = truncate(bodyPlain || (recipe ? `${title}. Receta de la Comunidad PEPA.` : `${title}. Publicación de la Comunidad PEPA.`), 155)
  const image = photos[0] ?? baseUrl(config.defaultImage ?? DEFAULT_OG_IMAGE)
  const imageAlt = photos[0] ? `Foto de la publicación: ${title}` : `${SITE_NAME}`
  const pageTitle = `${truncate(title, 90)} | ${SITE_NAME}`

  // ----- JSON-LD
  const authorLd = author.official || deleted ? { '@type': 'Organization', name: author.official ? 'Equipo PEPA' : author.alias } : { '@type': 'Person', name: author.alias }
  const base: Record<string, unknown> = {
    '@context': 'https://schema.org',
    url: canonical,
    mainEntityOfPage: canonical,
    author: authorLd,
    ...(createdIso ? { datePublished: createdIso } : {}),
    ...(modifiedIso ? { dateModified: modifiedIso } : {}),
    ...(photos.length > 0 ? { image: photos } : { image: [image] }),
  }
  const answers = comments.filter((c) => !c.removed && c.plain).slice(0, 10)
  const commentLd = (c: NormComment) => ({
    '@type': 'Comment',
    text: truncate(c.plain, 1000),
    ...(c.createdAt ? { dateCreated: c.createdAt } : {}),
    author: { '@type': 'Person', name: c.person.alias },
    upvoteCount: c.likes,
  })
  let ld: Record<string, unknown>
  if (kind === 'receta') {
    ld = {
      ...base,
      '@type': 'Recipe',
      name: recipe ? truncate(cleanText(recipe.title, 200).trim() || title, 110) : truncate(title, 110),
      description,
      ...(servings > 0 ? { recipeYield: `${servings} raciones` } : {}),
      ...(ingredients.length > 0 ? { recipeIngredient: ingredients.map((i) => i.text) } : {}),
      ...(steps.length > 0 ? { recipeInstructions: steps.map((text) => ({ '@type': 'HowToStep', text })) } : {}),
      ...(tags.length > 0 ? { keywords: tags.join(', ') } : {}),
      ...(sectionInfo ? { recipeCategory: topic || sectionInfo.title } : {}),
      ...(avgRating !== null ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: Math.round(avgRating * 100) / 100, ratingCount } } : {}),
    }
  } else if (kind === 'pregunta') {
    ld = {
      '@context': 'https://schema.org',
      '@type': 'QAPage',
      url: canonical,
      mainEntity: {
        '@type': 'Question',
        name: truncate(title, 200),
        text: truncate(bodyPlain || title, 2000),
        answerCount: answers.length,
        upvoteCount: likeCount,
        ...(createdIso ? { dateCreated: createdIso } : {}),
        author: authorLd,
        ...(answers.length > 0
          ? {
              suggestedAnswer: answers.map((a) => ({
                '@type': 'Answer',
                text: truncate(a.plain, 1000),
                ...(a.createdAt ? { dateCreated: a.createdAt } : {}),
                upvoteCount: a.likes,
                url: canonical,
                author: { '@type': 'Person', name: a.person.alias },
              })),
            }
          : {}),
      },
    }
  } else if (kind === 'articulo') {
    ld = {
      ...base,
      '@type': 'Article',
      headline: truncate(title, 110),
      description,
      publisher: { '@type': 'Organization', name: 'PEPA' },
      ...(sources.length > 0 ? { citation: sources.map((s) => ({ '@type': 'CreativeWork', name: s.title || s.publisher, ...(s.url ? { url: s.url } : {}) })) } : {}),
    }
  } else {
    // Consejos, anécdotas y encuestas: hilo de foro con comentarios.
    ld = {
      ...base,
      '@type': 'DiscussionForumPosting',
      headline: truncate(title, 110),
      text: truncate(bodyPlain || title, 5000),
      interactionStatistic: [
        { '@type': 'InteractionCounter', interactionType: 'https://schema.org/LikeAction', userInteractionCount: likeCount },
        { '@type': 'InteractionCounter', interactionType: 'https://schema.org/CommentAction', userInteractionCount: commentCount },
      ],
      commentCount,
      ...(comments.length > 0 ? { comment: comments.filter((c) => !c.removed && c.plain).slice(0, 20).map(commentLd) } : {}),
    }
  }
  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: originOf(baseUrl(config.publicBase)) + '/' },
      { '@type': 'ListItem', position: 2, name: 'Comunidad', item: appHomeUrl(config) },
      ...(sectionInfo ? [{ '@type': 'ListItem', position: 3, name: sectionInfo.title }] : []),
    ],
  }

  // ----- <head>
  const head = [
    `<title>${escapeHtml(pageTitle)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<meta name="robots" content="index,follow,max-image-preview:large">`,
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">`,
    `<meta property="og:locale" content="es_ES">`,
    `<meta property="og:title" content="${escapeHtml(truncate(title, 90))}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(canonical)}">`,
    `<meta property="og:image" content="${escapeHtml(image)}">`,
    `<meta property="og:image:alt" content="${escapeHtml(imageAlt)}">`,
    ...(createdIso ? [`<meta property="article:published_time" content="${escapeHtml(createdIso)}">`] : []),
    ...(modifiedIso ? [`<meta property="article:modified_time" content="${escapeHtml(modifiedIso)}">`] : []),
    ...(sectionInfo ? [`<meta property="article:section" content="${escapeHtml(sectionInfo.title)}">`] : []),
    `<meta name="twitter:card" content="${photos.length > 0 ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${escapeHtml(truncate(title, 70))}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
    `<meta name="twitter:image" content="${escapeHtml(image)}">`,
    jsonLdScript(ld),
    jsonLdScript(breadcrumbs),
  ].join('\n')

  // ----- <body>
  const crumbs = `<nav class="crumbs" aria-label="Ruta de navegación"><ol><li><a href="${escapeHtml(originOf(baseUrl(config.publicBase)) + '/')}">Inicio</a></li><li><a href="${escapeHtml(appHomeUrl(config))}">Comunidad</a></li>${sectionInfo ? `<li>${escapeHtml(sectionInfo.title)}</li>` : ''}<li aria-current="page">Publicación</li></ol></nav>`
  const badges = `<ul class="badges" aria-label="Tipo y tema"><li>${escapeHtml(kindIcon)} ${escapeHtml(kindLabel)}</li>${topic ? `<li>${escapeHtml(topic)}</li>` : ''}${officialLabel ? `<li>${escapeHtml(officialLabel)}</li>` : ''}</ul>`
  const dateText = longDate(post.created_at)
  const byline = `<p class="byline">${personHtml(author)}${dateText ? ` · ${escapeHtml(dateText)}` : ''}${editedIso ? ' · Editado' : ''}</p>`
  const photosHtml =
    photos.length > 0
      ? `<ul class="photos" aria-label="Fotos de la publicación">${photos.map((u, i) => `<li><figure><img src="${escapeHtml(u)}" alt="${escapeHtml(`Foto ${i + 1} de ${photos.length}: ${truncate(title, 80)}`)}" loading="${i === 0 ? 'eager' : 'lazy'}" decoding="async"></figure></li>`).join('')}</ul>`
      : ''
  const bodyHtml = richTextToHtml(post.body)
  const recipeHtml = recipe
    ? `<section aria-labelledby="ingredientes"><h2 id="ingredientes">Ingredientes</h2>${servings > 0 ? `<p class="small">Para ${plural(servings, 'persona', 'personas')}</p>` : ''}${ingredients.length > 0 ? `<ul>${ingredients.map((i) => `<li>${escapeHtml(i.text)}</li>`).join('')}</ul>` : '<p class="small">Esta receta no tiene lista de ingredientes.</p>'}</section>
<section aria-labelledby="preparacion"><h2 id="preparacion">Preparación</h2>${steps.length > 0 ? `<ol>${steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>` : '<p class="small">Esta receta no tiene pasos escritos.</p>'}</section>${avgRating !== null ? `<p class="small">⭐ ${escapeHtml(avgRating.toFixed(1).replace('.', ','))} de 5 (${plural(ratingCount, 'valoración', 'valoraciones')})</p>` : ''}${tags.length > 0 ? `<p class="small">Etiquetas: ${tags.map(escapeHtml).join(', ')}</p>` : ''}`
    : ''
  const stats = `<p class="stats">❤️ ${plural(likeCount, 'me gusta', 'me gusta')} · 💬 ${plural(commentCount, 'comentario', 'comentarios')}</p>`
  const cta = `<section class="card" aria-labelledby="participa"><h2 id="participa" style="margin-top:0">¿Quieres participar?</h2><p>Puedes leer esta publicación sin registrarte. Para comentar, dar me gusta, guardar o publicar necesitas una cuenta gratuita en PEPA.</p><div class="cta"><a class="btn" href="${escapeHtml(appUrl)}">Abrir en la aplicación</a><a class="btn alt" href="${escapeHtml(appUrl)}">Regístrate para participar</a></div></section>`
  const commentsHtml =
    comments.length > 0
      ? `<section aria-labelledby="comentarios"><h2 id="comentarios">Comentarios (${commentCount})</h2><ul class="comments">${comments.map((c) => `<li>${commentHtml(c)}</li>`).join('')}</ul><p class="small">Para ver toda la conversación y responder, <a href="${escapeHtml(appUrl)}">abre la publicación en la aplicación</a>.</p></section>`
      : `<section aria-labelledby="comentarios"><h2 id="comentarios">Comentarios (${commentCount})</h2><p class="small">${commentCount > 0 ? 'Abre la publicación en la aplicación para leer la conversación.' : 'Todavía no hay comentarios.'}</p></section>`

  const page = `${topBar(config)}
<div class="wrap">
${crumbs}
<main id="contenido">
<article>
${badges}
<h1>${escapeHtml(title)}</h1>
${byline}
${photosHtml}
<div class="body">${bodyHtml}</div>
${recipeHtml}
${kind === 'encuesta' ? pollHtml(rawPoll) : ''}
${sourcesHtml(sources)}
${stats}
${cta}
${commentsHtml}
</article>
</main>
<footer><p>${SITE_NAME} es un espacio de la aplicación PEPA donde las familias comparten recetas, preguntas, consejos y anécdotas. Los enlaces a otros sitios se abren fuera de PEPA; PEPA no se responsabiliza de su contenido.</p></footer>
</div>`

  return documentHtml(head, page)
}

// ---------------------------------------------------------------------------------------------------------------------
// Páginas de «no disponible»: SIN ningún dato del contenido y con noindex.
// ---------------------------------------------------------------------------------------------------------------------
export function renderGonePage(config: PublicPageConfig): string {
  const home = appHomeUrl(config)
  const head = [
    `<title>Esta publicación ya no está disponible | ${SITE_NAME}</title>`,
    `<meta name="description" content="Esta publicación ya no está disponible.">`,
    `<meta name="robots" content="noindex,nofollow">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">`,
    `<meta property="og:title" content="Esta publicación ya no está disponible">`,
    `<meta property="og:description" content="Puede que la hayan eliminado o que ya no sea pública.">`,
    `<meta name="twitter:card" content="summary">`,
  ].join('\n')
  const body = `${topBar(config)}
<div class="wrap"><main id="contenido">
<h1>Esta publicación ya no está disponible</h1>
<p>Puede que su autor la haya eliminado, que se haya retirado o que el enlace no sea correcto.</p>
<div class="cta"><a class="btn" href="${escapeHtml(home)}">Ir a la Comunidad</a></div>
</main></div>`
  return documentHtml(head, body)
}

// Fallo temporal al pedir los datos (no es «no existe»: el Worker lo responde con 503 y sin guardarlo en caché).
export function renderUnavailablePage(config: PublicPageConfig): string {
  const head = [
    `<title>Vuelve a intentarlo en un momento | ${SITE_NAME}</title>`,
    `<meta name="robots" content="noindex,nofollow">`,
  ].join('\n')
  const body = `${topBar(config)}
<div class="wrap"><main id="contenido">
<h1>Vuelve a intentarlo en un momento</h1>
<p>No hemos podido cargar esta página ahora mismo. Prueba de nuevo en un minuto.</p>
<div class="cta"><a class="btn" href="${escapeHtml(appHomeUrl(config))}">Ir a la Comunidad</a></div>
</main></div>`
  return documentHtml(head, body)
}

// ---------------------------------------------------------------------------------------------------------------------
// Mapa del sitio y robots.txt
// ---------------------------------------------------------------------------------------------------------------------
export function renderSitemapXml(items: unknown, config: PublicPageConfig): string {
  const seen = new Set<string>()
  const urls: string[] = []
  for (const raw of asArray(items)) {
    if (urls.length >= MAX_SITEMAP_URLS) break
    const item = asRecord(raw) as PublicSitemapItemJson
    if (!isUuid(item.id)) continue
    const id = item.id.toLowerCase()
    if (seen.has(id)) continue
    seen.add(id)
    // lastmod = lo más reciente entre la última edición y la última actividad (un comentario nuevo cambia la página).
    const lastmod = [isoDate(item.updated_at), isoDate(item.last_activity_at)].filter((d): d is string => !!d).sort().pop()
    urls.push(`  <url><loc>${escapeXml(postUrl(id, config))}</loc>${lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : ''}</url>`)
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}${urls.length > 0 ? '\n' : ''}</urlset>\n`
}

export function renderRobotsTxt(config: PublicPageConfig): string {
  const base = baseUrl(config.publicBase)
  return `User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`
}
