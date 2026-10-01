import { useEffect } from 'react'

// Cierre de Fase 2 — dos instancias de MomentsEditor viven montadas a la vez (Gestionar evento y el
// configurador del dashboard), cada una con su propio estado cargado de event_moments. Sin esto, editar
// en una no se reflejaba en la otra hasta desmontar/remontar. Mismo patrón que movementColorMode.ts
// (varias pantallas mostrando lo mismo, sin un store global): un CustomEvent del navegador — nunca
// timers, nunca polling, nunca recargar la página. event_moments sigue siendo la única fuente de verdad;
// esto solo avisa a quien ya lo está leyendo de que vuelva a leerlo.
const EVENT_NAME = 'family-app:event-moments-changed'

export function notifyEventMomentsChanged(eventId: string): void {
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { eventId } }))
}

export function useEventMomentsChangeSignal(eventId: string, onChange: () => void): void {
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<{ eventId: string }>).detail
      if (detail?.eventId === eventId) onChange()
    }
    window.addEventListener(EVENT_NAME, handler)
    return () => window.removeEventListener(EVENT_NAME, handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])
}
