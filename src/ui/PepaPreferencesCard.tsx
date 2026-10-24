import { useState } from 'react'
import { emitHelpEvent } from '@/help/tours/helpBus'
import { getAutoConfirm, setAutoConfirm } from '@/services/pepaPreferences'

// Preferencias de Pepa para ESTE aparato. Por ahora una: si lo que Pepa prepara (compra, calendario, menú, lugares…) se hace directamente o se enseña
// antes una tarjeta para confirmar (ver services/pepaPreferences.ts y pepa/autoConfirm.ts).
export function PepaPreferencesCard() {
  const [auto, setAuto] = useState(getAutoConfirm())

  return (
    <div className="card member-form">
      <h2>🗣️ Pepa: tarjeta de confirmación</h2>
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }} data-help-id="pepa.auto-confirm">
        <input
          type="checkbox"
          checked={auto}
          onChange={(e) => {
            setAutoConfirm(e.target.checked)
            setAuto(e.target.checked)
            emitHelpEvent('pepa.auto-confirm-changed') // para los tutoriales «Enséñame»: la preferencia YA está guardada
          }}
          style={{ marginTop: 4 }}
        />
        <span>
          <strong>Hacerlo directamente, sin tarjeta</strong>
          <br />
          <span className="muted">
            {auto
              ? 'Cuando le pidas a Pepa «apunta leche» o «dentista el viernes a las cinco», lo hace al momento y te dice que ya está.'
              : 'Cuando le pidas algo a Pepa, te enseña primero una tarjeta para revisarlo y pulsar el botón.'}
          </span>
        </span>
      </label>
      <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
        Es una preferencia personal: cuando la eliges se guarda en tu cuenta y vale en todos tus dispositivos (mientras no la elijas, cada tipo de dispositivo usa su opción habitual). Lo que toca dinero (presupuestos) siempre pide confirmación, y si algo no cuadra (un aviso de duplicado o de horario, o
        falta decidir algo) también te enseña la tarjeta.
      </p>
    </div>
  )
}
