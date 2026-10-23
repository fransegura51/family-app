import { useEffect } from 'react'
import { separateFloatingButtons } from '@/ui/fabSeparation'
import { readVisibleArea } from '@/help/tours/viewport'

// No pinta nada. (1) Mantiene separados los botones redondos de arriba (avatares de Pepa y el de redes) si alguno acaba encima de otro (ver fabSeparation.ts). (2) Mientras el teclado
// del móvil está abierto los esconde con suavidad (el CSS lo hace con el atributo data-pepa-keyboard): flotan por encima de todo y, con el teclado, el cuadro de texto, las sugerencias y las
// tarjetas de respuesta de la Ayuda quedan justo debajo; al cerrar el teclado vuelven a su sitio. No se quita ningún acceso.
export function FabSeparator() {
  useEffect(() => {
    let timer = 0
    const run = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => separateFloatingButtons(), 60)
    }
    const syncKeyboard = () => {
      const open = readVisibleArea().keyboard
      if (open) document.documentElement.setAttribute('data-pepa-keyboard', 'true')
      else document.documentElement.removeAttribute('data-pepa-keyboard')
    }
    run()
    syncKeyboard()
    const interval = window.setInterval(() => separateFloatingButtons(), 1500) // posiciones que cambian por otros motivos (preferencias, mostrar/ocultar los clásicos)
    const vv = window.visualViewport
    vv?.addEventListener('resize', syncKeyboard)
    window.addEventListener('resize', run)
    window.addEventListener('orientationchange', run)
    window.addEventListener('pointerup', run, true) // tras arrastrar un botón
    window.addEventListener('storage', run)
    return () => {
      window.clearTimeout(timer)
      window.clearInterval(interval)
      vv?.removeEventListener('resize', syncKeyboard)
      document.documentElement.removeAttribute('data-pepa-keyboard')
      window.removeEventListener('resize', run)
      window.removeEventListener('orientationchange', run)
      window.removeEventListener('pointerup', run, true)
      window.removeEventListener('storage', run)
    }
  }, [])
  return null
}
