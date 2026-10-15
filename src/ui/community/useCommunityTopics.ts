import { useEffect, useState } from 'react'
import { listCommunityTopics } from '@/data/community'
import type { CommunityTopic } from '@/domain/community'

// Los temas casi nunca cambian: se piden UNA vez por visita a la aplicación y se reutilizan en todas las pantallas de descubrimiento (secciones, buscador,
// guardados, selector de temas favoritos). Si la petición falla, se olvida para poder reintentar la próxima vez.
let cache: Promise<CommunityTopic[]> | null = null

export function loadTopicsOnce(): Promise<CommunityTopic[]> {
  if (!cache) {
    cache = listCommunityTopics().catch((e) => {
      cache = null
      throw e
    })
  }
  return cache
}

// null = todavía cargando o no disponibles (las pantallas funcionan igual, solo sin la lista de temas).
export function useCommunityTopics(): CommunityTopic[] | null {
  const [topics, setTopics] = useState<CommunityTopic[] | null>(null)
  useEffect(() => {
    let cancelled = false
    loadTopicsOnce().then(
      (t) => {
        if (!cancelled) setTopics(t)
      },
      () => undefined,
    )
    return () => {
      cancelled = true
    }
  }, [])
  return topics
}
