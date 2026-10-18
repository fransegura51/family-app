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
  // Publicaciones en el orden del servidor «No leídas primero» (lo no abierto o cambiado desde que se abrió, y luego lo leído; cada grupo de más reciente a más antigua).
  // Cada tarjeta lleva su estado de lectura y si me ha gustado: con eso basta para elegir sin crear ninguna base de datos nueva.
  unreadFirst: readonly CommunityCardItem[]
  // Conversaciones con respuestas o comentarios sin ver (el mismo desglose de la campana), de la más reciente a la más antigua.
  news: readonly { postId: string; title: string; count: number }[]
  // Publicaciones en las que he comentado (de la más reciente a la más antigua).
  commentedPostIds: readonly string[]
}

export const COMMUNITY_CAROUSEL_MAX = 3

const isPost = (c: CommunityCardItem): c is PostCard => !('blockedByMe' in c && c.blockedByMe === true)

// Líneas REALES de la diapositiva de Comunidad (nunca inventa nada), hasta 3, sin repetir y sin dejar huecos si hay publicaciones. Prioridad (relevancia real, no azar):
//   1. no leídas (incluidas las actualizadas tras leerlas), de la más reciente a la más antigua;
//   2. conversaciones con novedades que todavía no he visto (respuestas nuevas);
//   3. publicaciones en las que he comentado o que me han gustado;
//   4. el resto de publicaciones recientes.
// Las publicaciones de personas bloqueadas no vienen con contenido y se saltan; solo salen publicaciones que el servidor ha devuelto para esta persona.
export function communityCarouselLines(src: CommunityCarouselSources): CommunityCarouselLine[] {
  const seen = new Set<string>()
  const out: CommunityCarouselLine[] = []
  const push = (id: string, icon: string, title: string, meta: string) => {
    if (out.length >= COMMUNITY_CAROUSEL_MAX || seen.has(id)) return
    seen.add(id)
    out.push({ id, icon, title, meta })
  }
  const posts = src.unreadFirst.filter(isPost)
  const blocked = new Set(src.unreadFirst.filter((c) => !isPost(c)).map((c) => c.id))
  const isUnread = (p: PostCard) => p.readState !== 'read'
  // 1. No leídas.
  for (const p of posts) if (isUnread(p)) push(p.id, '🆕', p.title, p.readState === 'updated' ? 'Actualizada desde que la leíste' : `Sin leer · ${p.topicLabel}`)
  // 2. Novedades (respuestas sin ver).
  for (const n of src.news) if (!blocked.has(n.postId) && n.title) push(n.postId, '💬', n.title, `${n.count} ${n.count === 1 ? 'respuesta nueva' : 'respuestas nuevas'}`)
  // 3. Mis comentarios y mis «Me gusta».
  const commented = new Set(src.commentedPostIds)
  for (const p of posts) {
    if (commented.has(p.id)) push(p.id, '💬', p.title, 'Has participado en esta conversación')
    else if (p.likedByMe) push(p.id, '❤️', p.title, 'Te gustó')
  }
  // 4. Lo demás, lo más reciente primero.
  for (const p of posts) push(p.id, '📰', p.title, p.topicLabel)
  return out
}
