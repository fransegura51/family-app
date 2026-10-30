// NAV-01 — «← Volver a [origen]» para los enlaces que llevan de un módulo a otro (Economía → compra vinculada, Economía → bote, avisos → compra…).
//
// Es el MISMO patrón que ya usaban pendingMovementsFilter / pendingProductHistoryLink / pendingReceiptOpen (variable de módulo que se escribe antes de navegar y se lee UNA vez
// al llegar), pero común: quien enlaza anota de dónde sale (etiqueta, ruta, qué restaurar al volver y la posición de la página) y la pantalla de destino lo recoge al montarse
// y enseña la barra de regreso. Nada de esto se guarda en el dispositivo ni en la base de datos.
//   · Solo hay barra cuando existe una navegación de origen REAL: si se entra directamente al módulo, no hay nada pendiente y no se enseña.
//   · Encadenado sin bucles: el origen lleva dentro el suyo (`parent`); al volver, la pantalla de origen recibe ese `parent` en el estado de la ruta y puede enseñar su propia
//     barra hacia atrás. Cada «volver» consume un solo eslabón.
//   · Caduca en un minuto (un enlace navega al instante): si no llega a recogerse, no aparece una barra de regreso sin sentido más tarde.
export interface NavOrigin {
  /** Pantalla de destino a la que se le enseña la barra (`tickets`, `bote`, `economia`…): una pantalla solo recoge lo que va para ella, nunca lo de otra. */
  to: string
  /** «Economía», «Historial de precios»… (el botón dice «← Volver a {label}»). */
  label: string
  /** Ruta a la que se vuelve. */
  path: string
  /** Estado de navegación con lo que hay que restaurar al volver (movimiento abierto, filtros…). */
  routeState?: Record<string, unknown>
  /** Posición de la página en el origen, para volver al mismo punto. */
  scrollY?: number
  /** El origen del origen (navegación encadenada). */
  parent?: NavOrigin | null
}

interface Pending {
  origin: NavOrigin
  at: number
}

const MAX_AGE_MS = 60_000
let pending: Pending | null = null

/** El origen anota de dónde sale justo antes de navegar. */
export function setNavOrigin(origin: NavOrigin): void {
  pending = { origin: { ...origin, scrollY: origin.scrollY ?? (typeof window !== 'undefined' ? window.scrollY : 0) }, at: Date.now() }
}

/** El destino lo recoge una sola vez al montarse. `inherited` = el `parent` que traía el estado de la ruta al volver a una pantalla intermedia. */
export function takeNavOrigin(to: string, inherited?: NavOrigin | null): NavOrigin | null {
  const value = pending && pending.origin.to === to && Date.now() - pending.at <= MAX_AGE_MS ? pending.origin : null
  if (value) pending = null
  return value ?? (inherited && inherited.to === to ? inherited : null)
}

/** Estado de ruta para volver: lo del origen + su propio origen, para poder encadenar. */
export function returnRouteState(origin: NavOrigin): Record<string, unknown> {
  return { ...(origin.routeState ?? {}), navRestoreScrollY: origin.scrollY ?? 0, ...(origin.parent ? { navParent: origin.parent } : {}) }
}

/** Para pruebas: descarta lo pendiente. */
export function clearNavOrigin(): void {
  pending = null
}
