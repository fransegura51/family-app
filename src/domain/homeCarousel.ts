// Lógica pura del carrusel de Inicio (sin red ni pantalla): qué diapositivas salen y en qué orden, qué fotos se enseñan y qué líneas lleva la de Comunidad.
import type { CommunityCardItem, PostCard } from '@/domain/community'
import { MAX_CAROUSEL_PHOTOS, type HomeCarouselPrefs } from '@/state/homeCarouselPrefs'

export type CarouselSlideKey = 'compra' | 'agenda' | 'comunidad' | 'fotos'

// ORDEN OBLIGATORIO: primero lo útil (Lista de la compra, Calendario, Comunidad PEPA) y al final las fotografías. Comunidad solo sale si Comunidad está abierta para
// esta persona (con el interruptor de lanzamiento en 0, solo las propietarias). Con el carrusel apagado no sale nada.
export function carouselSlideOrder(prefs: HomeCarouselPrefs, communityVisible: boolean): CarouselSlideKey[] {
  if (!prefs.enabled) return []
  const out: CarouselSlideKey[] = []
  if (prefs.shopping) out.push('compra')
  if (prefs.calendar) out.push('agenda')
  if (prefs.community && communityVisible) out.push('comunidad')
  if (prefs.photos) out.push('fotos')
  return out
}

function shuffled<T>(list: readonly T[], rng: () => number): T[] {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Fotos de la Galería PEPA que entran en el carrusel (hasta 5):
//  · 'fixed': las elegidas, en el orden elegido (las que ya no existen se ignoran). Si no queda ninguna válida, se usa el modo al azar (no se deja el hueco vacío).
//  · 'random': 5 al azar entre todas las de la Galería.
// Solo salen fotos de la Galería PEPA: este módulo no sabe nada de la galería del teléfono.
export function pickCarouselPhotos<T extends { id: string }>(all: readonly T[], prefs: HomeCarouselPrefs, rng: () => number = Math.random): T[] {
  if (!prefs.photos || all.length === 0) return []
  if (prefs.photoMode === 'fixed') {
    const byId = new Map(all.map((p) => [p.id, p]))
    const chosen = prefs.fixedPhotoIds.map((id) => byId.get(id)).filter((p): p is T => p !== undefined).slice(0, MAX_CAROUSEL_PHOTOS)
    if (chosen.length > 0) return chosen
  }
  return shuffled(all, rng).slice(0, MAX_CAROUSEL_PHOTOS)
}

// Tarjeta informativa de las familias sin fotos: sale solo con las fotos activadas y la Galería PEPA todavía vacía; con la primera foto desaparece.
export function showEmptyGalleryCard(prefs: HomeCarouselPrefs, galleryPhotoCount: number): boolean {
  return prefs.enabled && prefs.photos && galleryPhotoCount === 0
}

// Añade o quita una foto fija respetando el máximo de 5 (si ya hay 5, no entra otra hasta quitar una).
export function toggleFixedPhoto(ids: readonly string[], id: string): string[] {
  if (ids.includes(id)) return ids.filter((x) => x !== id)
  if (ids.length >= MAX_CAROUSEL_PHOTOS) return [...ids]
  return [...ids, id]
}

export interface CommunityCarouselLine {
  id: string
  icon: string
  title: string
  meta: string
}

export interface CommunityCarouselSources {
  recientes: readonly CommunityCardItem[]
  comentados: readonly CommunityCardItem[]
  sin_respuesta: readonly CommunityCardItem[]
}

const isPost = (c: CommunityCardItem): c is PostCard => !('blockedByMe' in c && c.blockedByMe === true)

// Líneas REALES de la diapositiva de Comunidad (nunca inventa nada): las 3 publicaciones más recientes, la más comentada (con comentarios de verdad) y la primera
// pregunta sin responder; sin repetir ninguna y como mucho 5. Las publicaciones de personas bloqueadas no vienen con contenido y se saltan.
export function communityCarouselLines(src: CommunityCarouselSources): CommunityCarouselLine[] {
  const seen = new Set<string>()
  const out: CommunityCarouselLine[] = []
  const take = (items: readonly CommunityCardItem[], max: number, icon: string, meta: (p: PostCard) => string, accept: (p: PostCard) => boolean = () => true) => {
    let n = 0
    for (const item of items) {
      if (n >= max || out.length >= 5) break
      if (!isPost(item) || seen.has(item.id) || !accept(item)) continue
      seen.add(item.id)
      out.push({ id: item.id, icon, title: item.title, meta: meta(item) })
      n++
    }
  }
  take(src.recientes, 3, '🆕', (p) => p.topicLabel)
  take(src.comentados, 1, '💬', (p) => `${p.commentCount} comentario${p.commentCount === 1 ? '' : 's'}`, (p) => p.commentCount > 0)
  take(src.sin_respuesta, 1, '❓', () => 'Sin respuesta todavía')
  return out
}
