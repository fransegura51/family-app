import { useEffect, useRef } from 'react'

// Destinos de la Ayuda («Llévame» y comienzo de los tutoriales). PEPA tiene pantallas con vistas internas que NO son rutas (pestañas de Compras, Cocina, Economía, Familia;
// temas de Configuración; formularios que se abren en una ventana): navegar a la ruta solo abre la portada del módulo. Por eso la Ayuda pide un DESTINO por nombre
// («cocina.menu», «compras.lista»…) y cada pantalla que tiene esa vista lo atiende con `useHelpDestinations`. La llegada se COMPRUEBA en pantalla, no por tiempo: el destino
// pinta una marca `data-help-dest` (componente HelpDest) cuando su vista está realmente montada, y la Ayuda espera a esa marca.
//
// Un destino pedido se queda "pendiente" hasta que la Ayuda lo da por alcanzado (o falla), así lo recoge también una pantalla que aún no estaba montada (carga perezosa).
export interface HelpIntent {
  dest: string
  seq: number
}

let seq = 0
let intent: HelpIntent | null = null
const subscribers = new Set<() => void>()

export function requestDestination(dest: string): HelpIntent {
  intent = { dest, seq: ++seq }
  for (const s of [...subscribers]) s()
  return intent
}

export function clearDestination(which?: HelpIntent | null): void {
  if (!which || intent === which) intent = null
}

export function pendingDestination(): HelpIntent | null {
  return intent
}

/** Para pantallas con vistas internas: `handlers` = {destino: () => cambiar de vista}. Se aplican al montarse (si el destino ya estaba pedido) y cada vez que se pide uno. */
export function useHelpDestinations(handlers: Record<string, () => void>): void {
  const ref = useRef(handlers)
  ref.current = handlers
  useEffect(() => {
    let lastSeq = -1
    const apply = () => {
      const i = intent
      if (!i || i.seq === lastSeq) return
      const h = ref.current[i.dest]
      if (h) {
        lastSeq = i.seq
        h()
      }
    }
    apply()
    subscribers.add(apply)
    return () => {
      subscribers.delete(apply)
    }
  }, [])
}

// ---- Cerrar menús desplegados (el ☰ de la barra, los de cada sección, el de redes) cuando la Ayuda lleva a otra parte o empieza un tutorial.
const CLOSE_MENUS_EVENT = 'pepa:help-close-menus'

export function closeOpenMenus(): void {
  window.dispatchEvent(new CustomEvent(CLOSE_MENUS_EVENT))
}

export function useCloseMenusOnHelp(close: () => void): void {
  const ref = useRef(close)
  ref.current = close
  useEffect(() => {
    const on = () => ref.current()
    window.addEventListener(CLOSE_MENUS_EVENT, on)
    return () => window.removeEventListener(CLOSE_MENUS_EVENT, on)
  }, [])
}

// ---- Comprobación de llegada
export function findDestination(dest: string, root: ParentNode = document): HTMLElement | null {
  const nodes = root.querySelectorAll<HTMLElement>(`[data-help-dest="${dest}"]`)
  for (const n of nodes) if (!n.closest('[hidden]') && !n.closest('[inert]')) return n
  return null
}

export type ArrivalResult = 'reached' | 'timeout'

/**
 * Espera a que la marca del destino exista en pantalla. No usa temporizadores para "dar tiempo": observa el DOM y se resuelve en cuanto aparece. El tiempo máximo solo evita esperar
 * para siempre cuando la cuenta no tiene acceso o la pantalla no existe (entonces la Ayuda lo dice con claridad).
 */
let defaultTimeoutMs = 8000
// Solo para pruebas.
export function setDestinationTimeoutForTests(ms: number | null): void {
  defaultTimeoutMs = ms ?? 8000
}

export function waitForDestination(dest: string, timeoutMs = defaultTimeoutMs): Promise<ArrivalResult> {
  return new Promise((resolve) => {
    if (findDestination(dest)) return resolve('reached')
    let done = false
    const finish = (r: ArrivalResult) => {
      if (done) return
      done = true
      mo.disconnect()
      window.clearTimeout(timer)
      resolve(r)
    }
    const mo = new MutationObserver(() => {
      if (findDestination(dest)) finish('reached')
    })
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'data-help-dest'] })
    const timer = window.setTimeout(() => finish('timeout'), timeoutMs)
  })
}

/** Deja a la vista el comienzo del destino (sin coordenadas fijas: el propio navegador calcula el desplazamiento). */
export function revealDestination(dest: string): void {
  const mark = findDestination(dest)
  if (!mark) return
  const selector = mark.dataset.helpReveal
  const target = (selector ? document.querySelector<HTMLElement>(selector) : null) ?? (mark.nextElementSibling as HTMLElement | null) ?? mark.parentElement
  if (!target) return
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  target.scrollIntoView?.({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
}
