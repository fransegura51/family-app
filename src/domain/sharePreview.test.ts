// Vistas previas al compartir: metas de la función `share-preview` (lógica pura, base simulada) + mensajes de compartir + páginas estáticas de respaldo.
import { describe, expect, it, vi } from 'vitest'
import {
  COMMUNITY_GENERIC_DESCRIPTION,
  cleanLine,
  communityPreview,
  escapeHtml,
  handleSharePreview,
  isPreviewBot,
  parseShareRequest,
  renderPreviewHtml,
  wishlistPreview,
  type PreviewDb,
} from '../../supabase/functions/_shared/sharePreview'
import { buildWishlistShareText, wishlistShareTitle } from './shareMessages'
import staticPage from '../../public/compartir-comunidad.html?raw'
import indexHtml from '../../index.html?raw'

const APP = 'https://fransegura51.github.io/family-app'
const ID = '123e4567-e89b-42d3-a456-426614174000'
const TOKEN = 'ab'.repeat(24)
const cfg = { appBase: APP + '/' }

const OFFICIAL = { title: 'Cómo hacer croquetas sin lío', kind: 'articulo', is_official: true, status: 'published', ai_excluded: false }
const meta = (html: string, name: string) => new RegExp(`<meta (?:property|name)="${name}" content="([^"]*)"`).exec(html)?.[1]

function fakeDb(over: Partial<PreviewDb> = {}) {
  return { post: vi.fn(async () => OFFICIAL), wishlistOwnerName: vi.fn(async () => 'Lucía'), ...over } as unknown as PreviewDb & {
    post: ReturnType<typeof vi.fn>
    wishlistOwnerName: ReturnType<typeof vi.fn>
  }
}
const get = (qs: string, ua = 'Mozilla/5.0') => new Request(`https://example.test/functions/v1/share-preview?${qs}`, { headers: { 'user-agent': ua } })

describe('utilidades de texto', () => {
  it('escapeHtml tapa todo lo peligroso', () => {
    expect(escapeHtml(`<script>"x"&'y'\``)).toBe('&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&#96;')
  })
  it('cleanLine quita controles, correos, colapsa espacios y recorta sin partir emojis', () => {
    expect(cleanLine('  Hola\n\t mundo  a@b.com ', 50)).toBe('Hola mundo')
    expect(cleanLine('x'.repeat(200), 90).length).toBeLessThanOrEqual(90)
    const cut = cleanLine('a'.repeat(9) + '😀😀😀', 11)
    expect(cut).not.toMatch(/[\uD800-\uDBFF]…?$/)
    expect(cleanLine(42, 10)).toBe('')
  })
})

describe('Comunidad: solo el título de una publicación OFICIAL', () => {
  it('oficial publicada: título real, descripción genérica, imagen oficial y destino dentro de la app', () => {
    const p = communityPreview(OFFICIAL, ID, cfg)
    expect(p.title).toBe('Cómo hacer croquetas sin lío')
    expect(p.description).toBe(COMMUNITY_GENERIC_DESCRIPTION)
    expect(p.image).toBe(`${APP}/comunidad-og.jpg`)
    expect(p.redirectUrl).toBe(`${APP}/comunidad/p/${ID}`)
  })
  it('un consejo/menú oficial dice «Una publicación de Pepa» (no «artículo»)', () => {
    const p = communityPreview({ ...OFFICIAL, kind: 'consejo' }, ID, cfg)
    expect(p.description).toContain('Una publicación de Pepa')
    expect(p.description).toContain('leerla')
  })
  it.each([
    ['publicación de una persona', { ...OFFICIAL, is_official: false }],
    ['oculta o borrada', { ...OFFICIAL, status: 'hidden' }],
    ['excluida (menores)', { ...OFFICIAL, ai_excluded: true }],
    ['sin título', { ...OFFICIAL, title: '   ' }],
    ['no existe', null],
  ])('%s: tarjeta genérica idéntica, sin título', (_n, row) => {
    const p = communityPreview(row, ID, cfg)
    expect(p.title).toBe('Comunidad PEPA')
    expect(p.description).not.toContain('croquetas')
    expect(p.image).toBe(`${APP}/comunidad-og.jpg`)
  })
  it('el caso «no existe» y el de «persona» no se distinguen', () => {
    expect(communityPreview(null, ID, cfg)).toEqual(communityPreview({ ...OFFICIAL, is_official: false }, ID, cfg))
  })
})

