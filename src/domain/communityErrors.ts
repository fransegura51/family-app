// Errores de Comunidad: el servidor lanza excepciones con un CÓDIGO en el mensaje; aquí se convierten en frases claras en español.

export type CommunityErrorCode =
  | 'AUTH_REQUIRED'
  | 'ALIAS_REQUIRED'
  | 'ALIAS_INVALID'
  | 'ALIAS_RESERVED'
  | 'ALIAS_TAKEN'
  | 'RULES_REQUIRED'
  | 'ADULT_DECLARATION_REQUIRED'
  | 'BANNED'
  | 'NOT_LAUNCHED'
  | 'COMMUNITY_ACCESS_DENIED'
  | 'PARTICIPATION_NOT_ALLOWED'
  | 'PHOTOS_NOT_ALLOWED'
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
  | 'MENU_INVALID'
  | 'MENU_TEXT_STALE'
  | 'MENU_WEEK_TAKEN'
  | 'MENU_WEEK_PAST'
  | 'BAD_PUBLISH_AT'
  | 'STALE'
  | 'UNKNOWN'

export const COMMUNITY_ERROR_MESSAGES: Record<CommunityErrorCode, string> = {
  AUTH_REQUIRED: 'Entra en tu cuenta de PEPA para hacer esto.',
  ALIAS_REQUIRED: 'Antes de participar elige tu alias público.',
  ALIAS_INVALID: 'El alias debe tener entre 3 y 24 caracteres: letras, números, espacios, puntos, guiones o guiones bajos.',
  ALIAS_RESERVED: 'Ese alias no está permitido (no puede parecerse a Pepa, al equipo ni a la administración).',
  ALIAS_TAKEN: 'Ese alias ya lo usa otra persona. Prueba con otro.',
  RULES_REQUIRED: 'Tienes que aceptar las normas de Comunidad para participar.',
  ADULT_DECLARATION_REQUIRED: 'Marca la casilla «Confirmo que tengo 18 años o más» para poder participar.',
  BANNED: 'Ahora mismo no puedes participar en Comunidad. Puedes seguir leyendo.',
  NOT_LAUNCHED: 'Comunidad todavía no está abierta. ¡Pronto!',
  // Regla de edad y permisos (migración 0277): sustituye a la antigua «solo adultos» (ADULT_REQUIRED ya no existe en el servidor).
  COMMUNITY_ACCESS_DENIED: 'Ahora mismo no tienes acceso a Comunidad con esta cuenta: es solo para personas de 18 años o más, con la fecha de nacimiento en su ficha de Familia.',
  PARTICIPATION_NOT_ALLOWED: 'Tienes permiso solo de lectura: puedes leer Comunidad, pero no participar.',
  // Permisos de personas menores (0277): al dar un permiso hay que declarar ser madre, padre o tutor legal, y las personas menores participan sin fotos.
  PHOTOS_NOT_ALLOWED: 'Las personas menores de edad participan en Comunidad sin fotos. Quita las fotos e inténtalo de nuevo.',
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
  MENU_INVALID: 'El menú no es válido (7 días con comida y cena, recetas completas, sin platos repetidos de más…). Mira los avisos de la revisión del menú.',
  MENU_TEXT_STALE: 'Has cambiado el texto del menú sin revisar sus datos. Comprueba que el texto y el menú dicen lo mismo y confírmalo para aprobarlo.',
  MENU_WEEK_TAKEN: 'Esa semana ya tiene otro menú aprobado o publicado. Solo puede haber uno por semana: rechaza o reprograma el otro.',
  MENU_WEEK_PAST: 'La semana de este menú ya ha terminado: ya no se puede publicar. Reprográmalo a otro sábado o recházalo.',
  BAD_PUBLISH_AT: 'La fecha tiene que ser un sábado futuro a las 10:00 (hora peninsular).',
  STALE: 'El borrador cambió mientras tanto, así que la propuesta de Pepa ya no vale. Pide una nueva y se aplicará sobre la versión actual.',
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
// Códigos que un servidor anterior a 0277 aún podía devolver: se tratan como «solo lectura» en vez de caer en «Algo ha fallado».
const LEGACY_CODES: Record<string, CommunityErrorCode> = { ADULT_REQUIRED: 'PARTICIPATION_NOT_ALLOWED' }

// Aviso de «el acceso ha cambiado»: el servidor recalcula el acceso en cada llamada, así que una sesión ya abierta puede recibir estos dos errores si la
// familia retira un permiso. CommunityProvider se suscribe aquí (un único punto común) para refrescar el acceso y avisar con amabilidad, sin pantallas rotas.
export type CommunityAccessErrorCode = 'COMMUNITY_ACCESS_DENIED' | 'PARTICIPATION_NOT_ALLOWED'
const accessErrorListeners = new Set<(code: CommunityAccessErrorCode) => void>()

export function onCommunityAccessError(listener: (code: CommunityAccessErrorCode) => void): () => void {
  accessErrorListeners.add(listener)
  return () => {
    accessErrorListeners.delete(listener)
  }
}

// Saca el código del mensaje de error de Supabase («ALIAS_REQUIRED», «Error: BANNED»…). Cualquier otra cosa → UNKNOWN con frase genérica.
export function toCommunityError(error: unknown): CommunityError {
  const raw = typeof error === 'object' && error !== null ? String((error as { message?: unknown }).message ?? '') : String(error ?? '')
  const match = /\b([A-Z][A-Z_]{3,})\b/.exec(raw)
  const found = match ? (KNOWN.has(match[1]) ? (match[1] as CommunityErrorCode) : LEGACY_CODES[match[1]]) : undefined
  const result = new CommunityError(found ?? 'UNKNOWN')
  if (result.code === 'COMMUNITY_ACCESS_DENIED' || result.code === 'PARTICIPATION_NOT_ALLOWED') {
    for (const listener of [...accessErrorListeners]) listener(result.code)
  }
  return result
}

// Código de un error ya convertido (CommunityError) o de uno crudo del servidor. OJO: un CommunityError no se debe volver a pasar por toCommunityError, porque su
// mensaje ya es la frase en español y no contiene el código.
export function communityErrorCode(error: unknown): CommunityErrorCode {
  return error instanceof CommunityError ? error.code : toCommunityError(error).code
}

export function communityErrorText(error: unknown): string {
  return error instanceof CommunityError ? error.message : toCommunityError(error).message
}
