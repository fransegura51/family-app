import { FormEvent, useState } from 'react'
import { createFamily } from '@/data/family'

// Se muestra cuando hay sesión pero todavía no hay `profiles` row: el
// usuario acaba de registrarse y tiene que crear su familia (Fase 1).
export function OnboardingScreen({ onCreated }: { onCreated: () => Promise<void> }) {
  const [familyName, setFamilyName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await createFamily(familyName, displayName)
      await onCreated()
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
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Creando…' : 'Crear familia'}
        </button>
      </form>
    </div>
  )
}
