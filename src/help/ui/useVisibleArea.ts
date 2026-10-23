import { useEffect, useState } from 'react'
import { readVisibleArea, sameArea, type VisibleArea } from '@/help/tours/viewport'

// El área realmente visible (descontando el teclado del móvil): en iOS el teclado reduce el viewport VISUAL pero no el de diseño, así que lo que va «abajo» con position: fixed queda
// detrás del teclado. Se vuelve a leer al abrir/cerrar el teclado, girar, redimensionar o desplazar el viewport visual.
export function useVisibleArea(active = true): VisibleArea {
  const [area, setArea] = useState<VisibleArea>(readVisibleArea)
  useEffect(() => {
    if (!active) return
    let raf = 0
    const update = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const next = readVisibleArea()
        setArea((prev) => (sameArea(prev, next) ? prev : next))
      })
    }
    update()
    const vv = window.visualViewport
    vv?.addEventListener('resize', update)
    vv?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      cancelAnimationFrame(raf)
      vv?.removeEventListener('resize', update)
      vv?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [active])
  return area
}
