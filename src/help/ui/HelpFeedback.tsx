import { useState } from 'react'
import { recordHelpFeedback } from '@/help/feedback'

// «¿Te ha servido?»: dos botones, sin texto libre. Solo se cuenta un sí o un no por ficha (ver src/help/feedback.ts).
export function HelpFeedback({ cardId }: { cardId: string }) {
  const [done, setDone] = useState(false)
  if (done) return <p className="help-feedback help-feedback-done" role="status">¡Gracias! Nos ayuda a mejorar la Ayuda.</p>
  const send = (useful: boolean) => {
    setDone(true)
    void recordHelpFeedback(cardId, useful)
  }
  return (
    <div className="help-feedback" role="group" aria-label="¿Te ha servido?">
      <span>¿Te ha servido?</span>
      <button type="button" className="help-btn" onClick={() => send(true)}>
        👍 Sí
      </button>
      <button type="button" className="help-btn" onClick={() => send(false)}>
        👎 No
      </button>
    </div>
  )
}
