import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import type { HelpVoiceMode } from '@/help/prefs'
import { markTourProgress, setTourProgress } from '@/help/prefs'
import { fieldOf, findTarget, markedAncestor, ringElementOf, screenIsLoading } from '@/help/tours/domTargets'
import { canGoNext, groupHasMore, previousIndex, reduceTour, startState, stepNumbers, stepOf } from '@/help/tours/engine'
import { onHelpEvent } from '@/help/tours/helpBus'
import { pathAllowed } from '@/help/tours/paths'
import { chapterPosition } from '@/help/tours/series'
import { clearDestination, closeOpenMenus, requestDestination, waitForDestination } from '@/help/destinations'
import type { ObservedSignal, TourDef } from '@/help/tours/types'
import { freeZone, planPanel, readVisibleArea, sameArea, scrollContentBy, scrollDeltaToReveal, type Span } from '@/help/tours/viewport'
import { HELP_ID_PATTERN } from '@/help/tours/domTargets'
import { speakHelp, stopHelpSpeech } from '@/help/voice'
import { PepaFace } from '@/help/ui/PepaFace'
import '@/help/tours/tours.css'

// Corredor de un tutorial «Enséñame» (un CAPÍTULO) sobre la pantalla REAL. Hace tres cosas y solo tres: (1) mira lo que pasa en la pantalla (clics, escritura, cambios de pantalla y avisos de
// «guardado» de la aplicación) y se lo cuenta al motor; (2) resalta el control real con un marco que NO intercepta toques (se pulsa el botón de verdad); (3) enseña el panel de Pepa con
// el texto del paso. No pulsa, no escribe, no envía ni guarda NADA: la persona hace cada acción. Si el control no existe o cambia, ofrece una salida comprensible; nunca bloquea la app.
//
// Capítulos: el panel final ofrece «Siguiente capítulo» (con una parada clara: nunca se encadenan solos) y, en el primer paso, «← Capítulo anterior».
export interface TourNextOption {
  label: string
  kind: 'tour' | 'card'
  id: string
}

const MISSING_AFTER_MS = 3500
const PREPARE_MS = 8000 // tiempo máximo (no de cortesía) para que llegue la pantalla del tutorial; pasado, se dice con claridad que no se ha podido abrir
const PANEL_PRESS_MS = 500
const POLL_MS = 400
// Un paso OPCIONAL cuyo control no existe en este momento (p. ej. «Puntos» con «Toda la familia», o la hora en un evento de todo el día) se omite casi al instante, sin dejar a la
// persona mirando un paso sin marco; los pasos necesarios siguen esperando MISSING_AFTER_MS antes de ofrecer la salida.
const OPTIONAL_GRACE_MS = 350
// Mientras la pantalla muestra «Cargando…» (o faltan las marcas de `readyOn`) no se da nada por ausente: se espera, con este tope para no quedarse esperando para siempre.
const READY_MAX_MS = 8000
// Si la persona acaba de pulsar el control del paso, es normal que desaparezca (un botón de confirmar, una ventana que se cierra al guardar): se espera el aviso en vez de dar el paso por «roto».
const CLICK_GRACE_MS = 6000
// Confirmación de un campo con selector (fecha): el valor cambió y se da por elegido cuando se cierra el selector (el campo pierde el foco) o, si el campo conserva el foco (el
// selector del iPhone lo deja enfocado), tras un rato sin más cambios. Mientras se sigue girando el selector no se avanza.
const CONFIRM_FOCUSED_MS = 1800
const CONFIRM_BLURRED_MS = 450
const CONFIRM_AFTER_BLUR_MS = 150

interface Guards {
  /** Zonas relativas al área visible que la tarjeta no puede tapar (los controles auxiliares `keepVisible`). */
  keep: Span[]
  /** Hojas o diálogos propios de la app abiertos que no son el objetivo. */
  block: Span[]
}

const sameSpans = (a: Span[], b: Span[]) => a.length === b.length && a.every((s, i) => Math.abs(s.top - b[i].top) < 1 && Math.abs(s.bottom - b[i].bottom) < 1)

