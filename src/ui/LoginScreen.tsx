import { FormEvent, useEffect, useState } from 'react'
import pepaLogoSlogan from '@/assets/brand/variants/pepa-family-app-logo-slogan.png'
import { recoveryFlow } from '@/auth/recoveryFlow'
import { requestPasswordRecoveryCode, resendSignupCode, verifyPasswordRecoveryCode, verifySignupCode } from '@/data/account'
import { checkInvitation } from '@/data/invitations'
import { supabase } from '@/data/supabaseClient'
import { authErrorMessage } from '@/domain/authErrors'
import { formatInvitationExpiry, invitationErrorMessage, looksLikeInvitationCode, normalizeInvitationCode, type InvitationKind } from '@/domain/invitations'
import { isCompleteOtp } from '@/domain/otpCode'
import { invitationCodeFromSearch, rememberPendingInvitation } from '@/domain/pendingInvitation'
import { forgetSignupOrigin, parseSignupOrigin, rememberSignupOrigin, signupMetadata } from '@/domain/signupOrigin'
import { OtpCodeField, useResendCooldown } from '@/ui/OtpCodeField'

// Entrar, crear cuenta (SOLO con invitación) y recuperar la contraseña.
//
// PEPA es privada: ALTA = primero la invitación, después la cuenta.
//   1) «Tengo una invitación»: se escribe el código y el SERVIDOR lo valida (check_invitation, sin gastarlo).
//   2) Solo entonces aparece el formulario de correo y contraseña; el código viaja con el alta y el gancho de Supabase Auth (0295) vuelve a comprobarlo y rechaza cualquier alta
//      sin invitación válida aunque alguien se salte esta pantalla.
//   3) Código de 6 cifras del correo (confirma el correo; NO es la invitación).
//   4) Crear la familia o unirse (OnboardingScreen), donde el servidor vuelve a comprobar la invitación y la gasta.
type Mode = 'signin' | 'invite' | 'signup' | 'signup-code' | 'reset' | 'reset-code'

interface ValidInvitation {
  code: string
  kind: InvitationKind
  expiresAt: string | null
  needsBirthDate: boolean
}

