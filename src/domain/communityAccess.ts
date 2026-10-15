// Comunidad PEPA — acceso por edad y permisos de la familia (regla aprobada por la dueña el 15/10/2026; el servidor la aplica en
// supabase/migrations/0277_community_minors.sql y recalcula el acceso en CADA llamada).
//   · Menores de 15: sin acceso.  · De 15 a 17: solo con permiso de quien administra la familia (dos permisos independientes: leer y participar,
//     ambos desactivados por defecto; participar exige también poder leer).  · Desde 18: acceso normal.
// Aquí vive la lógica PURA (sin red ni pantalla): niveles, textos en español y reglas de los interruptores. La seguridad real está en el servidor: la interfaz
// solo tiene que reflejar el estado con claridad y no enseñar botones que no van a funcionar.
import { toCommunityError, type CommunityAccessErrorCode, type CommunityErrorCode } from '@/domain/communityErrors'

export type CommunityAccessLevel = 'none' | 'read' | 'participate'
export type CommunityAccessReason = 'under_15' | 'age_unknown' | 'not_authorized' | 'read_only'

export interface CommunityAccess {
  level: CommunityAccessLevel
  reason: CommunityAccessReason | null
}

// Los campos de acceso que trae `community_status()` (ya en camelCase). Son opcionales por si el servidor aún no tiene la migración 0277.
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
    case 'under_15':
      return 'Comunidad es para personas a partir de 15 años. Todo lo demás de PEPA sigue funcionando igual para ti.'
    case 'age_unknown':
      return 'Todavía no tenemos tu fecha de nacimiento. Pide a quien administra tu familia que la añada en tu ficha de Familia y así podremos comprobar si puedes entrar.'
    case 'not_authorized':
      return 'Para entrar en Comunidad necesitas el permiso de quien administra tu familia. Pídeselo: lo puede dar desde Familia, en «Permisos de Comunidad».'
    default:
      return 'Ahora mismo no puedes entrar en Comunidad con esta cuenta.'
  }
}

export const READ_ONLY_TITLE = 'Tienes permiso solo de lectura'
export const READ_ONLY_SHORT = 'Puedes leer publicaciones, comentarios y perfiles, pero no publicar, comentar ni interactuar.'
export const READ_ONLY_HELP =
  'En Comunidad puedes leer todo lo que quieras. Para publicar, comentar, dar me gusta, guardar, seguir o valorar recetas hace falta el permiso «Participar en Comunidad». Quien administra tu familia lo puede dar desde Familia, en «Permisos de Comunidad».'

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
  if (level === 'none') return { title: UNAVAILABLE_TITLE, text: unavailableReasonText(reason ?? 'not_authorized') }
  if (level === 'read') {
    return {
      title: READ_ONLY_TITLE,
      text: `Quien administra tu familia ha cambiado tus permisos: ahora puedes leer Comunidad, pero no participar. ${READ_ONLY_SHORT}`,
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

// ---- Permisos de las personas de 15 a 17 años (los gestiona la persona administradora de la familia)
export type MinorStatus = 'configurable' | 'under_15' | 'needs_birthdate'

export interface MinorPermission {
  profileId: string
  name: string
  age: number | null
  status: MinorStatus
  canRead: boolean
  canParticipate: boolean
  updatedAt: string | null
}

export interface MinorFlags {
  canRead: boolean
  canParticipate: boolean
}

// Regla de los dos interruptores: activar «participar» activa «leer»; desactivar «leer» desactiva «participar». El servidor aplica lo mismo.
export function applyMinorToggle(current: MinorFlags, field: 'read' | 'participate', value: boolean): MinorFlags {
  if (field === 'participate') return { canRead: value ? true : current.canRead, canParticipate: value }
  return { canRead: value, canParticipate: value ? current.canParticipate : false }
}

export interface MinorGroups {
  configurable: MinorPermission[]
  under15: MinorPermission[]
  needsBirthdate: MinorPermission[]
}

export function groupMinors(list: MinorPermission[]): MinorGroups {
  return {
    configurable: list.filter((m) => m.status === 'configurable'),
    under15: list.filter((m) => m.status === 'under_15'),
    needsBirthdate: list.filter((m) => m.status === 'needs_birthdate'),
  }
}

export const MINORS_INTRO = 'Las personas menores de 15 años no pueden entrar en Comunidad. De 15 a 17 años solo entran si vosotros lo autorizáis. Desde los 18 entran con normalidad.'
export const MINORS_LEGAL_REMINDER =
  'Quien autoriza debe ser la madre, el padre o la persona tutora legal de la persona menor. Puedes retirar el permiso cuando quieras y se aplica enseguida.'
export const MINORS_EMPTY = 'Ahora mismo nadie de vuestra familia necesita este permiso.'
export const READ_LABEL = 'Permitir leer Comunidad'
export const READ_HELP = 'Solo podrá consultar publicaciones, comentarios y perfiles.'
export const PARTICIPATE_LABEL = 'Permitir participar en Comunidad'
export const PARTICIPATE_HELP = 'Podrá publicar, comentar, valorar recetas, guardar y seguir conversaciones. Necesita también poder leer.'

export function under15Text(m: Pick<MinorPermission, 'name' | 'age'>): string {
  return `${m.name}${m.age !== null ? ` (${m.age} años)` : ''}: aún no puede acceder. Podrá pedirlo al cumplir 15 años.`
}

export function needsBirthdateText(m: Pick<MinorPermission, 'name'>): string {
  return `${m.name}: todavía no sabemos su edad. Añade su fecha de nacimiento en su ficha de familia para poder decidir su permiso.`
}

// Errores del panel de permisos: los textos generales de Comunidad hablan de la «administración de Comunidad», que aquí confundiría.
export function minorPermissionErrorText(error: unknown): string {
  const code: CommunityErrorCode = toCommunityError(error).code
  if (code === 'NOT_ADMIN') return 'Solo quien administra la familia puede cambiar estos permisos.'
  if (code === 'NOT_AVAILABLE') return 'Este permiso ya no se puede cambiar (puede que haya cambiado la edad o la ficha de la persona). Vuelve a abrir la lista para verla al día.'
  if (code === 'AUTH_REQUIRED') return 'Entra de nuevo en tu cuenta de PEPA para cambiar estos permisos.'
  return 'No se ha podido guardar el cambio. Inténtalo de nuevo.'
}
