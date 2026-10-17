// Comunidad PEPA — acceso (solo personas adultas): llamadas al servidor (0277 y 0284). Mismo estilo que data/community.ts: todo por funciones del servidor, respuestas en
// snake_case que aquí pasan a camelCase, y errores convertidos en CommunityError (domain/communityErrors.ts).
import { camelize } from '@/data/community'
import { supabase } from '@/data/supabaseClient'
import { toCommunityError } from '@/domain/communityErrors'
import type { MyCommunityAccess } from '@/domain/communityAccess'

export type { MyCommunityAccess } from '@/domain/communityAccess'

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args ?? {})
  if (error) throw toCommunityError(error)
  return camelize<T>(data)
}

// Acceso de la propia persona (solo hace falta cuando no se tiene ya el de `community_status()`). Incluye `photosAllowed` (false si no es adulta).
export const getCommunityAccess = () => rpc<MyCommunityAccess>('community_get_access')
