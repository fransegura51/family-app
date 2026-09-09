import { useEffect, useState } from 'react'
import { listAppUsage, type AppUsageRow } from '@/data/appUsage'

function formatDate(iso: string | null): string {
  if (!iso) return 'Nunca'
  const d = new Date(iso)
  const days = Math.floor((Date.now() - d.getTime()) / 86400000)
  const when = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
  if (days === 0) return `Hoy (${when})`
  if (days === 1) return `Ayer (${when})`
  return `Hace ${days} días (${when})`
}

// Petición real: "quiero un contador para ver la gente que se ha
// descargado la aplicación... para ver en cuanto a orden de descarga" —
// panel solo para Jennifer y Paco (is_app_owner, ver
// 0085_app_owner_usage_panel.sql), no listado en el menú principal:
// se llega desde el enlace que aparece en Ajustes solo si list_app_usage()
// devuelve algo.
export function AdminUsageScreen() {
  const [rows, setRows] = useState<AppUsageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listAppUsage()
      .then(setRows)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="screen">Cargando…</div>

  const families = new Map<string, { name: string; rows: AppUsageRow[] }>()
  for (const r of rows) {
    if (!families.has(r.familyId)) families.set(r.familyId, { name: r.familyName, rows: [] })
    families.get(r.familyId)!.rows.push(r)
  }

  return (
    <div className="screen">
      <h1>Uso de la app</h1>
      <p className="muted">
        Cada persona con cuenta propia (family_members sin cuenta propia no cuentan), en orden de alta.
      </p>
      {error && <p className="error">{error}</p>}
      {!error && rows.length === 0 && (
        <p className="muted">No hay datos, o no tienes acceso a este panel.</p>
      )}
      {[...families.entries()].map(([familyId, group]) => (
        <div key={familyId} className="card" style={{ marginBottom: 16 }}>
          <strong>👨‍👩‍👧‍👦 {group.name}</strong>
          <div className="event-list" style={{ marginTop: 8 }}>
            {group.rows.map((r) => (
              <div key={r.profileId} className="card task-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <strong>{r.displayName}</strong>
                  <span className="muted" style={{ fontSize: 12 }}>{r.role}</span>
                </div>
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>{r.email}</p>
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>Se dio de alta: {formatDate(r.createdAt)}</p>
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>Último acceso: {formatDate(r.lastSignInAt)}</p>
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  {r.hasPush ? '🔔 Notificaciones activadas (instalada de verdad)' : '🔕 Sin notificaciones activadas'}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
