// Comunidad PEPA — acceso: SOLO personas de 18 años cumplidos o más (decisión definitiva del 17/10/2026; el servidor la aplica en
// supabase/migrations/0284_community_adults_follow_topics_tags.sql y recalcula el acceso en CADA llamada). La edad sale de la fecha de nacimiento de la ficha de familia
// enlazada a la cuenta: sin fecha fiable NO hay acceso. Ya no existen los permisos de la familia para menores (0277).
// Aquí vive la lógica PURA (sin red ni pantalla): niveles y textos en español. La seguridad real está en el servidor: la interfaz solo refleja el estado con claridad.
import type { CommunityAccessErrorCode } from './communityErrors'

export type CommunityAccessLevel = 'none' | 'read' | 'participate'
export type CommunityAccessReason = 'under_18' | 'age_unknown' | 'read_only'

export interface CommunityAccess {
  level: CommunityAccessLevel
  reason: CommunityAccessReason | null
}

// Los campos de acceso que trae `community_status()` (ya en camelCase). Son opcionales por si el servidor aún no los trae.
export interface StatusAccessFields {
  access?: CommunityAccessLevel
  accessReason?: CommunityAccessReason | null
}

// Si todavía no se sabe (cargando o sin red) o el servidor es anterior a 0277, se considera acceso completo: la decisión real siempre la toma el servidor y,
// si dice que no, la pantalla se corrige sola (ver `accessErrorNotice`). Así nadie ve un destello de «solo lectura» por una carga lenta.
export const FULL_ACCESS: CommunityAccess = { level: 'participate', reason: null }

export function accessFromStatus(status: StatusAccessFields | null | undefined): CommunityAccess {
  if (!status || !status.access) return FULL_ACCESS
  return { level: status.access, reason: status.accessReason ?? null }
}

export const canReadLevel = (level: CommunityAccessLevel): boolean => level !== 'none'
export const canParticipateLevel = (level: CommunityAccessLevel): boolean => level === 'participate'

// ---- Códigos de error de acceso (los devuelve el servidor en una sesión ya abierta)
export type AccessErrorCode = CommunityAccessErrorCode

export function isAccessErrorCode(code: string): code is AccessErrorCode {
  return code === 'COMMUNITY_ACCESS_DENIED' || code === 'PARTICIPATION_NOT_ALLOWED'
}

// ---- Textos de la persona que usa Comunidad
export const UNAVAILABLE_TITLE = 'Comunidad no está disponible para tu cuenta'

// Por qué no se puede entrar (nivel «none»). Frases cortas y amables; nunca culpan a la persona.
export function unavailableReasonText(reason: CommunityAccessReason | null): string {
  switch (reason) {
    case 'under_18':
      return 'Comunidad PEPA es solo para personas de 18 años o más.'
    case 'age_unknown':
      return 'Comunidad PEPA es solo para personas de 18 años o más y todavía no tenemos tu fecha de nacimiento. Añádela en tu ficha de Familia y podrás entrar en cuanto se guarde.'
    default:
      return 'Ahora mismo no puedes entrar en Comunidad con esta cuenta.'
  }
}

export const READ_ONLY_TITLE = 'Tienes permiso solo de lectura'
export const READ_ONLY_SHORT = 'Puedes leer publicaciones, comentarios y perfiles, pero no publicar, comentar ni interactuar.'
export const READ_ONLY_HELP =
  'En Comunidad puedes leer todo lo que quieras, pero ahora mismo no puedes publicar, comentar, dar me gusta, guardar, seguir ni valorar recetas.'

// Cuando una pantalla pide participar y no se puede (ruta de escritura abierta a mano o botón no disponible).
export const PARTICIPATION_NEEDED_TITLE = 'Esto necesita permiso para participar'

// Texto para los sitios que dicen por qué un acto concreto no está disponible (p. ej. «Compartir en Comunidad» desde la Cocina). null = sin impedimento.
export function participationBlockedText(status: ({ visible?: boolean; launched?: boolean } & StatusAccessFields) | null | undefined): string | null {
  const a = accessFromStatus(status)
  if (a.level === 'none') return `${UNAVAILABLE_TITLE}. ${unavailableReasonText(a.reason)}`
  if (a.level === 'read') return `${READ_ONLY_TITLE}: no puedes publicar. ${READ_ONLY_HELP}`
  if (status && status.visible === false) return 'Comunidad todavía no está abierta. Cuando se abra podrás compartir tus recetas.'
  return null
}

// Aviso cuando el servidor rechaza una escritura/lectura en una sesión abierta (permiso retirado o cambiado mientras la persona usaba la app).
// `level` es el nivel YA REFRESCADO desde el servidor.
export interface AccessNotice {
  title: string
  text: string
}

export function accessErrorNotice(code: AccessErrorCode, level: CommunityAccessLevel, reason: CommunityAccessReason | null = null): AccessNotice {
  if (level === 'none') return { title: UNAVAILABLE_TITLE, text: unavailableReasonText(reason) }
  if (level === 'read') {
    return {
      title: READ_ONLY_TITLE,
      text: `Ahora puedes leer Comunidad, pero no participar. ${READ_ONLY_SHORT}`,
    }
  }
  // Nivel completo pero el servidor lo ha rechazado (cambio muy reciente, o no hemos podido comprobarlo): se pide reintentar sin alarmar.
  return {
    title: 'Tus permisos se han actualizado',
    text:
      code === 'COMMUNITY_ACCESS_DENIED'
        ? 'No hemos podido confirmar tu acceso a Comunidad en este momento. Vuelve a intentarlo dentro de un momento.'
        : 'No hemos podido confirmar tu permiso para participar en este momento. Vuelve a intentarlo dentro de un momento.',
  }
}

// Acceso de la propia persona (`community_get_access()`). `photosAllowed` es false si la persona no es adulta (solo personas adultas). Es opcional
// por si el servidor es anterior a esa regla: en ese caso se trata como permitido y el servidor decide (devuelve PHOTOS_NOT_ALLOWED si no).
export interface MyCommunityAccess {
  level: CommunityAccessLevel
  reason: CommunityAccessReason | null
  ageKnown: boolean
  photosAllowed?: boolean
}

// Solo un «no» claro del servidor oculta las fotos: mientras no se sabe (cargando, sin red) se enseñan y el servidor corrige con PHOTOS_NOT_ALLOWED.
export function photosAllowedFrom(access: { photosAllowed?: boolean } | null | undefined): boolean {
  return access?.photosAllowed !== false
}

export const MINORS_NO_PHOTOS_NOTE = 'Las personas menores de edad participan sin fotos.'
