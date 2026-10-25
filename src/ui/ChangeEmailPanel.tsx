import { FormEvent, useEffect, useState } from 'react'
import { confirmCurrentPassword, getMyAccount, requestEmailChange, verifyEmailChangeCode, type MyAccount } from '@/data/account'
import { isPlausibleEmail, normalizeEmail, sameEmail } from '@/domain/accountEmail'
import { authErrorMessage } from '@/domain/authErrors'
import { isCompleteOtp } from '@/domain/otpCode'
import { OtpCodeField, useResendCooldown } from '@/ui/OtpCodeField'
import { PasswordField } from '@/ui/PasswordField'
import { emitHelpEvent } from '@/help/tours/helpBus'

// «Cambiar correo»: lo usa Configuración → Seguridad → Mi cuenta y la ficha PROPIA de Familia (misma lógica, un solo sitio). Solo cada persona cambia SU correo:
// no hay forma de cambiar el de otra (la administradora no puede por serlo). Todo lo hace Supabase Auth:
//  1) se comprueba la contraseña actual (identificación reciente);
//  2) Supabase manda un código de 6 cifras a la dirección NUEVA y, si el proyecto tiene activado el «cambio de correo seguro» (por defecto sí), otro al correo ACTUAL: hacen falta los
//     dos, así que quien solo tenga el móvil de otra persona no puede desviar su cuenta a un correo propio;
//  3) mientras tanto el correo de acceso sigue siendo el de siempre y se enseña «cambio pendiente»; el identificador de usuario no cambia, así que no se pierde nada.
export function ChangeEmailPanel({ onChanged, compact = false }: { onChanged?: () => void; compact?: boolean }) {
  const [account, setAccount] = useState<MyAccount | null>(null)
  const [open, setOpen] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [password, setPassword] = useState('')
  const [codeNew, setCodeNew] = useState('')
  const [codeCurrent, setCodeCurrent] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const cooldown = useResendCooldown()

  function refresh(): Promise<MyAccount | null> {
    return getMyAccount()
      .then((a) => {
        setAccount(a)
        return a
      })
      .catch(() => null)
  }

  useEffect(() => {
    void refresh()
  }, [])

  if (!account) return null
  const pending = account.pendingEmail
  // Si ya hay un cambio pedido, se pasa directo a escribir los códigos aunque se haya recargado la pantalla.
  const showing = open || Boolean(pending)

  async function handleRequest(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    if (!isPlausibleEmail(newEmail)) {
      setError('Escribe un correo válido.')
      return
    }
    if (sameEmail(newEmail, account?.email)) {
      setError('Ese ya es tu correo de acceso.')
      return
    }
    setBusy(true)
    try {
      await confirmCurrentPassword(password)
      await requestEmailChange(newEmail)
      setPassword('')
      cooldown.restart()
      await refresh()
      setMessage('Te hemos mandado un código de 6 cifras a la dirección nueva. Hasta que lo confirmes, sigues entrando con tu correo de siempre.')
      emitHelpEvent('cuentas.correo-codigo-enviado') // para los tutoriales «Enséñame»: el cambio YA está pedido y el código YA se mandó (no el cambio de correo en sí)
    } catch (err) {
      setError(authErrorMessage(err, 'No se pudo pedir el cambio de correo. Inténtalo de nuevo.'))
    }
    setBusy(false)
  }

  async function handleConfirm(which: 'new' | 'current', e: FormEvent) {
    e.preventDefault()
    if (!account) return
    const target = which === 'new' ? pending : account.email
    const code = which === 'new' ? codeNew : codeCurrent
    if (!target) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await verifyEmailChangeCode(target, code)
      if (which === 'new') setCodeNew('')
      else setCodeCurrent('')
      const fresh = await refresh()
      if (fresh && !fresh.pendingEmail) {
        setOpen(false)
        setNewEmail('')
        setMessage('✓ Correo cambiado. Desde ahora entras con el nuevo.')
        onChanged?.()
      } else {
        setMessage(
          which === 'new'
            ? 'Código de la dirección nueva aceptado. Si también te llegó un código a tu correo de siempre, escríbelo abajo para terminar.'
            : 'Código del correo de siempre aceptado. Falta el código de la dirección nueva.',
        )
      }
    } catch (err) {
      setError(authErrorMessage(err, 'No se pudo comprobar el código.'))
    }
    setBusy(false)
  }

  async function handleResend() {
    if (!pending) return
    setBusy(true)
    setError(null)
    try {
      await requestEmailChange(pending)
      cooldown.restart()
      setMessage('Te hemos enviado códigos nuevos. Los anteriores ya no valen.')
    } catch (err) {
      setError(authErrorMessage(err, 'No se pudo reenviar. Espera un minuto e inténtalo de nuevo.'))
    }
    setBusy(false)
  }

  return (
    <div style={{ marginTop: compact ? 4 : 8 }}>
      {!showing && (
        <button type="button" className="link-button" onClick={() => setOpen(true)} data-help-id="seguridad.cambiar-correo">
          ✉️ Cambiar correo
        </button>
      )}
      {message && <p className="muted">{message}</p>}

      {showing && !pending && (
        <form onSubmit={handleRequest} className="member-form">
          <label data-help-id="seguridad.correo-nuevo">
            Correo nuevo
            <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} autoComplete="email" required autoFocus />
          </label>
          <PasswordField label="Tu contraseña actual (para comprobar que eres tú)" value={password} onChange={setPassword} autoComplete="current-password" helpId="seguridad.correo-contrasena-actual" />
          {error && <p className="error">{error}</p>}
          <div className="inline-fields">
            <button type="submit" disabled={busy || !newEmail || !password} data-help-id="seguridad.correo-codigo-boton">
              {busy ? 'Enviando…' : 'Enviar código'}
            </button>
            <button type="button" className="link-button" onClick={() => { setOpen(false); setError(null) }}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {pending && (
        <div className="member-form">
          <p style={{ margin: '4px 0' }}>
            <strong>Cambio pendiente:</strong> {pending} <span className="muted">(todavía sin confirmar)</span>
          </p>
          <form onSubmit={(e) => handleConfirm('new', e)}>
            <OtpCodeField value={codeNew} onChange={setCodeNew} label={`Código enviado a ${normalizeEmail(pending)}`} helpId="seguridad.correo-codigo-nuevo" />
            <button type="submit" disabled={busy || !isCompleteOtp(codeNew)}>
              {busy ? 'Comprobando…' : 'Confirmar código'}
            </button>
          </form>
          <form onSubmit={(e) => handleConfirm('current', e)} style={{ marginTop: 8 }}>
            <OtpCodeField value={codeCurrent} onChange={setCodeCurrent} label="Código enviado a tu correo de siempre (si te ha llegado)" helpId="seguridad.correo-codigo-actual" />
            <button type="submit" disabled={busy || !isCompleteOtp(codeCurrent)}>
              {busy ? 'Comprobando…' : 'Confirmar este código'}
            </button>
          </form>
          {error && <p className="error">{error}</p>}
          <button type="button" className="link-button" onClick={handleResend} disabled={busy || cooldown.left > 0}>
            {cooldown.left > 0 ? `Reenviar códigos (en ${cooldown.left} s)` : 'Reenviar códigos'}
          </button>
        </div>
      )}
    </div>
  )
}
