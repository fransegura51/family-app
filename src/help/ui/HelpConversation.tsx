import { useEffect, useRef, useState, type FormEvent } from 'react'
import { HELP_CARDS, HELP_MODULE_BY_ID, cardsOfModule } from '@/help/catalog'
import type { HelpModuleId } from '@/help/types'
import { HelpAnswer } from '@/help/ui/HelpAnswer'
import { useHelp } from '@/help/ui/helpContext'
import { PepaFace } from '@/help/ui/PepaFace'
import '@/help/ui/help.css'

// Conversación de la Ayuda: la pregunta («¿Qué quieres hacer o saber?»), las respuestas de Pepa y atajos. La usan la pantalla de Ayuda y el panel flotante. Todo vive en memoria
// (HelpProvider): no hay historial guardado.
export function HelpConversation({ focusModule, autoFocus = false }: { focusModule?: HelpModuleId | null; autoFocus?: boolean }) {
  const help = useHelp()
  const [text, setText] = useState('')
  const endRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const { messages } = help.session

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
  }, [messages.length])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    help.ask(text)
    setText('')
  }

  const frequent = HELP_CARDS.filter((c) => c.frequent && help.accessOfCard(c).status === 'allowed')
  const moduleCards = focusModule ? cardsOfModule(focusModule).filter((c) => help.accessOfCard(c).status !== 'hidden') : []
  const focus = focusModule ? HELP_MODULE_BY_ID.get(focusModule) : undefined

  return (
    <div className="help-conversation">
      <div className="help-log" role="log" aria-live="polite" aria-label="Conversación con la Ayuda">
        {messages.length === 0 && (
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
              <div key={m.id} className="help-bubble help-bubble-user">
                <p>{m.text}</p>
              </div>
            )
          }
          if (m.kind === 'text') {
            return (
              <div key={m.id} className="help-bubble help-bubble-pepa">
                <PepaFace size={32} />
                <p>{m.text}</p>
              </div>
            )
          }
          const [first, ...others] = m.hits
          return (
            <div key={m.id} className="help-bubble help-bubble-pepa">
              <PepaFace size={32} />
              <div className="help-bubble-body">
                {!first ? (
                  <>
                    <p>No he encontrado nada sobre eso en la Ayuda de PEPA. Prueba con otras palabras (por ejemplo, «crear un evento» o «cambiar mi contraseña»), o elige un tema de la lista.</p>
                  </>
                ) : (
                  <>
                    {m.confidence === 'weak' && <p className="help-hedge">Esto es lo más parecido que he encontrado:</p>}
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
        <div ref={endRef} />
      </div>

      {messages.length === 0 && (
        <>
          {focus && moduleCards.length > 0 && (
            <section className="help-quick" aria-label={`Ayuda de ${focus.label}`}>
              <h4>
                {focus.icon} Ayuda de {focus.label}
              </h4>
              <ul>
                {moduleCards.slice(0, 8).map((c) => (
                  <li key={c.id}>
                    <button type="button" className="help-chip" onClick={() => help.showCard(c.id)}>
                      {c.title}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="help-quick" aria-label="Acciones frecuentes">
            <h4>Acciones frecuentes</h4>
            <ul>
              {frequent.slice(0, 8).map((c) => (
                <li key={c.id}>
                  <button type="button" className="help-chip" onClick={() => help.showCard(c.id)}>
                    {c.title}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <form className="help-ask" onSubmit={submit}>
        <label htmlFor="help-q">¿Qué quieres hacer o saber?</label>
        <div className="help-ask-row">
          <input
            id="help-q"
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Por ejemplo: crear un evento, cambiar mi contraseña…"
          />
          <button type="submit" className="help-btn help-btn-primary" disabled={!text.trim()}>
            Preguntar
          </button>
        </div>
      </form>
    </div>
  )
}
