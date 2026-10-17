import { useEffect } from 'react'

// Los botones redondos de arriba (Pepa, redes sociales) son flotantes y se quedan fijos mientras se lee: en una publicación larga tapaban el texto y las fotos.
// Dentro de Comunidad se esconden al BAJAR por la página y vuelven al SUBIR (o al estar arriba del todo). Solo pone/quita una clase en <body>; el CSS (community.css)
// hace el resto, y al salir de Comunidad se quita siempre. Sin consultas ni temporizadores: solo el evento de scroll.
export const HIDE_FLOATING_CLASS = 'community-floating-hidden'
const TOP_ZONE_PX = 80
const MIN_DELTA_PX = 8

// Decisión pura (probable sin navegador): ¿hay que esconderlos con este desplazamiento?
export function nextFloatingHidden(prevHidden: boolean, lastY: number, y: number): boolean {
  if (y <= TOP_ZONE_PX) return false
  const delta = y - lastY
  if (delta >= MIN_DELTA_PX) return true
  if (delta <= -MIN_DELTA_PX) return false
  return prevHidden
}

export function useHideFloatingOnScroll(): void {
  useEffect(() => {
    let lastY = window.scrollY
    let hidden = false
    function onScroll() {
      const y = window.scrollY
      const next = nextFloatingHidden(hidden, lastY, y)
      if (Math.abs(y - lastY) >= MIN_DELTA_PX || y <= TOP_ZONE_PX) lastY = y
      if (next !== hidden) {
        hidden = next
        document.body.classList.toggle(HIDE_FLOATING_CLASS, hidden)
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      document.body.classList.remove(HIDE_FLOATING_CLASS)
    }
  }, [])
}
