import { supabase } from '@/data/supabaseClient'
import type { Reward, RewardRedemption } from '@/domain/types'

export async function listRewards(): Promise<Reward[]> {
  const { data, error } = await supabase
    .from('rewards')
    .select('id, family_id, title, points_cost')
    .order('points_cost', { ascending: true })
  if (error) throw error
  return data.map((r) => ({ id: r.id, familyId: r.family_id, title: r.title, pointsCost: r.points_cost }))
}

export async function createReward(input: { title: string; pointsCost: number }): Promise<void> {
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  const { data: profileRow, error: profileError } = await supabase
    .from('profiles')
    .select('family_id')
    .eq('id', userResult.user.id)
    .single()
  if (profileError) throw profileError

  const { error } = await supabase
    .from('rewards')
    .insert({ family_id: profileRow.family_id, title: input.title, points_cost: input.pointsCost })
  if (error) throw error
}

export async function deleteReward(id: string): Promise<void> {
  const { error } = await supabase.from('rewards').delete().eq('id', id)
  if (error) throw error
}

export async function listRedemptions(): Promise<RewardRedemption[]> {
  const { data, error } = await supabase
    .from('reward_redemptions')
    .select('id, reward_id, member_id, points_spent, redeemed_at')
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    rewardId: r.reward_id,
    memberId: r.member_id,
    pointsSpent: r.points_spent,
    redeemedAt: r.redeemed_at,
  }))
}

export async function redeemReward(rewardId: string, memberId: string, pointsCost: number): Promise<void> {
  const { error } = await supabase
    .from('reward_redemptions')
    .insert({ reward_id: rewardId, member_id: memberId, points_spent: pointsCost })
  if (error) throw error
}