describe('Lista de deseos', () => {
  it('«🎁 Lista de deseos de [nombre]» con descripción breve', () => {
    const p = wishlistPreview('Lucía', TOKEN, cfg)
    expect(p.title).toBe('🎁 Lista de deseos de Lucía')
    expect(p.description).toContain('lista de deseos')
    expect(p.redirectUrl).toBe(`${APP}/?deseos=${TOKEN}`)
  })
  it('token desconocido: tarjeta genérica', () => {
    expect(wishlistPreview(null, TOKEN, cfg).title).toBe('🎁 Lista de deseos')
  })
  it('un nombre con HTML no rompe nada (se escapa al pintar)', () => {
    const html = renderPreviewHtml(wishlistPreview('<img src=x onerror=alert(1)>', TOKEN, cfg), { redirect: true })
    expect(html).not.toContain('<img')
    expect(meta(html, 'og:title')).toContain('&lt;img')
  })
})

describe('HTML de la tarjeta', () => {
  const p = communityPreview({ ...OFFICIAL, title: 'A "b" <c> & d' }, ID, { appBase: APP, selfUrl: `https://x.test/f?c=${ID}` })
  it('para bots: metas OG/Twitter, sin redirección', () => {
    const html = renderPreviewHtml(p, { redirect: false })
    expect(meta(html, 'og:title')).toBe('A &quot;b&quot; &lt;c&gt; &amp; d')
    expect(meta(html, 'og:site_name')).toBe('PEPA Family App')
    expect(meta(html, 'og:image')).toBe(`${APP}/comunidad-og.jpg`)
    expect(meta(html, 'og:url')).toBe(`https://x.test/f?c=${ID}`)
    expect(meta(html, 'twitter:card')).toBe('summary_large_image')
    expect(html).not.toContain('http-equiv="refresh"')
    expect(html).not.toContain('<script')
  })
  it('para personas: meta refresh + JS hacia la app', () => {
    const html = renderPreviewHtml(p, { redirect: true })
    expect(html).toContain(`<meta http-equiv="refresh" content="0;url=${APP}/comunidad/p/${ID}">`)
    expect(html).toContain(`location.replace("${APP}/comunidad/p/${ID}")`)
  })
  it('detecta rastreadores de mensajería', () => {
    expect(isPreviewBot('WhatsApp/2.23.20 A')).toBe(true)
    expect(isPreviewBot('facebookexternalhit/1.1')).toBe(true)
    expect(isPreviewBot('Mozilla/5.0 (Linux; Android 14) Chrome/120')).toBe(false)
    expect(isPreviewBot(null)).toBe(false)
  })
})

describe('parseShareRequest', () => {
  it('acepta c=<uuid> o d=<token de 48 hex>, nada más', () => {
    expect(parseShareRequest(new URL(`https://x/?c=${ID.toUpperCase()}`))).toEqual({ kind: 'comunidad', id: ID })
    expect(parseShareRequest(new URL(`https://x/?d=${TOKEN}`))).toEqual({ kind: 'deseos', token: TOKEN })
    for (const q of ['', 'c=abc', `c=${ID}&d=${TOKEN}`, 'd=zz', `d=${TOKEN}0`, `c=${ID}'--`, 'c=']) expect(parseShareRequest(new URL(`https://x/?${q}`))).toBeNull()
  })
})

