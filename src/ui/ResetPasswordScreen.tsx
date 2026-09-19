import { FormEvent, useState } from 'react'
import { supabase } from '@/data/supabaseClient'

// Se llega aquí desde el enlace del email de "¿Olvidaste tu
// contraseña?" (LoginScreen) — Supabase ya ha creado una sesión de
// recuperación válida a partir del token del propio enlace (leído del
// hash de la URL, #access_token=...&type=recovery) antes de que este
// componente se monte, así que solo hace falta pedir la contraseña
// nueva y guardarla con updateUser.
export function ResetPasswordScreen() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('Las dos contraseñas no coinciden.')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <div className="screen screen-centered">
        <h1>Family App</h1>
        <div className="card">
          <p>Contraseña actualizada. Ya puedes entrar con ella.</p>
          <button
            type="button"
            onClick={() => {
              // Limpia el hash de recuperación de la URL y entra
              // directamente — la sesión de recuperación ya vale como
              // sesión normal tras cambiar la contraseña.
              window.location.href = window.location.origin + import.meta.env.BASE_URL
            }}
          >
            Ir a la app
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="screen screen-centered">
      <h1>Family App</h1>
      <form onSubmit={handleSubmit} className="card">
        <p className="muted">Elige tu nueva contraseña.</p>
        <label>
          Contraseña nueva
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </label>
        <label>
          Repítela
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={6}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Guardando…' : 'Guardar contraseña'}
        </button>
      </form>
    </div>
  )
}
