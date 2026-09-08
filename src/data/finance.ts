import { supabase } from '@/data/supabaseClient'
import type {
  Budget,
  BudgetCategory,
  BudgetPeriod,
  Expense,
  ExpenseKind,
  ExpenseSource,
  KidGoal,
  KidWalletTransaction,
  Tag,
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
    .select('id, family_id, expense_date, amount, category, store, kind, notes, is_income, budget_group, tag_id, source')
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
    isIncome: r.is_income,
    budgetGroup: r.budget_group,
    tagId: r.tag_id,
    source: r.source as ExpenseSource,
  }))
}

export async function addExpense(input: {
  date: string
  amount: number
  category: string
  store: string
  kind: ExpenseKind
  isIncome?: boolean
  budgetGroup?: string
  tagId?: string | null
  source?: ExpenseSource
}): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('expenses').insert({
    family_id: familyId,
    expense_date: input.date,
    amount: input.amount,
    category: input.category,
    store: input.store || null,
    kind: input.kind,
    is_income: input.isIncome ?? false,
    budget_group: input.budgetGroup ?? 'alimentacion',
    tag_id: input.tagId ?? null,
    source: input.source ?? 'manual',
  })
  if (error) throw error
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from('expenses').delete().eq('id', id)
  if (error) throw error
}

// Corregir un gasto ya apuntado (petición real: "también quiero poder
// eliminarlo o editarlo por si me he equivocado").
export async function updateExpense(
  id: string,
  patch: {
    date?: string
    amount?: number
    category?: string
    store?: string
    kind?: ExpenseKind
    isIncome?: boolean
    tagId?: string | null
  },
): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.date !== undefined) update.expense_date = patch.date
  if (patch.amount !== undefined) update.amount = patch.amount
  if (patch.category !== undefined) update.category = patch.category
  if (patch.store !== undefined) update.store = patch.store || null
  if (patch.kind !== undefined) update.kind = patch.kind
  if (patch.isIncome !== undefined) update.is_income = patch.isIncome
  if (patch.tagId !== undefined) update.tag_id = patch.tagId
  const { error } = await supabase.from('expenses').update(update).eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------
// Presupuestos (Skill 19)
// ---------------------------------------------------------------------

export async function listBudgets(): Promise<Budget[]> {
  const { data, error } = await supabase
    .from('budgets')
    .select('id, family_id, period_type, period_start, category, amount, budget_group')
    .order('period_start', { ascending: false })
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    familyId: r.family_id,
    periodType: r.period_type as BudgetPeriod,
    periodStart: r.period_start,
    category: r.category,
    amount: Number(r.amount),
    budgetGroup: r.budget_group,
  }))
}

export async function createBudget(input: {
  periodType: BudgetPeriod
  periodStart: string
  category: string
  amount: number
  budgetGroup: string
}): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('budgets').insert({
    family_id: familyId,
    period_type: input.periodType,
    period_start: input.periodStart,
    category: input.category || null,
    amount: input.amount,
    budget_group: input.budgetGroup,
  })
  if (error) throw error
}

export async function deleteBudget(id: string): Promise<void> {
  const { error } = await supabase.from('budgets').delete().eq('id', id)
  if (error) throw error
}

// Categorías de presupuesto con icono (Skill 19) — petición real: "que
// se puedan crear categorías, algo como lo de la foto". budgetGroup
// separa Alimentación de Generales sin dejar de sumarse juntas en las
// estadísticas (BudgetsOverview lee de las dos).
export async function listBudgetCategories(): Promise<BudgetCategory[]> {
  const { data, error } = await supabase
    .from('budget_categories')
    .select('id, family_id, name, icon, budget_group, sort_order, parent_id, necessity, is_fixed')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    familyId: r.family_id,
    name: r.name,
    icon: r.icon,
    budgetGroup: r.budget_group,
    sortOrder: r.sort_order,
    parentId: r.parent_id,
    necessity: r.necessity,
    isFixed: r.is_fixed,
  }))
}

export async function createBudgetCategory(input: {
  name: string
  icon: string
  budgetGroup: string
  parentId?: string | null
  necessity?: 'debo' | 'necesito' | 'quiero' | null
  isFixed?: boolean | null
}): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('budget_categories').insert({
    family_id: familyId,
    name: input.name.trim(),
    icon: input.icon.trim() || '💰',
    budget_group: input.budgetGroup,
    sort_order: Date.now(),
    parent_id: input.parentId ?? null,
    necessity: input.necessity ?? null,
    is_fixed: input.isFixed ?? null,
  })
  if (error) throw error
}

