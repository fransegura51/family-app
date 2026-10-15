// «Denunciar contenido» para visitantes sin cuenta (orden 2.4): formulario y envío del Worker de Cloudflare (`workers/community-public/src/report.ts`).
// Se prueba con un Supabase y un Turnstile de mentira (sin red): éxito, duplicado, tope de avisos, Turnstile, CSRF, tamaños y entradas maliciosas.
import { describe, expect, it } from 'vitest'
import { REPORT_REASONS as APP_REASONS } from '@/domain/community'
import { renderPostPage, reportUrl, type PublicPageConfig } from '@/domain/communityPublicPage'
import { handle, type Deps, type Env } from '../../workers/community-public/src/handler'
import {
  DEFAULT_REPORT_SALT,
  REPORT_MAX_BODY_BYTES,
  REPORT_REASONS,
  TURNSTILE_VERIFY_URL,
  cleanField,
  clientHash,
  isReportType,
  parseReportForm,
  reportCsp,
  sameOriginOk,
  sha256Hex,
  turnstileMode,
} from '../../workers/community-public/src/report'

const ID = '3f2b1c9e-8a44-4d3a-9b7e-1c2d3e4f5a6b'
const ANON_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.firma-de-prueba-1234567890'
const BASE: Env = {
  SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_ANON_KEY: ANON_JWT,
  APP_BASE: 'https://fransegura51.github.io/family-app',
  PUBLIC_BASE: 'https://pepafamilyapp.es/c',
}
const WITH_TURNSTILE: Env = { ...BASE, TURNSTILE_SITE_KEY: '0x4AAAA-site', TURNSTILE_SECRET: '0x4AAAA-secret' }
const REPORT_URL = 'https://pepafamilyapp.es/c/report'

interface RpcCall {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

// Supabase y Turnstile de mentira. `rpc` decide la respuesta del aviso; `turnstile` la de la comprobación.
function setup(options: { rpc?: () => Response | Error; turnstile?: () => Response | Error } = {}) {
  const rpcCalls: RpcCall[] = []
  const turnstileCalls: { body: URLSearchParams }[] = []
  const other: string[] = []
  const deps: Deps = {
    fetch: async (input, init) => {
      if (input === TURNSTILE_VERIFY_URL) {
        turnstileCalls.push({ body: new URLSearchParams(String(init?.body ?? '')) })
        const out = options.turnstile ? options.turnstile() : new Response(JSON.stringify({ success: true }), { status: 200 })
        if (out instanceof Error) throw out
        return out
      }
      if (input.includes('/rest/v1/rpc/community_visitor_report')) {
        rpcCalls.push({ url: input, headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) as Record<string, unknown> })
        const out = options.rpc ? options.rpc() : new Response(JSON.stringify({ ok: true }), { status: 200 })
        if (out instanceof Error) throw out
        return out
      }
      other.push(input)
      return new Response('{}', { status: 200 })
    },
    cache: null,
    waitUntil: () => undefined,
    now: () => Date.UTC(2026, 9, 15, 10, 0, 0),
  }
  return { deps, rpcCalls, turnstileCalls, other }
}

function form(over: Record<string, string> = {}): string {
  return new URLSearchParams({ type: 'post', id: ID, reason: 'spam', detail: '', contact: '', ...over }).toString()
}

function post(body: string, headers: Record<string, string> = {}, url = REPORT_URL): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://pepafamilyapp.es', 'sec-fetch-site': 'same-origin', 'cf-connecting-ip': '203.0.113.7', ...headers },
    body,
  })
}

const get = (url: string) => new Request(url, { method: 'GET' })

