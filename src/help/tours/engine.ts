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
  | { type: 'next'; force?: boolean }
  // Salta lo que queda del grupo de pasos opcionales en el que está (nunca un paso sensible: los de guardar quedan fuera de cualquier grupo).
  | { type: 'skip-group' }
  | { type: 'back' }
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
    case 'signal':
      if (state.status !== 'running' || !step) return state
      return stepAdvancesOn(step, action.signal) ? advance(tour, state) : state
    case 'next':
      if (state.status === 'paused' || !step) return state
      return canGoNext(step) || (action.force === true && !step.sensitive) ? advance(tour, state) : state
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
      return state.status === 'running' && step ? advance(tour, state, state.index) : state
    case 'back': {
      const prev = previousIndex(state)
      return prev === null ? state : { ...state, index: prev, status: 'running', reason: undefined }
    }
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
export function previousIndex(state: TourState): number | null {
  let i = state.index - 1
  while (i >= 0 && state.skipped.includes(i)) i--
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
