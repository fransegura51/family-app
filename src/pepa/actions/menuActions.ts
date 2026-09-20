import { addRecipeIngredientsToShoppingList, setMenuEntry, updateMenuEntry } from '@/data/food'
import { kitchenDateLabel } from '@/domain/kitchenQuery'
import { MEAL_LABELS } from '@/domain/kitchenMenu'
import { normalize } from '@/domain/voiceQuery'
import type { MealType } from '@/domain/types'
import { defineAction, type Choice } from '@/pepa/actions/types'
import { rememberRecipes } from '@/pepa/recentContext'
import { asRecord, isRealIsoDate, isUniqueStringArray, unknownKeys } from '@/pepa/actions/validators'

const MEAL_TYPES: readonly MealType[] = ['desayuno', 'comida', 'merienda', 'cena', 'snack']
const MEAL_CHOICES: MealType[] = ['desayuno', 'comida', 'merienda', 'cena']

function isMealType(value: unknown): value is MealType {
  return typeof value === 'string' && (MEAL_TYPES as readonly string[]).includes(value)
}

// ---------------------------------------------------------------------
// menu.set — apuntar un plato en el menú
// ---------------------------------------------------------------------

export interface MenuSetParams {
  date: string
  mealType: MealType
  // Receta elegida, o null para guardar solo el texto (dishText).
  recipeId: string | null
  dishText: string
  // Otras recetas que también encajan, para elegir en la tarjeta.
  alternatives: string[]
}

const MENU_SET_KEYS = ['date', 'mealType', 'recipeId', 'dishText', 'alternatives'] as const

export const menuSetAction = defineAction<MenuSetParams>({
  id: 'menu.set',

  validate(raw, ctx) {
    const rec = asRecord(raw)
    if (!rec) return { ok: false, errors: ['Petición no válida'] }
    const errors: string[] = []
    const extra = unknownKeys(rec, MENU_SET_KEYS)
    if (extra.length > 0) errors.push(`Campos no permitidos: ${extra.join(', ')}`)
    if (!isRealIsoDate(rec.date)) errors.push('La fecha no es válida')
    if (!isMealType(rec.mealType)) errors.push('La comida no es válida')
    const recipeIds = new Set(ctx.recipes.map((r) => r.id))
    if (rec.recipeId !== null && (typeof rec.recipeId !== 'string' || !recipeIds.has(rec.recipeId))) errors.push('La receta no existe')
    const dishText = typeof rec.dishText === 'string' ? rec.dishText.trim() : ''
    if (dishText.length > 80) errors.push('El nombre del plato es demasiado largo')
    if (rec.recipeId === null && dishText.length === 0) errors.push('Falta el nombre del plato')
    if (!isUniqueStringArray(rec.alternatives, 5) || !rec.alternatives.every((id) => recipeIds.has(id))) errors.push('Las recetas alternativas no son válidas')
    if (errors.length > 0) return { ok: false, errors }
    return {
      ok: true,
      params: {
        date: rec.date as string,
        mealType: rec.mealType as MealType,
        recipeId: rec.recipeId as string | null,
        dishText,
        alternatives: rec.alternatives as string[],
      },
    }
  },

  initialSelection(params) {
    return { choices: { meal: params.mealType, dish: params.recipeId ?? 'free' }, checked: [] }
  },

  applySelection(params, selection) {
    const meal = selection.choices.meal
    const dish = selection.choices.dish
    return {
      ...params,
      mealType: (meal ?? params.mealType) as MealType,
      recipeId: dish === undefined ? params.recipeId : dish === 'free' ? null : dish,
    }
  },

  present(params, ctx) {
    const recipe = params.recipeId ? ctx.recipes.find((r) => r.id === params.recipeId) : null
    const dishName = recipe ? recipe.title : params.dishText
    const choices: Choice[] = [
      { id: 'meal', label: 'Comida del día', options: MEAL_CHOICES.map((m) => ({ key: m, label: MEAL_LABELS[m][0].toUpperCase() + MEAL_LABELS[m].slice(1) })) },
    ]
    if (params.alternatives.length > 1 || (params.alternatives.length === 1 && params.recipeId === null)) {
      choices.push({
        id: 'dish',
        label: 'Plato',
        options: [
          ...params.alternatives.map((id) => ({ key: id, label: ctx.recipes.find((r) => r.id === id)?.title ?? id })),
          { key: 'free', label: `Solo texto: «${params.dishText}»` },
        ],
      })
    }

    const warnings: string[] = []
    const existing = ctx.menuEntries.filter((e) => e.entryDate === params.date && e.mealType === params.mealType)
    if (existing.length === 1) {
      const current = existing[0].recipeId ? ctx.recipes.find((r) => r.id === existing[0].recipeId)?.title : existing[0].freeText
      warnings.push(`Ahora hay «${current ?? 'otro plato'}»: se sustituirá.`)
    } else if (existing.length > 1) {
      warnings.push(`Ya hay ${existing.length} platos ahí: se añadirá uno más.`)
    }

    return {
      title: '🍽️ Apuntar en el menú',
      lines: [`Plato: ${dishName}`, `Día: ${kitchenDateLabel(params.date, ctx.today)}`],
      warnings,
      choices,
      checks: [],
      confirmLabel: 'Guardar en el menú',
    }
  },

  async execute(params, ctx) {
    const recipe = params.recipeId ? ctx.recipes.find((r) => r.id === params.recipeId) : null
    const freeText = recipe ? null : params.dishText
    const existing = ctx.menuEntries.filter((e) => e.entryDate === params.date && e.mealType === params.mealType)
    if (existing.length === 1) {
      await updateMenuEntry(existing[0].id, { recipeId: recipe?.id ?? null, freeText })
    } else {
      await setMenuEntry({ entryDate: params.date, mealType: params.mealType, recipeId: recipe?.id ?? null, freeText })
    }
    window.dispatchEvent(new CustomEvent('family-app:menu-changed'))
    // "Añade los ingredientes a la compra" justo después se refiere a este plato.
    if (recipe) rememberRecipes([recipe.id])
    return `Apuntado en el menú: ${recipe ? recipe.title : params.dishText} — ${kitchenDateLabel(params.date, ctx.today)}, ${MEAL_LABELS[params.mealType]}.`
  },
})