describe('utilidades puras', () => {
  it('los motivos son los mismos que los de la aplicación', () => {
    expect(REPORT_REASONS).toEqual(APP_REASONS)
  })

  it('isReportType solo admite publicación, comentario y reseña', () => {
    expect(['post', 'comment', 'review'].every(isReportType)).toBe(true)
    for (const bad of ['user', 'POST', '', null, undefined, 3]) expect(isReportType(bad)).toBe(false)
  })

  it('cleanField quita caracteres de control y recorta', () => {
    expect(cleanField('  hola\u0000 mundo\u0007  ')).toBe('hola mundo')
    expect(cleanField('a\r\nb')).toBe('a\nb')
  })

  it('parseReportForm valida tipo, uuid, motivo y longitudes', () => {
    const ok = parseReportForm(new URLSearchParams(form({ detail: ' texto ', contact: ' a@b.es ' })))
    expect(ok).toEqual({ ok: true, value: { type: 'post', id: ID, reason: 'spam', detail: 'texto', contact: 'a@b.es', honeypot: false, turnstileToken: '' } })
    expect(parseReportForm(new URLSearchParams(form({ type: 'user' })))).toEqual({ ok: false, error: 'type' })
    expect(parseReportForm(new URLSearchParams(form({ id: 'no-es-uuid' })))).toEqual({ ok: false, error: 'id' })
    expect(parseReportForm(new URLSearchParams(form({ reason: 'inventado' })))).toEqual({ ok: false, error: 'reason' })
    expect(parseReportForm(new URLSearchParams(form({ detail: 'x'.repeat(1001) })))).toEqual({ ok: false, error: 'detail_long' })
    expect(parseReportForm(new URLSearchParams(form({ contact: 'x'.repeat(201) })))).toEqual({ ok: false, error: 'contact_long' })
    const edge = parseReportForm(new URLSearchParams(form({ detail: 'x'.repeat(1000), contact: 'y'.repeat(200) })))
    expect(edge.ok).toBe(true)
  })

  it('detecta el campo trampa rellenado y recorta el token de Turnstile', () => {
    const p = new URLSearchParams(form({ website: 'http://spam', 'cf-turnstile-response': 't'.repeat(5000) }))
    const r = parseReportForm(p)
    expect(r.ok && r.value.honeypot).toBe(true)
    expect(r.ok && r.value.turnstileToken.length).toBe(2048)
  })

  it('turnstileMode: solo con las dos claves; una sola es configuración rota', () => {
    expect(turnstileMode({})).toBe('off')
    expect(turnstileMode({ TURNSTILE_SITE_KEY: 'a', TURNSTILE_SECRET: 'b' })).toBe('on')
    expect(turnstileMode({ TURNSTILE_SITE_KEY: 'a' })).toBe('broken')
    expect(turnstileMode({ TURNSTILE_SECRET: 'b' })).toBe('broken')
    expect(turnstileMode({ TURNSTILE_SITE_KEY: '  ', TURNSTILE_SECRET: '' })).toBe('off')
  })

  it('sameOriginOk: acepta el mismo origen o sin cabeceras; rechaza otro origen o cross-site', () => {
    const base = 'https://pepafamilyapp.es/c'
    expect(sameOriginOk(new Headers({ origin: 'https://pepafamilyapp.es' }), base)).toBe(true)
    expect(sameOriginOk(new Headers({ 'sec-fetch-site': 'same-origin' }), base)).toBe(true)
    expect(sameOriginOk(new Headers(), base)).toBe(true)
    expect(sameOriginOk(new Headers({ origin: 'https://malo.example' }), base)).toBe(false)
    expect(sameOriginOk(new Headers({ origin: 'null' }), base)).toBe(false)
    expect(sameOriginOk(new Headers({ 'sec-fetch-site': 'cross-site' }), base)).toBe(false)
    expect(sameOriginOk(new Headers({ 'sec-fetch-site': 'same-site' }), base)).toBe(false)
  })

  it('clientHash: SHA-256 hexadecimal de IP + día UTC + sal, estable en el día y distinto al cambiar cualquiera', async () => {
    const t = Date.UTC(2026, 9, 15, 23, 59, 0)
    const a = await clientHash('203.0.113.7', t, 'sal')
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).toBe(await sha256Hex('203.0.113.7|2026-10-15|sal'))
    expect(await clientHash('203.0.113.7', t + 60_000 - 1, 'sal')).toBe(a) // sigue siendo 15/10 en UTC
    expect(await clientHash('203.0.113.7', t + 120_000, 'sal')).not.toBe(a) // 16/10
    expect(await clientHash('203.0.113.8', t, 'sal')).not.toBe(a)
    expect(await clientHash('203.0.113.7', t, 'otra')).not.toBe(a)
    // Sin sal configurada se usa la constante documentada.
    expect(await clientHash('203.0.113.7', t, undefined)).toBe(await sha256Hex(`203.0.113.7|2026-10-15|${DEFAULT_REPORT_SALT}`))
    expect(await clientHash('203.0.113.7', t, '   ')).toBe(await clientHash('203.0.113.7', t, undefined))
  })

  it('reportCsp: sin scripts salvo el formulario con Turnstile', () => {
    expect(reportCsp(false)).toContain("script-src 'none'")
    expect(reportCsp(false)).not.toContain('challenges.cloudflare.com')
    const on = reportCsp(true)
    expect(on).toContain('script-src https://challenges.cloudflare.com')
    expect(on).toContain('frame-src https://challenges.cloudflare.com')
    for (const csp of [reportCsp(false), on]) {
      expect(csp).toContain("default-src 'none'")
      expect(csp).toContain("frame-ancestors 'none'")
      expect(csp).toContain("form-action 'self'")
      expect(csp).toContain("base-uri 'none'")
    }
  })
})

