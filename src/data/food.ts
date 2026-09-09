import { supabase } from '@/data/supabaseClient'
import { addShoppingItem } from '@/data/shopping'
import { compressImageFile } from '@/domain/imageCompression'
import type { FoodLog, MealType, MenuEntry, Recipe } from '@/domain/types'

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
// Recetas (Skill 15)
// ---------------------------------------------------------------------

export async function listRecipes(): Promise<Recipe[]> {
  const { data, error } = await supabase
    .from('recipes')
    .select('id, family_id, title, notes, image_path, tags, recipe_ingredients(id, name, quantity, unit)')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    familyId: r.family_id,
    title: r.title,
    notes: r.notes,
    imagePath: r.image_path,
    tags: r.tags ?? [],
    ingredients: (r.recipe_ingredients as { id: string; name: string; quantity: string | null; unit: string | null }[]).map(
      (i) => ({ id: i.id, name: i.name, quantity: i.quantity, unit: i.unit }),
    ),
  }))
}

function parseIngredientLines(lines: string[]): { name: string; quantity: string | null; unit: string | null }[] {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, quantity, unit] = line.split(',').map((p) => p.trim())
      return { name, quantity: quantity || null, unit: unit || null }
    })
}

// ingredientLines: una línea por ingrediente, "nombre, cantidad, unidad"
// — más simple que una UI de filas dinámicas para un primer MVP.
export async function createRecipe(input: {
  title: string
  notes: string
  ingredientLines: string[]
  tags: string[]
  imagePath: string | null
}): Promise<void> {
  const familyId = await currentFamilyId()
  const { data: recipe, error } = await supabase
    .from('recipes')
    .insert({ family_id: familyId, title: input.title, notes: input.notes || null, tags: input.tags, image_path: input.imagePath })
    .select('id')
    .single()
  if (error) throw error

  const ingredients = parseIngredientLines(input.ingredientLines).map((i) => ({ recipe_id: recipe.id, ...i }))
  if (ingredients.length > 0) {
    const { error: ingredientsError } = await supabase.from('recipe_ingredients').insert(ingredients)
    if (ingredientsError) throw ingredientsError
  }
}

// Petición real: "hay que poder editar las recetas no solo comprar o
// borrar" — no había ninguna forma de corregir una receta ya guardada.
// Los ingredientes se sustituyen enteros (borrar + volver a insertar)
// en vez de intentar casar cada línea con su fila original — más
// simple y suficiente, dado que el formulario ya es "una línea de
// texto por ingrediente", no filas editables una a una.
export async function updateRecipe(
  id: string,
  input: { title: string; notes: string; ingredientLines: string[]; tags: string[]; imagePath: string | null },
): Promise<void> {
  // Si se cambia o se quita la foto, la anterior se queda huérfana en
  // el storage si no se borra aquí — bug real, encontrado probando en
  // vivo (deleteRecipe tampoco la borraba).
  const { data: existing } = await supabase.from('recipes').select('image_path').eq('id', id).single()
  if (existing?.image_path && existing.image_path !== input.imagePath) {
    await supabase.storage.from('recipe-photos').remove([existing.image_path])
  }

  const { error } = await supabase
    .from('recipes')
    .update({ title: input.title, notes: input.notes || null, tags: input.tags, image_path: input.imagePath })
    .eq('id', id)
  if (error) throw error

  const { error: deleteError } = await supabase.from('recipe_ingredients').delete().eq('recipe_id', id)
  if (deleteError) throw deleteError

  const ingredients = parseIngredientLines(input.ingredientLines).map((i) => ({ recipe_id: id, ...i }))
  if (ingredients.length > 0) {
    const { error: insertError } = await supabase.from('recipe_ingredients').insert(ingredients)
    if (insertError) throw insertError
  }
}

export async function deleteRecipe(id: string): Promise<void> {
  const { data: existing } = await supabase.from('recipes').select('image_path').eq('id', id).single()
  const { error } = await supabase.from('recipes').delete().eq('id', id)
  if (error) throw error
  if (existing?.image_path) await supabase.storage.from('recipe-photos').remove([existing.image_path])
}

