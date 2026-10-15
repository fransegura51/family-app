import { useCallback, useEffect, useRef } from 'react'
import { markCommentsSeen } from '@/data/community'
import { ExposureTracker, SeenQueue, SEEN_BATCH_MAX, qualifiesAsExposed } from '@/domain/communityComments'

// Marca comentarios como VISTOS solo cuando se han visto de verdad: al menos el 50 % del comentario en pantalla durante al menos 1 segundo, con la pestaña
// visible. Nunca por abrir la publicación. Las marcas se mandan en lotes (hasta 50) y no se repite ninguna. Sin IntersectionObserver (navegadores muy antiguos)
// no se marca nada: es preferible dejar un comentario como «nuevo» a darlo por leído sin que se haya visto.
//
// Uso: `const watch = useCommentExposure(onSeen)`; en cada comentario NUEVO, `ref={watch(comment.id)}`. `onSeen(ids)` se llama cuando el servidor ya los ha marcado.
const FLUSH_DELAY_MS = 1500

export function useCommentExposure(onSeen: (ids: string[]) => void): (id: string) => (el: HTMLElement | null) => void {
  const trackerRef = useRef(new ExposureTracker())
  const queueRef = useRef(new SeenQueue())
  const observerRef = useRef<IntersectionObserver | null>(null)
  const elementsRef = useRef(new Map<string, HTMLElement>())
  const idByElementRef = useRef(new Map<Element, string>())
  const refCallbacksRef = useRef(new Map<string, (el: HTMLElement | null) => void>())
  const dueTimerRef = useRef<number | null>(null)
  const flushTimerRef = useRef<number | null>(null)
  const onSeenRef = useRef(onSeen)
  onSeenRef.current = onSeen

  const flush = useCallback(async () => {
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current)
      flushTimerRef.current = null
    }
    const queue = queueRef.current
    while (queue.size > 0) {
      const batch = queue.take(SEEN_BATCH_MAX)
      try {
        await markCommentsSeen(batch)
        queue.confirm(batch)
        onSeenRef.current(batch)
      } catch {
        // Sin red o error: se devuelven a la cola y se reintentan en el próximo envío (sin bucle: se sale).
        queue.fail(batch)
        return
      }
    }
  }, [])

  const scheduleFlush = useCallback(() => {
    if (queueRef.current.size >= SEEN_BATCH_MAX) {
      void flush()
      return
    }
    if (flushTimerRef.current === null) flushTimerRef.current = window.setTimeout(() => void flush(), FLUSH_DELAY_MS)
  }, [flush])

  const checkDue = useCallback(() => {
    dueTimerRef.current = null
    const tracker = trackerRef.current
    const now = Date.now()
    const due = tracker.due(now)
    if (due.length > 0 && queueRef.current.add(due) > 0) scheduleFlush()
    const next = tracker.nextDueIn(now)
    if (next !== null) dueTimerRef.current = window.setTimeout(checkDue, next + 20)
  }, [scheduleFlush])

  const rearm = useCallback(() => {
    if (dueTimerRef.current !== null) window.clearTimeout(dueTimerRef.current)
    dueTimerRef.current = null
    const next = trackerRef.current.nextDueIn(Date.now())
    if (next !== null) dueTimerRef.current = window.setTimeout(checkDue, next + 20)
  }, [checkDue])

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const tracker = trackerRef.current
    const observer = new IntersectionObserver(
      (entries) => {
        const now = Date.now()
        for (const entry of entries) {
          const id = idByElementRef.current.get(entry.target)
          if (!id) continue
          const exposed = entry.isIntersecting && qualifiesAsExposed(entry.intersectionRatio, entry.intersectionRect.height, window.innerHeight)
          if (exposed) tracker.enter(id, now)
          else tracker.leave(id)
        }
        rearm()
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    )
    observerRef.current = observer
    // Los elementos registrados antes de crear el observador (primer pintado) se empiezan a vigilar ahora.
    for (const [, el] of elementsRef.current) observer.observe(el)

    function onVisibility() {
      tracker.setPageVisible(document.visibilityState === 'visible', Date.now())
      rearm()
      if (document.visibilityState === 'hidden') void flush()
    }
    function onHide() {
      void flush()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onHide)
      observer.disconnect()
      observerRef.current = null
      if (dueTimerRef.current !== null) window.clearTimeout(dueTimerRef.current)
      // Al salir se mandan los que ya cumplían el tiempo; los que aún no lo cumplían NO se marcan.
      void flush()
    }
  }, [flush, rearm])

  return useCallback((id: string) => {
    const cached = refCallbacksRef.current.get(id)
    if (cached) return cached
    const cb = (el: HTMLElement | null) => {
      const observer = observerRef.current
      const previous = elementsRef.current.get(id)
      if (previous && previous !== el) {
        observer?.unobserve(previous)
        idByElementRef.current.delete(previous)
        trackerRef.current.leave(id)
        elementsRef.current.delete(id)
      }
      if (el) {
        elementsRef.current.set(id, el)
        idByElementRef.current.set(el, id)
        observer?.observe(el)
      }
    }
    refCallbacksRef.current.set(id, cb)
    return cb
  }, [])
}
