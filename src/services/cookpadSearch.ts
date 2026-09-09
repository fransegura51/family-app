// Llama a la función de servidor "cookpad-search" — petición real:
// "lo que quiero es importar esa web entera y poder buscar allí...
// hay alguna que tenga API gratis o otra forma de hacerlo?". Cookpad
// no tiene API pública gratis, así que la función de servidor lee
// directamente su página de resultados de búsqueda (elegido frente a
// pagar por un buscador general). Cada resultado se puede pasar
// después a importRecipeFromUrl (mismo mecanismo que pegar una URL a
// mano), que ya descarga y guarda la foto en nuestro storage.
import { supabase } from '@/data/supabaseClient'

export interface CookpadSearchResult {
  id: string
  title: string
  imageUrl: string | null
  url: string
}

async function authHeader(): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('No autenticado')
  return `Bearer ${token}`
}

export async function searchCookpadRecipes(query: string): Promise<CookpadSearchResult[]> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  const res = await fetch(`${supabaseUrl}/functions/v1/cookpad-search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: await authHeader() },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error('No se pudo buscar en Cookpad ahora mismo.')
  const json = await res.json()
  const results = Array.isArray(json.results) ? json.results : []
  return results.map((r: Record<string, unknown>) => ({
    id: String(r.id ?? ''),
    title: String(r.title ?? ''),
    imageUrl: r.imageUrl ? String(r.imageUrl) : null,
    url: String(r.url ?? ''),
  }))
}
