import { isNativeApp } from '@/services/nativeApp'
import { Capacitor } from '@capacitor/core'
import type { Profile } from '@/domain/types'
import type { CommunityStatus } from '@/domain/community'
import type { HelpCommunityState, HelpContext } from '@/help/access'
import type { HelpModuleId, HelpPlatform } from '@/help/types'
import { HELP_MODULES } from '@/help/catalog/modules'

export function detectPlatform(): HelpPlatform {
  if (!isNativeApp()) return 'web'
  return Capacitor.getPlatform() === 'ios' ? 'ios' : 'android'
}

// Estado de Comunidad para la Ayuda a partir del estado que ya calcula el servidor (edad, permisos y apertura). Sin estado → 'unknown' (no se enseña nada de Comunidad).
export function communityStateFrom(status: Pick<CommunityStatus, 'visible' | 'access'> | null | undefined): HelpCommunityState {
  if (!status) return 'unknown'
  if (!status.visible) return 'no'
  return status.access === 'none' ? 'no' : 'ok'
}

export function buildHelpContext(profile: Pick<Profile, 'role' | 'allowedSections'>, community: HelpCommunityState, platform: HelpPlatform = detectPlatform()): HelpContext {
  return { role: profile.role, allowedSections: profile.allowedSections, platform, community }
}

// Módulo en el que está la persona según la ruta (para la ayuda contextual).
export function moduleForPath(pathname: string): HelpModuleId | null {
  if (pathname === '/' || pathname === '') return 'inicio'
  const mod = [...HELP_MODULES]
    .filter((m) => m.path !== '/' && (pathname === m.path || pathname.startsWith(`${m.path}/`)))
    .filter((m) => !['notificaciones', 'cuentas'].includes(m.id)) // comparten ruta con Configuración
    .sort((a, b) => b.path.length - a.path.length)[0]
  return mod?.id ?? null
}
