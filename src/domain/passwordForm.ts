// Contraseñas nuevas: se escriben dos veces y tienen que coincidir antes de enviar nada. Las reglas de seguridad de Supabase (longitud mínima, etc.) no se tocan.
export const PASSWORD_MISMATCH_MESSAGE = 'Las contraseñas no coinciden'

// Longitud mínima que ya pedía cada formulario (la misma que Supabase).
export const PASSWORD_MIN_LENGTH = 6

export function passwordsMatch(password: string, confirm: string): boolean {
  return password === confirm
}

// Aviso en vivo: solo cuando la persona ya ha empezado a escribir la repetición y todavía no es igual.
export function showPasswordMismatch(password: string, confirm: string): boolean {
  return confirm.length > 0 && password !== confirm
}
