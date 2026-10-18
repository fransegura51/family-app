import { listMyComments, listPosts, newsBreakdown } from '@/data/community'
import { onCommunityStateChange } from '@/domain/communityRead'
import { communityCarouselLines, type CommunityCarouselLine } from '@/domain/homeCarousel'

// Datos de la diapositiva de Comunidad del carrusel de Inicio: hasta 3 publicaciones elegidas por relevancia para ESTA persona (no leídas primero, luego novedades, luego donde ha
// participado y, por último, lo reciente; ver communityCarouselLines). Reutiliza consultas que ya existen (listPosts «no leídas primero», el desglose de la campana y mis comentarios),
// sin ninguna tabla nueva: tres peticiones pequeñas en paralelo, SOLO cuando Comunidad está abierta para la persona y la diapositiva está activada.
// Coste y estabilidad: el resultado se recuerda 3 minutos en memoria (abrir Inicio varias veces seguidas cuesta UNA tanda) y se olvida cuando la persona cambia algo relevante
// (abre una publicación, da «Me gusta», comenta o lee respuestas), de modo que al VOLVER a Inicio la tarjeta ya está al día. Mientras Inicio está abierto no se vuelve a pedir
// nada: la tarjeta no salta mientras se lee. No hay consultas periódicas.
const TTL_MS = 3 * 60 * 1000
let cache: { at: number; lines: CommunityCarouselLine[] } | null = null
let inflight: Promise<CommunityCarouselLine[]> | null = null

export function peekCommunityHomeLines(): CommunityCarouselLine[] | null {
  return cache && Date.now() - cache.at < TTL_MS ? cache.lines : null
}

export function clearCommunityHomeLines(): void {
  cache = null
  inflight = null
}

// Un cambio relevante hecho por la persona invalida lo recordado (la próxima visita a Inicio lo pide de nuevo).
onCommunityStateChange(clearCommunityHomeLines)

export function loadCommunityHomeLines(): Promise<CommunityCarouselLine[]> {
  const fresh = peekCommunityHomeLines()
  if (fresh) return Promise.resolve(fresh)
  if (inflight) return inflight
  inflight = Promise.all([
    listPosts({ order: 'no_leidas', limit: 24 }),
    // Si alguna de las dos consultas de apoyo falla, la tarjeta se completa igualmente con lo demás (nunca se enseña nada inventado).
    newsBreakdown().catch(() => []),
    listMyComments(30).catch(() => []),
  ])
    .then(([unreadFirst, news, mine]) => {
      const lines = communityCarouselLines({
        unreadFirst,
        news: news.map((n) => ({ postId: n.postId, title: n.title, count: n.count })),
        commentedPostIds: mine.map((c) => c.postId),
      })
      cache = { at: Date.now(), lines }
      return lines
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}
