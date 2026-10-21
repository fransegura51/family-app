// Fecha de nacimiento obligatoria al dar de alta una cuenta (crear familia o unirse con código). El servidor lo exige igual (0286): aquí solo se evita el viaje y se explica.
// Fecha válida: formato AAAA-MM-DD, existente, no futura y no anterior a 1900.
export const MIN_BIRTH_DATE = '1900-01-01'

export const BIRTH_DATE_HELP = 'Es obligatoria. La usamos para saber tu edad (por ejemplo, Comunidad PEPA es solo para personas de 18 años o más). Solo la ve tu familia dentro de PEPA, en tu ficha.'

export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// null = fecha válida; si no, la frase para la persona.
export function birthDateError(value: string, now: Date = new Date()): string | null {
  const v = value.trim()
  if (v === '') return 'Indica tu fecha de nacimiento.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'La fecha de nacimiento no es válida.'
  const [y, m, d] = v.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return 'La fecha de nacimiento no es válida.'
  if (v > todayIso(now)) return 'La fecha de nacimiento no puede ser futura.'
  if (v < MIN_BIRTH_DATE) return 'La fecha de nacimiento no es válida.'
  return null
}

// Frase para los errores del servidor (el texto empieza por el código).
export function signupBirthDateServerMessage(error: unknown): string | null {
  const raw = typeof error === 'object' && error !== null ? String((error as { message?: unknown }).message ?? '') : String(error ?? '')
  if (/BIRTH_DATE_REQUIRED_ON_PROFILE/.test(raw)) return 'La ficha de esta persona no tiene fecha de nacimiento. Pide a quien te invitó que la ponga en tu ficha y vuelve a intentarlo.'
  if (/ADULT_REQUIRED/.test(raw)) return 'Una cuenta de persona adulta requiere ser mayor de edad. Revisa la fecha de nacimiento.'
  if (/BIRTH_DATE_REQUIRED/.test(raw)) return 'Falta tu fecha de nacimiento. Si ves este mensaje con la fecha puesta, actualiza la app y vuelve a intentarlo.'
  if (/BIRTH_DATE_INVALID/.test(raw)) return 'La fecha de nacimiento no es válida.'
  return null
}
