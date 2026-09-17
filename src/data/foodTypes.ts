import { supabase } from '@/data/supabaseClient'

export interface FamilyFoodType {
  id: string
  familyId: string
  name: string
  icon: string
}

export async function listFamilyFoodTypes(): Promise<FamilyFoodType[]> {
  const { data, error } = await supabase
    .from('family_food_types')
    .select('id, family_id, name, icon')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data.map((r) => ({ id: r.id, familyId: r.family_id, name: r.name, icon: r.icon }))
}

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

export async function createFamilyFoodType(name: string, icon: string): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('family_food_types').insert({ family_id: familyId, name: name.trim(), icon })
  if (error) throw error
}

// Siembra las 11 clases de fábrica (domain/foodTypes.ts) la primera
// vez que la familia abre esto — mismo patrón que seedCategoryTree en
// Presupuesto Generales, para no tener que darlas de alta a mano.
export async function seedFamilyFoodTypes(seed: { name: string; icon: string }[]): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase
    .from('family_food_types')
    .insert(seed.map((s) => ({ family_id: familyId, name: s.name, icon: s.icon })))
  if (error) throw error
}

export async function deleteFamilyFoodType(id: string): Promise<void> {
  const { error } = await supabase.from('family_food_types').delete().eq('id', id)
  if (error) throw error
}

// Excepción manual a la clasificación automática de un producto (ver
// domain/foodTypes.ts) — reutiliza la columna `category`, ya presente
// en products y sin ningún otro uso hasta ahora.
export async function setProductFoodType(productId: string, typeName: string | null): Promise<void> {
  const { error } = await supabase.from('products').update({ category: typeName }).eq('id', productId)
  if (error) throw error
}
