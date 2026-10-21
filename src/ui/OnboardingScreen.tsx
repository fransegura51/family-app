import { FormEvent, useState } from 'react'
import pepaLogoSlogan from '@/assets/brand/variants/pepa-family-app-logo-slogan.png'
import { createFamily, joinFamilyWithCode } from '@/data/family'
import { errorMessage } from '@/domain/errorMessage'
import { BIRTH_DATE_HELP, MIN_BIRTH_DATE, birthDateError, signupBirthDateServerMessage, todayIso } from '@/domain/signupBirthDate'

type Mode = 'choose' | 'create' | 'join'

// Logotipo oficial (con eslogan) arriba de las tres vistas, igual que la pantalla de entrada.
const logo = <img src={pepaLogoSlogan} alt="Pepa Family App — Pepa te lo soluciona" style={{ width: '100%', maxWidth: 320, height: 'auto', marginBottom: 8 }} />

// Se muestra cuando hay sesión pero todavía no hay `profiles` row: el
// usuario acaba de registrarse y tiene que crear su familia (Fase 1) o,
// si ya pertenece a una familia existente (p. ej. Paco, hasta ahora
// ligado a la sesión de Jennifer), enlazar su cuenta nueva a su
// perfil ya existente con el código que le haya dado el admin.
export function OnboardingScreen({ onCreated }: { onCreated: () => Promise<void> }) {
  const [mode, setMode] = useState<Mode>('choose')

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
      </div>
    )
  }

  if (mode === 'join') {
    return <JoinFamilyForm onDone={onCreated} onBack={() => setMode('choose')} />
  }

  return <CreateFamilyForm onDone={onCreated} onBack={() => setMode('choose')} />
}

function CreateFamilyForm({ onDone, onBack }: { onDone: () => Promise<void>; onBack: () => void }) {
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
      await createFamily(familyName, displayName, accessCode, birthDate)
      await onDone()
    } catch (err) {
      setError(signupBirthDateServerMessage(err) ?? errorMessage(err, 'Error al crear la familia'))
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
    </div>
  )
}

function JoinFamilyForm({ onDone, onBack }: { onDone: () => Promise<void>; onBack: () => void }) {
  const [code, setCode] = useState('')
  const [displayName, setDisplayName] = useState('')
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
      await joinFamilyWithCode(code, displayName, birthDate)
      await onDone()
    } catch (err) {
      setError(signupBirthDateServerMessage(err) ?? errorMessage(err, 'Código no válido o caducado'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="screen screen-centered">
      {logo}
      <h1>Únete a tu familia</h1>
      <p className="muted">Pide el código a quien administra la app (Familia → tu nombre → "Generar código de acceso").</p>
      <form onSubmit={handleSubmit} className="card">
        <label>
          Código de invitación
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABCD1234"
            required
          />
        </label>
        <label>
          Tu nombre
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        </label>
        <BirthDateField value={birthDate} onChange={setBirthDate} />
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
