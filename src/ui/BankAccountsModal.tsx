import { useEffect, useState } from 'react'
import {
  disconnectBank,
  listAspsps,
  listBankAccounts,
  listBankConnections,
  setBankAccountOwner,
  startBankConnection,
  type Aspsp,
} from '@/data/bank'
import { listFamilyMembers } from '@/data/family'
import type { BankAccount, BankConnection, FamilyMember } from '@/domain/types'
import { ConfirmButton } from '@/ui/ConfirmButton'
import { errorMessage } from '@/domain/errorMessage'

// Petición real: "Esta parte de las cuentas quiero que la pongas en una
// página emergente accesible desde el menú arriba con Configuración
// cuentas" — antes vivía mezclada dentro de Economía → Banco junto con
// la lista de movimientos del día a día. Se abre igual desde ahí (botón
// "⚙️ Gestionar cuentas") y desde Configuración, siempre el mismo
// componente para no duplicar la lógica de conectar/desconectar/asignar.
export function BankAccountsModal({ onClose }: { onClose: () => void }) {
  const [connections, setConnections] = useState<BankConnection[]>([])
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [showConnect, setShowConnect] = useState(false)

  function reload() {
    Promise.all([listBankConnections(), listBankAccounts(), listFamilyMembers()])
      .then(([c, a, m]) => {
        setConnections(c)
        setAccounts(a)
        setMembers(m)
      })
      .catch((err) => setError(errorMessage(err, String(err))))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

  const activeConnections = connections.filter((c) => c.status === 'active')

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            🏦 Cuentas bancarias
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        {loading ? (
          <p className="muted">Cargando cuentas bancarias…</p>
        ) : (
          <>
            {error && <p className="error">{error}</p>}

            {/* Petición real: "Cuando llegue la fecha de vencimiento hay
                que reconectar con el banco? Si eso va a ser igual para
                los demás usuarios deberíamos poner una nota explicativa"
                — sí: es normativa PSD2 (Enable Banking fija 90 días en
                cada consentimiento, ver enable-banking-auth-start), pasa
                a toda familia y a cualquier app de banca abierta, no es
                un fallo. La sincronización automática simplemente
                empieza a fallar cuenta a cuenta cuando caduca (el banco
                devuelve error, no hay aviso previo de Enable Banking),
                así que conviene reconectar antes de esa fecha. */}
            <p className="muted" style={{ fontSize: 13 }}>
              Por normativa (PSD2), cada banco pide renovar el permiso cada 90 días — igual para cualquier app de
              banca abierta, no es un fallo. Cuando se acerque la fecha "válido hasta", vuelve aquí y conecta ese
              banco otra vez para que la sincronización no se corte.
            </p>

            {activeConnections.length === 0 ? (
              <p className="muted">
                Todavía no hay ningún banco enlazado. Al enlazar una cuenta, sus movimientos se pueden traer y
                usarlos en Economía junto con los tickets.
              </p>
            ) : (
              activeConnections.map((c) => {
                const connAccounts = accounts.filter((a) => a.connectionId === c.id)
                return (
                  <div key={c.id} className="card event-card" style={{ marginBottom: 8 }}>
                    <strong>🏦 {c.aspspName}</strong>
                    <p className="muted" style={{ margin: '4px 0' }}>
                      {connAccounts.length} {connAccounts.length === 1 ? 'cuenta' : 'cuentas'}
                      {c.validUntil && ` · válido hasta ${c.validUntil.slice(0, 10)}`}
                    </p>
                    {connAccounts.length === 0 && (
                      <p className="error" style={{ margin: '4px 0', fontSize: 13 }}>
                        El banco ha autorizado el acceso pero no ha dicho a qué cuenta. Desconecta esta conexión y
                        vuelve a conectar escribiendo el <strong>IBAN</strong> de la cuenta en el campo opcional
                        (recarga la página antes si no ves ese campo).
                      </p>
                    )}
                    {connAccounts.map((a) => (
                      <div key={a.id} className="inline-fields" style={{ margin: '4px 0', alignItems: 'center' }}>
                        <p className="muted" style={{ margin: 0, fontSize: 13, flex: 1 }}>
                          · {a.name ?? 'Cuenta'} {a.iban ? `(${a.iban})` : ''} {a.currency ?? ''}
                        </p>
                        <select
                          value={a.ownerMemberId ?? ''}
                          onChange={(e) =>
                            setBankAccountOwner(a.id, e.target.value || null).then(() => {
                              reload()
                              window.dispatchEvent(new Event('family-app:bank-changed'))
                            })
                          }
                          style={{ flex: 'none', fontSize: 13 }}
                          aria-label={`De quién es la cuenta ${a.name ?? ''}`}
                        >
                          <option value="">🏠 Común</option>
                          {members.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                    <ConfirmButton
                      label="Desconectar"
                      confirmLabel="¿Seguro?"
                      className="link-button"
                      onConfirm={() =>
                        disconnectBank(c.id).then(() => {
                          reload()
                          window.dispatchEvent(new Event('family-app:bank-changed'))
                        })
                      }
                    />
                  </div>
                )
              })
            )}

            <button type="button" className="link-button" onClick={() => setShowConnect((v) => !v)}>
              {showConnect ? 'Cerrar' : '+ Conectar banco'}
            </button>
            {showConnect && (
              <ConnectBankForm
                connecting={connecting}
                onConnecting={setConnecting}
                onError={(msg) => setError(msg)}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function ConnectBankForm({
  connecting,
  onConnecting,
  onError,
}: {
  connecting: boolean
  onConnecting: (v: boolean) => void
  onError: (msg: string) => void
}) {
  const [country, setCountry] = useState('ES')
  const [aspsps, setAspsps] = useState<Aspsp[]>([])
  const [loadingAspsps, setLoadingAspsps] = useState(false)
  const [selected, setSelected] = useState('')
  const [iban, setIban] = useState('')

  function loadAspsps(c: string) {
    setLoadingAspsps(true)
    setSelected('')
    listAspsps(c)
      .then(setAspsps)
      .catch((err: Error) => onError(err.message))
      .finally(() => setLoadingAspsps(false))
  }

  useEffect(() => loadAspsps(country), []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleConnect() {
    if (!selected) return
    const aspsp = aspsps.find((a) => a.name === selected)
    if (!aspsp) return
    onConnecting(true)
    onError('')
    try {
      await startBankConnection(aspsp.name, aspsp.country, iban)
    } catch (err) {
      onError(errorMessage(err, String(err)))
      onConnecting(false)
    }
  }

  return (
    <div className="card member-form">
      <label>
        País
        <select
          value={country}
          onChange={(e) => {
            setCountry(e.target.value)
            loadAspsps(e.target.value)
          }}
        >
          <option value="ES">España</option>
          <option value="FI">Finlandia</option>
          <option value="FR">Francia</option>
          <option value="DE">Alemania</option>
          <option value="IT">Italia</option>
          <option value="PT">Portugal</option>
        </select>
      </label>
      <label>
        Banco
        {loadingAspsps ? (
          <p className="muted">Cargando bancos…</p>
        ) : (
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Elige un banco</option>
            {aspsps.map((a) => (
              <option key={a.name} value={a.name}>
                {a.name}
              </option>
            ))}
          </select>
        )}
      </label>
      <label>
        IBAN de la cuenta (opcional, recomendado en cajas rurales)
        <input
          type="text"
          value={iban}
          onChange={(e) => setIban(e.target.value)}
          placeholder="ES00 0000 0000 0000 0000 0000"
          autoComplete="off"
          inputMode="text"
        />
      </label>
      <p className="muted" style={{ fontSize: 12, marginTop: -4 }}>
        Algunos bancos (Caja Rural / Ruralvía, entre otros) autorizan el acceso pero no dicen a qué cuenta si no se les
        indica el IBAN. Si al conectar te sale "0 cuentas", vuelve a conectar poniendo aquí el IBAN de la cuenta que
        quieres enlazar.
      </p>
      <p className="muted" style={{ fontSize: 12, marginTop: -4 }}>
        Si en el móvil se queda en "Redirigir a su proveedor de servicios de cuenta" sin avanzar, es que el teléfono
        intenta abrir la app del banco y no vuelve: conéctalo desde un ordenador (la cuenta quedará enlazada igual
        para todos los dispositivos).
      </p>
      <button type="button" onClick={handleConnect} disabled={!selected || connecting}>
        {connecting ? 'Abriendo el banco…' : 'Conectar'}
      </button>
    </div>
  )
}
