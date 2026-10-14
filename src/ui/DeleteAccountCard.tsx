import { useState } from 'react'
import { CONFIRM_WORD, deleteAccount, type DeletionScope } from '@/data/accountDeletion'
import { supabase } from '@/data/supabaseClient'
import { errorMessage } from '@/domain/errorMessage'
import { disableNativeUpload } from '@/services/nativeUpload'

// «Borrar mi cuenta» (Familia). Apple exige poder iniciar el borrado desde dentro de la app. Dos opciones:
//   · solo mi cuenta: la familia sigue con todo lo suyo (mi ficha de familiar se queda, sin cuenta; mi ubicación se borra);
//   · toda la familia: se borra TODO (datos, fotos, documentos y los accesos de todas las cuentas). Solo administradoras.
// Siempre hay que escribir BORRAR. La función de servidor lo vuelve a comprobar todo (data/accountDeletion.ts).
export function DeleteAccountCard({ isAdmin }: { isAdmin: boolean }) {
  const [scope, setScope] = useState<DeletionScope | null>(null)
  const [word, setWord] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    if (!scope || word !== CONFIRM_WORD || busy) return
    setBusy(true)
    setError(null)
    try {
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
    <div className="card member-form" style={{ marginTop: 16 }}>
      <h2>🗑️ Borrar mi cuenta</h2>
      <p className="muted">Puedes borrar tu cuenta cuando quieras. No se puede deshacer.</p>
      {!scope && (
        <div className="inline-fields" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="link-button" onClick={() => setScope('me')}>
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
