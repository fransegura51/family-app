import { FormEvent, useEffect, useState } from 'react'
import { recoveryFlow } from '@/auth/recoveryFlow'
import {
  changePasswordWithCurrent,
  getMyAccount,
  requestPasswordRecoveryCode,
  verifyPasswordRecoveryCode,
  type MyAccount,
} from '@/data/account'
import {
  changeOwnPin,
  clearOwnPinWithPin,
  deleteWebauthnCredential,
  hasOwnPin,
  listWebauthnCredentials,
  registerPasskey,
  setOwnPin,
  type WebauthnCredentialInfo,
} from '@/data/appLock'
import { APP_LOCK_CHANGED_EVENT } from '@/domain/appLockPolicy'
import { authErrorMessage } from '@/domain/authErrors'
import { errorMessage } from '@/domain/errorMessage'
import { isCompleteOtp } from '@/domain/otpCode'
import { ChangeEmailPanel } from '@/ui/ChangeEmailPanel'
import { OtpCodeField, useResendCooldown } from '@/ui/OtpCodeField'
import { PASSWORD_MISMATCH_MESSAGE, passwordsMatch } from '@/domain/passwordForm'
import { NewPasswordFields, PasswordField } from '@/ui/PasswordField'
import { PinRecoveryPanel } from '@/ui/PinRecoveryPanel'
import { emitHelpEvent } from '@/help/tours/helpBus'

// Configuración → Seguridad, en dos apartados que se entienden sin saber de informática:
//  · Correo y contraseña: con qué correo entras, si está confirmado, cambiar el correo y la contraseña, y qué hacer si se olvida la contraseña.
//  · Bloqueo personal: el PIN y la huella / Face ID de ESTE móvil y cuenta (es un candado extra, aparte de la contraseña).
// «Cerrar sesión» NO está aquí: sigue donde estaba en producción, en Configuración → Mi cuenta (decisión de la usuaria, 20/10/2026: no trasladarlo ni duplicarlo).
// Cada persona gestiona lo suyo; nada de esto depende de un administrador de la familia.
export function SecuritySettings() {
  return (
    <>
      <MyAccountCard />
      <PersonalLockCard />
    </>
  )
}

function Heading({ children }: { children: string }) {
  return <strong style={{ display: 'block', fontSize: 16 }}>{children}</strong>
}

