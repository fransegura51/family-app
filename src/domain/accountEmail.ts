// Correo electrónico de la cuenta: comprobaciones sencillas de la pantalla (la validación de verdad la hace Supabase Auth).
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

export function isPlausibleEmail(raw: string): boolean {
  const email = normalizeEmail(raw)
  return email.length <= 254 && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)
}

export function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  return normalizeEmail(a) === normalizeEmail(b)
}
