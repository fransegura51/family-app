// Historial de «Dar puntos» con corregir / anular (Pequeños Grandes → Puntos y recompensas → Historial de cada
// niño/a). Una concesión es el movimiento original y NUNCA se edita ni se borra: corregirla o anularla añade una
// fila nueva (migración 0309, RPC adjust_point_grant) con fecha, responsable y motivo opcional. Esta pantalla solo
// enseña las opciones a los adultos y explica el efecto; quien de verdad lo impide a los demás (niños, otra
// familia, doble anulación, saldo negativo) es el servidor.
import { FormEvent, useState } from 'react'
import { adjustPointGrant } from '@/data/rewards'
import { adjustmentWouldMakeBalanceNegative, canAdjustGrant, grantEffectiveAmount, grantStatus } from '@/domain/rewards'
import type { FamilyMember, PointGrant } from '@/domain/types'

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n)
}

function pointsWord(n: number): string {
  return Math.abs(n) === 1 ? 'punto' : 'puntos'
}

export function GrantHistoryItem({
  grant,
  memberGrants,
  members,
  memberName,
  balance,
  isAdult,
  onChanged,
}: {
  grant: PointGrant
  /** Todos los movimientos de este niño/a (para calcular lo vigente de cada concesión). */
  memberGrants: PointGrant[]
  members: FamilyMember[]
  memberName: string
  /** Saldo disponible actual (solo para avisar antes de enviar; el servidor lo vuelve a comprobar). */
  balance: number
  isAdult: boolean
  onChanged: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [mode, setMode] = useState<'corregir' | 'anular' | null>(null)
  const responsible = members.find((m) => m.linkedProfileId && m.linkedProfileId === grant.grantedBy)?.name ?? null
  const meta = [formatDate(grant.createdAt), responsible ? `por ${responsible}` : null].filter(Boolean).join(' · ')

  // Filas de corrección / anulación: se ven como lo que son, sin ninguna acción propia.
  if (grant.kind !== 'concesion') {
    return (
      <li>
        {grant.kind === 'anulacion' ? '🚫 Anulación' : '✏️ Corrección'} ⭐ {signed(grant.amount)}
        {grant.reason ? ` · ${grant.reason}` : ''}
        <span className="muted"> · {meta}</span>
      </li>
    )
  }

  const status = grantStatus(grant, memberGrants)
  const effective = grantEffectiveAmount(grant, memberGrants)
  const adjustable = isAdult && canAdjustGrant(grant, memberGrants)

  return (
    <li>
      <span style={status === 'anulada' ? { textDecoration: 'line-through', opacity: 0.7 } : undefined}>
        ⭐ {signed(grant.amount)}
        {grant.reason ? ` · ${grant.reason}` : ''}
      </span>
      <span className="muted">
        {status === 'corregida' && ` · ✏️ corregida: ahora ${signed(effective)}`}
        {status === 'anulada' && ' · 🚫 anulada'}
        {meta ? ` · ${meta}` : ''}
      </span>
      {adjustable && (
        <button
          type="button"
          className="member-row-more"
          aria-label={`Opciones de la concesión de ${signed(grant.amount)} puntos`}
          aria-expanded={menuOpen}
          style={{ marginLeft: 4 }}
          onClick={() => {
            setMenuOpen((v) => !v)
            setMode(null)
          }}
        >
          ⋯
        </button>
      )}
      {adjustable && menuOpen && mode === null && (
        <div className="member-row-actions">
          <button type="button" className="link-button" onClick={() => setMode('corregir')}>
            ✏️ Corregir puntos
          </button>
          <button type="button" className="link-button" onClick={() => setMode('anular')}>
            🚫 Anular concesión
          </button>
        </div>
      )}
      {adjustable && mode && (
        <AdjustGrantForm
          grant={grant}
          effective={effective}
          mode={mode}
          memberName={memberName}
          balance={balance}
          onClose={() => {
            setMode(null)
            setMenuOpen(false)
          }}
          onDone={onChanged}
        />
      )}
    </li>
  )
}

function AdjustGrantForm({
  grant,
  effective,
  mode,
  memberName,
  balance,
  onClose,
  onDone,
}: {
  grant: PointGrant
  effective: number
  mode: 'corregir' | 'anular'
  memberName: string
  balance: number
  onClose: () => void
  onDone: () => void
}) {
  const [amount, setAmount] = useState(String(effective))
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsed = Number(amount)
  const validAmount = Number.isInteger(parsed) && parsed >= 1 && parsed <= 10000
  const delta = mode === 'anular' ? -effective : validAmount ? parsed - effective : 0
  const blocked = adjustmentWouldMakeBalanceNegative(balance, delta)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    if (mode === 'corregir' && (!validAmount || parsed === effective)) return
    if (blocked) {
      setError(`${memberName} ya ha usado o reservado esos puntos en recompensas: su saldo quedaría en negativo. Si el canje sigue pendiente, recházalo primero.`)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await adjustPointGrant(grant.id, mode === 'anular' ? { action: 'anular' } : { action: 'corregir', newAmount: parsed }, reason)
      onDone()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el cambio.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="card" style={{ padding: 8, margin: '4px 0' }} onSubmit={(e) => void submit(e)}>
      {mode === 'corregir' ? (
        <>
          <label style={{ fontSize: 12 }}>
            Cantidad correcta (ahora {signed(effective)})
            <input type="number" inputMode="numeric" min={1} max={10000} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: '100%' }} />
          </label>
          {validAmount && parsed !== effective && (
            <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
              {delta < 0
                ? `Se descontarán ${-delta} ${pointsWord(delta)} a ${memberName}.`
                : `Se sumarán ${delta} ${pointsWord(delta)} a ${memberName}.`}
            </p>
          )}
        </>
      ) : (
        <p style={{ fontSize: 13, margin: 0 }}>
          Se descontarán <strong>{effective} {pointsWord(effective)}</strong> a {memberName}. El movimiento original se conserva en el historial.
        </p>
      )}
      <label style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
        Motivo (opcional)
        <input type="text" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej.: me equivoqué de niño/a" style={{ width: '100%' }} />
      </label>
      {blocked && (
        <p className="error" style={{ fontSize: 12, margin: '4px 0 0' }}>
          {memberName} ya ha usado o reservado esos puntos en recompensas: su saldo quedaría en negativo.
        </p>
      )}
      {error && !blocked && <p className="error" style={{ fontSize: 12, margin: '4px 0 0' }}>{error}</p>}
      <div className="filter-row" style={{ marginTop: 6 }}>
        <button type="submit" className="task-toggle" disabled={saving || blocked || (mode === 'corregir' && (!validAmount || parsed === effective))}>
          {saving ? 'Guardando…' : mode === 'anular' ? 'Sí, anular' : 'Guardar corrección'}
        </button>
        <button type="button" className="link-button" disabled={saving} onClick={onClose}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
