// «Preparar compra del menú»: reúne los ingredientes REALES de las recetas vinculadas a platos que prepara la
// familia. Nunca inventa ingredientes, nunca suma unidades incompatibles y nunca guarda nada: devuelve un plan que
// la pantalla revisa antes de confirmar. Las cantidades se suman como NÚMEROS; el formato solo afecta a la vista.
import { dishHasKitchenTools, type MenuToolsMode } from '@/domain/eventMenuHub'
import { displayUnit, scaleIngredientQuantity, unitInfo, type ScaleNote, type UnitInfo } from '@/domain/recipeScaling'
import type { EventMenuItem, Recipe } from '@/domain/types'

export interface ShoppingPlanSource {
  dishName: string
  ingredientText: string // lo que dice la receta, tal cual
}

export interface ShoppingPlanLine {
  key: string
  name: string
  quantity: string | null // texto para mostrar; null = cantidad desconocida (nunca 0)
  unit: string
  sources: ShoppingPlanSource[]
  notes: ScaleNote[] // por qué alguna cantidad no se escaló o el resultado es fraccionario (para revisar)
}

function normalizeName(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
}

// Número para mostrar: como mucho 2 decimales, con coma. Solo presentación: el valor sumado no se redondea.
function formatNumber(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',')
}

interface Group {
  name: string
  info: UnitInfo | null // null = unidad no interpretable: solo se suma con la misma unidad escrita
  literal: string
  total: number | null
  sources: ShoppingPlanSource[]
  notes: Set<ScaleNote>
}

function groupQuantityText(g: Group): string | null {
  if (g.total === null) return null
  if (!g.info) return g.literal ? `${formatNumber(g.total)} ${g.literal}` : formatNumber(g.total)
  if (g.info.family === 'masa') return g.total >= 1000 ? `${formatNumber(g.total / 1000)} kg` : `${formatNumber(g.total)} g`
  if (g.info.family === 'volumen') return g.total >= 1000 ? `${formatNumber(g.total / 1000)} l` : `${formatNumber(g.total)} ml`
  return `${formatNumber(g.total)} ${displayUnit(g.info, g.total)}`
}

export function buildMenuShoppingPlan(items: EventMenuItem[], recipes: Recipe[], targetDiners: number, mode: MenuToolsMode): ShoppingPlanLine[] {
  const recipeById = new Map(recipes.map((r) => [r.id, r]))
  const groups = new Map<string, Group>()

  for (const dish of items) {
    if (!dish.recipeId || !dishHasKitchenTools(mode, dish.preparedBy, dish.kind)) continue
    const recipe = recipeById.get(dish.recipeId)
    if (!recipe) continue
    for (const ing of recipe.ingredients) {
      const scaled = scaleIngredientQuantity(ing.quantity, ing.unit, recipe.servings, targetDiners)
      const info = unitInfo(ing.unit)
      const literal = (ing.unit ?? '').trim().toLowerCase()
      // Masa con masa, volumen con volumen (factor a g / ml); el resto solo con la misma familia de unidad.
      // Una unidad no interpretable se agrupa por su texto literal: nunca se convierte ni se suma con otra.
      const key = info ? `${normalizeName(ing.name)}|${info.family}` : `${normalizeName(ing.name)}|lit:${literal}`
      const group = groups.get(key) ?? { name: ing.name.trim(), info, literal: (ing.unit ?? '').trim(), total: 0, sources: [], notes: new Set<ScaleNote>() }
      group.sources.push({ dishName: dish.name, ingredientText: [ing.name, ing.quantity, ing.unit].filter(Boolean).join(' ') })
      if (scaled.reason) group.notes.add(scaled.reason)
      if (scaled.fractional) group.notes.add('fraccionario')
      const amount = scaled.value === null ? null : scaled.value * (info ? info.factor : 1)
      group.total = amount === null || group.total === null ? null : group.total + amount
      groups.set(key, group)
    }
  }

  return [...groups.entries()].map(([key, g]) => ({
    key,
    name: g.name,
    quantity: groupQuantityText(g),
    unit: g.info ? g.info.label : g.literal,
    sources: g.sources,
    notes: [...g.notes],
  }))
}
