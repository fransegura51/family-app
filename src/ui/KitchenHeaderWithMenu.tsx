import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { safeAreaTopPx } from '@/ui/safeArea'

// Cabecera ilustrada de una sección (Cocina, Calendario, Economía, Ubicación, Compras) con su botón «☰ Menú» FLOTANTE.
// El botón NO forma parte de la página: se pinta aparte, directamente en <body> (así ningún contenedor con recorte, redondeo o transformaciones —el motivo de que en el iPhone se
// moviera con la cabecera— puede arrastrarlo) y queda FIJO en la pantalla, arriba a la izquierda. Con la página arriba del todo cae a media altura de la cabecera ilustrada; al desplazarse
// se queda quieto donde estaba. Nunca sube por encima de la fila de botones de Pepa ni de la zona segura (hora e indicadores del teléfono), que conservan su sitio.
const FAB_HEIGHT = 36
// Debajo de la fila de Pepa (que empieza en la zona segura + 8 px y mide 42 px): zona segura + 58 px como mínimo.
const MIN_BELOW_SAFE_AREA = 58

// Posición vertical fija del botón: la que tendría a media altura de la cabecera con la página arriba del todo, sin bajar nunca de la zona segura + la fila de Pepa.
export function menuFabTop(headerDocTop: number, headerHeight: number, safeTop: number): number {
  return Math.max(Math.round(headerDocTop + headerHeight / 2 - FAB_HEIGHT / 2), safeTop + MIN_BELOW_SAFE_AREA)
}

export function KitchenHeaderWithMenu({
  imgSrc,
  alt,
  open,
  ariaLabel,
  onToggle,
}: {
  imgSrc: string
  alt: string
  open: boolean
  ariaLabel: string
  onToggle: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [top, setTop] = useState<number | null>(null)

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setTop(menuFabTop(r.top + window.scrollY, r.height, safeAreaTopPx()))
  }, [])

  useLayoutEffect(measure, [measure])
  useEffect(() => {
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    const el = ref.current
    const ro = typeof ResizeObserver !== 'undefined' && el ? new ResizeObserver(measure) : null
    if (ro && el) ro.observe(el)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
      ro?.disconnect()
    }
  }, [measure])

  return (
    <div className="kitchen-header" ref={ref}>
      <img src={imgSrc} alt={alt} className="kitchen-header-img" onLoad={measure} />
      {typeof document !== 'undefined' &&
        createPortal(
          <button
            type="button"
            className="kitchen-header-menu-fab kitchen-header-menu-fab-floating menu-fab-portal"
            style={top !== null ? { top } : undefined}
            onClick={onToggle}
            aria-label={ariaLabel}
          >
            {open ? '✕' : '☰'} Menú
          </button>,
          document.body,
        )}
    </div>
  )
}
