// «Comida y bebida» → al volver a marcar un momento que ya tiene un independiente con su procedencia, PEPA no
// decide: explica y pregunta. Un candidato → tres salidas; varios → se elige cuál recuperar (nunca se escoge solo).
// Cancelar no guarda nada (el diálogo se abre ANTES de persistir la selección), así que el momento sigue desmarcado.
import { useState } from 'react'
import { timeKey } from '@/domain/eventDayPlan'
import type { MomentRecoveryPrompt } from '@/domain/eventFood'
import type { EventDayPlanItem } from '@/domain/types'

function describeCandidate(item: EventDayPlanItem): string {
  return `${item.title} · ${timeKey(item.itemTime) ?? 'Sin hora'}`
}

export function RecoverMomentDialog({
  prompt,
  onRecover,
  onCreate,
  onCancel,
}: {
  prompt: MomentRecoveryPrompt
  onRecover: (itemId: string) => Promise<void>
  onCreate: () => Promise<void>
  onCancel: () => void
}) {
  // Un solo toque cuenta: mientras se resuelve, los botones quedan bloqueados (evita el doble guardado).
  const [busy, setBusy] = useState(false)
  const many = prompt.candidates.length > 1

  async function run(action: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    await action()
  }

  return (
    <div className="modal-overlay" onClick={busy ? undefined : onCancel}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            {prompt.label}
          </h2>
          <button type="button" className="modal-close" onClick={onCancel} disabled={busy} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="card member-form">
          {many ? (
            <>
              <p style={{ margin: 0 }}>Hay varios momentos que anteriormente estuvieron vinculados a «{prompt.label}».</p>
              <p style={{ margin: 0 }}>¿Cuál quieres recuperar?</p>
              {prompt.candidates.map((c) => (
                <button key={c.id} type="button" disabled={busy} onClick={() => void run(() => onRecover(c.id))}>
                  {describeCandidate(c)}
                </button>
              ))}
            </>
          ) : (
            <>
              <p style={{ margin: 0 }}>Ya hay un momento que anteriormente estaba vinculado a «{prompt.label}»:</p>
              <p style={{ margin: 0, fontWeight: 600 }}>{describeCandidate(prompt.candidates[0])}</p>
              <p style={{ margin: 0 }}>¿Qué quieres hacer?</p>
              <button type="button" disabled={busy} onClick={() => void run(() => onRecover(prompt.candidates[0].id))}>
                Recuperar el vínculo con «{prompt.candidates[0].title}»
              </button>
              <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                Se queda tal cual: mismo nombre, hora, nota y orden. No se crea otro momento.
              </p>
            </>
          )}
          <button type="button" disabled={busy} onClick={() => void run(onCreate)}>
            Crear un nuevo momento «{prompt.label}»
          </button>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            {many ? 'Los anteriores siguen como independientes.' : `«${prompt.candidates[0].title}» sigue como independiente y se crea otro nuevo.`}
          </p>
          <button type="button" className="link-button" disabled={busy} onClick={onCancel}>
            Cancelar
          </button>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            Cancelar no cambia nada: «{prompt.label}» sigue sin marcar.
          </p>
        </div>
      </div>
    </div>
  )
}
