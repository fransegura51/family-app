import { FormEvent, useState } from 'react'
import pepaLogoSlogan from '@/assets/brand/variants/pepa-family-app-logo-slogan.png'
import { recoveryFlow } from '@/auth/recoveryFlow'
import { setNewPassword } from '@/data/account'
import { authErrorMessage } from '@/domain/authErrors'
import { PASSWORD_MISMATCH_MESSAGE, passwordsMatch } from '@/domain/passwordForm'
import { NewPasswordFields } from '@/ui/PasswordField'

// Se llega aquí desde "¿Olvidaste tu contraseña?" (LoginScreen) o desde «No recuerdo mi contraseña» de Configuración → Seguridad, de DOS maneras:
//  · con el código de seis cifras del correo (la nueva, la que usan los correos nuevos): al confirmarlo, la app avisa con recoveryFlow que se está
//    recuperando la contraseña y enseña esta pantalla con la sesión de recuperación ya abierta;
//  · con el enlace del correo (los correos antiguos que aún no han caducado): Supabase vuelve con #access_token=…&type=recovery en la dirección, que
//    App.tsx reconoce ANTES que nada.
// En los dos casos ya existe una sesión de recuperación válida, así que solo hace falta pedir la contraseña nueva y guardarla.
export function ResetPasswordScreen() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  function goToApp() {
    // Limpia el hash de recuperación de la URL (si lo había) y entra directamente — la sesión de recuperación ya vale como sesión normal.
    recoveryFlow.end()
    window.location.href = window.location.origin + import.meta.env.BASE_URL
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!passwordsMatch(password, confirm)) {
      setError(PASSWORD_MISMATCH_MESSAGE)
      return
    }
    setLoading(true)
    try {
      await setNewPassword(password)
      setDone(true)
    } catch (err) {
      setError(authErrorMessage(err, 'No se pudo guardar la contraseña. Inténtalo de nuevo.'))
    }
    setLoading(false)
  }

  const logo = <img src={pepaLogoSlogan} alt="Pepa Family App — Pepa te lo soluciona" style={{ width: '100%', maxWidth: 320, height: 'auto', marginBottom: 8 }} />

  if (done) {
    return (
      <div className="screen screen-centered">
        {logo}
        <div className="card">
          <p>Contraseña actualizada. Ya puedes entrar con ella.</p>
          <button type="button" onClick={goToApp}>
            Ir a la app
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="screen screen-centered">
      {logo}
      <form onSubmit={handleSubmit} className="card">
        <p className="muted">Elige tu nueva contraseña.</p>
        <NewPasswordFields password={password} confirm={confirm} onPasswordChange={setPassword} onConfirmChange={setConfirm} passwordLabel="Contraseña nueva" autoFocus />
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Guardando…' : 'Guardar contraseña'}
        </button>
      </form>
      {/* Se puede dejar para otro momento: la persona queda dentro con la sesión de recuperación y la cambia desde Configuración → Seguridad. */}
      <button type="button" className="link-button" onClick={goToApp}>
        Ahora no, entrar a la app
      </button>
    </div>
  )
}