// Misma convención que uploadMemberPhoto — bucket privado propio,
// signed URL para verla (nunca pública).
export async function uploadRecipePhoto(file: File): Promise<string> {
  const familyId = await currentFamilyId()
  const compressed = await compressImageFile(file)
  const ext = compressed.name.split('.').pop() || 'jpg'
  const path = `${familyId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('recipe-photos').upload(path, compressed)
  if (error) throw error
  return path
}

export async function getRecipePhotoUrl(imagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('recipe-photos').createSignedUrl(imagePath, 3600)
  if (error) throw error
  return data.signedUrl
}

// Petición real: "que se me quede un historial de las recetas que he
// buscado antes... y conforme vaya escribiendo se me vaya
// autocompletando" — un registro por búsqueda distinta (no una fila
// por cada vez que se repite la misma), para alimentar un <datalist>
// en el campo Título.
export async function logRecipeSearch(query: string): Promise<void> {
  const trimmed = query.trim()
  if (!trimmed) return
  const familyId = await currentFamilyId()
  const { data: existing } = await supabase
    .from('recipe_search_history')
    .select('id')
    .eq('family_id', familyId)
    .eq('query', trimmed)
    .maybeSingle()
  if (existing) {
    await supabase.from('recipe_search_history').update({ searched_at: new Date().toISOString() }).eq('id', existing.id)
  } else {
    await supabase.from('recipe_search_history').insert({ family_id: familyId, query: trimmed })
  }
}

export async function listRecipeSearchHistory(): Promise<string[]> {
  const { data, error } = await supabase
    .from('recipe_search_history')
    .select('query')
    .order('searched_at', { ascending: false })
    .limit(30)
  if (error) throw error
  return data.map((r) => r.query)
}

// Flujo Menú → ingredientes → lista (Skill 15): añade a la lista de la
// compra solo los ingredientes elegidos (no siempre hace falta
// comprarlos todos — petición real), cada uno en la tienda que se
// indique.
export async function addRecipeIngredientsToShoppingList(
  recipe: Recipe,
  selections: { ingredientId: string; store: string | null }[],
): Promise<void> {
  const byId = new Map(recipe.ingredients.map((i) => [i.id, i]))
  for (const sel of selections) {
    const ingredient = byId.get(sel.ingredientId)
    if (!ingredient) continue
    await addShoppingItem({
      name: ingredient.name,
      quantity: ingredient.quantity ?? '',
      unit: ingredient.unit ?? '',
      priority: 'normal',
      tripId: null,
      store: sel.store,
    })
  }
}

// ---------------------------------------------------------------------
// Menú semanal (Skill 15)
// ---------------------------------------------------------------------

export async function listMenuEntries(startDate: string, endDate: string): Promise<MenuEntry[]> {
  const { data, error } = await supabase
    .from('menu_entries')
    .select('id, family_id, entry_date, meal_type, recipe_id, free_text')
    .gte('entry_date', startDate)
    .lte('entry_date', endDate)
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    familyId: r.family_id,
    entryDate: r.entry_date,
    mealType: r.meal_type as MealType,
    recipeId: r.recipe_id,
    freeText: r.free_text,
  }))
}

export async function setMenuEntry(input: {
  entryDate: string
  mealType: MealType
  recipeId: string | null
  freeText: string | null
}): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('menu_entries').insert({
    family_id: familyId,
    entry_date: input.entryDate,
    meal_type: input.mealType,
    recipe_id: input.recipeId,
    free_text: input.freeText,
  })
  if (error) throw error
}

export async function deleteMenuEntry(id: string): Promise<void> {
  const { error } = await supabase.from('menu_entries').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------
// Registro de alimentación (Skill 14/16)
// ---------------------------------------------------------------------

export async function listFoodLogs(memberId: string, date: string): Promise<FoodLog[]> {
  const { data, error } = await supabase
    .from('food_logs')
    .select('id, family_id, member_id, log_date, meal_type, description, calories, protein_g, carbs_g, fat_g, is_estimated')
    .eq('member_id', memberId)
    .eq('log_date', date)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    familyId: r.family_id,
    memberId: r.member_id,
    logDate: r.log_date,
    mealType: r.meal_type as MealType,
    description: r.description,
    calories: r.calories,
    proteinG: r.protein_g,
    carbsG: r.carbs_g,
    fatG: r.fat_g,
    isEstimated: r.is_estimated,
  }))
}

// Últimos alimentos registrados por esa persona, sin filtrar por día —
// para poder repetir "café con leche" con un toque en vez de escribirlo
// de cero otra vez cada mañana. La deduplicación por nombre se hace en
// la UI (aquí se trae tal cual, más reciente primero).
export async function listRecentFoodLogs(memberId: string, limit = 40): Promise<FoodLog[]> {
  const { data, error } = await supabase
    .from('food_logs')
    .select('id, family_id, member_id, log_date, meal_type, description, calories, protein_g, carbs_g, fat_g, is_estimated')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    familyId: r.family_id,
    memberId: r.member_id,
    logDate: r.log_date,
    mealType: r.meal_type as MealType,
    description: r.description,
    calories: r.calories,
    proteinG: r.protein_g,
    carbsG: r.carbs_g,
    fatG: r.fat_g,
    isEstimated: r.is_estimated,
  }))
}

export async function addFoodLog(input: {
  memberId: string
  date: string
  mealType: MealType
  description: string
  calories: number | null
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
  isEstimated: boolean
}): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('food_logs').insert({
    family_id: familyId,
    member_id: input.memberId,
    log_date: input.date,
    meal_type: input.mealType,
    description: input.description,
    calories: input.calories,
    protein_g: input.proteinG,
    carbs_g: input.carbsG,
    fat_g: input.fatG,
    is_estimated: input.isEstimated,
  })
  if (error) throw error
}

export async function deleteFoodLog(id: string): Promise<void> {
  const { error } = await supabase.from('food_logs').delete().eq('id', id)
  if (error) throw error
}