// Editar la clasificación de una categoría ya creada — petición real:
// "clasificar cada categoría desde un principio (editables si se
// quiere posteriormente por el usuario)". La familia puede corregir lo
// que Pepa clasificó de fábrica, o clasificar una categoría propia que
// creó sin elegir nada.
export async function updateBudgetCategory(
  id: string,
  patch: { necessity?: 'debo' | 'necesito' | 'quiero' | null; isFixed?: boolean | null },
): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.necessity !== undefined) update.necessity = patch.necessity
  if (patch.isFixed !== undefined) update.is_fixed = patch.isFixed
  const { error } = await supabase.from('budget_categories').update(update).eq('id', id)
  if (error) throw error
}

// Alta de varias categorías de golpe — se usa para sembrar Presupuesto
// Generales la primera vez (Luz, Agua, Impuestos...) sin que la
// persona tenga que darlas de alta una a una.
// Devuelve {name, id} de lo creado — hace falta para sembrar categorías
// de dos niveles: primero se crean las principales y con sus ids ya
// reales se crean las subcategorías apuntando a ellas.
export async function createBudgetCategoriesBulk(
  inputs: {
    name: string
    icon: string
    budgetGroup: string
    parentId?: string | null
    necessity?: 'debo' | 'necesito' | 'quiero' | null
    isFixed?: boolean | null
  }[],
): Promise<{ id: string; name: string }[]> {
  const familyId = await currentFamilyId()
  const base = Date.now()
  const { data, error } = await supabase
    .from('budget_categories')
    .insert(
      inputs.map((input, index) => ({
        family_id: familyId,
        name: input.name,
        icon: input.icon,
        budget_group: input.budgetGroup,
        sort_order: base + index,
        parent_id: input.parentId ?? null,
        necessity: input.necessity ?? null,
        is_fixed: input.isFixed ?? null,
      })),
    )
    .select('id, name')
  if (error) throw error
  return data
}

export async function deleteBudgetCategory(id: string): Promise<void> {
  const { error } = await supabase.from('budget_categories').delete().eq('id', id)
  if (error) throw error
}

// Arrastrar con el dedo para reordenar los iconos de categoría —
// petición real: "que se puedan mover y organizar como queramos,
// arrastrándolos con el dedo". Mismo patrón que reorderShoppingItems:
// se manda la lista ya en el orden final y aquí se reparten sort_order
// nuevos y crecientes.
export async function reorderBudgetCategories(orderedIds: string[]): Promise<void> {
  const base = Date.now()
  const { error } = await supabase
    .from('budget_categories')
    .upsert(orderedIds.map((id, index) => ({ id, sort_order: base + index })))
  if (error) throw new Error(error.message)
}

// ---------------------------------------------------------------------
// Etiquetas (Skill de Pepa, punto 11) — libres, creadas por el
// usuario, independientes de categoría/subcategoría.
// ---------------------------------------------------------------------

export async function listTags(): Promise<Tag[]> {
  const { data, error } = await supabase
    .from('tags')
    .select('id, family_id, name, color, sort_order')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    familyId: r.family_id,
    name: r.name,
    color: r.color,
    sortOrder: r.sort_order,
  }))
}

export async function createTag(input: { name: string; color?: string }): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('tags').insert({
    family_id: familyId,
    name: input.name.trim(),
    color: input.color ?? '#4C6EF5',
    sort_order: Date.now(),
  })
  if (error) throw error
}

export async function updateTag(id: string, patch: { name?: string; color?: string }): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.name !== undefined) update.name = patch.name.trim()
  if (patch.color !== undefined) update.color = patch.color
  const { error } = await supabase.from('tags').update(update).eq('id', id)
  if (error) throw error
}

export async function deleteTag(id: string): Promise<void> {
  const { error } = await supabase.from('tags').delete().eq('id', id)
  if (error) throw error
}

export async function reorderTags(orderedIds: string[]): Promise<void> {
  const base = Date.now()
  const { error } = await supabase.from('tags').upsert(orderedIds.map((id, index) => ({ id, sort_order: base + index })))
  if (error) throw new Error(error.message)
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
