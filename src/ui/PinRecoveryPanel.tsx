import { FormEvent, useEffect, useState } from 'react'
import { getMyAccount, requestIdentityCode, confirmCurrentPassword, verifyIdentityCode } from '@/data/account'
import { resetOwnPinAfterRecentAuth, setOwnPin } from '@/data/appLock'
import { authErrorMessage } from '@/domain/authErrors'
import { APP_LOCK_CHANGED_EVENT } from '@/domain/appLockPolicy'
import { isCompleteOtp } from '@/domain/otpCode'
import { errorMessage } from '@/domain/errorMessage'
import { OtpCodeField, useResendCooldown } from '@/ui/OtpCodeField'
import { PasswordField } from '@/ui/PasswordField'

// «He olvidado mi PIN». La persona se identifica con SU cuenta (contraseña, o código de seis cifras al correo) y el servidor quita el PIN y borra las huellas
// / Face ID anteriores SOLO si esa identificación es de los últimos 5 minutos (reset_own_pin_after_recent_auth): una sesión que llevaba abierta días no vale
// para esto. No interviene ningún administrador de la familia. Sirve igual desde la pantalla de bloqueo que desde Configuración → Seguridad.
type Step = 'choose' | 'password' | 'code' | 'new-pin'

export function PinRecoveryPanel({ onFinished, onCancel }: { onFinished: () => void; onCancel: () => void }) {
  const [step, setStep] = useState<Step>('choose')
  const [email, setEmail] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const cooldown = useResendCooldown()

  useEffect(() => {
    getMyAccount()
      .then((a) => setEmail(a.email))
      .catch(() => setEmail(null))
  }, [])

  async function removePin() {
    try {
      await resetOwnPinAfterRecentAuth()
      window.dispatchEvent(new Event(APP_LOCK_CHANGED_EVENT))
      setStep('new-pin')
    } catch (err) {
      setError(
        errorMessage(err, '') === 'RECENT_AUTH_REQUIRED'
          ? 'No hemos podido confirmar que eres tú. Inténtalo de nuevo.'
          : authErrorMessage(err, 'No se pudo recuperar el PIN. Inténtalo de nuevo.'),
      )
    }
  }

  async function handlePassword(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await confirmCurrentPassword(password)
      setPassword('')
      await removePin()
    } catch (err) {
      setError(authErrorMessage(err, 'No se pudo comprobar la contraseña.'))
    }
    setBusy(false)
  }

  async function startCode() {
    setBusy(true)
    setError(null)
    try {
      if (!email) throw new Error('Esta cuenta no tiene correo.')
      await requestIdentityCode(email)
      cooldown.restart()
      setCode('')
      setStep('code')
    } catch (err) {
      setError(authErrorMessage(err, 'No se pudo enviar el código. Inténtalo de nuevo en unos minutos.'))
    }
    setBusy(false)
  }

  async function handleCode(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (!email) throw new Error('Esta cuenta no tiene correo.')
      await verifyIdentityCode(email, code)
      await removePin()
    } catch (err) {
      setError(authErrorMessage(err, 'No se pudo comprobar el código.'))
    }
    setBusy(false)
  }

  async function handleNewPin(e: FormEvent) {
    e.preventDefault()
    if (!/^[0-9]{4,6}$/.test(pin)) {
      setError('El PIN debe tener entre 4 y 6 dígitos')
      return
    }
    if (pin !== pinConfirm) {
      setError('Los dos PIN no coinciden')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await setOwnPin(pin)
      window.dispatchEvent(new Event(APP_LOCK_CHANGED_EVENT))
      onFinished()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo activar el PIN'))
    }
    setBusy(false)
  }

  return (
    <div className="card" style={{ marginTop: 8 }}>
      {step === 'choose' && (
        <>
          <strong>Recuperar mi PIN</strong>
          <p className="muted" style={{ marginTop: 4 }}>
            Para quitar el PIN antiguo hay que comprobar que eres tú. Elige cómo:
          </p>
          {error && <p className="error">{error}</p>}
          <button type="button" onClick={() => setStep('password')} disabled={busy}>
            Con mi contraseña
          </button>
          <button type="button" className="link-button" onClick={startCode} disabled={busy || !email}>
            {busy ? 'Enviando…' : 'Con un código que me llega al correo'}
          </button>
          <button type="button" className="link-button" onClick={onCancel}>
            Cancelar
          </button>
        </>
      )}

      {step === 'password' && (
        <form onSubmit={handlePassword}>
          <strong>Escribe tu contraseña</strong>
          <PasswordField label="Contraseña de tu cuenta" value={password} onChange={setPassword} autoComplete="current-password" autoFocus />
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={busy || !password}>
            {busy ? 'Comprobando…' : 'Quitar el PIN antiguo'}
          </button>
          <button type="button" className="link-button" onClick={() => { setError(null); setStep('choose') }}>
            Atrás
          </button>
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={handleCode}>
          <strong>Escribe el código del correo</strong>
          <p className="muted" style={{ marginTop: 4 }}>
            Te hemos mandado un código de 6 cifras a tu correo. Si no llega, mira en «no deseado».
          </p>
          <OtpCodeField value={code} onChange={setCode} autoFocus />
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={busy || !isCompleteOtp(code)}>
            {busy ? 'Comprobando…' : 'Quitar el PIN antiguo'}
          </button>
          <button type="button" className="link-button" onClick={startCode} disabled={busy || cooldown.left > 0}>
            {cooldown.left > 0 ? `Reenviar código (en ${cooldown.left} s)` : 'Reenviar código'}
          </button>
          <button type="button" className="link-button" onClick={() => { setError(null); setStep('choose') }}>
            Atrás
          </button>
        </form>
      )}

      {step === 'new-pin' && (
        <form onSubmit={handleNewPin}>
          <strong>PIN antiguo quitado</strong>
          <p className="muted" style={{ marginTop: 4 }}>
            Por seguridad también se han borrado las huellas y Face ID anteriores. Puedes elegir un PIN nuevo ahora o dejarlo para más tarde (Configuración → Seguridad).
          </p>
          <label>
            Nuevo PIN (4-6 dígitos)
            <PasswordField numeric value={pin} onChange={setPin} required={false} autoFocus ariaLabel="Nuevo PIN (4-6 dígitos)" />
          </label>
          <label>
            Repite el PIN
            <PasswordField numeric value={pinConfirm} onChange={setPinConfirm} required={false} ariaLabel="Repite el PIN" />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={busy || pin.length < 4}>
            {busy ? 'Guardando…' : 'Activar PIN nuevo'}
          </button>
          <button type="button" className="link-button" onClick={onFinished}>
            Ahora no
          </button>
        </form>
      )}
    </div>
  )
}
