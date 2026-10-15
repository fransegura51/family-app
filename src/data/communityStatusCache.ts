// Comunidad PEPA — estado de acceso recordado unos minutos para las pantallas que NO son de Comunidad (Inicio, Cocina). Ver domain/communityStatusCache.ts.
// Las pantallas de Comunidad siguen pidiendo su estado fresco (CommunityProvider); aquí solo se evita preguntar de más desde fuera.
import { supabase } from '@/data/supabaseClient'
import { communityStatus } from '@/data/community'
import { createCommunityStatusCache } from '@/domain/communityStatusCache'

export const communityStatusCache = createCommunityStatusCache(() => communityStatus())

// Al cambiar de persona (o cerrar sesión) se olvida lo recordado: el acceso por edad y permisos es de cada cuenta.
let lastUserId: string | null | undefined
try {
  supabase.auth.onAuthStateChange((event, session) => {
    const id = session?.user?.id ?? null
    if (event === 'SIGNED_OUT' || (lastUserId !== undefined && id !== lastUserId)) communityStatusCache.clear()
    lastUserId = id
  })
} catch {
  // En pruebas o sin cliente de autenticación: la memoria solo caduca por tiempo.
}
