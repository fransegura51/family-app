import { supabase } from '@/data/supabaseClient'
import type {
  Budget,
  BudgetPeriod,
  Expense,
  ExpenseKind,
  KidGoal,
  KidWalletTransaction,
  WalletTransactionType,
} from '@/domain/types'

async function currentFamilyId(): Promise<string> {
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  const { data: profileRow, error } = await supabase
    .from('profiles')
    .select('family_id')
    .eq('id', userResult.user.id)
    .single()
  if (error) throw error
  return profileRow.family_id
}

// ---------------------------------------------------------------------
// Gastos (Skill 17/18)
// ---------------------------------------------------------------------

export async function listExpenses(): Promise<Expense[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('id, family_id, expense_date, amount, category, store, kind, notes')
    .order('expense_date', { ascending: false })
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    familyId: r.family_id,
    expenseDate: r.expense_date,
    amount: Number(r.amount),
    category: r.category,
    store: r.store,
    kind: r.kind as ExpenseKind,
    notes: r.notes,
  }))
}

export async function addExpense(input: {
  date: string
  amount: number
  category: string
  store: string
  kind: ExpenseKind
}): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('expenses').insert({
    family_id: familyId,
    expense_date: input.date,
    amount: input.amount,
    category: input.category,
    store: input.store || null,
    kind: input.kind,
  })
  if (error) throw error
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from('expenses').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------
// Presupuestos (Skill 19)
// ---------------------------------------------------------------------

export async function listBudgets(): Promise<Budget[]> {
  const { data, error } = await supabase
    .from('budgets')
    .select('id, family_id, period_type, period_start, category, amount')
    .order('period_start', { ascending: false })
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    familyId: r.family_id,
    periodType: r.period_type as BudgetPeriod,
    periodStart: r.period_start,
    category: r.category,
    amount: Number(r.amount),
  }))
}

export async function createBudget(input: {
  periodType: BudgetPeriod
  periodStart: string
  category: string
  amount: number
}): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('budgets').insert({
    family_id: familyId,
    period_type: input.periodType,
    period_start: input.periodStart,
    category: input.category || null,
    amount: input.amount,
  })
  if (error) throw error
}

export async function deleteBudget(id: string): Promise<void> {
  const { error } = await supabase.from('budgets').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------
// Educación financiera infantil (Skill 20)
// ---------------------------------------------------------------------

export async function listWalletTransactions(): Promise<KidWalletTransaction[]> {
  const { data, error } = await supabase
    .from('kid_wallet_transactions')
    .select('id, family_id, member_id, type, amount, description, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    familyId: r.family_id,
    memberId: r.member_id,
    type: r.type as WalletTransactionType,
    amount: Number(r.amount),
    description: r.description,
    createdAt: r.created_at,
  }))
}

export async function addWalletTransaction(input: {
  memberId: string
  type: WalletTransactionType
  amount: number
  description: string
}): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('kid_wallet_transactions').insert({
    family_id: familyId,
    member_id: input.memberId,
    type: input.type,
    amount: input.amount,
    description: input.description,
  })
  if (error) throw error
}

export async function deleteWalletTransaction(id: string): Promise<void> {
  const { error } = await supabase.from('kid_wallet_transactions').delete().eq('id', id)
  if (error) throw error
}

export async function listGoals(): Promise<KidGoal[]> {
  const { data, error } = await supabase
    .from('kid_goals')
    .select('id, family_id, member_id, title, target_amount')
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    familyId: r.family_id,
    memberId: r.member_id,
    title: r.title,
    targetAmount: Number(r.target_amount),
  }))
}

export async function createGoal(input: { memberId: string; title: string; targetAmount: number }): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('kid_goals').insert({
    family_id: familyId,
    member_id: input.memberId,
    title: input.title,
    target_amount: input.targetAmount,
  })
  if (error) throw error
}

export async function deleteGoal(id: string): Promise<void> {
  const { error } = await supabase.from('kid_goals').delete().eq('id', id)
  if (error) throw error
}
