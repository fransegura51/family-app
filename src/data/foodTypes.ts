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
  // Clave estable de la clase en el catálogo PEPA (null = clase personal de la familia). La usa el resolutor de clases
  // para traducir lo que aprende el conocimiento compartido al nombre que la familia le dio.
  catalogKey: string | null
}

export async function listFamilyFoodTypes(kind: FoodTypeKind): Promise<FamilyFoodType[]> {
  const { data, error } = await supabase
    .from('family_food_types')
    .select('id, family_id, name, icon, kind, catalog_key')
    .eq('kind', kind)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data.map((r) => ({ id: r.id, familyId: r.family_id, name: r.name, icon: r.icon, kind: r.kind, catalogKey: r.catalog_key ?? null }))
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

// DECISIÓN EXPLÍCITA de la familia sobre la clase de un producto — reutiliza la columna `category`. Es lo ÚNICO que escribe
// products.category desde la Fase 5: una clase elegida a mano queda guardada CON su marca `class_confirmed_at` (LA FAMILIA MANDA:
// ni el aprendizaje compartido ni las reglas la sustituyen). `null` = «Automático»: borra la clase y la confirmación, y la clase
// vuelve a resolverse dinámicamente (compartida → reglas → respaldo).
// NUNCA se llama con una clasificación automática (compartida, reglas o respaldo): esas se resuelven al leer, no se guardan.
// Solo afecta a la familia del usuario (RLS) y no toca el aprendizaje compartido. Vale igual para Alimentos que para Otros.
//
// FASE 6C: al elegir una clase, `kind` (el de ESA clase) mantiene la marca heredada `non_food` coherente EN LA MISMA escritura
// (atómica): clase de alimentación → non_food=false, clase de no alimentos → non_food=true. Se deriva SIEMPRE de la clase elegida,
// nunca de la tienda. «Automático» (null) no cambia non_food: sin clase conocida sigue valiendo la última marca de Alimentos/Otros y
// la familia puede cambiarla con «Marcar como Otros».
export async function setProductFoodType(productId: string, typeName: string | null, kind?: FoodTypeKind): Promise<void> {
  const name = typeName?.trim() || null
  const { error } = await supabase
    .from('products')
    .update({
      category: name,
      class_confirmed_at: name ? new Date().toISOString() : null,
      ...(name && kind ? { non_food: kind === 'no_alimentos' } : {}),
    })
    .eq('id', productId)
  if (error) throw error
}
