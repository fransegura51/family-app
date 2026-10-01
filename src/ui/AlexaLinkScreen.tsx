import { useState } from 'react'
import type { AlexaLinkParams } from '@/App'
import { mintAlexaAuthCode } from '@/data/alexaLink'
import { errorMessage } from '@/domain/errorMessage'
import type { Profile } from '@/domain/types'

// Pantalla de consentimiento del account linking de Alexa — petición real: "¿Se puede integrar la
// app de Pepa con Alexa?... que cuando la vendamos, la familia se puedan conectar con Alexa si lo
// quieren". A esto se llega SOLO desde el navegador embebido de la app de Alexa (ver App.tsx,
// alexaLinkParamsFromLocation) — nunca navegando dentro de la propia app.
export function AlexaLinkScreen({ params, profile }: { params: AlexaLinkParams; profile: Profile }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const redirectUri = params.redirectUri
  // Único control posible aquí: ese valor llega como parámetro externo (lo manda quien abrió el
  // enlace) — Alexa de verdad siempre da una URL https de Amazon, nunca vacía.
  const redirectValid = !!redirectUri && redirectUri.startsWith('https://')

  function goBackToAlexa(extra: Record<string, string>) {
    if (!redirectUri) return
    const url = new URL(redirectUri)
    for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value)
    if (params.state) url.searchParams.set('state', params.state)
    window.location.href = url.toString()
  }

  async function handleAllow() {
    setBusy(true)
    setError(null)
    try {
      const code = await mintAlexaAuthCode()
      goBackToAlexa({ code })
    } catch (err) {
      setError(errorMessage(err, 'No se ha podido preparar la conexión con Alexa'))
      setBusy(false)
    }
  }

  function handleCancel() {
    goBackToAlexa({ error: 'access_denied' })
  }

  if (!redirectValid) {
    return (
      <div className="screen screen-centered">
        <h1>Family App</h1>
        <div className="card">
          <p className="error">Este enlace para conectar Alexa no es válido. Vuelve a intentarlo desde la app de Alexa.</p>
        </div>
      </div>
    )
  }

  if (profile.role !== 'admin') {
    return (
      <div className="screen screen-centered">
        <h1>Family App</h1>
        <div className="card">
          <p>Solo un administrador de la familia puede conectar Alexa. Pide a quien administre la cuenta que entre y lo haga.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="screen screen-centered">
      <h1>Family App</h1>
      <div className="card">
        <h2>Conectar con Alexa</h2>
        <p className="muted">
          Amazon Alexa podrá contestar, por voz, preguntas de lectura: la lista de la compra, la agenda de hoy, el
          menú de hoy y el tiempo en un sitio. No podrá añadir ni cambiar nada.
        </p>
        {error && <p className="error">{error}</p>}
        <div className="inline-fields">
          <button type="button" onClick={handleAllow} disabled={busy}>
            {busy ? 'Preparando…' : 'Permitir'}
          </button>
          <button type="button" className="link-button" onClick={handleCancel} disabled={busy}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
