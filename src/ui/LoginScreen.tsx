import { FormEvent, useState } from 'react'
import { supabase } from '@/data/supabaseClient'

export function LoginScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setInfo(null)

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setError(error.message)
      } else if (!data.session) {
        // Confirmación de email activada en el proyecto: no hay sesión todavía.
        setInfo('Cuenta creada. Revisa tu email para confirmar antes de entrar.')
      }
    }
    setLoading(false)
  }

  return (
    <div className="screen screen-centered">
      <h1>Family App</h1>
      <form onSubmit={handleSubmit} className="card">
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        {info && <p className="muted">{info}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Procesando…' : mode === 'signin' ? 'Entrar' : 'Crear cuenta'}
        </button>
      </form>
      <button
        type="button"
        className="link-button"
        onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin')
          setError(null)
          setInfo(null)
        }}
      >
        {mode === 'signin' ? '¿No tienes cuenta? Crear una' : '¿Ya tienes cuenta? Entrar'}
      </button>
      {/* Una persona tiene que poder leer la política ANTES de crear la
          cuenta (RGPD) — enlaces normales, fuera del router, que App
          resuelve sin sesión. */}
      <p className="muted" style={{ fontSize: 12, marginTop: 24, textAlign: 'center' }}>
        Al crear una cuenta aceptas las{' '}
        <a href={`${import.meta.env.BASE_URL}condiciones`}>condiciones de uso</a> y la{' '}
        <a href={`${import.meta.env.BASE_URL}privacidad`}>política de privacidad</a>.
      </p>
    </div>
  )
}
