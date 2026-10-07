import { useEffect, useRef, useState } from 'react'

// Fase 1 (plan de pendientes) — "resúmenes de sección navegables": cada entrada de DecisionSummaryDetails,
// y cada línea del resumen general del configurador, lleva a UNA pregunta concreta de su bloque, aislándola
// (el resto queda plegado) con un enlace discreto "Ver todas las preguntas" para volver. Mismo mecanismo
// para los dos orígenes:
// - Local al bloque (clic en su propio "Resumen de decisiones"): llama a setLocalFocus directamente, sin
//   pasar por aquí — no necesita re-disparar nada desde fuera.
// - Desde el resumen general (vive en el padre, EventPlanningConfigurator, fuera del bloque): llega como
//   prop `focusRequest`; un `token` que cambia en cada clic (aunque se repita la misma questionKey) es
//   necesario para reaccionar también la segunda vez que se pulsa la misma flecha.
export interface ConfiguratorFocusRequest {
  questionKey: string
  token: number
}

// Puro (sin React, ver el mismo patrón en useSectionHome.ts): decide si una focusRequest nueva debe
// aplicarse, comparando solo su token contra el último ya procesado — nunca reacciona dos veces al mismo
// clic, pero sí reacciona a un segundo clic sobre la MISMA pregunta (token distinto).
export function stepConfiguratorFocus(
  lastProcessedToken: number | null,
  request: ConfiguratorFocusRequest,
): { localFocus: string; lastProcessedToken: number; shouldScroll: boolean } | null {
  if (request.token === lastProcessedToken) return null
  return { localFocus: request.questionKey, lastProcessedToken: request.token, shouldScroll: true }
}

export function useConfiguratorQuestionFocus(focusRequest: ConfiguratorFocusRequest | null | undefined) {
  const [localFocus, setLocalFocus] = useState<string | null>(focusRequest?.questionKey ?? null)
  const lastToken = useRef<number | null>(focusRequest?.token ?? null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!focusRequest) return
    const step = stepConfiguratorFocus(lastToken.current, focusRequest)
    if (!step) return
    lastToken.current = step.lastProcessedToken
    setLocalFocus(step.localFocus)
    if (step.shouldScroll) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [focusRequest])

  return { localFocus, setLocalFocus, ref }
}

// null/vacío = sin foco, se ve todo (comportamiento de siempre, cero cambio visual por defecto). Con foco
// activo, solo la pregunta cuya key coincide se mantiene visible — el resto se pliega.
export function questionIsVisible(localFocus: string | null, questionKey: string): boolean {
  return !localFocus || localFocus === questionKey
}
