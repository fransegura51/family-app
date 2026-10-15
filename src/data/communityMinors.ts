// Comunidad PEPA — acceso de menores: llamadas al servidor (migración 0277). Mismo estilo que data/community.ts: todo por funciones del servidor, respuestas en
// snake_case que aquí pasan a camelCase, y errores convertidos en CommunityError (domain/communityErrors.ts).
import { camelize } from '@/data/community'
import { supabase } from '@/data/supabaseClient'
import { toCommunityError } from '@/domain/communityErrors'
import type { CommunityAccessLevel, CommunityAccessReason, MinorFlags, MinorPermission } from '@/domain/communityAccess'

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args ?? {})
  if (error) throw toCommunityError(error)
  return camelize<T>(data)
}

export interface MyCommunityAccess {
  level: CommunityAccessLevel
  reason: CommunityAccessReason | null
  ageKnown: boolean
}

// Acceso de la propia persona (solo hace falta cuando no se tiene ya el de `community_status()`).
export const getCommunityAccess = () => rpc<MyCommunityAccess>('community_get_access')

// Solo quien administra la familia (el servidor devuelve NOT_ADMIN al resto). Personas con cuenta que no son adultas o cuya edad no se conoce.
export const listMinorPermissions = () => rpc<MinorPermission[]>('community_list_minor_permissions')

// Participar fuerza leer (también lo hace el servidor). Devuelve lo que ha quedado guardado de verdad.
export const setMinorPermission = (profileId: string, canRead: boolean, canParticipate: boolean) =>
  rpc<MinorFlags & { profileId: string }>('community_set_minor_permission', { p_profile: profileId, p_can_read: canRead, p_can_participate: canParticipate })
