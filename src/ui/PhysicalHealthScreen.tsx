import { FormEvent, useEffect, useState } from 'react'
import {
  deleteHevyApiKey,
  hasHevyApiKey,
  listHevyWorkouts,
  saveHevyApiKey,
  testHevyConnection,
  type HevyWorkout,
} from '@/services/hevy'
import type { Profile } from '@/domain/types'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
}

// Un set en Hevy puede ser de peso+repeticiones (lo normal en pesas),
// de distancia+tiempo (cardio) o de repeticiones sueltas (dominadas) —
// se muestra solo lo que trae cada uno, no una plantilla fija.
function setSummary(s: HevyWorkout['exercises'][number]['sets'][number]): string {
  const parts: string[] = []
  if (s.weightKg != null && s.reps != null) parts.push(`${s.weightKg} kg × ${s.reps}`)
  else if (s.reps != null) parts.push(`${s.reps} reps`)
  if (s.distanceMeters != null) parts.push(`${s.distanceMeters} m`)
  if (s.durationSeconds != null) parts.push(`${s.durationSeconds}s`)
  return parts.join(' · ') || '—'
}

// Salud física (Hevy) — muestra el historial de entrenamientos de la
// cuenta Pro de Hevy de la familia. Petición real: "vamos a hacer con
// Hevy la aplicación de gimnasio... lo mismo que hemos hecho con
// FatSecret".
export function PhysicalHealthScreen({ profile }: { profile: Profile }) {
  const isAdmin = profile.role === 'admin'
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [workouts, setWorkouts] = useState<HevyWorkout[]>([])
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    setLoading(true)
    setError(null)
    hasHevyApiKey()
      .then((ok) => {
        setConfigured(ok)
        if (!ok) return null
        return listHevyWorkouts(page)
      })
      .then((result) => {
        if (result) {
          setWorkouts(result.workouts)
          setPageCount(result.pageCount)
        }
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [page]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && configured === null) return <div className="screen">Cargando…</div>

  return (
    <div className="screen">
      <h1>Salud física</h1>
      <p className="muted">Entrenamientos de Hevy (necesita una cuenta Hevy Pro).</p>
      {error && <p className="error">{error}</p>}

      {configured === false && (
        isAdmin ? (
          <HevyKeyForm onSaved={reload} />
        ) : (
          <p className="muted">Todavía no se ha conectado Hevy — pídeselo a un administrador de la familia.</p>
        )
      )}

      {configured && (
        <>
          {isAdmin && <HevyConnectionCard onRemoved={reload} />}

          <h2 className="section-title">Entrenamientos</h2>
          <div className="event-list">
            {workouts.map((w) => (
              <WorkoutCard key={w.id} workout={w} />
            ))}
            {workouts.length === 0 && !loading && <p className="muted">Todavía no hay entrenamientos.</p>}
          </div>

          {pageCount > 1 && (
            <div className="month-nav">
              <button type="button" className="link-button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                ‹ Más recientes
              </button>
              <strong>
                Página {page} de {pageCount}
              </strong>
              <button type="button" className="link-button" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
                Más antiguos ›
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function WorkoutCard({ workout }: { workout: HevyWorkout }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="card task-card">
      <div className="task-card-main">
        <strong>{workout.title}</strong>
        <p className="muted">
          {formatDate(workout.startTime)} · {workout.exercises.length} ejercicios
        </p>
        {open && (
          <div>
            {workout.exercises.map((ex, i) => (
              <div key={i} style={{ marginTop: 8 }}>
                <strong style={{ fontSize: 14 }}>{ex.title}</strong>
                {ex.sets.map((s, j) => (
                  <p key={j} className="muted" style={{ margin: '2px 0' }}>
                    Serie {s.index + 1}{s.type !== 'normal' ? ` (${s.type})` : ''}: {setSummary(s)}
                  </p>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
      <button type="button" className="link-button" onClick={() => setOpen((o) => !o)}>
        {open ? 'Ocultar' : 'Ver detalle'}
      </button>
    </div>
  )
}

function HevyKeyForm({ onSaved }: { onSaved: () => void }) {
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await saveHevyApiKey(apiKey.trim())
      setApiKey('')
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      <h2>Conectar Hevy</h2>
      <p className="muted">
        Necesitas Hevy Pro. Consigue tu clave en{' '}
        <a href="https://hevy.com/settings?developer" target="_blank" rel="noreferrer">
          hevy.com/settings?developer
        </a>{' '}
        y pégala aquí.
      </p>
      <label>
        Clave de API
        <input type="text" value={apiKey} onChange={(e) => setApiKey(e.target.value)} required />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving || !apiKey.trim()}>
        {saving ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  )
}

function HevyConnectionCard({ onRemoved }: { onRemoved: () => void }) {
  const [status, setStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [name, setName] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)

  async function handleTest() {
    setStatus('testing')
    try {
      const result = await testHevyConnection()
      setName(result.name)
      setStatus(result.ok ? 'ok' : 'fail')
    } catch {
      setStatus('fail')
    }
  }

  async function handleRemove() {
    setRemoving(true)
    try {
      await deleteHevyApiKey()
      onRemoved()
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="card banner">
      <p>
        Hevy conectado{status === 'ok' && name ? ` — ${name}` : ''}
        {status === 'fail' && ' · la clave no funciona, vuelve a generarla'}
      </p>
      <div className="member-card-actions">
        <button type="button" onClick={handleTest} disabled={status === 'testing'}>
          {status === 'testing' ? 'Probando…' : 'Probar conexión'}
        </button>
        <button type="button" className="link-button" onClick={handleRemove} disabled={removing}>
          {removing ? 'Quitando…' : 'Desconectar'}
        </button>
      </div>
    </div>
  )
}