describe('handleSharePreview (base simulada)', () => {
  it('Comunidad: UNA consulta, 200 HTML con título oficial y caché corta', async () => {
    const db = fakeDb()
    const res = await handleSharePreview(get(`c=${ID}`, 'WhatsApp/2'), db, cfg)
    const html = await res.text()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(res.headers.get('cache-control')).toBe('public, max-age=300')
    expect(res.headers.get('x-robots-tag')).toContain('noindex')
    expect(db.post).toHaveBeenCalledTimes(1)
    expect(db.wishlistOwnerName).not.toHaveBeenCalled()
    expect(meta(html, 'og:title')).toBe('Cómo hacer croquetas sin lío')
  })
  it('lista de deseos: nombre del dueño en el título', async () => {
    const db = fakeDb()
    const html = await (await handleSharePreview(get(`d=${TOKEN}`, 'facebookexternalhit/1.1'), db, cfg)).text()
    expect(meta(html, 'og:title')).toBe('🎁 Lista de deseos de Lucía')
    expect(db.wishlistOwnerName).toHaveBeenCalledWith(TOKEN)
  })
  it('parámetros inválidos: 400 sin consultar; método no GET: 405', async () => {
    const db = fakeDb()
    expect((await handleSharePreview(get('c=nope'), db, cfg)).status).toBe(400)
    expect((await handleSharePreview(new Request('https://x/?c=' + ID, { method: 'POST' }), db, cfg)).status).toBe(405)
    expect(db.post).not.toHaveBeenCalled()
  })
  it('fallo de la base: tarjeta genérica, sin caché y sin detalles del error', async () => {
    const db = fakeDb({
      post: vi.fn(async () => {
        throw new Error('secreto interno')
      }),
    })
    const res = await handleSharePreview(get(`c=${ID}`), db, cfg)
    const html = await res.text()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(html).not.toContain('secreto')
    expect(meta(html, 'og:title')).toBe('Comunidad PEPA')
  })
  it('personas (no bots) reciben la redirección; og:url sale de la dirección pública configurada', async () => {
    const html = await (await handleSharePreview(get(`d=${TOKEN}`, 'Mozilla/5.0 Chrome'), fakeDb(), { ...cfg, selfUrl: 'https://p.test/share?otro=1' })).text()
    expect(html).toContain('http-equiv="refresh"')
    expect(meta(html, 'og:url')).toBe(`https://p.test/share?d=${TOKEN}`)
  })
})

describe('mensajes de compartir', () => {
  it('lista de deseos: nombre + enlace DENTRO del texto', () => {
    const t = buildWishlistShareText('  Lucía ', 'https://x/?deseos=1')
    expect(t.startsWith('🎁 Lista de deseos de Lucía\n')).toBe(true)
    expect(t.endsWith('\nhttps://x/?deseos=1')).toBe(true)
    expect(buildWishlistShareText('', 'u')).toMatch(/^🎁 Lista de deseos\n/)
    expect(wishlistShareTitle('Lucía')).toBe('Lista de deseos de Lucía')
  })
})

describe('páginas estáticas de vista previa (gratis, en la propia web)', () => {
  it('compartir-comunidad.html: metas de marca, imagen oficial, redirige solo con un uuid válido', () => {
    expect(staticPage).toContain('property="og:site_name" content="PEPA Family App"')
    expect(staticPage).toContain('content="https://fransegura51.github.io/family-app/comunidad-og.jpg"')
    expect(staticPage).toContain('mayores de 18 años')
    expect(staticPage).toContain('[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')
    expect(staticPage).toContain("l.replace(dir + 'comunidad'")
  })
  it('index.html lleva Open Graph de marca (lo que ven los enlaces ?deseos=...)', () => {
    expect(indexHtml).toContain('property="og:site_name" content="PEPA Family App"')
    expect(indexHtml).toContain('property="og:image"')
  })
})
