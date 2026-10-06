// «Preparar compra del menú»: reúne lo que la familia compra para el menú. Dos fuentes, sin mezclarlas:
//  - Plato CON receta enlazada → ingredientes REALES de la receta (la receta es la fuente de verdad). No se añade el
//    nombre del plato.
//  - Plato SIN receta que prepara la familia → propuesta basada solo en su NOMBRE: una línea, o los productos
//    separados si el nombre enumera explícitamente varios (regla textual y conservadora, nunca culinaria).
// Nada se guarda aquí: devuelve un plan que la pantalla revisa antes de confirmar. Las cantidades se suman como
// NÚMEROS; el formato solo afecta a la vista. Un plato de proveedor, incluido o sin comida queda fuera por el
// modo de comida (datos estructurados), nunca por su texto.
import { dishHasKitchenTools, type MenuToolsMode } from '@/domain/eventMenuHub'
import { displayUnit, scaleIngredientQuantity, unitInfo, type ScaleNote, type UnitInfo } from '@/domain/recipeScaling'
import type { EventMenuItem, Recipe } from '@/domain/types'

export interface ShoppingPlanSource {
  dishName: string
  ingredientText: string // lo que dice la receta (o el nombre del plato), tal cual
}

export interface ShoppingPlanLine {
  key: string
  name: string
  quantity: string | null // texto para mostrar; null = cantidad desconocida (nunca 0)
  unit: string
  sources: ShoppingPlanSource[]
  notes: ScaleNote[] // por qué alguna cantidad no se escaló o el resultado es fraccionario (para revisar)
  // true = propuesta desde el nombre de un plato sin receta: el nombre es editable en la revisión.
  direct: boolean
}

function normalizeName(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
}

// Número para mostrar: como mucho 2 decimales, con coma. Solo presentación: el valor sumado no se redondea.
function formatNumber(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',')
}

// ---------------------------------------------------------------------
// Platos sin receta: enumeración EXPLÍCITA del nombre
// ---------------------------------------------------------------------
// Palabras que indican una expresión culinaria («aceite de oliva», «gambas al ajillo», «arroz con leche»): si
// aparecen en cualquier parte del nombre, no se separa nada.
const CULINARY_LINK_WORDS = new Set(['de', 'del', 'al', 'a', 'con', 'en', 'para', 'sin', 'la', 'el', 'los', 'las', 'un', 'una', 'por', 'o', 'u', 'e', 'y'])

// Devuelve los productos SOLO si el nombre es una lista con comas (y, como mucho, un «y»/«e» final):
// «Jamón, queso y almendras» → [Jamón, queso, almendras]. Todo lo demás → null (se conserva el nombre completo):
// sin coma («Pan y picos», «Tortilla de patatas»), con paréntesis o cifras, con palabras de enlace, con partes
// largas o repetidas. Preferimos no separar a separar mal.
export function explicitProductList(name: string): string[] | null {
  const text = name.trim().replace(/\s+/g, ' ')
  if (!text.includes(',')) return null
  if (/[()\d:;/]/.test(text)) return null
  const parts = text.split(/\s*,\s*|\s+(?:y|e)\s+/).map((p) => p.trim()).filter(Boolean)
  if (parts.length < 2 || parts.length > 6) return null
  const seen = new Set<string>()
  for (const part of parts) {
    if (!/^[\p{L}]+(?: [\p{L}]+){0,2}$/u.test(part)) return null
    const words = part.toLowerCase().split(' ')
    if (words.some((w) => CULINARY_LINK_WORDS.has(w))) return null
    const key = normalizeName(part)
    if (seen.has(key)) return null
    seen.add(key)
  }
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1))
}

// Un plato es «de compra directa» cuando NO tiene receta enlazada y la familia lo prepara según el modo de comida
// (la misma regla que el 🛒 de cada plato). Con receta enlazada, la receta manda: nunca es directo.
export function isDirectShoppingDish(dish: EventMenuItem, mode: MenuToolsMode): boolean {
  return dish.requiresPurchase !== false && !dish.recipeId && dishHasKitchenTools(mode, dish.preparedBy, dish.kind)
}

// Propuestas de un plato sin receta: sus productos explícitos, o el propio nombre del plato. Sin cantidad.
export function directShoppingLines(dish: EventMenuItem): ShoppingPlanLine[] {
  const names = explicitProductList(dish.name) ?? [dish.name.trim()]
  return names.map((name, i) => ({
    key: `direct:${dish.id}:${i}`,
    name,
    quantity: null,
    unit: '',
    sources: [{ dishName: dish.name, ingredientText: name }],
    notes: [],
    direct: true,
  }))
}

// ---------------------------------------------------------------------
// Platos con receta: ingredientes reales, sumados por equivalencia segura
// ---------------------------------------------------------------------
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
  const direct: ShoppingPlanLine[] = []

  for (const dish of items) {
    if (isDirectShoppingDish(dish, mode)) {
      direct.push(...directShoppingLines(dish))
      continue
    }
    if (dish.requiresPurchase === false || !dish.recipeId || !dishHasKitchenTools(mode, dish.preparedBy, dish.kind)) continue
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

  const fromRecipes: ShoppingPlanLine[] = [...groups.entries()].map(([key, g]) => ({
    key,
    name: g.name,
    quantity: groupQuantityText(g),
    unit: g.info ? g.info.label : g.literal,
    sources: g.sources,
    notes: [...g.notes],
    direct: false,
  }))
  return [...fromRecipes, ...direct]
}
