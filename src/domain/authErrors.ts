// Mensajes comprensibles para los errores de Supabase Auth (acceso, códigos del correo, cambio de contraseña y de correo).
// Supabase devuelve un `code` estable (AuthError.code) además del texto en inglés: se usa el código, nunca el texto. Nunca se enseña el error en
// inglés tal cual; lo que no se reconoce cae en el mensaje que pasa quien llama. Un código incorrecto y uno caducado son el MISMO error para
// Supabase (otp_expired) y se explican juntos a propósito: no se da pista de cuál de los dos es.
const MESSAGES: Record<string, string> = {
  otp_expired: 'El código no es correcto o ha caducado. Comprueba que lo has escrito bien o pide uno nuevo.',
  otp_disabled: 'Este tipo de código no está disponible ahora mismo.',
  invalid_credentials: 'El correo o la contraseña no son correctos.',
  email_not_confirmed: 'Todavía no has confirmado tu correo. Escribe el código que te hemos enviado.',
  email_exists: 'Ese correo ya está en uso en otra cuenta de PEPA.',
  email_address_invalid: 'Ese correo no parece válido. Revísalo.',
  email_address_not_authorized: 'No se pueden enviar correos a esa dirección ahora mismo.',
  over_email_send_rate_limit: 'Se han pedido demasiados correos seguidos. Espera unos minutos e inténtalo de nuevo.',
  over_request_rate_limit: 'Demasiados intentos seguidos. Espera unos minutos e inténtalo de nuevo.',
  same_password: 'La contraseña nueva tiene que ser distinta de la actual.',
  weak_password: 'Esa contraseña es demasiado fácil de adivinar. Prueba con otra más larga o menos común.',
  user_not_found: 'No encontramos esa cuenta.',
  reauthentication_needed: 'Por seguridad, confirma primero que eres tú.',
  reauthentication_not_valid: 'El código de verificación no es correcto.',
  session_expired: 'Tu sesión ha caducado. Vuelve a entrar.',
  signup_disabled: 'Ahora mismo no se pueden crear cuentas nuevas.',
  validation_failed: 'Revisa los datos que has escrito.',
}

export function authErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null) {
    const code = (err as { code?: unknown }).code
    if (typeof code === 'string' && MESSAGES[code]) return MESSAGES[code]
    // Versiones antiguas / otros servicios: reconocer los casos más frecuentes por su texto estable.
    const message = (err as { message?: unknown }).message
    if (typeof message === 'string') {
      const m = message.toLowerCase()
      if (m.includes('token has expired') || m.includes('invalid or has expired') || m.includes('otp')) return MESSAGES.otp_expired
      if (m.includes('invalid login credentials')) return MESSAGES.invalid_credentials
      if (m.includes('rate limit')) return MESSAGES.over_request_rate_limit
      if (m.includes('should be different from the old password')) return MESSAGES.same_password
    }
  }
  return fallback
}
