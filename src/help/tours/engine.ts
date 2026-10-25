import type { ObservedSignal, TourDef, TourSignal, TourState, TourStep } from '@/help/tours/types'

// Motor de los tutoriales «Enséñame»: máquina de estados PURA (sin DOM ni React), por eso se puede probar entera. El «corredor» (TourRunner) traduce lo que ocurre en la pantalla real
// a señales y le pregunta a este motor qué toca. Reglas de seguridad que garantiza el motor:
//  - un paso con acción sensible (guardar…) NUNCA avanza con un simple clic: solo cuando la aplicación confirma que se guardó, ni se puede saltar con «Siguiente»;
//  - el motor nunca ejecuta nada: no hay ninguna acción de «pulsar» ni de «escribir» en toda esta capa.
export function startState(tour: TourDef): TourState {
  return { tourId: tour.id, index: 0, status: 'running', skipped: [] }
}

export type TourAction =
  | { type: 'signal'; signal: ObservedSignal }
  // `force`: «Siguiente» en un paso al que se ha vuelto con «Atrás» (ya estaba hecho): permitido salvo en pasos sensibles.
  // `afterBack`: se volvió a un paso SENSIBLE que ya se había completado (la aplicación confirmó el guardado): se puede pasar al siguiente sin repetir la acción.
  | { type: 'next'; force?: boolean; afterBack?: boolean }
  // Vuelve a evaluar el paso actual (p. ej. tras crear el dato que faltaba): sale del estado «sin control» sin perder el sitio.
  | { type: 'retry' }
  // Ver el capítulo solo leyendo (falta algún dato): ver TourState.readOnly.
  | { type: 'read-only' }
  // Salta lo que queda del grupo de pasos opcionales en el que está (nunca un paso sensible: los de guardar quedan fuera de cualquier grupo).
  | { type: 'skip-group' }
  // `to`: paso concreto al que volver (un paso omitido cuyo control ya está en pantalla); sin él, el anterior no omitido.
  | { type: 'back'; to?: number }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'restart' }
  | { type: 'exit' }
  // `index`: solo vale si el tutorial sigue en ese paso (varias vigilancias de la pantalla pueden pedir lo mismo a la vez; no debe saltarse más de un paso).
  | { type: 'target-missing'; index?: number }
  | { type: 'target-found' }
  | { type: 'off-route' }
  | { type: 'on-route' }
  | { type: 'skip'; index?: number }

export function signalMatches(expected: TourSignal, obs: ObservedSignal): boolean {
  switch (expected.type) {
    case 'click':
      return obs.type === 'click' && obs.target === expected.target
    case 'appear':
      return obs.type === 'appear' && obs.target === expected.target
    case 'filled':
      return obs.type === 'filled' && obs.target === expected.target && obs.length >= (expected.min ?? 1)
    case 'change':
      return obs.type === 'change' && obs.target === expected.target
    case 'entered':
      return obs.type === 'entered' && obs.target === expected.target && obs.length >= (expected.min ?? 1)
    case 'confirmed':
      return obs.type === 'confirmed' && obs.target === expected.target
    case 'route':
      return obs.type === 'route' && obs.path === expected.path
    case 'event':
      return obs.type === 'event' && obs.name === expected.name
  }
}

// ¿Esta señal observada completa el paso? Un paso sensible ignora los clics (un clic en «Guardar» no garantiza que se haya guardado).
export function stepAdvancesOn(step: TourStep, obs: ObservedSignal): boolean {
  if (step.sensitive && obs.type === 'click') return false
  return step.completeOn.some((s) => signalMatches(s, obs))
}

// «Siguiente» solo en pasos informativos u opcionales y nunca en uno sensible.
export function canGoNext(step: TourStep): boolean {
  return !step.sensitive && (step.manualNext === true || step.completeOn.length === 0)
}

// Números que ve la persona: «Paso k de n» cuenta solo los pasos que SÍ se muestran (los omitidos por falta de control no cuentan, ni antes ni después).
export function stepNumbers(tour: TourDef, state: TourState): { k: number; n: number } {
  const skippedBefore = state.skipped.filter((i) => i < state.index).length
  return { k: Math.max(1, Math.min(state.index + 1, tour.steps.length) - skippedBefore), n: Math.max(1, tour.steps.length - state.skipped.length) }
}

function advance(tour: TourDef, state: TourState, skippedIndex?: number): TourState {
  const skipped = skippedIndex === undefined ? state.skipped : [...state.skipped, skippedIndex]
  const index = state.index + 1
  if (index >= tour.steps.length) return { ...state, index: tour.steps.length, status: 'completed', reason: undefined, skipped }
  return { ...state, index, status: 'running', reason: undefined, skipped }
}

