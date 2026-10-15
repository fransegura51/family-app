// Cloudflare Worker de Comunidad PEPA — «Denunciar contenido» para VISITANTES SIN CUENTA (orden 2.4 de la dueña).
//
// Qué hace:  GET  /c/report?type=post|comment|review&id=<uuid>   formulario HTML accesible, sin JavaScript obligatorio, en español.
//            POST /c/report                                       valida, comprueba Cloudflare Turnstile (si está configurado), calcula la huella técnica
//                                                                 y llama a `community_visitor_report` de Supabase con la clave ANÓNIMA.
//
// Principios:
//  · Sin cuenta, sin datos privados, sin cookies. Lo único que se guarda es el aviso y, opcionalmente, el contacto que la propia persona escribe.
//  · El aviso NUNCA oculta nada solo: lo revisa la administración (Centro de Mando → Moderación → Denuncias de visitantes).
//  · TODA la protección contra abusos de verdad está en el servidor (SQL, migración 0268: topes por huella, por contenido y globales). Aquí se añade una
//    primera barrera barata: forma del cuerpo, tamaños, CSRF razonable, Turnstile y una trampa para robots; así la mayor parte del ruido ni llega a Supabase.
//  · Todo lo que se pinta va escapado y las páginas de resultado no llevan scripts. Los mensajes de error son neutros (no se enseña nada interno).
//
// Variables (README del Worker): TURNSTILE_SITE_KEY + TURNSTILE_SECRET (opcionales, van juntas) y REPORT_SALT (secreto opcional).
import { escapeHtml, isUuid } from '../../../src/domain/communityPublicPage'

// ---------------------------------------------------------------------------------------------------------------------
// Tipos mínimos (así este archivo no depende de handler.ts y se prueba solo; `Env`/`Deps` de handler.ts los cumplen)
// ---------------------------------------------------------------------------------------------------------------------
export interface ReportEnv {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  /** Clave PÚBLICA de Turnstile (la que va en la página). Va junto a TURNSTILE_SECRET: sin las dos, Turnstile no se usa. */
  TURNSTILE_SITE_KEY?: string
  /** Clave SECRETA de Turnstile (solo del Worker). */
  TURNSTILE_SECRET?: string
  /** Sal secreta para la huella técnica. Si falta, se usa una constante (menos segura; ver la guía). */
  REPORT_SALT?: string
}

export interface ReportDeps {
  fetch: (input: string, init?: RequestInit) => Promise<Response>
  now: () => number
}

export interface ReportConfig {
  /** Dirección pública de estas páginas sin barra final, p. ej. https://pepafamilyapp.es/c */
  publicBase: string
  /** Dirección de la aplicación sin barra final. */
  appBase: string
}

// ---------------------------------------------------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------------------------------------------------
export const REPORT_MAX_BODY_BYTES = 8 * 1024
export const REPORT_DETAIL_MAX = 1000
export const REPORT_CONTACT_MAX = 200
export const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
export const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
// Sal por defecto si no se configura REPORT_SALT: pública (está en el repositorio), así que protege menos. La huella solo existe para frenar abusos y
// no identifica a nadie por sí sola, pero con una sal secreta es imposible deshacerla por fuerza bruta sobre el espacio de direcciones IP.
export const DEFAULT_REPORT_SALT = 'pepa-comunidad-avisos-v1'
const UPSTREAM_TIMEOUT_MS = 6000

export type ReportType = 'post' | 'comment' | 'review'
export const REPORT_TYPES: ReportType[] = ['post', 'comment', 'review']
const TYPE_LABEL: Record<ReportType, string> = { post: 'una publicación', comment: 'un comentario', review: 'una reseña' }

// Los mismos motivos que la aplicación (REPORT_REASONS de src/domain/community.ts; una prueba comprueba que no se desajustan).
export const REPORT_REASONS: { id: string; label: string }[] = [
  { id: 'spam', label: 'Spam o publicidad' },
  { id: 'acoso', label: 'Acoso o faltas de respeto' },
  { id: 'violencia', label: 'Violencia' },
  { id: 'sexual', label: 'Contenido sexual' },
  { id: 'ilegal', label: 'Algo ilegal' },
  { id: 'datos_privados', label: 'Datos privados de alguien' },
  { id: 'enganoso', label: 'Información engañosa' },
  { id: 'otro', label: 'Otro motivo' },
]

