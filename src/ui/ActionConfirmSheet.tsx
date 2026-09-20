import { useEffect, useRef, useState } from 'react'
import { errorMessage } from '@/domain/errorMessage'
import type { ActionProposal, Selection } from '@/pepa/actions/types'
import { registerDialog } from '@/pepa/dialog'
import { DialogReplyBar } from '@/ui/DialogReplyBar'

// Tarjeta de confirmación de las acciones de Pepa: enseña lo que se va a
// hacer y no escribe NADA hasta que se pulsa el botón de guardar (o, con "Hablar
// con PEPA", hasta que se dice "sí"/"hazlo"/"confirmar" y hay ESTA acción pendiente).
// Sirve para cualquier acción del registro (pepa/actions).
export function ActionConfirmSheet({
  proposal,
  onDone,
  onCancel,
  onReply,
}: {
  proposal: ActionProposal
  onDone: (message: string) => void
  onCancel: () => void
  // Solo "Hablar con PEPA": permite responder a la tarjeta escribiendo o hablando.
  onReply?: (text: string) => Promise<string | null>
}) {
  const [selection, setSelection] = useState<Selection>(proposal.initialSelection)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lockRef = useRef(false)

  const view = proposal.preview(selection)

  function toggleCheck(key: string) {
    setSelection((prev) => ({
      ...prev,
      checked: prev.checked.includes(key) ? prev.checked.filter((k) => k !== key) : [...prev.checked, key],
    }))
  }

  // Confirma con lo que hay elegido ahora mismo. El candado evita dos confirmaciones
  // a la vez (doble toque, o botón + voz).
  async function confirmNow(): Promise<string | null> {
    if (lockRef.current) return null
    lockRef.current = true
    setBusy(true)
    setError(null)
    try {
      const message = await proposal.confirm(selection)
      onDone(message)
      return message
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
      lockRef.current = false
      setBusy(false)
      return null
    }
  }

  // Lo que la voz o el texto pueden hacer es lo mismo que hacen los botones.
  const latest = useRef({ confirmNow, onCancel })
  latest.current = { confirmNow, onCancel }
  const listening = !!onReply
  useEffect(() => {
    if (!listening) return undefined
    return registerDialog(() => ({
      kind: 'action-card',
      confirm: () => latest.current.confirmNow(),
      cancel: () => {
        latest.current.onCancel()
        return 'Vale, no lo guardo.'
      },
    }))
  }, [listening])

  return (
    <div className="modal-overlay action-confirm-overlay" onClick={busy ? undefined : onCancel}>
      <div className="modal-sheet" role="dialog" aria-label={view.title} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 8px' }}>{view.title}</h3>
        {view.lines.map((line) => (
          <p key={line} style={{ margin: '2px 0' }}>
            {line}
          </p>
        ))}

        {view.choices.map((choice) => (
          <div key={choice.id} className="action-confirm-choice">
            <span className="muted">{choice.label}</span>
            <div className="filter-row" role="radiogroup" aria-label={choice.label}>
              {choice.options.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  role="radio"
                  aria-checked={selection.choices[choice.id] === option.key}
                  className={`chip${selection.choices[choice.id] === option.key ? ' chip-active' : ''}`}
                  onClick={() => setSelection((prev) => ({ ...prev, choices: { ...prev.choices, [choice.id]: option.key } }))}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ))}

        {view.checks.length > 0 && (
          <ul className="action-confirm-checks">
            {view.checks.map((check) => (
              <li key={check.key}>
                <label>
                  <input type="checkbox" checked={selection.checked.includes(check.key)} onChange={() => toggleCheck(check.key)} />
                  <span>{check.label}</span>
                  {check.note && <span className="muted"> · {check.note}</span>}
                </label>
              </li>
            ))}
          </ul>
        )}

        {view.warnings.map((warning) => (
          <p key={warning} className="action-confirm-warning">
            ⚠️ {warning}
          </p>
        ))}
        {error && <p className="error">{error}</p>}

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button type="button" onClick={() => void confirmNow()} disabled={busy} style={{ flex: 1 }}>
            {busy ? 'Guardando…' : view.confirmLabel}
          </button>
          <button type="button" className="link-button" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
        </div>
        {onReply && <DialogReplyBar onReply={onReply} />}
      </div>
    </div>
  )
}
