// Llama a la función de servidor "import-recipe-url" — lee la ficha de
// receta estándar (schema.org/Recipe) que casi toda web de recetas
// incluye, sin IA ni servicio de pago. El fetch se hace en el servidor
// porque la mayoría de esas webs no permiten CORS desde el navegador.
import { supabase } from '@/data/supabaseClient'

export interface RecipeUrlImportResult {
  title: string
  ingredients: string[]
  instructions: string
  sourceUrl: string
  // Petición real: "si la receta es importada por URL que coja la
  // imagen principal de allí" — ya descargada y guardada en nuestro
  // propio storage (recipe-photos) por la función de servidor, null si
  // la página no traía imagen o no se pudo descargar.
  imagePath: string | null
}

async function authHeader(): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('No autenticado')
  return `Bearer ${token}`
}

export async function importRecipeFromUrl(url: string): Promise<RecipeUrlImportResult> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  const res = await fetch(`${supabaseUrl}/functions/v1/import-recipe-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: await authHeader(),
    },
    body: JSON.stringify({ url }),
  })

  if (res.status === 404) throw new Error('Esa página no trae los datos de la receta en un formato que se pueda leer.')
  if (!res.ok) throw new Error('No se pudo leer esa página. Comprueba el enlace e inténtalo de nuevo.')

  const json = await res.json()
  return {
    title: typeof json.title === 'string' ? json.title : '',
    ingredients: Array.isArray(json.ingredients) ? json.ingredients.filter((i: unknown) => typeof i === 'string') : [],
    instructions: typeof json.instructions === 'string' ? json.instructions : '',
    sourceUrl: typeof json.sourceUrl === 'string' ? json.sourceUrl : url,
    imagePath: typeof json.imagePath === 'string' ? json.imagePath : null,
  }
}

// Petición real: "si no [se importa por URL] que se pueda... buscar
// una [foto] de internet" — sin API de búsqueda de pago, la persona
// pega la URL de una imagen que ha encontrado ella misma en su
// navegador, y el servidor la descarga y la guarda (evita CORS).
export async function fetchImageFromUrl(url: string): Promise<string> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  const res = await fetch(`${supabaseUrl}/functions/v1/fetch-image-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: await authHeader(),
    },
    body: JSON.stringify({ url }),
  })
  if (!res.ok) throw new Error('No se pudo descargar esa imagen. Comprueba el enlace e inténtalo de nuevo.')
  const json = await res.json()
  if (typeof json.imagePath !== 'string') throw new Error('No se pudo descargar esa imagen.')
  return json.imagePath
}
