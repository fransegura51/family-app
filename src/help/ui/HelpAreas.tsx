import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { HELP_MODULE_BY_ID, HELP_MODULES } from '@/help/catalog'
import { EXPLAINERS, EXPLAINER_BY_ID } from '@/help/explainers'
import type { HelpExplainer } from '@/help/explainers/types'
import { visitsOf } from '@/help/master/inventory'
import { getTourProgress } from '@/help/prefs'
import { SERIES, chaptersOf } from '@/help/tours/series'
import { chapterDone, searchSeries, seriesProgress, type SeriesHit } from '@/help/tours/series/search'
import { normalizeText } from '@/help/search/normalize'
import { getTour } from '@/help/tours/registry'
import type { TourDef } from '@/help/tours/types'
import type { HelpModuleId } from '@/help/types'
import { SUPPORT_ENABLED } from '@/support/flags'
// El área de Soporte se carga solo si está activada: así la Ayuda no arrastra la capa de datos de Soporte (ni nada de Supabase) mientras esté apagada.
const SupportArea = lazy(() => import('@/support/ui/SupportArea').then((m) => ({ default: m.SupportArea })))
import { useHelp } from '@/help/ui/helpContext'
import type { HelpArea } from '@/help/ui/HelpProvider'
import '@/help/ui/help.css'

// Las cuatro áreas integradas de «Pepa te acompaña», además de la conversación de siempre:
//   🧭 Conoce esta sección · 🎓 Enséñame · ⚙️ Cómo funciona PEPA · 🛟 Soporte técnico (solo cuando está activado)
// Todo sale de los registros de la Ayuda (visitas y tutoriales: src/help/tours; explicaciones: src/help/explainers; vínculos: src/help/master). No hay nada escrito a mano aquí: lo que
// no esté registrado y verificado no se ofrece, y cada elemento se esconde a quien no tiene permiso para hacerlo (rol, secciones permitidas, Comunidad 18+, plataforma).

export const AREA_TABS: Array<{ id: HelpArea; label: string; icon: string }> = [
  { id: 'chat', label: 'Preguntar', icon: '💬' },
  { id: 'section', label: 'Conoce esta sección', icon: '🧭' },
  { id: 'learn', label: 'Enséñame', icon: '🎓' },
  { id: 'how', label: 'Cómo funciona PEPA', icon: '⚙️' },
  { id: 'support', label: 'Soporte técnico', icon: '🛟' },
]

export function availableAreas(): HelpArea[] {
  return AREA_TABS.filter((a) => a.id !== 'support' || SUPPORT_ENABLED).map((a) => a.id)
}

export function HelpAreaTabs() {
  const help = useHelp()
  const tabs = AREA_TABS.filter((a) => a.id !== 'support' || SUPPORT_ENABLED)
  return (
    <div className="help-area-tabs" role="tablist" aria-label="Qué quieres hacer con la Ayuda" data-help-id="ayuda.areas">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          id={`help-area-tab-${t.id}`}
          aria-selected={help.area === t.id}
          aria-controls="help-area-body"
          className={`help-area-tab${help.area === t.id ? ' help-area-tab-active' : ''}`}
          onClick={() => help.setArea(t.id)}
        >
          <span aria-hidden="true">{t.icon}</span> {t.label}
        </button>
      ))}
    </div>
  )
}

// ---- Progreso (solo el estado de cada recorrido, guardado por la propia Ayuda)
type Badge = 'done' | 'update' | 'started' | null
function badgeOf(t: TourDef): Badge {
  const p = getTourProgress(t.id)
  if (!p) return null
  if (p.status === 'completed') return p.version >= t.version ? 'done' : 'update'
  return p.status === 'started' ? 'started' : null
}
const BADGE_TEXT: Record<Exclude<Badge, null>, string> = { done: '✓ Hecho', update: 'Hay una versión nueva', started: 'Empezado' }

