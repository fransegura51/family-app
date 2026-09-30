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

// La última petición de receta ("quiero hacer lentejas con chorizo"), para poder
// decir después solo "somos dos" y cambiar las raciones sin repetir el plato.
export interface RecipeRequest {
  dish: string
  servings: number
  preferences: string[]
}

const RECIPE_REQUEST_MS = 5 * 60 * 1000
let recentRequest: { request: RecipeRequest; at: number } | null = null

export function rememberRecipeRequest(request: RecipeRequest): void {
  recentRequest = { request, at: Date.now() }
}

export function pendingRecipeRequest(): RecipeRequest | null {
  return recentRequest && Date.now() - recentRequest.at <= RECIPE_REQUEST_MS ? recentRequest.request : null
}

export function forgetRecentRecipes(): void {
  recentRequest = null
  recent = { recipeIds: [], at: 0 }
}

// El último sitio que Pepa ha encontrado buscando por voz ("busca la farmacia de guardia"), para
// poder guardarlo justo después diciendo solo "guárdalo" sin repetir el nombre ni las coordenadas.
export interface FoundPlace {
  label: string
  latitude: number
  longitude: number
}

const FOUND_PLACE_MS = 5 * 60 * 1000
let recentPlace: { place: FoundPlace; at: number } | null = null

export function rememberFoundPlace(place: FoundPlace): void {
  recentPlace = { place, at: Date.now() }
}

export function pendingFoundPlace(): FoundPlace | null {
  return recentPlace && Date.now() - recentPlace.at <= FOUND_PLACE_MS ? recentPlace.place : null
}

export function forgetFoundPlace(): void {
  recentPlace = null
}
