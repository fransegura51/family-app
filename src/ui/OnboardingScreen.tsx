import { FormEvent, useEffect, useState } from 'react'
import pepaLogoSlogan from '@/assets/brand/variants/pepa-family-app-logo-slogan.png'
import { getSignupInviteCode } from '@/data/account'
import { createFamily, joinFamilyWithCode } from '@/data/family'
import { checkInvitation } from '@/data/invitations'
import { accountStillExists, signOutThisDevice } from '@/data/session'
import { errorMessage } from '@/domain/errorMessage'
import { invitationErrorMessage, type InvitationKind } from '@/domain/invitations'
import { forgetPendingInvitation, recallPendingInvitation } from '@/domain/pendingInvitation'
import { BIRTH_DATE_HELP, MIN_BIRTH_DATE, birthDateError, signupBirthDateServerMessage, todayIso } from '@/domain/signupBirthDate'

type Mode = 'choose' | 'create' | 'join'

interface ResolvedInvitation {
  code: string
  kind: InvitationKind
  needsBirthDate: boolean
}

// Salida siempre a la vista: quien llega aquí con una cuenta que no es la suya (o que ya no existe) tiene que poder entrar con otra. Cierra solo ESTE dispositivo.
function LeaveButton() {
  return (
    <button
      type="button"
      className="link-button"
      onClick={() => {
        forgetPendingInvitation()
        void signOutThisDevice()
      }}
    >
      Salir y entrar con otra cuenta
    </button>
  )
}

// Logotipo oficial (con eslogan) arriba de las tres vistas, igual que la pantalla de entrada.
const logo = <img src={pepaLogoSlogan} alt="Pepa Family App — Pepa te lo soluciona" style={{ width: '100%', maxWidth: 320, height: 'auto', marginBottom: 8 }} />

