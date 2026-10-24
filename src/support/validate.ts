import type { SupportKind } from '@/support/types'

// Límites de Soporte, iguales a los del servidor (migración 0310): el servidor es quien manda; esto solo evita enviar lo que se va a rechazar.
export const SUBJECT_MIN = 3
export const SUBJECT_MAX = 120
export const BODY_MAX = 4000
export const ATTACH_MAX_BYTES = 5 * 1024 * 1024
export const ATTACH_MAX_PER_MESSAGE = 3
export const ATTACH_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain'] as const
export const KINDS: SupportKind[] = ['tecnico', 'error', 'resultado_incorrecto', 'clasificacion', 'sincronizacion', 'otra']

export function validateTicketDraft(d: { subject: string; body: string }): string | null {
  const subject = d.subject.trim()
  const body = d.body.trim()
  if (subject.length < SUBJECT_MIN) return 'Pon un título corto de al menos 3 letras.'
  if (subject.length > SUBJECT_MAX) return `El título es demasiado largo (máximo ${SUBJECT_MAX} letras).`
  if (body.length < 1) return 'Cuéntanos qué ha pasado.'
  if (body.length > BODY_MAX) return `El texto es demasiado largo (máximo ${BODY_MAX} letras).`
  return null
}

export function validateMessage(body: string): string | null {
  const b = body.trim()
  if (!b) return 'Escribe tu mensaje.'
  if (b.length > BODY_MAX) return `El mensaje es demasiado largo (máximo ${BODY_MAX} letras).`
  return null
}

export function validateAttachment(file: { type: string; size: number; name: string }): string | null {
  if (!(ATTACH_MIME as readonly string[]).includes(file.type)) return `«${file.name}» no se puede adjuntar: solo fotos (JPG, PNG, WebP), PDF o texto.`
  if (file.size > ATTACH_MAX_BYTES) return `«${file.name}» pesa demasiado (máximo 5 MB).`
  if (file.size < 1) return `«${file.name}» está vacío.`
  return null
}

// Extensión segura para la ruta de Storage: la dicta el tipo; solo letras y números.
export function safeExtension(name: string, mime: string): string {
  const fromMime: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf', 'text/plain': 'txt' }
  const ext = (name.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  return fromMime[mime] ?? (ext.slice(0, 5) || 'bin')
}

export function attachmentPath(familyId: string, ticketId: string, id: string, ext: string): string {
  return `${familyId}/support/${ticketId}/${id}.${ext}`
}

// Errores del servidor → frase para la persona (nunca el texto técnico).
export function supportErrorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : ''
  if (/RATE_LIMIT/.test(msg)) return 'Has enviado muchas incidencias o mensajes hoy. Espera un poco y vuelve a intentarlo.'
  if (/INVALID_SUBJECT|INVALID_BODY/.test(msg)) return 'Revisa el título y el texto: alguno es demasiado corto o demasiado largo.'
  if (/NOT_FOUND/.test(msg)) return 'No he encontrado esa incidencia.'
  if (/NOT_AUTHORIZED|NOT_ADMIN/.test(msg)) return 'No tienes permiso para hacer esto.'
  if (/INVALID_STATE/.test(msg)) return 'Esa incidencia no está en un estado en el que se pueda hacer eso.'
  if (/INVALID_FILE|INVALID_PATH/.test(msg)) return 'No se ha podido guardar el adjunto (tipo o tamaño no permitido).'
  return 'No se ha podido completar ahora mismo. No se ha perdido nada; inténtalo de nuevo en un momento.'
}
