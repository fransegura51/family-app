// Comunidad PEPA — acceso de menores: llamadas al servidor (migración 0277). Mismo estilo que data/community.ts: todo por funciones del servidor, respuestas en
// snake_case que aquí pasan a camelCase, y errores convertidos en CommunityError (domain/communityErrors.ts).
import { camelize } from '@/data/community'
import { supabase } from '@/data/supabaseClient'
import { toCommunityError } from '@/domain/communityErrors'
import type { MinorFlags, MinorPermission, MyCommunityAccess } from '@/domain/communityAccess'

export type { MyCommunityAccess } from '@/domain/communityAccess'

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args ?? {})
  if (error) throw toCommunityError(error)
  return camelize<T>(data)
}

// Acceso de la propia persona (solo hace falta cuando no se tiene ya el de `community_status()`). Incluye `photosAllowed` (false si no es adulta).
export const getCommunityAccess = () => rpc<MyCommunityAccess>('community_get_access')

// Solo quien administra la familia (el servidor devuelve NOT_ADMIN al resto). Personas con cuenta que no son adultas o cuya edad no se conoce.
export const listMinorPermissions = () => rpc<MinorPermission[]>('community_list_minor_permissions')

// Participar fuerza leer (también lo hace el servidor). Devuelve lo que ha quedado guardado de verdad.
// `guardianDeclared` = quien autoriza ha declarado ser madre, padre o tutor legal de la persona: el servidor LO EXIGE al ACTIVAR un permiso
// (GUARDIAN_DECLARATION_REQUIRED si falta); al quitar permisos no hace falta.
export const setMinorPermission = (profileId: string, canRead: boolean, canParticipate: boolean, guardianDeclared = false) =>
  rpc<MinorFlags & { profileId: string }>('community_set_minor_permission', {
    p_profile: profileId,
    p_can_read: canRead,
    p_can_participate: canParticipate,
    p_guardian_declared: guardianDeclared,
  })
