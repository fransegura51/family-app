import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { acceptGroupTransfer, groupsErrorMessage, previewGroupTransfer, type TransferPreview } from '@/data/groups'
import { SectionBreadcrumb } from '@/ui/SectionBreadcrumb'
import { Field } from '@/ui/groups/GroupSheet'
import '@/ui/groups/groups.css'

/** Recibir un grupo copiado por otra persona: se escribe el código, se ve QUÉ llega y se acepta. Hasta aceptar no se recibe nada. */
export function ReceiveGroup() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [preview, setPreview] = useState<TransferPreview | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const look = async () => {
    if (busy) return
    setBusy(true)
    setProblem(null)
    try {
      setPreview(await previewGroupTransfer(code))
    } catch (e) {
      setPreview(null)
      setProblem(groupsErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  const accept = async () => {
    if (busy) return
    setBusy(true)
    try {
      const r = await acceptGroupTransfer(code)
      navigate(`/grupos/${r.groupId}`)
    } catch (e) {
      setProblem(groupsErrorMessage(e))
      setBusy(false)
    }
  }

  return (
    <div className="screen grp-screen">
      <SectionBreadcrumb subsection={[{ label: 'Inicio', to: '/grupos' }, { label: 'Recibir un grupo' }]} />
      <h2 className="grp-title">Recibir un grupo</h2>
      <p className="muted">Otra persona de PEPA te ha pasado un código. Escríbelo para ver qué te llega antes de aceptar.</p>
      <Field label="Código">
        <input
          className="grp-input"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Por ejemplo: K7M2QX9P"
          value={code}
          onChange={(e) => (setCode(e.target.value.toUpperCase()), setPreview(null), setProblem(null))}
          data-help-id="grupos.recibir-codigo"
        />
      </Field>
      {!preview && (
        <div className="form-actions">
          <button type="button" className="primary-button" disabled={busy || code.trim().length < 6} onClick={() => void look()}>
            Ver qué recibo
          </button>
        </div>
      )}
      {preview && (
        <div className="grp-card">
          <p style={{ marginTop: 0 }}>
            <strong>{preview.fromName}</strong> te quiere pasar el grupo <strong>«{preview.groupName}»</strong>:
          </p>
          <ul>
            <li>
              {preview.participants} {preview.participants === 1 ? 'participante' : 'participantes'}
              {preview.includeContacts ? ' (con teléfonos, correos y madre/padre)' : ' (solo nombres)'}
            </li>
            {preview.mode === 'historial' ? (
              <li>
                {preview.funds} {preview.funds === 1 ? 'bote' : 'botes'} como «Gestión anterior»: se pueden consultar pero no modificar
              </li>
            ) : (
              <li>Sin historial de botes</li>
            )}
          </ul>
          <p className="muted">Será una copia tuya, independiente del original. Podrás crear tus propios botes. No se crea ningún ingreso ni gasto en tu Economía.</p>
          <div className="form-actions">
            <button type="button" className="primary-button" disabled={busy} onClick={() => void accept()} data-help-id="grupos.recibir-aceptar">
              Aceptar el grupo
            </button>
            <button type="button" className="link-button" onClick={() => setPreview(null)}>
              No, cancelar
            </button>
          </div>
        </div>
      )}
      {problem && <p className="error">{problem}</p>}
      <p>
        <Link to="/grupos">Volver a Gestión de grupos</Link>
      </p>
    </div>
  )
}
