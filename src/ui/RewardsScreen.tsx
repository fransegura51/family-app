import { FormEvent, ReactNode, useEffect, useState } from 'react'
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
  listRewardParticipants,
  setMemberRewardsEnabled,
  getRewardMode,
  setRewardMode,
  listRewardMilestonesSeen,
  markRewardMilestoneSeen,
  listRewardMonthlyResults,
  finalizeMonthlyResults,
} from '@/data/rewards'
import { listEventCompletions } from '@/data/calendar'
import { listFamilyMembers } from '@/data/family'
import { MemberAvatar } from '@/ui/MemberAvatar'
import { RaceTrack } from '@/ui/RaceTrack'
import { MiCamino } from '@/ui/MiCamino'
import { GrantHistoryItem } from '@/ui/PointGrantHistory'
import { ConfirmButton, ConfirmIconButton } from '@/ui/ConfirmButton'
import { CalendarCategoryEmojiPicker } from '@/ui/MenuSettingsScreen'
import { Confetti } from '@/ui/Confetti'
import {
  memberPointsBalance,
  isMemberRewardsEnabled,
  memberLifetimePoints,
  monthlyRaceStandings,
  newlyReachedMilestones,
  nextRewardProgress,
  assignTrophies,
  previousYearMonth,
  annualCupStandings,
} from '@/domain/rewards'
import { toPastel } from '@/domain/colors'
import { MONTHS } from '@/domain/spokenDate'
import type { FamilyMember, PointGrant, Profile, Reward, RewardMilestoneSeen, RewardMode, RewardMonthlyResult, RewardParticipant, RewardRedemption } from '@/domain/types'
import type { EventCompletion } from '@/data/calendar'
import puntosHeaderImg from '@/assets/puntos/puntos-header.jpg'
import { errorMessage } from '@/domain/errorMessage'
import { SectionBreadcrumb } from '@/ui/SectionBreadcrumb'
import { HelpDestMark } from '@/help/ui/HelpDest'
import { emitHelpEvent } from '@/help/tours/helpBus'

// PG-PUNTOS-FINANZAS (Parte A3) — "YYYY-MM" del mes de hoy, para filtrar la Carrera mensual. Función
// aparte (no inline) para que ambos sitios que la necesitan (reload y el render) usen siempre el mismo
// instante de "hoy", en vez de arriesgarse a leer un new Date() distinto entre un cálculo y el siguiente.
function currentYearMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

