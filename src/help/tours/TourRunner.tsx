import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import type { HelpVoiceMode } from '@/help/prefs'
import { setTourProgress } from '@/help/prefs'
import { fieldOf, findTarget, markedAncestor, ringElementOf } from '@/help/tours/domTargets'
import { canGoNext, groupHasMore, previousIndex, reduceTour, startState, stepOf } from '@/help/tours/engine'
import { onHelpEvent } from '@/help/tours/helpBus'
import { pathAllowed } from '@/help/tours/paths'
import { clearDestination, closeOpenMenus, requestDestination, waitForDestination } from '@/help/destinations'
import type { ObservedSignal, TourDef } from '@/help/tours/types'
import { choosePanelSide, freeZone, readVisibleArea, sameArea, scrollContentBy, scrollDeltaToReveal } from '@/help/tours/viewport'
import { HELP_ID_PATTERN } from '@/help/tours/domTargets'
import { speakHelp, stopHelpSpeech } from '@/help/voice'
import { PepaFace } from '@/help/ui/PepaFace'
import '@/help/tours/tours.css'

// Corredor de un tutorial «Enséñame» sobre la pantalla REAL. Hace tres cosas y solo tres: (1) mira lo que pasa en la pantalla (clics, escritura, cambios de pantalla y avisos de
// «guardado» de la aplicación) y se lo cuenta al motor; (2) resalta el control real con un marco que NO intercepta toques (se pulsa el botón de verdad); (3) enseña el panel de Pepa con
// el texto del paso. No pulsa, no escribe, no envía ni guarda NADA: la persona hace cada acción. Si el control no existe o cambia, ofrece una salida comprensible; nunca bloquea la app.
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
// Confirmación de un campo con selector (fecha): el valor cambió y se da por elegido cuando se cierra el selector (el campo pierde el foco) o, si el campo conserva el foco (el
// selector del iPhone lo deja enfocado), tras un rato sin más cambios. Mientras se sigue girando el selector no se avanza.
const CONFIRM_FOCUSED_MS = 1800
const CONFIRM_BLURRED_MS = 450
const CONFIRM_AFTER_BLUR_MS = 150