// Se muestra cuando hay sesión pero todavía no hay `profiles` row: el
// usuario acaba de registrarse y tiene que crear su familia (Fase 1) o,
// si ya pertenece a una familia existente (p. ej. Paco, hasta ahora
// ligado a la sesión de Jennifer), enlazar su cuenta nueva a su
// perfil ya existente con el código que le haya dado el admin.
//
// PEPA es privada: la invitación se pide ANTES de crear la cuenta (LoginScreen). Si la persona ya la presentó, aquí se continúa solo con el formulario que le corresponde, con el
// código ya puesto. Aun así el SERVIDOR la vuelve a comprobar y la gasta al terminar (create_family / join_family_with_code): lo que se recuerde aquí no da ningún permiso por sí solo.
// Quien llegue sin invitación recordada (alta antigua, otro dispositivo sin datos) sigue viendo las dos opciones de siempre, cada una con su código.
export function OnboardingScreen({ onCreated }: { onCreated: () => Promise<void> }) {
  const [mode, setMode] = useState<Mode>('choose')
  const [invitation, setInvitation] = useState<ResolvedInvitation | null>(null)
  // Solo se muestra «Cargando…» si ya hay una invitación recordada en este navegador; si no, la elección de siempre aparece al instante.
  const [resolving, setResolving] = useState(() => recallPendingInvitation() !== null)

  useEffect(() => {
    let active = true
    async function resolve() {
      try {
        const remembered = recallPendingInvitation()
        const code = remembered?.code ?? (await getSignupInviteCode())
        if (!code) return
        const check = await checkInvitation(code)
        if (!active || !check.valid || !check.kind) return
        setInvitation({ code, kind: check.kind, needsBirthDate: check.needsBirthDate !== false })
        setMode(check.kind === 'family' ? 'create' : 'join')
      } catch {
        // Si no se puede comprobar ahora, se ven las dos opciones de siempre.
      } finally {
        if (active) setResolving(false)
      }
    }
    void resolve()
    return () => {
      active = false
    }
  }, [])

  // Si la cuenta de esta sesión ya no existe en el servidor (se borró), se cierra la sesión sola y se vuelve a la pantalla de entrada.
  useEffect(() => {
    let active = true
    accountStillExists()
      .then((exists) => {
        if (active && !exists) {
          forgetPendingInvitation()
          void signOutThisDevice()
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  async function finished() {
    forgetPendingInvitation()
    await onCreated()
  }

  if (resolving) return <div className="screen screen-centered">Cargando…</div>

  if (mode === 'choose') {
    return (
      <div className="screen screen-centered">
        {logo}
        <h1>Bienvenido/a</h1>
        <p className="muted">¿Es la primera vez que se usa esta app en tu familia, o ya hay una familia creada?</p>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button type="button" onClick={() => setMode('create')}>
            Crear una familia nueva
          </button>
          {/* Confusión real (2026-10-08): quien ya tenía CUALQUIER código a mano tocaba este botón
              directamente, sin fijarse en que es un código DISTINTO del de "Crear una familia nueva"
              (que también pide uno, en su propio formulario) — ahora el texto lo deja claro antes de
              elegir, en vez de solo dentro de cada formulario. */}
          <button type="button" className="link-button" onClick={() => setMode('join')}>
            Ya tengo un código para unirme a una familia que ya existe
          </button>
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
          ¿Tu código es para dar de alta una familia nueva (te lo dio quien gestiona la app)? Usa "Crear
          una familia nueva" y pégalo ahí — el botón de abajo es solo para unirte a una familia que ya
          está usando la app.
        </p>
        <LeaveButton />
      </div>
    )
  }

  const fixed = invitation && invitation.kind === (mode === 'create' ? 'family' : 'member') ? invitation : null
  if (mode === 'join') {
    return <JoinFamilyForm onDone={finished} onBack={() => setMode('choose')} fixedCode={fixed?.code} needsBirthDate={fixed ? fixed.needsBirthDate : true} />
  }

  return <CreateFamilyForm onDone={finished} onBack={() => setMode('choose')} fixedCode={fixed?.code} />
}

function CreateFamilyForm({ onDone, onBack, fixedCode }: { onDone: () => Promise<void>; onBack: () => void; fixedCode?: string }) {
  const [familyName, setFamilyName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [accessCode, setAccessCode] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const dateProblem = birthDateError(birthDate)
    if (dateProblem) {
      setError(dateProblem)
      return
    }
    setLoading(true)
    setError(null)
    try {
      await createFamily(familyName, displayName, fixedCode ?? accessCode, birthDate)
      await onDone()
    } catch (err) {
      setError(signupBirthDateServerMessage(err) ?? invitationErrorMessage(err) ?? errorMessage(err, 'Error al crear la familia'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="screen screen-centered">
      {logo}
      <h1>Crea tu familia</h1>
      <p className="muted">Eres el primer adulto administrador.</p>
      <form onSubmit={handleSubmit} className="card">
        <label>
          Nombre de la familia
          <input
            type="text"
            placeholder="Familia García"
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            required
          />
        </label>
        <label>
          Tu nombre
          <input
            type="text"
            placeholder="Jennifer"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
        </label>
        <BirthDateField value={birthDate} onChange={setBirthDate} />
        {fixedCode ? (
          <p className="muted" style={{ margin: 0 }}>
            ✓ Invitación válida presentada.
          </p>
        ) : (
          <label>
            Código de acceso
            <input
              type="text"
              placeholder="Pídeselo a quien te haya invitado a usar la app"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              required
            />
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button type="submit" disabled={loading}>
            {loading ? 'Creando…' : 'Crear familia'}
          </button>
          <button type="button" className="link-button" onClick={onBack}>
            Atrás
          </button>
        </div>
      </form>
      <LeaveButton />
    </div>
  )
}

function JoinFamilyForm({ onDone, onBack, fixedCode, needsBirthDate }: { onDone: () => Promise<void>; onBack: () => void; fixedCode?: string; needsBirthDate: boolean }) {
  const [code, setCode] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    // Cuando la ficha ya trae la fecha de nacimiento (la puso quien invita) no se pide: manda la de la ficha, nunca la que se escriba aquí.
    const dateProblem = needsBirthDate ? birthDateError(birthDate) : null
    if (dateProblem) {
      setError(dateProblem)
      return
    }
    setLoading(true)
    setError(null)
    try {
      await joinFamilyWithCode(fixedCode ?? code, displayName, needsBirthDate ? birthDate : null)
      await onDone()
    } catch (err) {
      setError(signupBirthDateServerMessage(err) ?? invitationErrorMessage(err) ?? errorMessage(err, 'Código no válido o caducado'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="screen screen-centered">
      {logo}
      <h1>Únete a tu familia</h1>
      <p className="muted">
        {fixedCode ? 'Tu invitación es válida. Solo faltan tus datos.' : 'Pide el código a quien administra la familia (en Familia, «Dar acceso a PEPA» en tu ficha).'}
      </p>
      <form onSubmit={handleSubmit} className="card">
        {!fixedCode && (
          <label>
            Código de invitación
            <input type="text" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABCD1234" required />
          </label>
        )}
        <label>
          Tu nombre
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        </label>
        {needsBirthDate && <BirthDateField value={birthDate} onChange={setBirthDate} />}
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button type="submit" disabled={loading}>
            {loading ? 'Uniendo…' : 'Unirme'}
          </button>
          <button type="button" className="link-button" onClick={onBack}>
            Atrás
          </button>
        </div>
      </form>
      <LeaveButton />
    </div>
  )
}

// Campo OBLIGATORIO de las dos altas de cuenta (crear familia y unirse con código). Selector de fecha del propio móvil; el servidor lo exige igual.
function BirthDateField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label>
      Tu fecha de nacimiento
      <input type="date" value={value} min={MIN_BIRTH_DATE} max={todayIso()} onChange={(e) => onChange(e.target.value)} required autoComplete="bday" />
      <span className="muted" style={{ fontSize: 13 }}>
        {BIRTH_DATE_HELP}
      </span>
    </label>
  )
}
