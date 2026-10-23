// Tutoriales «Enséñame» (B4): recorridos paso a paso sobre las PANTALLAS REALES de PEPA. Nunca simulan la app ni ejecutan acciones por la persona: señalan el control real
// (marca `data-help-id` en el código de la pantalla), explican con la voz de Pepa y ESPERAN a que la persona lo haga de verdad.

// Lo que un paso espera ver para darse por conseguido. Cualquiera de las señales vale.
export type TourSignal =
  | { type: 'click'; target: string } // un toque en el control marcado (o dentro de él)
  | { type: 'appear'; target: string } // el control marcado aparece en pantalla (p. ej. se abrió el formulario)
  | { type: 'filled'; target: string; min?: number } // el campo marcado (o el primer campo dentro) tiene al menos `min` caracteres (por defecto 1)
  | { type: 'change'; target: string } // el campo marcado cambia de valor (listas desplegables, casillas)
  | { type: 'entered'; target: string; min?: number } // la persona terminó de escribir en el campo marcado (lo deja con el teclado o pulsa intro) y tiene al menos `min` caracteres: nunca mientras escribe
  | { type: 'confirmed'; target: string } // el campo marcado (p. ej. una fecha) ha cambiado Y la selección ha terminado: valor válido, selector cerrado o sin tocar un momento
  | { type: 'route'; path: string } // la persona llega a esa pantalla
  | { type: 'event'; name: string } // la aplicación anuncia que algo se ha guardado de verdad (helpBus)

// Lo que el motor observa en la pantalla real (se traduce de eventos del navegador).
export type ObservedSignal =
  | { type: 'click'; target: string }
  | { type: 'appear'; target: string }
  | { type: 'filled'; target: string; length: number }
  | { type: 'change'; target: string }
  | { type: 'entered'; target: string; length: number }
  | { type: 'confirmed'; target: string }
  | { type: 'route'; path: string }
  | { type: 'event'; name: string }

export interface TourStep {
  id: string
  /** Lo que dice Pepa en este paso (también se lee en voz alta en modo «Hablando»). Breve. */
  text: string
  /** Control real que se resalta (valor de `data-help-id`). Sin él, el paso es solo una explicación. */
  target?: string
  /** Señales que completan el paso. Vacío solo si `manualNext` (paso informativo). */
  completeOn: TourSignal[]
  /** Muestra «Siguiente»: pasos informativos u opcionales. */
  manualNext?: boolean
  /** Acción que compromete datos (guardar…): el tutorial SOLO señala y espera. Nunca avanza con un clic ni ofrece «Siguiente»; solo avanza cuando la aplicación anuncia que se guardó. */
  sensitive?: boolean
  /** Si el control no existe en esta pantalla (otro rol, otra plataforma, otra versión), el paso se omite en vez de bloquear. */
  optional?: boolean
  /** Se omite si ya se cumple al llegar (p. ej. el formulario ya está abierto). */
  skipIf?: TourSignal[]
  /** Grupo de pasos opcionales (p. ej. «otras opciones»): mientras se recorre ese grupo se ofrece «Saltar opciones», que pasa al primer paso posterior fuera del grupo. */
  group?: string
  /** Texto del botón que salta el grupo (por defecto «Saltar opciones»). */
  skipGroupLabel?: string
  /** Explicaciones breves desplegables bajo el texto del paso (p. ej. qué significa cada tipo de miembro). Cerradas por defecto, para no saturar la tarjeta. */
  details?: Array<{ title: string; text: string }>
  /** Título del desplegable de `details`. */
  detailsLabel?: string
}

export interface TourDef {
  id: string
  /** 'visit' = «Conoce esta sección» (visita introductoria de un módulo, solo informativa); 'tutorial' (por defecto) = «Enséñame» (una gestión concreta). */
  kind?: 'tutorial' | 'visit'
  /** Módulo de la Ayuda al que pertenece (para agrupar el catálogo y decidir los permisos). */
  module?: import('@/help/types').HelpModuleId
  /** Una línea para el catálogo «¿Qué quieres aprender a hacer?». */
  summary?: string
  /** Grupo dentro del módulo (p. ej. «Tareas»). */
  group?: string
  /** Quién puede hacerlo (además del acceso al módulo): un tutorial de administración no se ofrece a un niño. */
  access?: import('@/help/types').HelpAccessRule
  /** Sube cuando cambia la interfaz que recorre: un tutorial completado con otra versión se puede ofrecer de nuevo. */
  version: number
  title: string
  /** Ficha de Ayuda de la que cuelga («Enséñame»). */
  cardId: string
  durationSec: number
  /** Pantalla de partida (el tutorial lleva a ella si la persona está en otra). */
  startPath: string
  /** Destino exacto dentro de esa pantalla (pestaña, formulario…; ver src/help/destinations.ts). El tutorial no empieza hasta que ese destino está en pantalla. */
  startDest?: string
  /** Pantallas donde el tutorial tiene sentido; si la persona se va a otra, el tutorial se pausa sin bloquear nada. Por defecto, solo `startPath`. */
  paths?: string[]
  steps: TourStep[]
  /** Mensaje final. */
  finishText: string
  /** Fichas de Ayuda que se sugieren al terminar («¿qué otra sección quieres conocer?»). */
  next?: string[]
}

export type TourStatus = 'running' | 'paused' | 'completed' | 'exited' | 'broken'

export interface TourState {
  tourId: string
  index: number
  status: TourStatus
  /** Por qué está pausado o roto. */
  reason?: 'off-route' | 'target-missing'
  /** Números de paso que se omitieron (opcionales sin control, o ya cumplidos). */
  skipped: number[]
}
