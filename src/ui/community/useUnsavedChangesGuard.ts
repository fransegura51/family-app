import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { classifyClick, shouldBlock } from '@/domain/unsavedChangesGuard'

// Guardia de «cambios sin guardar» para BrowserRouter (que NO tiene `useBlocker`). Cuando `active` es true:
//  1. `beforeunload`: cerrar la pestaña o recargar → aviso propio del navegador (los navegadores no permiten personalizar su texto).
//  2. Clics en enlaces internos (migas, menú de Comunidad, sugerencias…) y en los botones de la barra de PEPA, interceptados en fase de CAPTURA: se frena el
//     clic y se abre nuestro diálogo. Si la persona decide salir, el mismo clic se repite («element.click()») con la guardia en modo paso libre, así el router
//     de PEPA navega por su camino normal (con su «basename»).
//  3. Botón atrás del navegador/móvil: al activarse la guardia se añade UNA entrada «centinela» al historial con la misma dirección. Al pulsar atrás se
//     «gasta» el centinela (la página no cambia), se vuelve a poner y se abre el diálogo. Si decide salir, se retrocede de verdad.
// La lógica de decisión (qué clics frenar, qué hacer tras cada botón) es pura y está probada en domain/unsavedChangesGuard.ts.

const GUARD_KEY = 'pepaCommunityGuard'

type Pending = { kind: 'link'; element: HTMLElement } | { kind: 'back' }

// Los botones de la barra inferior y del menú desplegable de PEPA navegan con código (no son enlaces). El botón «Menú» solo abre/cierra el desplegable.
export const NAV_BUTTON_SELECTOR = '.bottom-nav button, .nav-menu-flyout button'

function describeNavigationTarget(e: MouseEvent): { element: HTMLElement; kind: 'anchor' | 'navbutton' } | null {
  const target = e.target
  if (!(target instanceof Element)) return null
  const anchor = target.closest<HTMLAnchorElement>('a[href]')
  if (anchor) return { element: anchor, kind: 'anchor' }
  const navButton = target.closest<HTMLButtonElement>(NAV_BUTTON_SELECTOR)
  if (navButton && !/menú/i.test(navButton.getAttribute('aria-label') ?? '')) return { element: navButton, kind: 'navbutton' }
  return null
}

export interface UnsavedChangesGuard {
  // El diálogo debe estar visible.
  open: boolean
  // «Seguir editando»: cierra el diálogo y no se mueve nada.
  stay: () => void
  // La persona ya guardó o descartó: se ejecuta la salida pendiente (enlace pulsado o «atrás»).
  proceed: () => Promise<void>
  // Para salidas hechas por la propia pantalla (tras publicar): quita el centinela del historial y deja pasar. Llamar justo antes de navegar.
  release: () => Promise<void>
}

export function useUnsavedChangesGuard(active: boolean): UnsavedChangesGuard {
  const [open, setOpen] = useState(false)
  const activeRef = useRef(active)
  const bypassRef = useRef(false)
  const pendingRef = useRef<Pending | null>(null)
  const sentinelRef = useRef(false)
  const popRef = useRef<Promise<void> | null>(null)

  useLayoutEffect(() => {
    activeRef.current = active
  }, [active])

  // Quita el centinela del historial y espera a que el navegador lo haya hecho (si hay dos peticiones a la vez, comparten la misma espera).
  const popSentinel = useCallback((): Promise<void> => {
    if (popRef.current) return popRef.current
    if (!sentinelRef.current) return Promise.resolve()
    sentinelRef.current = false
    const p = new Promise<void>((resolve) => {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        window.removeEventListener('popstate', finish)
        window.clearTimeout(timer)
        popRef.current = null
        resolve()
      }
      const timer = window.setTimeout(finish, 600)
      window.addEventListener('popstate', finish)
      window.history.back()
    })
    popRef.current = p
    return p
  }, [])

  // 1) Cerrar o recargar la pestaña.
  useEffect(() => {
    if (!active) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [active])

  // 2) Clics de navegación, en fase de captura (antes de que React Router los vea).
  useEffect(() => {
    if (!active) return
    bypassRef.current = false
    const onClick = (e: MouseEvent) => {
      if (!shouldBlock(activeRef.current, bypassRef.current)) return
      const found = describeNavigationTarget(e)
      if (!found) return
      const a = found.element as HTMLAnchorElement
      const decision = classifyClick({
        kind: found.kind,
        href: found.kind === 'anchor' ? a.getAttribute('href') : null,
        target: found.kind === 'anchor' ? a.getAttribute('target') : null,
        download: found.kind === 'anchor' ? a.hasAttribute('download') : false,
        button: e.button,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        defaultPrevented: e.defaultPrevented,
        currentUrl: window.location.href,
      })
      if (decision !== 'intercept') return
      e.preventDefault()
      e.stopPropagation()
      pendingRef.current = { kind: 'link', element: found.element }
      setOpen(true)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [active])

  // 3) Botón atrás: entrada centinela en el historial mientras haya cambios.
  useEffect(() => {
    if (!active) return
    window.history.pushState({ ...(window.history.state ?? {}), [GUARD_KEY]: true }, '', window.location.href)
    sentinelRef.current = true
    const onPop = () => {
      if (!shouldBlock(activeRef.current, bypassRef.current)) return
      if (popRef.current) return // el «atrás» lo provocamos nosotros al quitar el centinela
      // La persona ha pulsado «atrás»: la página sigue en pie, se repone el centinela y se pregunta.
      window.history.pushState({ ...(window.history.state ?? {}), [GUARD_KEY]: true }, '', window.location.href)
      sentinelRef.current = true
      pendingRef.current = { kind: 'back' }
      setOpen(true)
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      // Sin cambios (p. ej. tras guardar) y seguimos en la misma pantalla: se quita el centinela para que «atrás» funcione a la primera.
      if (sentinelRef.current && (window.history.state as Record<string, unknown> | null)?.[GUARD_KEY]) void popSentinel()
      else sentinelRef.current = false
    }
  }, [active, popSentinel])

  const stay = useCallback(() => {
    pendingRef.current = null
    setOpen(false)
  }, [])

  const proceed = useCallback(async () => {
    const pending = pendingRef.current
    pendingRef.current = null
    setOpen(false)
    bypassRef.current = true // se queda en paso libre hasta que la guardia vuelva a activarse
    await popSentinel()
    if (!pending) return
    if (pending.kind === 'back') window.history.back()
    else if (pending.element.isConnected) pending.element.click()
  }, [popSentinel])

  const release = useCallback(async () => {
    pendingRef.current = null
    setOpen(false)
    bypassRef.current = true
    await popSentinel()
  }, [popSentinel])

  return { open, stay, proceed, release }
}
