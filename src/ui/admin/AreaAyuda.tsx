import { useState } from 'react'
import { Link } from 'react-router-dom'
import { HELP_COVERAGE_LABEL, type HelpCoverage } from '@/admin/features/featureTypes'
import { HELP_CARDS, HELP_MODULES, HELP_MODULE_BY_ID, HELP_VIDEOS, LEGACY_ENTRIES } from '@/help/catalog'
import { loadHelpFeedbackSummary, type HelpFeedbackRow } from '@/help/feedback'
import { EXPLAINERS } from '@/help/explainers'
import { cardCompleteness, computeHelpHealth } from '@/help/health'
import { sectionInventory, type SectionStatus } from '@/help/master/inventory'
import { AdminGroup } from '@/ui/admin/AdminGroups'
import { useFeatureRows } from '@/ui/admin/useFeatureRows'

// Área «Ayuda y documentación»: cobertura de la Ayuda por módulo, estado de las fichas, tutoriales disponibles y pendientes, errores y rutas rotas, valoraciones agregadas y
// prioridades para completar la documentación. Todo sale del propio catálogo (sin consultas al servidor) salvo las valoraciones, que se piden solo al pulsar el botón y son
// SIEMPRE agregadas (sí/no por ficha): nunca hay conversaciones ni textos de preguntas. Una función con la Ayuda incompleta NO está «parcialmente desarrollada»: son dos cosas.
const COVERAGE_ORDER: HelpCoverage[] = ['completa', 'parcial', 'inexistente', 'pendiente']
const SECTION_STATUS_TEXT: Record<SectionStatus, string> = { operativa: 'operativa', parcial: 'parcial', 'no-disponible': 'no disponible' }

