import { useEffect, useState } from 'react'
import { useSession } from '@/auth/useSession'
import { amIAppOwner } from '@/data/suggestions'

// Resultado de preguntar al SERVIDOR (am_i_app_owner → profiles.is_app_owner) si esta cuenta administra PEPA. Es distinto del rol «Administrador/a» de una familia.
// Regla de seguridad: si no se puede verificar (sin red, error del servidor) NO se concede nada: 'unverified' se trata igual que 'denied' al decidir qué se enseña.
// Que esta comprobación pinte o no un botón es solo comodidad; la protección real de los datos la hacen las funciones del servidor (is_app_owner / NOT_ADMIN).
export type AppOwnerState = 'checking' | 'owner' | 'denied' | 'unverified'

// Para no sumar consultas a Supabase cada vez que se abre Inicio, Familia o Comunidad, el resultado se recuerda unos minutos EN MEMORIA (por cuenta, nunca en disco). La puerta
// del Centro de Administración pide `fresh` y pregunta siempre al servidor.
const CACHE_MS = 10 * 60 * 1000
const cache = new Map<string, { owner: boolean; at: number }>()

export function clearAppOwnerCache(): void {
  cache.clear()
}

export function useAppOwner(options: { fresh?: boolean } = {}): AppOwnerState {
  const fresh = options.fresh === true
  const { session } = useSession()
  const userId = session?.user.id ?? null
  const [result, setResult] = useState<{ userId: string | null; state: AppOwnerState }>({ userId: null, state: 'checking' })

  const hit = !fresh && userId ? cache.get(userId) : undefined
  const cached = hit && Date.now() - hit.at < CACHE_MS ? hit : undefined

  useEffect(() => {
    if (!userId || cached) return
    let cancelled = false
    amIAppOwner()
      .then((owner) => {
        cache.set(userId, { owner, at: Date.now() })
        if (!cancelled) setResult({ userId, state: owner ? 'owner' : 'denied' })
      })
      .catch(() => !cancelled && setResult({ userId, state: 'unverified' }))
    return () => {
      cancelled = true
    }
  }, [userId, fresh, cached])

  if (cached) return cached.owner ? 'owner' : 'denied'
  // Un resultado de otra cuenta (cambio de sesión) nunca vale: mientras se vuelve a preguntar, se está «comprobando».
  if (!userId || result.userId !== userId) return 'checking'
  return result.state
}
