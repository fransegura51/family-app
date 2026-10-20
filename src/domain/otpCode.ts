// Código de verificación del correo: seis cifras (el que Supabase manda con {{ .Token }}; ver supabase/email-templates).
export const OTP_LENGTH = 6

/** Deja solo las cifras (quien pega «482 913» o «482-913» desde el correo no tiene que corregir nada) y corta a seis. */
export function cleanOtpInput(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, OTP_LENGTH)
}

export function isCompleteOtp(code: string): boolean {
  return new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code)
}

/** Espera entre un «reenviar código» y el siguiente. Supabase ya exige 60 s por cuenta (over_email_send_rate_limit): aquí se avisa antes de pedirlo. */
export const RESEND_COOLDOWN_SECONDS = 60
