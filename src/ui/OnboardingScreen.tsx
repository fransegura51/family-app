import { FormEvent, useState } from 'react'
import { createFamily, joinFamilyWithCode } from '@/data/family'

type Mode = 'choose' | 'create' | 'join'

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
        <h1>Bienvenido/a</h1>
        <p className="muted">¿Es la primera vez que se usa esta app en tu familia, o ya hay una familia creada?</p>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button type="button" onClick={() => setMode('create')}>
            Crear una familia nueva
          </button>
          <button type="button" className="link-button" onClick={() => setMode('join')}>
            Ya tengo un código de invitación
          </button>
        </div>
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
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await createFamily(familyName, displayName, accessCode)
      await onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear la familia')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="screen screen-centered">
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
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await joinFamilyWithCode(code, displayName)
      await onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código no válido o caducado')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="screen screen-centered">
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
