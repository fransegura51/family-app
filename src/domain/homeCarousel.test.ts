import { beforeEach, describe, expect, it } from 'vitest'
import type { CommunityCardItem, PostCard } from '@/domain/community'
import { carouselSlideOrder, communityCarouselLines, pickCarouselPhotos, showEmptyGalleryCard, toggleFixedPhoto } from '@/domain/homeCarousel'
import { DEFAULT_HOME_CAROUSEL_PREFS, loadHomeCarouselPrefs, sanitizeHomeCarouselPrefs, saveHomeCarouselPrefs, type HomeCarouselPrefs } from '@/state/homeCarouselPrefs'

const prefs = (change: Partial<HomeCarouselPrefs> = {}): HomeCarouselPrefs => ({ ...DEFAULT_HOME_CAROUSEL_PREFS, fixedPhotoIds: [], ...change })
const photos = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` }))
const seeded = (seed: number) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('orden del carrusel de Inicio', () => {
  it('ORDEN OBLIGATORIO: Lista de la compra, Calendario, Comunidad PEPA y las fotografías al final', () => {
    expect(carouselSlideOrder(prefs(), true)).toEqual(['compra', 'agenda', 'comunidad', 'fotos'])
  })

  it('cada diapositiva se activa y desactiva por separado y Comunidad solo sale si Comunidad está abierta para la persona', () => {
    expect(carouselSlideOrder(prefs(), false)).toEqual(['compra', 'agenda', 'fotos'])
    expect(carouselSlideOrder(prefs({ shopping: false }), true)).toEqual(['agenda', 'comunidad', 'fotos'])
    expect(carouselSlideOrder(prefs({ calendar: false }), true)).toEqual(['compra', 'comunidad', 'fotos'])
    expect(carouselSlideOrder(prefs({ community: false }), true)).toEqual(['compra', 'agenda', 'fotos'])
    expect(carouselSlideOrder(prefs({ photos: false }), true)).toEqual(['compra', 'agenda', 'comunidad'])
    expect(carouselSlideOrder(prefs({ shopping: false, calendar: false, community: false, photos: false }), true)).toEqual([])
  })

  it('con el carrusel entero apagado no sale nada, y al volver a activarlo recupera sus piezas como estaban', () => {
    const off = prefs({ enabled: false, calendar: false })
    expect(carouselSlideOrder(off, true)).toEqual([])
    expect(carouselSlideOrder({ ...off, enabled: true }, true)).toEqual(['compra', 'comunidad', 'fotos'])
  })
})

describe('fotografías del carrusel (solo de la Galería PEPA, hasta 5)', () => {
  it('al azar: nunca más de 5, sin repetir y siempre de la Galería', () => {
    const all = photos(20)
    for (let seed = 1; seed < 40; seed++) {
      const picked = pickCarouselPhotos(all, prefs({ photoMode: 'random' }), seeded(seed))
      expect(picked).toHaveLength(5)
      expect(new Set(picked.map((p) => p.id)).size).toBe(5)
      picked.forEach((p) => expect(all.map((x) => x.id)).toContain(p.id))
    }
    expect(pickCarouselPhotos(photos(3), prefs(), seeded(1))).toHaveLength(3)
  })

  it('al azar cambia de una apertura a otra (no siempre las mismas)', () => {
    const all = photos(20)
    const sets = new Set<string>()
    for (let seed = 1; seed < 20; seed++) sets.add(pickCarouselPhotos(all, prefs(), seeded(seed)).map((p) => p.id).join(','))
    expect(sets.size).toBeGreaterThan(5)
  })

  it('fijas: salen las elegidas y en el orden elegido; las que ya no existen se ignoran', () => {
    const all = photos(10)
    const picked = pickCarouselPhotos(all, prefs({ photoMode: 'fixed', fixedPhotoIds: ['p7', 'borrada', 'p2', 'p9'] }))
    expect(picked.map((p) => p.id)).toEqual(['p7', 'p2', 'p9'])
  })

  it('fijas sin ninguna válida: se enseñan al azar (no se deja el hueco vacío)', () => {
    const picked = pickCarouselPhotos(photos(8), prefs({ photoMode: 'fixed', fixedPhotoIds: ['x', 'y'] }), seeded(3))
    expect(picked).toHaveLength(5)
  })

  it('con las fotos desactivadas o la Galería vacía no sale ninguna', () => {
    expect(pickCarouselPhotos(photos(10), prefs({ photos: false }))).toEqual([])
    expect(pickCarouselPhotos([], prefs())).toEqual([])
  })

  it('elegir fijas: máximo 5 (la sexta no entra hasta quitar una) y se puede quitar', () => {
    let ids: string[] = []
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) ids = toggleFixedPhoto(ids, id)
    expect(ids).toEqual(['a', 'b', 'c', 'd', 'e'])
    ids = toggleFixedPhoto(ids, 'c')
    expect(ids).toEqual(['a', 'b', 'd', 'e'])
    expect(toggleFixedPhoto(ids, 'f')).toEqual(['a', 'b', 'd', 'e', 'f'])
  })
})

describe('familias sin fotografías', () => {
  it('sale la tarjeta informativa mientras la Galería está vacía y desaparece con la primera foto', () => {
    expect(showEmptyGalleryCard(prefs(), 0)).toBe(true)
    expect(showEmptyGalleryCard(prefs(), 1)).toBe(false)
  })

  it('no sale si las fotos o el carrusel están desactivados', () => {
    expect(showEmptyGalleryCard(prefs({ photos: false }), 0)).toBe(false)
    expect(showEmptyGalleryCard(prefs({ enabled: false }), 0)).toBe(false)
  })

  it('con la Galería vacía siguen saliendo las tres tarjetas útiles', () => {
    expect(carouselSlideOrder(prefs(), true).slice(0, 3)).toEqual(['compra', 'agenda', 'comunidad'])
    expect(pickCarouselPhotos([], prefs())).toEqual([])
  })
})

const card = (n: number, change: Partial<PostCard> = {}): PostCard =>
  ({
    id: `post-${n}`,
    kind: 'consejo',
    section: 'recetas',
    topicId: 't',
    topicLabel: `Tema ${n}`,
    title: `Publicación ${n}`,
    excerpt: '',
    authorId: 'a',
    authorAlias: 'Pepa',
    authorAvatar: null,
    authorIsOfficial: true,
    authorDeleted: false,
    isOfficial: true,
    officialLabel: null,
    featured: false,
    thumbPath: null,
    likeCount: 0,
    commentCount: 0,
    saveCount: 0,
    avgRating: null,
    ratingCount: 0,
    importCount: 0,
    createdAt: '2026-10-17T00:00:00Z',
    editedAt: null,
    lastActivityAt: '2026-10-17T00:00:00Z',
    unanswered: false,
    likedByMe: false,
    savedByMe: false,
    canInteract: true,
    ...change,
  }) as PostCard

describe('diapositiva de Comunidad: selección personalizada de hasta tres publicaciones reales', () => {
  const none = { news: [], commentedPostIds: [] }

  it('primero las no leídas, de la más reciente a la más antigua (el orden lo da el servidor), hasta tres', () => {
    const lines = communityCarouselLines({
      unreadFirst: [card(1, { readState: null }), card(2, { readState: null }), card(3, { readState: null }), card(4, { readState: null }), card(5, { readState: 'read' })],
      ...none,
    })
    expect(lines.map((l) => l.id)).toEqual(['post-1', 'post-2', 'post-3'])
    expect(lines[0].icon).toBe('🆕')
    expect(lines[0].meta).toContain('Sin leer')
  })

  it('una publicación actualizada tras leerla cuenta como pendiente y lo dice', () => {
    const lines = communityCarouselLines({ unreadFirst: [card(1, { readState: 'updated' }), card(2, { readState: 'read' })], ...none })
    expect(lines[0]).toMatchObject({ id: 'post-1', meta: 'Actualizada desde que la leíste' })
  })

  it('después de lo no leído, las conversaciones con respuestas nuevas', () => {
    const lines = communityCarouselLines({
      unreadFirst: [card(1, { readState: null }), card(2, { readState: 'read' }), card(3, { readState: 'read' })],
      news: [{ postId: 'post-9', title: 'Mi receta', count: 2 }, { postId: 'post-3', title: 'Otra', count: 1 }],
      commentedPostIds: [],
    })
    expect(lines.map((l) => l.id)).toEqual(['post-1', 'post-9', 'post-3'])
    expect(lines[1]).toMatchObject({ icon: '💬', meta: '2 respuestas nuevas' })
    expect(lines[2].meta).toBe('1 respuesta nueva')
  })

  it('si no hay suficientes pendientes, completa con donde ha comentado o dado «Me gusta», y luego con lo reciente', () => {
    const lines = communityCarouselLines({
      unreadFirst: [card(1, { readState: null }), card(2, { readState: 'read' }), card(3, { readState: 'read', likedByMe: true }), card(4, { readState: 'read' })],
      news: [],
      commentedPostIds: ['post-4'],
    })
    // 1 sin leer; después, por orden del servidor, la que me gustó (3) y en la que comenté (4) antes que la reciente (2).
    expect(lines.map((l) => l.id)).toEqual(['post-1', 'post-3', 'post-4'])
    expect(lines.map((l) => l.meta)).toEqual(['Sin leer · Tema 1', 'Te gustó', 'Has participado en esta conversación'])
    const filler = communityCarouselLines({ unreadFirst: [card(2, { readState: 'read' }), card(4, { readState: 'read' })], ...none })
    expect(filler.map((l) => l.id)).toEqual(['post-2', 'post-4'])
    expect(filler[0].icon).toBe('📰')
  })

  it('no se repite ninguna publicación y no hay huecos si existen publicaciones', () => {
    const lines = communityCarouselLines({
      unreadFirst: [card(1, { readState: null, likedByMe: true }), card(2, { readState: 'read' }), card(3, { readState: 'read' })],
      news: [{ postId: 'post-1', title: 'Repetida', count: 3 }],
      commentedPostIds: ['post-1', 'post-2'],
    })
    const ids = lines.map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(['post-1', 'post-2', 'post-3'])
  })

  it('con menos de tres publicaciones se enseñan las que haya; sin ninguna, nada', () => {
    expect(communityCarouselLines({ unreadFirst: [card(1, { readState: 'read' })], ...none }).map((l) => l.id)).toEqual(['post-1'])
    expect(communityCarouselLines({ unreadFirst: [], ...none })).toEqual([])
  })

  it('las publicaciones de personas bloqueadas no se enseñan (ni siquiera por una novedad) y el máximo es 3', () => {
    const blocked: CommunityCardItem = { blockedByMe: true, id: 'b1', authorId: 'x' }
    const lines = communityCarouselLines({
      unreadFirst: [blocked, card(1, { readState: null }), card(2, { readState: null }), card(3, { readState: null }), card(4, { readState: null })],
      news: [{ postId: 'b1', title: 'De una persona bloqueada', count: 4 }],
      commentedPostIds: [],
    })
    expect(lines.map((l) => l.id)).not.toContain('b1')
    expect(lines.length).toBe(3)
  })

  it('la selección sigue la relevancia real, no el azar: la misma entrada da siempre la misma salida', () => {
    const src = { unreadFirst: [card(1, { readState: 'read' }), card(2, { readState: null }), card(3, { readState: 'read' })], ...none }
    expect(communityCarouselLines(src)).toEqual(communityCarouselLines(src))
  })

  it('al abrir la primera pendiente, la siguiente visita a Inicio ya no la repite entre las pendientes', () => {
    const before = communityCarouselLines({ unreadFirst: [card(1, { readState: null }), card(2, { readState: null }), card(3, { readState: 'read' })], ...none })
    expect(before.map((l) => l.id)).toEqual(['post-1', 'post-2', 'post-3'])
    const after = communityCarouselLines({ unreadFirst: [card(2, { readState: null }), card(1, { readState: 'read' }), card(3, { readState: 'read' })], ...none })
    expect(after[0]).toMatchObject({ id: 'post-2', icon: '🆕' })
    expect(after[1]).toMatchObject({ id: 'post-1', icon: '📰' })
  })
})

describe('configuración guardada del carrusel', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    ;(globalThis as { localStorage?: Storage }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    } as Storage
  })

  it('por defecto todo activado y fotos al azar', () => {
    const p = loadHomeCarouselPrefs()
    expect(p).toMatchObject({ enabled: true, shopping: true, calendar: true, community: true, photos: true, photoMode: 'random', fixedPhotoIds: [] })
  })

  it('guarda y recupera lo elegido (carrusel oculto y fotos fijas incluidos)', () => {
    saveHomeCarouselPrefs(prefs({ enabled: false, community: false, photoMode: 'fixed', fixedPhotoIds: ['a', 'b'] }))
    expect(loadHomeCarouselPrefs()).toMatchObject({ enabled: false, community: false, photoMode: 'fixed', fixedPhotoIds: ['a', 'b'] })
    saveHomeCarouselPrefs({ ...loadHomeCarouselPrefs(), enabled: true })
    expect(loadHomeCarouselPrefs().enabled).toBe(true)
  })

  it('lo corrupto o antiguo se completa con los valores por defecto y nunca pasa de 5 fotos fijas', () => {
    expect(sanitizeHomeCarouselPrefs('basura')).toMatchObject({ enabled: true })
    expect(sanitizeHomeCarouselPrefs({ enabled: 'si', photoMode: 'otro', fixedPhotoIds: ['a', 'a', 1, 'b', 'c', 'd', 'e', 'f', 'g'] })).toMatchObject({
      enabled: true,
      photoMode: 'random',
      fixedPhotoIds: ['a', 'b', 'c', 'd', 'e'],
    })
  })
})
