import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { HELP_CARDS, HELP_MODULE_BY_ID, cardsOfModule } from '@/help/catalog'
import type { HelpModuleId } from '@/help/types'
import { HelpAnswer } from '@/help/ui/HelpAnswer'
import { useHelp } from '@/help/ui/helpContext'
import { PepaFace } from '@/help/ui/PepaFace'
import { searchSeries, type SeriesHit } from '@/help/tours/series/search'
import { HelpAreaTabs, HelpHowArea, HelpLearnArea, HelpSectionArea, HelpSupportArea } from '@/help/ui/HelpAreas'
import '@/help/ui/help.css'

// Conversación de la Ayuda: la pregunta («¿Qué quieres hacer o saber?»), las respuestas de Pepa y atajos. La usan la pantalla de Ayuda ('page') y el panel flotante ('panel').
// Todo vive en memoria (HelpProvider): no hay historial guardado.
//
// Posición (nunca se salta al final de una respuesta larga ni se abre el teclado solo):
//  - Sesión nueva (sin mensajes): se enseña el PRINCIPIO, con las preguntas recomendadas del módulo antes del buscador. El buscador NO recibe el foco: el teclado solo sale si la persona lo toca.
//  - Pregunta nueva: se enseña desde SU pregunta (la respuesta empieza justo debajo), no desde el final de la respuesta.
//  - Conversación ya existente al reabrir: se coloca en el inicio de la última pregunta.
//  - Al tocar el buscador, se lleva a una posición visible por encima del teclado.
function scrollParentOf(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    const oy = window.getComputedStyle(p).overflowY
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p
    if (p.classList?.contains('help-panel-body')) return p
  }
  return null
}

