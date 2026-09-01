import { supabase } from '@/data/supabaseClient'
import type { Reward, RewardRedemption, Task, TaskCompletion, TaskType } from '@/domain/types'

export async function listTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, family_id, member_id, title, task_type, recurrence_rule, start_date, time_of_day, points, active')
    .eq('active', true)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    familyId: r.family_id,
    memberId: r.member_id,
    title: r.title,
    taskType: r.task_type as TaskType,
    recurrenceRule: r.recurrence_rule,
    startDate: r.start_date,
    timeOfDay: r.time_of_day,
    points: r.points,
    active: r.active,
  }))
}

export async function createTask(input: {
  title: string
  taskType: TaskType
  memberId: string | null
  points: number
  recurrenceRule: string | null
  startDate: string
  timeOfDay: string | null
}): Promise<void> {
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  const { data: profileRow, error: profileError } = await supabase
    .from('profiles')
    .select('family_id')
    .eq('id', userResult.user.id)
    .single()
  if (profileError) throw profileError

  const { error } = await supabase.from('tasks').insert({
    family_id: profileRow.family_id,
    member_id: input.memberId,
    title: input.title,
    task_type: input.taskType,
    points: input.points,
    recurrence_rule: input.recurrenceRule,
    start_date: input.startDate,
    time_of_day: input.timeOfDay,
  })
  if (error) throw error
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw error
}

// Todas las completions de las tareas activas de la familia. El volumen
// es bajo (tareas de una familia, no histórico global), así que traer
// todo de golpe es más simple que paginar.
export async function listCompletions(): Promise<TaskCompletion[]> {
  const { data, error } = await supabase
    .from('task_completions')
    .select('id, task_id, member_id, completed_date, points_awarded')
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    taskId: r.task_id,
    memberId: r.member_id,
    completedDate: r.completed_date,
    pointsAwarded: r.points_awarded,
  }))
}

export async function completeTask(taskId: string, memberId: string, points: number): Promise<void> {
  const today = new Date()
  const completedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const { error } = await supabase
    .from('task_completions')
    .insert({ task_id: taskId, member_id: memberId, completed_date: completedDate, points_awarded: points })
  if (error) throw error
}

export async function uncompleteTask(taskId: string, memberId: string): Promise<void> {
  const today = new Date()
  const completedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const { error } = await supabase
    .from('task_completions')
    .delete()
    .eq('task_id', taskId)
    .eq('member_id', memberId)
    .eq('completed_date', completedDate)
  if (error) throw error
}

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
