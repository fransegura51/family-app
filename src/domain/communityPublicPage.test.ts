// Lectura pública de Comunidad (enlaces de WhatsApp / Google): HTML seguro, metadatos, JSON-LD, 404, sitemap y privacidad.
import { describe, expect, it } from 'vitest'
import {
  cleanText,
  escapeHtml,
  isUuid,
  jsonLdScript,
  photoUrl,
  publicPageCsp,
  renderGonePage,
  renderPostPage,
  renderRobotsTxt,
  renderSitemapXml,
  renderUnavailablePage,
  richTextToHtml,
  type PublicPageConfig,
} from '@/domain/communityPublicPage'

const config: PublicPageConfig = {
  publicBase: 'https://pepafamilyapp.es/c',
  appBase: 'https://fransegura51.github.io/family-app',
  mediaBase: 'https://abc.supabase.co/storage/v1/object/public/community-media',
}

const POST_ID = '3f2b1c9e-8a44-4d3a-9b7e-1c2d3e4f5a6b'
const PROFILE_ID = 'aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb'
const FAMILY_ID = 'ffffffff-2222-4333-8444-cccccccccccc'
const USER_ID = 'eeeeeeee-3333-4444-8555-dddddddddddd'
const COMMENT_ID = '99999999-4444-4555-8666-aaaaaaaaaaaa'

function post(extra: Record<string, unknown> = {}) {
  return {
    id: POST_ID,
    kind: 'consejo',
    section: 'hogar',
    topic_id: 'topic-internal-id',
    topic_label: 'Ahorro y economía',
    title: 'Cómo ahorrar en la compra semanal',
    body: 'Mira la **oferta** de la semana y *planifica* el menú.\n\n- Lista cerrada\n- Sin prisas\n\n1. Mira\n2. Compara\n\nMás en https://www.consumo.gob.es/guia.',
    excerpt: 'Mira la oferta',
    author_alias: 'AnaCocina',
    author_avatar: '🍅',
    author_is_official: false,
    author_deleted: false,
    is_official: false,
    official_label: null,
    article_sources: null,
    photos: [],
    recipe: null,
    like_count: 3,
    comment_count: 2,
    created_at: '2026-10-14T10:00:00Z',
    edited_at: null,
    last_activity_at: '2026-10-15T08:00:00Z',
    // Campos que NUNCA deberían llegar, pero que la página no debe pintar aunque lleguen.
    author_id: PROFILE_ID,
    family_id: FAMILY_ID,
    user_id: USER_ID,
    real_name: 'María García López',
    email: 'maria.privada@correo.com',
    ...extra,
  }
}

function render(p: unknown, comments: unknown = [], poll: unknown = null): string {
  const html = renderPostPage({ post: p, comments, poll, config })
  if (html === null) throw new Error('no se ha podido pintar')
  return html
}

function ldBlocks(html: string): Record<string, unknown>[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]) as Record<string, unknown>)
}

const meta = (html: string, key: string, attr = 'property') => new RegExp(`<meta ${attr}="${key}" content="([^"]*)">`).exec(html)?.[1]

describe('escape y utilidades', () => {
  it('escapa los cinco caracteres peligrosos y el acento grave', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&\``)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&#96;')
  })

  it('el JSON-LD no puede cerrar la etiqueta ni abrir comentarios y sigue siendo JSON válido', () => {
    const script = jsonLdScript({ t: '</script><script>alert(1)</script><!-- &    ' })
    expect(script.match(/<\/script>/g)).toHaveLength(1)
    expect(script).not.toContain('<script>alert')
    const json = /<script type="application\/ld\+json">([\s\S]*)<\/script>/.exec(script)![1]
    expect((JSON.parse(json) as { t: string }).t).toBe('</script><script>alert(1)</script><!-- &    ')
  })

  it('tapa correos y quita caracteres de control', () => {
    expect(cleanText('Escríbeme a ana@correo.com\u0000 por favor')).toBe('Escríbeme a [correo oculto] por favor')
    expect(cleanText(123)).toBe('')
  })

  it('reconoce uuids', () => {
    expect(isUuid(POST_ID)).toBe(true)
    expect(isUuid('no-es-un-uuid')).toBe(false)
    expect(isUuid(`${POST_ID}'--`)).toBe(false)
    expect(isUuid(null)).toBe(false)
  })

  it('fotos: solo rutas normales del almacenamiento público', () => {
    expect(photoUrl('perfil/abc-123.jpg', config)).toBe('https://abc.supabase.co/storage/v1/object/public/community-media/perfil/abc-123.jpg')
    for (const bad of ['../secreto.jpg', 'a//b.jpg', '/etc/passwd', 'a b.jpg', 'a.jpg"onload="x', 'javascript:alert(1)', '', null, 5]) {
      expect(photoUrl(bad, config), String(bad)).toBeNull()
    }
  })
})