export function AreaAyuda() {
  const rows = useFeatureRows()
  const health = computeHelpHealth()
  const inventory = sectionInventory()
  const totals = COVERAGE_ORDER.map((c) => ({ c, n: rows.filter((r) => r.help.coverage === c).length }))
  // Una función desactivada (apagada o sin pantalla) todavía no necesita Ayuda: se cuenta aparte para no pedir documentar lo que nadie puede usar.
  const gaps = rows.filter((r) => r.help.coverage !== 'completa' && r.entry.state !== 'desactivada')
  const switchedOff = rows.filter((r) => r.entry.state === 'desactivada').length
  const problems = health.brokenRoutes.length + health.unknownFeatures.length + health.unknownTours.length
  const incompleteCards = HELP_CARDS.filter((c) => cardCompleteness(c) !== 'completa')
  const priority = [...gaps].sort((a, b) => weight(b) - weight(a)).slice(0, 12)

  return (
    <div className="admin-area">
      <p className="muted">
        Qué cubre hoy la Ayuda («Pepa te acompaña») y qué le falta. La cobertura de cada función se calcula buscando sus puntos clave en el texto real de la Ayuda: si alguien mejora la
        Ayuda, esta lista cambia sola.
      </p>
      <p>
        <Link to="/ayuda" className="link-button">
          📖 Abrir la Ayuda tal como la ven las familias →
        </Link>
      </p>
      {problems > 0 && (
        <p className="cadm-notice cadm-notice-error" role="alert">
          ⚠️ La Ayuda tiene {problems} {problems === 1 ? 'referencia rota' : 'referencias rotas'}: abre «Errores y rutas rotas».
        </p>
      )}

      <AdminGroup area="ayuda" id="cobertura" title="Cobertura de las funciones" summary="Cuántas funciones tienen la Ayuda completa, parcial, inexistente o pendiente" defaultOpen>
        <p className="admin-counts">
          {totals.map(({ c, n }) => (
            <span key={c}>
              {HELP_COVERAGE_LABEL[c]}: <strong>{n}</strong>{' '}
            </span>
          ))}
        </p>
      </AdminGroup>

      <AdminGroup area="ayuda" id="modulos" title="Cobertura por módulo" summary="Fichas, explicación completa, vídeo y tutoriales de cada módulo" badge={HELP_MODULES.length}>
        <ul className="admin-plain-list">
          {health.modules.map((m) => {
            const mod = HELP_MODULE_BY_ID.get(m.id)!
            const legacy = LEGACY_ENTRIES.filter((e) => e.module === m.id).length
            const video = mod.legacyRoute ? HELP_VIDEOS[mod.legacyRoute] : undefined
            return (
              <li key={m.id} className="card">
                <strong>
                  {mod.icon} {mod.label}
                </strong>
                <br />
                <span className="muted">
                  {m.cards} fichas ({m.complete} completas{m.partial > 0 ? `, ${m.partial} parciales` : ''}
                  {m.pending > 0 ? `, ${m.pending} pendientes` : ''}
                  {m.switchedOff > 0 ? `, ${m.switchedOff} de funciones desactivadas` : ''}) · {legacy} apartados de explicación completa · {video ? `🎬 vídeo (${video.dur})` : 'sin vídeo'} ·{' '}
                  {m.tours > 0 ? `${m.tours} ${m.tours === 1 ? 'tutorial' : 'tutoriales'} «Enséñame»` : 'sin tutorial «Enséñame»'}
                </span>
              </li>
            )
          })}
        </ul>
      </AdminGroup>

      <AdminGroup area="ayuda" id="fichas" title="Estado de las fichas" summary="Completas (pasos + destino), parciales y pendientes" badge={`${health.totals.complete}/${health.totals.cards} completas`}>
        <p className="admin-counts">
          Completas: <strong>{health.totals.complete}</strong> · Parciales: <strong>{health.totals.partial}</strong> · Pendientes: <strong>{health.totals.pending}</strong>
        </p>
        {incompleteCards.length > 0 ? (
          <ul className="admin-plain-list">
            {incompleteCards.map((c) => (
              <li key={c.id} className="card">
                <strong>{c.title}</strong> <span className="muted">({HELP_MODULE_BY_ID.get(c.module)?.label})</span>
                <br />
                <span className={`admin-pill admin-pill-help-${cardCompleteness(c) === 'parcial' ? 'parcial' : 'pendiente'}`}>{cardCompleteness(c) === 'parcial' ? 'Parcial' : 'Pendiente'}</span>
                <span className="muted">
                  {' '}
                  · {c.steps?.length ? '' : 'sin pasos '}
                  {c.go ? '' : 'sin «Llévame»'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Todas las fichas están completas.</p>
        )}
      </AdminGroup>

      <AdminGroup
        area="ayuda"
        id="tutoriales"
        title="Tutoriales y vídeos"
        summary="Vídeos publicados, tutoriales «Enséñame» disponibles y los que faltan"
        badge={`${inventory.reduce((n, r) => n + r.visits.length, 0)} visitas · ${inventory.reduce((n, r) => n + r.series.length, 0)} tutoriales ({inventory.reduce((n, r) => n + r.tutorials.length, 0)} capítulos) · ${EXPLAINERS.length} explicaciones · ${Object.keys(HELP_VIDEOS).length} vídeos`}
      >
        <h4 className="section-title" style={{ marginTop: 0 }}>
          Catálogo maestro por sección
        </h4>
        <p className="muted">Estado real de cada sección y lo que tiene: visita guiada («Conoce esta sección»), tutoriales («Enséñame») y explicaciones («Cómo funciona PEPA»). Solo se ofrece lo que está verificado.</p>
        <ul className="admin-plain-list">
          {inventory.map((r) => (
            <li key={r.module.id} className="card">
              {r.module.icon} <strong>{r.module.label}</strong> — {SECTION_STATUS_TEXT[r.status]} · visitas {r.visits.length} · tutoriales {r.series.length} ({r.tutorials.length} capítulos){r.planned.length > 0 ? ` · planificados ${r.planned.length}` : ''} · explicaciones {r.explainers} · fichas {r.cards}
            </li>
          ))}
        </ul>
        <h4 className="section-title">Recorridos planificados ({inventory.reduce((n, r) => n + r.planned.length, 0)})</h4>
        <p className="muted">Funciones que todavía no están terminadas o validadas: no se ofrecen a las familias y no tienen tutorial hasta que se cumpla lo que se indica.</p>
        <ul className="admin-plain-list">
          {inventory.flatMap((r) =>
            r.planned.map((p) => (
              <li key={p.id} className="card">
                🗓 <strong>{p.title}</strong> <span className="muted">({r.module.label})</span> — {p.summary} <span className="muted">Falta: {p.blockedBy}</span>
              </li>
            )),
          )}
        </ul>
        <h4 className="section-title">Tutoriales «Enséñame» y visitas registrados ({health.toursAvailable.length})</h4>
        {health.toursAvailable.length > 0 ? (
          <ul className="admin-plain-list">
            {health.toursAvailable.map((id) => (
              <li key={id} className="card">
                🎓 <code>{id}</code>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Todavía no hay ninguno.</p>
        )}
        <h4 className="section-title">Candidatos a tutorial ({health.tourCandidates.length})</h4>
        <p className="muted">Fichas disponibles con pasos y destino que todavía no tienen «Enséñame».</p>
        <ul className="admin-plain-list">
          {health.tourCandidates.map((c) => (
            <li key={c.id} className="card">
              {c.title} <span className="muted">({HELP_MODULE_BY_ID.get(c.module)?.label})</span>
            </li>
          ))}
        </ul>
        <h4 className="section-title">Vídeos explicativos ({Object.keys(HELP_VIDEOS).length})</h4>
        <ul className="admin-plain-list">
          {Object.entries(HELP_VIDEOS).map(([route, v]) => {
            const mod = HELP_MODULES.find((m) => m.legacyRoute === route)
            return (
              <li key={route} className="card">
                🎬 <strong>{mod?.label ?? route}</strong> — {v.dur}{' '}
                <a href={v.src} target="_blank" rel="noreferrer">
                  abrir vídeo
                </a>
              </li>
            )
          })}
        </ul>
      </AdminGroup>

      <AdminGroup
        area="ayuda"
        id="rutas"
        title="Errores y rutas rotas"
        summary="Destinos de «Llévame», funciones y tutoriales que ya no existen"
        badge={problems === 0 ? 'Sin problemas' : problems}
        badgeTone={problems === 0 ? 'info' : 'alert'}
      >
        {problems === 0 ? (
          <p>
            ✅ Todos los destinos de «Llévame», las funciones citadas y los tutoriales existen. Además, las pruebas automáticas comprueban en cada cambio que los botones que citan las fichas
            existen en la app.
          </p>
        ) : (
          <ul className="admin-plain-list">
            {health.brokenRoutes.map((b) => (
              <li key={`r-${b.cardId}`} className="card">
                Ruta rota en <code>{b.cardId}</code>: <code>{b.path}</code>
              </li>
            ))}
            {health.unknownFeatures.map((b) => (
              <li key={`f-${b.cardId}`} className="card">
                Función inexistente en <code>{b.cardId}</code>: <code>{b.featureId}</code>
              </li>
            ))}
            {health.unknownTours.map((b) => (
              <li key={`t-${b.cardId}`} className="card">
                Tutorial inexistente en <code>{b.cardId}</code>: <code>{b.tour}</code>
              </li>
            ))}
          </ul>
        )}
      </AdminGroup>

      <AdminGroup area="ayuda" id="valoraciones" title="Valoraciones «¿Te ha servido?»" summary="Resultados agregados por ficha (sin conversaciones)">
        <Feedback />
      </AdminGroup>

      <AdminGroup area="ayuda" id="prioridades" title="Prioridades para completar la documentación" summary="Funciones operativas o parciales con la Ayuda incompleta" badge={gaps.length}>
        <p className="muted">
          Base para decidir qué documentar primero («Pendiente de revisión» = todavía no se ha decidido qué debería contar la Ayuda de esa función). No se incluyen las {switchedOff} funciones
          desactivadas: se documentarán cuando se activen.
        </p>
        <ol className="admin-plain-list" style={{ listStyle: 'decimal inside' }}>
          {priority.map(({ entry, help }) => (
            <li key={entry.id} className="card">
              <strong>{entry.name}</strong> <span className="muted">({entry.module})</span>
              <br />
              <span className={`admin-pill admin-pill-help-${help.coverage}`}>{HELP_COVERAGE_LABEL[help.coverage]}</span>
              {help.missing.length > 0 && <span className="muted"> · No cuenta: {help.missing.join(', ')}</span>}
            </li>
          ))}
        </ol>
        {health.modulesWithoutCards.length > 0 && <p className="muted">Módulos sin ninguna ficha: {health.modulesWithoutCards.join(', ')}.</p>}
      </AdminGroup>
    </div>
  )
}

// Más prioridad: función operativa antes que parcial, y Ayuda inexistente antes que parcial o pendiente.
function weight(r: { entry: { state: string }; help: { coverage: HelpCoverage } }): number {
  return (r.entry.state === 'operativa' ? 10 : 5) + (r.help.coverage === 'inexistente' ? 4 : r.help.coverage === 'parcial' ? 3 : 2)
}

function Feedback() {
  const [state, setState] = useState<'idle' | 'loading' | 'unavailable' | HelpFeedbackRow[]>('idle')
  const load = async () => {
    setState('loading')
    const rows = await loadHelpFeedbackSummary(30)
    setState(rows ?? 'unavailable')
  }
  return (
    <>
      <p className="muted">Cada «¿Te ha servido?» suma un sí o un no a una ficha (últimos 30 días). No se guarda quién respondió ni nada de lo escrito en la Ayuda.</p>
      <button type="button" className="cadm-btn cadm-btn-secondary" disabled={state === 'loading'} onClick={() => void load()}>
        {state === 'loading' ? 'Cargando…' : 'Cargar valoraciones'}
      </button>
      {state === 'unavailable' && (
        <p className="muted" role="status">
          Todavía no disponible: las valoraciones se activan al aplicar la migración 0306 de la base de datos (pendiente de autorización).
        </p>
      )}
      {Array.isArray(state) &&
        (state.length === 0 ? (
          <p className="muted">Todavía no hay valoraciones.</p>
        ) : (
          <ul className="admin-plain-list">
            {state.map((r) => (
              <li key={r.cardId} className="card">
                <code>{r.cardId}</code> — 👍 {r.useful} · 👎 {r.notUseful}
              </li>
            ))}
          </ul>
        ))}
    </>
  )
}
