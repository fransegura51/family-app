// Pantalla de Ayuda de PEPA — «Pepa te acompaña» (B3). Sustituye a la antigua lista de tarjetas por: un buscador conversacional («¿Qué quieres hacer o saber?»), acciones
// frecuentes, el catálogo completo de módulos (cada uno con sus fichas breves, su vídeo y TODA la explicación ampliada histórica) y la biblioteca de vídeos.
//
// IMPORTANTE para quien mantenga la Ayuda (regla AYUDA-01, ver CLAUDE.md): cuando se cree, cambie, desactive o elimine una función hay que revisar en el MISMO cambio su ficha
// (src/help/catalog), el destino de «Llévame», los pasos de «Enséñame» y la cobertura que se ve en el Centro de Administración. Las pruebas de src/help comprueban que los
// botones citados existen en el código y que las rutas son reales.
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import ayudaHeaderImg from '@/assets/ayuda/ayuda-header.jpg'
import { HELP_MODULES, HELP_VIDEOS, cardsOfModule, legacyEntriesOfModule, summaryOfModule } from '@/help/catalog'
import { moduleAccess } from '@/help/access'
import type { HelpModule } from '@/help/types'
import { HelpConversation } from '@/help/ui/HelpConversation'
import { HelpVideo } from '@/help/ui/HelpVideo'
import { useOptionalHelp } from '@/help/ui/helpContext'
import { HelpVoiceSetting } from '@/help/ui/HelpVoiceSetting'
import { PepaFace } from '@/help/ui/PepaFace'
import { SectionBreadcrumb } from '@/ui/SectionBreadcrumb'
import '@/help/ui/help.css'

export function AyudaScreen() {
  const help = useOptionalHelp()
  const location = useLocation()
  const wanted = (location.state as { module?: string } | null)?.module
  const [expanded, setExpanded] = useState<string | null>(wanted ?? null)
  const topRef = useRef<HTMLDivElement | null>(null)

  // Al entrar en Ayuda se comprueba (una sola vez, con la memoria compartida) si Comunidad está abierta para esta cuenta, para decidir qué fichas se enseñan.
  const ensured = useRef(false)
  useEffect(() => {
    if (ensured.current || !help) return
    ensured.current = true
    help.ensureCommunity()
  }, [help])

  const showCard = (id: string) => {
    help?.showCard(id)
    requestAnimationFrame(() => topRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }))
  }

  return (
    <div className="screen">
      <div className="kitchen-header kitchen-header-familia">
        <img src={ayudaHeaderImg} alt="Ayuda" className="kitchen-header-img" />
      </div>
      <SectionBreadcrumb subsection="Inicio" />

      <div className="help-screen-intro" ref={topRef}>
        <PepaFace size={44} />
        <p style={{ margin: 0 }}>
          <strong>Pepa te acompaña.</strong> Pregúntame lo que quieras hacer o saber en PEPA: te lo explico, te llevo al sitio o, cuando hay tutorial, te enseño paso a paso.
        </p>
      </div>

      {help ? (
        <>
          <HelpVoiceSetting />
          <div className="help-actions" style={{ margin: '8px 0' }}>
            <button type="button" className="help-btn" onClick={() => help.startTourById('bienvenida')}>
              🎓 Recorrido de bienvenida (1-2 minutos)
            </button>
          </div>
          <HelpConversation />
        </>
      ) : (
        <p className="muted">La Ayuda no está disponible en este momento.</p>
      )}

      <h2 className="help-section-title">Todos los temas de PEPA</h2>
      <p className="muted">Toca un tema para ver sus preguntas más habituales y toda su explicación.</p>
      <div className="help-modules">
        {HELP_MODULES.map((m) => (
          <ModuleCard key={m.id} mod={m} open={expanded === m.id} onToggle={() => setExpanded((cur) => (cur === m.id ? null : m.id))} onShowCard={showCard} />
        ))}
      </div>

      <h2 className="help-section-title">Vídeos explicativos</h2>
      <ul className="help-video-list">
        {Object.entries(HELP_VIDEOS).map(([route, v]) => {
          const mod = HELP_MODULES.find((m) => m.legacyRoute === route)
          return (
            <li key={route} className="card">
              <strong>
                {mod?.icon} {mod?.label ?? route}
              </strong>
              <HelpVideo src={v.src} poster={v.poster} dur={v.dur} />
            </li>
          )
        })}
      </ul>

      <p className="muted" style={{ fontSize: 12, marginTop: 24, textAlign: 'center' }}>
        <a href={`${import.meta.env.BASE_URL}privacidad.html`}>Política de privacidad</a>
        {' · '}
        <a href={`${import.meta.env.BASE_URL}terminos.html`}>Términos de uso</a>
      </p>
    </div>
  )
}

function ModuleCard({ mod, open, onToggle, onShowCard }: { mod: HelpModule; open: boolean; onToggle: () => void; onShowCard: (id: string) => void }) {
  const help = useOptionalHelp()
  const access = help ? moduleAccess(mod, help.ctx) : { status: 'allowed' as const, reason: undefined }
  if (access.status === 'hidden') return null
  const cards = cardsOfModule(mod.id).filter((c) => !help || help.accessOfCard(c).status !== 'hidden')
  const legacy = legacyEntriesOfModule(mod.id)
  const video = mod.legacyRoute ? HELP_VIDEOS[mod.legacyRoute] : undefined
  const bodyId = `help-mod-${mod.id}`
  return (
    <section className="card help-module" aria-labelledby={`${bodyId}-h`}>
      <h3 style={{ margin: 0, fontSize: 'inherit' }} id={`${bodyId}-h`}>
        <button type="button" className="help-module-head" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
          <span aria-hidden="true" style={{ fontSize: 22 }}>
            {mod.icon}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <strong>{mod.label}</strong>
            <span className="muted" style={{ display: 'block', fontSize: 13 }}>
              {summaryOfModule(mod)}
            </span>
          </span>
          <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        </button>
      </h3>
      <div id={bodyId} className="help-module-body" role="region" aria-labelledby={`${bodyId}-h`} hidden={!open}>
        {open && (
          <>
            {access.status === 'restricted' && <p className="help-note help-note-restricted">🔒 {access.reason}</p>}
            {access.status === 'allowed' && (
              <div className="help-actions">
                <Link to={mod.path} className="help-btn help-btn-primary">
                  Llévame a {mod.label}
                </Link>
              </div>
            )}
            {cards.length > 0 && (
              <ul className="help-quick" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {cards.map((c) => (
                  <li key={c.id}>
                    <button type="button" className="help-chip" onClick={() => onShowCard(c.id)}>
                      {c.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {video && <HelpVideo src={video.src} poster={video.poster} dur={video.dur} />}
            {legacy.length > 0 && (
              <details className="help-more">
                <summary>
                  Explicación completa de {mod.label} ({legacy.length})
                </summary>
                {legacy.map((e) => (
                  <div key={e.id} className="help-legacy-item">
                    <strong>{e.title}</strong>
                    <p>{e.text}</p>
                  </div>
                ))}
              </details>
            )}
          </>
        )}
      </div>
    </section>
  )
}