// ---------------------------------------------------------------------
// menu.ingredients_to_shopping — pasar ingredientes de una receta a la lista
// ---------------------------------------------------------------------

export interface IngredientsToShoppingParams {
  recipeId: string
  ingredientIds: string[]
  // Tienda para todos los ingredientes. null = sin tienda (como siempre). Solo sale de
  // lo que dice la persona o de las tiendas dadas de alta: nunca se deduce ni se inventa.
  store?: string | null
}

const INGREDIENTS_KEYS = ['recipeId', 'ingredientIds', 'store'] as const
const NO_STORE = 'none'

export const ingredientsToShoppingAction = defineAction<IngredientsToShoppingParams>({
  id: 'menu.ingredients_to_shopping',

  validate(raw, ctx) {
    const rec = asRecord(raw)
    if (!rec) return { ok: false, errors: ['Petición no válida'] }
    const extra = unknownKeys(rec, INGREDIENTS_KEYS)
    if (extra.length > 0) return { ok: false, errors: [`Campos no permitidos: ${extra.join(', ')}`] }
    const recipe = typeof rec.recipeId === 'string' ? ctx.recipes.find((r) => r.id === rec.recipeId) : undefined
    if (!recipe) return { ok: false, errors: ['La receta no existe'] }
    if (!isUniqueStringArray(rec.ingredientIds, 60)) return { ok: false, errors: ['Los ingredientes no son válidos'] }
    const known = new Set(recipe.ingredients.map((i) => i.id))
    if (!rec.ingredientIds.every((id) => known.has(id))) return { ok: false, errors: ['Algún ingrediente no es de esa receta'] }
    if (rec.ingredientIds.length === 0) return { ok: false, errors: ['Elige al menos un ingrediente'] }
    const store = rec.store === undefined || rec.store === null ? null : rec.store
    if (store !== null && (typeof store !== 'string' || store.trim().length === 0 || store.trim().length > 60 || /[\n\r]/.test(store))) {
      return { ok: false, errors: ['La tienda no es válida'] }
    }
    return { ok: true, params: { recipeId: recipe.id, ingredientIds: rec.ingredientIds, store: store === null ? null : store.trim() } }
  },

  initialSelection(params, ctx) {
    const recipe = ctx.recipes.find((r) => r.id === params.recipeId)
    const inList = new Set(ctx.shoppingItemNames.map((n) => normalize(n)))
    const checked = params.ingredientIds.filter((id) => {
      const ingredient = recipe?.ingredients.find((i) => i.id === id)
      return ingredient ? !inList.has(normalize(ingredient.name)) : false
    })
    const choices: Record<string, string> = ctx.storeNames && ctx.storeNames.length > 0 ? { store: params.store ?? NO_STORE } : {}
    return { choices, checked }
  },

  applySelection(params, selection) {
    const store = selection.choices.store
    return { ...params, ingredientIds: selection.checked, store: store === undefined ? params.store : store === NO_STORE ? null : store }
  },

  present(params, ctx) {
    const recipe = ctx.recipes.find((r) => r.id === params.recipeId)
    const inList = new Set(ctx.shoppingItemNames.map((n) => normalize(n)))
    const names = ctx.storeNames ?? []
    const choices: Choice[] =
      names.length > 0
        ? [
            {
              id: 'store',
              label: 'Tienda',
              options: [{ key: NO_STORE, label: 'Sin tienda' }, ...[...new Set([...names, ...(params.store ? [params.store] : [])])].map((n) => ({ key: n, label: n }))],
            },
          ]
        : []
    return {
      title: '🛒 Añadir a la lista de la compra',
      lines: [`Receta: ${recipe?.title ?? ''}`, ...(names.length === 0 ? [params.store ? `Tienda: ${params.store}` : 'Sin tienda concreta'] : [])],
      warnings: [],
      choices,
      checks: (recipe?.ingredients ?? []).map((i) => ({
        key: i.id,
        label: [i.name, [i.quantity, i.unit].filter(Boolean).join(' ')].filter(Boolean).join(' — '),
        note: inList.has(normalize(i.name)) ? 'ya está en la lista' : undefined,
      })),
      confirmLabel: 'Añadir a la lista',
    }
  },

  async execute(params, ctx) {
    const recipe = ctx.recipes.find((r) => r.id === params.recipeId)
    if (!recipe) throw new Error('La receta no existe')
    await addRecipeIngredientsToShoppingList(
      recipe,
      params.ingredientIds.map((ingredientId) => ({ ingredientId, store: params.store ?? null })),
    )
    window.dispatchEvent(new CustomEvent('family-app:compras-changed'))
    const names = params.ingredientIds.map((id) => recipe.ingredients.find((i) => i.id === id)?.name).filter(Boolean)
    return `Añadido a la lista de la compra${params.store ? ` (${params.store})` : ''}: ${names.join(', ')}.`
  },
})
