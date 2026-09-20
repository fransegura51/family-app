import { useState } from 'react'
import { errorMessage } from '@/domain/errorMessage'
import type { ActionProposal, Selection } from '@/pepa/actions/types'

// Tarjeta de confirmación de las acciones de Pepa: enseña lo que se va a
// hacer y no escribe NADA hasta que se pulsa el botón de guardar. Sirve para
// cualquier acción del registro (pepa/actions) — hoy las de Cocina; mañana
// las que interprete la IA.
export function ActionConfirmSheet({
  proposal,
  onDone,
  onCancel,
}: {
  proposal: ActionProposal
  onDone: (message: string) => void
  onCancel: () => void
}) {
  const [selection, setSelection] = useState<Selection>(proposal.initialSelection)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const view = proposal.preview(selection)

  function toggleCheck(key: string) {
    setSelection((prev) => ({
      ...prev,
      checked: prev.checked.includes(key) ? prev.checked.filter((k) => k !== key) : [...prev.checked, key],
    }))
  }

  async function handleConfirm() {
    setBusy(true)
    setError(null)
    try {
      onDone(await proposal.confirm(selection))
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
      setBusy(false)
    }
  }

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
          <button type="button" onClick={handleConfirm} disabled={busy} style={{ flex: 1 }}>
            {busy ? 'Guardando…' : view.confirmLabel}
          </button>
          <button type="button" className="link-button" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
