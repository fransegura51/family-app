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
    .select('id, family_id, trip_id, name, quantity, unit, priority, status, store')
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
    store: r.store,
  }))
}

export async function addShoppingItem(input: {
  name: string
  quantity: string
  unit: string
  priority: ShoppingItemPriority
  tripId: string | null
  store?: string | null
}): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('shopping_items').insert({
    family_id: familyId,
    trip_id: input.tripId,
    name: input.name,
    quantity: input.quantity || null,
    unit: input.unit || null,
    priority: input.priority,
    store: input.store || null,
  })
  if (error) throw error
}

export async function updateShoppingItemStore(id: string, store: string): Promise<void> {
  const { error } = await supabase
    .from('shopping_items')
    .update({ store: store || null, updated_at: new Date().toISOString() })
    .eq('id', id)
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
    .select('id, family_id, scheduled_date, store, budget, actual_amount, status, member_id, calendar_event_id')
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
    memberId: r.member_id,
    calendarEventId: r.calendar_event_id,
  }))
}

// Si se asigna a un miembro, crea también el evento de calendario (con
// recordatorio real) para que le suene el aviso — "se lo asignas al
// calendario de Paco" no puede quedarse en un campo de texto suelto.
export async function createShoppingTrip(input: {
  scheduledDate: string | null
  store: string
  budget: number | null
  memberId: string | null
  reminderMinutes: number | null
}): Promise<void> {
  const familyId = await currentFamilyId()
  const { data: userResult } = await supabase.auth.getUser()

  let calendarEventId: string | null = null
  if (input.memberId && input.scheduledDate) {
    const { data: event, error: eventError } = await supabase
      .from('calendar_events')
      .insert({
        family_id: familyId,
        title: `Ir a comprar${input.store ? ` a ${input.store}` : ''}`,
        start_at: new Date(`${input.scheduledDate}T10:00`).toISOString(),
        all_day: false,
        reminder_minutes: input.reminderMinutes,
        created_by: userResult.user?.id ?? null,
      })
      .select('id')
      .single()
    if (eventError) throw eventError
    calendarEventId = event.id

    const { error: linkError } = await supabase
      .from('calendar_event_members')
      .insert({ event_id: event.id, member_id: input.memberId })
    if (linkError) throw linkError
  }

  const { error } = await supabase.from('shopping_trips').insert({
    family_id: familyId,
    scheduled_date: input.scheduledDate,
    store: input.store || null,
    budget: input.budget,
    member_id: input.memberId,
    calendar_event_id: calendarEventId,
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

export async function deleteShoppingTrip(trip: ShoppingTrip): Promise<void> {
  if (trip.calendarEventId) {
    await supabase.from('calendar_events').delete().eq('id', trip.calendarEventId)
  }
  const { error } = await supabase.from('shopping_trips').delete().eq('id', trip.id)
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
