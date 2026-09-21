// Texto comercial de un producto de ticket: clave estable (text_key) y comprobación de privacidad. Sin IA, sin red, sin datos.
//
// La clave normaliza solo lo trivial (mayúsculas, tildes, signos, espacios) y NO quita palabras, números, tallas ni variantes:
// dos productos distintos no deben fundirse. Es la misma regla con la que se auditaron las claves candidatas de la Fase 0.

/** Clave estable del texto de un producto: sin tildes, minúsculas, cualquier signo/espacio → un espacio, sin bordes. */
export function productTextKey(raw: string): string {
  return raw
    .normalize('NFKC') // formas de compatibilidad (ancho completo, ligaduras) a su forma normal
    .normalize('NFD')
    .replace(/\p{M}+/gu, '') // quita las marcas combinadas (tildes, diéresis, tilde de la ñ)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ') // "0,0" y "0.0" → "0 0"; "P-6" → "p 6"; conserva letras y dígitos de cualquier alfabeto
    .trim()
}

/** Agrupa por clave los textos que colisionan (dos o más textos distintos con la misma clave). Útil para auditar antes de sembrar. */
export function findTextKeyCollisions(texts: readonly string[]): Map<string, string[]> {
  const byKey = new Map<string, Set<string>>()
  for (const text of texts) {
    const key = productTextKey(text)
    if (!key) continue
    const set = byKey.get(key) ?? new Set<string>()
    set.add(text)
    byKey.set(key, set)
  }
  const collisions = new Map<string, string[]>()
  for (const [key, set] of byKey) if (set.size > 1) collisions.set(key, [...set])
  return collisions
}

export type CommercialTextIssue =
  | 'empty' // nada que analizar
  | 'no_letters' // solo números y signos
  | 'too_short'
  | 'too_long' // una descripción de ticket es corta; un texto largo es texto libre
  | 'too_many_words'
  | 'multiline'
  | 'email'
  | 'url'
  | 'long_number' // teléfono, DNI, tarjeta, código de barras...
  | 'iban'

export type CommercialTextCheck = { ok: true } | { ok: false; issues: CommercialTextIssue[] }

const MAX_LENGTH = 60
const MAX_WORDS = 8
const MAX_DIGITS = 8 // 9 dígitos o más (seguidos o en grupos separados por un espacio, punto o guion) se rechazan
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/u
const URL_WITH_SCHEME = /\b(?:https?:\/\/|www\.)\S+/i
const URL_BARE_DOMAIN = /\b[a-z0-9-]{2,}\.(?:com|es|net|org|eu|info|io|co|app|me|cat|shop|online|store)\b/i
const IBAN = /\b[a-z]{2}\d{2}(?:[ -]?[a-z0-9]{4}){3,}(?:[ -]?[a-z0-9]{1,4})?\b/i

function hasLongNumber(text: string): boolean {
  // grupos de dígitos unidos por UN separador simple; el total de dígitos de la cadena no puede pasar de MAX_DIGITS
  for (const match of text.matchAll(/\d+(?:[ .-]\d+)*/g)) {
    if (match[0].replace(/\D/g, '').length > MAX_DIGITS) return true
  }
  return false
}

/**
 * Comprueba que un texto tiene pinta de descripción comercial de un ticket y NO de dato personal. Rechaza como mínimo correos,
 * direcciones web, IBAN, secuencias numéricas anormalmente largas y textos claramente incompatibles con una descripción corta.
 * NO detecta nombres propios: eso no es posible de forma fiable sin IA; por eso la Fase 4 solo trabajará con un conjunto revisado.
 */
export function checkCommercialText(raw: string): CommercialTextCheck {
  const text = raw ?? ''
  if (text.trim() === '') return { ok: false, issues: ['empty'] }

  const issues: CommercialTextIssue[] = []
  if (/[\r\n]/.test(text)) issues.push('multiline')
  if (text.length > MAX_LENGTH) issues.push('too_long')
  if (EMAIL.test(text)) issues.push('email')
  if (URL_WITH_SCHEME.test(text) || URL_BARE_DOMAIN.test(text)) issues.push('url')
  if (IBAN.test(text)) issues.push('iban')
  if (hasLongNumber(text)) issues.push('long_number')

  const key = productTextKey(text)
  if (!/\p{L}/u.test(key)) issues.push('no_letters')
  else if (key.replace(/\s/g, '').length < 2) issues.push('too_short')
  if (key.split(' ').filter(Boolean).length > MAX_WORDS) issues.push('too_many_words')

  return issues.length === 0 ? { ok: true } : { ok: false, issues }
}