// ---------------------------------------------------------------- Mi cuenta
function MyAccountCard() {
  const [account, setAccount] = useState<MyAccount | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)

  function reload() {
    getMyAccount()
      .then(setAccount)
      .catch(() => setLoadError(true))
  }

  useEffect(reload, [])

  return (
    <div className="card event-card" style={{ marginBottom: 16 }} data-help-id="seguridad.correo-contrasena">
      <Heading>🔐 Correo y contraseña</Heading>
      <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>
        Con este correo y tu contraseña entras en PEPA desde cualquier móvil u ordenador.
      </p>
      {loadError && <p className="error">No se pudo cargar tu cuenta. Inténtalo de nuevo más tarde.</p>}
      {account && (
        <>
          <p style={{ margin: '8px 0 2px' }}>
            <span className="muted">Correo de acceso: </span>
            <strong style={{ overflowWrap: 'anywhere' }}>{account.email ?? '—'}</strong>
          </p>
          <p className="muted" style={{ margin: '0 0 4px', fontSize: 13 }}>
            {account.confirmed ? '✓ Correo confirmado' : '⚠️ Correo sin confirmar'}
          </p>
          <ChangeEmailPanel onChanged={reload} />
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-color, #eee)' }}>
            {changingPassword ? (
              <ChangePasswordPanel email={account.email} onClose={() => setChangingPassword(false)} />
            ) : (
              <button type="button" className="link-button" onClick={() => setChangingPassword(true)} data-help-id="seguridad.cambiar-contrasena">
                🔑 Cambiar contraseña
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// Cambiar la contraseña: sabiendo la actual (se comprueba volviendo a entrar con ella) o, si no se recuerda, con un código de seis cifras al correo
// (la misma recuperación de la pantalla de entrada: después sale «elige tu contraseña nueva»). Nunca depende de otra persona.
function ChangePasswordPanel({ email, onClose }: { email: string | null; onClose: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [forgot, setForgot] = useState<'no' | 'asking-code'>('no')
  const [code, setCode] = useState('')
  const cooldown = useResendCooldown()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!passwordsMatch(next, confirm)) {
      setError(PASSWORD_MISMATCH_MESSAGE)
      return
    }
    setBusy(true)
    try {
      await changePasswordWithCurrent(current, next)
      setCurrent('')
      setNext('')
      setConfirm('')
      setDone(true)
      emitHelpEvent('cuentas.contrasena-cambiada') // para los tutoriales «Enséñame»: la contraseña YA está cambiada (nunca se lee ni se guarda lo escrito)
    } catch (err) {
      setError(authErrorMessage(err, 'No se pudo cambiar la contraseña. Inténtalo de nuevo.'))
    }
    setBusy(false)
  }

  async function sendCode() {
    if (!email) return
    setBusy(true)
    setError(null)
    try {
      await requestPasswordRecoveryCode(email)
      cooldown.restart()
      setCode('')
      setForgot('asking-code')
    } catch (err) {
      setError(authErrorMessage(err, 'No se pudo enviar el código. Inténtalo de nuevo en unos minutos.'))
    }
    setBusy(false)
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault()
    if (!email) return
    setBusy(true)
    setError(null)
    // Al confirmar el código, la app enseña sola «elige tu contraseña nueva» (auth/recoveryFlow.ts).
    recoveryFlow.begin()
    try {
      await verifyPasswordRecoveryCode(email, code)
    } catch (err) {
      recoveryFlow.end()
      setError(authErrorMessage(err, 'No se pudo comprobar el código.'))
    }
    setBusy(false)
  }

  if (done) {
    return (
      <div>
        <p className="muted">✓ Contraseña cambiada. Desde ahora entras con la nueva.</p>
        <button type="button" className="link-button" onClick={onClose}>
          Cerrar
        </button>
      </div>
    )
  }

  if (forgot === 'asking-code') {
    return (
      <form onSubmit={verifyCode} className="member-form">
        <strong>Escribe el código del correo</strong>
        <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>
          Te hemos mandado un código de 6 cifras a tu correo. Al confirmarlo podrás elegir una contraseña nueva sin saber la anterior.
        </p>
        <OtpCodeField value={code} onChange={setCode} autoFocus />
        {error && <p className="error">{error}</p>}
        <div className="inline-fields">
          <button type="submit" disabled={busy || !isCompleteOtp(code)}>
            {busy ? 'Comprobando…' : 'Comprobar código'}
          </button>
          <button type="button" className="link-button" onClick={sendCode} disabled={busy || cooldown.left > 0}>
            {cooldown.left > 0 ? `Reenviar (en ${cooldown.left} s)` : 'Reenviar código'}
          </button>
          <button type="button" className="link-button" onClick={() => setForgot('no')}>
            Atrás
          </button>
        </div>
      </form>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="member-form">
      <PasswordField label="Contraseña actual" value={current} onChange={setCurrent} autoComplete="current-password" helpId="seguridad.contrasena-actual" />
      <NewPasswordFields
        password={next}
        confirm={confirm}
        onPasswordChange={setNext}
        onConfirmChange={setConfirm}
        passwordLabel="Contraseña nueva"
        confirmLabel="Repetir contraseña nueva"
        passwordMark={{ 'data-help-id': 'seguridad.contrasena-nueva' }}
        confirmMark={{ 'data-help-id': 'seguridad.contrasena-repetir' }}
      />
      {error && <p className="error">{error}</p>}
      <div className="inline-fields">
        <button type="submit" disabled={busy || !current || !next} data-help-id="seguridad.contrasena-guardar">
          {busy ? 'Guardando…' : 'Cambiar contraseña'}
        </button>
        <button type="button" className="link-button" onClick={onClose}>
          Cancelar
        </button>
      </div>
      <button type="button" className="link-button" onClick={sendCode} disabled={busy || !email} data-help-id="seguridad.contrasena-olvido">
        No recuerdo mi contraseña actual
      </button>
    </form>
  )
}

// ---------------------------------------------------------------- Bloqueo personal
// Petición real: "que te dé la opción de poder bloquearla y
// desbloquearla con... un PIN... hazlo opcional, si alguien no lo
// quiere poner que no lo ponga". Es por login (auth.uid()), no por
// family_member — cada adulto tiene su propia cuenta en su propio
// móvil (ver 0083_profile_app_lock.sql), así que esta sección solo
// afecta al PIN de quien la está viendo ahora mismo.
// Cuentas y seguridad: cambiar o desactivar el PIN pide el PIN actual; «He olvidado mi PIN» se identifica con la cuenta (PinRecoveryPanel).
type LockMode = 'idle' | 'setup' | 'change' | 'confirm-remove' | 'recover'

function announcePinChanged() {
  window.dispatchEvent(new Event(APP_LOCK_CHANGED_EVENT))
}

function PersonalLockCard() {
  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [mode, setMode] = useState<LockMode>('idle')
  const [currentPin, setCurrentPin] = useState('')
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [passkeys, setPasskeys] = useState<WebauthnCredentialInfo[]>([])
  const [addingPasskey, setAddingPasskey] = useState(false)
  const [passkeyLabel, setPasskeyLabel] = useState('')
  const [passkeyBusy, setPasskeyBusy] = useState(false)
  const [passkeyError, setPasskeyError] = useState<string | null>(null)

  function reload() {
    hasOwnPin()
      .then(setEnabled)
      .catch(() => {})
      .finally(() => setLoading(false))
    listWebauthnCredentials()
      .then(setPasskeys)
      .catch(() => {})
  }

  useEffect(reload, [])

  function open(next: LockMode) {
    setCurrentPin('')
    setPin('')
    setPinConfirm('')
    setError(null)
    setMode(next)
  }

  function pinProblem(): string | null {
    if (!/^[0-9]{4,6}$/.test(pin)) return 'El PIN debe tener entre 4 y 6 dígitos'
    if (pin !== pinConfirm) return 'Los dos PIN no coinciden'
    return null
  }

  function pinFailure(err: unknown, fallback: string): string {
    return errorMessage(err, '') === 'PIN_LOCKED' ? 'Demasiados intentos — espera unos minutos e inténtalo de nuevo.' : errorMessage(err, fallback)
  }

  async function handleSetup(e: FormEvent) {
    e.preventDefault()
    const problem = pinProblem()
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await setOwnPin(pin)
      setEnabled(true)
      setMode('idle')
      announcePinChanged()
      emitHelpEvent('cuentas.pin-activado') // para los tutoriales «Enséñame»: el PIN YA está activado (el aviso no lleva el PIN)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo activar el PIN'))
    } finally {
      setSaving(false)
    }
  }

  async function handleChange(e: FormEvent) {
    e.preventDefault()
    const problem = pinProblem()
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await changeOwnPin(currentPin, pin)
      if (result === 'ok') {
        setMode('idle')
        announcePinChanged()
      } else if (result === 'no_pin') {
        setEnabled(false)
        setMode('idle')
      } else {
        setError('El PIN actual no es correcto')
        setCurrentPin('')
      }
    } catch (err) {
      setError(pinFailure(err, 'No se pudo cambiar el PIN'))
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const result = await clearOwnPinWithPin(currentPin)
      if (result === 'wrong_pin') {
        setError('El PIN no es correcto')
        setCurrentPin('')
      } else {
        setEnabled(false)
        setPasskeys([])
        setMode('idle')
        announcePinChanged()
      }
    } catch (err) {
      setError(pinFailure(err, 'No se pudo quitar el PIN'))
    } finally {
      setSaving(false)
    }
  }

  async function handleAddPasskey(e: FormEvent) {
    e.preventDefault()
    setPasskeyBusy(true)
    setPasskeyError(null)
    try {
      await registerPasskey(passkeyLabel.trim() || 'Este dispositivo')
      setAddingPasskey(false)
      setPasskeyLabel('')
      setPasskeys(await listWebauthnCredentials())
    } catch (err) {
      setPasskeyError(errorMessage(err, 'No se pudo activar la huella/Face ID'))
    } finally {
      setPasskeyBusy(false)
    }
  }

  async function handleDeletePasskey(id: string) {
    setPasskeyBusy(true)
    setPasskeyError(null)
    try {
      await deleteWebauthnCredential(id)
      setPasskeys(await listWebauthnCredentials())
    } catch (err) {
      setPasskeyError(errorMessage(err, 'No se pudo quitar'))
    } finally {
      setPasskeyBusy(false)
    }
  }

  if (loading) return null

  const pinFields = (label: string) => (
    <>
      <PasswordField numeric label={label} value={pin} onChange={setPin} required={false} helpId="seguridad.pin-nuevo" />
      <PasswordField numeric label="Repite el PIN" value={pinConfirm} onChange={setPinConfirm} required={false} helpId="seguridad.pin-repite" />
    </>
  )

  const currentPinField = (label: string) => (
    <PasswordField numeric label={label} value={currentPin} onChange={setCurrentPin} required={false} autoFocus />
  )

  return (
    <div className="card event-card" style={{ marginBottom: 16 }} data-help-id="seguridad.bloqueo">
      <Heading>🔒 Bloqueo personal</Heading>
      <p className="muted" style={{ marginTop: 4 }}>
        {enabled
          ? 'Tienes un PIN activado: se pide al abrir la app y cuando vuelves a ella tras estar un minuto o más fuera.'
          : 'Desactivado — cualquiera con el móvil desbloqueado puede entrar directamente.'}
      </p>

      {mode === 'setup' && (
        <form onSubmit={handleSetup} className="member-form">
          {pinFields('Nuevo PIN (4-6 dígitos)')}
          {error && <p className="error">{error}</p>}
          <div className="inline-fields">
            <button type="submit" disabled={saving} data-help-id="seguridad.pin-guardar">
              {saving ? 'Guardando…' : 'Activar PIN'}
            </button>
            <button type="button" className="link-button" onClick={() => open('idle')}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {mode === 'change' && (
        <form onSubmit={handleChange} className="member-form">
          {currentPinField('PIN actual')}
          {pinFields('PIN nuevo (4-6 dígitos)')}
          {error && <p className="error">{error}</p>}
          <div className="inline-fields">
            <button type="submit" disabled={saving || currentPin.length < 4}>
              {saving ? 'Guardando…' : 'Cambiar PIN'}
            </button>
            <button type="button" className="link-button" onClick={() => open('idle')}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {mode === 'confirm-remove' && (
        <form onSubmit={handleRemove} className="member-form">
          {currentPinField('Escribe tu PIN para desactivarlo')}
          <p className="muted" style={{ fontSize: 13, margin: '4px 0' }}>
            Al desactivarlo también se quitan las huellas y Face ID registrados.
          </p>
          {error && <p className="error">{error}</p>}
          <div className="inline-fields">
            <button type="submit" disabled={saving || currentPin.length < 4}>
              {saving ? 'Quitando…' : 'Desactivar PIN'}
            </button>
            <button type="button" className="link-button" onClick={() => open('idle')}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {mode === 'recover' && (
        <PinRecoveryPanel
          onFinished={() => {
            open('idle')
            reload()
          }}
          onCancel={() => open('idle')}
        />
      )}

      {mode === 'idle' && (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }} data-help-id="seguridad.pin-acciones">
          {enabled ? (
            <>
              <button type="button" className="link-button" onClick={() => open('change')}>
                Cambiar PIN
              </button>
              <button type="button" className="link-button" onClick={() => open('confirm-remove')}>
                Desactivar PIN
              </button>
              <button type="button" className="link-button" onClick={() => open('recover')}>
                He olvidado mi PIN
              </button>
            </>
          ) : (
            <button type="button" className="link-button" onClick={() => open('setup')} data-help-id="seguridad.pin-activar">
              Activar PIN
            </button>
          )}
        </div>
      )}

      {enabled && (
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-color, #eee)' }} data-help-id="seguridad.huella">
          <strong style={{ fontSize: 14 }}>👆 Huella / Face ID</strong>
          <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>
            Capa opcional además del PIN — si falla o la quitas, siempre puedes seguir usando el PIN.
          </p>

          {passkeys.length > 0 && (
            <div className="event-list" style={{ marginTop: 8 }}>
              {passkeys.map((p) => (
                <div key={p.id} className="inline-fields">
                  <span className="muted" style={{ flex: 1 }}>
                    {p.deviceLabel || 'Dispositivo'}
                  </span>
                  <button type="button" className="link-button" onClick={() => handleDeletePasskey(p.id)} disabled={passkeyBusy}>
                    Quitar
                  </button>
                </div>
              ))}
            </div>
          )}

          {addingPasskey ? (
            <form onSubmit={handleAddPasskey} className="member-form" style={{ marginTop: 8 }}>
              <label data-help-id="seguridad.huella-nombre">
                Nombre de este dispositivo (opcional)
                <input type="text" value={passkeyLabel} onChange={(e) => setPasskeyLabel(e.target.value)} placeholder="Mi móvil" autoFocus />
              </label>
              {passkeyError && <p className="error">{passkeyError}</p>}
              <div className="inline-fields">
                <button type="submit" disabled={passkeyBusy}>
                  {passkeyBusy ? 'Comprobando…' : 'Activar'}
                </button>
                <button type="button" className="link-button" onClick={() => setAddingPasskey(false)}>
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <div style={{ marginTop: 8 }}>
              <button type="button" className="link-button" onClick={() => setAddingPasskey(true)} data-help-id="seguridad.huella-activar">
                + Activar huella/Face ID en este dispositivo
              </button>
              {passkeyError && <p className="error">{passkeyError}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
