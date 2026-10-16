import { useEffect, useState } from 'react'
import { CLASSIC_BUTTONS_EVENT, getShowClassicButtons } from '@/services/pepaPreferences'

// ¿Se ven los botones clásicos de Pepa? Se actualiza al momento cuando se cambia la casilla de Familia (services/pepaPreferences.ts).
export function useShowClassicButtons(): boolean {
  const [show, setShow] = useState(getShowClassicButtons)
  useEffect(() => {
    const handler = () => setShow(getShowClassicButtons())
    window.addEventListener(CLASSIC_BUTTONS_EVENT, handler)
    return () => window.removeEventListener(CLASSIC_BUTTONS_EVENT, handler)
  }, [])
  return show
}