export function TourRunner({
  tour,
  voiceMode,
  nextOptions,
  onClose,
  onPick,
  missingAfterMs = MISSING_AFTER_MS,
  confirmMs = { focused: CONFIRM_FOCUSED_MS, blurred: CONFIRM_BLURRED_MS, afterBlur: CONFIRM_AFTER_BLUR_MS },
  prepareMs = PREPARE_MS,
  readyMaxMs = READY_MAX_MS,
}: {
  tour: TourDef
  voiceMode: HelpVoiceMode
  nextOptions: TourNextOption[]
  onClose: (reason: 'completed' | 'exited') => void
  onPick: (option: TourNextOption) => void
  /** Cuánto se espera a que aparezca el control antes de dar el paso por «sin control» (solo se cambia en pruebas). */
  missingAfterMs?: number
  /** Esperas de la confirmación de una fecha (solo se cambian en pruebas). */
  confirmMs?: { focused: number; blurred: number; afterBlur: number }
  /** Tiempo máximo para que llegue la pantalla de partida (solo se cambia en pruebas). */
  prepareMs?: number
  /** Tiempo máximo de espera a que carguen los datos de la pantalla (solo se cambia en pruebas). */
  readyMaxMs?: number
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const [state, dispatch] = useReducer((s: ReturnType<typeof startState>, a: Parameters<typeof reduceTour>[2]) => reduceTour(tour, s, a), tour, startState)
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number; key: string } | null>(null)
  const [speaking, setSpeaking] = useState(false)
  // Área realmente visible (descontando el teclado) y altura del panel: el marco y el panel se colocan respecto a ella, no a la pantalla entera (B4-UX01).
  const [area, setArea] = useState(readVisibleArea)
  const [panelH, setPanelH] = useState(0)
  const [guards, setGuards] = useState<Guards>({ keep: [], block: [] })
  // Lado elegido a mano con «↕ Mover» (vale para el paso en curso) y estado de «píldora» pedida/forzada.
  const [manualSide, setManualSide] = useState<'top' | 'bottom' | null>(null)
  const [expanded, setExpanded] = useState(false)
  // Selector del sistema abierto (cámara, fotos, archivos, fecha): la tarjeta se recoge en una píldora que no estorba hasta que la persona vuelve o elige.
  const [suspended, setSuspended] = useState(false)
  // Datos que faltan para este capítulo (mensaje de `needs`): se explica y se ofrece verlo solo leyendo.
  const [needsMsg, setNeedsMsg] = useState<string | null>(null)
  const panelRef = useRef<HTMLElement | null>(null)
  const layerRef = useRef<HTMLDivElement | null>(null)
  // El control señalado lleva el atributo `data-tour-active` y el CSS le pinta el marco: el marcador viaja CON el control (no hay coordenadas que calcular ni que se queden viejas cuando
  // el teclado de iOS mueve el viewport). Solo los cálculos de dónde poner la tarjeta y cuándo desplazar usan medidas, y siempre relativas a la propia capa del tutorial.
  const highlightRef = useRef<HTMLElement | null>(null)
  const setHighlight = useCallback((el: HTMLElement | null) => {
    const cur = highlightRef.current
    if (cur === el) return
    cur?.removeAttribute('data-tour-active')
    el?.setAttribute('data-tour-active', 'true')
    highlightRef.current = el
  }, [])
  useEffect(() => () => setHighlight(null), [setHighlight])
  const sideRef = useRef<'top' | 'bottom'>('bottom')
  const fullHRef = useRef(0)
  const stateRef = useRef(state)
  stateRef.current = state
  const allowed = tour.paths ?? [tour.startPath]
  const allowedRef = useRef(allowed)
  allowedRef.current = allowed
  const navigatingRef = useRef(false)
  // Paso al que se ha vuelto con «Atrás»: ya estaba hecho, así que no se vuelve a dar por conseguido solo (ni se omite): la persona decide con «Siguiente» o actuando de nuevo.
  const backIndex = useRef<number | null>(null)
  const closedRef = useRef(false)
  // La marca de «he vuelto aquí» solo vale mientras se sigue en ese paso (al salir de él, hacia delante o por un reinicio, se olvida).
  useEffect(() => {
    if (backIndex.current !== null && backIndex.current !== state.index) backIndex.current = null
  }, [state.index])
  // Último control marcado que la persona pulsó (para no dar por «roto» un paso cuyo botón desaparece justo al pulsarlo).
  const lastClick = useRef<{ id: string; at: number } | null>(null)
  // Preparación: antes del primer paso se cierran los menús, se lleva a la persona a la pantalla (y vista) del tutorial y se ESPERA a que esté en pantalla. 'wait' = llegando;
  // 'ok' = lista; 'failed' = no se pudo abrir (sin acceso, pantalla distinta…): se explica en vez de fingir que se avanza.
  const [prep, setPrep] = useState<'wait' | 'ok' | 'failed'>(tour.startDest ? 'wait' : 'ok')
  const prepRef = useRef(prep)
  prepRef.current = prep
  // «Datos listos»: pasada la preparación se espera a las marcas de `readyOn` y a que no haya un «Cargando…» antes de evaluar el primer paso.
  const readyRef = useRef(false)
  const [ready, setReady] = useState(false)
  const gateStart = useRef(Date.now())
  const needsRef = useRef(needsMsg)
  needsRef.current = needsMsg
  const prepareRef = useRef<() => () => void>(() => () => undefined)
  prepareRef.current = () => {
    readyRef.current = false
    setReady(false)
    gateStart.current = Date.now()
    setNeedsMsg(null)
    if (!tour.startDest) return () => undefined
    let live = true
    setPrep('wait')
    const intent = requestDestination(tour.startDest)
    waitForDestination(tour.startDest, prepareMs).then((r) => {
      if (!live) return
      clearDestination(intent)
      setPrep(r === 'reached' ? 'ok' : 'failed')
    })
    return () => {
      live = false
      clearDestination(intent)
    }
  }
  const stopPrepare = useRef<() => void>(() => undefined)
  const lastPanelPress = useRef(0)
  const pos = chapterPosition(tour.id)

  const step = stepOf(tour, state)
  const stepKey = `${state.index}:${state.status}`

  // ---- Al empezar: ir a la pantalla del tutorial si la persona está en otra, y guardar que se ha empezado (sin quitar un ✓ ya conseguido).
  useEffect(() => {
    markTourProgress(tour.id, 'started', tour.version)
    closeOpenMenus() // un menú abierto taparía la pantalla del tutorial
    stopPrepare.current = prepareRef.current()
    if (!pathAllowed(allowedRef.current, location.pathname)) {
      navigatingRef.current = true
      navigate(tour.startPath)
    }
    return () => {
      stopPrepare.current()
      stopHelpSpeech()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, [])

  // ---- Pantalla: si la persona se va a otra, el tutorial se pausa (sin bloquear nada) y se reanuda al volver.
  useEffect(() => {
    const ok = pathAllowed(allowedRef.current, location.pathname)
    if (ok) navigatingRef.current = false
    if (!ok && !navigatingRef.current) dispatch({ type: 'off-route' })
    if (ok) dispatch({ type: 'on-route' })
    dispatch({ type: 'signal', signal: { type: 'route', path: location.pathname } })
  }, [location.pathname])

  // ---- Cada paso empieza limpio: sin lado elegido a mano, sin píldora forzada y sin selector del sistema pendiente.
  useEffect(() => {
    setManualSide(null)
    setExpanded(false)
    setSuspended(false)
  }, [state.index])

  // ---- Señales de la pantalla real (el navegador → motor). Escuchas en captura: no cambian ni impiden nada.
  useEffect(() => {
    const send = (signal: ObservedSignal) => dispatch({ type: 'signal', signal })
    // Confirmación de campos con selector (fecha): ver CONFIRM_*.
    const timers = new Map<string, number>()
    const pending = new Set<string>()
    const confirmIfValid = (id: string) => {
      timers.delete(id)
      const t = findTarget(id)
      const f = t ? fieldOf(t) : null
      if (!f || f.value === '' || !f.validity.valid) return
      pending.delete(id)
      send({ type: 'confirmed', target: id })
    }
    const scheduleConfirm = (id: string, field: Element, wait: number) => {
      window.clearTimeout(timers.get(id))
      pending.add(id)
      timers.set(id, window.setTimeout(() => confirmIfValid(id), document.activeElement === field ? confirmMs.focused : wait))
    }
    // «Terminó de escribir»: el campo pierde el foco (✓ del teclado, tocar fuera) o se pulsa intro. Un toque en los botones de la tarjeta de Pepa no cuenta (haría saltar dos pasos).
    const pressedPanel = (e: Event) => {
      if (e.target instanceof Element && e.target.closest('[data-tour-layer]')) lastPanelPress.current = Date.now()
    }
    const sendEntered = (e: Event) => {
      const el = markedAncestor(e.target)
      const f = el && e.target instanceof Element ? fieldOf(el) : null
      if (el?.dataset.helpId && f && (f instanceof HTMLInputElement || f instanceof HTMLTextAreaElement) && f.value.trim().length > 0) send({ type: 'entered', target: el.dataset.helpId, length: f.value.trim().length })
    }
    const onKeyDown = (e: Event) => {
      if ((e as KeyboardEvent).key === 'Enter') sendEntered(e)
    }
    const onFocusOut = (e: Event) => {
      if (Date.now() - lastPanelPress.current > PANEL_PRESS_MS) sendEntered(e)
      const el = markedAncestor(e.target)
      const id = el?.dataset.helpId
      if (id && pending.has(id)) {
        window.clearTimeout(timers.get(id))
        timers.set(id, window.setTimeout(() => confirmIfValid(id), confirmMs.afterBlur))
      }
    }
    const onClick = (e: Event) => {
      const el = markedAncestor(e.target)
      if (!el) return
      const id = el.dataset.helpId ?? ''
      lastClick.current = { id, at: Date.now() }
      // Un control que abre un selector del SISTEMA (archivos, cámara, fecha): la tarjeta se aparta mientras tanto.
      const cur = stepOf(tour, stateRef.current)
      if (cur?.native && cur.target === id) setSuspended(true)
      send({ type: 'click', target: id })
    }
    const onInput = (e: Event) => {
      const el = markedAncestor(e.target)
      if (!el) return
      const t = e.target as HTMLInputElement
      send({ type: 'filled', target: el.dataset.helpId ?? '', length: typeof t.value === 'string' ? t.value.length : 0 })
      if (el.dataset.helpId && e.target instanceof Element) scheduleConfirm(el.dataset.helpId, e.target, confirmMs.blurred)
    }
    const onChange = (e: Event) => {
      const el = markedAncestor(e.target)
      if (!el) return
      send({ type: 'change', target: el.dataset.helpId ?? '' })
      setSuspended(false) // eligió algo en el selector del sistema
      if (el.dataset.helpId && e.target instanceof Element) scheduleConfirm(el.dataset.helpId, e.target, confirmMs.blurred)
    }
    document.addEventListener('click', onClick, true)
    document.addEventListener('input', onInput, true)
    document.addEventListener('change', onChange, true)
    document.addEventListener('focusout', onFocusOut, true)
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('pointerdown', pressedPanel, true)
    document.addEventListener('touchstart', pressedPanel, true)
    document.addEventListener('mousedown', pressedPanel, true)
    const off = onHelpEvent((name) => send({ type: 'event', name }))
    return () => {
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('input', onInput, true)
      document.removeEventListener('change', onChange, true)
      document.removeEventListener('focusout', onFocusOut, true)
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('pointerdown', pressedPanel, true)
      document.removeEventListener('touchstart', pressedPanel, true)
      document.removeEventListener('mousedown', pressedPanel, true)
      for (const t of timers.values()) window.clearTimeout(t)
      off()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- las esperas de confirmación solo cambian en pruebas
  }, [])

  // ---- Volver del selector del sistema (o de otra aplicación): la tarjeta vuelve sola.
  useEffect(() => {
    if (!suspended) return
    const back = () => setSuspended(false)
    const onVis = () => {
      if (document.visibilityState === 'visible') back()
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pageshow', back)
    window.addEventListener('focus', back)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pageshow', back)
      window.removeEventListener('focus', back)
    }
  }, [suspended])

  // ---- Vigilancia de la pantalla: dónde está el control, si aparece, si ya estaba cumplido, y si desaparece (tutorial «roto» con salida).
  const missingSince = useRef<number | null>(null)
  const lastStepKey = useRef('')
  const scrolled = useRef('')
  const measure = useCallback(() => {
    const s = stateRef.current
    const cur = stepOf(tour, s)
    if (!cur || (s.status !== 'running' && s.status !== 'broken') || prepRef.current !== 'ok') {
      setRect(null)
      setHighlight(null)
      return
    }
    // Datos listos: hasta que no carguen las marcas de `readyOn` y desaparezca el «Cargando…», el paso 1 no se evalúa (así no se omite en silencio ningún paso mientras carga la lista).
    if (!readyRef.current) {
      const marksOk = (tour.readyOn ?? []).every((m) => Boolean(findTarget(m)))
      if ((marksOk && !screenIsLoading()) || Date.now() - gateStart.current > readyMaxMs) {
        readyRef.current = true
        setReady(true)
        const lack = tour.needs?.find((n) => !findTarget(n.target))
        if (lack && !s.readOnly) {
          setNeedsMsg(lack.message)
          return
        }
      } else {
        setRect(null)
        setHighlight(null)
        return
      }
    }
    if (needsRef.current) {
      setRect(null)
      setHighlight(null)
      return
    }
    const el = cur.target ? findTarget(cur.target) : null
    const nowArea = readVisibleArea()
    setArea((prev) => (sameArea(prev, nowArea) ? prev : nowArea))
    // Un paso que ya está cumplido al llegar (p. ej. el formulario ya abierto) se omite; el siguiente se evalúa en la vuelta siguiente.
    const key = `${s.index}`
    const enteredBack = backIndex.current === s.index
    if (lastStepKey.current !== key) {
      lastStepKey.current = key
      gateStart.current = Date.now()
      if (!enteredBack && !s.readOnly && cur.skipIf?.some((sig) => (sig.type === 'appear' ? Boolean(findTarget(sig.target)) : false))) {
        dispatch({ type: 'skip', index: s.index })
        return
      }
    }
    // Señales «appear» y «filled» ya cumplidas: se anuncian al motor (salvo en un paso al que se ha vuelto con «Atrás»).
    for (const sig of enteredBack || s.readOnly ? [] : cur.completeOn) {
      if (sig.type === 'appear' && findTarget(sig.target)) dispatch({ type: 'signal', signal: { type: 'appear', target: sig.target } })
      if (sig.type === 'filled') {
        const t = findTarget(sig.target)
        const f = t ? fieldOf(t) : null
        if (f && f.value.length >= (sig.min ?? 1)) dispatch({ type: 'signal', signal: { type: 'filled', target: sig.target, length: f.value.length } })
      }
    }
    if (!el) {
      setRect(null)
      setHighlight(null)
      setGuards((g) => (g.keep.length || g.block.length ? { keep: [], block: [] } : g))
      if (cur.target && !s.readOnly) {
        // No se da por ausente mientras la pantalla carga ni justo después de pulsar el propio control (puede desaparecer al hacerlo).
        const clicked = lastClick.current && lastClick.current.id === cur.target && Date.now() - lastClick.current.at < CLICK_GRACE_MS
        const loading = Date.now() - gateStart.current < readyMaxMs && screenIsLoading()
        if (clicked || loading) {
          missingSince.current = null
          return
        }
        missingSince.current ??= Date.now()
        const limit = cur.optional ? Math.min(missingAfterMs, OPTIONAL_GRACE_MS) : missingAfterMs
        if (Date.now() - missingSince.current > limit && s.status === 'running') dispatch({ type: 'target-missing', index: s.index })
      }
      return
    }
    missingSince.current = null
    if (s.status === 'broken') dispatch({ type: 'target-found' })
    // Medidas SIEMPRE relativas a la capa del tutorial (misma fuente de coordenadas que el control): no dependen de cómo cuente cada navegador el viewport.
    const frameRect = layerRef.current?.getBoundingClientRect()
    const frame = frameRect && frameRect.height > 0 ? { top: frameRect.top, left: frameRect.left, height: frameRect.height } : { top: nowArea.top, left: nowArea.left, height: nowArea.height }
    const target = ringElementOf(el)
    if (scrolled.current !== key) {
      scrolled.current = key
      const r0 = target.getBoundingClientRect()
      const out = r0.top < frame.top + 60 || r0.bottom > frame.top + frame.height - 60
      // Solo lo necesario para que el control entre en pantalla; la colocación fina (fuera de la zona que ocupa la tarjeta) la hace `revealTarget` cuando ya se sabe el lado.
      if (out) el.scrollIntoView?.({ block: 'nearest', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    }
    setHighlight(target)
    const r = target.getBoundingClientRect()
    const rel = { top: r.top - frame.top, left: r.left - frame.left, width: r.width, height: r.height }
    setRect((prev) => (prev && prev.key === key && prev.top === rel.top && prev.left === rel.left && prev.width === rel.width && prev.height === rel.height ? prev : { ...rel, key }))
    // Qué más no puede tapar la tarjeta: los controles auxiliares del paso y las hojas propias abiertas que no son el objetivo.
    const keepEls = (cur.keepVisible ?? []).flatMap((id) => {
      const k = findTarget(id)
      return k ? [k] : []
    })
    const keep = keepEls.map((k) => {
      const kr = k.getBoundingClientRect()
      return { top: kr.top - frame.top - 4, bottom: kr.bottom - frame.top + 4 }
    })
    const block = Array.from(document.querySelectorAll<HTMLElement>('.modal-sheet'))
      .filter((sh) => !sh.closest('[data-tour-layer]') && !sh.contains(el) && !keepEls.some((k) => sh.contains(k)))
      .flatMap((sh) => {
        const br = sh.getBoundingClientRect()
        return br.width > 0 && br.height > 0 ? [{ top: br.top - frame.top, bottom: br.bottom - frame.top }] : []
      })
    setGuards((g) => (sameSpans(g.keep, keep) && sameSpans(g.block, block) ? g : { keep, block }))
  }, [tour, missingAfterMs, readyMaxMs, setHighlight])

  // Si tras abrirse o cerrarse el teclado (o al llegar a un paso) el control queda fuera de la zona libre (bajo el teclado o bajo la tarjeta), se desplaza el CONTENIDO lo justo para verlo
  // junto con los controles auxiliares del paso. Solo mueve el desplazamiento del contenedor: no toca el formulario ni el foco, así que no interrumpe la escritura.
  const revealTarget = useCallback(() => {
    const s = stateRef.current
    const cur = stepOf(tour, s)
    const el = cur?.target ? findTarget(cur.target) : null
    if (!el || s.status !== 'running') return
    const a = readVisibleArea()
    const frameRect = layerRef.current?.getBoundingClientRect()
    const frameTop = frameRect && frameRect.height > 0 ? frameRect.top : a.top
    const rects = [ringElementOf(el), ...(cur?.keepVisible ?? []).flatMap((id) => (findTarget(id) ? [findTarget(id)!] : []))].map((e) => e.getBoundingClientRect())
    const ring = { top: Math.min(...rects.map((r) => r.top)) - frameTop, bottom: Math.max(...rects.map((r) => r.bottom)) - frameTop }
    const bottomOffset = a.keyboard ? 8 : a.width >= 720 ? 16 : 100
    const ph = panelRef.current?.offsetHeight ?? 0
    const zone = freeZone(sideRef.current, a.height, ph, bottomOffset)
    scrollContentBy(el, scrollDeltaToReveal(ring, zone.top, zone.bottom))
  }, [tour])

  useEffect(() => {
    missingSince.current = null
    measure()
    let raf = 0
    const schedule = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    }
    // Ráfaga: durante la animación del teclado, del foco o de un desplazamiento el control se mueve fotograma a fotograma; se mide en cada uno (y al terminar se recoloca) en lugar de
    // fiarse de una sola lectura intermedia. Esto es lo que dejaba el marco desalineado en el iPhone.
    let burstRaf = 0
    let burstUntil = 0
    let settle = 0
    const frame = () => {
      measure()
      burstRaf = Date.now() < burstUntil ? requestAnimationFrame(frame) : 0
    }
    const burst = () => {
      const ms = 900
      burstUntil = Date.now() + ms
      if (!burstRaf) burstRaf = requestAnimationFrame(frame)
      window.clearTimeout(settle)
      settle = window.setTimeout(() => {
        measure()
        revealTarget()
        measure()
      }, ms + 60)
    }
    const mo = new MutationObserver(schedule)
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-help-id', 'hidden', 'class', 'style'] })
    const timer = window.setInterval(measure, POLL_MS)
    const vv = window.visualViewport
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', burst)
    window.addEventListener('orientationchange', burst)
    document.addEventListener('focusin', burst)
    document.addEventListener('focusout', burst)
    vv?.addEventListener('resize', burst)
    vv?.addEventListener('scroll', schedule)
    // Al llegar a cada paso se recoloca el contenido una vez que la tarjeta ya está en su sitio.
    const enter = window.setTimeout(() => {
      measure()
      revealTarget()
    }, 350)
    return () => {
      cancelAnimationFrame(raf)
      cancelAnimationFrame(burstRaf)
      window.clearTimeout(settle)
      window.clearTimeout(enter)
      mo.disconnect()
      window.clearInterval(timer)
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', burst)
      window.removeEventListener('orientationchange', burst)
      document.removeEventListener('focusin', burst)
      document.removeEventListener('focusout', burst)
      vv?.removeEventListener('resize', burst)
      vv?.removeEventListener('scroll', schedule)
    }
  }, [measure, revealTarget, stepKey, prep])

  // Posición, modo y altura real de la tarjeta. Primero se calcula dónde va (ver planPanel) con la altura de la tarjeta COMPLETA, que solo se mide cuando está en modo completo.
  const bottomOffset = area.keyboard ? 8 : area.width >= 720 ? 16 : 100
  const ringSpan = rect && rect.key === String(state.index) && step?.target ? { top: rect.top - 4, bottom: rect.top + rect.height + 4 } : null
  // Un control muy alto (un formulario entero) no se puede dejar libre entero: se protege su parte de arriba (la cabecera) y los controles auxiliares.
  const tall = Boolean(ringSpan && ringSpan.bottom - ringSpan.top > area.height * 0.6)
  const protect: Span[] = [...(ringSpan ? [tall ? { top: ringSpan.top, bottom: Math.min(ringSpan.bottom, ringSpan.top + 120) } : ringSpan] : []), ...guards.keep]
  const halfRule: 'top' | 'bottom' = ringSpan && (ringSpan.top + ringSpan.bottom) / 2 > area.height * 0.52 ? 'top' : 'bottom'
  const fullH = fullHRef.current || panelH
  const plan =
    panelH > 0 && (ringSpan || guards.block.length > 0)
      ? planPanel({ areaHeight: area.height, fullHeight: fullH, bottomOffset, protect, guard: guards.block, current: sideRef.current, manual: manualSide })
      : { side: manualSide ?? halfRule, mode: 'full' as const, unsatisfiable: false }
  const mode = suspended ? 'pill' : expanded ? 'full' : area.compact && plan.mode === 'full' ? 'compact' : plan.mode
  const side = plan.side
  sideRef.current = side
  const placeTop = side === 'top'

  // Altura real del panel: se guarda la de la tarjeta completa para decidir con ella aunque ahora esté compacta o en píldora.
  useLayoutEffect(() => {
    const h = panelRef.current?.offsetHeight ?? 0
    if (mode === 'full' && h > 0) fullHRef.current = h
    if (Math.abs(h - panelH) > 1) setPanelH(h)
  }, [panelH, mode, state.index, state.status, area.compact, area.keyboard, speaking, needsMsg, suspended, expanded])

  // ---- Voz: cada paso se lee en modo «Hablando»; en «Por escrito» solo con el botón (el texto se ve siempre).
  useEffect(() => {
    if (state.status !== 'running' || !step) return
    if (voiceMode === 'voice') {
      setSpeaking(true)
      void speakHelp(step.text, () => setSpeaking(false))
    } else {
      stopHelpSpeech()
      setSpeaking(false)
    }
  }, [state.index, state.status, voiceMode, step])

  // ---- Final: se guarda el progreso (un ✓ conseguido no se pierde) y se avisa al padre cuando la persona cierra el panel final o sale.
  useEffect(() => {
    if (state.status === 'completed') setTourProgress(tour.id, { status: 'completed', at: new Date().toISOString().slice(0, 10), version: tour.version })
    if (state.status === 'exited' && !closedRef.current) {
      closedRef.current = true
      markTourProgress(tour.id, 'dismissed', tour.version)
      stopHelpSpeech()
      onClose('exited')
    }
  }, [state.status, tour, onClose])

  const finish = () => {
    if (closedRef.current) return
    closedRef.current = true
    stopHelpSpeech()
    onClose('completed')
  }

  // Ir a otro capítulo (anterior o siguiente) cerrando este sin guardar nada más.
  const goChapter = (id: string, label: string, completed: boolean) => {
    if (completed) finish()
    else {
      closedRef.current = true
      stopHelpSpeech()
      onClose('exited')
    }
    onPick({ kind: 'tour', id, label })
  }

  const retryPrepare = () => {
    stopPrepare.current()
    stopPrepare.current = prepareRef.current()
    dispatch({ type: 'restart' })
  }

  // Pasos a los que se puede volver: el anterior mostrado o un paso omitido cuyo control ya está en pantalla.
  const reopenable = (i: number) => Boolean(tour.steps[i]?.target && !tour.steps[i].skipIf?.length && findTarget(tour.steps[i].target!))
  const prevIdx = previousIndex(state, reopenable)

  const nums = stepNumbers(tour, state)
  const chapterLabel = pos && pos.total > 1 ? `Capítulo ${pos.index + 1} de ${pos.total} · ` : ''

  const body = () => {
    if (prep === 'wait') {
      return (
        <>
          <p className="tour-text" aria-live="polite">
            Preparando la pantalla del tutorial…
          </p>
          <div className="tour-actions">
            <button type="button" className="tour-btn" onClick={() => dispatch({ type: 'exit' })}>
              ✕ Salir
            </button>
          </div>
        </>
      )
    }
    if (prep === 'failed') {
      return (
        <>
          <p className="tour-text">No he podido abrir la pantalla de este tutorial. Puede que tu cuenta no tenga acceso a esa sección o que todavía se esté cargando.</p>
          <p className="tour-sub">No pasa nada: puedes reintentarlo, seguir los pasos de la ficha de Ayuda o salir.</p>
          <div className="tour-actions">
            <button type="button" className="tour-btn tour-btn-primary" onClick={retryPrepare}>
              ↺ Reintentar
            </button>
            <button type="button" className="tour-btn" onClick={() => onPick({ kind: 'card', id: tour.cardId, label: tour.title })}>
              Ver los pasos escritos
            </button>
            <button type="button" className="tour-btn" onClick={() => dispatch({ type: 'exit' })}>
              ✕ Salir
            </button>
          </div>
        </>
      )
    }
    if (!ready && state.status === 'running' && !needsMsg) {
      return (
        <>
          <p className="tour-text" aria-live="polite">
            Cargando los datos de la pantalla…
          </p>
          <div className="tour-actions">
            <button type="button" className="tour-btn" onClick={() => dispatch({ type: 'exit' })}>
              ✕ Salir
            </button>
          </div>
        </>
      )
    }
    if (needsMsg && state.status !== 'completed') {
      return (
        <>
          <p className="tour-text">{needsMsg}</p>
          <p className="tour-sub">Puedes crear antes lo que falta y volver a mirar, o recorrer este capítulo solo leyendo (no se hace ni se guarda nada).</p>
          <div className="tour-actions">
            <button
              type="button"
              className="tour-btn tour-btn-primary"
              onClick={() => {
                dispatch({ type: 'read-only' })
                setNeedsMsg(null)
              }}
            >
              Verlo solo leyendo
            </button>
            <button
              type="button"
              className="tour-btn"
              onClick={() => {
                const lack = tour.needs?.find((n) => !findTarget(n.target))
                setNeedsMsg(lack ? lack.message : null)
              }}
            >
              ↺ Ya lo tengo: volver a mirar
            </button>
            <button type="button" className="tour-btn" onClick={() => dispatch({ type: 'exit' })}>
              ✕ Salir
            </button>
          </div>
        </>
      )
    }
    if (state.status === 'completed') {
      return (
        <>
          <p className="tour-text">{tour.finishText}</p>
          {pos?.next && <p className="tour-sub">Capítulo {pos.index + 1} de {pos.total} terminado. Sigues cuando quieras: no paso al siguiente sola.</p>}
          {pos && !pos.next && pos.total > 1 && <p className="tour-sub">Has terminado «{pos.series.title}».</p>}
          {!pos?.next && nextOptions.length > 0 && (
            <>
              <p className="tour-sub">¿Qué otra cosa quieres conocer?</p>
              <ul className="tour-next">
                {nextOptions.map((o) => (
                  <li key={`${o.kind}:${o.id}`}>
                    <button type="button" className="tour-btn" onClick={() => { finish(); onPick(o) }}>
                      {o.kind === 'tour' ? '🎓 ' : '❓ '}
                      {o.label}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="tour-actions">
            {pos?.next ? (
              <button type="button" className="tour-btn tour-btn-primary" onClick={() => goChapter(pos.next!.id, pos.next!.title, true)}>
                Siguiente capítulo: {pos.next.title} (≈{Math.max(1, Math.round(pos.next.durationSec / 60))} min)
              </button>
            ) : (
              <button type="button" className="tour-btn tour-btn-primary" onClick={finish}>
                Cerrar
              </button>
            )}
            {pos?.next && (
              <button type="button" className="tour-btn" onClick={finish}>
                Terminar aquí
              </button>
            )}
            <button type="button" className="tour-btn" onClick={() => dispatch({ type: 'restart' })}>
              ↺ Repetir capítulo
            </button>
          </div>
        </>
      )
    }
    if (state.status === 'broken') {
      return (
        <>
          <p className="tour-text">{step?.missingText ?? 'Ahora mismo no veo en tu pantalla el control de este paso.'}</p>
          <p className="tour-sub">Suele pasar si todavía no hay datos para ese paso (por ejemplo, un apunte pendiente) o si la pantalla está en otra vista. Puedes volver a mirar, saltar este paso o recorrer el capítulo solo leyendo.</p>
          <div className="tour-actions">
            <button type="button" className="tour-btn tour-btn-primary" onClick={() => dispatch({ type: 'retry' })}>
              ↺ Volver a mirar
            </button>
            {step && !step.sensitive && (
              <button type="button" className="tour-btn" onClick={() => dispatch({ type: 'skip' })}>
                Saltar este paso
              </button>
            )}
            <button type="button" className="tour-btn" onClick={() => dispatch({ type: 'read-only' })}>
              Verlo solo leyendo
            </button>
            <button type="button" className="tour-btn" onClick={() => onPick({ kind: 'card', id: tour.cardId, label: tour.title })}>
              Ver los pasos escritos
            </button>
            <button type="button" className="tour-btn" onClick={() => dispatch({ type: 'exit' })}>
              ✕ Salir
            </button>
          </div>
        </>
      )
    }
    if (state.status === 'paused') {
      return (
        <>
          <p className="tour-text">{state.reason === 'off-route' ? `Has salido de la pantalla del tutorial «${tour.title}». ¿Seguimos?` : 'Tutorial en pausa.'}</p>
          <div className="tour-actions">
            <button
              type="button"
              className="tour-btn tour-btn-primary"
              onClick={() => {
                if (state.reason === 'off-route') {
                  navigatingRef.current = true
                  navigate(tour.startPath)
                }
                dispatch({ type: 'resume' })
                dispatch({ type: 'on-route' })
              }}
            >
              ▶ Seguir
            </button>
            <button type="button" className="tour-btn" onClick={() => dispatch({ type: 'exit' })}>
              ✕ Salir
            </button>
          </div>
        </>
      )
    }
    if (!step) return null
    const afterBack = backIndex.current === state.index
    return (
      <>
        <p className="tour-text" aria-live="polite">
          {step.text}
        </p>
        {state.readOnly && <p className="tour-sub">👀 Solo leyendo: aquí no se hace ni se guarda nada.</p>}
        {step.details && step.details.length > 0 && (
          <details className="tour-details">
            <summary>{step.detailsLabel ?? 'Más información'}</summary>
            <ul>
              {step.details.map((d) => (
                <li key={d.title}>
                  <strong>{d.title}:</strong> {d.text}
                </li>
              ))}
            </ul>
          </details>
        )}
        {step.sensitive && !state.readOnly && <p className="tour-sub">🔒 Esta acción la haces tú; yo no la hago por ti.</p>}
        <div className="tour-actions">
          {prevIdx !== null && (
            <button
              type="button"
              className="tour-btn"
              onClick={() => {
                backIndex.current = prevIdx
                dispatch({ type: 'back', to: prevIdx })
              }}
            >
              ← Atrás
            </button>
          )}
          {prevIdx === null && state.index > 0 && (
            <button
              type="button"
              className="tour-btn"
              onClick={() => {
                backIndex.current = 0 // se vuelve a ver el primer paso aunque ya esté cumplido: no se omite otra vez
                dispatch({ type: 'back', to: 0 })
              }}
            >
              ↺ Volver al principio
            </button>
          )}
          {prevIdx === null && state.index === 0 && pos?.prev && (
            <button type="button" className="tour-btn" onClick={() => goChapter(pos.prev!.id, pos.prev!.title, false)}>
              ← Capítulo anterior
            </button>
          )}
          {(canGoNext(step) || state.readOnly || (afterBack && !step.sensitive)) && (
            <button type="button" className="tour-btn tour-btn-primary" onClick={() => dispatch({ type: 'next', force: true })}>
              Siguiente →
            </button>
          )}
          {afterBack && step.sensitive && !state.readOnly && (
            <button type="button" className="tour-btn tour-btn-primary" onClick={() => dispatch({ type: 'next', afterBack: true })}>
              Ya lo hice → Siguiente
            </button>
          )}
          {step.skipLabel && !step.sensitive && !canGoNext(step) && (
            <button type="button" className="tour-btn" onClick={() => dispatch({ type: 'skip' })}>
              {step.skipLabel}
            </button>
          )}
          {groupHasMore(tour, state) && (
            <button type="button" className="tour-btn" onClick={() => dispatch({ type: 'skip-group' })}>
              {step.skipGroupLabel ?? 'Saltar opciones'}
            </button>
          )}
        </div>
        {/* Controles secundarios: con espacio, a la vista; en pantallas bajas o con el teclado abierto, recogidos tras «⋯ Más» (siguen a un toque; «Salir» está siempre arriba). */}
        <details className="tour-more" open={mode === 'full' && !area.compact}>
          <summary>⋯ Más (pausar, reiniciar, escuchar)</summary>
          <div className="tour-actions tour-actions-secondary">
            <button type="button" className="tour-btn" onClick={() => dispatch({ type: 'pause' })}>
              ⏸ Pausar
            </button>
            <button type="button" className="tour-btn" onClick={() => dispatch({ type: 'restart' })}>
              ↺ Reiniciar
            </button>
            {speaking ? (
              <button type="button" className="tour-btn" onClick={() => { stopHelpSpeech(); setSpeaking(false) }} aria-label="Detener la voz">
                ⏹ Detener
              </button>
            ) : (
              <button type="button" className="tour-btn" onClick={() => { setSpeaking(true); void speakHelp(step.text, () => setSpeaking(false)) }} aria-label="Escuchar este paso en voz alta">
                🔊 Escuchar
              </button>
            )}
          </div>
        </details>
      </>
    )
  }

  if (state.status === 'exited') return null
  const headerLabel = `${chapterLabel}Paso ${nums.k} de ${nums.n}`
  const showPill = mode === 'pill' && (state.status === 'running' || state.status === 'broken') && prep === 'ok' && !needsMsg
  return createPortal(
    <div
      ref={layerRef}
      className="tour-layer"
      data-tour-layer="true"
      data-keyboard={area.keyboard ? 'true' : 'false'}
      style={{ top: area.top, left: area.left, width: area.width, height: area.height }}
    >
      <section
        ref={panelRef}
        className={`tour-panel ${placeTop ? 'tour-panel-top' : 'tour-panel-bottom'}${mode === 'compact' || area.compact ? ' tour-panel-compact' : ''}${showPill ? ' tour-panel-pill' : ''}`}
        data-tour-mode={showPill ? 'pill' : mode}
        style={{ maxHeight: Math.max(120, Math.round(area.height * (area.compact ? 0.4 : 0.46))), ...(area.keyboard ? ({ '--tour-bottom': '8px' } as React.CSSProperties) : null) }}
        role="dialog"
        aria-modal="false"
        aria-label={`Tutorial: ${tour.title}`}
      >
        {showPill ? (
          <div className="tour-pill">
            <PepaFace size={26} />
            <p className="tour-pill-text">{suspended ? 'Elige lo que necesites; cuando vuelvas, seguimos.' : step?.text}</p>
            <button type="button" className="tour-pill-btn" onClick={() => (suspended ? setSuspended(false) : setExpanded(true))} aria-label={suspended ? 'Continuar con el tutorial' : 'Ver el paso completo'}>
              {suspended ? 'Seguir' : 'Ver'}
            </button>
            <button type="button" className="tour-pill-btn" onClick={() => setManualSide(side === 'top' ? 'bottom' : 'top')} aria-label="Mover la tarjeta a la otra parte de la pantalla">
              ↕
            </button>
            <button type="button" className="tour-pill-btn" onClick={() => dispatch({ type: 'exit' })} aria-label="Salir del tutorial">
              ✕
            </button>
          </div>
        ) : (
          <>
            <header className="tour-head">
              <PepaFace size={30} />
              <div className="tour-head-text">
                <strong>{tour.title}</strong>
                {state.status !== 'completed' && <span className="muted">{headerLabel}</span>}
              </div>
              {state.status !== 'completed' && (
                <>
                  <button type="button" className="tour-move" onClick={() => setManualSide(side === 'top' ? 'bottom' : 'top')} aria-label="Mover la tarjeta a la otra parte de la pantalla" title="Mover la tarjeta">
                    ↕
                  </button>
                  <button type="button" className="tour-exit" onClick={() => dispatch({ type: 'exit' })} aria-label="Salir del tutorial" title="Salir del tutorial">
                    ✕
                  </button>
                </>
              )}
            </header>
            {body()}
          </>
        )}
      </section>
    </div>,
    document.body,
  )
}

// Id de marca válido (para las pruebas y para quien escriba tutoriales).
export function isValidHelpId(id: string): boolean {
  return HELP_ID_PATTERN.test(id)
}
