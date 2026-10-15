import { OVERVIEW_METRICS, pendingShortcuts, type AdminOverview, type AdminTabId, type ModerationSection } from '@/domain/communityAdmin'
import { AdminError, AdminLoading, InfoBox } from '@/ui/community/admin/AdminShared'
import { LaunchSwitch } from '@/ui/community/admin/LaunchSwitch'

// Resumen: métricas reales del servidor (ninguna inventada), interruptor de apertura y accesos rápidos a lo pendiente.
// El resumen lo carga una sola vez la página del Centro de Mando y se lo pasa; aquí solo se pinta.
export function OverviewTab({
  overview,
  loading,
  error,
  onReload,
  onGo,
}: {
  overview: AdminOverview | null
  loading: boolean
  error: string | null
  onReload: () => void
  onGo: (tab: AdminTabId, section?: ModerationSection) => void
}) {
  return (
    <div className="cadm-stack">
      <InfoBox>
        Este es el Centro de Mando de Comunidad. Aquí revisas denuncias, personas, contenido oficial y encuestas. Los dos administradores tienen los mismos permisos y todo lo que
        hagas queda en el historial.
      </InfoBox>

      <LaunchSwitch />

      {loading && !overview && <AdminLoading label="Cargando el resumen…" />}
      {error && <AdminError message={error} onRetry={onReload} />}

      {overview && (
        <>
          <section aria-labelledby="cadm-pending-title">
            <h3 id="cadm-pending-title">Lo pendiente</h3>
            <ul className="cadm-shortcuts">
              {pendingShortcuts(overview).map((s) => (
                <li key={s.id}>
                  <button type="button" className="cadm-btn cadm-btn-secondary cadm-shortcut" onClick={() => onGo(s.tab, s.section)}>
                    <span>{s.label}</span>
                    {s.count !== null && <span className="cadm-count">{s.count}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="cadm-metrics-title">
            <h3 id="cadm-metrics-title">Cómo va Comunidad</h3>
            <dl className="cadm-metrics">
              {OVERVIEW_METRICS.map((m) => (
                <div key={m.key} className="cadm-metric">
                  <dt>{m.label}</dt>
                  <dd>{overview[m.key]}</dd>
                  <dd className="cadm-metric-hint muted">{m.hint}</dd>
                </div>
              ))}
            </dl>
          </section>
        </>
      )}
    </div>
  )
}
