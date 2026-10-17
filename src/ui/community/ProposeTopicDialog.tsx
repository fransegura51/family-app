import { useState, type FormEvent } from 'react'
import { proposeTopic } from '@/data/community'
import { communityErrorText } from '@/domain/communityErrors'
import { useCommunity } from '@/ui/community/CommunityProvider'
import { useCommunityTopics } from '@/ui/community/useCommunityTopics'
import { useDialogFocus } from '@/ui/community/useDialogFocus'

// «💡 Propón un tema»: una idea de artículo que te interesaría leer. Formulario mínimo (categoría + tema). Las propuestas llegan al Centro de Mando para revisión editorial y NO
// se publican solas: la administración las agrupa para ver los temas más pedidos y decide cuáles convertir en borrador. Es distinto del buzón de sugerencias de mejoras de la
// aplicación. Sin votaciones ni listas públicas.
export const TOPIC_MIN = 8
export const TOPIC_MAX = 200

export function ProposeTopicButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <p className="community-propose-topic">
        <button type="button" className="link-button" onClick={() => setOpen(true)}>
          💡 Propón un tema
        </button>
      </p>
      {open && <ProposeTopicDialog onClose={() => setOpen(false)} />}
    </>
  )
}

export function ProposeTopicDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useDialogFocus<HTMLDivElement>()
  const topics = useCommunityTopics()
  const { requireParticipation } = useCommunity()
  const [topic, setTopic] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const valid = topic !== '' && text.trim().length >= TOPIC_MIN

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    try {
      if (!(await requireParticipation())) return
      await proposeTopic(topic, text.trim())
      setDone(true)
    } catch (err) {
      setError(communityErrorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div ref={dialogRef} className="modal-sheet community-touch-scope" role="dialog" aria-modal="true" aria-label="Propón un tema" onClick={(e) => e.stopPropagation()}>
        <h2>💡 Propón un tema</h2>
        {done ? (
          <>
            <p role="status">¡Gracias! Hemos recibido tu idea. La revisa el equipo antes de decidir si escribir un artículo: no se publica nada automáticamente.</p>
            <div className="modal-actions">
              <button type="button" className="primary" onClick={onClose}>
                Cerrar
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={(e) => void submit(e)}>
            <p className="muted">¿Sobre qué te gustaría leer un artículo? Cuéntanoslo en una frase. Es distinto del buzón de sugerencias para mejorar la aplicación.</p>
            <label htmlFor="propose-topic-category">Categoría</label>
            <select id="propose-topic-category" value={topic} onChange={(e) => setTopic(e.target.value)}>
              <option value="">Elige una categoría…</option>
              {(topics ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <label htmlFor="propose-topic-text">Tema que propones</label>
            <input id="propose-topic-text" type="text" value={text} maxLength={TOPIC_MAX} placeholder="Por ejemplo: cómo organizar la compra de la semana" onChange={(e) => setText(e.target.value)} />
            <p className="muted" style={{ fontSize: 13 }}>
              Entre {TOPIC_MIN} y {TOPIC_MAX} letras. Máximo 5 propuestas al día.
            </p>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button type="submit" className="primary" disabled={!valid || busy}>
                {busy ? 'Enviando…' : 'Enviar propuesta'}
              </button>
              <button type="button" className="link-button" onClick={onClose}>
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