function minutes(sec: number): string {
  return sec <= 75 ? '1 min' : `${Math.round(sec / 60)} min`
}

// Un recorrido solo se enseña si la persona puede hacerlo.
function useVisible() {
  const help = useHelp()
  return (t: TourDef) => help.canDoTour(t.id)
}

// ---- 🧭 Conoce esta sección
export function HelpSectionArea({ focusModule }: { focusModule: HelpModuleId | null }) {
  const help = useHelp()
  const visible = useVisible()
  const current = focusModule ? HELP_MODULE_BY_ID.get(focusModule) : undefined
  const currentVisits = current ? visitsOf(current.id).filter(visible) : []
  const others = HELP_MODULES.filter((m) => m.id !== current?.id)
    .map((m) => ({ m, visits: visitsOf(m.id).filter(visible) }))
    .filter((x) => x.visits.length > 0)
  return (
    <div className="help-area" role="tabpanel" id="help-area-body" aria-labelledby="help-area-tab-section">
      <p className="help-area-intro">Una visita de 1 o 2 minutos sobre la propia pantalla, para que veas para qué sirve cada zona. No cambia ni guarda nada: puedes salir cuando quieras y repetirla las veces que quieras.</p>
      {current && currentVisits.length > 0 && (
        <section className="help-area-block" aria-label={`Visita de ${current.label}`}>
          <h4>
            {current.icon} Esta sección: {current.label}
          </h4>
          <ul className="help-area-list">
            {currentVisits.map((t) => (
              <TourRow key={t.id} tour={t} cta="Empezar la visita" onStart={() => help.startTourById(t.id)} primary />
            ))}
          </ul>
        </section>
      )}
      {current && SERIES.some((s) => s.module === current.id && help.canDoSeries(s.id)) && (
        <p className="help-note">
          ¿Quieres hacerlo tú con mi ayuda?{' '}
          <button type="button" className="help-btn" onClick={() => help.setArea('learn')}>
            🎓 Tutoriales de {current.label}
          </button>
        </p>
      )}
      {current && currentVisits.length === 0 && <p className="help-note">Para {current.label} no hay visita guiada disponible para tu cuenta. Puedes preguntarme lo que quieras en «Preguntar».</p>}
      <section className="help-area-block" aria-label="Otras secciones">
        <h4>{current ? 'Otras secciones' : 'Secciones de PEPA'}</h4>
        <ul className="help-area-list">
          {others.flatMap(({ m, visits }) =>
            visits.map((t) => (
              <TourRow key={t.id} tour={t} cta="Empezar" onStart={() => help.startTourById(t.id)} prefix={`${m.icon} `} />
            )),
          )}
        </ul>
        {others.length === 0 && <p className="muted">Todavía no hay más visitas disponibles.</p>}
      </section>
    </div>
  )
}

function TourRow({ tour, cta, onStart, prefix = '', primary = false }: { tour: TourDef; cta: string; onStart: () => void; prefix?: string; primary?: boolean }) {
  const badge = badgeOf(tour)
  return (
    <li className="help-area-row">
      <div className="help-area-row-main">
        <strong>
          {prefix}
          {tour.title}
        </strong>
        {tour.summary && <span className="muted">{tour.summary}</span>}
        <span className="muted help-area-meta">
          {minutes(tour.durationSec)}
          {badge ? ` · ${BADGE_TEXT[badge]}` : ''}
        </span>
      </div>
      <button type="button" className={`help-btn${primary ? ' help-btn-primary' : ''}`} onClick={onStart} aria-label={`${cta}: ${tour.title}`}>
        {badge === 'done' ? 'Repetir' : cta}
      </button>
    </li>
  )
}

