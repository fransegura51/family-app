// Menú explicativo de cada sección — petición real: "menú explicativo
// para cada sección y lo que tiene que ofrecer", pensando sobre todo en
// quien se une a la app por primera vez (un invitado, o cualquier
// miembro nuevo de la familia) y no sabe para qué sirve cada pestaña.
//
// Ampliado más tarde a petición real: la versión inicial (una frase por
// sección) se quedaba corta — el usuario pidió el mismo nivel de
// detalle que el menú de ayuda de una app de referencia (Cozi), que
// explica cada función concreta una a una. Cada tarjeta es ahora un
// desplegable: la frase resumen se ve siempre, y al tocarla se abre el
// listado detallado de cada bloque/función de esa sección.
//
// IMPORTANTE para quien mantenga este archivo: HELP_DETAILS debe
// reflejar la app tal y como está de verdad. Cada vez que se añada,
// cambie o quite una función en cualquier sección, hay que actualizar
// aquí su entrada correspondiente en el mismo cambio — si no, la ayuda
// queda desactualizada y deja de ser fiable.
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { NAV_TABS } from '@/domain/navTabs'
import ayudaHeaderImg from '@/assets/ayuda/ayuda-header.jpg'
import { SectionBreadcrumb } from '@/ui/SectionBreadcrumb'
import { HELP_DETAILS, HELP_VIDEOS, SETTINGS_ENTRY, SUMMARIES, type HelpItem } from '@/help/legacy/legacyHelp'

// Petición real: "quiero que me pongas un buscador para buscar
// directamente lo que necesito... que me lleve a la sección de ayuda
// donde te explica [eso]" — busca por palabra suelta en el título de
// cada sección y en el título/texto de cada punto de detalle, no solo
// coincidencia exacta: "banco" tiene que encontrar "bancaria" aunque
// no sea la misma palabra completa, comparando solo el principio de
// cada palabra (mismo criterio que ya se usaba para emparejar
// productos leídos de un ticket).
interface SearchEntry {
  to: string
  sectionIcon: string
  sectionLabel: string
  itemTitle: string
  itemText: string
}

function normalizeSearch(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

const SEARCH_STOPWORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'y', 'o', 'un', 'una', 'para', 'con', 'en', 'como', 'que', 'se', 'es', 'a', 'al', 'mi', 'tu', 'su',
])

function significantSearchWords(s: string): string[] {
  return normalizeSearch(s)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !SEARCH_STOPWORDS.has(w))
}

// Dos palabras "coinciden" si son iguales, o si ambas tienen 4+ letras
// y comparten las 4 primeras — así "banco" encuentra "bancaria",
// "instalar" encuentra "instalación", etc., sin depender de acertar
// la palabra exacta.
function wordsMatch(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length < 4 || b.length < 4) return false
  return a.slice(0, 4) === b.slice(0, 4)
}

function searchMatchScore(queryWords: string[], haystack: string): number {
  const haystackWords = significantSearchWords(haystack)
  let score = 0
  for (const q of queryWords) {
    if (haystackWords.some((h) => wordsMatch(q, h))) score++
  }
  return score
}

const SEARCH_INDEX: SearchEntry[] = [
  ...NAV_TABS.flatMap((tab) =>
    (HELP_DETAILS[tab.to] ?? []).map((item) => ({
      to: tab.to,
      sectionIcon: tab.icon,
      sectionLabel: tab.label,
      itemTitle: item.title,
      itemText: item.text,
    })),
  ),
  ...SETTINGS_ENTRY.details.map((item) => ({
    to: SETTINGS_ENTRY.to,
    sectionIcon: SETTINGS_ENTRY.icon,
    sectionLabel: SETTINGS_ENTRY.label,
    itemTitle: item.title,
    itemText: item.text,
  })),
]

function HelpCard({
  to,
  icon,
  label,
  summary,
  details,
  expanded,
  onToggle,
  highlightedItem,
  cardRef,
  video,
}: {
  to: string
  icon: string
  label: string
  summary: string
  details: HelpItem[]
  expanded: boolean
  onToggle: () => void
  highlightedItem?: string | null
  cardRef?: (el: HTMLDivElement | null) => void
  video?: { src: string; poster: string; dur: string }
}) {
  const [showVideo, setShowVideo] = useState(false)
  return (
    <div className="card ayuda-card" ref={cardRef}>
      <button type="button" className="ayuda-card-header" onClick={onToggle} aria-expanded={expanded}>
        <div className="ayuda-card-main">
          <strong>
            {icon} {label}
          </strong>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            {summary}
          </p>
        </div>
        <span className="ayuda-card-chevron">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <div className="ayuda-card-detail">
          {video &&
            (showVideo ? (
              <video
                src={video.src}
                poster={video.poster}
                controls
                autoPlay
                playsInline
                preload="metadata"
                style={{ display: 'block', width: '100%', maxWidth: 320, margin: '4px auto 12px', borderRadius: 12, background: '#000' }}
              >
                Tu navegador no puede reproducir este vídeo.
              </video>
            ) : (
              <button type="button" style={{ margin: '4px 0 12px', width: '100%' }} onClick={() => setShowVideo(true)}>
                ▶ Ver vídeo explicativo ({video.dur}, con la voz de Pepa)
              </button>
            ))}
          {details.map((item) => (
            <div
              key={item.title}
              className={'ayuda-detail-item' + (item.title === highlightedItem ? ' ayuda-detail-item-highlight' : '')}
            >
              <strong>{item.title}</strong>
              <p className="muted" style={{ margin: '2px 0 0' }}>
                {item.text}
              </p>
            </div>
          ))}
          <Link to={to} className="ayuda-detail-link">
            Ir a esta sección →
          </Link>
        </div>
      )}
    </div>
  )
}

