import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { getGalleryPhotoUrls, listGalleryPhotos } from '@/data/gallery'
import { toggleFixedPhoto } from '@/domain/homeCarousel'
import type { GalleryPhoto } from '@/domain/types'
import { MAX_CAROUSEL_PHOTOS, useHomeCarouselPrefs } from '@/state/homeCarouselPrefs'
import { useCommunityVisible } from '@/ui/community/useCommunityVisible'
import { useModalDialog } from '@/ui/useModalDialog'

// Configuración del carrusel de Inicio. UN solo formulario que se usa en dos sitios: la ventana del engranaje del propio carrusel y la tarjeta «Carrusel de
// Inicio» de Configuración (que es desde donde se recupera si se ha ocultado entero). Es por móvil (localStorage): ver state/homeCarouselPrefs.ts.
//  · Activar o desactivar el carrusel completo y, por separado, Lista de la compra, Calendario, Comunidad y Fotografías.
//  · Fotografías: SOLO de la Galería PEPA (no de la galería del teléfono): al azar (hasta 5) o hasta 5 fijas elegidas aquí.
const THUMBS = 36

function PhotoPicker() {
  const [prefs, update] = useHomeCarouselPrefs()
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; photos: GalleryPhoto[]; urls: Record<string, string> }>({ status: 'loading', photos: [], urls: {} })

  // Solo se piden las fotos al elegir «fijas» (una consulta de la lista y UNA petición con las direcciones de las miniaturas).
  useEffect(() => {
    let cancelled = false
    listGalleryPhotos()
      .then(async (all) => {
        const shown = all.slice(0, THUMBS)
        const urls = await getGalleryPhotoUrls(shown.map((p) => p.storagePath)).catch(() => ({}) as Record<string, string>)
        if (!cancelled) setState({ status: 'ready', photos: shown, urls })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', photos: [], urls: {} })
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (state.status === 'loading') return <p className="muted" role="status">Cargando tu Galería…</p>
  if (state.status === 'error') return <p className="error" role="alert">No he podido cargar tu Galería PEPA. Inténtalo de nuevo más tarde.</p>
  if (state.photos.length === 0) {
    return (
      <p className="muted">
        Todavía no hay fotos en tu Galería PEPA. Cuando subas la primera podrás elegirla aquí. <Link to="/galeria">Ir a la Galería</Link>
      </p>
    )
  }
  const chosen = prefs.fixedPhotoIds
  const full = chosen.length >= MAX_CAROUSEL_PHOTOS
  return (
    <div>
      <p className="muted" role="status">
        Elegidas: {chosen.length} de {MAX_CAROUSEL_PHOTOS}
        {chosen.length === 0 && ' (si no eliges ninguna, se enseñan al azar)'}
      </p>
      <div className="carousel-photo-grid">
        {state.photos.map((p) => {
          const index = chosen.indexOf(p.id)
          const selected = index !== -1
          const url = state.urls[p.storagePath]
          return (
            <button
              key={p.id}
              type="button"
              className={'carousel-photo-option' + (selected ? ' selected' : '')}
              aria-pressed={selected}
              aria-label={`${p.caption || 'Foto de la Galería'}${selected ? `, elegida (${index + 1})` : ''}`}
              disabled={!selected && full}
              onClick={() => update({ fixedPhotoIds: toggleFixedPhoto(chosen, p.id) })}
            >
              {url ? <img src={url} alt="" loading="lazy" /> : <span aria-hidden="true">📷</span>}
              {selected && <span className="carousel-photo-badge">{index + 1}</span>}
            </button>
          )
        })}
      </div>
      <p className="muted" style={{ fontSize: 12 }}>
        Solo salen fotos de tu Galería PEPA, no de la galería del teléfono.
      </p>
    </div>
  )
}

export function HomeCarouselForm() {
  const [prefs, update] = useHomeCarouselPrefs()
  const communityVisible = useCommunityVisible() === true
  const off = !prefs.enabled
  const row = (checked: boolean, onChange: (v: boolean) => void, title: string, help?: string, disabled = false) => (
    <label className="carousel-setting">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <strong>{title}</strong>
        {help && (
          <>
            <br />
            <span className="muted">{help}</span>
          </>
        )}
      </span>
    </label>
  )
  return (
    <div className="carousel-settings-form">
      {row(prefs.enabled, (v) => update({ enabled: v }), 'Mostrar el carrusel en Inicio', off ? 'Está oculto. Márcalo para volver a verlo.' : undefined)}
      <div className="carousel-settings-parts" aria-disabled={off}>
        {row(prefs.shopping, (v) => update({ shopping: v }), '🛒 Lista de la compra', undefined, off)}
        {row(prefs.calendar, (v) => update({ calendar: v }), '📅 Calendario', undefined, off)}
        {communityVisible && row(prefs.community, (v) => update({ community: v }), '🏡 Comunidad PEPA', 'Publicaciones recientes, comentadas y preguntas sin responder.', off)}
        {row(prefs.photos, (v) => update({ photos: v }), '📷 Fotografías de la Galería PEPA', 'Hasta 5, siempre después de las tarjetas útiles.', off)}
        {prefs.photos && !off && (
          <fieldset className="carousel-photo-mode">
            <legend>Qué fotografías se enseñan</legend>
            <label className="carousel-setting">
              <input type="radio" name="carousel-photo-mode" checked={prefs.photoMode === 'random'} onChange={() => update({ photoMode: 'random' })} />
              <span>
                <strong>Al azar</strong>
                <br />
                <span className="muted">Hasta 5 de tu Galería PEPA, distintas cada vez que abres Inicio.</span>
              </span>
            </label>
            <label className="carousel-setting">
              <input type="radio" name="carousel-photo-mode" checked={prefs.photoMode === 'fixed'} onChange={() => update({ photoMode: 'fixed' })} />
              <span>
                <strong>Elegir hasta 5 fijas</strong>
              </span>
            </label>
            {prefs.photoMode === 'fixed' && <PhotoPicker />}
          </fieldset>
        )}
      </div>
      <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>Es una preferencia personal: se guarda en tu cuenta y la ves igual en todos tus dispositivos; cada persona elige la suya. No se borra nada, solo se esconde.</p>
    </div>
  )
}

// Ventana que se abre con el engranaje del carrusel. Se dibuja con un portal fuera de #root (igual que el panel de avisos) para que el fondo quede inerte.
export function HomeCarouselSettingsModal({ onClose, returnFocusRef }: { onClose: () => void; returnFocusRef?: RefObject<HTMLElement | null> }) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useModalDialog(panelRef, { onClose, returnFocusRef })
  return createPortal(
    <div className="carousel-settings-overlay" role="presentation" onClick={onClose}>
      <div ref={panelRef} className="carousel-settings-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <header className="carousel-settings-header">
          <h2 id={titleId}>Carrusel de Inicio</h2>
          <button type="button" className="notification-close" onClick={onClose} aria-label="Cerrar la configuración del carrusel">
            <span aria-hidden="true">✕</span>
          </button>
        </header>
        <HomeCarouselForm />
        <button type="button" className="carousel-settings-done" onClick={onClose}>
          Listo
        </button>
      </div>
    </div>,
    document.body,
  )
}

// Tarjeta de Configuración: aquí se recupera el carrusel cuando está oculto del todo.
export function HomeCarouselCard() {
  return (
    <div className="card event-card" style={{ marginBottom: 16 }}>
      <strong>🖼️ Carrusel de Inicio</strong>
      <p className="muted" style={{ marginTop: 4 }}>
        La tira de tarjetas de arriba en Inicio: lista de la compra, calendario, Comunidad y fotos de la Galería PEPA.
      </p>
      <HomeCarouselForm />
    </div>
  )
}
