import { FormEvent, useEffect, useState } from 'react'
import pepaLogoSlogan from '@/assets/brand/variants/pepa-family-app-logo-slogan.png'
import { authenticateWithPasskey, listWebauthnCredentials, verifyOwnPin } from '@/data/appLock'
import { errorMessage } from '@/domain/errorMessage'
import { PasswordField } from '@/ui/PasswordField'
import { PinRecoveryPanel } from '@/ui/PinRecoveryPanel'

// Pantalla de bloqueo — solo se muestra si esta persona activó un PIN
// en Ajustes (ver AppLockSection en MenuSettingsScreen.tsx); si nunca
// lo activó, AppLockGate ni siquiera monta este componente.
export function AppLockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [hasPasskey, setHasPasskey] = useState(false)
  const [passkeyBusy, setPasskeyBusy] = useState(false)
  // «¿Has olvidado tu PIN?»: la persona se identifica con su cuenta (contraseña o código del correo), sin administradores de por medio.
  const [recovering, setRecovering] = useState(false)

  useEffect(() => {
    listWebauthnCredentials()
      .then((creds) => setHasPasskey(creds.length > 0))
      .catch(() => {})
  }, [])

  async function handlePasskey() {
    setPasskeyBusy(true)
    setError(null)
    try {
      const ok = await authenticateWithPasskey()
      if (ok) {
        onUnlock()
        return
      }
      setError('No se ha podido comprobar la huella')
    } catch {
      // Cancelado por la persona, o el dispositivo no dejó completar el
      // gesto — no es un error de PIN, así que no se cuenta como intento
      // fallido; simplemente se queda en la pantalla de bloqueo.
    } finally {
      setPasskeyBusy(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setChecking(true)
    setError(null)
    try {
      const ok = await verifyOwnPin(pin)
      if (ok) {
        onUnlock()
        return
      }
      setError('PIN incorrecto')
      setPin('')
    } catch (err) {
      setError(
        // El RPC devuelve un objeto plano, no un Error (ver
        // domain/errorMessage): con `instanceof Error` este aviso de
        // bloqueo nunca se mostraba.
        errorMessage(err, '') === 'PIN_LOCKED'
          ? 'Demasiados intentos — espera unos minutos e inténtalo de nuevo.'
          : 'No se pudo comprobar el PIN',
      )
      setPin('')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="screen screen-centered">
      <div className="card app-lock-card">
        {/* Logotipo oficial (con eslogan), igual que la pantalla de entrada. */}
        <img src={pepaLogoSlogan} alt="Pepa Family App — Pepa te lo soluciona" style={{ width: '100%', maxWidth: 240, height: 'auto', marginBottom: 4 }} />
        <h1 style={{ marginTop: 0 }}>🔒 App bloqueada</h1>
        {recovering ? (
          <PinRecoveryPanel onFinished={onUnlock} onCancel={() => setRecovering(false)} />
        ) : (
          <>
            <p className="muted">Introduce tu PIN para continuar.</p>
            <form onSubmit={handleSubmit}>
              <PasswordField numeric ariaLabel="PIN" value={pin} onChange={setPin} required={false} autoFocus inputClassName="app-lock-input" />
              {error && <p className="error">{error}</p>}
              <button type="submit" disabled={checking || pin.length < 4} style={{ width: '100%', marginTop: 8 }}>
                {checking ? 'Comprobando…' : 'Desbloquear'}
              </button>
            </form>
            {hasPasskey && (
              <button type="button" className="link-button" onClick={handlePasskey} disabled={passkeyBusy} style={{ width: '100%', marginTop: 8 }}>
                {passkeyBusy ? 'Comprobando…' : '👆 Usar huella / Face ID'}
              </button>
            )}
            <button type="button" className="link-button" onClick={() => setRecovering(true)} style={{ width: '100%', marginTop: 8 }}>
              ¿Has olvidado tu PIN?
            </button>
            <p className="muted app-lock-hint">Lo recuperas tú misma con tu contraseña o con un código que te llega al correo; no hace falta que nadie de la familia te ayude.</p>
          </>
        )}
      </div>
    </div>
  )
}
