// Invitaciones a PEPA. Hay DOS tipos y no se mezclan (PEPA sigue siendo privada: sin invitación válida no se crea ninguna cuenta):
//  · «family»: la genera SOLO una administradora de PEPA y autoriza crear un espacio familiar nuevo.
//  · «member»: la genera una administradora de la familia (o una madre/padre vinculado, solo para su hijo menor) y autoriza vincular una cuenta a una FICHA existente.
// El código de 6 cifras del correo es otra cosa: solo confirma un correo, y no sustituye a ninguna invitación.
export type InvitationKind = 'family' | 'member'

export const INVITATION_SUPPORT_EMAIL = 'info@pepafamilyapp.es'

export interface InvitationCheck {
  valid: boolean
  kind?: InvitationKind
  expiresAt?: string | null
  /** false cuando la ficha ya trae la fecha de nacimiento: la pantalla no la pide (y la del servidor manda). */
  needsBirthDate?: boolean
  /** Demasiados intentos desde esta conexión. */
  throttled?: boolean
}

/** Convierte la respuesta de `check_invitation` (la base de datos) al formato de la app. Cualquier cosa rara se trata como «no válida». */
export function parseInvitationCheck(raw: unknown): InvitationCheck {
  if (typeof raw !== 'object' || raw === null) return { valid: false }
  const r = raw as Record<string, unknown>
  if (r.throttled === true) return { valid: false, throttled: true }
  if (r.valid !== true || (r.kind !== 'family' && r.kind !== 'member')) return { valid: false }
  return {
    valid: true,
    kind: r.kind,
    expiresAt: typeof r.expires_at === 'string' ? r.expires_at : null,
    needsBirthDate: r.needs_birth_date !== false,
  }
}

/** Quita los espacios (quien copia «ABCD EFGH» o lo pega con saltos no tiene que corregir nada). NO cambia mayúsculas ni signos: el servidor ya ignora las mayúsculas de las invitaciones y el código maestro (compatibilidad) las distingue. */
export function normalizeInvitationCode(raw: string): string {
  return raw.replace(/\s+/g, '')
}

/** Longitud razonable antes de preguntar al servidor (evita llamadas con basura). */
export function looksLikeInvitationCode(code: string): boolean {
  return code.length >= 6 && code.length <= 40
}

/** Frase para los errores de invitación (del servidor o del gancho de alta). Nunca da pistas de si un código existe. */
export function invitationErrorMessage(err: unknown): string | null {
  const raw = typeof err === 'object' && err !== null ? String((err as { message?: unknown }).message ?? '') : String(err ?? '')
  if (/INVITATION_IN_USE/.test(raw)) return 'Esta invitación ya la está usando otra persona. Pídele a quien te invitó una nueva.'
  if (/INVITATION_REQUIRED|INVITATION_INVALID/.test(raw)) return 'La invitación no es válida o ha caducado. Pídele una nueva a quien te invitó.'
  if (/Código no válido o caducado|Código de acceso incorrecto/.test(raw)) return 'La invitación no es válida o ha caducado. Pídele una nueva a quien te invitó.'
  if (/NOT_AUTHORIZED/.test(raw)) return 'No tienes permiso para dar acceso a esta persona.'
  if (/MEMBER_NOT_INVITABLE/.test(raw)) return 'Un bebé no tiene cuenta propia.'
  if (/BIRTH_DATE_REQUIRED_ON_PROFILE/.test(raw)) return 'Falta la fecha de nacimiento en la ficha. Ponla en la ficha (botón ⋯ → Editar) y vuelve a intentarlo.'
  if (/ADULT_REQUIRED/.test(raw)) return 'Esta cuenta es de una persona adulta y la fecha indica que es menor de edad.'
  return null
}

const pad = (n: number) => String(n).padStart(2, '0')

/** «hoy a las 14:30», «mañana a las 14:30» o «el 22/10/2026 a las 14:30». */
export function formatInvitationExpiry(expiresAt: string | Date, now: Date = new Date()): string {
  const d = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt
  if (Number.isNaN(d.getTime())) return ''
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const dayKey = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`
  const tomorrow = new Date(now.getTime() + 24 * 3600e3)
  if (dayKey(d) === dayKey(now)) return `hoy a las ${hm}`
  if (dayKey(d) === dayKey(tomorrow)) return `mañana a las ${hm}`
  return `el ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} a las ${hm}`
}

export interface InvitationMessageInput {
  kind: InvitationKind
  code: string
  expiresAt: string | Date | null
  /** Dirección de la aplicación (sin el código). */
  appUrl: string
  inviterName?: string | null
  recipientName?: string | null
  now?: Date
}

/** Dirección de registro oficial con el código ya puesto (la pantalla de entrada lo reconoce y lo rellena). */
export function invitationLink(appUrl: string, code: string): string {
  const base = appUrl.endsWith('/') ? appUrl : appUrl + '/'
  return `${base}?invitacion=${encodeURIComponent(code)}`
}

/** El mismo texto con instrucciones para copiar, compartir o mandar por WhatsApp. */
export function buildInvitationMessage(input: InvitationMessageInput): string {
  const { kind, code, appUrl, inviterName, recipientName } = input
  const hello = recipientName ? `Hola ${recipientName}.` : 'Hola.'
  const who = inviterName ? `${inviterName} te invita` : 'Te invitan'
  const what =
    kind === 'family' ? 'a crear tu espacio familiar en PEPA, la app de «Tu familia organizada».' : 'a unirte a tu familia en PEPA, la app de «Tu familia organizada».'
  const expiry = input.expiresAt ? `válido hasta ${formatInvitationExpiry(input.expiresAt, input.now)}, un solo uso` : 'un solo uso'
  const lines = [
    `${hello} ${who} ${what}`,
    '',
    `Tu código de invitación: ${code}`,
    `(${expiry})`,
    '',
    'Para crear tu cuenta:',
    `1. Abre ${invitationLink(appUrl, code)}`,
    '2. Si no se ha rellenado solo, pulsa «Tengo una invitación» y escribe el código.',
    '3. Escribe tu correo y elige una contraseña.',
    '4. Te llegará un correo con un código de 6 cifras: escríbelo para confirmar tu correo (es distinto del código de invitación).',
    kind === 'family' ? '5. Pon el nombre de tu familia y tus datos.' : '5. Completa tus datos y ya estarás dentro de tu familia.',
    '',
    `¿Necesitas ayuda? Escribe a ${INVITATION_SUPPORT_EMAIL}`,
  ]
  return lines.join('\n')
}

export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}