// PG-PUNTOS-FINANZAS (Parte A6) — "YYYY-MM" legible, para el historial de trofeos ("octubre 2026").
function formatYearMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number)
  return `${MONTHS[month - 1]} ${year}`
}

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
  const [participants, setParticipants] = useState<RewardParticipant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddReward, setShowAddReward] = useState(false)
  const [editingRewardId, setEditingRewardId] = useState<string | null>(null)
  const [menuOpenRewardId, setMenuOpenRewardId] = useState<string | null>(null)
  const [showParticipants, setShowParticipants] = useState(false)
  const [mode, setMode] = useState<RewardMode>('camino')
  const [showModeSettings, setShowModeSettings] = useState(false)
  const [milestonesSeen, setMilestonesSeen] = useState<RewardMilestoneSeen[]>([])
  const [celebrating, setCelebrating] = useState<{ memberId: string; memberName: string; milestone: number } | null>(null)
  const [monthlyResults, setMonthlyResults] = useState<RewardMonthlyResult[]>([])

  // reloadQuiet vuelve a leer todo SIN pantalla de «Cargando…»: tras corregir o anular puntos, el adulto se queda
  // con el Historial abierto en el mismo sitio en vez de volver a empezar.
  function load(spinner: boolean) {
    if (spinner) setLoading(true)
    Promise.all([
      listEventCompletions(),
      listRewards(),
      listRedemptions(),
      listFamilyMembers(),
      listPointGrants(),
      listRewardParticipants(),
      getRewardMode(),
      listRewardMilestonesSeen(),
      listRewardMonthlyResults(),
    ])
      .then(([c, r, red, m, g, p, rewardMode, seen, results]) => {
        setCompletions(c)
        setRewards(r)
        setRedemptions(red)
        setMembers(m)
        setGrants(g)
        setParticipants(p)
        setMode(rewardMode)
        setMilestonesSeen(seen)
        setMonthlyResults(results)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }
  function reload() {
    load(true)
  }
  function reloadQuiet() {
    load(false)
  }

  useEffect(reload, [])

  // PG-PUNTOS-FINANZAS (Parte A5) — detecta hitos de 10 puntos NUEVOS sobre el saldo canjeable REAL de
  // cada miembro visible (nunca sobre Camino/Carrera) comparado con lo último que ya se le enseñó. Si
  // hay varios de golpe, se marcan TODOS como vistos (para que ninguno quede pendiente para siempre) pero
  // solo se celebra uno — "una celebración breve", nunca varias apiladas por el mismo evento.
  useEffect(() => {
    if (loading) return
    const toMark: { memberId: string; milestone: number }[] = []
    let celebrate: { memberId: string; memberName: string; milestone: number } | null = null
    for (const m of members) {
      if (!isMemberRewardsEnabled(m.id, m.memberType, participants)) continue
      const balance = memberPointsBalance(m.id, completions, redemptions, grants)
      const highestSeen = milestonesSeen.filter((s) => s.memberId === m.id).reduce((max, s) => Math.max(max, s.milestone), 0)
      const newOnes = newlyReachedMilestones(balance, highestSeen)
      if (newOnes.length === 0) continue
      newOnes.forEach((milestone) => toMark.push({ memberId: m.id, milestone }))
      if (!celebrate) celebrate = { memberId: m.id, memberName: m.name, milestone: newOnes[newOnes.length - 1] }
    }
    if (toMark.length === 0) return
    if (celebrate) setCelebrating(celebrate)
    Promise.all(toMark.map((t) => markRewardMilestoneSeen(t.memberId, t.milestone)))
      .then(reload)
      .catch(() => {})
  }, [loading, members, participants, completions, redemptions, grants, milestonesSeen])

  // PG-PUNTOS-FINANZAS (Parte A6) — cierra el mes de Carrera YA TERMINADO (el anterior al actual, nunca
  // el que sigue en curso) la primera vez que alguien abre esta pantalla después de que acabó — solo si
  // la familia usa el modo "carrera" (nunca se abre esta tabla para quien no usa la función). "Historial
  // preservado": una vez insertado un resultado nunca se recalcula ni se sobrescribe.
  useEffect(() => {
    if (loading || mode !== 'carrera') return
    const yearMonth = previousYearMonth(currentYearMonth())
    const visibleMembers = members.filter((m) => isMemberRewardsEnabled(m.id, m.memberType, participants))
    if (visibleMembers.length === 0) return
    const alreadyClosed = visibleMembers.every((m) => monthlyResults.some((r) => r.yearMonth === yearMonth && r.memberId === m.id))
    if (alreadyClosed) return
    const standings = monthlyRaceStandings(visibleMembers.map((m) => m.id), yearMonth, completions, grants)
    if (standings.every((s) => s.points === 0)) return
    finalizeMonthlyResults(yearMonth, assignTrophies(standings))
      .then(reload)
      .catch(() => {})
  }, [loading, mode, members, participants, completions, grants, monthlyResults])

  // Se cierra sola a los 4s — "breve", nunca algo que haya que cerrar a mano para seguir usando la pantalla.
  useEffect(() => {
    if (!celebrating) return
    const timer = setTimeout(() => setCelebrating(null), 4000)
    return () => clearTimeout(timer)
  }, [celebrating])

  if (loading) return <div className="screen">Cargando puntos…</div>

  const activeRewards = rewards.filter((r) => r.active)
  const pendingApprovals = redemptions.filter((r) => r.status === 'pendiente')
  const pendingToEnjoy = redemptions.filter((r) => r.status === 'aprobada')

  return (
    <div className="screen">
      <HelpDestMark id="pequenos.recompensas" />
      <div className="kitchen-header kitchen-header-wide">
        <img src={puntosHeaderImg} alt="Puntos y recompensas" className="kitchen-header-img" />
      </div>
      <SectionBreadcrumb subsection="Puntos y recompensas" />
      <p className="muted">
        Se ganan puntos al marcar "Hecho" un evento o una tarea del calendario que lleve puntos (se pone al crear o editar, cuando es de una sola persona), o si un adulto te los da directamente.
      </p>
      {error && <p className="error">{error}</p>}

      {celebrating && (
        <>
          <Confetti />
          <div className="card banner" style={{ padding: 10, marginBottom: 8, textAlign: 'center' }}>
            <strong>🎉 ¡{celebrating.memberName} ha llegado a {celebrating.milestone * 10} puntos!</strong>
          </div>
        </>
      )}

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

      {/* Encargo "Integración de la carrera animada V6" (corrección obligatoria 6) — en pantalla
          estrecha (iPhone), "Puntos por persona" + los dos botones de ajuste en la MISMA fila
          (flex:1 en el título) hacía que el título partido en varias líneas y los botones quedaran
          montados unos encima de otros — el título ahora ocupa SIEMPRE su propia fila entera
          (flex-basis:100%) y los dos botones van juntos debajo, nunca pegados al texto. */}
      <div className="inline-fields" style={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 4 }}>
        <h2 className="section-title" style={{ flex: '1 0 100%', margin: 0 }} data-help-id="pequenos.puntos-por-persona">Puntos por persona</h2>
        {isAdult && (
          <button type="button" className="link-button" data-help-id="pequenos.camino-modo" onClick={() => setShowModeSettings((v) => !v)}>
            ⚙️ {mode === 'camino' ? '🛤️ Camino' : '🏁 Carrera'}
          </button>
        )}
        {isAdult && (
          <button type="button" className="link-button" onClick={() => setShowParticipants((v) => !v)}>
            ⚙️ Quién participa
          </button>
        )}
      </div>
      {showModeSettings && isAdult && (
        <ModeSettingsPanel mode={mode} onChanged={(m) => { setMode(m); setShowModeSettings(false) }} setError={setError} />
      )}
      {showParticipants && isAdult && (
        <ParticipantsPanel members={members} participants={participants} onChanged={reload} setError={setError} />
      )}
      {(() => {
        const visibleMembers = members.filter((m) => isMemberRewardsEnabled(m.id, m.memberType, participants))
        const yearMonth = currentYearMonth()
        const standings = mode === 'carrera' ? monthlyRaceStandings(visibleMembers.map((m) => m.id), yearMonth, completions, grants) : []
        // Carrera animada V6 — mismos puntos de progreso (Camino/Carrera) que ya calcula cada
        // tarjeta de abajo, una sola vez aquí para no repetir la cuenta y para que el corredor de
        // cada uno en la pista compartida sea EXACTAMENTE el mismo número que su tarjeta enseña.
        const raceRunners = visibleMembers.map((m) => {
          const standing = mode === 'carrera' ? standings.find((s) => s.memberId === m.id) : undefined
          const points = mode === 'camino' ? memberLifetimePoints(m.id, completions, grants) : (standing?.points ?? 0)
          return { member: m, points }
        })
        return (
          <>
            {raceRunners.length > 0 && (
              <>
                {/* «Mi Camino» (PEPA-MICAMINO) — el modo Camino ya no repite la pista V6 de la Carrera:
                    muestra el recorrido circular de los tres mundos con el total de puntos GANADOS de
                    cada niño. Carrera sigue mostrando la pista V6 tal cual, sin tocarla. */}
                {mode === 'camino' ? <MiCamino runners={raceRunners} /> : <RaceTrack runners={raceRunners} />}
                {/* COR-1 — la pista mide los puntos GANADOS en el mes (o en total, en Camino), nunca
                    el saldo canjeable: gastar puntos en un canje no la hace retroceder. */}
                <p className="muted" style={{ fontSize: 11, margin: '4px 0 10px' }}>
                  {mode === 'carrera'
                    ? 'La carrera representa los puntos conseguidos durante el mes, aunque después se gasten en recompensas.'
                    : 'El Camino representa el total de puntos conseguidos, aunque después se gasten en recompensas.'}
                </p>
              </>
            )}
            <div className="event-list">
              {raceRunners.map(({ member: m, points: progressPoints }) => {
                const balance = memberPointsBalance(m.id, completions, redemptions, grants)
                const standing = mode === 'carrera' ? standings.find((s) => s.memberId === m.id) : undefined
                // COR-2 — dos datos independientes y rotulados sin ambigüedad: cuánto se ha GANADO
                // este mes/en total (progressPoints, nunca baja al canjear) y cuánto saldo queda para
                // canjear ahora mismo (balance). Ninguno se recalcula aquí — los dos ya vienen hechos
                // de domain/rewards.ts. Encargo "Reorganización de fichas" (punto 1) — se muestran como
                // dos conceptos separados y rotulados, no mezclados en una sola frase.
                const progressChipLabel =
                  mode === 'camino' ? '🛤️ Camino' : `🏁 Carrera mensual${standing ? ` (${standing.rank}º)` : ''}`
                // PG-PUNTOS-FINANZAS (Parte A5) — "emojis de recompensa... calculados del saldo canjeable
                // REAL": a propósito usa `balance` (memberPointsBalance), nunca progressPoints — solo lo que
                // de verdad se puede solicitar ahora mismo, nunca el progreso de Camino/Carrera.
                const affordableRewards = activeRewards.filter((r) => r.emoji && r.pointsCost <= balance).sort((a, b) => a.pointsCost - b.pointsCost)
                // COR-3 — "premio de hito" (más abajo, confeti cada 10 puntos de SALDO) es un mecanismo
                // aparte de esto: aquí el objetivo es la recompensa concreta del catálogo más barata que
                // todavía no se puede pedir, nunca un tramo fijo de 10 en 10 ni el resto de una división.
                const nextReward = nextRewardProgress(balance, activeRewards.filter((r) => r.emoji && r.pointsCost > 0))
                return (
                  <div key={m.id} className="card task-card" style={{ flexDirection: 'column', alignItems: 'stretch', background: toPastel(m.color) }}>
                    {/* Resumen — encargo "Reorganización de fichas" (punto 1): SIEMPRE visible, nunca
                        detrás de un "tocar para expandir" como antes (el estado de ficha abierta que
                        lo controlaba se ha retirado por completo). */}
                    <div className="inline-fields" style={{ alignItems: 'center' }}>
                      <MemberAvatar member={m} size={32} />
                      <span style={{ flex: 1, fontWeight: 600 }}>{m.name}</span>
                    </div>
                    <div className="inline-fields" style={{ flexWrap: 'wrap', gap: 6, marginTop: 6 }} data-help-id="pequenos.puntos-disponibles">
                      <span className="points-badge">{progressChipLabel}: {progressPoints}</span>
                      <span className="points-badge">⭐ Puntos disponibles: {balance}</span>
                    </div>
                    {nextReward && (
                      <p className="muted" style={{ margin: '4px 0 0', fontSize: 11 }}>
                        {nextReward.progress}/{nextReward.targetCost} para {nextReward.targetEmoji ? `${nextReward.targetEmoji} ` : ''}{nextReward.targetTitle} (faltan {nextReward.remaining})
                      </p>
                    )}
                    {affordableRewards.length > 0 && (
                      <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                        🎁 Ya puedes conseguir: {affordableRewards.map((r) => r.emoji).join(' ')}
                      </p>
                    )}
                    <MemberRewardsPanel
                      member={m}
                      members={members}
                      onGrantChanged={reloadQuiet}
                      balance={balance}
                      rewards={activeRewards}
                      redemptions={redemptions.filter((r) => r.memberId === m.id)}
                      grants={grants.filter((g) => g.memberId === m.id)}
                      monthlyResults={monthlyResults}
                      isAdult={isAdult}
                      onChanged={reload}
                      setError={setError}
                    />
                  </div>
                )
              })}
              {members.length === 0 && <p className="muted">Todavía no hay miembros en la familia.</p>}
              {members.length > 0 && members.every((m) => !isMemberRewardsEnabled(m.id, m.memberType, participants)) && (
                <p className="muted">Nadie participa todavía — actívalo desde "⚙️ Quién participa".</p>
              )}
            </div>
          </>
        )
      })()}

      {isAdult && (
        <>
          <h2 className="section-title">Catálogo de recompensas</h2>
          {showAddReward ? (
            <AddRewardForm onClose={() => setShowAddReward(false)} onAdded={() => { setShowAddReward(false); reload() }} />
          ) : (
            <button type="button" className="link-button" data-help-id="pequenos.recompensa-nueva" onClick={() => setShowAddReward(true)} style={{ marginBottom: 6 }}>
              + Nueva recompensa
            </button>
          )}
          <div className="event-list">
            {rewards.map((reward) =>
              editingRewardId === reward.id ? (
                <EditRewardForm key={reward.id} reward={reward} onDone={() => setEditingRewardId(null)} onSaved={() => { setEditingRewardId(null); reload() }} />
              ) : (
                <div key={reward.id} className="card task-card" style={{ opacity: reward.active ? 1 : 0.6, flexDirection: 'column', alignItems: 'stretch' }}>
                  <div className="inline-fields" style={{ alignItems: 'center' }}>
                    <span style={{ flex: 1 }}>
                      {reward.emoji ? `${reward.emoji} ` : ''}
                      <strong>{reward.title}</strong>
                      <span className="muted" style={{ fontSize: 12 }}>
                        {' '}
                        · ⭐ {reward.pointsCost}
                        {!reward.active ? ' · Desactivada' : ''}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="member-row-more"
                      aria-label={`Acciones de ${reward.title}`}
                      aria-expanded={menuOpenRewardId === reward.id}
                      onClick={() => setMenuOpenRewardId((cur) => (cur === reward.id ? null : reward.id))}
                    >
                      ⋯
                    </button>
                  </div>
                  {menuOpenRewardId === reward.id && (
                    <div className="member-row-actions">
                      <button type="button" className="link-button" onClick={() => { setEditingRewardId(reward.id); setMenuOpenRewardId(null) }}>
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
                  )}
                </div>
              ),
            )}
            {rewards.length === 0 && !showAddReward && <p className="muted">No hay recompensas todavía.</p>}
          </div>
        </>
      )}
    </div>
  )
}

