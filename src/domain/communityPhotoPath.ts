// Comunidad PEPA — forma de la ruta de una foto en el almacenamiento PRIVADO «community-media»: `<id del perfil>/<uuid>.<extensión>`.
// La comparten el Worker de las páginas públicas (que sirve `/c/img/<ruta>`) y la aplicación; por eso vive aquí, sin dependencias.
// Es una lista cerrada a propósito: lo que no encaja (otras carpetas, «..», barras dobles, %2F, mayúsculas, extensiones raras) ni se pide a Supabase.

export const COMMUNITY_MEDIA_BUCKET = 'community-media'
export const MAX_PHOTO_PATH_LENGTH = 200

const HEX_UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const PHOTO_PATH_RE = new RegExp(`^${HEX_UUID}/${HEX_UUID}\.(?:jpe?g|png|webp)$`)

export function isCommunityPhotoPath(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_PHOTO_PATH_LENGTH && PHOTO_PATH_RE.test(value) && !value.includes('..')
}
