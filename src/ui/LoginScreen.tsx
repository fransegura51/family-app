import { FormEvent, useEffect, useState } from 'react'
import { supabase } from '@/data/supabaseClient'
import { forgetSignupOrigin, parseSignupOrigin, recallSignupOrigin, rememberSignupOrigin } from '@/domain/signupOrigin'

export function LoginScreen() {
  // Quien llega desde el botón "Crear mi familia" de la demo pública de
  // la web (?origen=demo) ya ha decidido registrarse: se abre directo en
  // "Crear cuenta" en vez de en "Entrar".
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>(() =>
    parseSignupOrigin(window.location.search) ? 'signup' : 'signin',
  )
  useEffect(() => {
    rememberSignupOrigin(window.location.search)
  }, [])
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

    if (mode === 'reset') {
      // Petición real: "se me ha borrado la cuenta de administrador no
      // tengo la contraseña" — la cuenta seguía existiendo, lo que
      // faltaba era una forma de recuperar la contraseña sin tener que
      // pedírmelo a mí. Mismo redirectTo que la confirmación de alta
      // (la raíz real de la app, nunca una ruta que necesite el truco
      // de 404.html de GitHub Pages — un enlace de email es justo el
      // caso más frágil para ese doble salto, ver HomeOrBankReturn en
      // App.tsx) — ahí, ResetPasswordScreen reconoce el enlace de
      // recuperación por su hash (#type=recovery) antes de nada.
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + import.meta.env.BASE_URL,
      })
      if (error) {
        setError(error.message)
      } else {
        // Nunca se confirma si ese email tiene cuenta o no (evita que
        // alguien use este formulario para comprobar qué emails están
        // registrados) — el mensaje es el mismo se encuentre o no.
        setInfo('Si ese email tiene una cuenta, te hemos mandado un enlace para elegir una contraseña nueva.')
      }
      setLoading(false)
      return
    }

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    } else {
      // Bug real: el enlace de confirmación del email llevaba a
      // localhost:3000 (el "Site URL" que trae Supabase por defecto) y,
      // tras corregirlo en el panel, a la raíz del dominio sin
      // "/family-app" (el campo no se queda con la ruta completa) —
      // se fija aquí mismo, calculado con la URL real desde la que se
      // esté usando la app, en vez de depender de esa configuración.
      // Etiqueta de origen (solo "demo", lista cerrada, sin datos
      // personales) para medir cuánta gente llega desde la demo de la web.
      const origin = recallSignupOrigin()
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin + import.meta.env.BASE_URL,
          ...(origin ? { data: { signup_origin: origin } } : {}),
        },
      })
      if (!error) forgetSignupOrigin()
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
        {mode !== 'reset' && (
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
        )}
        {error && <p className="error">{error}</p>}
        {info && <p className="muted">{info}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Procesando…' : mode === 'signin' ? 'Entrar' : mode === 'signup' ? 'Crear cuenta' : 'Mandar enlace'}
        </button>
      </form>
      {mode === 'signin' && (
        <button
          type="button"
          className="link-button"
          onClick={() => {
            setMode('reset')
            setError(null)
            setInfo(null)
          }}
        >
          ¿Olvidaste tu contraseña?
        </button>
      )}
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
          cuenta (RGPD) — páginas estáticas de public/, sin sesión. */}
      <p className="muted" style={{ fontSize: 12, marginTop: 24, textAlign: 'center' }}>
        Al crear una cuenta aceptas los{' '}
        <a href={`${import.meta.env.BASE_URL}terminos.html`}>términos de uso</a> y la{' '}
        <a href={`${import.meta.env.BASE_URL}privacidad.html`}>política de privacidad</a>.
      </p>
    </div>
  )
}