export function TourRunner({
  tour,
  voiceMode,
  nextOptions,
  onClose,
  onPick,
  missingAfterMs = MISSING_AFTER_MS,
  confirmMs = { focused: CONFIRM_FOCUSED_MS, blurred: CONFIRM_BLURRED_MS, afterBlur: CONFIRM_AFTER_BLUR_MS },
  prepareMs = PREPARE_MS,
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
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const [state, dispatch] = useReducer((s: ReturnType<typeof startState>, a: Parameters<typeof reduceTour>[2]) => reduceTour(tour, s, a), tour, startState)
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number; key: string } | null>(null)
  const [speaking, setSpeaking] = useState(false)
  // Área realmente visible (descontando el teclado) y altura del panel: el marco y el panel se colocan respecto a ella, no a la pantalla entera (B4-UX01).
  const [area, setArea] = useState(readVisibleArea)
  const [panelH, setPanelH] = useState(0)
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
  const stateRef = useRef(state)
  stateRef.current = state
  const allowed = tour.paths ?? [tour.startPath]
  const allowedRef = useRef(allowed)
  allowedRef.current = allowed
  const navigatingRef = useRef(false)
  // Paso al que se ha vuelto con «Atrás»: ya estaba hecho, así que no se vuelve a dar por conseguido solo (ni se omite): la persona decide con «Siguiente» o actuando de nuevo.
  const backIndex = useRef<number | null>(null)
  const closedRef = useRef(false)
  // Preparación: antes del primer paso se cierran los menús, se lleva a la persona a la pantalla (y vista) del tutorial y se ESPERA a que esté en pantalla. 'wait' = llegando;
  // 'ok' = lista; 'failed' = no se pudo abrir (sin acceso, pantalla distinta…): se explica en vez de fingir que se avanza.
  const [prep, setPrep] = useState<'wait' | 'ok' | 'failed'>(tour.startDest ? 'wait' : 'ok')
  const prepRef = useRef(prep)
  prepRef.current = prep
  const prepareRef = useRef<() => () => void>(() => () => undefined)
  prepareRef.current = () => {
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

  const step = stepOf(tour, state)
  const stepKey = `${state.index}:${state.status}`

  // ---- Al empezar: ir a la pantalla del tutorial si la persona está en otra, y guardar que se ha empezado.
  useEffect(() => {
    setTourProgress(tour.id, { status: 'started', at: new Date().toISOString().slice(0, 10), version: tour.version })
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
      if (el) send({ type: 'click', target: el.dataset.helpId ?? '' })
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
    const el = cur.target ? findTarget(cur.target) : null
    const nowArea = readVisibleArea()
    setArea((prev) => (sameArea(prev, nowArea) ? prev : nowArea))
    // Un paso que ya está cumplido al llegar (p. ej. el formulario ya abierto) se omite; el siguiente se evalúa en la vuelta siguiente.
    const key = `${s.index}`
    const enteredBack = backIndex.current === s.index
    if (lastStepKey.current !== key) {
      lastStepKey.current = key
      if (!enteredBack && cur.skipIf?.some((sig) => (sig.type === 'appear' ? Boolean(findTarget(sig.target)) : false))) {
        dispatch({ type: 'skip', index: s.index })
        return
      }
    }
    // Señales «appear» y «filled» ya cumplidas: se anuncian al motor (salvo en un paso al que se ha vuelto con «Atrás»).
    for (const sig of enteredBack ? [] : cur.completeOn) {
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
      if (cur.target) {
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
    if (scrolled.current !== key) {
      scrolled.current = key
      const r0 = el.getBoundingClientRect()
      const out = r0.top < frame.top + 60 || r0.bottom > frame.top + frame.height - 60
      if (out) el.scrollIntoView?.({ block: 'center', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    }
    const target = ringElementOf(el)
    setHighlight(target)
    const r = target.getBoundingClientRect()
    const rel = { top: r.top - frame.top, left: r.left - frame.left, width: r.width, height: r.height }
    setRect((prev) => (prev && prev.key === key && prev.top === rel.top && prev.left === rel.left && prev.width === rel.width && prev.height === rel.height ? prev : { ...rel, key }))
  }, [tour, missingAfterMs, setHighlight])

  // Si tras abrirse o cerrarse el teclado el control queda fuera de la zona libre (bajo el teclado o bajo el panel), se desplaza el CONTENIDO lo justo para verlo. Solo mueve el
  // desplazamiento del contenedor: no toca el formulario ni el foco, así que no interrumpe la escritura.
  const revealTarget = useCallback(() => {
    const s = stateRef.current
    const cur = stepOf(tour, s)
    const el = cur?.target ? findTarget(cur.target) : null
    if (!el || s.status !== 'running') return
    const a = readVisibleArea()
    const r = ringElementOf(el).getBoundingClientRect()
    const frameRect = layerRef.current?.getBoundingClientRect()
    const frameTop = frameRect && frameRect.height > 0 ? frameRect.top : a.top
    const bottomOffset = a.keyboard ? 8 : a.width >= 720 ? 16 : 100
    const ph = panelRef.current?.offsetHeight ?? 0
    const ring = { top: r.top - frameTop, bottom: r.bottom - frameTop }
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
    return () => {
      cancelAnimationFrame(raf)
      cancelAnimationFrame(burstRaf)
      window.clearTimeout(settle)
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

  // Altura real del panel (cambia con el texto del paso y con el modo compacto): decide a qué lado va para no tapar el control.
  useLayoutEffect(() => {
    const h = panelRef.current?.offsetHeight ?? 0
    if (Math.abs(h - panelH) > 1) setPanelH(h)
  }, [panelH, state.index, state.status, area.compact, area.keyboard, speaking])

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

  // ---- Final: se guarda el progreso y se avisa al padre cuando la persona cierra el panel final o sale.
  useEffect(() => {
    if (state.status === 'completed') setTourProgress(tour.id, { status: 'completed', at: new Date().toISOString().slice(0, 10), version: tour.version })
    if (state.status === 'exited' && !closedRef.current) {
      closedRef.current = true
      setTourProgress(tour.id, { status: 'dismissed', at: new Date().toISOString().slice(0, 10), version: tour.version })
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

  // Posición del panel, respecto al ÁREA VISIBLE (con el teclado abierto es mucho más baja que la pantalla): al lado donde no tape el control. Si ambos lados valen, manda la regla
  // de siempre: control en la mitad de abajo → panel arriba (y al revés).
  const bottomOffset = area.keyboard ? 8 : area.width >= 720 ? 16 : 100
  const ringSpan = rect && rect.key === String(state.index) && step?.target ? { top: rect.top - 4, bottom: rect.top + rect.height + 4 } : null
  const halfRule: 'top' | 'bottom' = ringSpan && (ringSpan.top + ringSpan.bottom) / 2 > area.height * 0.52 ? 'top' : 'bottom'
  const side: 'top' | 'bottom' = ringSpan && panelH > 0 ? choosePanelSide(ringSpan, area.height, panelH, bottomOffset, halfRule) : halfRule
  sideRef.current = side
  const placeTop = side === 'top'

  const retryPrepare = () => {
    stopPrepare.current()
    stopPrepare.current = prepareRef.current()
    dispatch({ type: 'restart' })
  }

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
    if (state.status === 'completed') {
      return (
        <>
          <p className="tour-text">{tour.finishText}</p>
          {nextOptions.length > 0 && (
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
            <button type="button" className="tour-btn tour-btn-primary" onClick={finish}>
              Cerrar
            </button>
            <button type="button" className="tour-btn" onClick={() => dispatch({ type: 'restart' })}>
              ↺ Repetir
            </button>
          </div>
        </>
      )
    }
    if (state.status === 'broken') {
      return (
        <>
          <p className="tour-text">No encuentro este control en tu pantalla (puede que sea otra versión, que tu cuenta no tenga acceso o que se haya cerrado una ventana).</p>
          <p className="tour-sub">No pasa nada: puedes reintentarlo, seguir los pasos de la ficha de Ayuda o salir.</p>
          <div className="tour-actions">
            <button type="button" className="tour-btn tour-btn-primary" onClick={() => dispatch({ type: 'restart' })}>
              ↺ Empezar de nuevo
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
    return (
      <>
        <p className="tour-text" aria-live="polite">
          {step.text}
        </p>
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
        {step.sensitive && <p className="tour-sub">🔒 Esta acción la haces tú; yo no la hago por ti.</p>}
        <div className="tour-actions">
          {previousIndex(state) !== null && (
            <button
              type="button"
              className="tour-btn"
              onClick={() => {
                backIndex.current = previousIndex(state)
                dispatch({ type: 'back' })
              }}
            >
              ← Atrás
            </button>
          )}
          {(canGoNext(step) || (backIndex.current === state.index && !step.sensitive)) && (
            <button type="button" className="tour-btn tour-btn-primary" onClick={() => dispatch({ type: 'next', force: true })}>
              Siguiente →
            </button>
          )}
          {groupHasMore(tour, state) && (
            <button type="button" className="tour-btn" onClick={() => dispatch({ type: 'skip-group' })}>
              {step.skipGroupLabel ?? 'Saltar opciones'}
            </button>
          )}
        </div>
        {/* Controles secundarios: con espacio, a la vista; en pantallas bajas o con el teclado abierto, recogidos tras «⋯ Más» (siguen a un toque; «Salir» está siempre arriba). */}
        <details className="tour-more" open={!area.compact}>
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
  const total = tour.steps.length
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
        className={`tour-panel ${placeTop ? 'tour-panel-top' : 'tour-panel-bottom'}${area.compact ? ' tour-panel-compact' : ''}`}
        style={{ maxHeight: Math.max(120, Math.round(area.height * (area.compact ? 0.4 : 0.46))), ...(area.keyboard ? ({ '--tour-bottom': '8px' } as React.CSSProperties) : null) }}
        role="dialog"
        aria-modal="false"
        aria-label={`Tutorial: ${tour.title}`}
      >
        <header className="tour-head">
          <PepaFace size={30} />
          <div className="tour-head-text">
            <strong>{tour.title}</strong>
            {state.status !== 'completed' && (
              <span className="muted">
                Paso {Math.min(state.index + 1, total)} de {total}
              </span>
            )}
          </div>
          {state.status !== 'completed' && (
            <button type="button" className="tour-exit" onClick={() => dispatch({ type: 'exit' })} aria-label="Salir del tutorial" title="Salir del tutorial">
              ✕
            </button>
          )}
        </header>
        {body()}
      </section>
    </div>,
    document.body,
  )
}

// Id de marca válido (para las pruebas y para quien escriba tutoriales).
export function isValidHelpId(id: string): boolean {
  return HELP_ID_PATTERN.test(id)
}