describe('texto enriquecido → HTML seguro', () => {
  it('convierte el formato y escapa lo demás', () => {
    const html = richTextToHtml('**negrita** y *cursiva* <b>no</b>\n\n- uno\n- dos\n\n1. a\n2. b')
    expect(html).toContain('<strong>negrita</strong>')
    expect(html).toContain('<em>cursiva</em>')
    expect(html).toContain('&lt;b&gt;no&lt;/b&gt;')
    expect(html).toContain('<ul><li>uno</li><li>dos</li></ul>')
    expect(html).toContain('<ol><li>a</li><li>b</li></ol>')
    expect(html).not.toContain('<b>')
  })

  it('enlaces externos: rel completo, aviso de sitio externo y aviso de acortador', () => {
    const html = richTextToHtml('Mira [la guía](https://www.consumo.gob.es/guia) y https://bit.ly/abc123')
    expect(html).toContain('href="https://www.consumo.gob.es/guia"')
    expect(html.match(/rel="noopener noreferrer nofollow ugc"/g)).toHaveLength(2)
    expect(html).toContain('sitio externo: consumo.gob.es')
    expect(html).toContain('enlace acortado')
  })

  it('NO crea enlaces con javascript:, data:, direcciones IP ni credenciales', () => {
    const html = richTextToHtml(
      ['[click](javascript:alert(1))', '[x](data:text/html;base64,AAAA)', '[ip](http://192.168.1.1/admin)', '[u](https://user:pass@sitio.com)', 'javascript:alert(2)'].join('\n\n'),
    )
    expect(html).not.toContain('<a ')
    expect(html).not.toContain('href=')
  })

  it('un enlace con comillas en la dirección no puede salirse del atributo', () => {
    const html = richTextToHtml('[x](https://sitio.com/a"onmouseover="alert(1))')
    // La URL se normaliza (las comillas quedan como %22) y, en cualquier caso, el atributo va escapado.
    const tag = /<a [^>]*>/.exec(html)![0]
    expect(tag).toMatch(/^<a href="[^"]*" rel="noopener noreferrer nofollow ugc" target="_blank">$/)
    expect(tag.match(/"/g)).toHaveLength(6)
  })
})

describe('página de una publicación', () => {
  it('metadatos: title, description, canonical, robots, Open Graph y Twitter', () => {
    const html = render(post())
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<html lang="es">')
    expect(html).toContain('<title>Cómo ahorrar en la compra semanal | Comunidad PEPA</title>')
    expect(html).toContain(`<link rel="canonical" href="https://pepafamilyapp.es/c/p/${POST_ID}">`)
    expect(html).toContain('<meta name="robots" content="index,follow,max-image-preview:large">')
    expect(meta(html, 'description', 'name')).toMatch(/^Mira la oferta de la semana y planifica el menú\./)
    expect(meta(html, 'description', 'name')!.length).toBeLessThanOrEqual(156)
    expect(meta(html, 'og:type')).toBe('article')
    expect(meta(html, 'og:title')).toBe('Cómo ahorrar en la compra semanal')
    expect(meta(html, 'og:url')).toBe(`https://pepafamilyapp.es/c/p/${POST_ID}`)
    expect(meta(html, 'og:site_name')).toBe('Comunidad PEPA')
    expect(meta(html, 'og:image')).toBe('https://fransegura51.github.io/family-app/comunidad-og.jpg')
    expect(meta(html, 'article:published_time')).toBe('2026-10-14T10:00:00.000Z')
    expect(meta(html, 'twitter:card', 'name')).toBe('summary')
    expect(meta(html, 'twitter:title', 'name')).toBe('Cómo ahorrar en la compra semanal')
  })

  it('la imagen de la vista previa es la primera foto; las fotos usan la dirección pública del almacenamiento', () => {
    const html = render(
      post({
        photos: [
          { path: 'perfil/segunda.jpg', position: 2 },
          { path: 'perfil/primera.jpg', position: 1 },
          { path: '../robada.jpg', position: 3 },
        ],
      }),
    )
    expect(meta(html, 'og:image')).toBe('https://abc.supabase.co/storage/v1/object/public/community-media/perfil/primera.jpg')
    expect(meta(html, 'twitter:card', 'name')).toBe('summary_large_image')
    expect(html.match(/<img /g)).toHaveLength(2)
    expect(html).not.toContain('robada')
    expect(html.indexOf('primera.jpg')).toBeLessThan(html.indexOf('segunda.jpg'))
    expect(html).toContain('alt="Foto 1 de 2:')
  })

  it('usa la imagen por defecto configurada', () => {
    const html = renderPostPage({ post: post(), config: { ...config, defaultImage: 'https://pepafamilyapp.es/og/comunidad.jpg' } })!
    expect(meta(html, 'og:image')).toBe('https://pepafamilyapp.es/og/comunidad.jpg')
  })

  it('cabecera visible: tipo, tema, alias con avatar, fecha, contadores, botones y aviso de solo lectura', () => {
    const html = render(post({ edited_at: '2026-10-15T09:00:00Z' }))
    expect(html).toContain('<h1>Cómo ahorrar en la compra semanal</h1>')
    expect(html).toContain('💡 Consejo')
    expect(html).toContain('Ahorro y economía')
    expect(html).toContain('<strong>AnaCocina</strong>')
    expect(html).toContain('🍅')
    expect(html).toContain('14 de octubre de 2026')
    expect(html).toContain('Editado')
    expect(html).toContain('3 me gusta')
    expect(html).toContain('2 comentarios')
    expect(html).toContain('Puedes leer esta publicación sin registrarte')
    expect(html).toContain(`href="https://fransegura51.github.io/family-app/comunidad/p/${POST_ID}">Abrir en la aplicación</a>`)
    expect(html).toContain(`href="https://fransegura51.github.io/family-app/comunidad/p/${POST_ID}">Regístrate para participar</a>`)
    expect(html).toContain('<nav class="crumbs" aria-label="Ruta de navegación">')
    expect(html).toContain('Hogar y familia')
    expect(html).toContain('<a class="skip" href="#contenido">')
    expect(html).toContain('<meta name="viewport" content="width=device-width,initial-scale=1">')
  })

  it('no lleva ningún script ejecutable (solo los dos bloques de datos JSON-LD)', () => {
    const html = render(post())
    const scripts = html.match(/<script\b[^>]*>/g) ?? []
    expect(scripts).toHaveLength(2)
    for (const s of scripts) expect(s).toBe('<script type="application/ld+json">')
    expect(html).not.toMatch(/\son[a-z]+=/i)
  })

  it('XSS: título, texto, alias, tema, etiquetas y comentarios quedan como texto', () => {
    const evil = '<img src=x onerror=alert(1)>'
    const html = render(
      post({
        title: `${evil}</title><script>alert(1)</script>`,
        topic_label: `"><svg onload=alert(2)>`,
        author_alias: `<script>alert(3)</script>`,
        author_avatar: '<b>',
        body: `${evil}\n\n[x](javascript:alert(4))\n\n**<script>alert(5)</script>**`,
        official_label: '<u>oficial</u>',
        is_official: true,
      }),
      [{ body: evil, author_alias: '"><script>alert(6)</script>', created_at: '2026-10-14T11:00:00Z', like_count: 0, replies: [{ body: evil, author_alias: evil }] }],
    )
    expect(html).not.toContain('<script>alert')
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<svg')
    expect(html).not.toContain('<u>oficial')
    expect(html).not.toContain('javascript:')
    expect(html).not.toMatch(/<a [^>]*href="javascript/i)
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    // Solo hay un <title> y dos bloques JSON-LD: nada se ha podido cerrar antes de tiempo.
    expect(html.match(/<title>/g)).toHaveLength(1)
    expect(html.match(/<script\b/g)).toHaveLength(2)
    // El alias con HTML se muestra escrito, y el avatar con HTML se descarta.
    expect(html).toContain('&lt;script&gt;alert(3)&lt;/script&gt;')
    expect(html).not.toContain('<b></span>')
    // Los bloques JSON-LD siguen siendo JSON válido.
    const blocks = ldBlocks(html)
    expect(blocks).toHaveLength(2)
    expect(JSON.stringify(blocks)).toContain('alert(1)')
  })

  it('nada privado: ni ids de personas o familias, ni nombres reales, ni correos, ni el id interno del tema', () => {
    const html = render(
      post({ body: 'Escríbeme a maria.privada@correo.com si quieres la receta.' }),
      [{ id: COMMENT_ID, author_id: PROFILE_ID, family_id: FAMILY_ID, real_name: 'María García', body: 'Gracias', author_alias: 'Pepe', replies: [] }],
    )
    for (const secret of [PROFILE_ID, FAMILY_ID, USER_ID, COMMENT_ID, 'María García', 'maria.privada@correo.com', 'topic-internal-id']) {
      expect(html, secret).not.toContain(secret)
    }
    expect(html).toContain('[correo oculto]')
    // El único identificador visible es el de la propia publicación (va en su enlace público).
    const uuids = new Set(html.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi))
    expect([...uuids]).toEqual([POST_ID])
  })

  it('un alias que es un correo se cambia por «Usuario»; el autor eliminado sale como tal', () => {
    expect(render(post({ author_alias: 'ana@correo.com' }))).toContain('<strong>Usuario</strong>')
    const deleted = render(post({ author_alias: 'AnaCocina', author_avatar: '🍅', author_deleted: true }))
    expect(deleted).toContain('Usuario eliminado')
    expect(deleted).not.toContain('AnaCocina')
    expect(deleted).not.toContain('🍅')
  })

  it('devuelve null con datos que no son una publicación', () => {
    expect(renderPostPage({ post: null, config })).toBeNull()
    expect(renderPostPage({ post: {}, config })).toBeNull()
    expect(renderPostPage({ post: post({ id: 'x"><script>' }), config })).toBeNull()
    expect(renderPostPage({ post: post({ title: '   ' }), config })).toBeNull()
  })

  it('comentarios con respuestas agrupadas y un comentario eliminado con respuestas sin contenido', () => {
    const html = render(post(), [
      {
        body: 'Buen consejo',
        author_alias: 'Luis',
        author_avatar: '🥕',
        created_at: '2026-10-14T12:00:00Z',
        like_count: 2,
        replies: [{ body: 'De nada', author_alias: 'AnaCocina', created_at: '2026-10-14T13:00:00Z', like_count: 0 }],
      },
      { removed: true, body: 'TEXTO SECRETO RETIRADO', replies: [{ body: 'Yo opino igual', author_alias: 'Marta' }] },
    ])
    expect(html).toContain('<ul class="comments">')
    expect(html).toContain('Buen consejo')
    expect(html).toContain('<ul class="replies"><li>')
    expect(html.indexOf('Buen consejo')).toBeLessThan(html.indexOf('De nada'))
    expect(html).toContain('Este comentario ya no está disponible.')
    expect(html).not.toContain('TEXTO SECRETO RETIRADO')
    expect(html).toContain('Yo opino igual')
    expect(html).toContain('2 me gusta')
  })

  it('las respuestas de respuestas no se pintan (un solo nivel, como en la app)', () => {
    const html = render(post(), [{ body: 'raíz', author_alias: 'A', replies: [{ body: 'hija', author_alias: 'B', replies: [{ body: 'NIETA', author_alias: 'C' }] }] }])
    expect(html).toContain('hija')
    expect(html).not.toContain('NIETA')
  })

  it('sin comentarios muestra un mensaje amable', () => {
    expect(render(post({ comment_count: 0 }))).toContain('Todavía no hay comentarios.')
  })

  it('el HTML está equilibrado (listas y secciones cierran)', () => {
    const html = render(post(), [{ body: 'x', author_alias: 'A', replies: [{ body: 'y', author_alias: 'B' }] }])
    for (const tag of ['ul', 'ol', 'li', 'section', 'article', 'main', 'p', 'nav', 'header', 'footer']) {
      const open = (html.match(new RegExp(`<${tag}[\\s>]`, 'g')) ?? []).length
      const close = (html.match(new RegExp(`</${tag}>`, 'g')) ?? []).length
      expect(open, tag).toBe(close)
    }
  })
})

describe('JSON-LD por tipo', () => {
  const recipePost = () =>
    post({
      kind: 'receta',
      section: 'recetas',
      title: 'Tortilla de patatas',
      body: 'La de siempre, jugosa.',
      photos: [{ path: 'p/tortilla.jpg', position: 1 }],
      recipe: {
        title: 'Tortilla de patatas',
        servings: 4,
        ingredients: [
          { name: 'Patatas', quantity: '600', unit: 'g' },
          { name: 'Huevos', quantity: '6', unit: '' },
        ],
        steps: '1. Pela y corta las patatas.\n2. Fríelas a fuego suave.\n3. Cuaja con el huevo.',
        tags: ['clásico', 'huevo'],
        version: 2,
        avg_rating: 4.5,
        rating_count: 12,
      },
    })

  it('receta → Recipe con ingredientes, pasos, raciones y valoración', () => {
    const html = render(recipePost())
    const recipe = ldBlocks(html)[0] as Record<string, unknown>
    expect(recipe['@type']).toBe('Recipe')
    expect(recipe.name).toBe('Tortilla de patatas')
    expect(recipe.recipeIngredient).toEqual(['600 g Patatas', '6 Huevos'])
    expect((recipe.recipeInstructions as { text: string }[]).map((s) => s.text)).toEqual(['Pela y corta las patatas.', 'Fríelas a fuego suave.', 'Cuaja con el huevo.'])
    expect(recipe.recipeYield).toBe('4 raciones')
    expect(recipe.aggregateRating).toMatchObject({ ratingValue: 4.5, ratingCount: 12 })
    expect(recipe.author).toEqual({ '@type': 'Person', name: 'AnaCocina' })
    expect(recipe.image).toEqual(['https://abc.supabase.co/storage/v1/object/public/community-media/p/tortilla.jpg'])
    expect(html).toContain('<h2 id="ingredientes">Ingredientes</h2>')
    expect(html).toContain('<li>600 g Patatas</li>')
    expect(html).toContain('<ol><li>Pela y corta las patatas.</li>')
    expect(html).toContain('Para 4 personas')
    expect(html).toContain('4,5 de 5 (12 valoraciones)')
  })

  it('receta sin valoraciones no inventa aggregateRating', () => {
    const p = recipePost()
    ;(p.recipe as unknown as { rating_count: number }).rating_count = 0
    expect(ldBlocks(render(p))[0].aggregateRating).toBeUndefined()
  })

  it('pregunta → QAPage/Question con respuestas', () => {
    const html = render(post({ kind: 'pregunta', title: '¿Cómo quito una mancha de vino?', body: 'Ha caído en el mantel.' }), [
      { body: 'Sal y agua fría.', author_alias: 'Luis', created_at: '2026-10-14T12:00:00Z', like_count: 4, replies: [] },
      { removed: true, replies: [] },
    ])
    const qa = ldBlocks(html)[0] as { '@type': string; mainEntity: Record<string, unknown> }
    expect(qa['@type']).toBe('QAPage')
    expect(qa.mainEntity['@type']).toBe('Question')
    expect(qa.mainEntity.name).toBe('¿Cómo quito una mancha de vino?')
    expect(qa.mainEntity.answerCount).toBe(1)
    expect((qa.mainEntity.suggestedAnswer as { text: string; upvoteCount: number }[])[0]).toMatchObject({ text: 'Sal y agua fría.', upvoteCount: 4 })
    expect(html).toContain('❓ Pregunta')
  })

  it('pregunta sin respuestas: answerCount 0 y sin suggestedAnswer', () => {
    const qa = ldBlocks(render(post({ kind: 'pregunta' }), []))[0] as { mainEntity: Record<string, unknown> }
    expect(qa.mainEntity.answerCount).toBe(0)
    expect(qa.mainEntity.suggestedAnswer).toBeUndefined()
  })

  it('artículo → Article con fuentes (enlaces externos con rel) y autor oficial como organización', () => {
    const html = render(
      post({
        kind: 'articulo',
        is_official: true,
        official_label: 'Artículo de Equipo PEPA',
        author_alias: 'Equipo PEPA',
        author_is_official: true,
        article_sources: { sources: [{ title: 'Guía de consumo', publisher: 'Gobierno de España', url: 'https://www.consumo.gob.es/guia', date: '2026-01-10' }, { title: 'Sin enlace', publisher: 'INE', url: 'javascript:alert(1)' }], methodology: 'x' },
      }),
    )
    const article = ldBlocks(html)[0] as Record<string, unknown>
    expect(article['@type']).toBe('Article')
    expect(article.author).toEqual({ '@type': 'Organization', name: 'Equipo PEPA' })
    expect((article.citation as { url?: string }[])[0].url).toBe('https://www.consumo.gob.es/guia')
    expect((article.citation as { url?: string }[])[1].url).toBeUndefined()
    expect(html).toContain('<h2 id="fuentes">Fuentes</h2>')
    expect(html).toContain('href="https://www.consumo.gob.es/guia" rel="noopener noreferrer nofollow ugc"')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('Artículo de Equipo PEPA')
  })

  it('consejo y anécdota → DiscussionForumPosting con contadores y comentarios', () => {
    for (const kind of ['consejo', 'anecdota']) {
      const ld = ldBlocks(render(post({ kind }), [{ body: 'Genial', author_alias: 'Luis', replies: [] }]))[0] as Record<string, unknown>
      expect(ld['@type']).toBe('DiscussionForumPosting')
      expect(ld.headline).toBe('Cómo ahorrar en la compra semanal')
      expect(ld.commentCount).toBe(2)
      expect((ld.comment as { text: string }[])[0].text).toBe('Genial')
      expect(ld.datePublished).toBe('2026-10-14T10:00:00.000Z')
      expect(ld.dateModified).toBe('2026-10-15T08:00:00.000Z')
    }
  })

  it('el segundo bloque es el de migas de pan y todo el JSON-LD es parseable', () => {
    const blocks = ldBlocks(render(post()))
    expect(blocks[1]['@type']).toBe('BreadcrumbList')
    for (const b of blocks) expect(b['@context']).toBe('https://schema.org')
  })
})

describe('encuesta', () => {
  const pollPost = () => post({ kind: 'encuesta', is_official: true, official_label: 'Encuesta de Equipo PEPA', author_alias: 'Equipo PEPA', author_is_official: true, title: '¿Qué cenáis los viernes?', body: 'Cuéntanos.' })

  it('cerrada: muestra los resultados finales con porcentajes', () => {
    const html = render(pollPost(), [], { question: '¿Qué cenáis los viernes?', options: ['Pizza', 'Tortilla', 'Ensalada'], closes_at: '2026-10-18T15:00:00Z', status: 'closed', final: true, counts: [6, 3, 1], total_votes: 10 })
    expect(html).toContain('Encuesta cerrada')
    expect(html).toContain('Resultados finales con 10 votos')
    expect(html).toContain('60 %')
    expect(html).toContain('30 %')
    expect(html).toContain('(6 votos)')
    expect(html).toContain('width:60%')
    expect(html).toContain('📊 Encuesta')
  })

  it('abierta: sin resultados ni votos parciales', () => {
    const html = render(pollPost(), [], { question: 'Q', options: ['A', 'B'], closes_at: '2026-10-18T15:00:00Z', status: 'open', final: false, counts: null, total_votes: null })
    expect(html).toContain('Los resultados se enseñan cuando cierre la encuesta')
    expect(html).not.toContain('Resultados finales')
    expect(html).not.toContain('class="bar"')
    expect(html).not.toContain('voto')
  })

  it('escapa opciones y pregunta', () => {
    const html = render(pollPost(), [], { question: '<script>x</script>', options: ['<b>A</b>', 'B'], status: 'closed', final: true, counts: [1, 1], total_votes: 2 })
    expect(html).not.toContain('<script>x')
    expect(html).not.toContain('<b>A')
  })

  it('datos de encuesta incoherentes: no se pinta nada a medias', () => {
    expect(render(pollPost(), [], { question: 'Q', options: ['solo una'] })).not.toContain('id="encuesta"')
    expect(render(pollPost(), [], null)).not.toContain('id="encuesta"')
  })
})

describe('no disponible (404/410)', () => {
  it('noindex, sin datos del contenido y con salida a la aplicación', () => {
    const html = renderGonePage(config)
    expect(html).toContain('<meta name="robots" content="noindex,nofollow">')
    expect(html).not.toContain('index,follow')
    expect(html).not.toContain('rel="canonical"')
    expect(html).toContain('Esta publicación ya no está disponible')
    expect(html).not.toContain('application/ld+json')
    expect(html).not.toContain('og:image')
    expect(html).not.toMatch(/<script\b/)
    expect(html).toContain('href="https://fransegura51.github.io/family-app/comunidad"')
  })

  it('la página de fallo temporal tampoco se indexa', () => {
    const html = renderUnavailablePage(config)
    expect(html).toContain('noindex,nofollow')
    expect(html).toContain('Vuelve a intentarlo')
  })
})

describe('sitemap.xml y robots.txt', () => {
  const ID2 = '11111111-2222-4333-8444-555555555555'

  it('lista las publicaciones con lastmod y está bien formado', () => {
    const xml = renderSitemapXml(
      [
        { id: POST_ID, title: 'no se usa', updated_at: '2026-10-14T10:00:00Z', last_activity_at: '2026-10-15T08:00:00Z' },
        { id: ID2.toUpperCase(), updated_at: '2026-09-01T10:00:00Z' },
        { id: POST_ID },
      ],
      config,
    )
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')).toBe(true)
    expect(xml.trimEnd().endsWith('</urlset>')).toBe(true)
    expect(xml).toContain(`<loc>https://pepafamilyapp.es/c/p/${POST_ID}</loc><lastmod>2026-10-15T08:00:00.000Z</lastmod>`)
    expect(xml).toContain(`<loc>https://pepafamilyapp.es/c/p/${ID2}</loc><lastmod>2026-09-01T10:00:00.000Z</lastmod>`)
    // Repetidos fuera, y los títulos nunca van en el mapa.
    expect(xml.match(/<url>/g)).toHaveLength(2)
    expect(xml).not.toContain('no se usa')
    expect(xml.match(/<url>/g)!.length).toBe(xml.match(/<\/url>/g)!.length)
  })

  it('descarta ids que no son uuid (nada de inyección en el XML) y tolera entradas raras', () => {
    const xml = renderSitemapXml([{ id: `x</loc><evil/>` }, { id: 5 }, null, 'texto', { id: POST_ID, updated_at: 'no es fecha' }], config)
    expect(xml).not.toContain('<evil/>')
    expect(xml.match(/<url>/g)).toHaveLength(1)
    expect(xml).not.toContain('<lastmod>')
    expect(renderSitemapXml(undefined, config)).toBe('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n')
  })

  it('robots.txt permite rastrear y apunta al sitemap', () => {
    expect(renderRobotsTxt(config)).toBe('User-agent: *\nAllow: /\n\nSitemap: https://pepafamilyapp.es/c/sitemap.xml\n')
  })
})

describe('política de seguridad de contenido', () => {
  it('sin scripts, sin marcos, solo imágenes propias', () => {
    const csp = publicPageCsp(config)
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("script-src 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("img-src 'self' https://abc.supabase.co https://fransegura51.github.io")
    expect(csp).not.toContain('unsafe-eval')
    expect(csp).not.toMatch(/script-src[^;]*unsafe/)
  })
})