// ---------------------------------------------------------------------------------------------------------------------
// Utilidades puras (se exportan para probarlas)
// ---------------------------------------------------------------------------------------------------------------------
export function isReportType(v: unknown): v is ReportType {
  return typeof v === 'string' && (REPORT_TYPES as string[]).includes(v)
}

// Quita caracteres de control (salvo salto de línea y tabulador) y recorta. No trunca: si se pasa del máximo, el llamador lo rechaza.
export function cleanField(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim()
}

// SHA-256 en hexadecimal (Web Crypto: disponible en Workers y en Node 18+).
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

// Huella técnica: SHA-256 de «IP + día UTC + sal». Cambia cada día (no sirve para seguir a nadie de un día para otro) y, sin la sal, no se puede deshacer.
export async function clientHash(ip: string, nowMs: number, salt: string | undefined): Promise<string> {
  const day = new Date(nowMs).toISOString().slice(0, 10)
  const useSalt = salt && salt.trim() !== '' ? salt : DEFAULT_REPORT_SALT
  return sha256Hex(`${ip}|${day}|${useSalt}`)
}

export type TurnstileMode = 'off' | 'on' | 'broken'

// Turnstile se usa SOLO si existen las dos claves. Una sola (error de configuración) es «broken»: no se arriesga a funcionar sin la protección que se quiso poner.
export function turnstileMode(env: Pick<ReportEnv, 'TURNSTILE_SITE_KEY' | 'TURNSTILE_SECRET'>): TurnstileMode {
  const site = (env.TURNSTILE_SITE_KEY ?? '').trim()
  const secret = (env.TURNSTILE_SECRET ?? '').trim()
  if (site && secret) return 'on'
  if (!site && !secret) return 'off'
  return 'broken'
}

export interface ParsedReport {
  type: ReportType
  id: string
  reason: string
  detail: string | null
  contact: string | null
  honeypot: boolean
  turnstileToken: string
}

export type ParseError = 'type' | 'id' | 'reason' | 'detail_long' | 'contact_long'

// Valida el cuerpo del formulario (URL-encoded). Devuelve el aviso limpio o el primer error.
export function parseReportForm(params: URLSearchParams): { ok: true; value: ParsedReport } | { ok: false; error: ParseError } {
  const type = params.get('type')
  if (!isReportType(type)) return { ok: false, error: 'type' }
  const id = (params.get('id') ?? '').trim()
  if (!isUuid(id)) return { ok: false, error: 'id' }
  const reason = params.get('reason') ?? ''
  if (!REPORT_REASONS.some((r) => r.id === reason)) return { ok: false, error: 'reason' }
  const detail = cleanField(params.get('detail') ?? '')
  if (detail.length > REPORT_DETAIL_MAX) return { ok: false, error: 'detail_long' }
  const contact = cleanField(params.get('contact') ?? '')
  if (contact.length > REPORT_CONTACT_MAX) return { ok: false, error: 'contact_long' }
  return {
    ok: true,
    value: {
      type,
      id: id.toLowerCase(),
      reason,
      detail: detail === '' ? null : detail,
      contact: contact === '' ? null : contact,
      // Campo «website» oculto con CSS: una persona no lo ve ni lo rellena; los robots que rellenan todo, sí.
      honeypot: (params.get('website') ?? '') !== '',
      turnstileToken: (params.get('cf-turnstile-response') ?? '').slice(0, 2048),
    },
  }
}

// Protección CSRF razonable: si el navegador manda Origin o Sec-Fetch-Site, tienen que ser de ESTA misma web. Si no vienen (clientes que no son navegador) se
// admite, porque CSRF solo es un riesgo cuando hay un navegador con sesión, y aquí no hay sesión ni cookies: lo que importa es la protección del servidor.
export function sameOriginOk(headers: Headers, publicBase: string): boolean {
  let expected = ''
  try {
    expected = new URL(publicBase).origin
  } catch {
    return false
  }
  const origin = headers.get('origin')
  if (origin !== null && origin !== expected) return false
  const site = headers.get('sec-fetch-site')
  if (site !== null && site !== 'same-origin') return false
  return true
}

