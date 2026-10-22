import { Link } from 'react-router-dom'
import { NAV_TABS } from '@/domain/navTabs'
import { HELP_COVERAGE_LABEL, type HelpCoverage } from '@/admin/features/featureTypes'
import { HELP_DETAILS, HELP_VIDEOS, SUMMARIES } from '@/ui/AyudaScreen'
import { useFeatureRows } from '@/ui/admin/useFeatureRows'

// Área «Ayuda y documentación»: qué cubre hoy la Ayuda de PEPA, qué tutoriales hay y qué funciones no están (o están a medias) en la Ayuda, como base para la fase B3. Todo se calcula
// con la Ayuda real, sin consultas al servidor. Una función con la Ayuda incompleta NO está «parcialmente desarrollada»: son dos cosas separadas.
const COVERAGE_ORDER: HelpCoverage[] = ['completa', 'parcial', 'inexistente', 'pendiente']

export function AreaAyuda() {
  const rows = useFeatureRows()
  const sections = Object.keys(HELP_DETAILS).map((route) => {
    const tab = NAV_TABS.find((t) => t.to === route)
    return { route, label: tab ? `${tab.icon} ${tab.label}` : route, items: HELP_DETAILS[route].length, hasSummary: Boolean(SUMMARIES[route]), video: HELP_VIDEOS[route] }
  })
  const withoutSection = NAV_TABS.filter((t) => !HELP_DETAILS[t.to])
  const totals = COVERAGE_ORDER.map((c) => ({ c, n: rows.filter((r) => r.help.coverage === c).length }))
  // Una función desactivada (apagada o sin pantalla) todavía no necesita Ayuda: se cuenta aparte para no pedir documentar lo que nadie puede usar.
  const gaps = rows.filter((r) => r.help.coverage !== 'completa' && r.entry.state !== 'desactivada')
  const switchedOff = rows.filter((r) => r.entry.state === 'desactivada').length

  return (
    <div className="admin-area">
      <p className="muted">
        Qué cubre hoy la Ayuda y qué le falta. La cobertura de cada función se calcula buscando sus puntos clave en el texto real de la Ayuda: si alguien mejora la Ayuda, esta lista cambia sola.
      </p>
      <p>
        <Link to="/ayuda" className="link-button">
          📖 Abrir la Ayuda tal como la ven las familias →
        </Link>
      </p>

      <h2 className="section-title">Cobertura de las funciones</h2>
      <p className="admin-counts">
        {totals.map(({ c, n }) => (
          <span key={c}>
            {HELP_COVERAGE_LABEL[c]}: <strong>{n}</strong>{' '}
          </span>
        ))}
      </p>

      <h2 className="section-title">Secciones de la Ayuda</h2>
      <ul className="admin-plain-list">
        {sections.map((s) => (
          <li key={s.route} className="card">
            <strong>{s.label}</strong> — {s.items} apartados
            {s.video ? ` · 🎬 vídeo (${s.video.dur})` : ' · sin vídeo'}
            {!s.hasSummary && ' · sin resumen'}
          </li>
        ))}
      </ul>
      {withoutSection.length > 0 && <p className="muted">Secciones de la app sin entrada propia en la Ayuda: {withoutSection.map((t) => t.label).join(', ')}.</p>}
      <p className="muted">Comunidad no tiene entrada en la Ayuda (tiene sus propias Normas dentro de Comunidad).</p>

      <h2 className="section-title">Tutoriales existentes</h2>
      <ul className="admin-plain-list">
        {Object.entries(HELP_VIDEOS).map(([route, v]) => (
          <li key={route} className="card">
            🎬 <strong>{NAV_TABS.find((t) => t.to === route)?.label ?? route}</strong> — {v.dur}{' '}
            <a href={v.src} target="_blank" rel="noreferrer">
              abrir vídeo
            </a>
          </li>
        ))}
      </ul>

      <h2 className="section-title">Funciones con la Ayuda por completar ({gaps.length})</h2>
      <p className="muted">
        Base para la fase B3. «Pendiente de revisión» significa que todavía no se ha decidido qué debería contar la Ayuda de esa función. No se incluyen las {switchedOff} funciones desactivadas: se documentarán
        cuando se activen.
      </p>
      <ul className="admin-plain-list">
        {gaps.map(({ entry, help }) => (
          <li key={entry.id} className="card">
            <strong>{entry.name}</strong> <span className="muted">({entry.module})</span>
            <br />
            <span className={`admin-pill admin-pill-help-${help.coverage}`}>{HELP_COVERAGE_LABEL[help.coverage]}</span>
            {help.missing.length > 0 && <span className="muted"> · No cuenta: {help.missing.join(', ')}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
