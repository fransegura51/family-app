// Guardia de «cambios sin guardar» — lógica PURA de decisión (sin DOM ni React). La aplicación usa BrowserRouter (no un router de datos), así que no existe
// `useBlocker`: el gancho `useUnsavedChangesGuard` intercepta clics y el botón «atrás» y consulta aquí qué hacer.

// Mensaje corto EXACTO que aprueba la especificación (sección 4) y sus tres acciones.
export const UNSAVED_MESSAGE = 'Tienes cambios sin guardar. ¿Qué quieres hacer?'
export const UNSAVED_ACTIONS = { keep: 'Seguir editando', save: 'Guardar borrador', discard: 'Descartar cambios' } as const

export type GuardChoice = 'keep' | 'save' | 'discard'

// Lo que se describe de un clic (el DOM se traduce a esto fuera, para poder probar la decisión sin navegador).
export interface ClickInfo {
  // 'anchor' = enlace con href; 'navbutton' = botón de la barra de navegación de PEPA (navega con código, no con enlace).
  kind: 'anchor' | 'navbutton' | 'other'
  href?: string | null
  target?: string | null
  download?: boolean
  button?: number
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
  defaultPrevented?: boolean
  // Dirección actual y origen (para distinguir enlaces internos de externos).
  currentUrl: string
}

export type ClickDecision = 'intercept' | 'ignore'

// ¿Este clic haría salir de la pantalla? Solo se intercepta lo que cambia de página EN ESTA pestaña.
export function classifyClick(info: ClickInfo): ClickDecision {
  if (info.defaultPrevented) return 'ignore'
  if (info.button !== undefined && info.button !== 0) return 'ignore'
  if (info.ctrlKey || info.metaKey || info.shiftKey || info.altKey) return 'ignore' // abren pestaña/ventana nueva: no se pierde nada
  if (info.kind === 'other') return 'ignore'
  if (info.kind === 'navbutton') return 'intercept'
  if (info.download) return 'ignore'
  const target = (info.target ?? '').toLowerCase()
  if (target && target !== '_self') return 'ignore' // otra pestaña
  const href = info.href ?? ''
  if (!href || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return 'ignore'
  let to: URL
  let here: URL
  try {
    here = new URL(info.currentUrl)
    to = new URL(href, here)
  } catch {
    return 'ignore'
  }
  // Un enlace a OTRO sitio abre otra página completa: ahí actúa el aviso del propio navegador (beforeunload).
  if (to.origin !== here.origin) return 'ignore'
  // Mismo lugar (o solo cambia el ancla #): no se sale de la pantalla.
  if (to.pathname === here.pathname && to.search === here.search) return 'ignore'
  return 'intercept'
}

// ¿Hay que frenar la navegación y preguntar?
export function shouldBlock(dirty: boolean, bypass: boolean): boolean {
  return dirty && !bypass
}

export type ChoiceOutcome = 'stay' | 'leave' | 'confirm-discard'

// Qué ocurre tras pulsar una de las tres acciones:
//  - Seguir editando: se queda (texto y fotos intactos).
//  - Guardar borrador: se sale SOLO si el guardado salió bien (si falla, se queda y se explica).
//  - Descartar cambios: primero pide confirmación; con ella, se sale.
export function resolveChoice(choice: GuardChoice, ctx: { saveSucceeded?: boolean; discardConfirmed?: boolean } = {}): ChoiceOutcome {
  if (choice === 'keep') return 'stay'
  if (choice === 'save') return ctx.saveSucceeded ? 'leave' : 'stay'
  return ctx.discardConfirmed ? 'leave' : 'confirm-discard'
}