// ---- 🎓 Enséñame: tutoriales principales (series) y sus capítulos
export function HelpLearnArea({ focusModule }: { focusModule: HelpModuleId | null }) {
  const help = useHelp()
  const [q, setQ] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [open, setOpen] = useState<string | null>(help.learnSeriesId)
  const canChapter = help.canDoTour

  // Si se abre el área desde una ficha o la búsqueda con una serie concreta, se despliega.
  useEffect(() => {
    if (help.learnSeriesId) setOpen(help.learnSeriesId)
  }, [help.learnSeriesId])

  const groups = useMemo(() => {
    const hits = searchSeries(q, { canDoSeries: help.canDoSeries, canDoChapter: canChapter })
    return HELP_MODULES.map((m) => ({ m, hits: hits.filter((h) => h.series.module === m.id) })).filter((g) => g.hits.length > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `canDoSeries`/`canDoTour` dependen del contexto de la cuenta
  }, [q, help.canDoSeries, help.canDoTour])

  const total = groups.reduce((n, g) => n + g.hits.length, 0)
  const done = groups.reduce((n, g) => n + g.hits.filter((h) => seriesProgress(h.series, canChapter).complete).length, 0)
  const focusGroup = focusModule ? groups.find((g) => g.m.id === focusModule) : undefined
  const shown = q.trim() || showAll || !focusGroup ? groups : [focusGroup]

  return (
    <div className="help-area" role="tabpanel" id="help-area-body" aria-labelledby="help-area-tab-learn">
      <h4 className="help-area-title">¿Qué quieres aprender a hacer?</h4>
      <p className="help-area-intro">Te enseño paso a paso sobre la propia app, en capítulos cortos de 1 o 2 minutos. Puedes hacer el recorrido completo o ir directo al capítulo que te interese. Tú haces cada paso de verdad; yo te lo voy señalando. Si sales a mitad, no se guarda nada que no hayas guardado tú.</p>
      <label htmlFor="help-learn-q" className="help-visually-hidden">
        Buscar entre los tutoriales
      </label>
      <input id="help-learn-q" type="search" className="help-area-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar: crear un evento, subir un ticket…" autoComplete="off" />
      <p className="muted help-area-meta">
        {total === 0 ? 'No hay tutoriales con esa búsqueda.' : `${total} ${total === 1 ? 'tutorial' : 'tutoriales'} · ${done} completo${done === 1 ? '' : 's'}`}
      </p>
      {shown.map(({ m, hits }) => (
        <section key={m.id} className="help-area-block" aria-label={m.label}>
          <h4>
            {m.icon} {m.label}
          </h4>
          <ul className="help-area-list">
            {hits.map((h) => (
              <SeriesRow key={h.series.id} hit={h} open={open === h.series.id || (Boolean(q.trim()) && h.chapters.length > 0)} onToggle={() => setOpen(open === h.series.id ? null : h.series.id)} />
            ))}
          </ul>
        </section>
      ))}
      {!q.trim() && focusGroup && !showAll && groups.length > 1 && (
        <button type="button" className="help-btn" onClick={() => setShowAll(true)}>
          Ver los tutoriales de todas las secciones
        </button>
      )}
    </div>
  )
}

function SeriesRow({ hit, open, onToggle }: { hit: SeriesHit; open: boolean; onToggle: () => void }) {
  const help = useHelp()
  const { series } = hit
  const prog = seriesProgress(series, help.canDoTour)
  const chapters = chaptersOf(series).filter((c) => help.canDoTour(c.id))
  const first = chapters[0]
  const sec = chapters.reduce((n, c) => n + c.durationSec, 0)
  const multi = chapters.length > 1
  const label = prog.complete ? 'Repetir el recorrido' : prog.started && prog.next && prog.next !== first ? 'Continuar' : 'Recorrido completo'
  const startAt = prog.complete || !prog.started ? first : prog.next
  const ref = useRef<HTMLLIElement | null>(null)
  useEffect(() => {
    if (open && help.learnSeriesId === series.id) ref.current?.scrollIntoView?.({ block: 'nearest' })
  }, [open, help.learnSeriesId, series.id])
  if (!first) return null
  return (
    <li className="help-area-row help-series-row" ref={ref}>
      <div className="help-series-head">
        <div className="help-area-row-main">
          <strong>{series.title}</strong>
          <span className="muted">{series.summary}</span>
          <span className="muted help-area-meta">
            {multi ? `${chapters.length} capítulos · ` : ''}
            {minutes(sec)}
            {prog.complete ? ' · ✓ Hecho' : prog.done > 0 ? ` · ${prog.done} de ${prog.total} hechos` : prog.started ? ' · Empezado' : ''}
          </span>
        </div>
        <div className="help-series-actions">
          <button type="button" className="help-btn help-btn-primary" onClick={() => help.startTourById((startAt ?? first).id)} aria-label={`${label}: ${series.title}`}>
            {label}
          </button>
          {multi && (
            <button type="button" className="help-btn" onClick={onToggle} aria-expanded={open} aria-label={`${open ? 'Ocultar' : 'Ver'} los capítulos de ${series.title}`}>
              {open ? 'Ocultar capítulos' : 'Ver capítulos'}
            </button>
          )}
        </div>
      </div>
      {multi && open && (
        <ol className="help-chapters">
          {chapters.map((c, i) => {
            const isDone = chapterDone(c)
            const suggested = hit.chapters.some((x) => x.id === c.id)
            return (
              <li key={c.id} className={`help-chapter${suggested ? ' help-chapter-hit' : ''}`}>
                <div className="help-chapter-main">
                  <strong>
                    {i + 1}. {c.title}
                  </strong>
                  {c.summary && <span className="muted">{c.summary}</span>}
                  <span className="muted help-area-meta">
                    {minutes(c.durationSec)}
                    {isDone ? ' · ✓ Hecho' : getTourProgress(c.id)?.status === 'started' ? ' · Empezado' : ''}
                  </span>
                </div>
                <button type="button" className="help-btn" onClick={() => help.startTourById(c.id)} aria-label={`${isDone ? 'Repetir' : 'Empezar'} el capítulo ${i + 1}: ${c.title}`}>
                  {isDone ? 'Repetir' : 'Empezar'}
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </li>
  )
}

// ---- ⚙️ Cómo funciona PEPA
export function HelpHowArea({ focusModule }: { focusModule: HelpModuleId | null }) {
  const help = useHelp()
  const [q, setQ] = useState('')
  const current = help.explainerId ? EXPLAINER_BY_ID.get(help.explainerId) : undefined

  // La misma regla que las fichas: el módulo (secciones permitidas, Comunidad 18+) y la regla propia de la explicación.
  const allowed = (e: HelpExplainer) => help.canExplain(e.id)

  const groups = useMemo(() => {
    const words = normalizeText(q).split(/\s+/).filter(Boolean)
    const items = EXPLAINERS.filter(allowed).filter((e) => {
      if (words.length === 0) return true
      const hay = normalizeText(`${e.title} ${e.summary} ${(e.synonyms ?? []).join(' ')} ${HELP_MODULE_BY_ID.get(e.module)?.label ?? ''}`)
      return words.every((w) => hay.includes(w))
    })
    return HELP_MODULES.map((m) => ({ m, items: items.filter((e) => e.module === m.id) })).filter((g) => g.items.length > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `allowed` solo depende del contexto de la cuenta
  }, [q, help.ctx])

  if (current && allowed(current)) return <ExplainerDetail e={current} />

  const ordered = focusModule ? [...groups].sort((a, b) => Number(b.m.id === focusModule) - Number(a.m.id === focusModule)) : groups
  return (
    <div className="help-area" role="tabpanel" id="help-area-body" aria-labelledby="help-area-tab-how">
      <h4 className="help-area-title">Cómo funciona PEPA</h4>
      <p className="help-area-intro">Explicaciones sencillas de lo que PEPA hace por su cuenta: cómo lee un ticket, cómo clasifica, qué compara, qué NO hace y qué puedes corregir tú.</p>
      <label htmlFor="help-how-q" className="help-visually-hidden">
        Buscar entre las explicaciones
      </label>
      <input id="help-how-q" type="search" className="help-area-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar: ticket, categorías, conciliación…" autoComplete="off" />
      {ordered.length === 0 && <p className="muted">{q.trim() ? 'No hay explicaciones con esa búsqueda.' : 'Todavía no hay explicaciones disponibles.'}</p>}
      {ordered.map(({ m, items }) => (
        <section key={m.id} className="help-area-block" aria-label={m.label}>
          <h4>
            {m.icon} {m.label}
          </h4>
          <ul className="help-area-list">
            {items.map((e) => (
              <li key={e.id} className="help-area-row">
                <div className="help-area-row-main">
                  <strong>{e.title}</strong>
                  <span className="muted">{e.summary}</span>
                </div>
                <button type="button" className="help-btn" onClick={() => help.openExplainer(e.id)} aria-label={`Leer: ${e.title}`}>
                  Leer
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

export function ExplainerDetail({ e }: { e: HelpExplainer }) {
  const help = useHelp()
  const mod = HELP_MODULE_BY_ID.get(e.module)
  const tour = e.tour && getTour(e.tour) && help.canDoTour(e.tour) ? e.tour : null
  return (
    <article className="help-area help-explainer" role="tabpanel" id="help-area-body" aria-labelledby="help-area-tab-how" aria-label={e.title}>
      <button type="button" className="help-btn" onClick={() => help.openExplainer(null)}>
        ← Todas las explicaciones
      </button>
      <p className="help-answer-module">
        {mod?.icon} {mod?.label}
      </p>
      <h3 className="help-area-title">{e.title}</h3>
      <p className="help-answer-quick">{e.summary}</p>
      {e.sections.map((s) => (
        <section key={s.heading} className="help-explainer-section">
          <h4>{s.heading}</h4>
          {s.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {s.example && (
            <p className="help-note" role="note">
              <strong>Ejemplo:</strong> {s.example}
            </p>
          )}
        </section>
      ))}
      {e.limits.length > 0 && (
        <section className="help-explainer-section">
          <h4>Lo que PEPA no hace (todavía)</h4>
          <ul>
            {e.limits.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>
      )}
      {e.ifWrong.length > 0 && (
        <section className="help-explainer-section">
          <h4>Si el resultado no es el que esperabas</h4>
          <ul>
            {e.ifWrong.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>
      )}
      <div className="help-actions">
        {tour && (
          <button type="button" className="help-btn help-btn-primary" onClick={() => help.startTourById(tour)}>
            Enséñame a corregirlo
          </button>
        )}
        {e.go && (
          <button type="button" className="help-btn" onClick={() => help.goToPlace(e.go!, e.title)}>
            {e.go.label ?? 'Llévame'}
          </button>
        )}
        {SUPPORT_ENABLED && (
          <button type="button" className="help-btn" onClick={() => help.setArea('support')}>
            Me parece un fallo, no una limitación
          </button>
        )}
      </div>
      <p className="muted help-area-meta">Comprobado contra la app el {e.verified}.</p>
    </article>
  )
}

// ---- 🛟 Soporte técnico (solo con SUPPORT_ENABLED)
export function HelpSupportArea({ focusModule, openTicketId }: { focusModule: HelpModuleId | null; openTicketId?: string | null }) {
  if (!SUPPORT_ENABLED) return null
  return (
    <div className="help-area" role="tabpanel" id="help-area-body" aria-labelledby="help-area-tab-support">
      <Suspense fallback={<p className="muted">Cargando…</p>}>
        <SupportArea moduleId={focusModule} openTicketId={openTicketId} />
      </Suspense>
    </div>
  )
}

// Enlaces «¿Cómo funciona?» desde una ficha: las explicaciones que citan esa ficha.
export function explainersForCard(cardId: string): HelpExplainer[] {
  return EXPLAINERS.filter((e) => e.cardIds?.includes(cardId))
}
