import { useCallback, useEffect, useRef, useState } from 'react'
import { setMenuAutopublish, generateNow, getEditorialStatus, listEditorialItems, listEditorialRuns, setEditorialToggle, EditorialCallError } from '@/data/communityEditorial'
import { communityErrorText } from '@/domain/communityErrors'
import {
  EDITORIAL_KINDS,
  EDITORIAL_TEXT,
  RUN_STATUS_TEXT,
  aiLine,
  buildProgram,
  dayShort,
  draftsLine,
  formatMadridSlot,
  generateErrorText,
  generateResultText,
  itemStatusText,
  madridTodayIso,
  mondayOf,
  nextRunLines,
  runErrorText,
  runSummary,
  toggleStateText,
  weekRangeText,
  type EditorialItemRow,
  type EditorialKindInfo,
  type EditorialKindState,
  type EditorialRun,
  type EditorialStatus,
} from '@/domain/communityEditorial'
import { ActionNotice, AdminEmpty, AdminError, AdminLoading, InfoBox } from '@/ui/community/admin/AdminShared'
import { useAdminData } from '@/ui/community/admin/useAdminData'

// «Generación semanal»: el programa editorial con IA (7 artículos, 1 encuesta y 1 menú por semana). Cada tipo tiene su propio interruptor, su próxima ejecución, su
// última ejecución, sus borradores y su «Generar ahora». NADA de aquí publica: generar solo crea borradores que una persona revisa y aprueba en las tarjetas de abajo.
// `show`: el Centro Editorial reparte el panel en dos secciones («Programación y configuración» y «Historial y errores»); sin él se enseña todo, como siempre.
// `program`: el programa semanal del REGISTRO compartido del Centro (así se actualiza a la vez que las listas y los contadores); sin él, el panel pide el suyo.
export interface SharedProgram {
  data: EditorialItemRow[] | null
  loading: boolean
  error: string | null
  reload: () => void
}
export function EditorialPanel({ onReview, onGenerated, show = 'all', program, refreshKey }: { onReview: (item: EditorialItemRow) => void; onGenerated: () => void; show?: 'all' | 'config' | 'history'; program?: SharedProgram; refreshKey?: number }) {
  const statusLoader = useCallback(() => getEditorialStatus(), [])
  const status = useAdminData<EditorialStatus>(statusLoader)
  const shared = program !== undefined
  const itemsLoader = useCallback(() => (shared ? Promise.resolve([] as EditorialItemRow[]) : listEditorialItems(null)), [shared])
  const own = useAdminData<EditorialItemRow[]>(itemsLoader)
  // Con programa compartido no se pide uno propio.
  const items = program ?? { data: own.data, loading: own.loading, error: own.error, reload: own.reload }
  const config = show !== 'history'
  const history = show !== 'config'
  // Cuando el registro compartido se recarga (se aprobó, rechazó, editó… algo), los contadores de borradores de cada tipo también se vuelven a pedir.
  const lastKey = useRef(refreshKey)
  const reloadStatus = status.reload
  useEffect(() => {
    if (lastKey.current === refreshKey) return
    lastKey.current = refreshKey
    reloadStatus()
  }, [refreshKey, reloadStatus])
  const [notice, setNotice] = useState<string | null>(null)
  const [showRuns, setShowRuns] = useState(false)

  const afterGenerated = () => {
    refreshAll()
    onGenerated()
  }
  const refreshAll = () => {
    status.reload()
    items.reload()
  }

  return (
    <section className="cadm-stack" aria-labelledby="cadm-editorial-title" data-help-id="comunidad.editorial-panel">
      {config && <h3 id="cadm-editorial-title">Generación semanal</h3>}
      {config && (
      <InfoBox>
        <p>{EDITORIAL_TEXT.intro}</p>
        <p>{EDITORIAL_TEXT.neverPublishes}</p>
      </InfoBox>
      )}
      {config && status.data && <MenuAutopublishCard enabled={status.data.menuAutopublish} onNotice={setNotice} onChanged={() => status.reload()} />}
      {config && status.data && (
        <p className={`cadm-small${status.data.ai.enabled ? ' muted' : ' cadm-warnline'}`} role={status.data.ai.enabled ? undefined : 'note'}>
          {aiLine(status.data.ai)}
        </p>
      )}
      {config && (
      <div className="cadm-actions">
        <button type="button" className="cadm-btn cadm-btn-secondary" onClick={refreshAll} disabled={status.loading}>
          Actualizar
        </button>
      </div>
      )}
      <ActionNotice message={notice} />
      {status.loading && !status.data && <AdminLoading label="Cargando la generación semanal…" />}
      {status.error && <AdminError message={status.error} onRetry={status.reload} />}
      {config && status.data && (
        <ul className="cadm-list">
          <li key="articles">
            <KindCard
              info={EDITORIAL_KINDS.find((x) => x.key === 'articles')!} state={status.data!.kinds.articles} onNotice={setNotice} onChanged={() => status.reload()} onGenerated={afterGenerated}
              toggleMark={{ 'data-help-id': 'comunidad.editorial-toggle-articles' }}
              generateMark={{ 'data-help-id': 'comunidad.editorial-generate-articles' }}
            />
          </li>
          <li key="poll">
            <KindCard
              info={EDITORIAL_KINDS.find((x) => x.key === 'poll')!} state={status.data!.kinds.poll} onNotice={setNotice} onChanged={() => status.reload()} onGenerated={afterGenerated}
              toggleMark={{ 'data-help-id': 'comunidad.editorial-toggle-poll' }}
              generateMark={{ 'data-help-id': 'comunidad.editorial-generate-poll' }}
            />
          </li>
          <li key="menu">
            <KindCard
              info={EDITORIAL_KINDS.find((x) => x.key === 'menu')!} state={status.data!.kinds.menu} onNotice={setNotice} onChanged={() => status.reload()} onGenerated={afterGenerated}
              toggleMark={{ 'data-help-id': 'comunidad.editorial-toggle-menu' }}
              generateMark={{ 'data-help-id': 'comunidad.editorial-generate-menu' }}
            />
          </li>
        </ul>
      )}

      {history && status.data && status.data.errors.length > 0 && (
        <div className="cadm-card" aria-label="Errores recientes">
          <h4>Errores recientes</h4>
          <ul className="cadm-options">
            {status.data.errors.map((e) => (
              <li key={e.id}>
                <strong>{EDITORIAL_KINDS.find((k) => k.key === e.kind)?.label}</strong> · {RUN_STATUS_TEXT[e.status]} · {formatMadridSlot(e.startedAt)} · {e.itemsCreated} de {e.itemsExpected} borradores
                {runErrorText(e.error) ? `. ${runErrorText(e.error)}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      {history && (
      <div className="cadm-actions">
        <button type="button" className="cadm-btn cadm-btn-secondary" aria-expanded={showRuns} onClick={() => setShowRuns((v) => !v)} data-help-id="comunidad.editorial-history">
          {showRuns ? 'Ocultar el historial de ejecuciones' : 'Ver el historial de ejecuciones'}
        </button>
      </div>
      )}
      {history && showRuns && <RunsHistory />}

      {config && <ProgramWeek items={items.data} loading={items.loading} error={items.error} onReload={items.reload} onReview={onReview} currentMonday={status.data?.cycle.monday ?? null} />}
    </section>
  )
}

// ---- Un tipo del programa
export function KindCard({
  info,
  state,
  onNotice,
  onChanged,
  onGenerated,
  toggleMark,
  generateMark,
}: {
  info: EditorialKindInfo
  state: EditorialKindState
  onNotice: (message: string | null) => void
  onChanged: () => void
  onGenerated: () => void
  toggleMark: { 'data-help-id': string }
  generateMark: { 'data-help-id': string }
}) {
  const [toggling, setToggling] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genResult, setGenResult] = useState<string | null>(null)
  const [genError, setGenError] = useState<string | null>(null)
  const lock = useRef(false)
  const toggleLock = useRef(false)

  const toggle = async () => {
    if (toggleLock.current) return
    toggleLock.current = true
    setToggling(true)
    setToggleError(null)
    try {
      await setEditorialToggle(info.toggle, !state.enabled)
      onNotice(
        !state.enabled
          ? `${info.label}: activada. Pepa preparará borradores cada miércoles; nada se publica sin tu aprobación.`
          : `${info.label}: en pausa. No se prepararán borradores nuevos; lo que ya existe no cambia.`,
      )
      onChanged()
    } catch (e) {
      setToggleError(communityErrorText(e))
    } finally {
      toggleLock.current = false
      setToggling(false)
    }
  }

  const generate = async () => {
    if (lock.current) return
    lock.current = true
    setConfirming(false)
    setGenerating(true)
    setGenError(null)
    setGenResult(null)
    try {
      const r = await generateNow(info.generate)
      setGenResult(generateResultText(r))
      onGenerated()
    } catch (e) {
      setGenError(e instanceof EditorialCallError ? e.message : generateErrorText('internal_error'))
      // Si la función estaba ocupada o tardó demasiado, el estado puede haber cambiado: se recarga.
      onChanged()
    } finally {
      lock.current = false
      setGenerating(false)
    }
  }

  return (
    <article className="cadm-card" aria-label={`Generación semanal de ${info.label.toLowerCase()}`}>
      <header className="cadm-card-head">
        <h4>
          <span aria-hidden="true">{info.icon} </span>
          {info.label}
        </h4>
        <span className={`cadm-chip ${state.enabled ? 'cadm-chip-ok' : ''}`}>{state.enabled ? 'Activa' : 'En pausa'}</span>
      </header>
      <p className="muted cadm-small">{info.what}</p>

      <div className="cadm-switch-row">
        <button
          type="button"
          role="switch"
          aria-checked={state.enabled}
          aria-label={`Generación semanal de ${info.label.toLowerCase()}`}
          className={`cadm-btn ${state.enabled ? 'cadm-btn-secondary' : 'cadm-btn-primary'}`}
          disabled={toggling}
          onClick={() => void toggle()}
          {...toggleMark}
        >
          {toggling ? 'Guardando…' : state.enabled ? 'Pausar' : 'Activar'}
        </button>
        <p className="cadm-small" role="status">
          {toggleStateText(state.enabled)}
        </p>
      </div>
      {toggleError && (
        <p className="cadm-notice cadm-notice-error" role="alert">
          {toggleError}
        </p>
      )}

      <dl className="cadm-dates">
        <dt>Semana</dt>
        <dd>{weekRangeText(state.weekStart)}</dd>
        <dt>Próxima ejecución</dt>
        <dd>
          {nextRunLines(state).map((l) => (
            <span key={l} className="cadm-block">
              {l}
            </span>
          ))}
        </dd>
        <dt>Última ejecución</dt>
        <dd>{state.lastRun ? runSummary(state.lastRun) : 'Todavía no se ha ejecutado.'}</dd>
        <dt>Borradores</dt>
        <dd>{draftsLine(state)}</dd>
      </dl>

      <div className="cadm-actions">
        <button
          type="button"
          className="cadm-btn cadm-btn-secondary"
          disabled={generating || confirming}
          aria-label={`Generar ahora ${info.label.toLowerCase()}`}
          onClick={() => setConfirming(true)}
          {...generateMark}
        >
          {generating ? 'Preparando…' : 'Generar ahora'}
        </button>
      </div>
      {confirming && !generating && (
        <div className="cadm-noteform" role="group" aria-label={`Confirmar generar ${info.label.toLowerCase()}`}>
          <p className="cadm-noteform-title">{EDITORIAL_TEXT.generateConfirm}</p>
          <p className="muted cadm-small">
            Sirve para pruebas y funciona aunque el interruptor esté en pausa. Gasta llamadas de IA.{info.slow ? ` ${EDITORIAL_TEXT.generateSlow}` : ''}
          </p>
          <div className="cadm-actions">
            <button type="button" className="cadm-btn cadm-btn-primary" onClick={() => void generate()}>
              Sí, preparar borradores
            </button>
            <button type="button" className="cadm-btn cadm-btn-ghost" onClick={() => setConfirming(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {generating && (
        <p className="cadm-notice cadm-notice-ok" role="status">
          {EDITORIAL_TEXT.generateWorking}
        </p>
      )}
      {genResult && (
        <p className="cadm-notice cadm-notice-ok" role="status">
          {genResult}
        </p>
      )}
      {genError && (
        <p className="cadm-notice cadm-notice-error" role="alert">
          {genError}
        </p>
      )}
    </article>
  )
}

// ---- Historial de ejecuciones (se pide solo al abrirlo)
function RunsHistory() {
  const loader = useCallback(() => listEditorialRuns(30), [])
  const { data, loading, error, reload } = useAdminData<EditorialRun[]>(loader)
  return (
    <div className="cadm-card" aria-label="Historial de ejecuciones">
      <h4>Historial de ejecuciones</h4>
      {loading && <AdminLoading label="Cargando el historial…" />}
      {error && <AdminError message={error} onRetry={reload} />}
      {data && data.length === 0 && <AdminEmpty>Todavía no se ha ejecutado nada.</AdminEmpty>}
      {data && data.length > 0 && (
        <ul className="cadm-options">
          {data.map((r) => (
            <li key={r.id}>
              <strong>{EDITORIAL_KINDS.find((k) => k.key === r.kind)?.label}</strong> · {r.trigger === 'manual' ? 'manual' : 'programada'} · {RUN_STATUS_TEXT[r.status]} · {formatMadridSlot(r.startedAt)} ·{' '}
              {r.itemsCreated} de {r.itemsExpected} borradores{r.attempt > 1 ? ` · intento ${r.attempt}` : ''}
              {runErrorText(r.error) ? `. ${runErrorText(r.error)}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---- Programa de la semana: día a día, con el artículo, la encuesta del sábado y el menú, y «Revisar» en cada uno.
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
  const [showPast, setShowPast] = useState(false)
  const from = showPast ? null : (currentMonday ?? mondayOf(madridTodayIso()))
  const weeks = buildProgram(items ?? [], from)

  return (
    <section className="cadm-stack" aria-labelledby="cadm-program-title" data-help-id="comunidad.editorial-program">
      <h3 id="cadm-program-title">Programa de la semana</h3>
      <p className="muted cadm-small">Los borradores preparados para cada día. «Revisar» abre ese elemento justo debajo, en las tarjetas de «Consejos, encuestas y artículos» (o en el menú semanal), para leerlo, rectificarlo con Pepa, editarlo, aprobarlo o rechazarlo.</p>
      {loading && !items && <AdminLoading label="Cargando el programa…" />}
      {error && <AdminError message={error} onRetry={onReload} />}
      {items && weeks.length === 0 && <AdminEmpty>Todavía no hay borradores en el programa. Cuando Pepa los prepare (o pulses «Generar ahora») aparecerán aquí.</AdminEmpty>}
      {weeks.map((w) => (
        <div key={w.monday} className="cadm-card cadm-week" aria-label={w.title}>
          <h4>{w.title}</h4>
          <table className="cadm-program">
            <thead>
              <tr>
                <th scope="col">Día</th>
                <th scope="col">Contenido</th>
              </tr>
            </thead>
            <tbody>
              {w.days.map((d) => (
                <tr key={d.date}>
                  <th scope="row">{dayShort(d.date)}</th>
                  <td>
                    {d.articles.length === 0 && d.polls.length === 0 && <span className="muted cadm-small">Sin borrador de artículo</span>}
                    {d.articles.map((a) => (
                      <ProgramItem key={a.id} item={a} label="Artículo" onReview={onReview} />
                    ))}
                    {d.polls.map((a) => (
                      <ProgramItem key={a.id} item={a} label="Encuesta" onReview={onReview} />
                    ))}
                  </td>
                </tr>
              ))}
              <tr>
                <th scope="row">Menú semanal</th>
                <td>
                  {w.menus.length === 0 && <span className="muted cadm-small">Sin borrador de menú</span>}
                  {w.menus.map((m) => (
                    <ProgramItem key={m.id} item={m} label="Menú" onReview={onReview} />
                  ))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}
      <div className="cadm-actions">
        <button type="button" className="cadm-btn cadm-btn-ghost" onClick={() => setShowPast((v) => !v)}>
          {showPast ? 'Ocultar semanas pasadas' : 'Ver también semanas pasadas'}
        </button>
      </div>
    </section>
  )
}

function ProgramItem({ item, label, onReview }: { item: EditorialItemRow; label: string; onReview: (item: EditorialItemRow) => void }) {
  return (
    <div className="cadm-program-item">
      <p className="cadm-small">
        <strong>{label}:</strong> {item.title}
        {item.topicLabel ? ` · ${item.topicLabel}` : ''}
      </p>
      <p className="cadm-small">
        <span className={`cadm-chip ${item.status === 'proposed' ? '' : item.publishError ? 'cadm-chip-warn' : 'cadm-chip-ok'}`}>{itemStatusText(item)}</span>
      </p>
      <button type="button" className="cadm-btn cadm-btn-secondary" aria-label={`Revisar ${label.toLowerCase()}: ${item.title}`} onClick={() => onReview(item)} data-help-id="comunidad.editorial-review">
        Revisar
      </button>
    </div>
  )
}

// Control SEPARADO de la generación: decide si el menú que ya has aprobado sale solo a su hora. Activarlo pide confirmación; desactivarlo no.
export function MenuAutopublishCard({ enabled, onNotice, onChanged }: { enabled: boolean; onNotice: (message: string | null) => void; onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lock = useRef(false)
  const save = async (next: boolean) => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError(null)
    setConfirming(false)
    try {
      await setMenuAutopublish(next)
      onNotice(next ? 'Publicación del menú aprobado a su hora: activada. Sigue haciendo falta tu aprobación.' : 'Publicación del menú aprobado a su hora: desactivada. Un menú aprobado queda programado sin salir solo.')
      onChanged()
    } catch (e) {
      setError(communityErrorText(e))
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <section className="cadm-card" aria-label={EDITORIAL_TEXT.menuAutopublishTitle}>
      <header className="cadm-card-head">
        <h4>{EDITORIAL_TEXT.menuAutopublishTitle}</h4>
        <span className={`cadm-chip ${enabled ? 'cadm-chip-ok' : 'cadm-chip-warn'}`}>{enabled ? 'Activada' : 'Desactivada'}</span>
      </header>
      <p className="muted cadm-small">{EDITORIAL_TEXT.menuAutopublishHelp}</p>
      <div className="cadm-switch-row">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={EDITORIAL_TEXT.menuAutopublishTitle}
          className={`cadm-btn ${enabled ? 'cadm-btn-secondary' : 'cadm-btn-primary'}`}
          disabled={busy || confirming}
          data-help-id="comunidad.editorial-menu-autopublish"
          onClick={() => (enabled ? void save(false) : setConfirming(true))}
        >
          {busy ? 'Guardando…' : enabled ? 'Desactivar' : 'Activar'}
        </button>
        <p className="cadm-small" role="status">
          {enabled ? EDITORIAL_TEXT.menuAutopublishOn : EDITORIAL_TEXT.menuAutopublishOff}
        </p>
      </div>
      {confirming && (
        <div className="cadm-noteform" role="group" aria-label="Confirmar la publicación automática del menú">
          <p className="cadm-noteform-title">{EDITORIAL_TEXT.menuAutopublishConfirm}</p>
          <div className="cadm-actions">
            <button type="button" className="cadm-btn cadm-btn-primary" onClick={() => void save(true)}>
              Sí, activar
            </button>
            <button type="button" className="cadm-btn cadm-btn-ghost" onClick={() => setConfirming(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="cadm-notice cadm-notice-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
