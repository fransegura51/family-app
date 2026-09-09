// Busca la receta en el recetario abierto de Wikibooks (es.wikibooks.org,
// "Libro de cocina:") — de verdad sale a Internet a buscarla, pero sin
// ningún servicio de pago ni clave de API: la API pública de MediaWiki es
// gratis y permite CORS con origin=*. La cobertura es la que es (un
// recetario colaborativo, no todos los platos están), así que puede no
// encontrar nada — eso se le dice claro al usuario en vez de inventarse
// una receta.
//
// Petición real: "quiero que al buscar una receta en internet se abra
// una búsqueda... y pueda elegir la que quiera, no que me coja la
// primera que encuentre" — antes se cogía automáticamente el primer
// resultado; ahora se devuelven todas las candidatas (hasta 10) para
// que el usuario elija, y solo se trae el texto completo de la que
// elija.

export interface WikibooksPage {
  title: string
  wikitext: string
}

export interface WikibooksSearchResult {
  title: string
  displayName: string
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

function toDisplayName(fullTitle: string): string {
  return fullTitle.startsWith(COOKBOOK_PREFIX) ? fullTitle.slice(COOKBOOK_PREFIX.length) : fullTitle
}

export async function searchRecipeCandidates(dish: string): Promise<WikibooksSearchResult[]> {
  const url = `https://es.wikibooks.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
    'intitle:' + dish,
  )}&srnamespace=0&format=json&origin=*&srlimit=10`
  const res = await fetch(url)
  if (!res.ok) return []
  const json = await res.json()
  const results: { title: string }[] = json.query?.search ?? []
  return results
    .filter((r) => r.title.startsWith(COOKBOOK_PREFIX))
    .map((r) => ({ title: r.title, displayName: toDisplayName(r.title) }))
}

export async function fetchWikibooksRecipe(title: string): Promise<WikibooksPage | null> {
  return fetchWikitext(title)
}