describe('GET /c/report (formulario)', () => {
  it('muestra un formulario accesible, sin JavaScript, que no necesita cuenta', async () => {
    const { deps, rpcCalls } = setup()
    const res = await handle(get(`${REPORT_URL}?type=comment&id=${ID}`), BASE, deps)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('<html lang="es">')
    expect(html).toContain('<form method="post" action="https://pepafamilyapp.es/c/report"')
    expect(html).toContain('name="type" value="comment"')
    expect(html).toContain(`name="id" value="${ID}"`)
    for (const r of REPORT_REASONS) {
      expect(html).toContain(`value="${r.id}"`)
      expect(html).toContain(r.label)
    }
    expect(html).toContain('for="detail"')
    expect(html).toContain('maxlength="1000"')
    expect(html).toContain('for="contact"')
    expect(html).toContain('maxlength="200"')
    expect(html).toContain('No hace falta cuenta ni darnos datos personales')
    expect(html).toContain('/privacidad.html')
    expect(html).toContain('<fieldset>')
    expect(html).toContain('<legend>')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('cf-turnstile')
    expect(rpcCalls).toHaveLength(0) // abrir el formulario no consulta nada
  })

  it('cabeceras: sin caché, sin marcos, sin cookies, noindex y CSP estricta', async () => {
    const res = await handle(get(`${REPORT_URL}?type=post&id=${ID}`), BASE, setup().deps)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('x-frame-options')).toBe('DENY')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('x-robots-tag')).toContain('noindex')
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(res.headers.get('content-security-policy')).toBe(reportCsp(false))
  })

  it('con Turnstile configurado: widget y script solo en esta página, y la CSP los permite solo aquí', async () => {
    const res = await handle(get(`${REPORT_URL}?type=post&id=${ID}`), WITH_TURNSTILE, setup().deps)
    const html = await res.text()
    expect(html).toContain('class="cf-turnstile" data-sitekey="0x4AAAA-site"')
    expect(html).toContain('https://challenges.cloudflare.com/turnstile/v0/api.js')
    expect(html).not.toContain('0x4AAAA-secret') // la clave secreta jamás sale
    expect(res.headers.get('content-security-policy')).toBe(reportCsp(true))
  })

  it('enlace sin tipo o sin uuid válido: 400 neutro sin repetir lo recibido', async () => {
    const evil = encodeURIComponent('"><script>alert(1)</script>')
    for (const url of [`${REPORT_URL}`, `${REPORT_URL}?type=user&id=${ID}`, `${REPORT_URL}?type=post&id=${evil}`, `${REPORT_URL}?type=${evil}&id=${ID}`]) {
      const res = await handle(get(url), BASE, setup().deps)
      expect(res.status).toBe(400)
      const html = await res.text()
      expect(html).toContain('Enlace no válido')
      expect(html).not.toContain('alert(1)')
      expect(html).not.toContain('<script')
    }
  })

  it('HEAD no devuelve cuerpo y la barra final también funciona', async () => {
    const head = await handle(new Request(`${REPORT_URL}/?type=post&id=${ID}`, { method: 'HEAD' }), BASE, setup().deps)
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
  })

  it('configuración de Turnstile a medias: 503 (no se reciben avisos sin la protección que se quiso poner)', async () => {
    const half: Env = { ...BASE, TURNSTILE_SITE_KEY: 'solo-la-publica' }
    expect((await handle(get(`${REPORT_URL}?type=post&id=${ID}`), half, setup().deps)).status).toBe(503)
    const { deps, rpcCalls } = setup()
    expect((await handle(post(form()), half, deps)).status).toBe(503)
    expect(rpcCalls).toHaveLength(0)
  })
})

