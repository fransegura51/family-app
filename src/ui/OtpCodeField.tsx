import { useEffect, useState } from 'react'
import { cleanOtpInput, OTP_LENGTH, RESEND_COOLDOWN_SECONDS } from '@/domain/otpCode'

// Casilla del código de seis cifras que llega por correo. Teclado numérico, autocompletado del código del correo/SMS en el móvil
// (autocomplete="one-time-code") y solo cifras (admite pegar «482 913»).
export function OtpCodeField({ value, onChange, label = 'Código de 6 cifras', autoFocus = false, helpId }: { value: string; onChange: (code: string) => void; label?: string; autoFocus?: boolean; helpId?: string }) {
  return (
    <label data-help-id={helpId}>
      {label}
      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={OTP_LENGTH + 4}
        value={value}
        onChange={(e) => onChange(cleanOtpInput(e.target.value))}
        autoFocus={autoFocus}
        placeholder="______"
        aria-label={label}
        style={{ letterSpacing: 6, fontSize: 22, textAlign: 'center' }}
      />
    </label>
  )
}

/** Cuenta atrás de «Reenviar código»: parada hasta que se llama a `restart()` (justo después de mandar un código) y entonces corre `seconds` segundos. */
export function useResendCooldown(seconds: number = RESEND_COOLDOWN_SECONDS): { left: number; restart: () => void } {
  const [left, setLeft] = useState(0)
  useEffect(() => {
    if (left <= 0) return
    const id = window.setTimeout(() => setLeft((s) => s - 1), 1000)
    return () => window.clearTimeout(id)
  }, [left])
  return { left, restart: () => setLeft(seconds) }
}
