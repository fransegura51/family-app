import { supabase } from '@/data/supabaseClient'

// Petición real: "reestructuramos la creación de clases y la hacemos
// para todos los productos, misma separación por un botón Alimentos y
// Otros" — family_food_types sirve DOS conjuntos independientes de
// clases (uno por `kind`), no solo el de alimentación.
export type FoodTypeKind = 'alimentacion' | 'no_alimentos'

export interface FamilyFoodType {
  id: string
  familyId: string
  name: string
  icon: string
  kind: FoodTypeKind
}

export async function listFamilyFoodTypes(kind: FoodTypeKind): Promise<FamilyFoodType[]> {
  const { data, error } = await supabase
    .from('family_food_types')
    .select('id, family_id, name, icon, kind')
    .eq('kind', kind)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data.map((r) => ({ id: r.id, familyId: r.family_id, name: r.name, icon: r.icon, kind: r.kind }))
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

export async function createFamilyFoodType(name: string, icon: string, kind: FoodTypeKind): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('family_food_types').insert({ family_id: familyId, name: name.trim(), icon, kind })
  if (error) throw error
}

// Siembra las clases de fábrica (domain/foodTypes.ts, FOOD_TYPES o
// NO_FOOD_TYPES según el `kind`) la primera vez que la familia abre
// cada conjunto — mismo patrón que seedCategoryTree en Presupuesto
// Generales, para no tener que darlas de alta a mano.
export async function seedFamilyFoodTypes(seed: { name: string; icon: string }[], kind: FoodTypeKind): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase
    .from('family_food_types')
    .insert(seed.map((s) => ({ family_id: familyId, name: s.name, icon: s.icon, kind })))
  if (error) throw error
}

// Petición real: "las clases... editables (lápiz) y los emojis
// también editables" — nombre e icono en la misma llamada, ya que la
// ficha de edición los enseña juntos.
export async function updateFamilyFoodType(id: string, name: string, icon: string): Promise<void> {
  const { error } = await supabase.from('family_food_types').update({ name: name.trim(), icon }).eq('id', id)
  if (error) throw error
}

export async function deleteFamilyFoodType(id: string): Promise<void> {
  const { error } = await supabase.from('family_food_types').delete().eq('id', id)
  if (error) throw error
}

// Excepción manual a la clasificación de un producto (automática solo
// para Alimentos, ver domain/foodTypes.ts) — reutiliza la columna
// `category`, ya presente en products y sin ningún otro uso hasta
// ahora. Vale igual para Alimentos que para Otros: un producto solo
// pertenece a un conjunto a la vez (ver isFoodPurchase), así que no
// hace falta guardar también el `kind` aquí.
export async function setProductFoodType(productId: string, typeName: string | null): Promise<void> {
  const { error } = await supabase.from('products').update({ category: typeName }).eq('id', productId)
  if (error) throw error
}