describe('POST /c/report (envío)', () => {
  it('éxito: llama a community_visitor_report con la clave anónima y la huella, y da las gracias', async () => {
    const { deps, rpcCalls } = setup()
    const res = await handle(post(form({ type: 'comment', reason: 'acoso', detail: ' Me parece ofensivo ', contact: 'persona@ejemplo.es' })), { ...BASE, REPORT_SALT: 'sal-secreta' }, deps)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Gracias, la administración lo revisará')
    expect(rpcCalls).toHaveLength(1)
    const call = rpcCalls[0]
    expect(call.url).toBe('https://abc.supabase.co/rest/v1/rpc/community_visitor_report')
    expect(call.headers.apikey).toBe(ANON_JWT)
    expect(call.headers.authorization).toBe(`Bearer ${ANON_JWT}`)
    expect(call.body).toMatchObject({ p_type: 'comment', p_id: ID, p_reason: 'acoso', p_detail: 'Me parece ofensivo', p_contact: 'persona@ejemplo.es' })
    expect(call.body.p_client_hash).toBe(await sha256Hex('203.0.113.7|2026-10-15|sal-secreta'))
    // Ni la IP ni nada identificable viajan a Supabase salvo la huella.
    expect(JSON.stringify(call.body)).not.toContain('203.0.113.7')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(res.headers.get('content-security-policy')).toBe(reportCsp(false))
  })

  it('con clave «publishable» (sb_publishable_…) solo manda apikey', async () => {
    const { deps, rpcCalls } = setup()
    await handle(post(form()), { ...BASE, SUPABASE_ANON_KEY: 'sb_publishable_abcdefghijklmnopqrstuv' }, deps)
    expect(rpcCalls[0].headers.apikey).toBe('sb_publishable_abcdefghijklmnopqrstuv')
    expect(rpcCalls[0].headers.authorization).toBeUndefined()
  })

  it('sin detalle ni contacto manda null', async () => {
    const { deps, rpcCalls } = setup()
    await handle(post(form()), BASE, deps)
    expect(rpcCalls[0].body).toMatchObject({ p_detail: null, p_contact: null })
  })

  it('duplicado: «Ya lo teníamos»', async () => {
    const { deps } = setup({ rpc: () => new Response(JSON.stringify({ ok: true, already_reported: true }), { status: 200 }) })
    const res = await handle(post(form()), BASE, deps)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Ya lo teníamos')
  })

  it('tope de avisos (RATE_LIMIT del servidor): 429 con Retry-After', async () => {
    const { deps } = setup({ rpc: () => new Response(JSON.stringify({ code: 'P0001', message: 'RATE_LIMIT' }), { status: 400 }) })
    const res = await handle(post(form()), BASE, deps)
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('3600')
    expect(await res.text()).toContain('Has enviado muchos avisos')
  })

  it('contenido que ya no existe (NOT_AVAILABLE): 404 neutro', async () => {
    const { deps } = setup({ rpc: () => new Response(JSON.stringify({ code: 'P0001', message: 'NOT_AVAILABLE' }), { status: 400 }) })
    const res = await handle(post(form()), BASE, deps)
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('ya no está disponible')
  })

  it('rechazo del servidor por texto no seguro: 400 sin repetir el texto', async () => {
    const { deps } = setup({ rpc: () => new Response(JSON.stringify({ code: 'P0001', message: 'UNSAFE_CONTENT' }), { status: 400 }) })
    const res = await handle(post(form({ detail: '<b>hola</b>' })), BASE, deps)
    expect(res.status).toBe(400)
    expect(await res.text()).not.toContain('&lt;b&gt;')
  })

  it('fallo de Supabase (5xx, red o JSON roto): 503 neutro que no revela nada interno', async () => {
    for (const rpc of [() => new Response('boom con detalles internos', { status: 500 }), () => new Error('ECONNRESET'), () => new Response('no es json', { status: 200 })]) {
      const { deps } = setup({ rpc })
      const res = await handle(post(form()), BASE, deps)
      expect(res.status).toBe(503)
      const html = await res.text()
      expect(html).not.toContain('boom')
      expect(html).not.toContain('ECONNRESET')
    }
  })

  describe('Turnstile', () => {
    it('token válido: se verifica con la clave secreta y la IP, y entonces se avisa', async () => {
      const { deps, rpcCalls, turnstileCalls } = setup()
      const res = await handle(post(form({ 'cf-turnstile-response': 'token-bueno' })), WITH_TURNSTILE, deps)
      expect(res.status).toBe(200)
      expect(turnstileCalls).toHaveLength(1)
      expect(turnstileCalls[0].body.get('secret')).toBe('0x4AAAA-secret')
      expect(turnstileCalls[0].body.get('response')).toBe('token-bueno')
      expect(turnstileCalls[0].body.get('remoteip')).toBe('203.0.113.7')
      expect(rpcCalls).toHaveLength(1)
    })

    it('token inválido o ausente: 403 y NO se llama a Supabase', async () => {
      const failed = setup({ turnstile: () => new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), { status: 200 }) })
      const res = await handle(post(form({ 'cf-turnstile-response': 'malo' })), WITH_TURNSTILE, failed.deps)
      expect(res.status).toBe(403)
      expect(failed.rpcCalls).toHaveLength(0)

      const missing = setup()
      const res2 = await handle(post(form()), WITH_TURNSTILE, missing.deps)
      expect(res2.status).toBe(403)
      expect(missing.turnstileCalls).toHaveLength(0) // ni se gasta una llamada
      expect(missing.rpcCalls).toHaveLength(0)
    })

    it('Turnstile caído: 503 (falla cerrado) y no se avisa', async () => {
      for (const turnstile of [() => new Error('timeout'), () => new Response('x', { status: 502 })]) {
        const { deps, rpcCalls } = setup({ turnstile })
        const res = await handle(post(form({ 'cf-turnstile-response': 'abc' })), WITH_TURNSTILE, deps)
        expect(res.status).toBe(503)
        expect(rpcCalls).toHaveLength(0)
      }
    })

    it('sin las variables de Turnstile funciona sin él (y no llama a Cloudflare)', async () => {
      const { deps, turnstileCalls, rpcCalls } = setup()
      const res = await handle(post(form()), BASE, deps)
      expect(res.status).toBe(200)
      expect(turnstileCalls).toHaveLength(0)
      expect(rpcCalls).toHaveLength(1)
    })
  })

  describe('entrada anómala o maliciosa', () => {
    it('otro origen o cross-site (CSRF): 403 y no se llama a Supabase', async () => {
      const cases: Record<string, string>[] = [{ origin: 'https://malo.example' }, { 'sec-fetch-site': 'cross-site' }, { origin: 'null' }]
      for (const headers of cases) {
        const { deps, rpcCalls } = setup()
        const res = await handle(post(form(), headers), BASE, deps)
        expect(res.status).toBe(403)
        expect(rpcCalls).toHaveLength(0)
      }
    })

    it('un cliente sin Origin ni Sec-Fetch-Site (no es un navegador) se admite', async () => {
      const req = new Request(REPORT_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form() })
      const { deps, rpcCalls } = setup()
      expect((await handle(req, BASE, deps)).status).toBe(200)
      expect(rpcCalls).toHaveLength(1)
      // Sin cf-connecting-ip (local) todos comparten la misma huella documentada.
      expect(rpcCalls[0].body.p_client_hash).toBe(await sha256Hex(`desconocida|2026-10-15|${DEFAULT_REPORT_SALT}`))
    })

    it('tipo de contenido que no es un formulario: 415', async () => {
      for (const ct of ['application/json', 'text/plain', 'multipart/form-data; boundary=x']) {
        const { deps, rpcCalls } = setup()
        const res = await handle(post(form(), { 'content-type': ct }), BASE, deps)
        expect(res.status).toBe(415)
        expect(rpcCalls).toHaveLength(0)
      }
    })

    it('cuerpo demasiado grande: 413 tanto por cabecera como en streaming', async () => {
      const big = form({ detail: 'x'.repeat(REPORT_MAX_BODY_BYTES) })
      const a = setup()
      expect((await handle(post(big), BASE, a.deps)).status).toBe(413)
      expect(a.rpcCalls).toHaveLength(0)
      // Mintiendo en content-length (dice poco, manda mucho): se corta igualmente.
      const b = setup()
      const res = await handle(post(big, { 'content-length': '10' }), BASE, b.deps)
      expect([413, 400]).toContain(res.status)
      expect(b.rpcCalls).toHaveLength(0)
      // Justo en el límite se admite el formato (lo decide el servidor).
      const ok = setup()
      expect((await handle(post(form({ detail: 'x'.repeat(1000), contact: 'y'.repeat(200) })), BASE, ok.deps)).status).toBe(200)
    })

    it('validación: tipo, uuid y motivo inválidos o textos largos → 400 sin llamar a Supabase', async () => {
      for (const body of [form({ type: 'user' }), form({ id: '1; drop table' }), form({ reason: 'otro-motivo' }), form({ detail: 'x'.repeat(1001) }), form({ contact: 'x'.repeat(201) }), '']) {
        const { deps, rpcCalls } = setup()
        const res = await handle(post(body), BASE, deps)
        expect(res.status).toBe(400)
        expect(rpcCalls).toHaveLength(0)
      }
    })

    it('HTML y scripts en los campos nunca aparecen en la respuesta (y el contenido va a Supabase como texto)', async () => {
      const payload = '<script>alert("x")</script><img src=x onerror=alert(1)>'
      const { deps, rpcCalls } = setup()
      const res = await handle(post(form({ detail: payload, contact: payload.slice(0, 100) })), BASE, deps)
      const html = await res.text()
      expect(html).not.toContain('<script')
      expect(html).not.toContain('onerror')
      expect(html).not.toContain('alert(')
      expect(rpcCalls[0].body.p_detail).toBe(payload) // se manda tal cual (JSON); es el servidor quien lo limpia y rechaza lo no seguro
    })

    it('campo trampa rellenado: respuesta «gracias» pero no se avisa ni se consulta a nadie', async () => {
      const { deps, rpcCalls, turnstileCalls } = setup()
      const res = await handle(post(form({ website: 'http://spam.example' })), WITH_TURNSTILE, deps)
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('Gracias')
      expect(rpcCalls).toHaveLength(0)
      expect(turnstileCalls).toHaveLength(0)
    })

    it('métodos no permitidos: 405; y POST en cualquier otra ruta sigue siendo 405', async () => {
      const { deps } = setup()
      const put = await handle(new Request(REPORT_URL, { method: 'PUT', body: form() }), BASE, deps)
      expect(put.status).toBe(405)
      const del = await handle(new Request(REPORT_URL, { method: 'DELETE' }), BASE, deps)
      expect(del.status).toBe(405)
      const other = await handle(post(form(), {}, `https://pepafamilyapp.es/c/p/${ID}`), BASE, deps)
      expect(other.status).toBe(405)
      expect(other.headers.get('allow')).toBe('GET, HEAD')
    })
  })
})

