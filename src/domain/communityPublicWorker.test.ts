// Worker de la lectura pública de Comunidad: rutas, llamadas a Supabase, caché (60 s + 60 s de «copia vieja»; 404 solo 10 s), cabeceras y fallos.
// Se prueba el manejador (`handle`) con un Supabase y una caché de mentira: no hace falta Cloudflare ni red.
import { describe, expect, it } from 'vitest'
import {
  GONE_FRESH_SECONDS,
  IMAGE_FRESH_SECONDS,
  IMAGE_MAX_BYTES,
  IMAGE_MISSING_SECONDS,
  POST_FRESH_SECONDS,
  POST_STALE_SECONDS,
  handle,
  type CacheLike,
  type Deps,
  type Env,
} from '../../workers/community-public/src/handler'

const ID = '3f2b1c9e-8a44-4d3a-9b7e-1c2d3e4f5a6b'
const ANON_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.firma-de-prueba-1234567890'
const env: Env = {
  SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_ANON_KEY: ANON_JWT,
  APP_BASE: 'https://fransegura51.github.io/family-app',
  PUBLIC_BASE: 'https://pepafamilyapp.es/c',
}

const POST = { id: ID, kind: 'consejo', section: 'hogar', topic_label: 'Ahorro', title: 'Truco de ahorro', body: 'Texto del truco.', author_alias: 'Ana', like_count: 1, comment_count: 0, created_at: '2026-10-14T10:00:00Z' }

interface Call {
  name: string
  args: Record<string, unknown>
  headers: Record<string, string>
}

// Llamadas al almacenamiento (fotos): se guarda la dirección completa y las cabeceras para comprobar que el Worker la construye él solo.
interface StorageCall {
  url: string
  headers: Record<string, string>
  redirect?: RequestRedirect
}

function setup(responses: Record<string, unknown | (() => unknown)>, options: { cache?: boolean; storage?: () => Response | Error } = {}) {
  const calls: Call[] = []
  const storageCalls: StorageCall[] = []
  const store = new Map<string, Response>()
  const pending: Promise<unknown>[] = []
  let clock = 1_000_000
  const cache: CacheLike = {
    async match(req) {
      return store.get(req.url)?.clone()
    },
    async put(req, res) {
      store.set(req.url, res.clone())
    },
  }
  const deps: Deps = {
    fetch: async (input, init) => {
      if (input.includes('/storage/v1/')) {
        storageCalls.push({ url: input, headers: init?.headers as Record<string, string>, redirect: init?.redirect })
        const out = options.storage ? options.storage() : new Response('', { status: 404 })
        if (out instanceof Error) throw out
        return out
      }
      const name = input.split('/rpc/')[1]
      calls.push({ name, args: JSON.parse(String(init?.body)), headers: init?.headers as Record<string, string> })
      const value = responses[name]
      const out = typeof value === 'function' ? (value as () => unknown)() : value
      if (out instanceof Error) throw out
      if (out instanceof Response) return out
      return new Response(JSON.stringify(out ?? null), { status: 200, headers: { 'content-type': 'application/json' } })
    },
    cache: options.cache === false ? null : cache,
    waitUntil: (p) => {
      pending.push(p)
    },
    now: () => clock,
  }
  return {
    calls,
    storageCalls,
    store,
    advance: (seconds: number) => {
      clock += seconds * 1000
    },
    async get(path: string, init?: RequestInit, e: Env = env) {
      const res = await handle(new Request(`https://pepafamilyapp.es${path}`, init), e, deps)
      await Promise.all(pending.splice(0))
      return res
    },
  }
}

describe('configuración y métodos', () => {
  it('sin variables responde 500 sin enseñar qué falta', async () => {
    const s = setup({})
    const res = await s.get(`/c/p/${ID}`, undefined, { ...env, SUPABASE_ANON_KEY: '' })
    expect(res.status).toBe(500)
    expect(await res.text()).toBe('Servicio sin configurar')
    expect(s.calls).toHaveLength(0)
  })

  it('solo GET y HEAD', async () => {
    const s = setup({})
    const res = await s.get(`/c/p/${ID}`, { method: 'POST' })
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('GET, HEAD')
  })

  it('/c redirige a la Comunidad de la aplicación', async () => {
    const s = setup({})
    for (const path of ['/c', '/c/']) {
      const res = await s.get(path)
      expect(res.status).toBe(302)
      expect(res.headers.get('location')).toBe('https://fransegura51.github.io/family-app/comunidad')
    }
  })

  it('rutas desconocidas: 404 neutro con noindex y sin consultar nada', async () => {
    const s = setup({})
    for (const path of ['/c/otra', '/c/p', '/c/p/a/b', '/otra-cosa', '/c/p/no-es-uuid', `/c/p/${ID}x`, "/c/p/1'%20or%201=1"]) {
      const res = await s.get(path)
      expect(res.status, path).toBe(404)
      expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
      expect(await res.text()).toContain('noindex,nofollow')
    }
    expect(s.calls).toHaveLength(0)
    expect(s.store.size).toBe(0)
  })
})