export function HelpConversation({ focusModule, variant = 'page' }: { focusModule?: HelpModuleId | null; variant?: 'page' | 'panel' }) {
  const help = useHelp()
  const [text, setText] = useState('')
  const rootRef = useRef<HTMLDivElement | null>(null)
  const formRef = useRef<HTMLFormElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const bubbles = useRef(new Map<number, HTMLDivElement>())
  const { messages } = help.session
  const prevCount = useRef(messages.length)
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  // Al montar (abrir la Ayuda): sesión nueva → principio; conversación existente → inicio de la última pregunta. Sin animación.
  useLayoutEffect(() => {
    if (messages.length === 0) {
      const scroller = scrollParentOf(rootRef.current)
      if (scroller) scroller.scrollTop = 0
      return
    }
    const lastUser = [...messages].reverse().find((m) => m.role === 'user') ?? messages[messages.length - 1]
    bubbles.current.get(lastUser.id)?.scrollIntoView?.({ block: 'start' })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, [])

  // Mensajes nuevos: se enseña el primero de los nuevos (la pregunta, o la respuesta si se eligió una ficha), no el final.
  useEffect(() => {
    if (messages.length > prevCount.current) {
      const first = messages[prevCount.current]
      if (first) bubbles.current.get(first.id)?.scrollIntoView?.({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
    }
    prevCount.current = messages.length
  }, [messages, reduceMotion])

  // Teclado: al tocar el buscador (y mientras el teclado se abre o se cierra) se mantiene visible por encima del teclado.
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    let timer = 0
    const settle = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        if (document.activeElement === inputRef.current) formRef.current?.scrollIntoView?.({ block: 'nearest' })
      }, 120)
    }
    vv.addEventListener('resize', settle)
    return () => {
      window.clearTimeout(timer)
      vv.removeEventListener('resize', settle)
    }
  }, [])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    help.ask(text)
    setText('')
  }
  // Sugerencias mientras se escribe: las fichas verificadas más relevantes (pocas). Tocar una abre directamente su respuesta y cierra el teclado para que se vea.
  const typed = useDeferredValue(text)
  const allSuggestions = useMemo(() => (typed.trim().length >= 2 ? help.suggest(typed) : []), [typed, help])
  // Tutoriales «Enséñame» que encajan con lo escrito: llevan al capítulo concreto (o a la serie si encaja entera).
  const tutorialHits = useMemo(() => (typed.trim().length >= 3 ? searchSeries(typed, { canDoSeries: help.canDoSeries, canDoChapter: help.canDoTour }).slice(0, 2) : []), [typed, help.canDoSeries, help.canDoTour])
  // En total no más de cuatro: los tutoriales que encajan ocupan su sitio y las fichas se quedan con el resto.
  const suggestions = allSuggestions.slice(0, 4 - tutorialHits.length)
  const openTutorialHit = (h: SeriesHit) => {
    if (h.chapters.length > 0) help.startTourById(h.chapters[0].id)
    else help.openLearn(h.series.id)
    setText('')
    inputRef.current?.blur()
  }
  const pickSuggestion = (cardId: string) => {
    help.showCard(cardId)
    setText('')
    inputRef.current?.blur()
  }
  const setBubbleRef = (id: number) => (el: HTMLDivElement | null) => {
    if (el) bubbles.current.set(id, el)
    else bubbles.current.delete(id)
  }

  const frequent = HELP_CARDS.filter((c) => c.frequent && help.accessOfCard(c).status === 'allowed')
  const moduleCards = focusModule ? cardsOfModule(focusModule).filter((c) => help.accessOfCard(c).status !== 'hidden') : []
  const focus = focusModule ? HELP_MODULE_BY_ID.get(focusModule) : undefined
  const fresh = messages.length === 0

  const moduleChips = focus && moduleCards.length > 0 && (
    <ul>
      {moduleCards.slice(0, 8).map((c) => (
        <li key={c.id}>
          <button type="button" className="help-chip" onClick={() => help.showCard(c.id)}>
            {c.title}
          </button>
        </li>
      ))}
    </ul>
  )
  const frequentChips = (
    <ul>
      {frequent.slice(0, 8).map((c) => (
        <li key={c.id}>
          <button type="button" className="help-chip" onClick={() => help.showCard(c.id)}>
            {c.title}
          </button>
        </li>
      ))}
    </ul>
  )

  return (
    <div className={`help-conversation help-conversation-${variant}`} ref={rootRef}>
      <HelpAreaTabs />
      {help.area === 'section' && <HelpSectionArea focusModule={focusModule ?? null} />}
      {help.area === 'learn' && <HelpLearnArea focusModule={focusModule ?? null} />}
      {help.area === 'how' && <HelpHowArea focusModule={focusModule ?? null} />}
      {help.area === 'support' && <HelpSupportArea focusModule={focusModule ?? null} openTicketId={new URLSearchParams(window.location.search).get('soporte') || null} />}
      {help.area === 'chat' && (
        <>
      <div className="help-log" role="log" aria-live="polite" aria-label="Conversación con la Ayuda">
        {fresh && (
          <div className="help-bubble help-bubble-pepa">
            <PepaFace size={32} />
            <div>
              <p>
                <strong>Hola, soy Pepa.</strong> Te acompaño por la app. Cuéntame qué quieres hacer o saber y te lo explico o te llevo al sitio.
              </p>
            </div>
          </div>
        )}
        {messages.map((m) => {
          if (m.role === 'user') {
            return (
              <div key={m.id} ref={setBubbleRef(m.id)} className="help-bubble help-bubble-user">
                <p>{m.text}</p>
              </div>
            )
          }
          if (m.kind === 'text') {
            return (
              <div key={m.id} ref={setBubbleRef(m.id)} className="help-bubble help-bubble-pepa">
                <PepaFace size={32} />
                <p>{m.text}</p>
              </div>
            )
          }
          const [first, ...others] = m.hits
          return (
            <div key={m.id} ref={setBubbleRef(m.id)} className="help-bubble help-bubble-pepa">
              <PepaFace size={32} />
              <div className="help-bubble-body">
                {!first ? (
                  <>
                    <p>No he encontrado nada sobre eso en la Ayuda de PEPA. Prueba con otras palabras (por ejemplo, «crear un evento» o «cambiar mi contraseña»), o elige un tema de la lista.</p>
                  </>
                ) : (
                  <>
                    {m.confidence === 'weak' && <p className="help-hedge">Esto es lo más parecido que he encontrado:</p>}
                    {m.usedAi && <p className="help-hedge">He elegido esta ficha con ayuda de la IA entre las de la Ayuda de PEPA (el texto es el de la ficha).</p>}
                    <HelpAnswer hit={first} />
                    {others.length > 0 && (
                      <div className="help-related">
                        <p className="help-related-title">También te puede interesar</p>
                        <ul>
                          {others.slice(0, 4).map((h) => (
                            <li key={h.doc.id}>
                              <button
                                type="button"
                                className="help-chip"
                                onClick={() => (h.doc.kind === 'card' ? help.showCard(h.doc.card.id) : help.ask(h.doc.entry.title))}
                              >
                                {h.doc.kind === 'card' ? h.doc.card.title : h.doc.entry.title}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Preguntas recomendadas. Sesión nueva: «Ayuda de [módulo]» desplegada y «Acciones frecuentes» plegada (en el panel) para que el buscador quede a la vista sin listas enormes.
          Con una conversación en marcha: ambas plegadas, al alcance sin estorbar. */}
      {focus && moduleCards.length > 0 && (
        <details className="help-quick" open={fresh} aria-label={`Ayuda de ${focus.label}`}>
          <summary>
            {focus.icon} Ayuda de {focus.label}
          </summary>
          {moduleChips}
        </details>
      )}
      {frequent.length > 0 && (
        <details className="help-quick" open={fresh && variant === 'page'} aria-label="Acciones frecuentes">
          <summary>Acciones frecuentes</summary>
          {frequentChips}
        </details>
      )}

      <form className="help-ask" onSubmit={submit} ref={formRef} data-help-id="ayuda.pregunta">
        {(suggestions.length > 0 || tutorialHits.length > 0) && text.trim().length >= 2 && (
          <ul id="help-suggestions" className="help-suggestions" role="listbox" aria-label="Sugerencias de la Ayuda">
            {suggestions.map((h) =>
              h.doc.kind === 'card' ? (
                <li key={h.doc.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected="false"
                    className="help-suggestion"
                    // En el móvil, tocar aquí no debe quitar el foco al buscador antes de tiempo (el toque se resolvería sobre el hueco que deja el teclado al cerrarse).
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickSuggestion(h.doc.kind === 'card' ? h.doc.card.id : '')}
                  >
                    <span className="help-suggestion-title">{h.doc.card.title}</span>
                    <span className="help-suggestion-module">{HELP_MODULE_BY_ID.get(h.doc.module)?.label}</span>
                  </button>
                </li>
              ) : null,
            )}
            {tutorialHits.map((h) => (
              <li key={`tour:${h.series.id}`} role="presentation">
                <button type="button" role="option" aria-selected="false" className="help-suggestion help-suggestion-tour" onMouseDown={(e) => e.preventDefault()} onClick={() => openTutorialHit(h)}>
                  <span className="help-suggestion-title">🎓 {h.chapters.length > 0 ? `Enséñame: ${h.chapters[0].title}` : `Tutorial: ${h.series.title}`}</span>
                  <span className="help-suggestion-module">{h.chapters.length > 0 ? h.series.title : HELP_MODULE_BY_ID.get(h.series.module)?.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <label htmlFor="help-q">¿Qué quieres hacer o saber?</label>
        <div className="help-ask-row">
          <input
            id="help-q"
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            role="combobox"
            aria-expanded={(suggestions.length > 0 || tutorialHits.length > 0) && text.trim().length >= 2}
            aria-controls="help-suggestions"
            aria-autocomplete="list"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => window.setTimeout(() => formRef.current?.scrollIntoView?.({ block: 'nearest' }), 350)}
            placeholder="Por ejemplo: crear un evento, cambiar mi contraseña…"
          />
          <button type="submit" className="help-btn help-btn-primary" disabled={!text.trim()}>
            Preguntar
          </button>
        </div>
      </form>
        </>
      )}
    </div>
  )
}
