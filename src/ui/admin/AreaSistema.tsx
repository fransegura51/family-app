import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { deleteClientErrors, listClientErrors, type ClientErrorRow } from '@/data/errorReports'
import { errorMessage } from '@/domain/errorMessage'
import { AdminGroup, groupKey, useAdminGroups } from '@/ui/admin/AdminGroups'
import { AmazonWebhookSettings } from '@/ui/admin/AmazonWebhookSettings'
import { formatDate } from '@/ui/admin/adminFormat'
import { SupportAdminPanel } from '@/ui/admin/SupportAdminPanel'
import { SUPPORT_ENABLED } from '@/support/flags'

// Área «Sistema» del Centro de Administración: errores de la app (de todas las familias), automatizaciones técnicas (webhooks de Amazon, Mercadona y correo de eventos),
// diagnóstico temporal de la sincronización de preferencias y enlaces a las vistas administrativas de Sugerencias y Reseñas. Es el contenido del antiguo «Panel de admin»
// (/admin-uso) trasladado SIN cambios de lógica: mismos datos, mismos botones, mismos permisos (el servidor exige is_app_owner).
export function AreaSistema() {
  const groups = useAdminGroups()
  // Los avisos de Soporte llevan aquí con ?soporte=<incidencia>: el bloque se abre directamente en esa conversación.
  const supportTicket = new URLSearchParams(useLocation().search).get('soporte')
  const [error, setError] = useState<string | null>(null)
  // Petición real: "que no falle" — los errores que sufre cualquier
  // familia llegan a client_errors (ver 0092) y se ven aquí, agrupados
  // por mensaje para distinguir "un fallo que se repite en 40 móviles"
  // de "40 fallos distintos".
  const [clientErrors, setClientErrors] = useState<ClientErrorRow[]>([])
  const [expandedError, setExpandedError] = useState<string | null>(null)
  const [showSyncDiag, setShowSyncDiag] = useState(false)

  function reloadErrors() {
    listClientErrors().then(setClientErrors).catch(() => setClientErrors([]))
  }

  useEffect(() => {
    reloadErrors()
  }, [])

  async function clearErrors(ids: string[]) {
    try {
      await deleteClientErrors(ids)
      reloadErrors()
    } catch (e) {
      setError(errorMessage(e, 'No se pudieron borrar'))
    }
  }

  // Los registros temporales del diagnóstico de sincronización (prefs-diag) se separan de los errores reales de la app.
  const isSyncDiag = (e: ClientErrorRow) => e.message.startsWith('prefs-diag')
  const syncDiag = clientErrors.filter(isSyncDiag)
  const realErrors = clientErrors.filter((e) => !isSyncDiag(e))
  const visibleErrors = showSyncDiag ? syncDiag : realErrors

  const errorGroups = new Map<string, ClientErrorRow[]>()
  for (const e of visibleErrors) {
    const key = e.message
    if (!errorGroups.has(key)) errorGroups.set(key, [])
    errorGroups.get(key)!.push(e)
  }
  const errorsForBlock = visibleErrors

  return (
    <div className="admin-area">
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {/* Aviso crítico siempre visible: si hay errores reales sin revisar se ve aunque el bloque esté plegado. */}
      {realErrors.length > 0 && (
        <p className="cadm-notice cadm-notice-error" role="status">
          🚨 Hay {realErrors.length} {realErrors.length === 1 ? 'error registrado' : 'errores registrados'} en la app.{' '}
          <button type="button" className="link-button" onClick={() => groups.reveal(groupKey('sistema', 'errores'))}>
            Verlos
          </button>
        </p>
      )}
      <AdminGroup
        area="sistema"
        id="errores"
        title="🚨 Errores de la app"
        summary="Fallos de pantalla de cualquier familia, agrupados por mensaje (y diagnóstico temporal de sincronización)"
        badge={realErrors.length}
        badgeTone={realErrors.length > 0 ? 'alert' : 'info'}
      >
      <div className="filter-row" role="group" aria-label="Qué registros se ven">
        <button type="button" className={'chip' + (!showSyncDiag ? ' chip-active' : '')} onClick={() => setShowSyncDiag(false)}>
          Errores de la app ({realErrors.length})
        </button>
        <button type="button" className={'chip' + (showSyncDiag ? ' chip-active' : '')} onClick={() => setShowSyncDiag(true)}>
          Diagnóstico de sincronización — temporal ({syncDiag.length})
        </button>
      </div>
      <h4 className="section-title" style={{ marginTop: 8 }}>
        Registros {errorsForBlock.length > 0 && <span className="muted">({errorsForBlock.length})</span>}
      </h4>
      {errorsForBlock.length === 0 ? (
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
          <button type="button" className="link-button" onClick={() => clearErrors(errorsForBlock.map((e) => e.id))}>
            ✕ Borrar todos
          </button>
        </>
      )}
      </AdminGroup>

      <AdminGroup area="sistema" id="automatizaciones" title="⚙️ Automatizaciones" summary="Direcciones y token para que Amazon, Mercadona y el correo de eventos lleguen solos">
        <AmazonWebhookSettings />
      </AdminGroup>

      {SUPPORT_ENABLED && (
        <AdminGroup area="sistema" id="soporte" title="🛟 Soporte técnico" summary="Incidencias de las personas usuarias: responder, asignar, estado, notas internas e incidencias parecidas" defaultOpen={Boolean(supportTicket)} forceOpen={Boolean(supportTicket)}>
          <SupportAdminPanel initialTicketId={supportTicket} />
        </AdminGroup>
      )}

      <AdminGroup area="sistema" id="vistas" title="Otras vistas administrativas" summary="Sugerencias y reseñas de todas las familias" defaultOpen>
      <p className="muted">Estas pantallas ya existían y siguen siendo las mismas; desde aquí se llega a ellas.</p>
      <div className="event-list">
        <Link to="/sugerencias" className="card" style={{ textDecoration: 'none' }}>
          💡 Sugerencias de todas las familias
        </Link>
        <Link to="/resenas" className="card" style={{ textDecoration: 'none' }}>
          ⭐ Reseñas y opiniones de todas las familias
        </Link>
      </div>
      </AdminGroup>
    </div>
  )
}
