// Errores de Comunidad: el servidor lanza excepciones con un CÓDIGO en el mensaje; aquí se convierten en frases claras en español.

export type CommunityErrorCode =
  | 'AUTH_REQUIRED'
  | 'ALIAS_REQUIRED'
  | 'ALIAS_INVALID'
  | 'ALIAS_RESERVED'
  | 'ALIAS_TAKEN'
  | 'RULES_REQUIRED'
  | 'BANNED'
  | 'NOT_LAUNCHED'
  | 'ADULT_REQUIRED'
  | 'RATE_LIMIT'
  | 'NOT_AVAILABLE'
  | 'NOT_ADMIN'
  | 'TEXT_REQUIRED'
  | 'TEXT_TOO_LONG'
  | 'UNSAFE_CONTENT'
  | 'UNSAFE_LINK'
  | 'BLOCKED_LINK'
  | 'TOO_MANY_LINKS'
  | 'TOO_MANY_PHOTOS'
  | 'BAD_PHOTO'
  | 'BAD_KIND'
  | 'TOPIC_SECTION_MISMATCH'
  | 'REPLY_LEVEL'
  | 'RECIPE_REQUIRED'
  | 'RECIPE_INGREDIENTS'
  | 'ALREADY_VOTED'
  | 'NO_SOURCES'
  | 'UNKNOWN'

export const COMMUNITY_ERROR_MESSAGES: Record<CommunityErrorCode, string> = {
  AUTH_REQUIRED: 'Entra en tu cuenta de PEPA para hacer esto.',
  ALIAS_REQUIRED: 'Antes de participar elige tu alias público.',
  ALIAS_INVALID: 'El alias debe tener entre 3 y 24 caracteres: letras, números, espacios, puntos, guiones o guiones bajos.',
  ALIAS_RESERVED: 'Ese alias no está permitido (no puede parecerse a Pepa, al equipo ni a la administración).',
  ALIAS_TAKEN: 'Ese alias ya lo usa otra persona. Prueba con otro.',
  RULES_REQUIRED: 'Tienes que aceptar las normas de Comunidad para participar.',
  BANNED: 'Ahora mismo no puedes participar en Comunidad. Puedes seguir leyendo.',
  NOT_LAUNCHED: 'Comunidad todavía no está abierta. ¡Pronto!',
  ADULT_REQUIRED: 'Para participar en Comunidad hace falta una cuenta de adulto. Puedes leer todo lo que quieras.',
  RATE_LIMIT: 'Vas muy rápido. Espera un poco y vuelve a intentarlo.',
  NOT_AVAILABLE: 'Esto ya no está disponible.',
  NOT_ADMIN: 'Esta acción es solo para la administración de Comunidad.',
  TEXT_REQUIRED: 'Falta el texto (o la foto).',
  TEXT_TOO_LONG: 'El texto es demasiado largo.',
  UNSAFE_CONTENT: 'El texto contiene algo que no se puede publicar (código o marcas no permitidas). Quítalo e inténtalo de nuevo.',
  UNSAFE_LINK: 'Hay un enlace no permitido. Solo se admiten enlaces web seguros (http o https) de sitios con nombre.',
  BLOCKED_LINK: 'Uno de los enlaces apunta a un sitio bloqueado por seguridad.',
  TOO_MANY_LINKS: 'Hay demasiados enlaces en el texto.',
  TOO_MANY_PHOTOS: 'Solo se pueden añadir hasta 5 fotos.',
  BAD_PHOTO: 'No se ha podido usar una de las fotos. Súbela de nuevo.',
  BAD_KIND: 'Algo no es correcto en lo que has enviado.',
  TOPIC_SECTION_MISMATCH: 'El tema elegido no corresponde a esa sección.',
  REPLY_LEVEL: 'No se puede responder ahí.',
  RECIPE_REQUIRED: 'Falta la receta.',
  RECIPE_INGREDIENTS: 'La receta necesita al menos un ingrediente con nombre.',
  ALREADY_VOTED: 'Ya has votado en esta encuesta.',
  NO_SOURCES: 'Un artículo necesita fuentes externas para poder publicarse.',
  UNKNOWN: 'Algo ha fallado. Inténtalo de nuevo.',
}

export class CommunityError extends Error {
  code: CommunityErrorCode
  constructor(code: CommunityErrorCode, message?: string) {
    super(message ?? COMMUNITY_ERROR_MESSAGES[code])
    this.name = 'CommunityError'
    this.code = code
  }
}

const KNOWN = new Set<string>(Object.keys(COMMUNITY_ERROR_MESSAGES))

// Saca el código del mensaje de error de Supabase («ALIAS_REQUIRED», «Error: BANNED»…). Cualquier otra cosa → UNKNOWN con frase genérica.
export function toCommunityError(error: unknown): CommunityError {
  const raw = typeof error === 'object' && error !== null ? String((error as { message?: unknown }).message ?? '') : String(error ?? '')
  const match = /\b([A-Z][A-Z_]{3,})\b/.exec(raw)
  if (match && KNOWN.has(match[1])) return new CommunityError(match[1] as CommunityErrorCode)
  return new CommunityError('UNKNOWN')
}

export function communityErrorText(error: unknown): string {
  return error instanceof CommunityError ? error.message : toCommunityError(error).message
}
