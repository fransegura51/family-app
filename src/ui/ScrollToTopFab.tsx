import { useEffect, useState } from 'react'

// Petición real: "un botón flotante con una flecha para arriba para
// volver rápidamente de vuelta arriba al inicio de la página" — en
// toda la app la página entera es la que hace scroll (no un panel
// interior con su propio overflow), así que basta con vigilar
// window.scrollY. Solo aparece pasado un pequeño margen de scroll —
// que no estorbe en pantallas que ya empiezan arriba del todo.
const SHOW_AFTER_PX = 300

export function ScrollToTopFab() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    function handleScroll() {
      setVisible(window.scrollY > SHOW_AFTER_PX)
    }
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  if (!visible) return null

  return (
    <button
      type="button"
      className="scroll-top-fab"
      aria-label="Volver arriba"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
    >
      ↑
    </button>
  )
}
