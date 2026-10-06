import { useState } from 'react'
import { saveEventMenuPersonAlternative } from '@/data/events'
import { errorMessage } from '@/domain/errorMessage'
import { FOOD_SAFETY_DISCLAIMER } from '@/domain/eventDietaryNeeds'
import { REVIEW_STATUS_LABELS, alternativeConflicts, type PersonConflictRow } from '@/domain/eventMenuHub'
import { DIETARY_CATEGORIES } from '@/domain/eventDietaryNeeds'
import type { EventMenuPersonAlternative, EventMenuReviewStatus } from '@/domain/types'
import { ConfirmButton } from '@/ui/ConfirmButton'

const REVIEW_STATUS_KEYS = Object.keys(REVIEW_STATUS_LABELS) as EventMenuReviewStatus[]

// Desglose de los conflictos de UN plato por comensal. La alternativa es de esa persona; el plato general no cambia.
// Ningún texto de aquí afirma que algo sea seguro: solo avisos para revisar.
export function PersonAlternativesPanel({
  eventId,
  rows,
  alternatives,
  onChanged,
}: {
  eventId: string
  rows: PersonConflictRow[]
  alternatives: EventMenuPersonAlternative[]
  onChanged: () => void
}) {
  if (rows.length === 0) return null
  return (
    <details className="menu-person-alternatives">
      <summary>Gestionar por persona ({rows.length})</summary>
      <p className="muted" style={{ fontSize: 12 }}>
        {FOOD_SAFETY_DISCLAIMER}
      </p>
      {rows.map((row) => (
        <PersonAlternativeRow key={row.needId} eventId={eventId} row={row} alt={alternatives.find((a) => a.needId === row.needId) ?? null} onChanged={onChanged} />
      ))}
    </details>
  )
}

function PersonAlternativeRow({
  eventId,
  row,
  alt,
  onChanged,
}: {
  eventId: string
  row: PersonConflictRow
  alt: EventMenuPersonAlternative | null
  onChanged: () => void
}) {
  const [draft, setDraft] = useState(alt?.alternativeText ?? '')
  const [error, setError] = useState<string | null>(null)
  const status: EventMenuReviewStatus = alt?.reviewStatus ?? 'pendiente'
  const savedText = alt?.alternativeText ?? null
  // Avisos sobre el TEXTO GUARDADO de la alternativa, contra las necesidades de ESA persona.
  const altWarnings = savedText ? alternativeConflicts(savedText, row.personNeeds) : []

  async function save(state: { alternativeText: string | null; reviewStatus: EventMenuReviewStatus }) {
    setError(null)
    try {
      await saveEventMenuPersonAlternative(eventId, row.dishId, row.needId, state)
      onChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar la alternativa'))
    }
  }

  function saveAlternative() {
    const text = draft.trim()
    if (!text) {
      void removeAlternative()
      return
    }
    // Escribir una alternativa la deja «prevista», salvo que ya tuviera un estado de confirmación.
    void save({ alternativeText: text, reviewStatus: status === 'pendiente' ? 'alternativa_prevista' : status })
  }

  function removeAlternative() {
    setDraft('')
    return save({ alternativeText: null, reviewStatus: status === 'alternativa_prevista' ? 'pendiente' : status })
  }

  return (
    <div className="menu-person-row" style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
      <div style={{ fontSize: 13 }}>
        <strong>{row.personLabel}</strong>
        <span className="muted"> · {row.detail}</span>
      </div>
      <label style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
        Estado de revisión
        <select value={status} onChange={(e) => void save({ alternativeText: savedText, reviewStatus: e.target.value as EventMenuReviewStatus })} aria-label={`Estado de revisión de ${row.personLabel}`}>
          {REVIEW_STATUS_KEYS.map((k) => (
            <option key={k} value={k}>
              {REVIEW_STATUS_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      <div className="inline-fields" style={{ marginTop: 4 }}>
        <input
          type="text"
          value={draft}
          placeholder={`Alternativa para ${row.personLabel} (opcional)`}
          onChange={(e) => setDraft(e.target.value)}
          aria-label={`Alternativa para ${row.personLabel}`}
        />
        <button type="button" onClick={saveAlternative} disabled={draft.trim() === (savedText ?? '')}>
          {savedText ? 'Guardar alternativa' : 'Añadir alternativa'}
        </button>
        {savedText && <ConfirmButton label="Quitar alternativa" confirmLabel="Confirmar" onConfirm={() => void removeAlternative()} />}
      </div>
      {savedText && altWarnings.length > 0 && (
        <p className="menu-conflict" style={{ fontSize: 12, marginTop: 4 }}>
          ⚠️ La alternativa puede entrar en conflicto con una necesidad de {row.personLabel}: {altWarnings.map((w) => DIETARY_CATEGORIES[w.category].label).join(', ')}. Revísala con quien prepara la comida.
        </p>
      )}
      {savedText && altWarnings.length === 0 && (
        <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          PEPA no ve avisos en el texto de esta alternativa. Confírmala igualmente con la persona y con quien prepara la comida.
        </p>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