export function LoginScreen() {
  // Quien llega desde el botón "Crear mi familia" de la demo pública de la web (?origen=demo) o desde un enlace de invitación (?invitacion=…) ya ha decidido registrarse:
  // se abre en «Tengo una invitación» (con el código ya puesto si venía en el enlace) en vez de en «Entrar».
  const linkedCode = invitationCodeFromSearch(window.location.search)
  const [mode, setMode] = useState<Mode>(() => (linkedCode || parseSignupOrigin(window.location.search) ? 'invite' : 'signin'))
  useEffect(() => {
    rememberSignupOrigin(window.location.search)
  }, [])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [inviteCode, setInviteCode] = useState(linkedCode ?? '')
  const [invitation, setInvitation] = useState<ValidInvitation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // «Reenviar código»: la cuenta atrás se reinicia cada vez que se manda uno (Supabase exige 60 s entre envíos a la misma cuenta).
  const cooldown = useResendCooldown()

  function goTo(next: Mode) {
    setMode(next)
    setError(null)
    setInfo(null)
    setCode('')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setInfo(null)

    if (mode === 'invite') {
      const normalized = normalizeInvitationCode(inviteCode)
      if (!looksLikeInvitationCode(normalized)) {
        setError('Escribe el código de invitación completo.')
        setLoading(false)
        return
      }
      try {
        const res = await checkInvitation(normalized)
        if (res.throttled) {
          setError('Demasiados intentos seguidos. Espera un rato e inténtalo de nuevo.')
        } else if (!res.valid || !res.kind) {
          setError('La invitación no es válida o ha caducado. Pídele una nueva a quien te invitó.')
        } else {
          setInvitation({ code: normalized, kind: res.kind, expiresAt: res.expiresAt ?? null, needsBirthDate: res.needsBirthDate !== false })
          goTo('signup')
        }
      } catch (err) {
        setError(invitationErrorMessage(err) ?? 'No se pudo comprobar la invitación. Inténtalo de nuevo en unos minutos.')
      }
      setLoading(false)
      return
    }

    if (mode === 'reset') {
      // Petición real: "se me ha borrado la cuenta de administrador no
      // tengo la contraseña" — la cuenta seguía existiendo, lo que
      // faltaba era una forma de recuperar la contraseña sin tener que
      // pedírmelo a mí. Ahora Supabase manda un CÓDIGO de seis cifras
      // (plantilla en supabase/email-templates) que se escribe en el
      // siguiente paso; el redirectTo se mantiene para que los correos
      // con enlace que ya se enviaron sigan funcionando.
      try {
        await requestPasswordRecoveryCode(email)
        // Nunca se confirma si ese email tiene cuenta o no (evita que
        // alguien use este formulario para comprobar qué emails están
        // registrados) — el mensaje es el mismo se encuentre o no.
        goTo('reset-code')
        cooldown.restart()
        setInfo('Si ese email tiene una cuenta, te hemos mandado un correo con un código de 6 cifras. Escríbelo aquí para elegir una contraseña nueva.')
      } catch (err) {
        setError(authErrorMessage(err, 'No se pudo enviar el correo. Inténtalo de nuevo en unos minutos.'))
      }
      setLoading(false)
      return
    }

    if (mode === 'reset-code') {
      // Al confirmar el código Supabase abre una sesión de recuperación: se avisa a la app para que enseñe «elige tu contraseña nueva»
      // y no crea que la persona ya ha entrado (ver auth/recoveryFlow.ts).
      recoveryFlow.begin()
      try {
        await verifyPasswordRecoveryCode(email, code)
      } catch (err) {
        recoveryFlow.end()
        setError(authErrorMessage(err, 'No se pudo comprobar el código.'))
      }
      setLoading(false)
      return
    }

    if (mode === 'signup-code') {
      try {
        await verifySignupCode(email, code)
        forgetSignupOrigin()
      } catch (err) {
        setError(authErrorMessage(err, 'No se pudo comprobar el código.'))
      }
      setLoading(false)
      return
    }

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        // «Email not confirmed»: la persona se registró pero no escribió el código; se le lleva a escribirlo (y se le manda uno nuevo).
        if (error.code === 'email_not_confirmed') {
          try {
            await resendSignupCode(email)
            cooldown.restart()
          } catch {
            // Si el reenvío falla (límite de envíos), el botón «Reenviar código» de la pantalla siguiente deja reintentarlo.
          }
          goTo('signup-code')
          setInfo('Todavía no habías confirmado tu correo. Te hemos mandado un código de 6 cifras: escríbelo aquí.')
        } else {
          setError(authErrorMessage(error, error.message))
        }
      }
    } else {
      // Mode «signup»: solo se llega aquí con una invitación ya validada.
      if (!invitation) {
        goTo('invite')
        setLoading(false)
        return
      }
      // Bug real: el enlace de confirmación del email llevaba a
      // localhost:3000 (el "Site URL" que trae Supabase por defecto) y,
      // tras corregirlo en el panel, a la raíz del dominio sin
      // "/family-app" (el campo no se queda con la ruta completa) —
      // se fija aquí mismo, calculado con la URL real desde la que se
      // esté usando la app, en vez de depender de esa configuración.
      // Etiquetas de origen (origen "demo" y, si venía de una guía de la
      // web, su slug; formato estricto, sin datos personales) para medir
      // cuánta gente llega desde la demo y qué guía la trajo.
      // invite_code: el gancho de Supabase Auth lo vuelve a validar en el servidor y lo reserva para este correo (no lo gasta).
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin + import.meta.env.BASE_URL,
          data: { ...(signupMetadata() ?? {}), invite_code: invitation.code },
        },
      })
      if (!error) forgetSignupOrigin()
      if (error) {
        setError(invitationErrorMessage(error) ?? authErrorMessage(error, error.message))
      } else {
        // Se guarda para que, tras confirmar el correo, la pantalla de alta ya sepa qué hacer sin volver a pedir el código.
        rememberPendingInvitation({ code: invitation.code, kind: invitation.kind, needsBirthDate: invitation.needsBirthDate })
        if (!data.session) {
          // Confirmación de email activada en el proyecto: no hay sesión todavía. Se escribe el código de 6 cifras que llega por correo
          // (si el correo aún trajera un botón en vez de código —plantilla antigua—, pulsarlo sigue funcionando).
          goTo('signup-code')
          cooldown.restart()
          setInfo('Cuenta creada. Te hemos mandado un correo con un código de 6 cifras: escríbelo aquí para confirmar tu correo. (Si el correo trae un botón en vez de código, púlsalo.)')
        }
      }
    }
    setLoading(false)
  }

  async function handleResend() {
    setError(null)
    try {
      if (mode === 'signup-code') await resendSignupCode(email)
      else await requestPasswordRecoveryCode(email)
      cooldown.restart()
      setInfo('Te hemos enviado un código nuevo. El anterior ya no vale.')
    } catch (err) {
      setError(authErrorMessage(err, 'No se pudo reenviar el código. Espera un minuto e inténtalo de nuevo.'))
    }
  }

  const askingCode = mode === 'signup-code' || mode === 'reset-code'

  return (
    <div className="screen screen-centered">
      {/* Validación real en iPhone: "Family App" genérico ya no representa la identidad actual del
          producto — sustituido por el logo+nombre+eslogan oficiales (mismo asset que el pie de RSVP y la
          invitación, PEPA_PUBLIC_WEBSITE_URL/pepa-face-reference-official — una única fuente visual). Solo
          branding: Supabase Auth, sesión, recuperación, registro y las páginas de términos/privacidad de
          más abajo no cambian. */}
      <img src={pepaLogoSlogan} alt="Pepa Family App — Pepa te lo soluciona" style={{ width: '100%', maxWidth: 320, height: 'auto', marginBottom: 8 }} />
      <form onSubmit={handleSubmit} className="card">
        {mode === 'invite' && (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              PEPA es privada: para crear una cuenta necesitas una invitación. Escribe el código que te han enviado.
            </p>
            <label>
              Código de invitación
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                autoFocus
                required
                style={{ letterSpacing: 2, textTransform: 'uppercase' }}
              />
            </label>
          </>
        )}
        {mode === 'signup' && invitation && (
          <p className="muted" style={{ marginTop: 0 }}>
            ✓ Invitación válida: {invitation.kind === 'family' ? 'vas a crear el espacio de tu familia.' : 'vas a unirte a tu familia.'}
            {invitation.expiresAt ? ` Caduca ${formatInvitationExpiry(invitation.expiresAt)}.` : ''}
          </p>
        )}
        {(mode === 'signin' || mode === 'signup' || mode === 'reset' || askingCode) && (
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required readOnly={askingCode} />
          </label>
        )}
        {(mode === 'signin' || mode === 'signup') && (
          <label>
            Contraseña
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
          </label>
        )}
        {askingCode && <OtpCodeField value={code} onChange={setCode} autoFocus />}
        {error && <p className="error">{error}</p>}
        {info && <p className="muted">{info}</p>}
        <button type="submit" disabled={loading || (askingCode && !isCompleteOtp(code))}>
          {loading
            ? 'Procesando…'
            : mode === 'signin'
              ? 'Entrar'
              : mode === 'invite'
                ? 'Continuar'
                : mode === 'signup'
                  ? 'Crear cuenta'
                  : mode === 'reset'
                    ? 'Mandar código'
                    : mode === 'signup-code'
                      ? 'Confirmar mi correo'
                      : 'Comprobar código'}
        </button>
        {askingCode && (
          <button type="button" className="link-button" onClick={handleResend} disabled={cooldown.left > 0}>
            {cooldown.left > 0 ? `Reenviar código (en ${cooldown.left} s)` : 'Reenviar código'}
          </button>
        )}
      </form>
      {mode === 'signin' && (
        <button type="button" className="link-button" onClick={() => goTo('reset')}>
          ¿Olvidaste tu contraseña?
        </button>
      )}
      {(mode === 'reset' || askingCode || mode === 'invite' || mode === 'signup') && (
        <button type="button" className="link-button" onClick={() => goTo('signin')}>
          Volver a entrar
        </button>
      )}
      {mode === 'signin' && (
        <button type="button" className="link-button" onClick={() => goTo('invite')}>
          ¿No tienes cuenta? Tengo una invitación
        </button>
      )}
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