export function AyudaScreen() {
  const [expandedTo, setExpandedTo] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [highlightedItem, setHighlightedItem] = useState<string | null>(null)
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const searchResults = useMemo(() => {
    const words = significantSearchWords(searchQuery)
    if (words.length === 0) return []
    return SEARCH_INDEX.map((entry) => ({
      entry,
      score: searchMatchScore(words, `${entry.sectionLabel} ${entry.itemTitle} ${entry.itemText}`),
    }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((r) => r.entry)
  }, [searchQuery])

  function goToResult(entry: SearchEntry) {
    setSearchQuery('')
    setExpandedTo(entry.to)
    setHighlightedItem(entry.itemTitle)
    requestAnimationFrame(() => {
      cardRefs.current[entry.to]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    setTimeout(() => setHighlightedItem(null), 2500)
  }

  return (
    <div className="screen">
      <div className="kitchen-header kitchen-header-familia">
        <img src={ayudaHeaderImg} alt="Ayuda" className="kitchen-header-img" />
      </div>
      <SectionBreadcrumb subsection="Inicio" />
      <p className="muted">Para qué sirve cada sección de la app. Toca una para ver el detalle.</p>

      <label className="ayuda-search-label">
        Buscar en la ayuda
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="p. ej. «conectar banco», «importar contactos»…"
        />
      </label>

      {searchQuery.trim() ? (
        <div className="card" style={{ padding: 8, marginTop: 8 }}>
          {searchResults.length > 0 ? (
            searchResults.map((r) => (
              <button key={`${r.to}-${r.itemTitle}`} type="button" className="recipe-list-row" onClick={() => goToResult(r)}>
                <span>
                  <strong>{r.itemTitle}</strong>
                  <span className="muted" style={{ display: 'block', fontSize: 12 }}>
                    {r.sectionIcon} {r.sectionLabel}
                  </span>
                </span>
              </button>
            ))
          ) : (
            <p className="muted" style={{ margin: '4px 8px' }}>
              No he encontrado nada para "{searchQuery}".
            </p>
          )}
        </div>
      ) : (
        <div className="event-list">
          {NAV_TABS.map((tab) => (
            <HelpCard
              key={tab.to}
              to={tab.to}
              icon={tab.icon}
              label={tab.label}
              summary={SUMMARIES[tab.to] ?? ''}
              details={HELP_DETAILS[tab.to] ?? []}
              expanded={expandedTo === tab.to}
              onToggle={() => setExpandedTo((cur) => (cur === tab.to ? null : tab.to))}
              highlightedItem={expandedTo === tab.to ? highlightedItem : null}
              video={HELP_VIDEOS[tab.to]}
              cardRef={(el) => {
                cardRefs.current[tab.to] = el
              }}
            />
          ))}
          <HelpCard
            to={SETTINGS_ENTRY.to}
            icon={SETTINGS_ENTRY.icon}
            label={SETTINGS_ENTRY.label}
            summary={SETTINGS_ENTRY.summary}
            details={SETTINGS_ENTRY.details}
            expanded={expandedTo === SETTINGS_ENTRY.to}
            onToggle={() => setExpandedTo((cur) => (cur === SETTINGS_ENTRY.to ? null : SETTINGS_ENTRY.to))}
            highlightedItem={expandedTo === SETTINGS_ENTRY.to ? highlightedItem : null}
            cardRef={(el) => {
              cardRefs.current[SETTINGS_ENTRY.to] = el
            }}
          />
        </div>
      )}
      <p className="muted" style={{ fontSize: 12, marginTop: 24, textAlign: 'center' }}>
        <a href={`${import.meta.env.BASE_URL}privacidad.html`}>Política de privacidad</a>
        {' · '}
        <a href={`${import.meta.env.BASE_URL}terminos.html`}>Términos de uso</a>
      </p>
    </div>
  )
}