// PG-PUNTOS-FINANZAS (Parte A2) — "los adultos pueden elegir qué miembros de la familia participan...
// desactivar nunca borra sus datos, reactivar restaura todo, nunca toca los permisos generales de la
// familia" — por eso esto es solo una lista de interruptores (reward_participants, migración 0248),
// nunca roza allowedSections ni ningún otro permiso ya existente del miembro.
function ParticipantsPanel({
  members,
  participants,
  onChanged,
  setError,
}: {
  members: FamilyMember[]
  participants: RewardParticipant[]
  onChanged: () => void
  setError: (e: string | null) => void
}) {
  const [savingId, setSavingId] = useState<string | null>(null)

  async function toggle(member: FamilyMember, enabled: boolean) {
    setSavingId(member.id)
    setError(null)
    try {
      await setMemberRewardsEnabled(member.id, enabled)
      onChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="card" style={{ padding: 8, marginBottom: 8 }}>
      <p className="muted" style={{ margin: '0 0 6px', fontSize: 12 }}>
        Quién aparece en "Puntos por persona". Desactivar a alguien no borra nada de su historial — solo deja de verse mientras esté así.
      </p>
      {members.map((m) => {
        const enabled = isMemberRewardsEnabled(m.id, m.memberType, participants)
        return (
          <label key={m.id} className="inline-fields" style={{ alignItems: 'center', marginTop: 4, cursor: 'pointer' }}>
            <input type="checkbox" checked={enabled} disabled={savingId === m.id} onChange={(e) => void toggle(m, e.target.checked)} />
            <MemberAvatar member={m} size={24} />
            <span style={{ flex: 1 }}>{m.name}</span>
          </label>
        )
      })}
      {members.length === 0 && <p className="muted" style={{ fontSize: 12 }}>Todavía no hay miembros en la familia.</p>}
    </div>
  )
}

// PG-PUNTOS-FINANZAS (Parte A3) — "Camino de recompensas" (un único trayecto que nunca se reinicia,
// pensado para un solo niño/a) frente a "Carrera mensual" (progreso que arranca de cero cada mes, para
// comparar varios niños entre sí) — ajuste de FAMILIA completa (reward_settings, migración 0248), nunca
// por miembro, y solo un adulto puede cambiarlo.
function ModeSettingsPanel({ mode, onChanged, setError }: { mode: RewardMode; onChanged: (m: RewardMode) => void; setError: (e: string | null) => void }) {
  const [saving, setSaving] = useState(false)

  async function choose(next: RewardMode) {
    if (next === mode) return
    setSaving(true)
    setError(null)
    try {
      await setRewardMode(next)
      onChanged(next)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card" style={{ padding: 8, marginBottom: 8 }}>
      <p className="muted" style={{ margin: '0 0 6px', fontSize: 12 }}>
        Cómo se mide el progreso de todos — es un ajuste de toda la familia, no de cada niño/a por separado.
      </p>
      <div className="filter-row">
        <button type="button" className={'chip' + (mode === 'camino' ? ' chip-active' : '')} disabled={saving} onClick={() => void choose('camino')}>
          🛤️ Camino de recompensas — nunca se reinicia, pensado para un solo niño/a
        </button>
        <button type="button" className={'chip' + (mode === 'carrera' ? ' chip-active' : '')} disabled={saving} onClick={() => void choose('carrera')}>
          🏁 Carrera mensual — empieza de cero cada mes, para comparar varios niños/as
        </button>
      </div>
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
const TROPHY_EMOJI: Record<RewardMonthlyResult['trophy'], string> = {
  oro: '🥇',
  plata: '🥈',
  bronce: '🥉',
  participacion: '🎖️',
}

// Encargo "Reorganización de fichas" (punto 2/3/4) — los tres bloques de la ficha (Catálogo,
// Historial, Trofeos) comparten el mismo patrón ya usado en el resto de la app (cabecera
// "▸/▾ título" + contenido en un `.card` anidado, ver EventosScreen "💰 Ofertas"): un único
// componente evita repetir ese patrón tres veces con el riesgo de que uno se desincronice del resto.
function RewardsSubsection({ title, defaultOpen, children }: { title: string; defaultOpen: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ marginTop: 8 }}>
      <button type="button" className="link-button" onClick={() => setOpen((v) => !v)}>
        {open ? '▾' : '▸'} {title}
      </button>
      {open && <div className="card" style={{ padding: 8, marginTop: 4 }}>{children}</div>}
    </div>
  )
}

function MemberRewardsPanel({
  member,
  members,
  onGrantChanged,
  balance,
  rewards,
  redemptions,
  grants,
  monthlyResults,
  isAdult,
  onChanged,
  setError,
}: {
  member: FamilyMember
  members: FamilyMember[]
  onGrantChanged: () => void
  balance: number
  rewards: Reward[]
  redemptions: RewardRedemption[]
  grants: PointGrant[]
  monthlyResults: RewardMonthlyResult[]
  isAdult: boolean
  onChanged: () => void
  setError: (e: string | null) => void
}) {
  const [requestingId, setRequestingId] = useState<string | null>(null)
  const [showGivePoints, setShowGivePoints] = useState(false)
  const trophies = monthlyResults.filter((t) => t.memberId === member.id)
  // PG-PUNTOS-FINANZAS (Parte A7) — "vitrina por niño/a, por defecto el año en curso, con acceso a años
  // anteriores, nunca una lista mezclada" — los años disponibles salen de los trofeos reales de toda la
  // familia (para poder ver un año donde este miembro no ganó nada, pero otros sí), siempre incluyendo el
  // año en curso aunque todavía no tenga trofeos, para que el selector nunca aparezca vacío.
  const currentYear = String(new Date().getFullYear())
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const availableYears = Array.from(new Set([currentYear, ...monthlyResults.map((r) => r.yearMonth.slice(0, 4))])).sort((a, b) => b.localeCompare(a))
  const trophiesForYear = trophies.filter((t) => t.yearMonth.startsWith(selectedYear))
  const cupStandings = annualCupStandings(monthlyResults, selectedYear)
  const isCupWinner = cupStandings.some((s) => s.memberId === member.id && s.isWinner)

  async function handleRequest(reward: Reward) {
    setRequestingId(reward.id)
    setError(null)
    try {
      await requestRewardRedemption(reward.id, member.id)
      emitHelpEvent('pequenos.reward-requested')
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
          <button type="button" className="link-button" data-help-id="pequenos.dar-puntos" onClick={() => setShowGivePoints((v) => !v)}>
            ⭐ Dar puntos
          </button>
        </div>
      )}
      {showGivePoints && <GivePointsForm member={member} onClose={() => setShowGivePoints(false)} onGiven={onChanged} setError={setError} />}

      {/* Encargo "Reorganización de fichas" (punto 2) — bloque propio, desplegado por defecto (a
          diferencia de Historial/Trofeos): son las recompensas que este niño/a puede consultar y
          solicitar AHORA MISMO, mismos datos que el catálogo general de abajo (rewards, sin duplicar
          ningún registro), mismas condiciones de disponibilidad/permisos/solicitud de siempre. */}
      <RewardsSubsection title="🎁 Catálogo de recompensas" defaultOpen>
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
                    <button type="button" className="task-toggle" data-help-id="pequenos.solicitar" disabled={!canAfford || requestingId === reward.id} onClick={() => void handleRequest(reward)}>
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
      </RewardsSubsection>

      {/* Encargo "Reorganización de fichas" (punto 3) — plegado por defecto, mismos datos e igual
          funcionamiento que antes (solo cambia el envoltorio visual). */}
      <RewardsSubsection title="📜 Historial" defaultOpen={false}>
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
            {/* Corregir/anular puntos concedidos por error (PEPA-PUNTOS-CORR): solo en cada «Dar puntos» original y solo
                para adultos; los canjes de arriba nunca tienen esa opción. */}
            {grants.map((g) => (
              <GrantHistoryItem key={g.id} grant={g} memberGrants={grants} members={members} memberName={member.name} balance={balance} isAdult={isAdult} onChanged={onGrantChanged} />
            ))}
          </ul>
        )}
      </RewardsSubsection>

      {/* Encargo "Reorganización de fichas" (punto 4) — plegado por defecto; se mantiene oculto por
          completo sin trofeos todavía (igual que antes), nunca el cálculo ni la asignación tocados. */}
      {trophies.length > 0 && (
        <RewardsSubsection title="🏆 Trofeos" defaultOpen={false}>
          <div className="filter-row" style={{ alignItems: 'center', marginBottom: 4 }}>
            {availableYears.map((year) => (
              <button key={year} type="button" className={'chip' + (year === selectedYear ? ' chip-active' : '')} onClick={() => setSelectedYear(year)}>
                {year}
              </button>
            ))}
          </div>
          {isCupWinner && (
            <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 600 }}>🏆 ¡Gran Copa {selectedYear}! (más carreras mensuales ganadas)</p>
          )}
          {trophiesForYear.length === 0 ? (
            <p className="muted" style={{ fontSize: 12 }}>Sin trofeos en {selectedYear}.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
              {[...trophiesForYear]
                .sort((a, b) => b.yearMonth.localeCompare(a.yearMonth))
                .map((t) => (
                  <li key={t.id}>
                    {TROPHY_EMOJI[t.trophy]} {formatYearMonth(t.yearMonth)} · ⭐ {t.points}
                  </li>
                ))}
            </ul>
          )}
        </RewardsSubsection>
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
      emitHelpEvent('pequenos.points-given')
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
        <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus data-help-id="pequenos.dar-puntos-cantidad" />
      </label>
      <label style={{ marginTop: 6 }}>
        Motivo (opcional)
        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ha ayudado en casa..." data-help-id="pequenos.dar-puntos-motivo" />
      </label>
      <div className="filter-row" style={{ marginTop: 8 }}>
        <button type="submit" disabled={saving} data-help-id="pequenos.dar-puntos-enviar">
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
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus data-help-id="pequenos.recompensa-titulo" />
      </label>
      <label style={{ marginTop: 6 }} data-help-id="pequenos.recompensa-emoji">
        Emoji (opcional)
        <CalendarCategoryEmojiPicker value={emoji} onChange={setEmoji} />
      </label>
      <label style={{ marginTop: 6 }}>
        Coste en puntos
        <input type="number" min={1} value={pointsCost} onChange={(e) => setPointsCost(e.target.value)} data-help-id="pequenos.recompensa-coste" />
      </label>
      <label style={{ marginTop: 6 }}>
        Descripción (opcional)
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} data-help-id="pequenos.recompensa-descripcion" />
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
      emitHelpEvent('pequenos.reward-created')
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
        <button type="submit" disabled={saving} data-help-id="pequenos.recompensa-crear">
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