// ---------------------------------------------------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------------------------------------------------
const STYLES = `
:root{color-scheme:light dark;--bg:#fff;--fg:#1f2430;--muted:#59606e;--line:#c9cfdc;--brand:#3b5bdb;--brand-fg:#fff;--soft:#f3f5fb;--err:#b42318}
@media (prefers-color-scheme:dark){:root{--bg:#14161c;--fg:#eceef4;--muted:#a9afbd;--line:#3a3f4d;--brand:#8da2fb;--brand-fg:#14161c;--soft:#1d2028;--err:#ff8a7a}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:640px;margin:0 auto;padding:16px}
h1{font-size:1.5rem;line-height:1.25;margin:.4em 0}
.small{color:var(--muted);font-size:.9rem}
fieldset{border:1px solid var(--line);border-radius:12px;margin:16px 0;padding:8px 14px 12px}
legend{font-weight:600;padding:0 6px}
.opt{display:flex;align-items:center;gap:10px;min-height:44px}
.opt input{width:22px;height:22px;flex:none}
label.f{display:block;font-weight:600;margin:16px 0 4px}
textarea,input[type=text]{width:100%;font:inherit;color:inherit;background:var(--soft);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
textarea{min-height:110px}
button,.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 20px;border-radius:12px;border:0;background:var(--brand);color:var(--brand-fg);font:inherit;font-weight:600;text-decoration:none;cursor:pointer}
.err{color:var(--err);font-weight:600}
.note{background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.hp{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}
a{color:var(--brand)}
a:focus-visible,button:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid var(--brand);outline-offset:2px}
`

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="strict-origin">
<title>${escapeHtml(title)} | Comunidad PEPA</title>
<style>${STYLES}</style>
</head>
<body>
<div class="wrap"><main id="contenido">
${body}
</main></div>
</body>
</html>`
}

export function renderReportForm(input: { type: ReportType; id: string; config: ReportConfig; siteKey?: string }): string {
  const action = `${input.config.publicBase}/report`
  const reasons = REPORT_REASONS.map(
    (r, i) =>
      `<label class="opt"><input type="radio" name="reason" value="${escapeHtml(r.id)}"${i === 0 ? ' required' : ''}> <span>${escapeHtml(r.label)}</span></label>`,
  ).join('\n')
  const turnstile = input.siteKey
    ? `<div class="cf-turnstile" data-sitekey="${escapeHtml(input.siteKey)}" data-language="es"></div>\n<noscript><p class="err">Para enviar este aviso hace falta activar JavaScript (es la comprobación de seguridad). Si no puedes, escríbenos desde la página de privacidad.</p></noscript>\n<script src="${TURNSTILE_SCRIPT_URL}" async defer></script>`
    : ''
  const body = `<h1>Denunciar contenido</h1>
