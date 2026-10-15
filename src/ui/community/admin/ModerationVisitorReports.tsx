import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminListVisitorReports, adminResolveVisitorReport } from '@/data/communityReports'
import {
  ADMIN_TEXT,
  TARGET_TYPE_TEXT,
  VISITOR_PAGE,
  VISITOR_RESOLUTION_TEXT,
  VISITOR_SOURCE_TEXT,
  contentStatusText,
  formatMadrid,
  reasonLabel,
  splitPage,
  starsLabel,
  toVisitorReports,
  visitorActionsFor,
  visitorHideValue,
  visitorResultText,
  type VisitorActionInfo,
  type VisitorReport,
} from '@/domain/communityAdmin'
import { paths } from '@/ui/community/communityNav'
import { ActionNotice, AdminEmpty, AdminError, AdminLoading, InfoBox, NoteForm } from '@/ui/community/admin/AdminShared'
import { useAdminAction, useAdminData } from '@/ui/community/admin/useAdminData'

interface VisitorState {
  items: VisitorReport[]
  hasMore: boolean
  fetched: number
}

// Denuncias de visitantes (orden 2.4): avisos de personas sin cuenta o sin alias. NUNCA ocultan nada solos; los revisa la administración. Lista de 20 en 20,
// con filtro «por revisar / ya resueltas». Cada aviso se resuelve de uno en uno (el servidor lo cierra para los dos administradores a la vez).
export function VisitorReportsPanel({ onChanged }: { onChanged: () => void }) {
  const [filter, setFilter] = useState<'open' | 'resolved'>('open')
  const [notice, setNotice] = useState<string | null>(null)
  const loader = useCallback(async (): Promise<VisitorState> => {
    const { page, hasMore } = splitPage(toVisitorReports(await adminListVisitorReports(filter, VISITOR_PAGE + 1, 0)), VISITOR_PAGE)
    return { items: page, hasMore, fetched: page.length }
  }, [filter])
  const { data, loading, error, reload, setData } = useAdminData(loader)
  const more = useAdminAction()

  const loadMore = () => {
    if (!data) return
    void more.run(async () => {
      const { page, hasMore } = splitPage(toVisitorReports(await adminListVisitorReports(filter, VISITOR_PAGE + 1, data.fetched)), VISITOR_PAGE)
      setData((prev) => (prev ? { items: [...prev.items, ...page], hasMore, fetched: prev.fetched + page.length } : prev))
    })
  }

  return (
    <div className="cadm-stack">
      <InfoBox>
        <p>{ADMIN_TEXT.visitorNeverHides}</p>
        <p>{ADMIN_TEXT.visitorLimits}</p>
        <p>{ADMIN_TEXT.resolvedForBoth}</p>
      </InfoBox>

      <div className="cadm-filter" role="group" aria-label="Qué avisos de visitantes ver">
        {(['open', 'resolved'] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={`cadm-chip-button${filter === f ? ' active' : ''}`}
            aria-pressed={filter === f}
            onClick={() => {
              setFilter(f)
              setNotice(null)
            }}
          >
            {f === 'open' ? 'Por revisar' : 'Ya resueltas'}
          </button>
        ))}
      </div>

      <ActionNotice message={notice} />
      {loading && <AdminLoading label="Cargando denuncias de visitantes…" />}
      {error && <AdminError message={error} onRetry={reload} />}
      {!loading && !error && data && data.items.length === 0 && (
        <AdminEmpty>{filter === 'open' ? 'No hay denuncias de visitantes por revisar. ¡Todo al día!' : 'Todavía no hay denuncias de visitantes resueltas.'}</AdminEmpty>
      )}
      {!loading && data && (
        <ul className="cadm-list">
          {data.items.map((r) => (
            <li key={r.id}>
              <VisitorReportCard
                report={r}
                onResolved={(text) => {
                  setNotice(text)
                  // Resuelta: sale de «por revisar» sin recargar la lista.
                  setData((prev) => (prev ? { ...prev, items: prev.items.filter((x) => x.id !== r.id) } : prev))
                  onChanged()
                }}
              />
            </li>
          ))}
        </ul>
      )}
      {!loading && data?.hasMore && (
        <>
          <ActionNotice error={more.error} />
          <button type="button" className="cadm-btn cadm-btn-secondary" onClick={loadMore} disabled={more.busy}>
            {more.busy ? 'Cargando…' : 'Ver más denuncias'}
          </button>
        </>
      )}
    </div>
  )
}

