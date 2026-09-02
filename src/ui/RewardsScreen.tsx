import { FormEvent, useEffect, useMemo, useState } from 'react'
import { createReward, deleteReward, listRedemptions, listRewards, redeemReward } from '@/data/rewards'
import { listEventCompletions } from '@/data/calendar'
import { listFamilyMembers } from '@/data/family'
import { MemberAvatar } from '@/ui/MemberAvatar'
import { ConfirmButton } from '@/ui/ConfirmButton'
import { memberPointsBalance } from '@/domain/rewards'
import type { FamilyMember, Reward, RewardRedemption } from '@/domain/types'
import type { EventCompletion } from '@/data/calendar'

// Antes esto era la pestaña "Tareas" (lista de tareas + recompensas
// juntas). Las tareas ahora son eventos del calendario (petición real:
// "quitamos la pestaña de tarea... lo dejamos todo como evento"), así
// que aquí solo queda lo que de verdad necesita su propio sitio: cuántos
// puntos tiene cada uno (ganados al marcar "Hecho" un evento con puntos)
// y las recompensas que se pueden canjear con ellos.
export function RewardsScreen() {
  const [completions, setCompletions] = useState<EventCompletion[]>([])
  const [rewards, setRewards] = useState<Reward[]>([])
  const [redemptions, setRedemptions] = useState<RewardRedemption[]>([])
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [activeMemberId, setActiveMemberId] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    setLoading(true)
    Promise.all([listEventCompletions(), listRewards(), listRedemptions(), listFamilyMembers()])
      .then(([c, r, red, m]) => {
        setCompletions(c)
        setRewards(r)
        setRedemptions(red)
        setMembers(m)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

  const balance = useMemo(
    () => (activeMemberId === 'all' ? null : memberPointsBalance(activeMemberId, completions, redemptions)),
    [activeMemberId, completions, redemptions],
  )

  async function handleRedeem(reward: Reward) {
    if (activeMemberId === 'all') return
    setError(null)
    try {
      await redeemReward(reward.id, activeMemberId, reward.pointsCost)
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo canjear la recompensa')
    }
  }

  if (loading) return <div className="screen">Cargando puntos…</div>

  return (
    <div className="screen">
      <h1>Puntos y recompensas</h1>
      <p className="muted">
        Se ganan puntos al marcar "Hecho" un evento del calendario que lleve puntos (se pone al crear o editar el
        evento, cuando es de una sola persona).
      </p>
      {error && <p className="error">{error}</p>}

      <div className="filter-row">
        <button
          className={'chip' + (activeMemberId === 'all' ? ' chip-active' : '')}
          onClick={() => setActiveMemberId('all')}
        >
          Todos
        </button>
        {members.map((m) => (
          <button
            key={m.id}
            className={'chip' + (activeMemberId === m.id ? ' chip-active' : '')}
            style={{ borderColor: m.color }}
            onClick={() => setActiveMemberId(m.id)}
          >
            <MemberAvatar member={m} size={18} />
            {m.name}
          </button>
        ))}
      </div>

      {activeMemberId === 'all' ? (
        <p className="muted">Selecciona un miembro para ver sus puntos y poder canjear recompensas.</p>
      ) : (
        <p className="points-badge">⭐ {balance} puntos</p>
      )}

      <h2 className="section-title">Recompensas</h2>
      <div className="event-list">
        {rewards.map((reward) => (
          <div key={reward.id} className="card task-card">
            <div className="task-card-main">
              <strong>{reward.title}</strong>
              <p className="muted">⭐ {reward.pointsCost} puntos</p>
            </div>
            <button
              type="button"
              className="task-toggle"
              disabled={activeMemberId === 'all' || (balance ?? 0) < reward.pointsCost}
              onClick={() => handleRedeem(reward)}
            >
              Canjear
            </button>
            <ConfirmButton onConfirm={() => deleteReward(reward.id).then(reload)} />
          </div>
        ))}
        {rewards.length === 0 && <p className="muted">No hay recompensas todavía.</p>}
      </div>

      <AddRewardForm onAdded={reload} />
    </div>
  )
}

function AddRewardForm({ onAdded }: { onAdded: () => void }) {
  const [title, setTitle] = useState('')
  const [pointsCost, setPointsCost] = useState(20)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createReward({ title, pointsCost })
      setTitle('')
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la recompensa')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      <h2>Nueva recompensa</h2>
      <label>
        Título
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>
      <label>
        Coste en puntos
        <input type="number" min={1} value={pointsCost} onChange={(e) => setPointsCost(Number(e.target.value))} />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Guardando…' : 'Crear recompensa'}
      </button>
    </form>
  )
}
