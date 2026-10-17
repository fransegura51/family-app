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

describe('diapositiva de Comunidad: solo publicaciones reales', () => {
  it('recientes, la más comentada (con comentarios de verdad) y una pregunta sin responder, sin repetir', () => {
    const lines = communityCarouselLines({
      recientes: [card(1), card(2), card(3), card(4)],
      comentados: [card(2, { commentCount: 9 }), card(5, { commentCount: 4 })],
      sin_respuesta: [card(1, { unanswered: true }), card(6, { kind: 'pregunta', unanswered: true })],
    })
    expect(lines.map((l) => l.id)).toEqual(['post-1', 'post-2', 'post-3', 'post-5', 'post-6'])
    expect(lines.map((l) => l.icon)).toEqual(['🆕', '🆕', '🆕', '💬', '❓'])
    expect(lines[3].meta).toBe('4 comentarios')
    expect(lines[4].meta).toBe('Sin respuesta todavía')
  })

  it('no inventa: sin comentarios no hay línea de «más comentada» y sin publicaciones no hay líneas', () => {
    const none = communityCarouselLines({ recientes: [], comentados: [], sin_respuesta: [] })
    expect(none).toEqual([])
    const noComments = communityCarouselLines({ recientes: [card(1)], comentados: [card(2, { commentCount: 0 })], sin_respuesta: [] })
    expect(noComments.map((l) => l.id)).toEqual(['post-1'])
  })

  it('las publicaciones de personas bloqueadas no se enseñan y el máximo es 5', () => {
    const blocked: CommunityCardItem = { blockedByMe: true, id: 'b1', authorId: 'x' }
    const lines = communityCarouselLines({ recientes: [blocked, card(1), card(2), card(3), card(4)], comentados: [card(9, { commentCount: 2 })], sin_respuesta: [card(8)] })
    expect(lines.map((l) => l.id)).not.toContain('b1')
    expect(lines.length).toBeLessThanOrEqual(5)
    expect(lines.map((l) => l.id)).toEqual(['post-1', 'post-2', 'post-3', 'post-9', 'post-8'])
  })

  it('un solo comentario se dice en singular', () => {
    expect(communityCarouselLines({ recientes: [], comentados: [card(1, { commentCount: 1 })], sin_respuesta: [] })[0].meta).toBe('1 comentario')
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
