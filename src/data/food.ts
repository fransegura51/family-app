import { supabase } from '@/data/supabaseClient'
import { addShoppingItem } from '@/data/shopping'
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
    .select('id, family_id, title, notes, recipe_ingredients(id, name, quantity, unit)')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    familyId: r.family_id,
    title: r.title,
    notes: r.notes,
    ingredients: (r.recipe_ingredients as { id: string; name: string; quantity: string | null; unit: string | null }[]).map(
      (i) => ({ id: i.id, name: i.name, quantity: i.quantity, unit: i.unit }),
    ),
  }))
}

// ingredientLines: una línea por ingrediente, "nombre, cantidad, unidad"
// — más simple que una UI de filas dinámicas para un primer MVP.
export async function createRecipe(input: { title: string; notes: string; ingredientLines: string[] }): Promise<void> {
  const familyId = await currentFamilyId()
  const { data: recipe, error } = await supabase
    .from('recipes')
    .insert({ family_id: familyId, title: input.title, notes: input.notes || null })
    .select('id')
    .single()
  if (error) throw error

  const ingredients = input.ingredientLines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, quantity, unit] = line.split(',').map((p) => p.trim())
      return { recipe_id: recipe.id, name, quantity: quantity || null, unit: unit || null }
    })

  if (ingredients.length > 0) {
    const { error: ingredientsError } = await supabase.from('recipe_ingredients').insert(ingredients)
    if (ingredientsError) throw ingredientsError
  }
}

export async function deleteRecipe(id: string): Promise<void> {
  const { error } = await supabase.from('recipes').delete().eq('id', id)
  if (error) throw error
}

// Flujo Menú → ingredientes → lista (Skill 15): añade los ingredientes de
// la receta a la lista de la compra de golpe.
export async function addRecipeIngredientsToShoppingList(recipe: Recipe): Promise<void> {
  for (const ingredient of recipe.ingredients) {
    await addShoppingItem({
      name: ingredient.name,
      quantity: ingredient.quantity ?? '',
      unit: ingredient.unit ?? '',
      priority: 'normal',
      tripId: null,
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
