import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listFundLinksForBankTx, listOpenFundsAcrossGroups, type FundLink, type IncomingBankTx } from '@/data/groupFunds'
import { fmtEuro, type FundItem } from '@/domain/groupFunds'
import { setNavOrigin } from '@/state/navOrigin'
import { setPendingFundEntry } from '@/state/pendingFundEntry'
import { GroupSheet } from '@/ui/groups/GroupSheet'

// ECO-03 — «Enlazar con bote» en el editor de un movimiento. NO es un sistema nuevo: reutiliza los botes y el formulario de apunte de Gestión de grupos tal cual (mismos participantes,
// saldos, aportaciones y permisos). Si el movimiento ya está enlazado con un bote se enseña y se puede abrir para gestionarlo; si no, se elige el bote y se abre su formulario de
// apunte ya con los datos del movimiento bancario. El enlace lo crea el propio apunte del bote al guardarse: no depende de pulsar «Guardar» en el movimiento.
export function FundLinkSheet({
  bankTx,
  isIncome,
  restoreMovement,
  onClose,
}: {
  bankTx: IncomingBankTx
  isIncome: boolean
  /** Qué restaurar en Economía al volver (movimiento abierto, filtros, búsqueda…). */
  restoreMovement: Record<string, unknown>
  onClose: () => void
}) {
  const navigate = useNavigate()
  const [links, setLinks] = useState<FundLink[] | null>(null)
  const [funds, setFunds] = useState<(FundItem & { groupName: string })[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([listFundLinksForBankTx(bankTx.id), listOpenFundsAcrossGroups()])
      .then(([l, f]) => {
        if (cancelled) return
        setLinks(l)
        setFunds(f)
      })
      .catch(() => !cancelled && setError('No se han podido cargar los botes.'))
    return () => {
      cancelled = true
    }
  }, [bankTx.id])

  function goToFund(groupId: string, fundId: string) {
    // NAV-01: en el bote aparece «← Volver a Economía» y, al volver, el movimiento se reabre en edición.
    setNavOrigin({ to: 'bote', label: 'Economía', path: '/dinero', routeState: { restoreMovement } })
    navigate(`/grupos/${groupId}/bote/${fundId}`)
  }

  return (
    <GroupSheet title="Enlazar con bote" onClose={onClose}>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        {isIncome ? 'Este ingreso se puede registrar como aportación' : 'Este cargo se puede registrar como gasto'} de un bote de Gestión de grupos: {fmtEuro(bankTx.amount)}
        {bankTx.description ? ` · ${bankTx.description}` : ''}.
      </p>
      {error && <p className="error">{error}</p>}
      {!links && !error && <p className="muted">Cargando…</p>}
      {links && links.length > 0 && (
        <div data-testid="fund-links">
          <p style={{ margin: '0 0 4px' }}>
            <strong>Ya enlazado</strong>
          </p>
          {links.map((l) => (
            <p key={l.entryId} style={{ margin: '4px 0' }}>
              🔗 {l.fundName} · {l.kindLabel} {fmtEuro(l.amount)}{' '}
              <button type="button" className="link-button" onClick={() => goToFund(l.groupId, l.fundId)}>
                Gestionar en el bote
              </button>
            </p>
          ))}
        </div>
      )}
      {links && links.length === 0 && funds && (
        <div data-testid="fund-choices">
          {funds.length === 0 ? (
            <p className="muted">No hay botes abiertos. Se crean en Gestión de grupos.</p>
          ) : (
            <>
              <p style={{ margin: '0 0 4px' }}>Elige el bote:</p>
              {funds.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="card"
                  style={{ display: 'block', width: '100%', textAlign: 'left', margin: '4px 0', minHeight: 44 }}
                  onClick={() => {
                    setPendingFundEntry({ fundId: f.id, kind: isIncome ? 'aportacion' : 'gasto', bankTx })
                    goToFund(f.groupId, f.id)
                  }}
                >
                  <strong>{f.name}</strong>
                  <span className="muted"> · {f.groupName}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </GroupSheet>
  )
}
