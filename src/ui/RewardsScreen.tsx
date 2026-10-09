import { FormEvent, useEffect, useState } from 'react'
import {
  createReward,
  updateReward,
  deleteReward,
  listRedemptions,
  listRewards,
  requestRewardRedemption,
  decideRewardRedemption,
  markRewardRedemptionEnjoyed,
  listPointGrants,
  givePoints,
} from '@/data/rewards'
import { listEventCompletions } from '@/data/calendar'
import { listFamilyMembers } from '@/data/family'
import { MemberAvatar } from '@/ui/MemberAvatar'
import { ConfirmButton, ConfirmIconButton } from '@/ui/ConfirmButton'
import { CalendarCategoryEmojiPicker } from '@/ui/MenuSettingsScreen'
import { memberPointsBalance } from '@/domain/rewards'
import type { FamilyMember, PointGrant, Profile, Reward, RewardRedemption } from '@/domain/types'
import type { EventCompletion } from '@/data/calendar'
import puntosHeaderImg from '@/assets/puntos/puntos-header.jpg'
import { errorMessage } from '@/domain/errorMessage'
import { SectionBreadcrumb } from '@/ui/SectionBreadcrumb'

// Pequeños Grandes (prompt maestro) — Fase 4: Puntos y recompensas, AMPLIANDO el módulo que ya existía
// (antes: un selector "Todos/miembro" + canje instantáneo). Ahora: una tarjeta por miembro (4.1), un
// canje pasa por pendiente → aprobada/rechazada → disfrutada (4.3, migración 0229 — la reserva de
// puntos sale sola de memberPointsBalance, nunca una columna aparte), y los adultos pueden dar puntos a
// mano con motivo trazable (4.4). La aprobación/rechazo/edición del catálogo está protegida en el
// servidor (RLS, migración 0229) — esto solo oculta botones para que la familia no los vea sin sentido,
// nunca es la única barrera real.
const REDEMPTION_STATUS_LABELS: Record<string, string> = {
  pendiente: '⏳ Pendiente de aprobar',
  aprobada: '✓ Aprobada — pendiente de disfrutar',
  rechazada: '✕ Rechazada',
  disfrutada: '🎉 Disfrutada',
}

