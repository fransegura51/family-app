import { useEffect, useState } from 'react'
import { communityStatusCache } from '@/data/communityStatusCache'
import type { CommunityStatus } from '@/domain/community'

// ¿Puede esta persona ver Comunidad? Para las pantallas de FUERA de Comunidad (Inicio, Cocina) que no quieren llamar a Supabase si la respuesta es «no»:
//   null  = todavía no se sabe (o no se pudo comprobar): no se enseña nada ni se llama a nada más.
//   true  = Comunidad está abierta para esta persona (ya incluye la edad y los permisos de la familia).
//   false = cerrada o sin acceso: nada de botones ni consultas de Comunidad.
// El estado se recuerda 2 minutos y se comparte entre pantallas, así que abrir Inicio y varias recetas seguidas cuesta UNA consulta, no una por pantalla.
export function useCommunityStatus(): CommunityStatus | null {
  const [status, setStatus] = useState<CommunityStatus | null>(() => communityStatusCache.peek())
  useEffect(() => {
    let cancelled = false
    communityStatusCache.get().then(
      (s) => {
        if (!cancelled) setStatus(s)
      },
      () => undefined, // Sin red: se queda en «no se sabe» (no se enseña nada).
    )
    return () => {
      cancelled = true
    }
  }, [])
  return status
}

export function useCommunityVisible(): boolean | null {
  const status = useCommunityStatus()
  return status === null ? null : status.visible
}
