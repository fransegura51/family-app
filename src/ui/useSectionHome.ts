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

// Primitiva genérica detrás de useSectionHome: cualquier flag booleano en location.state que deba
// disparar una acción exactamente una vez por navegación real (nunca en un re-render normal), aunque la
// ruta sea idéntica a la actual. useSectionHome es el caso de siempre ('sectionHome' → volver al Inicio
// de la sección); EventosScreen reutiliza esto mismo con su propia clave ('eventHome') para que el nivel
// intermedio del breadcrumb ("Boda de plata") pueda cerrar el módulo abierto y volver al dashboard de ESE
// evento, sin depender de history.back() ni perder selectedId.
export function useLocationFlag(flagKey: string, onFlag: () => void): void {
  const location = useLocation()
  const trackerRef = useRef<SectionHomeTrackerState>(INITIAL_SECTION_HOME_TRACKER)
  const onFlagRef = useRef(onFlag)
  onFlagRef.current = onFlag

  useEffect(() => {
    const flag = (location.state as Record<string, boolean> | null)?.[flagKey]
    const { tracker, shouldFireHome } = stepSectionHome(trackerRef.current, location.key, flag)
    trackerRef.current = tracker
    if (shouldFireHome) onFlagRef.current()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])
}

export function useSectionHome(onHome: () => void): void {
  useLocationFlag('sectionHome', onHome)
}
