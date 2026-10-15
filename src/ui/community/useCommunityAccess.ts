import { accessFromStatus, canParticipateLevel, canReadLevel, type CommunityAccess, type CommunityAccessLevel, type CommunityAccessReason } from '@/domain/communityAccess'
import { useCommunity, type CommunityContextValue } from '@/ui/community/CommunityProvider'

// Guard ÚNICO del acceso por edad y permisos para todas las pantallas de Comunidad (en vez de copiar la lógica en cada botón):
//   const { canParticipate } = useCommunityAccess()
//   {canParticipate && <button>Crear publicación</button>}
// Es la forma de ENSEÑAR la interfaz correcta; la seguridad real la aplica el servidor en cada llamada. Si por cualquier motivo el contexto aún no trae el
// acceso (cargando, o servidor anterior a la migración 0277), se considera acceso completo y el servidor corrige lo que haga falta.
export interface CommunityAccessView {
  access: CommunityAccess
  level: CommunityAccessLevel
  reason: CommunityAccessReason | null
  canRead: boolean
  canParticipate: boolean
  // Puede leer pero no participar (permiso «solo de lectura»).
  readOnly: boolean
  refreshAccess: () => Promise<CommunityAccess>
}

export function useCommunityAccess(): CommunityAccessView {
  const ctx = useCommunity() as Partial<CommunityContextValue>
  const access = ctx.access ?? accessFromStatus(ctx.status)
  const level = access.level
  return {
    access,
    level,
    reason: access.reason,
    canRead: ctx.canRead ?? canReadLevel(level),
    canParticipate: ctx.canParticipate ?? canParticipateLevel(level),
    readOnly: level === 'read',
    refreshAccess: ctx.refreshAccess ?? (async () => access),
  }
}
