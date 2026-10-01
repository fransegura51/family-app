import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

// SectionBreadcrumb navega a la MISMA ruta en la que ya se está, con state={{ sectionHome: true }}, para
// pedirle a la pantalla que vuelva a su Inicio real — React Router no desmonta el componente en una
// navegación a una URL idéntica, así que un simple useState(valorInicial) nunca se volvería a evaluar.
// location.key cambia en CADA navegación (aunque la URL sea igual), así que es la señal correcta de
// "esto es una navegación nueva, no un render normal" — handledKey evita repetir el reset si el
// componente se vuelve a renderizar sin que haya habido una navegación nueva de verdad.
//
// No usar esto para nada que no sea "volver al inicio de la sección": state.tab (deep-links ya
// existentes en ShoppingScreen/FamilyScreen) es una clave distinta y sigue funcionando igual, sin tocar.

export interface SectionHomeTrackerState {
  lastHandledKey: string | null
}

export const INITIAL_SECTION_HOME_TRACKER: SectionHomeTrackerState = { lastHandledKey: null }

// Núcleo puro, sin React: dada la clave de la navegación actual y si pidió sectionHome, decide si hay
// que disparar onHome() y devuelve el siguiente estado del tracker. Una misma clave nunca dispara dos
// veces (cubre tanto re-renders normales como un segundo useEffect por StrictMode).
export function stepSectionHome(
  tracker: SectionHomeTrackerState,
  locationKey: string,
  sectionHome: boolean | undefined,
): { tracker: SectionHomeTrackerState; shouldFireHome: boolean } {
  if (tracker.lastHandledKey === locationKey) return { tracker, shouldFireHome: false }
  return { tracker: { lastHandledKey: locationKey }, shouldFireHome: sectionHome === true }
}

export function useSectionHome(onHome: () => void): void {
  const location = useLocation()
  const trackerRef = useRef<SectionHomeTrackerState>(INITIAL_SECTION_HOME_TRACKER)
  const onHomeRef = useRef(onHome)
  onHomeRef.current = onHome

  useEffect(() => {
    const sectionHome = (location.state as { sectionHome?: boolean } | null)?.sectionHome
    const { tracker, shouldFireHome } = stepSectionHome(trackerRef.current, location.key, sectionHome)
    trackerRef.current = tracker
    if (shouldFireHome) onHomeRef.current()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])
}
