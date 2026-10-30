import { useMemo, useState } from 'react'
import { madridTodayIso, mondayOf, type EditorialItemRow } from '@/domain/communityEditorial'
import {
  AGENDA_KIND,
  AGENDA_STATE,
  agendaState,
  buildAgenda,
  defaultAgendaWeek,
  type AgendaRow,
} from '@/domain/communityEditorialAgenda'
import { AdminEmpty, AdminError, AdminLoading } from '@/ui/community/admin/AdminShared'
import '@/ui/community/admin/editorial/programAgenda.css'

// «Programa de la semana» como AGENDA compacta y cronológica: una cabecera con la semana, y por día filas de una línea (icono, título, hora y estado) que se pulsan para
// abrir el detalle. Es otra presentación de las mismas filas del programa: no programa nada ni cambia estados. Se actualiza con el registro compartido del Centro.
export function ProgramWeek({
  items,
  loading,
  error,
  onReload,
  onReview,
  currentMonday,
}: {
  items: EditorialItemRow[] | null
  loading: boolean
  error: string | null
  onReload: () => void
  onReview: (item: EditorialItemRow) => void
  currentMonday: string | null
}) {
  const weeks = useMemo(() => buildAgenda(items ?? []), [items])
  const today = currentMonday ?? mondayOf(madridTodayIso())
  const [picked, setPicked] = useState<string | null>(null)
  const current = defaultAgendaWeek(weeks, today)
  const monday = picked && weeks.some((w) => w.monday === picked) ? picked : current
  const index = weeks.findIndex((w) => w.monday === monday)
  const week = index >= 0 ? weeks[index] : null
  const go = (n: number) => {
    const next = weeks[index + n]
    if (next) setPicked(next.monday)
  }

  return (
    <section className="cadm-stack" aria-labelledby="cadm-program-title" data-help-id="comunidad.editorial-program">
      <h3 id="cadm-program-title">Programa de la semana</h3>
      {loading && !items && <AdminLoading label="Cargando el programa…" />}
      {error && <AdminError message={error} onRetry={onReload} />}
      {items && weeks.length === 0 && <AdminEmpty>Todavía no hay borradores en el programa. Cuando Pepa los prepare (o pulses «Generar ahora») aparecerán aquí.</AdminEmpty>}
      {week && (
        <div className="cadm-card cadm-agenda" aria-label={week.title}>
          <header className="cadm-ag-head" data-help-id="comunidad.editorial-week-nav">
            <button type="button" className="cadm-ag-nav" aria-label="Semana anterior" disabled={index <= 0} onClick={() => go(-1)}>
              ‹
            </button>
            <div className="cadm-ag-headtext">
              <h4>{week.title}</h4>
              <p className="muted cadm-small">
                {week.count} {week.count === 1 ? 'publicación' : 'publicaciones'}
                {week.pending > 0 ? ` · ${week.pending} por aprobar` : ' · todo aprobado'}
              </p>
            </div>
            <button type="button" className="cadm-ag-nav" aria-label="Semana siguiente" disabled={index >= weeks.length - 1} onClick={() => go(1)}>
              ›
            </button>
          </header>
          {monday !== current && current && (
            <button type="button" className="cadm-btn cadm-btn-ghost cadm-ag-today" onClick={() => setPicked(current)}>
              Ir a la semana actual
            </button>
          )}
          <div className="cadm-ag-days">
            {week.days.map((d) => (
              <section key={d.date} className="cadm-ag-day" aria-label={d.label}>
                <h5 className="cadm-ag-daylabel">{d.label}</h5>
                <ul className="cadm-ag-rows">
                  {d.rows.map((r) => (
                    <AgendaItem key={r.item.id} row={r} onReview={onReview} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
          {week.missingArticles.length > 0 && <p className="muted cadm-small cadm-ag-missing">Sin artículo previsto: {week.missingArticles.join(', ')}.</p>}
          <p className="muted cadm-small cadm-ag-legend" aria-label="Significado de los indicadores">
            {(['proposed', 'approved', 'published', 'error'] as const).map((s) => (
              <span key={s} className="cadm-ag-legenditem">
                <span className={`cadm-ag-state cadm-ag-state-${s}`} aria-hidden="true">
                  {AGENDA_STATE[s].glyph}
                </span>{' '}
                {AGENDA_STATE[s].label}
              </span>
            ))}
          </p>
        </div>
      )}
    </section>
  )
}

function AgendaItem({ row, onReview }: { row: AgendaRow; onReview: (item: EditorialItemRow) => void }) {
  const { item } = row
  const kind = AGENDA_KIND[item.kind]
  const state = agendaState(item)
  const info = AGENDA_STATE[state]
  const when = row.planned ? `previsto ${row.time}` : row.time
  const closes = row.closesText ? ` · cierra ${row.closesText}` : ''
  return (
    <li className="cadm-ag-row cadm-program-item">
      <button
        type="button"
        className="cadm-ag-btn"
        aria-label={`Revisar ${kind.label.toLowerCase()}: ${item.title}. ${info.label}, ${when}${closes}`}
        onClick={() => onReview(item)}
        data-help-id="comunidad.editorial-review"
      >
        <span className="cadm-ag-icon" aria-hidden="true" title={kind.label}>
          {kind.icon}
        </span>
        <span className="cadm-ag-main">
          <span className="cadm-ag-title">{item.title}</span>
          <span className="cadm-ag-meta">
            {when}
            {closes}
          </span>
        </span>
        <span className={`cadm-ag-state cadm-ag-state-${state}`} role="img" aria-label={info.label} title={info.label}>
          {info.glyph}
        </span>
        <span className="cadm-ag-go" aria-hidden="true">
          ›
        </span>
      </button>
    </li>
  )
}
