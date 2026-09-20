import { useState, type FormEvent } from 'react'

// Barra para RESPONDER escribiendo a la tarjeta abierta ("sí", "guárdala", "hazla
// para seis", "Mercadona"...). Por voz se responde igual: el micrófono del panel
// sigue escuchando mientras hay una tarjeta pendiente. Los botones de la tarjeta
// siguen ahí, y funcionan exactamente igual.
export function DialogReplyBar({ onReply }: { onReply: (text: string) => Promise<string | null> }) {
  const [text, setText] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    setText('')
    try {
      setNote(await onReply(trimmed))
    } catch {
      setNote('No he podido con eso. Usa los botones de la tarjeta.')
    } finally {
      setSending(false)
    }
  }

  return (
    <form className="dialog-reply-bar" onSubmit={handleSubmit}>
      {note && <p className="dialog-reply-note">🐣 {note}</p>}
      <div className="dialog-reply-row">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Responde aquí o hablando: «sí», «no»…"
          aria-label="Responder a Pepa"
          autoComplete="off"
        />
        <button type="submit" disabled={sending || !text.trim()}>
          Enviar
        </button>
      </div>
    </form>
  )
}
