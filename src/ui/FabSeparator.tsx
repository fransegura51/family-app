import { useEffect } from 'react'
import { separateFloatingButtons } from '@/ui/fabSeparation'

// No pinta nada: mantiene separados los botones redondos de arriba (avatares de Pepa y el de redes) si alguno acaba encima de otro. Ver fabSeparation.ts.
export function FabSeparator() {
  useEffect(() => {
    let timer = 0
    const run = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => separateFloatingButtons(), 60)
    }
    run()
    const interval = window.setInterval(() => separateFloatingButtons(), 1500) // posiciones que cambian por otros motivos (preferencias, mostrar/ocultar los clásicos)
    window.addEventListener('resize', run)
    window.addEventListener('orientationchange', run)
    window.addEventListener('pointerup', run, true) // tras arrastrar un botón
    window.addEventListener('storage', run)
    return () => {
      window.clearTimeout(timer)
      window.clearInterval(interval)
      window.removeEventListener('resize', run)
      window.removeEventListener('orientationchange', run)
      window.removeEventListener('pointerup', run, true)
      window.removeEventListener('storage', run)
    }
  }, [])
  return null
}
