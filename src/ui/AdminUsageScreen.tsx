import { useEffect, useState } from 'react'
import { listAppUsage, type AppUsageRow } from '@/data/appUsage'
import { deleteClientErrors, listClientErrors, type ClientErrorRow } from '@/data/errorReports'

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
  // Petición real: "que no falle" — los errores que sufre cualquier
  // familia llegan a client_errors (ver 0092) y se ven aquí, agrupados
  // por mensaje para distinguir "un fallo que se repite en 40 móviles"
  // de "40 fallos distintos".
  const [clientErrors, setClientErrors] = useState<ClientErrorRow[]>([])
  const [expandedError, setExpandedError] = useState<string | null>(null)

  function reloadErrors() {
    listClientErrors().then(setClientErrors).catch(() => setClientErrors([]))
  }

  useEffect(() => {
    listAppUsage()
      .then(setRows)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
    reloadErrors()
  }, [])

  async function clearErrors(ids: string[]) {
    try {
      await deleteClientErrors(ids)
      reloadErrors()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron borrar')
    }
  }

  if (loading) return <div className="screen">Cargando…</div>

  const families = new Map<string, { name: string; rows: AppUsageRow[] }>()
  for (const r of rows) {
    if (!families.has(r.familyId)) families.set(r.familyId, { name: r.familyName, rows: [] })
    families.get(r.familyId)!.rows.push(r)
  }

  const errorGroups = new Map<string, ClientErrorRow[]>()
  for (const e of clientErrors) {
    const key = e.message
    if (!errorGroups.has(key)) errorGroups.set(key, [])
    errorGroups.get(key)!.push(e)
  }

  return (
    <div className="screen">
      <h1>Uso de la app</h1>

      <h2 className="section-title">
        🚨 Errores de la app {clientErrors.length > 0 && <span className="muted">({clientErrors.length})</span>}
      </h2>
      {clientErrors.length === 0 ? (
        <p className="muted">Ningún error registrado. Cada fallo de pantalla que sufra cualquier familia aparecerá aquí.</p>
      ) : (
        <>
          <div className="event-list">
            {[...errorGroups.entries()].map(([message, group]) => {
              const latest = group[0]
              const open = expandedError === message
              return (
                <div key={message} className="card task-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                  <button
                    type="button"
                    className="link-button"
                    style={{ textAlign: 'left', padding: 0 }}
                    onClick={() => setExpandedError(open ? null : message)}
                  >
                    <strong>
                      {group.length > 1 && `×${group.length} · `}
                      {message}
                    </strong>
                  </button>
                  <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                    Último: {formatDate(latest.createdAt)}
                    {latest.url && ` · ${latest.url.replace(/^https?:\/\/[^/]+/, '')}`}
                  </p>
                  {open && (
                    <>
                      <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, color: '#6b7280', margin: 0 }}>
                        {latest.stack ?? '(sin traza)'}
                        {latest.componentStack ? `\n\n— Componentes —${latest.componentStack}` : ''}
                      </pre>
                      <p className="muted" style={{ margin: 0, fontSize: 12 }}>{latest.userAgent}</p>
                      <button type="button" className="link-button" onClick={() => clearErrors(group.map((g) => g.id))}>
                        ✕ Borrar estos {group.length}
                      </button>
                    </>
                  )}
                </div>
              )
            })}
          </div>
          <button type="button" className="link-button" onClick={() => clearErrors(clientErrors.map((e) => e.id))}>
            ✕ Borrar todos
          </button>
        </>
      )}

      <h2 className="section-title">Familias y cuentas</h2>
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
