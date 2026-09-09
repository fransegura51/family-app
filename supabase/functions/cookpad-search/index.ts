import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

// Petición real: "lo que quiero es importar esa web entera y poder
// buscar allí... hay alguna que tenga API gratis o otra forma de
// hacerlo?" — Cookpad no tiene API pública gratis (comprobado), así
// que esto lee directamente su propia página de resultados de
// búsqueda (igual que un navegador) y saca título, foto y enlace de
// cada receta. Elegido explícitamente por el usuario frente a pagar
// por un buscador general (Brave Search dejó de ser gratis en 2026).
//
// Es un scraping puntual y de bajo volumen (solo cuando la familia
// busca una receta), no una copia ni redistribución de su contenido —
// cada resultado sigue enlazando a la propia página de Cookpad y solo
// se importa el texto/foto de la receta que se elija, con
// import-recipe-url (mismo mecanismo que "importar desde una URL").
// FRÁGIL A PROPÓSITO: si Cookpad cambia el HTML de su buscador, esto
// puede dejar de encontrar resultados — no es un fallo grave si pasa,
// solo hay que volver a mirar su página y ajustar los patrones de
// abajo (comprobado en vivo el 2026-09-09).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } })
}

interface CookpadSearchResult {
  id: string
  title: string
  imageUrl: string | null
  url: string
}

function parseCookpadSearchResults(html: string): CookpadSearchResult[] {
  const results: CookpadSearchResult[] = []
  const liRegex = /<li id="recipe_(\d+)"/g
  const marks = [...html.matchAll(liRegex)]

  for (let i = 0; i < marks.length; i++) {
    const id = marks[i][1]
    const start = marks[i].index ?? 0
    const end = i + 1 < marks.length ? (marks[i + 1].index ?? html.length) : html.length
    const block = html.slice(start, end)

    const titleMatch = block.match(new RegExp(`href="/es/recetas/${id}">\\s*([^<]+?)\\s*</a>`))
    const imgMatch = block.match(/<img[^>]*src="(https:\/\/img-global\.cpcdn\.com\/recipes\/[^"]+)"/)
    if (!titleMatch) continue

    results.push({
      id,
      title: titleMatch[1].trim(),
      imageUrl: imgMatch ? imgMatch[1] : null,
      url: `https://cookpad.com/es/recetas/${id}`,
    })
  }
  return results
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS })

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return json({ error: "unauthorized" }, 401)
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) return json({ error: "unauthorized" }, 401)

    const body = await req.json()
    const query: string | null = typeof body.query === "string" ? body.query.trim() : null
    if (!query) return json({ error: "missing query" }, 400)

    const searchUrl = `https://cookpad.com/es/buscar/${encodeURIComponent(query)}`
    const res = await fetch(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
    })
    if (!res.ok) return json({ error: "fetch_failed", status: res.status }, 502)

    const html = (await res.text()).slice(0, 4_000_000)
    const results = parseCookpadSearchResults(html).slice(0, 10)

    return json({ results })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
