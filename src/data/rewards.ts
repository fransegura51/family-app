import { supabase } from '@/data/supabaseClient'
import type { PointGrant, Reward, RewardRedemption } from '@/domain/types'

async function currentFamilyId(): Promise<string> {
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  const { data: profileRow, error } = await supabase.from('profiles').select('family_id').eq('id', userResult.user.id).single()
  if (error) throw error
  return profileRow.family_id
}

const REWARD_SELECT = 'id, family_id, title, points_cost, emoji, description, active'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapReward(r: any): Reward {
  return {
    id: r.id,
    familyId: r.family_id,
    title: r.title,
    pointsCost: r.points_cost,
    emoji: r.emoji,
    description: r.description,
    active: r.active,
  }
}

export async function listRewards(): Promise<Reward[]> {
  const { data, error } = await supabase.from('rewards').select(REWARD_SELECT).order('points_cost', { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapReward)
}

export interface RewardInput {
  title: string
  pointsCost: number
  emoji?: string | null
  description?: string | null
}

// Fase 4 (Parte 4.2, prompt maestro) — solo un adulto autorizado puede crear/editar recompensas (RLS,
// migración 0229); esta función nunca comprueba el rol por su cuenta, se apoya en que el servidor
// rechace la escritura si quien la llama no es adulto.
export async function createReward(input: RewardInput): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('rewards').insert({
    family_id: familyId,
    title: input.title.trim(),
    points_cost: input.pointsCost,
    emoji: input.emoji ?? null,
    description: input.description ?? null,
  })
  if (error) throw error
}

export async function updateReward(id: string, patch: Partial<RewardInput> & { active?: boolean }): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.title !== undefined) update.title = patch.title.trim()
  if (patch.pointsCost !== undefined) update.points_cost = patch.pointsCost
  if (patch.emoji !== undefined) update.emoji = patch.emoji
  if (patch.description !== undefined) update.description = patch.description
  if (patch.active !== undefined) update.active = patch.active
  const { error } = await supabase.from('rewards').update(update).eq('id', id)
  if (error) throw error
}

// "Desactivar" es la acción normal (4.2: "crear, editar, desactivar y gestionar") — el historial de
// canjes ya no depende de que la recompensa siga existiendo (snapshot + on delete set null, migración
// 0229), así que borrar de verdad sigue disponible pero deja de ser necesario para "retirarla".
export async function deleteReward(id: string): Promise<void> {
  const { error } = await supabase.from('rewards').delete().eq('id', id)
  if (error) throw error
}

const REDEMPTION_SELECT =
  'id, reward_id, member_id, family_id, points_spent, reward_title, reward_emoji, status, requested_by, decided_by, decided_at, enjoyed_at, redeemed_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRedemption(r: any): RewardRedemption {
  return {
    id: r.id,
    rewardId: r.reward_id,
    memberId: r.member_id,
    familyId: r.family_id,
    pointsSpent: r.points_spent,
    rewardTitle: r.reward_title,
    rewardEmoji: r.reward_emoji,
    status: r.status,
    requestedBy: r.requested_by,
    decidedBy: r.decided_by,
    decidedAt: r.decided_at,
    enjoyedAt: r.enjoyed_at,
    redeemedAt: r.redeemed_at,
  }
}

export async function listRedemptions(): Promise<RewardRedemption[]> {
  const { data, error } = await supabase.from('reward_redemptions').select(REDEMPTION_SELECT).order('redeemed_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapRedemption)
}

// Fase 4 (Parte 4.3) — solicitar un canje: la reserva de puntos (comprobar que el saldo alcanza Y crear
// la fila) pasa por el RPC request_reward_redemption (migración 0229), NUNCA un insert directo desde
// aquí — un insert directo no podría impedir de forma atómica que dos solicitudes simultáneas reserven
// más puntos de los que el miembro tiene de verdad.
export async function requestRewardRedemption(rewardId: string, memberId: string): Promise<RewardRedemption> {
  const { data, error } = await supabase.rpc('request_reward_redemption', { p_reward_id: rewardId, p_member_id: memberId })
  if (error) throw error
  return mapRedemption(data)
}

async function currentProfileId(): Promise<string> {
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  return userResult.user.id
}

// Solo un adulto autorizado puede decidir (RLS) — "aprobada"/"rechazada" desde 'pendiente'. El
// ".eq('status', 'pendiente')" en el WHERE es la protección contra decidir dos veces lo mismo (si ya lo
// decidió otro adulto justo antes, esta llamada no actualiza ninguna fila en vez de pisar la decisión).
export async function decideRewardRedemption(id: string, status: 'aprobada' | 'rechazada'): Promise<RewardRedemption> {
  const decidedBy = await currentProfileId()
  const { data, error } = await supabase
    .from('reward_redemptions')
    .update({ status, decided_by: decidedBy, decided_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pendiente')
    .select(REDEMPTION_SELECT)
    .single()
  if (error) throw error
  return mapRedemption(data)
}

// "Marcar como disfrutada" — solo desde 'aprobada', mismo criterio de protección que decideRewardRedemption.
export async function markRewardRedemptionEnjoyed(id: string): Promise<RewardRedemption> {
  const { data, error } = await supabase
    .from('reward_redemptions')
    .update({ status: 'disfrutada', enjoyed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'aprobada')
    .select(REDEMPTION_SELECT)
    .single()
  if (error) throw error
  return mapRedemption(data)
}

const POINT_GRANT_SELECT = 'id, family_id, member_id, amount, reason, granted_by, reverses_grant_id, created_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPointGrant(r: any): PointGrant {
  return {
    id: r.id,
    familyId: r.family_id,
    memberId: r.member_id,
    amount: r.amount,
    reason: r.reason,
    grantedBy: r.granted_by,
    reversesGrantId: r.reverses_grant_id,
    createdAt: r.created_at,
  }
}

export async function listPointGrants(): Promise<PointGrant[]> {
  const { data, error } = await supabase.from('point_grants').select(POINT_GRANT_SELECT).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapPointGrant)
}

// Fase 4 (Parte 4.4) — "Dar puntos" manualmente. Solo un adulto autorizado puede insertar (RLS); amount
// puede ser negativo únicamente a través de reverseGrant (abajo), nunca aquí directamente.
export async function givePoints(memberId: string, amount: number, reason: string | null): Promise<PointGrant> {
  if (amount <= 0) throw new Error('La cantidad debe ser mayor que 0.')
  const familyId = await currentFamilyId()
  const grantedBy = await currentProfileId()
  const { data, error } = await supabase
    .from('point_grants')
    .insert({ family_id: familyId, member_id: memberId, amount, reason: reason?.trim() || null, granted_by: grantedBy })
    .select(POINT_GRANT_SELECT)
    .single()
  if (error) throw error
  return mapPointGrant(data)
}

// Corrección trazable: NUNCA edita ni borra el movimiento original — inserta una fila nueva de signo
// contrario que lo referencia, así el historial conserva que el error existió y cómo se corrigió.
export async function reversePointGrant(grant: PointGrant, reason: string | null): Promise<PointGrant> {
  const grantedBy = await currentProfileId()
  const { data, error } = await supabase
    .from('point_grants')
    .insert({
      family_id: grant.familyId,
      member_id: grant.memberId,
      amount: -grant.amount,
      reason: reason?.trim() || `Corrección de un movimiento anterior`,
      granted_by: grantedBy,
      reverses_grant_id: grant.id,
    })
    .select(POINT_GRANT_SELECT)
    .single()
  if (error) throw error
  return mapPointGrant(data)
}
