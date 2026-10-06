// «Preparar compra del menú» (2.ª tanda): reúne los ingredientes REALES de las recetas vinculadas a platos
// que prepara la familia. Nunca inventa ingredientes, nunca suma unidades incompatibles y nunca guarda nada:
// devuelve un plan que la pantalla revisa antes de confirmar.
import { dishHasKitchenTools, type MenuToolsMode } from '@/domain/eventMenuHub'
import { scaleIngredientQuantity, parseSimpleNumber, type ScaleSkipReason } from '@/domain/recipeScaling'
import type { EventMenuItem, Recipe } from '@/domain/types'

export interface ShoppingPlanSource {
  dishName: string
  ingredientText: string // lo que dice la receta, tal cual
}

export interface ShoppingPlanLine {
  key: string
  name: string
  quantity: string | null // null = cantidad desconocida (nunca 0)
  unit: string
  sources: ShoppingPlanSource[]
  notes: ScaleSkipReason[] // por qué alguna cantidad no se escaló (para avisar en la revisión)
}

const MASS_TO_G: Record<string, number> = { g: 1, gr: 1, kg: 1000 }
const VOLUME_TO_ML: Record<string, number> = { ml: 1, cl: 10, l: 1000, lt: 1000, litro: 1000, litros: 1000 }

function normalizeName(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
}

// Unidades normalizadas: masa → gramos, volumen → mililitros; cualquier otra unidad se compara tal cual.
function unitFamily(unit: string): { family: 'masa' | 'volumen' | 'literal'; factor: number; label: string } {
  const u = unit.trim().toLowerCase()
  if (u in MASS_TO_G) return { family: 'masa', factor: MASS_TO_G[u], label: 'g' }
  if (u in VOLUME_TO_ML) return { family: 'volumen', factor: VOLUME_TO_ML[u], label: 'ml' }
  return { family: 'literal', factor: 1, label: unit.trim() }
}

function formatQuantity(value: number, family: 'masa' | 'volumen' | 'literal', label: string): string {
  if (family === 'masa' && value >= 1000) return `${String(Math.round((value / 1000) * 100) / 100).replace('.', ',')} kg`
  if (family === 'volumen' && value >= 1000) return `${String(Math.round((value / 1000) * 100) / 100).replace('.', ',')} l`
  const rounded = Math.round(value * 10) / 10
  return `${String(rounded).replace('.', ',')}${label ? ` ${label}` : ''}`
}

export function buildMenuShoppingPlan(
  items: EventMenuItem[],
  recipes: Recipe[],
  targetDiners: number,
  mode: MenuToolsMode,
): ShoppingPlanLine[] {
  const recipeById = new Map(recipes.map((r) => [r.id, r]))
  const groups = new Map<string, { name: string; family: 'masa' | 'volumen' | 'literal'; label: string; total: number | null; sources: ShoppingPlanSource[]; notes: Set<ScaleSkipReason> }>()

  for (const dish of items) {
    if (!dish.recipeId || !dishHasKitchenTools(mode, dish.preparedBy, dish.kind)) continue
    const recipe = recipeById.get(dish.recipeId)
    if (!recipe) continue
    for (const ing of recipe.ingredients) {
      const scaled = scaleIngredientQuantity(ing.quantity, ing.unit, recipe.servings, targetDiners)
      // La cantidad a sumar sale de la escalada cuando procede; si no, de la original (si es numérica).
      const shownNumber = scaled.scaled ? parseSimpleNumber(scaled.quantity?.split(' ')[0] ?? null) : parseSimpleNumber(ing.quantity)
      const rawUnit = (scaled.scaled ? (scaled.quantity?.split(' ').slice(1).join(' ') ?? '') : (ing.unit ?? '')).trim()
      const fam = unitFamily(rawUnit)
      const key = `${normalizeName(ing.name)}|${fam.family === 'literal' ? `lit:${fam.label.toLowerCase()}` : fam.family}`
      const group = groups.get(key) ?? { name: ing.name.trim(), family: fam.family, label: fam.label, total: 0, sources: [], notes: new Set<ScaleSkipReason>() }
      group.sources.push({ dishName: dish.name, ingredientText: [ing.name, ing.quantity, ing.unit].filter(Boolean).join(' ') })
      if (!scaled.scaled && scaled.reason) group.notes.add(scaled.reason)
      if (shownNumber === null || group.total === null) {
        group.total = null // una cantidad desconocida hace desconocido el total (no se suma un 0)
      } else {
        group.total += shownNumber * fam.factor
      }
      groups.set(key, group)
    }
  }

  return [...groups.entries()].map(([key, g]) => {
    const quantity = g.total === null ? null : formatQuantity(g.total, g.family, g.label)
    return { key, name: g.name, quantity, unit: g.label, sources: g.sources, notes: [...g.notes] }
  })
}