// Una tarjeta = un aviso. El contacto (si lo hay) es texto que escribió la persona: se pinta SIEMPRE como texto, nunca como enlace.
export function VisitorReportCard({ report, onResolved }: { report: VisitorReport; onResolved: (message: string) => void }) {
  const [choice, setChoice] = useState<VisitorActionInfo | null>(null)
  const [hideAlso, setHideAlso] = useState(false)
  const action = useAdminAction()
  const c = report.content
  const actions = visitorActionsFor(report)

  return (
    <article className="cadm-card" aria-label={`Aviso de visitante sobre ${TARGET_TYPE_TEXT[report.targetType].toLowerCase()}`}>
      <header className="cadm-card-head">
        <h4>
          {TARGET_TYPE_TEXT[report.targetType]}
          {c ? ` de ${c.authorAlias}` : ''}
        </h4>
        <span className="cadm-chip cadm-chip-warn">{VISITOR_SOURCE_TEXT[report.source]}</span>
      </header>

      <ul className="cadm-chips" aria-label="Motivo del aviso">
        <li className="cadm-chip">{reasonLabel(report.reason)}</li>
        {c?.hidden && <li className="cadm-chip">Contenido oculto</li>}
      </ul>
      <p className="muted cadm-small">Recibido: {formatMadrid(report.createdAt)}</p>
      {report.detail && <p className="cadm-reportdetail cadm-plain">«{report.detail}»</p>}
      {report.contact ? (
        <p className="cadm-small">
          Contacto que ha dejado (es solo texto, no un enlace): <span className="cadm-contact cadm-plain">{report.contact}</span>
        </p>
      ) : (
        <p className="muted cadm-small">No ha dejado ningún contacto.</p>
      )}

      {c && (
        <>
          {c.title && <p className="cadm-title">{c.title}</p>}
          {report.targetType === 'review' && c.stars !== null && <p className="cadm-small">Valoración: {starsLabel(c.stars)}</p>}
          {c.excerpt && <p className="cadm-excerpt cadm-plain">{c.excerpt}</p>}
          <p className="muted cadm-small">Ahora mismo: {contentStatusText(c.status)}</p>
          {c.postId && c.status === 'published' && (
            <Link className="link-button cadm-linkbtn" to={paths.post(c.postId)}>
              {report.targetType === 'review' ? 'Ver la receta' : 'Abrir en Comunidad'}
            </Link>
          )}
        </>
      )}
      {!c && <p className="muted">El contenido ya no existe: solo se puede cerrar el aviso.</p>}

      {report.status === 'resolved' && (
        <div className="cadm-resolution">
          <p>Resuelta: {report.resolution ? VISITOR_RESOLUTION_TEXT[report.resolution] : 'sin dato'}</p>
          {report.resolutionNote && <p className="cadm-small cadm-plain">Nota: {report.resolutionNote}</p>}
          {report.resolvedAt && <p className="muted cadm-small">El {formatMadrid(report.resolvedAt)}</p>}
        </div>
      )}

      {report.status === 'open' && !choice && (
        <div className="cadm-actions" role="group" aria-label="Qué hacer con este aviso">
          {actions.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`cadm-btn ${a.danger ? 'cadm-btn-danger' : 'cadm-btn-secondary'}`}
              onClick={() => {
                setHideAlso(false)
                setChoice(a)
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
      {report.status === 'open' && choice && (
        <NoteForm
          title={`${choice.label}: ${TARGET_TYPE_TEXT[report.targetType].toLowerCase()} de ${c?.authorAlias ?? 'esta persona'}`}
          help={`${choice.help} Esto resuelve el aviso para los dos administradores.`}
          required={choice.needsNote}
          confirmLabel={`Confirmar: ${choice.label}`}
          danger={choice.danger}
          busy={action.busy}
          error={action.error}
          extra={
            choice.hide === 'optional' && c ? (
              <label className="checkbox-label cadm-hidealso">
                <input type="checkbox" checked={hideAlso} onChange={(e) => setHideAlso(e.target.checked)} />
                <span>Ocultar también el contenido</span>
              </label>
            ) : choice.hide === 'forced' ? (
              <p className="muted cadm-small">El contenido quedará oculto.</p>
            ) : null
          }
          onCancel={() => {
            setChoice(null)
            action.clear()
          }}
          onSubmit={(note) => {
            void (async () => {
              const hide = visitorHideValue(choice, hideAlso && !!c)
              const r = await action.run(() => adminResolveVisitorReport(report.id, choice.id, note || null, hide))
              if (r.ok) onResolved(visitorResultText(choice.id, r.result))
            })()
          }}
        />
      )}
    </article>
  )
}
