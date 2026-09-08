import { FormEvent, useState } from 'react'
import { verifyOwnPin } from '@/data/appLock'

// Pantalla de bloqueo — solo se muestra si esta persona activó un PIN
// en Ajustes (ver AppLockSection en MenuSettingsScreen.tsx); si nunca
// lo activó, AppLockGate ni siquiera monta este componente.
export function AppLockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

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
        err instanceof Error && err.message === 'PIN_LOCKED'
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
        <h1 style={{ marginTop: 0 }}>🔒 App bloqueada</h1>
        <p className="muted">Introduce tu PIN para continuar.</p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            autoFocus
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            className="app-lock-input"
            aria-label="PIN"
          />
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={checking || pin.length < 4} style={{ width: '100%', marginTop: 8 }}>
            {checking ? 'Comprobando…' : 'Desbloquear'}
          </button>
        </form>
        <p className="muted app-lock-hint">
          ¿Has olvidado el PIN? Pide a un administrador de la familia que te lo reinicie desde Familia.
        </p>
      </div>
    </div>
  )
}
