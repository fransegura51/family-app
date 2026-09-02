import { supabase } from '@/data/supabaseClient'
import type { ShoppingStoreEntry } from '@/domain/types'

export async function listShoppingStores(): Promise<ShoppingStoreEntry[]> {
  const { data, error } = await supabase.from('shopping_stores').select('id, family_id, name').order('name')
  if (error) throw error
  return data.map((r) => ({ id: r.id, familyId: r.family_id, name: r.name }))
}

export async function createShoppingStore(name: string): Promise<void> {
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  const { data: profileRow, error: profileError } = await supabase
    .from('profiles')
    .select('family_id')
    .eq('id', userResult.user.id)
    .single()
  if (profileError) throw profileError

  const { error } = await supabase.from('shopping_stores').insert({ family_id: profileRow.family_id, name: name.trim() })
  if (error) throw error
}

// Renombrar no solo cambia la tienda "conocida" — también actualiza los
// productos ya apuntados con el nombre antiguo, para que no se queden
// huérfanos en un grupo aparte con el nombre de antes de corregirlo.
export async function renameShoppingStore(id: string, name: string): Promise<void> {
  const trimmed = name.trim()
  const { data: existing, error: fetchError } = await supabase.from('shopping_stores').select('name').eq('id', id).single()
  if (fetchError) throw fetchError

  const { error } = await supabase.from('shopping_stores').update({ name: trimmed }).eq('id', id)
  if (error) throw error

  if (existing.name !== trimmed) {
    const { error: itemsError } = await supabase.from('shopping_items').update({ store: trimmed }).eq('store', existing.name)
    if (itemsError) throw itemsError
  }
}

export async function deleteShoppingStore(id: string): Promise<void> {
  const { error } = await supabase.from('shopping_stores').delete().eq('id', id)
  if (error) throw error
}
