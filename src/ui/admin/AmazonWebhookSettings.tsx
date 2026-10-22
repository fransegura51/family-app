import { useEffect, useState } from 'react'
import { getAmazonWebhookToken, regenerateAmazonWebhookToken } from '@/data/family'
import { errorMessage } from '@/domain/errorMessage'
import { ConfirmButton } from '@/ui/ConfirmButton'

// Movida tal cual desde FamilyScreen.tsx (reorganización "Familia / Panel de admin") — mismos webhooks,
// mismo token, mismos botones "Copiar URL"/"Regenerar token", ninguna reimplementación. Antes vivía detrás
// de isAdmin (el admin de CADA familia, p. ej. Fran en "Familia prueba" también la veía); ahora vive en el
// área «Sistema» del Centro de Administración, detrás de AdminGate (am_i_app_owner, preguntado al servidor),
// así que una familia normal no llega aquí ni escribiendo /administracion a mano. Sigue operando sobre la familia de quien la ve (current_family_id() en la
// RPC/consulta, no cambia): para Jennifer/Paco, sigue siendo exactamente la automatización de su propia
// familia, ahora reubicada en vez de reimplementada.
//
// Muestra las URLs + el token secreto que hay que poner en los
// workflows de Pipedream (ver conversación con el usuario) para que los
// pedidos de Amazon, los tickets de Mercadona y los correos con
// eventos reenviados por Outlook lleguen aquí solos — mismo token para
// las tres automatizaciones, es el mismo mecanismo (identificar a la
// familia sin un login de verdad). "Regenerar" invalida el token
// anterior — útil si se ha compartido por error (rompe las TRES
// automatizaciones a la vez, hay que actualizar el token en los tres
// workflows de Pipedream si se regenera).
export function AmazonWebhookSettings() {
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  useEffect(() => {
    getAmazonWebhookToken()
      .then(setToken)
      .catch((e: Error) => setError(e.message))
  }, [])

  const base = import.meta.env.VITE_SUPABASE_URL as string
  const amazonUrl = `${base}/functions/v1/amazon-order-webhook`
  const mercadonaUrl = `${base}/functions/v1/mercadona-ticket-webhook`
  const eventEmailUrl = `${base}/functions/v1/import-event-email-webhook`

  async function handleRegenerate() {
    setBusy(true)
    setError(null)
    try {
      setToken(await regenerateAmazonWebhookToken())
    } catch (err) {
      setError(errorMessage(err, 'No se pudo regenerar el token'))
    } finally {
      setBusy(false)
    }
  }

  async function handleCopy(field: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 1500)
    } catch {
      // Sin permiso de portapapeles: el texto ya está visible para copiar a mano.
    }
  }

  return (
    <div className="card" style={{ marginTop: 8 }}>
      <p className="muted" style={{ marginTop: 0 }}>
        Datos para los workflows de Pipedream que reciben, reenviados desde Outlook, los pedidos de
        Amazon, los tickets digitales de Mercadona y correos con eventos (boletines del colegio,
        confirmaciones de citas...) para crearlos solos en el Calendario.
      </p>
      {error && <p className="error">{error}</p>}
      {token && (
        <>
          <label>
            URL del webhook — Amazon
            <input type="text" readOnly value={amazonUrl} onFocus={(e) => e.target.select()} />
          </label>
          <button type="button" className="link-button" onClick={() => handleCopy('amazon', amazonUrl)}>
            {copiedField === 'amazon' ? '✓ Copiado' : 'Copiar URL'}
          </button>
          <label style={{ marginTop: 8, display: 'block' }}>
            URL del webhook — Mercadona
            <input type="text" readOnly value={mercadonaUrl} onFocus={(e) => e.target.select()} />
          </label>
          <button type="button" className="link-button" onClick={() => handleCopy('mercadona', mercadonaUrl)}>
            {copiedField === 'mercadona' ? '✓ Copiado' : 'Copiar URL'}
          </button>
          <label style={{ marginTop: 8, display: 'block' }}>
            URL del webhook — Eventos por correo (Calendario)
            <input type="text" readOnly value={eventEmailUrl} onFocus={(e) => e.target.select()} />
          </label>
          <button type="button" className="link-button" onClick={() => handleCopy('eventEmail', eventEmailUrl)}>
            {copiedField === 'eventEmail' ? '✓ Copiado' : 'Copiar URL'}
          </button>
          <label style={{ marginTop: 8, display: 'block' }}>
            Token de la familia (el mismo para las tres)
            <input type="text" readOnly value={token} onFocus={(e) => e.target.select()} />
          </label>
          <button type="button" className="link-button" onClick={() => handleCopy('token', token)}>
            {copiedField === 'token' ? '✓ Copiado' : 'Copiar token'}
          </button>
          <div style={{ marginTop: 8 }}>
            <ConfirmButton label={busy ? 'Regenerando…' : 'Regenerar token'} onConfirm={handleRegenerate} />
          </div>
        </>
      )}
    </div>
  )
}
