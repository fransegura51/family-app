// Versión reducida, solo-lectura, de src/domain/kitchenQuery.ts + src/domain/kitchenMenu.ts —
// portado a mano para Alexa (lectura por voz: "qué hay para cenar hoy"). A propósito NO porta las
// ramas de escribir (menu_set/ingredients/recipe_request) ni el reconocimiento de fechas sueltas
// ("el viernes", "el 9 de octubre"): esta ronda de Alexa es explícitamente solo "menú de HOY" (ver
// plan), así que no hace falta arrastrar src/domain/spokenDate.ts aquí también — menos superficie
// que mantener sincronizada a mano.
import { normalize } from './normalize.ts'

export type MealType = 'desayuno' | 'comida' | 'merienda' | 'cena' | 'snack'

export const MEAL_LABELS: Record<MealType, string> = {
  desayuno: 'desayuno',
  comida: 'comida',
  merienda: 'merienda',
  cena: 'cena',
  snack: 'snack',
}

const SHOPPING_WORDS = /\b(compra|comprar|lista|tienda|tiendas|mercadona|supermercado)\b/
const QUERY_A =
  /\bque\s+(?:vamos a\s+)?(?:cenamos|comemos|desayunamos|merendamos|almorzamos|cocinamos|cocino|cocinar|cenar|comer|desayunar|merendar|almorzar|cenaremos|comeremos|cocinaremos|desayunaremos|merendaremos)\b/
const QUERY_B = /\b(?:que|cual)\b[^?]*\bpara\s+(?:la\s+)?(?:comer|cenar|desayunar|merendar|almorzar|comida|cena|desayuno|merienda|almuerzo)\b/
const QUERY_C = /\b(?:que|cual)\b[^?]*\b(?:hay|toca|tenemos|tengo|hay apuntado|esta apuntado)\s+(?:de|en)\s+(?:la\s+)?(?:comida|cena|desayuno|merienda|almuerzo)\b/
const QUERY_D = /\b(?:que|cual)\b[^?]*\bmenu\b/

const MEAL_WORDS: [RegExp, MealType][] = [
  [/\b(?:desayuno|desayunar|desayunamos|desayunaremos)\b/, 'desayuno'],
  [/\b(?:comida|comer|comemos|comeremos|almuerzo|almorzar|almorzamos)\b/, 'comida'],
  [/\b(?:merienda|merendar|merendamos|merendaremos)\b/, 'merienda'],
  [/\b(?:cena|cenar|cenamos|cenaremos|esta noche)\b/, 'cena'],
]

// null = no es una pregunta de menú. Si lo es, qué comidas pregunta (vacío = las dos de siempre,
// comida y cena — mismo criterio que parseKitchenIntent original).
export function matchMenuQuery(text: string): MealType[] | null {
  const n = normalize(text)
  if (SHOPPING_WORDS.test(n)) return null
  if (![QUERY_A, QUERY_B, QUERY_C, QUERY_D].some((re) => re.test(n))) return null
  let meals = MEAL_WORDS.filter(([re]) => re.test(n)).map(([, meal]) => meal)
  if (meals.length === 0) meals = ['comida', 'cena']
  if (/\bcocin/.test(n)) meals = ['comida', 'cena']
  return meals
}

function joinNatural(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
}
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export interface MenuEntryRow {
  entryDate: string
  mealType: MealType
  recipeTitle: string | null
  freeText: string | null
}

// Portado de buildMenuAnswer (src/domain/kitchenMenu.ts), simplificado a un único día (hoy) — el
// original admite varios días/fechas sueltas, que aquí no hacen falta.
export function buildTodayMenuAnswer(today: string, meals: MealType[], entries: MenuEntryRow[]): string {
  const dishesFor = (meal: MealType): string[] => {
    const dishes: string[] = []
    for (const entry of entries) {
      if (entry.entryDate !== today || entry.mealType !== meal) continue
      const text = entry.recipeTitle ?? entry.freeText?.trim()
      if (text) dishes.push(text)
    }
    return dishes
  }

  if (meals.length === 1) {
    const dishes = dishesFor(meals[0])
    const article = meals[0] === 'desayuno' || meals[0] === 'snack' ? 'el' : 'la'
    return dishes.length > 0
      ? `Para ${article} ${MEAL_LABELS[meals[0]]} de hoy: ${joinNatural(dishes)}.`
      : `No hay nada apuntado para ${article} ${MEAL_LABELS[meals[0]]} de hoy.`
  }

  const parts = meals.map((meal) => {
    const dishes = dishesFor(meal)
    return `${capitalize(MEAL_LABELS[meal])}: ${dishes.length > 0 ? joinNatural(dishes) : 'sin apuntar'}.`
  })
  return `Hoy. ${parts.join(' ')}`
}
