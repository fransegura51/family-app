// La última receta de la que se ha hablado con Pepa, para poder decir
// "añade los ingredientes a la compra" justo después sin repetir el nombre.
// Solo en memoria del navegador y solo unos minutos.
const RECENT_MS = 2 * 60 * 1000
let recent: { recipeIds: string[]; at: number } = { recipeIds: [], at: 0 }

export function rememberRecipes(recipeIds: string[]): void {
  recent = { recipeIds: [...new Set(recipeIds)], at: Date.now() }
}

export function recentRecipeIds(): string[] {
  return Date.now() - recent.at <= RECENT_MS ? recent.recipeIds : []
}

export function forgetRecentRecipes(): void {
  recent = { recipeIds: [], at: 0 }
}
