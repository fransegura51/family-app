import { useEffect, useRef, useState } from 'react'
import '@/ui/community/communityPost.css'

// Foto ampliada en ventana emergente (fotos de una publicación y de un comentario). Se cierra con el botón, tocando fuera o con Escape, y al cerrar la persona
// vuelve EXACTAMENTE a donde estaba: no se mueve el desplazamiento y el foco regresa al botón que la abrió. Con varias fotos hay flechas (y teclas ← →).
export function PhotoLightbox({ urls, startIndex = 0, label, onClose }: { urls: string[]; startIndex?: number; label: string; onClose: () => void }) {
  const [index, setIndex] = useState(Math.min(Math.max(startIndex, 0), Math.max(urls.length - 1, 0)))
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // Se recuerda dónde estaba la persona (posición y elemento con foco) para devolverla ahí al cerrar.
    const opener = document.activeElement as HTMLElement | null
    const scrollY = window.scrollY
    closeRef.current?.focus()
    return () => {
      opener?.focus?.({ preventScroll: true })
      if (window.scrollY !== scrollY) window.scrollTo(0, scrollY)
    }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
      else if (e.key === 'ArrowRight') setIndex((i) => Math.min(urls.length - 1, i + 1))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, urls.length])

  if (urls.length === 0) return null
  const many = urls.length > 1

  return (
    <div className="community-lightbox" role="dialog" aria-modal="true" aria-label={label} onClick={onClose}>
      <button ref={closeRef} type="button" className="community-lightbox-close" aria-label="Cerrar la foto" onClick={onClose}>
        ✕
      </button>
      <img className="community-lightbox-img" src={urls[index]} alt={many ? `Foto ${index + 1} de ${urls.length}` : 'Foto ampliada'} onClick={(e) => e.stopPropagation()} />
      {many && (
        <div className="community-lightbox-nav" onClick={(e) => e.stopPropagation()}>
          <button type="button" aria-label="Foto anterior" disabled={index === 0} onClick={() => setIndex(index - 1)}>
            ◀
          </button>
          <span aria-live="polite">
            {index + 1} / {urls.length}
          </span>
          <button type="button" aria-label="Foto siguiente" disabled={index === urls.length - 1} onClick={() => setIndex(index + 1)}>
            ▶
          </button>
        </div>
      )}
    </div>
  )
}
