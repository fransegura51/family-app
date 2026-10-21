import { FormEvent, useEffect, useState } from 'react'
import { confirmCurrentPassword, getMyAccount, requestIdentityCode, verifyIdentityCode } from '@/data/account'
import { authErrorMessage } from '@/domain/authErrors'
import { isCompleteOtp } from '@/domain/otpCode'
import { OtpCodeField, useResendCooldown } from '@/ui/OtpCodeField'
import { PasswordField } from '@/ui/PasswordField'

// «Confirma que eres tú»: antes de una acción delicada (p. ej. declarar que eres madre/padre de alguien) se vuelve a pedir la contraseña o un código al correo. Es el mismo sistema de
// autenticación de siempre (Supabase Auth): al entrar de nuevo la sesión queda marcada como abierta AHORA, y es eso lo que comprueba el servidor (menos de 5 minutos).
// `onVerified` se ejecuta justo después, con la identificación ya hecha. Si falla, el mensaje se enseña aquí.
export function ReauthStep({ onVerified, actionLabel, onCancel }: { onVerified: () => Promise<void>; actionLabel: string; onCancel: () => void }) {
  const [method, setMethod] = useState<'password' | 'code'>('password')
  const [email, setEmail] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cooldown = useResendCooldown()

  useEffect(() => {
    getMyAccount()
      .then((a) => setEmail(a.email))
      .catch(() => setEmail(null))
  }, [])

  async function run(identify: () => Promise<void>, e?: FormEvent) {
    e?.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await identify()
      await onVerified()
    } catch (err) {
      // Un error de Supabase Auth (tiene `code`) se traduce; un Error ya redactado en español por quien llama se enseña tal cual.
      setError(err instanceof Error && !('code' in err) ? err.message : authErrorMessage(err, 'No se pudo completar. Inténtalo de nuevo.'))
    }
    setBusy(false)
  }

  async function sendCode() {
    setBusy(true)
    setError(null)
    try {
      if (!email) throw new Error('Esta cuenta no tiene correo.')
      await requestIdentityCode(email)
      cooldown.restart()
      setCode('')
      setCodeSent(true)
    } catch (err) {
      setError(authErrorMessage(err, 'No se pudo enviar el código. Inténtalo de nuevo en unos minutos.'))
    }
    setBusy(false)
  }

  return (
    <div style={{ marginTop: 8 }}>
      <strong>Confirma que eres tú</strong>
      {method === 'password' && (
        <form onSubmit={(e) => run(() => confirmCurrentPassword(password), e)}>
          <PasswordField label="Tu contraseña" value={password} onChange={setPassword} autoComplete="current-password" autoFocus />
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={busy || !password}>
            {busy ? 'Comprobando…' : actionLabel}
          </button>
          <button type="button" className="link-button" onClick={() => { setError(null); setMethod('code') }} disabled={busy || !email}>
            Prefiero un código por correo
          </button>
        </form>
      )}
      {method === 'code' && !codeSent && (
        <div>
          <p className="muted" style={{ marginTop: 4 }}>Te mandamos un código de 6 cifras a tu correo.</p>
          {error && <p className="error">{error}</p>}
          <button type="button" onClick={sendCode} disabled={busy || !email}>
            {busy ? 'Enviando…' : 'Enviarme el código'}
          </button>
          <button type="button" className="link-button" onClick={() => { setError(null); setMethod('password') }}>
            Usar mi contraseña
          </button>
        </div>
      )}
      {method === 'code' && codeSent && (
        <form onSubmit={(e) => run(async () => { if (email) await verifyIdentityCode(email, code) }, e)}>
          <OtpCodeField value={code} onChange={setCode} autoFocus />
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={busy || !isCompleteOtp(code)}>
            {busy ? 'Comprobando…' : actionLabel}
          </button>
          <button type="button" className="link-button" onClick={sendCode} disabled={busy || cooldown.left > 0}>
            {cooldown.left > 0 ? `Reenviar código (en ${cooldown.left} s)` : 'Reenviar código'}
          </button>
        </form>
      )}
      <button type="button" className="link-button" onClick={onCancel} disabled={busy}>
        Cancelar
      </button>
    </div>
  )
}
