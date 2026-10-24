import { useEffect, useState } from 'react'
import { deleteMyCommunityContent, getMyCommunityProfile } from '@/data/community'
import { CONFIRM_WORD, deleteAccount, type DeletionScope } from '@/data/accountDeletion'
import { supabase } from '@/data/supabaseClient'
import { errorMessage } from '@/domain/errorMessage'
import { disableNativeUpload } from '@/services/nativeUpload'

// «Borrar mi cuenta» (Configuración → Mi cuenta; antes en Familia). Apple exige poder iniciar el borrado desde dentro de la app. Dos opciones:
//   · solo mi cuenta: la familia sigue con todo lo suyo (mi ficha de familiar se queda, sin cuenta; mi ubicación se borra);
//   · toda la familia: se borra TODO (datos, fotos, documentos y los accesos de todas las cuentas). Solo administradoras.
// Siempre hay que escribir BORRAR. La función de servidor lo vuelve a comprobar todo (data/accountDeletion.ts).
// Comunidad: lo que la persona publicó o comentó allí queda como «Usuario eliminado» (sin perfil ni identidad pública); si quiere, puede borrarlo también
// marcando una casilla (solo se ofrece si tiene perfil en Comunidad). El derecho de supresión de contenido concreto se puede pedir además desde Comunidad.
export function DeleteAccountCard({ isAdmin }: { isAdmin: boolean }) {
  const [scope, setScope] = useState<DeletionScope | null>(null)
  const [word, setWord] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasCommunity, setHasCommunity] = useState(false)
  const [eraseCommunity, setEraseCommunity] = useState(false)

  useEffect(() => {
    if (!scope) return
    let cancelled = false
    getMyCommunityProfile().then(
      (p) => {
        if (!cancelled) setHasCommunity(p?.hasProfile === true)
      },
      () => undefined,
    )
    return () => {
      cancelled = true
    }
  }, [scope])

  async function confirm() {
    if (!scope || word !== CONFIRM_WORD || busy) return
    setBusy(true)
    setError(null)
    try {
      // Antes de borrar el acceso (después ya no hay sesión): si lo pidió, se borran sus publicaciones y comentarios de Comunidad.
      if (eraseCommunity && hasCommunity) await deleteMyCommunityContent()
      await deleteAccount(scope)
      // Ya no existe el acceso: se apaga el envío de ubicación del móvil y se cierra la sesión solo en este aparato.
      await disableNativeUpload()
      await supabase.auth.signOut({ scope: 'local' })
    } catch (err) {
      setError(errorMessage(err, 'No he podido borrar la cuenta.'))
      setBusy(false)
    }
  }

  return (
    <div className="card member-form" style={{ marginTop: 16 }} data-help-id="cuenta.borrar-tarjeta">
      <h2>🗑️ Borrar mi cuenta</h2>
      <p className="muted">Puedes borrar tu cuenta cuando quieras. No se puede deshacer.</p>
      {!scope && (
        <div className="inline-fields" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="link-button" onClick={() => setScope('me')} data-help-id="cuenta.borrar-solo-yo">
            Borrar solo mi cuenta
          </button>
          {isAdmin && (
            <button type="button" className="link-button" onClick={() => setScope('family')}>
              Borrar toda la familia
            </button>
          )}
        </div>
      )}
      {scope && (
        <>
          <p>
            {scope === 'me'
              ? 'Se borra tu acceso, tu perfil, tus avisos y tu ubicación. La familia sigue con todo lo suyo (tu ficha de familiar se queda, sin cuenta).'
              : 'Se borra TODO: los datos de la familia, sus fotos y documentos, y el acceso de todas las cuentas. Nadie podrá recuperarlo.'}
          </p>
          {hasCommunity && (
            <label className="checkbox-label">
              <input type="checkbox" checked={eraseCommunity} onChange={(e) => setEraseCommunity(e.target.checked)} disabled={busy} />
              También borrar mis publicaciones y comentarios de Comunidad. Si no lo marcas, se quedarán como «Usuario eliminado», sin perfil ni identidad.
            </label>
          )}
          <label>
            Escribe {CONFIRM_WORD} para confirmar
            <input value={word} onChange={(e) => setWord(e.target.value)} autoCapitalize="characters" autoComplete="off" disabled={busy} />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="inline-fields">
            <button type="button" onClick={() => void confirm()} disabled={busy || word !== CONFIRM_WORD}>
              {busy ? 'Borrando…' : scope === 'me' ? 'Borrar mi cuenta' : 'Borrar toda la familia'}
            </button>
            <button
              type="button"
              className="link-button"
              disabled={busy}
              onClick={() => {
                setScope(null)
                setWord('')
                setError(null)
              }}
            >
              Cancelar
            </button>
          </div>
        </>
      )}
    </div>
  )
}