describe('enlaces «Denunciar contenido» de las páginas públicas', () => {
  const config: PublicPageConfig = { publicBase: 'https://pepafamilyapp.es/c', appBase: 'https://fransegura51.github.io/family-app', mediaBase: 'https://pepafamilyapp.es/c/img' }
  const COMMENT_ID = '99999999-4444-4555-8666-aaaaaaaaaaaa'

  it('reportUrl construye la dirección del formulario', () => {
    expect(reportUrl('post', ID.toUpperCase(), config)).toBe(`https://pepafamilyapp.es/c/report?type=post&id=${ID}`)
    expect(reportUrl('comment', COMMENT_ID, config)).toBe(`https://pepafamilyapp.es/c/report?type=comment&id=${COMMENT_ID}`)
  })

  it('la publicación lleva un enlace a su formulario y cada comentario publicado, el suyo', () => {
    const html = renderPostPage({
      post: { id: ID, kind: 'consejo', section: 'hogar', title: 'Truco', body: 'Texto', author_alias: 'Ana', like_count: 0, comment_count: 2, created_at: '2026-10-14T10:00:00Z' },
      comments: [
        { id: COMMENT_ID, body: 'Hola', author_alias: 'Beto', created_at: '2026-10-14T11:00:00Z', replies: [] },
        { id: 'no-es-uuid', body: 'Sin id válido', author_alias: 'Cris', created_at: '2026-10-14T12:00:00Z', replies: [] },
        { id: '11111111-4444-4555-8666-aaaaaaaaaaaa', removed: true, created_at: '2026-10-14T13:00:00Z', replies: [] },
      ],
      poll: null,
      config,
    })
    expect(html).not.toBeNull()
    expect(html).toContain(`href="https://pepafamilyapp.es/c/report?type=post&amp;id=${ID}"`)
    expect(html).toContain('Denunciar contenido')
    expect(html).toContain(`href="https://pepafamilyapp.es/c/report?type=comment&amp;id=${COMMENT_ID}"`)
    // Solo uno: el comentario sin uuid válido y el retirado no llevan enlace.
    expect(html!.match(/type=comment/g)).toHaveLength(1)
    expect(html).toContain('rel="nofollow"')
  })
})
