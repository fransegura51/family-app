import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { safeAreaTopPx } from '@/ui/safeArea'

// Botón «☰ Menú» FLOTANTE de las secciones con cabecera ilustrada (Cocina, Calendario, Economía, Ubicación, Compras y Comunidad).
// El botón NO forma parte de la página: se pinta aparte, directamente en <body> (así ningún contenedor con recorte, redondeo o transformaciones —el motivo de que en el iPhone se
// moviera con la cabecera— puede arrastrarlo) y queda FIJO en la pantalla, arriba a la izquierda. Con la página arriba del todo cae a media altura de la cabecera ilustrada; al desplazarse
// se queda quieto donde estaba. Nunca sube por encima de la fila de botones de Pepa ni de la zona segura (hora e indicadores del teléfono), que conservan su sitio.
// UNA sola implementación para todas las secciones: ninguna hoja de estilos específica puede contradecirla.
const FAB_HEIGHT = 36
// Debajo de la fila de Pepa (que empieza en la zona segura + 8 px y mide 42 px): zona segura + 58 px como mínimo.
const MIN_BELOW_SAFE_AREA = 58

// Posición vertical fija del botón: la que tendría a media altura de la cabecera con la página arriba del todo, sin bajar nunca de la zona segura + la fila de Pepa.
export function menuFabTop(headerDocTop: number, headerHeight: number, safeTop: number): number {
  return Math.max(Math.round(headerDocTop + headerHeight / 2 - FAB_HEIGHT / 2), safeTop + MIN_BELOW_SAFE_AREA)
}

// Mide la cabecera (al montar, al cambiar de tamaño, al girar y al cargar su imagen) y devuelve la altura fija del botón (null hasta que se mide).
export function useMenuFabTop(anchor: RefObject<HTMLElement | null>): { top: number | null; measure: () => void } {
  const [top, setTop] = useState<number | null>(null)
  const measure = useCallback(() => {
    const el = anchor.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setTop(menuFabTop(r.top + window.scrollY, r.height, safeAreaTopPx()))
  }, [anchor])

  useLayoutEffect(measure, [measure])
  useEffect(() => {
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    const el = anchor.current
    const ro = typeof ResizeObserver !== 'undefined' && el ? new ResizeObserver(measure) : null
    if (ro && el) ro.observe(el)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
      ro?.disconnect()
    }
  }, [measure, anchor])
  return { top, measure }
}

// El botón en sí, pintado en <body>.
export const MenuFab = forwardRef<HTMLButtonElement, { top: number | null; open: boolean; ariaLabel: string; onClick: () => void; controls?: string; expanded?: boolean; helpId?: string }>(function MenuFab(
  { top, open, ariaLabel, onClick, controls, expanded, helpId },
  ref,
) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <button
      type="button"
      ref={ref}
      className="kitchen-header-menu-fab kitchen-header-menu-fab-floating menu-fab-portal"
      style={top !== null ? { top } : undefined}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-controls={controls}
      aria-expanded={expanded}
      data-help-id={helpId}
    >
      {open ? '✕' : '☰'} Menú
    </button>,
    document.body,
  )
})

export function KitchenHeaderWithMenu({
  imgSrc,
  alt,
  open,
  ariaLabel,
  onToggle,
  helpId,
}: {
  imgSrc: string
  alt: string
  open: boolean
  ariaLabel: string
  onToggle: () => void
  /** Marca `data-help-id` para la Ayuda (visitas y tutoriales); no cambia nada visible. */
  helpId?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const { top, measure } = useMenuFabTop(ref)
  return (
    <div className="kitchen-header" ref={ref}>
      <img src={imgSrc} alt={alt} className="kitchen-header-img" onLoad={measure} />
      <MenuFab top={top} open={open} ariaLabel={ariaLabel} onClick={onToggle} helpId={helpId} />
    </div>
  )
}
