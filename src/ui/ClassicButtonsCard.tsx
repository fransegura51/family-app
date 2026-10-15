import { useState } from 'react'
import { getShowClassicButtons, setShowClassicButtons } from '@/services/pepaPreferences'

// «Mostrar botones clásicos» en Familia: ticado se ven los cinco botones redondos de siempre; destickado solo queda el 💬 «Hablar con PEPA».
// Es por móvil (cada persona elige el suyo): ver services/pepaPreferences.ts.
export function ClassicButtonsCard() {
  const [show, setShow] = useState(getShowClassicButtons())

  return (
    <div className="card member-form">
      <h2>🔘 Botones de Pepa</h2>
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <input
          type="checkbox"
          checked={show}
          onChange={(e) => {
            setShowClassicButtons(e.target.checked)
            setShow(e.target.checked)
          }}
          style={{ marginTop: 4 }}
        />
        <span>
          <strong>Mostrar botones clásicos</strong>
          <br />
          <span className="muted">
            {show
              ? 'Se ven arriba los botones de siempre: 🐣 Pepa Calendario, 🐣 Pepa Compra, 🎤 Apuntar Calendario, 🎤 Apuntar Compra y 📍 Buscar sitio, además del 💬 Hablar con PEPA.'
              : 'Solo se ve arriba el botón 💬 Hablar con PEPA, que sirve para todo. Para volver a ver los demás, marca esta casilla.'}
          </span>
        </span>
      </label>
      <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>Solo afecta a este móvil: cada persona elige el suyo. Los botones no se borran, solo se esconden.</p>
    </div>
  )
}