export function RewardsScreen({ profile }: { profile: Profile }) {
  const isAdult = profile.role === 'admin' || profile.role === 'adult'
  const [completions, setCompletions] = useState<EventCompletion[]>([])
  const [rewards, setRewards] = useState<Reward[]>([])
  const [redemptions, setRedemptions] = useState<RewardRedemption[]>([])
  const [grants, setGrants] = useState<PointGrant[]>([])
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddReward, setShowAddReward] = useState(false)
  const [editingRewardId, setEditingRewardId] = useState<string | null>(null)

  function reload() {
    setLoading(true)
    Promise.all([listEventCompletions(), listRewards(), listRedemptions(), listFamilyMembers(), listPointGrants()])
      .then(([c, r, red, m, g]) => {
        setCompletions(c)
        setRewards(r)
        setRedemptions(red)
        setMembers(m)
        setGrants(g)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

  if (loading) return <div className="screen">Cargando puntos…</div>

  const activeRewards = rewards.filter((r) => r.active)
  const pendingApprovals = redemptions.filter((r) => r.status === 'pendiente')
  const pendingToEnjoy = redemptions.filter((r) => r.status === 'aprobada')

  return (
    <div className="screen">
      <div className="kitchen-header kitchen-header-wide">
        <img src={puntosHeaderImg} alt="Puntos y recompensas" className="kitchen-header-img" />
      </div>
      <SectionBreadcrumb subsection="Puntos y recompensas" />
      <p className="muted">
        Se ganan puntos al marcar "Hecho" un evento o una tarea del calendario que lleve puntos (se pone al crear o editar, cuando es de una sola persona), o si un adulto te los da directamente.
      </p>
      {error && <p className="error">{error}</p>}

      {isAdult && pendingApprovals.length > 0 && (
        <div className="card" style={{ padding: 8, marginBottom: 8 }}>
          <strong style={{ fontSize: 13 }}>🔔 Solicitudes pendientes de aprobar ({pendingApprovals.length})</strong>
          {pendingApprovals.map((r) => (
            <RedemptionDecisionRow key={r.id} redemption={r} memberName={members.find((m) => m.id === r.memberId)?.name ?? '—'} onChanged={reload} setError={setError} />
          ))}
        </div>
      )}

      {pendingToEnjoy.length > 0 && (
        <div className="card" style={{ padding: 8, marginBottom: 8 }}>
          <strong style={{ fontSize: 13 }}>🎁 Premios pendientes de disfrutar</strong>
          {pendingToEnjoy.map((r) => (
            <div key={r.id} className="inline-fields" style={{ alignItems: 'center', marginTop: 4 }}>
              <span style={{ flex: 1, fontSize: 13 }}>
                {r.rewardEmoji ? `${r.rewardEmoji} ` : ''}
                {r.rewardTitle} · {members.find((m) => m.id === r.memberId)?.name ?? '—'}
              </span>
              {isAdult && (
                <button type="button" className="link-button" onClick={() => markRewardRedemptionEnjoyed(r.id).then(reload).catch((err) => setError(errorMessage(err, 'No se pudo marcar')))}>
                  Marcar como disfrutado
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <h2 className="section-title">Puntos por persona</h2>
      <div className="event-list">
        {members.map((m) => {
          const balance = memberPointsBalance(m.id, completions, redemptions, grants)
          const open = expandedMemberId === m.id
          return (
            <div key={m.id} className="card task-card" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <div className="inline-fields" style={{ alignItems: 'center', cursor: 'pointer' }} onClick={() => setExpandedMemberId(open ? null : m.id)}>
                <MemberAvatar member={m} size={32} />
                <span style={{ flex: 1, fontWeight: 600 }}>{m.name}</span>
                <span className="points-badge">⭐ {balance}</span>
              </div>
              {open && (
                <MemberRewardsPanel
                  member={m}
                  balance={balance}
                  rewards={activeRewards}
                  redemptions={redemptions.filter((r) => r.memberId === m.id)}
                  grants={grants.filter((g) => g.memberId === m.id)}
                  isAdult={isAdult}
                  onChanged={reload}
                  setError={setError}
                />
              )}
            </div>
          )
        })}
        {members.length === 0 && <p className="muted">Todavía no hay miembros en la familia.</p>}
      </div>

      {isAdult && (
        <>
          <h2 className="section-title">Catálogo de recompensas</h2>
          <div className="event-list">
            {rewards.map((reward) =>
              editingRewardId === reward.id ? (
                <EditRewardForm key={reward.id} reward={reward} onDone={() => setEditingRewardId(null)} onSaved={() => { setEditingRewardId(null); reload() }} />
              ) : (
                <div key={reward.id} className="card task-card" style={{ opacity: reward.active ? 1 : 0.6 }}>
                  <div className="task-card-main">
                    <strong>
                      {reward.emoji ? `${reward.emoji} ` : ''}
                      {reward.title}
                    </strong>
                    <p className="muted">
                      ⭐ {reward.pointsCost} puntos{!reward.active ? ' · Desactivada' : ''}
                    </p>
                    {reward.description && <p className="muted" style={{ fontSize: 12 }}>{reward.description}</p>}
                  </div>
                  <button type="button" className="link-button" onClick={() => setEditingRewardId(reward.id)}>
                    ✏️ Editar
                  </button>
                  <ConfirmButton
                    label={reward.active ? '📦 Desactivar' : '♻️ Reactivar'}
                    confirmMessage={
                      reward.active
                        ? `¿Desactivar «${reward.title}»? Deja de poderse solicitar, pero su historial de canjes se conserva.`
                        : `¿Reactivar «${reward.title}»? Volverá a poderse solicitar.`
                    }
                    onConfirm={() => updateReward(reward.id, { active: !reward.active }).then(reload)}
                  />
                  <ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Borrar recompensa" onConfirm={() => deleteReward(reward.id).then(reload)} />
                </div>
              ),
            )}
            {rewards.length === 0 && !showAddReward && <p className="muted">No hay recompensas todavía.</p>}
          </div>
          {showAddReward ? (
            <AddRewardForm onClose={() => setShowAddReward(false)} onAdded={() => { setShowAddReward(false); reload() }} />
          ) : (
            <button type="button" className="link-button" onClick={() => setShowAddReward(true)} style={{ marginTop: 6 }}>
              + Nueva recompensa
            </button>
          )}
        </>
      )}
    </div>
  )
}

// Aprobar/rechazar una solicitud (4.3) — "solo adultos autorizados aprueban o rechazan" (ya forzado en
// el servidor por RLS; aquí solo se oculta el control a quien no lo es). Rechazar usa dos toques
// (ConfirmButton): le quita al niño algo que pidió, aprobar no necesita esa fricción.
function RedemptionDecisionRow({
  redemption,
  memberName,
  onChanged,
  setError,
}: {
  redemption: RewardRedemption
  memberName: string
  onChanged: () => void
  setError: (e: string | null) => void
}) {
  async function decide(status: 'aprobada' | 'rechazada') {
    setError(null)
    try {
      await decideRewardRedemption(redemption.id, status)
      onChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo decidir'))
    }
  }
  return (
    <div className="inline-fields" style={{ alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
      <span style={{ flex: 1, fontSize: 13 }}>
        {redemption.rewardEmoji ? `${redemption.rewardEmoji} ` : ''}
        {redemption.rewardTitle} · {memberName} · ⭐ {redemption.pointsSpent}
      </span>
      <button type="button" className="link-button" onClick={() => void decide('aprobada')}>
        ✓ Aprobar
      </button>
      <ConfirmButton label="✕ Rechazar" confirmMessage={`¿Rechazar esta solicitud de «${redemption.rewardTitle}»? Sus puntos quedarán libres otra vez.`} onConfirm={() => decide('rechazada')} />
    </div>
  )
}

// Panel desplegable de un miembro (4.1) — reunir en un solo sitio: solicitar una recompensa, dar puntos
// a mano (solo adultos) y el historial propio de ese miembro, para no duplicar formularios por toda la
// pantalla.
function MemberRewardsPanel({
  member,
  balance,
  rewards,
  redemptions,
  grants,
  isAdult,
  onChanged,
  setError,
}: {
  member: FamilyMember
  balance: number
  rewards: Reward[]
  redemptions: RewardRedemption[]
  grants: PointGrant[]
  isAdult: boolean
  onChanged: () => void
  setError: (e: string | null) => void
}) {
  const [requestingId, setRequestingId] = useState<string | null>(null)
  const [showGivePoints, setShowGivePoints] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  async function handleRequest(reward: Reward) {
    setRequestingId(reward.id)
    setError(null)
    try {
      await requestRewardRedemption(reward.id, member.id)
      onChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo solicitar la recompensa'))
    } finally {
      setRequestingId(null)
    }
  }

  const history = [...redemptions].sort((a, b) => b.redeemedAt.localeCompare(a.redeemedAt))

  return (
    <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #eee' }}>
      {isAdult && (
        <div className="filter-row" style={{ marginBottom: 6 }}>
          <button type="button" className="link-button" onClick={() => setShowGivePoints((v) => !v)}>
            ⭐ Dar puntos
          </button>
        </div>
      )}
      {showGivePoints && <GivePointsForm member={member} onClose={() => setShowGivePoints(false)} onGiven={onChanged} setError={setError} />}

      {rewards.length === 0 ? (
        <p className="muted" style={{ fontSize: 12 }}>
          Todavía no hay recompensas en el catálogo.
        </p>
      ) : (
        <div className="event-list">
          {rewards.map((reward) => {
            const canAfford = balance >= reward.pointsCost
            return (
              <div key={reward.id} className="card" style={{ padding: 8 }}>
                <div className="inline-fields" style={{ alignItems: 'center' }}>
                  <span style={{ flex: 1 }}>
                    {reward.emoji ? `${reward.emoji} ` : ''}
                    <strong>{reward.title}</strong>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {' '}
                      · ⭐ {reward.pointsCost}
                    </span>
                  </span>
                  <button type="button" className="task-toggle" disabled={!canAfford || requestingId === reward.id} onClick={() => void handleRequest(reward)}>
                    {requestingId === reward.id ? 'Solicitando…' : 'Solicitar'}
                  </button>
                </div>
                {reward.description && (
                  <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>
                    {reward.description}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      <button type="button" className="link-button" onClick={() => setShowHistory((v) => !v)} style={{ marginTop: 6 }}>
        {showHistory ? '▾' : '▸'} Historial
      </button>
      {showHistory && (
        <div style={{ marginTop: 4 }}>
          {history.length === 0 && grants.length === 0 ? (
            <p className="muted" style={{ fontSize: 12 }}>
              Todavía no hay movimientos.
            </p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
              {history.map((r) => (
                <li key={r.id}>
                  {r.rewardEmoji ? `${r.rewardEmoji} ` : ''}
                  {r.rewardTitle} · ⭐ {r.pointsSpent} · {REDEMPTION_STATUS_LABELS[r.status]}
                </li>
              ))}
              {grants.map((g) => (
                <li key={g.id}>
                  ⭐ {g.amount > 0 ? `+${g.amount}` : g.amount} {g.reason ? `· ${g.reason}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// "Dar puntos" manualmente (4.4) — cantidades rápidas + libre, motivo opcional. Solo adultos (RLS); el
// formulario está siempre dentro del panel de UN miembro ya elegido, nunca un selector de miembro aparte.
const QUICK_AMOUNTS = [5, 10, 20, 50]

function GivePointsForm({ member, onClose, onGiven, setError }: { member: FamilyMember; onClose: () => void; onGiven: () => void; setError: (e: string | null) => void }) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(ev: FormEvent) {
    ev.preventDefault()
    const n = Number(amount)
    if (!Number.isFinite(n) || n <= 0) {
      setError('Pon una cantidad mayor que 0.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await givePoints(member.id, Math.round(n), reason.trim() || null)
      setAmount('')
      setReason('')
      onGiven()
      onClose()
    } catch (err) {
      setError(errorMessage(err, 'No se pudieron dar los puntos'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="card member-form" style={{ padding: 8, marginBottom: 6 }} onSubmit={submit}>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Dar puntos a {member.name}
      </p>
      <div className="filter-row" style={{ marginTop: 6 }}>
        {QUICK_AMOUNTS.map((n) => (
          <button key={n} type="button" className={'chip' + (amount === String(n) ? ' chip-active' : '')} onClick={() => setAmount(String(n))}>
            +{n}
          </button>
        ))}
      </div>
      <label style={{ marginTop: 6 }}>
        Cantidad
        <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
      </label>
      <label style={{ marginTop: 6 }}>
        Motivo (opcional)
        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ha ayudado en casa..." />
      </label>
      <div className="filter-row" style={{ marginTop: 8 }}>
        <button type="submit" disabled={saving}>
          {saving ? 'Guardando…' : 'Dar puntos'}
        </button>
        <button type="button" className="link-button" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function RewardFields({
  title,
  setTitle,
  pointsCost,
  setPointsCost,
  emoji,
  setEmoji,
  description,
  setDescription,
}: {
  title: string
  setTitle: (v: string) => void
  pointsCost: string
  setPointsCost: (v: string) => void
  emoji: string
  setEmoji: (v: string) => void
  description: string
  setDescription: (v: string) => void
}) {
  return (
    <>
      <label>
        Título
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
      </label>
      <label style={{ marginTop: 6 }}>
        Emoji (opcional)
        <CalendarCategoryEmojiPicker value={emoji} onChange={setEmoji} />
      </label>
      <label style={{ marginTop: 6 }}>
        Coste en puntos
        <input type="number" min={1} value={pointsCost} onChange={(e) => setPointsCost(e.target.value)} />
      </label>
      <label style={{ marginTop: 6 }}>
        Descripción (opcional)
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </label>
    </>
  )
}

// "El formulario «Nueva recompensa» estará oculto hasta pulsar su botón" (4.2) — nunca visible siempre,
// a diferencia de antes de la Fase 4.
function AddRewardForm({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [title, setTitle] = useState('')
  const [pointsCost, setPointsCost] = useState('20')
  const [emoji, setEmoji] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const cost = Number(pointsCost)
    if (!title.trim() || !Number.isFinite(cost) || cost <= 0) {
      setError('Pon un título y un coste en puntos válido.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createReward({ title, pointsCost: cost, emoji: emoji || null, description: description.trim() || null })
      onAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo crear la recompensa'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      <h2>Nueva recompensa</h2>
      {error && <p className="error">{error}</p>}
      <RewardFields title={title} setTitle={setTitle} pointsCost={pointsCost} setPointsCost={setPointsCost} emoji={emoji} setEmoji={setEmoji} description={description} setDescription={setDescription} />
      <div className="filter-row" style={{ marginTop: 8 }}>
        <button type="submit" disabled={saving}>
          {saving ? 'Guardando…' : 'Crear recompensa'}
        </button>
        <button type="button" className="link-button" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function EditRewardForm({ reward, onDone, onSaved }: { reward: Reward; onDone: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(reward.title)
  const [pointsCost, setPointsCost] = useState(String(reward.pointsCost))
  const [emoji, setEmoji] = useState(reward.emoji ?? '')
  const [description, setDescription] = useState(reward.description ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    const cost = Number(pointsCost)
    if (!title.trim() || !Number.isFinite(cost) || cost <= 0) {
      setError('Pon un título y un coste en puntos válido.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateReward(reward.id, { title, pointsCost: cost, emoji: emoji || null, description: description.trim() || null })
      onSaved()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card member-form">
      {error && <p className="error">{error}</p>}
      <RewardFields title={title} setTitle={setTitle} pointsCost={pointsCost} setPointsCost={setPointsCost} emoji={emoji} setEmoji={setEmoji} description={description} setDescription={setDescription} />
      <div className="filter-row" style={{ marginTop: 8 }}>
        <button type="button" onClick={() => void save()} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="link-button" onClick={onDone}>
          Cancelar
        </button>
      </div>
    </div>
  )
}
