import { supabase } from '@/data/supabaseClient'
import type {
  InventoryCategory,
  InventoryItem,
  ShoppingItem,
  ShoppingItemPriority,
  ShoppingItemStatus,
  ShoppingTrip,
  TripStatus,
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
// Lista de la compra (Skill 06/07)
// ---------------------------------------------------------------------

export async function listShoppingItems(): Promise<ShoppingItem[]> {
  const { data, error } = await supabase
    .from('shopping_items')
    .select('id, family_id, trip_id, name, quantity, unit, priority, status')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    familyId: r.family_id,
    tripId: r.trip_id,
    name: r.name,
    quantity: r.quantity,
    unit: r.unit,
    priority: r.priority as ShoppingItemPriority,
    status: r.status as ShoppingItemStatus,
  }))
}

export async function addShoppingItem(input: {
  name: string
  quantity: string
  unit: string
  priority: ShoppingItemPriority
  tripId: string | null
}): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('shopping_items').insert({
    family_id: familyId,
    trip_id: input.tripId,
    name: input.name,
    quantity: input.quantity || null,
    unit: input.unit || null,
    priority: input.priority,
  })
  if (error) throw error
}

export async function updateShoppingItemStatus(id: string, status: ShoppingItemStatus): Promise<void> {
  const { error } = await supabase
    .from('shopping_items')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteShoppingItem(id: string): Promise<void> {
  const { error } = await supabase.from('shopping_items').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------
// Compras programadas (Skill 08)
// ---------------------------------------------------------------------

export async function listShoppingTrips(): Promise<ShoppingTrip[]> {
  const { data, error } = await supabase
    .from('shopping_trips')
    .select('id, family_id, scheduled_date, store, budget, actual_amount, status')
    .order('scheduled_date', { ascending: true, nullsFirst: false })
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    familyId: r.family_id,
    scheduledDate: r.scheduled_date,
    store: r.store,
    budget: r.budget,
    actualAmount: r.actual_amount,
    status: r.status as TripStatus,
  }))
}

export async function createShoppingTrip(input: {
  scheduledDate: string | null
  store: string
  budget: number | null
}): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('shopping_trips').insert({
    family_id: familyId,
    scheduled_date: input.scheduledDate,
    store: input.store || null,
    budget: input.budget,
  })
  if (error) throw error
}

export async function completeShoppingTrip(id: string, actualAmount: number): Promise<void> {
  const { error } = await supabase
    .from('shopping_trips')
    .update({ status: 'completada', actual_amount: actualAmount })
    .eq('id', id)
  if (error) throw error
}

export async function deleteShoppingTrip(id: string): Promise<void> {
  const { error } = await supabase.from('shopping_trips').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------
// Inventario (Skill 12)
// ---------------------------------------------------------------------

export async function listInventoryItems(): Promise<InventoryItem[]> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('id, family_id, name, category, quantity')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    familyId: r.family_id,
    name: r.name,
    category: r.category as InventoryCategory,
    quantity: r.quantity,
  }))
}

export async function addInventoryItem(input: {
  name: string
  category: InventoryCategory
  quantity: string
}): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('inventory_items').insert({
    family_id: familyId,
    name: input.name,
    category: input.category,
    quantity: input.quantity || null,
  })
  if (error) throw error
}

export async function updateInventoryQuantity(id: string, quantity: string): Promise<void> {
  const { error } = await supabase
    .from('inventory_items')
    .update({ quantity: quantity || null, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteInventoryItem(id: string): Promise<void> {
  const { error } = await supabase.from('inventory_items').delete().eq('id', id)
  if (error) throw error
}