export function reduceTour(tour: TourDef, state: TourState, action: TourAction): TourState {
  if (state.status === 'completed' || state.status === 'exited') {
    // Terminado: solo se puede volver a empezar.
    return action.type === 'restart' ? startState(tour) : state
  }
  const step = tour.steps[state.index]
  switch (action.type) {
    case 'signal': {
      if (state.status !== 'running' || !step) return state
      if (state.readOnly) return state
      if (stepAdvancesOn(step, action.signal)) return advance(tour, state)
      // La persona se adelantó (p. ej. guardó antes de llegar al paso que lo espera): si el aviso de «guardado» es el de un paso posterior y entre medias solo hay pasos que no guardan,
      // se da por conseguido ese paso (los de en medio se cuentan como omitidos) en vez de dejar el tutorial atascado.
      if (action.signal.type === 'event') {
        for (let j = state.index + 1; j < tour.steps.length; j++) {
          const later = tour.steps[j]
          if (stepAdvancesOn(later, action.signal)) {
            const skipped = [...state.skipped, ...Array.from({ length: j - state.index }, (_, i) => state.index + i)]
            const index = j + 1
            if (index >= tour.steps.length) return { ...state, index: tour.steps.length, status: 'completed', reason: undefined, skipped }
            return { ...state, index, status: 'running', reason: undefined, skipped }
          }
          if (later.sensitive) break
        }
      }
      return state
    }
    case 'next':
      if (state.status === 'paused' || !step) return state
      return canGoNext(step) || (action.force === true && !step.sensitive) || (action.afterBack === true && Boolean(step.sensitive)) || (state.readOnly === true && state.status === 'running')
        ? advance(tour, state)
        : state
    case 'skip-group': {
      if (state.status !== 'running' || !step?.group) return state
      let i = state.index
      const skipped = [...state.skipped]
      while (i < tour.steps.length && tour.steps[i].group === step.group && !tour.steps[i].sensitive) {
        skipped.push(i)
        i++
      }
      if (i >= tour.steps.length) return { ...state, index: tour.steps.length, status: 'completed', reason: undefined, skipped }
      return { ...state, index: i, status: 'running', reason: undefined, skipped }
    }
    case 'skip':
      if (action.index !== undefined && action.index !== state.index) return state
      return (state.status === 'running' || state.status === 'broken') && step ? advance(tour, state, state.index) : state
    case 'back': {
      if (action.to !== undefined && action.to >= 0 && action.to < state.index) return { ...state, index: action.to, status: 'running', reason: undefined, skipped: state.skipped.filter((i) => i < action.to!) }
      const prev = previousIndex(state)
      return prev === null ? state : { ...state, index: prev, status: 'running', reason: undefined }
    }
    case 'retry':
      return state.status === 'broken' || state.status === 'running' ? { ...state, status: 'running', reason: undefined } : state
    case 'read-only':
      return { ...state, status: state.status === 'broken' ? 'running' : state.status, reason: undefined, readOnly: true }
    case 'pause':
      return state.status === 'running' ? { ...state, status: 'paused', reason: undefined } : state
    case 'resume':
      return state.status === 'paused' ? { ...state, status: 'running', reason: undefined } : state
    case 'restart':
      return startState(tour)
    case 'exit':
      return { ...state, status: 'exited', reason: undefined }
    case 'target-missing':
      if (action.index !== undefined && action.index !== state.index) return state
      if (state.status !== 'running' || !step) return state
      // Solo leyendo no hay control que esperar: el paso se muestra como texto.
      if (state.readOnly) return state
      // Un paso opcional sin control se omite; uno necesario deja el tutorial «roto» con salida comprensible (nunca bloquea).
      return step.optional ? advance(tour, state, state.index) : { ...state, status: 'broken', reason: 'target-missing' }
    case 'target-found':
      return state.status === 'broken' && state.reason === 'target-missing' ? { ...state, status: 'running', reason: undefined } : state
    case 'off-route':
      return state.status === 'running' ? { ...state, status: 'paused', reason: 'off-route' } : state
    case 'on-route':
      return state.status === 'paused' && state.reason === 'off-route' ? { ...state, status: 'running', reason: undefined } : state
  }
}

// Paso al que lleva «Atrás»: el anterior que no se omitió (volver a un paso omitido lo dejaría saltar otra vez hacia delante). null si no hay ninguno.
// `reopenable`: un paso omitido por falta de control SÍ se puede recuperar con «Atrás» si ese control ya está en pantalla (llegó tarde, p. ej. al terminar de cargar la lista).
export function previousIndex(state: TourState, reopenable?: (index: number) => boolean): number | null {
  let i = state.index - 1
  while (i >= 0 && state.skipped.includes(i) && !(reopenable?.(i) ?? false)) i--
  return i >= 0 ? i : null
}

// ¿Queda algún paso del mismo grupo después de este? (para ofrecer «Saltar opciones» solo cuando sirve)
export function groupHasMore(tour: TourDef, state: TourState): boolean {
  const step = tour.steps[state.index]
  return Boolean(step?.group && tour.steps.slice(state.index + 1).some((s) => s.group === step.group))
}

export function stepOf(tour: TourDef, state: TourState): TourStep | undefined {
  return tour.steps[state.index]
}
