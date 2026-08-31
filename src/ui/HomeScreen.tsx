import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Profile } from '@/domain/types'
import { getPermissionState, requestPermission, subscribeToPush } from '@/services/notifications'
import { savePushSubscription } from '@/data/push'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

// "¿Qué tenemos hoy?" — punto de entrada de la app (Skill 02). Cada bloque
// es hoy un placeholder: se conectará a calendario/tareas/compras según
// avancen las fases 1-6.
export function HomeScreen({ profile }: { profile: Profile }) {
  return (
    <div className="screen">
      <h1>¿Qué tenemos hoy?</h1>
      <p className="muted">Hola, {profile.displayName}</p>

      <NotificationsBanner />

      <div className="card-grid">
        <HomeCard title="Familia" body="Miembros y perfiles" to="/familia" />
        <HomeCard title="Calendario" body="Eventos de hoy" to="/calendario" />
        <HomeCard title="Tareas" body="Pendientes de hoy" to="/tareas" />
        <HomeCard title="Próxima compra" body="Lista actual" to="/compras" />
        <HomeCard title="Alimentación" body="Menú de hoy" to="/alimentacion" />
        <HomeCard title="Dinero" body="Resumen del mes" to="/dinero" />
        <HomeCard title="Ubicación y avisos" body="Opcional, desactivado por defecto" to="/ubicacion" />
      </div>
    </div>
  )
}

function NotificationsBanner() {
  const [state, setState] = useState(getPermissionState())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (state !== 'default') return null

  async function activate() {
    setLoading(true)
    setError(null)
    try {
      const permission = await requestPermission()
      setState(permission)
      if (permission === 'granted' && VAPID_PUBLIC_KEY) {
        const subscription = await subscribeToPush(VAPID_PUBLIC_KEY)
        if (subscription) await savePushSubscription(subscription)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron activar los recordatorios')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card banner">
      <p>
        Activa las notificaciones para recibir los recordatorios del calendario, incluso con la
        app cerrada.
      </p>
      {error && <p className="error">{error}</p>}
      <button type="button" onClick={activate} disabled={loading}>
        {loading ? 'Activando…' : 'Activar recordatorios'}
      </button>
    </div>
  )
}

function HomeCard({ title, body, to }: { title: string; body: string; to?: string }) {
  const content = (
    <div className="card">
      <h2>{title}</h2>
      <p className="muted">{body}</p>
    </div>
  )
  return to ? (
    <Link to={to} className="card-link">
      {content}
    </Link>
  ) : (
    content
  )
}