describe('publicación', () => {
  it('200 con HTML, cabeceras de seguridad y caché de 60 s + 60 s', async () => {
    const s = setup({ community_public_get_post: POST, community_public_get_comments: [] })
    const res = await s.get(`/c/p/${ID}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(res.headers.get('cache-control')).toBe(`public, max-age=${POST_FRESH_SECONDS}, stale-while-revalidate=${POST_STALE_SECONDS}`)
    expect(res.headers.get('content-security-policy')).toContain("script-src 'none'")
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
    expect(res.headers.get('x-frame-options')).toBe('DENY')
    expect(res.headers.get('x-robots-tag')).toBeNull()
    const body = await res.text()
    expect(body).toContain('<h1>Truco de ahorro</h1>')
    expect(body).toContain(`<link rel="canonical" href="https://pepafamilyapp.es/c/p/${ID}">`)
  })

  it('pide a Supabase solo lo necesario y con la clave pública (Bearer solo si es un JWT)', async () => {
    const s = setup({ community_public_get_post: POST, community_public_get_comments: [] })
    await s.get(`/c/p/${ID.toUpperCase()}`)
    expect(s.calls.map((c) => c.name).sort()).toEqual(['community_public_get_comments', 'community_public_get_post'])
    expect(s.calls.find((c) => c.name === 'community_public_get_post')!.args).toEqual({ p_id: ID })
    expect(s.calls.find((c) => c.name === 'community_public_get_comments')!.args).toEqual({ p_post: ID, p_limit: 50 })
    expect(s.calls[0].headers.apikey).toBe(ANON_JWT)
    expect(s.calls[0].headers.authorization).toBe(`Bearer ${ANON_JWT}`)

    const s2 = setup({ community_public_get_post: POST, community_public_get_comments: [] })
    await s2.get(`/c/p/${ID}`, undefined, { ...env, SUPABASE_ANON_KEY: 'sb_publishable_clave_de_prueba_123' })
    expect(s2.calls[0].headers.apikey).toBe('sb_publishable_clave_de_prueba_123')
    expect(s2.calls[0].headers.authorization).toBeUndefined()
  })

  it('una encuesta pide también sus resultados; las demás no', async () => {
    const s = setup({
      community_public_get_post: { ...POST, kind: 'encuesta', is_official: true },
      community_public_get_comments: [],
      community_public_get_poll: { question: 'P', options: ['A', 'B'], final: true, counts: [3, 1], total_votes: 4 },
    })
    const body = await (await s.get(`/c/p/${ID}`)).text()
    expect(s.calls.map((c) => c.name)).toContain('community_public_get_poll')
    expect(body).toContain('Resultados finales con 4 votos')
  })

  it('HEAD devuelve las mismas cabeceras y ningún cuerpo', async () => {
    const s = setup({ community_public_get_post: POST, community_public_get_comments: [] })
    const res = await s.get(`/c/p/${ID}`, { method: 'HEAD' })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('')
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8')
  })

  it('los parámetros de la dirección (?utm_…) no multiplican la caché', async () => {
    const s = setup({ community_public_get_post: POST, community_public_get_comments: [] })
    await s.get(`/c/p/${ID}`)
    await s.get(`/c/p/${ID}?utm_source=whatsapp&fbclid=123`)
    expect(s.calls.filter((c) => c.name === 'community_public_get_post')).toHaveLength(1)
    expect(s.store.size).toBe(1)
  })
})

describe('caché', () => {
  it('dentro de los 60 s no vuelve a pedir nada a Supabase', async () => {
    const s = setup({ community_public_get_post: POST, community_public_get_comments: [] })
    await s.get(`/c/p/${ID}`)
    s.advance(59)
    const res = await s.get(`/c/p/${ID}`)
    expect(res.status).toBe(200)
    expect(s.calls).toHaveLength(2)
  })

  it('entre 60 y 120 s sirve la copia vieja y la renueva por detrás (stale-while-revalidate)', async () => {
    let title = 'Primera versión'
    const s = setup({ community_public_get_post: () => ({ ...POST, title }), community_public_get_comments: [] })
    await s.get(`/c/p/${ID}`)
    title = 'Segunda versión'
    s.advance(90)
    const stale = await (await s.get(`/c/p/${ID}`)).text()
    expect(stale).toContain('Primera versión')
    // La renovación por detrás ya ha guardado la nueva.
    expect(s.calls.filter((c) => c.name === 'community_public_get_post')).toHaveLength(2)
    const fresh = await (await s.get(`/c/p/${ID}`)).text()
    expect(fresh).toContain('Segunda versión')
  })

  it('pasados los 120 s la copia ya no se sirve: se vuelve a pedir y lo borrado deja de verse', async () => {
    let value: unknown = POST
    const s = setup({ community_public_get_post: () => value, community_public_get_comments: [] })
    expect((await s.get(`/c/p/${ID}`)).status).toBe(200)
    value = null
    s.advance(POST_FRESH_SECONDS + POST_STALE_SECONDS + 1)
    const res = await s.get(`/c/p/${ID}`)
    expect(res.status).toBe(404)
    expect(await res.text()).not.toContain('Truco de ahorro')
  })

  it('una publicación borrada: la renovación por detrás deja el 404 guardado para la siguiente visita', async () => {
    let value: unknown = POST
    const s = setup({ community_public_get_post: () => value, community_public_get_comments: [] })
    await s.get(`/c/p/${ID}`)
    value = null
    s.advance(90)
    await s.get(`/c/p/${ID}`) // copia vieja + renovación
    expect((await s.get(`/c/p/${ID}`)).status).toBe(404)
  })

  it('los 404 se guardan solo 10 s: una publicación nueva aparece enseguida', async () => {
    let value: unknown = null
    const s = setup({ community_public_get_post: () => value, community_public_get_comments: [] })
    const first = await s.get(`/c/p/${ID}`)
    expect(first.status).toBe(404)
    expect(first.headers.get('cache-control')).toBe(`public, max-age=${GONE_FRESH_SECONDS}`)
    expect(first.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(await first.text()).not.toContain('application/ld+json')
    s.advance(5)
    expect((await s.get(`/c/p/${ID}`)).status).toBe(404)
    expect(s.calls).toHaveLength(1)
    value = POST
    s.advance(6)
    expect((await s.get(`/c/p/${ID}`)).status).toBe(200)
  })

  it('funciona también sin caché (workers.dev)', async () => {
    const s = setup({ community_public_get_post: POST, community_public_get_comments: [] }, { cache: false })
    expect((await s.get(`/c/p/${ID}`)).status).toBe(200)
    expect((await s.get(`/c/p/${ID}`)).status).toBe(200)
  })
})

describe('fallos de Supabase', () => {
  it('503 con noindex y sin caché (nunca se confunde con «borrado»)', async () => {
    for (const failure of [new Error('red caída'), new Response('boom', { status: 500 }), new Response('{no json', { status: 200 })]) {
      const s = setup({ community_public_get_post: failure })
      const res = await s.get(`/c/p/${ID}`)
      expect(res.status).toBe(503)
      expect(res.headers.get('cache-control')).toBe('no-store')
      expect(res.headers.get('retry-after')).toBe('30')
      expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
      expect(s.store.size).toBe(0)
    }
  })

  it('si fallan los comentarios también es 503 (no se guarda una página sin comentarios)', async () => {
    const s = setup({ community_public_get_post: POST, community_public_get_comments: new Response('x', { status: 502 }) })
    expect((await s.get(`/c/p/${ID}`)).status).toBe(503)
    expect(s.store.size).toBe(0)
  })

  it('si la renovación por detrás falla se sigue sirviendo la copia vieja y no se pisa', async () => {
    let fail = false
    const s = setup({ community_public_get_post: () => (fail ? new Error('x') : POST), community_public_get_comments: [] })
    await s.get(`/c/p/${ID}`)
    fail = true
    s.advance(90)
    const res = await s.get(`/c/p/${ID}`)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Truco de ahorro')
  })
})

describe('sitemap y robots', () => {
  it('sitemap.xml: XML con las publicaciones y caché de 5 minutos', async () => {
    const s = setup({ community_public_sitemap: [{ id: ID, updated_at: '2026-10-14T10:00:00Z' }] })
    const res = await s.get('/c/sitemap.xml')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/xml; charset=utf-8')
    expect(res.headers.get('cache-control')).toBe('public, max-age=300, stale-while-revalidate=300')
    expect(await res.text()).toContain(`<loc>https://pepafamilyapp.es/c/p/${ID}</loc>`)
    expect(s.calls[0].args).toEqual({ p_limit: 5000, p_offset: 0 })
    s.advance(100)
    await s.get('/c/sitemap.xml')
    expect(s.calls).toHaveLength(1)
  })

  it('robots.txt sin consultar nada', async () => {
    const s = setup({})
    const res = await s.get('/c/robots.txt')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(await res.text()).toContain('Sitemap: https://pepafamilyapp.es/c/sitemap.xml')
    expect(s.calls).toHaveLength(0)
  })

  it('con PUBLIC_BASE sin ruta (subdominio) también funciona', async () => {
    const s = setup({ community_public_get_post: POST, community_public_get_comments: [] })
    const res = await s.get(`/p/${ID}`, undefined, { ...env, PUBLIC_BASE: 'https://comunidad.pepafamilyapp.es' })
    expect(res.status).toBe(200)
    expect(await res.text()).toContain(`href="https://comunidad.pepafamilyapp.es/p/${ID}"`)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// Fotos: GET /c/img/<ruta>. El bucket de Supabase es PRIVADO; el Worker lo lee con la clave anónima y la política de Storage decide.
// ---------------------------------------------------------------------------------------------------------------------
const PROFILE = 'aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb'
const FILE = '11111111-aaaa-4bbb-8ccc-000000000001'
const PHOTO = `${PROFILE}/${FILE}.jpg`
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 2, 3])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50])
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>')
const body = (bytes: Uint8Array) => bytes as unknown as BodyInit
const ok = (bytes: Uint8Array, type = 'image/jpeg') => new Response(body(bytes), { status: 200, headers: { 'content-type': type } })

describe('fotos (/c/img/<ruta>)', () => {
  it('foto de contenido visible: 200 con su tipo, nosniff, caché de 120 s y la clave anónima (solo la ruta, nunca una URL del cliente)', async () => {
    const s = setup({}, { storage: () => ok(JPEG) })
    const res = await s.get(`/c/img/${PHOTO}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('cache-control')).toBe(`public, max-age=${IMAGE_FRESH_SECONDS}, s-maxage=${IMAGE_FRESH_SECONDS}`)
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(JPEG)
    expect(s.storageCalls).toHaveLength(1)
    expect(s.storageCalls[0].url).toBe(`https://abc.supabase.co/storage/v1/object/authenticated/community-media/${PHOTO}`)
    expect(s.storageCalls[0].headers.apikey).toBe(ANON_JWT)
    expect(s.storageCalls[0].headers.authorization).toBe(`Bearer ${ANON_JWT}`)
    expect(s.storageCalls[0].redirect).toBe('manual')
    expect(s.calls).toHaveLength(0) // no se llama a ninguna función de la base
  })

  it('con clave «publishable» solo va en apikey', async () => {
    const s = setup({}, { storage: () => ok(JPEG) })
    await s.get(`/c/img/${PHOTO}`, undefined, { ...env, SUPABASE_ANON_KEY: 'sb_publishable_clave_de_prueba_123' })
    expect(s.storageCalls[0].headers.apikey).toBe('sb_publishable_clave_de_prueba_123')
    expect(s.storageCalls[0].headers.authorization).toBeUndefined()
  })

  it('png y webp también se sirven con su tipo; HEAD sin cuerpo', async () => {
    for (const [ext, bytes, type] of [
      ['png', PNG, 'image/png'],
      ['webp', WEBP, 'image/webp'],
    ] as const) {
      const s = setup({}, { storage: () => ok(bytes, type) })
      const res = await s.get(`/c/img/${PROFILE}/${FILE}.${ext}`)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe(type)
    }
    const s = setup({}, { storage: () => ok(JPEG) })
    const head = await s.get(`/c/img/${PHOTO}`, { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
  })

  it('contenido oculto, eliminado, inexistente o sin permiso (Storage responde 400/401/403/404): el MISMO 404 neutro, sin detalle', async () => {
    const bodies = new Set<string>()
    for (const status of [400, 401, 403, 404]) {
      const s = setup({}, { storage: () => new Response(JSON.stringify({ statusCode: String(status), error: 'Object not found', message: 'secreto-interno' }), { status }) })
      const res = await s.get(`/c/img/${PHOTO}`)
      expect(res.status, String(status)).toBe(404)
      expect(res.headers.get('cache-control')).toBe(`public, max-age=${IMAGE_MISSING_SECONDS}, s-maxage=${IMAGE_MISSING_SECONDS}`)
      expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
      const text = await res.text()
      expect(text).not.toContain('secreto-interno')
      bodies.add(text)
    }
    expect(bodies.size).toBe(1)
  })

  it('una redirección, un 200 con tipo no permitido, un SVG, un tipo que no coincide con los bytes o un archivo vacío: 404', async () => {
    const cases: [string, () => Response][] = [
      ['redirección', () => new Response(null, { status: 302, headers: { location: 'https://evil.example/x.jpg' } })],
      ['svg declarado', () => ok(SVG, 'image/svg+xml')],
      ['html declarado', () => ok(new TextEncoder().encode('<html>'), 'text/html')],
      ['svg disfrazado de jpeg', () => ok(SVG, 'image/jpeg')],
      ['bytes de png con tipo jpeg', () => ok(PNG, 'image/jpeg')],
      ['vacío', () => ok(new Uint8Array(0))],
      ['sin tipo', () => new Response(body(JPEG), { status: 200 })],
    ]
    for (const [name, make] of cases) {
      const s = setup({}, { storage: make })
      const res = await s.get(`/c/img/${PHOTO}`)
      expect(res.status, name).toBe(404)
      expect(res.headers.get('content-type'), name).toBe('text/plain; charset=utf-8')
    }
  })

  it('límite de 3 MB: por cabecera y también si el cuerpo real lo pasa', async () => {
    const big = new Uint8Array(IMAGE_MAX_BYTES + 1)
    big.set(JPEG)
    const declared = setup({}, { storage: () => new Response(body(big), { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': String(big.length) } }) })
    expect((await declared.get(`/c/img/${PHOTO}`)).status).toBe(404)
    // Con una cabecera que miente (o sin ella): se corta al pasar el límite.
    const lying = setup({}, { storage: () => new Response(body(big), { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': '10' } }) })
    expect((await lying.get(`/c/img/${PHOTO}`)).status).toBe(404)
    const exact = new Uint8Array(IMAGE_MAX_BYTES)
    exact.set(JPEG)
    const fits = setup({}, { storage: () => ok(exact) })
    expect((await fits.get(`/c/img/${PHOTO}`)).status).toBe(200)
  })

  it('rutas maliciosas o mal formadas: 404 sin llamar nunca a Storage', async () => {
    const s = setup({}, { storage: () => ok(JPEG) })
    const bad = [
      '',
      'x.jpg',
      `${PROFILE}/${FILE}`, // sin extensión
      `${PROFILE}/${FILE}.svg`,
      `${PROFILE}/${FILE}.gif`,
      `${PROFILE}/${FILE}.JPG`,
      `${PROFILE.toUpperCase()}/${FILE}.jpg`,
      `..%2F${PROFILE}/${FILE}.jpg`,
      `${PROFILE}%2F${FILE}.jpg`,
      `%2e%2e/${PROFILE}/${FILE}.jpg`,
      `${PROFILE}//${FILE}.jpg`,
      `/${PROFILE}/${FILE}.jpg`,
      `${PROFILE}/${FILE}.jpg/otra`,
      `${PROFILE}/${FILE}.jpg%00.png`,
      'https://evil.example/a.jpg',
      '//evil.example/a.jpg',
      `otra-carpeta/${FILE}.jpg`,
      `${'a'.repeat(300)}.jpg`,
    ]
    for (const path of bad) {
      const res = await s.get(`/c/img/${path}`)
      expect(res.status, path).toBe(404)
    }
    // Lo que va tras «?» no forma parte de la ruta (no cambia lo que se pide ni multiplica la caché).
    const withQuery = await s.get(`/c/img/${PHOTO}?x=1/../../`)
    expect(withQuery.status).toBe(200)
    expect(s.storageCalls).toHaveLength(1)
    expect(s.storageCalls[0].url).toBe(`https://abc.supabase.co/storage/v1/object/authenticated/community-media/${PHOTO}`)
  })

  it('/c/img y /c/img/ sin ruta: 404 neutro', async () => {
    const s = setup({}, { storage: () => ok(JPEG) })
    expect((await s.get('/c/img')).status).toBe(404)
    expect((await s.get('/c/img/')).status).toBe(404)
    expect(s.storageCalls).toHaveLength(0)
  })

  it('solo GET y HEAD', async () => {
    const s = setup({}, { storage: () => ok(JPEG) })
    expect((await s.get(`/c/img/${PHOTO}`, { method: 'POST' })).status).toBe(405)
    expect(s.storageCalls).toHaveLength(0)
  })

  it('caché: dentro de 120 s no vuelve a pedir a Storage; pasado ese tiempo SÍ, y si ya está oculta deja de servirse', async () => {
    let hidden = false
    const s = setup({}, { storage: () => (hidden ? new Response('', { status: 400 }) : ok(JPEG)) })
    expect((await s.get(`/c/img/${PHOTO}`)).status).toBe(200)
    hidden = true
    s.advance(100)
    const cached = await s.get(`/c/img/${PHOTO}`)
    expect(cached.status).toBe(200)
    // Una copia de la caché solo anuncia el tiempo que le queda (no se alarga la vida de lo que luego se oculte).
    expect(cached.headers.get('cache-control')).toBe('public, max-age=20, s-maxage=20')
    expect(s.storageCalls).toHaveLength(1)
    s.advance(21)
    const after = await s.get(`/c/img/${PHOTO}`)
    expect(after.status).toBe(404)
    expect(s.storageCalls).toHaveLength(2)
    expect(new Uint8Array(await after.arrayBuffer())).not.toEqual(JPEG)
  })

  it('el 404 se guarda solo 20 s (una foto recién publicada deja de dar 404 enseguida)', async () => {
    let published = false
    const s = setup({}, { storage: () => (published ? ok(JPEG) : new Response('', { status: 404 })) })
    expect((await s.get(`/c/img/${PHOTO}`)).status).toBe(404)
    published = true
    s.advance(10)
    expect((await s.get(`/c/img/${PHOTO}`)).status).toBe(404)
    expect(s.storageCalls).toHaveLength(1)
    s.advance(11)
    expect((await s.get(`/c/img/${PHOTO}`)).status).toBe(200)
  })

  it('un fallo de red o de Storage (≥ 500, 429) es 503 sin caché: nunca se confunde con «oculta» ni se guarda', async () => {
    for (const failure of [new Error('red caída'), new Response('boom', { status: 500 }), new Response('', { status: 503 }), new Response('', { status: 429 })]) {
      const s = setup({}, { storage: () => failure })
      const res = await s.get(`/c/img/${PHOTO}`)
      expect(res.status).toBe(503)
      expect(res.headers.get('cache-control')).toBe('no-store')
      expect(s.store.size).toBe(0)
    }
  })

  it('sin variables responde 500; sin caché (workers.dev) funciona igual', async () => {
    const none = setup({}, { storage: () => ok(JPEG) })
    expect((await none.get(`/c/img/${PHOTO}`, undefined, { ...env, SUPABASE_ANON_KEY: '' })).status).toBe(500)
    expect(none.storageCalls).toHaveLength(0)
    const nocache = setup({}, { storage: () => ok(JPEG), cache: false })
    expect((await nocache.get(`/c/img/${PHOTO}`)).status).toBe(200)
    expect((await nocache.get(`/c/img/${PHOTO}`)).status).toBe(200)
    expect(nocache.storageCalls).toHaveLength(2)
  })

  it('con PUBLIC_BASE sin ruta (subdominio) la ruta es /img/<ruta>', async () => {
    const s = setup({}, { storage: () => ok(JPEG) })
    const res = await s.get(`/img/${PHOTO}`, undefined, { ...env, PUBLIC_BASE: 'https://comunidad.pepafamilyapp.es' })
    expect(res.status).toBe(200)
  })

  it('la página pública enlaza las fotos por /c/img (no por Supabase) y su CSP las permite', async () => {
    const s = setup({ community_public_get_post: { ...POST, photos: [{ path: PHOTO, position: 1 }] }, community_public_get_comments: [] })
    const res = await s.get(`/c/p/${ID}`)
    const html = await res.text()
    expect(html).toContain(`src="https://pepafamilyapp.es/c/img/${PHOTO}"`)
    expect(html).not.toContain('supabase.co')
    expect(res.headers.get('content-security-policy')).toContain("img-src 'self' https://pepafamilyapp.es")
    expect(res.headers.get('content-security-policy')).not.toContain('supabase.co')
  })
})