<p>Estás avisando de <strong>${escapeHtml(TYPE_LABEL[input.type])}</strong> de Comunidad PEPA.</p>
<p class="note"><strong>No hace falta cuenta ni darnos datos personales.</strong> La administración revisará el aviso. Un aviso por sí solo no borra nada: decide una persona.</p>
<form method="post" action="${escapeHtml(action)}" accept-charset="utf-8">
<input type="hidden" name="type" value="${escapeHtml(input.type)}">
<input type="hidden" name="id" value="${escapeHtml(input.id)}">
<fieldset>
<legend>¿Qué pasa con este contenido?</legend>
${reasons}
</fieldset>
<label class="f" for="detail">Cuéntanos más (opcional)</label>
<textarea id="detail" name="detail" maxlength="${REPORT_DETAIL_MAX}" rows="5" autocomplete="off"></textarea>
<p class="small">Máximo ${REPORT_DETAIL_MAX} letras. No escribas datos privados de nadie.</p>
<label class="f" for="contact">Si quieres que te respondamos, un contacto (opcional)</label>
<input id="contact" type="text" name="contact" maxlength="${REPORT_CONTACT_MAX}" autocomplete="off">
<p class="small">Puede ser un correo o lo que prefieras. Solo lo ve la administración y puedes dejarlo vacío.</p>
<div class="hp" aria-hidden="true"><label for="website">No rellenes este campo</label><input id="website" type="text" name="website" tabindex="-1" autocomplete="off"></div>
${turnstile}
<p><button type="submit">Enviar aviso</button></p>
</form>
<p class="small">Qué datos tratamos y cómo ejercer tus derechos: <a href="${escapeHtml(input.config.appBase)}/privacidad.html" rel="nofollow">política de privacidad</a>.</p>`
  return page('Denunciar contenido', body)
}

export function renderReportResult(kind: 'ok' | 'already' | 'error', text: { title: string; message: string }, config: ReportConfig, back?: string): string {
  const cls = kind === 'error' ? ' class="err"' : ''
  const links = [
    back ? `<a class="btn" href="${escapeHtml(back)}">Volver al formulario</a>` : '',
    `<a href="${escapeHtml(config.appBase)}/comunidad" rel="nofollow">Ir a Comunidad</a>`,
  ]
    .filter(Boolean)
    .join(' &nbsp; ')
  return page(text.title, `<h1${cls}>${escapeHtml(text.title)}</h1>\n<p role="${kind === 'error' ? 'alert' : 'status'}">${escapeHtml(text.message)}</p>\n<p>${links}</p>`)
}

const MESSAGES = {
  ok: { title: 'Gracias, la administración lo revisará', message: 'Hemos recibido tu aviso. No hace falta que hagas nada más.' },
  already: { title: 'Ya lo teníamos', message: 'Ya habíamos recibido un aviso sobre este contenido. La administración lo revisará.' },
  badLink: { title: 'Enlace no válido', message: 'No hemos podido saber de qué contenido quieres avisar. Vuelve a la publicación y pulsa de nuevo «Denunciar contenido».' },
  badForm: { title: 'Revisa el formulario', message: 'Elige un motivo y comprueba que los textos no son demasiado largos. Puedes volver y corregirlo.' },
  forbidden: { title: 'No hemos podido comprobarlo', message: 'La comprobación de seguridad ha fallado. Vuelve al formulario e inténtalo de nuevo.' },
  tooBig: { title: 'Aviso demasiado grande', message: 'El aviso ocupa demasiado. Acorta el texto e inténtalo de nuevo.' },
  media: { title: 'No hemos podido leer el aviso', message: 'Envía el formulario desde esta página.' },
  gone: { title: 'Este contenido ya no está disponible', message: 'Puede que ya se haya retirado o que el enlace no sea correcto. Gracias de todos modos.' },
  rate: { title: 'Has enviado muchos avisos', message: 'Por seguridad hay un tope de avisos al día. Inténtalo de nuevo mañana. Gracias.' },
  unavailable: { title: 'Ahora no podemos recibir avisos', message: 'Inténtalo de nuevo en unos minutos. Gracias por tu paciencia.' },
  method: { title: 'Método no permitido', message: 'Esta dirección solo admite abrir el formulario y enviarlo.' },
} as const

// ---------------------------------------------------------------------------------------------------------------------
// Cabeceras de seguridad (todas las respuestas: sin cookies, sin caché, sin marcos)
// ---------------------------------------------------------------------------------------------------------------------
// CSP estricta: sin scripts. SOLO el formulario con Turnstile activo permite el script y el marco de challenges.cloudflare.com.
export function reportCsp(withTurnstile: boolean): string {
  const base = ["default-src 'none'", "style-src 'unsafe-inline'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'"]
  if (withTurnstile) {
    base.push('script-src https://challenges.cloudflare.com', 'frame-src https://challenges.cloudflare.com', 'connect-src https://challenges.cloudflare.com')
  } else {
    base.push("script-src 'none'")
  }
  return base.join('; ')
}

function respond(status: number, body: string, method: string, opts: { turnstile?: boolean; allow?: string; retryAfter?: number } = {}): Response {
  const headers = new Headers({
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy': reportCsp(opts.turnstile === true),
    'x-frame-options': 'DENY',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin',
    'x-robots-tag': 'noindex, nofollow',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'cross-origin-opener-policy': 'same-origin',
  })
  if (opts.allow) headers.set('allow', opts.allow)
  if (opts.retryAfter) headers.set('retry-after', String(opts.retryAfter))
  return new Response(method === 'HEAD' ? null : body, { status, headers })
}

// ---------------------------------------------------------------------------------------------------------------------
// Llamadas externas
// ---------------------------------------------------------------------------------------------------------------------
// Lee el cuerpo sin pasar de `limit` bytes (null si lo pasa): no se confía en `content-length`, que puede faltar o mentir.
export async function readBodyLimited(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > limit) return null
  if (!request.body) return ''
  const reader = request.body.getReader()
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
  const all = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    all.set(c, offset)
    offset += c.byteLength
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(all)
}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
  try {
    return await run(controller.signal)
  } finally {
    clearTimeout(timer)
  }
}

type TurnstileResult = 'ok' | 'failed' | 'unavailable'

async function verifyTurnstile(token: string, secret: string, ip: string, deps: ReportDeps): Promise<TurnstileResult> {
  if (token === '') return 'failed'
  try {
    const body = new URLSearchParams({ secret, response: token })
    if (ip && ip !== 'desconocida') body.set('remoteip', ip)
    const res = await withTimeout((signal) =>
      deps.fetch(TURNSTILE_VERIFY_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString(), signal }),
    )
    if (!res.ok) return 'unavailable'
    const data = (await res.json()) as { success?: unknown }
    return data.success === true ? 'ok' : 'failed'
  } catch {
    return 'unavailable'
  }
}

type RpcOutcome = { kind: 'ok'; already: boolean } | { kind: 'error'; code: string }

function supabaseHeaders(env: ReportEnv): Record<string, string> {
  const key = env.SUPABASE_ANON_KEY
  const headers: Record<string, string> = { apikey: key }
  if (key.startsWith('eyJ')) headers.authorization = `Bearer ${key}`
  return headers
}

// Llama a `community_visitor_report`. Los errores del servidor traen un CÓDIGO en el mensaje (RATE_LIMIT, NOT_AVAILABLE, BAD_KIND, UNSAFE_*…).
async function callVisitorReport(report: ParsedReport, hash: string, env: ReportEnv, deps: ReportDeps): Promise<RpcOutcome> {
  try {
    const res = await withTimeout((signal) =>
      deps.fetch(`${env.SUPABASE_URL.trim().replace(/\/+$/, '')}/rest/v1/rpc/community_visitor_report`, {
        method: 'POST',
        headers: { ...supabaseHeaders(env), 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ p_type: report.type, p_id: report.id, p_reason: report.reason, p_detail: report.detail, p_contact: report.contact, p_client_hash: hash }),
        signal,
      }),
    )
    const text = await res.text()
    if (res.ok) {
      let data: { already_reported?: unknown } | null = null
      try {
        data = JSON.parse(text) as { already_reported?: unknown } | null
      } catch {
        return { kind: 'error', code: 'UNKNOWN' }
      }
      return { kind: 'ok', already: data?.already_reported === true }
    }
    if (res.status >= 500) return { kind: 'error', code: 'UPSTREAM' }
    const match = /\b(RATE_LIMIT|NOT_AVAILABLE|BAD_KIND|TEXT_TOO_LONG|UNSAFE_[A-Z_]+|TEXT_REQUIRED)\b/.exec(text)
    return { kind: 'error', code: match ? match[1] : 'UNKNOWN' }
  } catch {
    return { kind: 'error', code: 'UPSTREAM' }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Manejador de /report
// ---------------------------------------------------------------------------------------------------------------------
function clientIp(request: Request): string {
  // `cf-connecting-ip` solo lo pone Cloudflare (el cliente no puede falsificarlo). Sin él (pruebas en local) todas las personas comparten huella.
  return (request.headers.get('cf-connecting-ip') ?? '').trim() || 'desconocida'
}

export async function handleReport(request: Request, env: ReportEnv, config: ReportConfig, deps: ReportDeps): Promise<Response> {
  const method = request.method.toUpperCase()
  if (method !== 'GET' && method !== 'HEAD' && method !== 'POST') {
    return respond(405, renderReportResult('error', MESSAGES.method, config), method, { allow: 'GET, HEAD, POST' })
  }
  const mode = turnstileMode(env)
  if (mode === 'broken') {
    // Configuración a medias: se prefiere no recibir avisos que recibirlos sin la protección que se quiso poner. Está explicado en el README.
    return respond(503, renderReportResult('error', MESSAGES.unavailable, config), method, { retryAfter: 300 })
  }

  if (method === 'GET' || method === 'HEAD') {
    const params = new URL(request.url).searchParams
    const type = params.get('type')
    const id = (params.get('id') ?? '').trim()
    if (!isReportType(type) || !isUuid(id)) return respond(400, renderReportResult('error', MESSAGES.badLink, config), method)
    const form = renderReportForm({ type, id: id.toLowerCase(), config, siteKey: mode === 'on' ? (env.TURNSTILE_SITE_KEY ?? '').trim() : undefined })
    return respond(200, form, method, { turnstile: mode === 'on' })
  }

  // ----- POST
  if (!sameOriginOk(request.headers, config.publicBase)) return respond(403, renderReportResult('error', MESSAGES.forbidden, config), method)
  const contentType = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (contentType !== 'application/x-www-form-urlencoded') return respond(415, renderReportResult('error', MESSAGES.media, config), method)
  const raw = await readBodyLimited(request, REPORT_MAX_BODY_BYTES)
  if (raw === null) return respond(413, renderReportResult('error', MESSAGES.tooBig, config), method)

  const parsed = parseReportForm(new URLSearchParams(raw))
  if (!parsed.ok) {
    const bad = parsed.error === 'type' || parsed.error === 'id'
    return respond(400, renderReportResult('error', bad ? MESSAGES.badLink : MESSAGES.badForm, config), method)
  }
  const report = parsed.value
  const back = `${config.publicBase}/report?type=${report.type}&id=${report.id}`

  // Trampa para robots: se contesta «gracias» como a cualquiera, pero no se avisa a nadie ni se llama a Supabase.
  if (report.honeypot) return respond(200, renderReportResult('ok', MESSAGES.ok, config), method)

  const ip = clientIp(request)
  if (mode === 'on') {
    const verdict = await verifyTurnstile(report.turnstileToken, (env.TURNSTILE_SECRET ?? '').trim(), ip, deps)
    if (verdict === 'unavailable') return respond(503, renderReportResult('error', MESSAGES.unavailable, config), method, { retryAfter: 60 })
    if (verdict === 'failed') return respond(403, renderReportResult('error', MESSAGES.forbidden, config, back), method)
  }

  const hash = await clientHash(ip, deps.now(), env.REPORT_SALT)
  const outcome = await callVisitorReport(report, hash, env, deps)
  if (outcome.kind === 'ok') return respond(200, renderReportResult(outcome.already ? 'already' : 'ok', outcome.already ? MESSAGES.already : MESSAGES.ok, config), method)
  switch (outcome.code) {
    case 'RATE_LIMIT':
      return respond(429, renderReportResult('error', MESSAGES.rate, config), method, { retryAfter: 3600 })
    case 'NOT_AVAILABLE':
      return respond(404, renderReportResult('error', MESSAGES.gone, config), method)
    case 'BAD_KIND':
    case 'TEXT_TOO_LONG':
    case 'TEXT_REQUIRED':
      return respond(400, renderReportResult('error', MESSAGES.badForm, config, back), method)
    default:
      if (outcome.code.startsWith('UNSAFE_')) return respond(400, renderReportResult('error', MESSAGES.badForm, config, back), method)
      return respond(503, renderReportResult('error', MESSAGES.unavailable, config), method, { retryAfter: 60 })
  }
}
