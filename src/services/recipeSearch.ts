// Busca la receta en el recetario abierto de Wikibooks (es.wikibooks.org,
// "Libro de cocina:") — de verdad sale a Internet a buscarla, pero sin
// ningún servicio de pago ni clave de API: la API pública de MediaWiki es
// gratis y permite CORS con origin=*. La cobertura es la que es (un
// recetario colaborativo, no todos los platos están), así que puede no
// encontrar nada — eso se le dice claro al usuario en vez de inventarse
// una receta.

export interface WikibooksPage {
  title: string
  wikitext: string
}

async function fetchWikitext(title: string): Promise<WikibooksPage | null> {
  const url = `https://es.wikibooks.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=wikitext&format=json&origin=*`
  const res = await fetch(url)
  if (!res.ok) return null
  const json = await res.json()
  if (json.error || !json.parse) return null
  return { title: json.parse.title as string, wikitext: json.parse.wikitext['*'] as string }
}

// El recetario de es.wikibooks.org vive como subpáginas de
// "Artes culinarias/Recetas/<Plato>" (comprobado contra la API en vivo:
// "Libro de cocina:" es el nombre en Wikibooks en inglés, no en español).
const COOKBOOK_PREFIX = 'Artes culinarias/Recetas/'

async function searchCookbookTitle(dish: string): Promise<string | null> {
  const url = `https://es.wikibooks.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
    'intitle:' + dish,
  )}&srnamespace=0&format=json&origin=*&srlimit=10`
  const res = await fetch(url)
  if (!res.ok) return null
  const json = await res.json()
  const results: { title: string }[] = json.query?.search ?? []
  return results.find((r) => r.title.startsWith(COOKBOOK_PREFIX))?.title ?? null
}

export async function searchRecipe(dish: string): Promise<WikibooksPage | null> {
  const direct = await fetchWikitext(`${COOKBOOK_PREFIX}${dish}`)
  if (direct) return direct

  const foundTitle = await searchCookbookTitle(dish)
  if (!foundTitle) return null
  return fetchWikitext(foundTitle)
}
