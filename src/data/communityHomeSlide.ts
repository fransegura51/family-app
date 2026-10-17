import { listPosts } from '@/data/community'
import { communityCarouselLines, type CommunityCarouselLine } from '@/domain/homeCarousel'

// Datos de la diapositiva de Comunidad del carrusel de Inicio. Reutiliza las mismas consultas de la portada de Comunidad (listPosts con los órdenes «recientes»,
// «comentados» y «sin respuesta»): tres peticiones pequeñas en paralelo, SOLO cuando Comunidad está abierta para la persona y la diapositiva está activada.
// Coste: el resultado se recuerda 3 minutos en memoria, así que abrir Inicio varias veces seguidas cuesta UNA tanda, no una por visita; no hay consultas periódicas.
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

export function loadCommunityHomeLines(): Promise<CommunityCarouselLine[]> {
  const fresh = peekCommunityHomeLines()
  if (fresh) return Promise.resolve(fresh)
  if (inflight) return inflight
  inflight = Promise.all([
    listPosts({ order: 'recientes', limit: 6 }),
    listPosts({ order: 'comentados', limit: 4 }),
    listPosts({ order: 'sin_respuesta', limit: 3 }),
  ])
    .then(([recientes, comentados, sin_respuesta]) => {
      const lines = communityCarouselLines({ recientes, comentados, sin_respuesta })
      cache = { at: Date.now(), lines }
      return lines
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}
