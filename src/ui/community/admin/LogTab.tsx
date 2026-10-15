import { useCallback, useState } from 'react'
import { adminListLog } from '@/data/community'
import { ADMIN_TEXT, LOG_PAGE_SIZE, formatMadrid, logActionText, logExtra, logReasonText, logTargetText, splitPage, toLogEntries } from '@/domain/communityAdmin'
import { AdminEmpty, AdminError, AdminLoading, InfoBox } from '@/ui/community/admin/AdminShared'
import { useAdminData } from '@/ui/community/admin/useAdminData'

// Historial de acciones de administración: quién, cuándo, qué y por qué. SOLO LECTURA (aquí no hay editar ni borrar).
export function LogTab() {
  const [page, setPage] = useState(0)
  const loader = useCallback(async () => splitPage(toLogEntries(await adminListLog(LOG_PAGE_SIZE + 1, page * LOG_PAGE_SIZE)), LOG_PAGE_SIZE), [page])
  const { data, loading, error, reload } = useAdminData(loader)

  return (
    <div className="cadm-stack">
      <InfoBox>{ADMIN_TEXT.logReadOnly}</InfoBox>
      {loading && <AdminLoading label="Cargando el historial…" />}
      {error && <AdminError message={error} onRetry={reload} />}
      {!loading && !error && data && data.page.length === 0 && <AdminEmpty>{page === 0 ? 'Todavía no hay acciones registradas.' : 'No hay más acciones.'}</AdminEmpty>}
      {!loading && data && data.page.length > 0 && (
        <ol className="cadm-log" aria-label={`Acciones, página ${page + 1}`}>
          {data.page.map((e) => {
            const extra = logExtra(e)
            const reason = logReasonText(e)
            return (
              <li key={e.id} className="cadm-card">
                <p className="cadm-title">{logActionText(e.action)}</p>
                <p className="muted cadm-small">
                  {logTargetText(e.targetType)} · Por {e.actor} · {formatMadrid(e.createdAt)}
                  {extra ? ` · ${extra}` : ''}
                </p>
                {reason && <p className="cadm-small">{e.action === 'setting' ? reason : `Motivo: ${reason}`}</p>}
              </li>
            )
          })}
        </ol>
      )}
      <nav className="cadm-pager" aria-label="Páginas del historial">
        <button type="button" className="cadm-btn cadm-btn-secondary" disabled={page === 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))}>
          Más recientes
        </button>
        <span className="muted cadm-small">Página {page + 1}</span>
        <button type="button" className="cadm-btn cadm-btn-secondary" disabled={!data?.hasMore || loading} onClick={() => setPage((p) => p + 1)}>
          Más antiguas
        </button>
      </nav>
    </div>
  )
}
