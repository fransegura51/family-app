import "jsr:@supabase/functions-js/edge-runtime.d.ts"

// Importar receta desde la URL de otra página (petición real: "subir
// recetas mediante la URL de otras páginas") — sin IA ni servicio de
// pago: casi todas las webs de recetas serias incluyen sus datos en
// formato estándar schema.org/Recipe dentro de un <script
// type="application/ld+json">, que es justo lo que Google usa para las
// fichas de receta en el buscador. Se lee ese bloque tal cual, sin
// inventar nada si la web no lo trae (se avisa claro, como ya se hace
// con la búsqueda en Wikibooks).
//
// Se llama desde el cliente ya autenticado (Authorization: Bearer
// <token de sesión>) — verify_jwt por defecto exige esa sesión válida,
// así que esta función no puede usarse como proxy abierto para
// cualquiera.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } })
}

interface ParsedRecipe {
  title: string
  ingredients: string[]
  instructions: string
  sourceUrl: string
}

function textFromInstructionStep(step: unknown): string {
  if (typeof step === "string") return step
  if (step && typeof step === "object") {
    const s = step as { text?: unknown; name?: unknown; itemListElement?: unknown }
    if (typeof s.text === "string") return s.text
    if (typeof s.name === "string") return s.name
    if (Array.isArray(s.itemListElement)) return s.itemListElement.map(textFromInstructionStep).join(" ")
  }
  return ""
}

function extractRecipe(jsonLd: unknown, sourceUrl: string): ParsedRecipe | null {
  const candidates: unknown[] = Array.isArray(jsonLd)
    ? jsonLd
    : jsonLd && typeof jsonLd === "object" && Array.isArray((jsonLd as { "@graph"?: unknown })["@graph"])
      ? (jsonLd as { "@graph": unknown[] })["@graph"]
      : [jsonLd]

  for (const item of candidates) {
    if (!item || typeof item !== "object") continue
    const obj = item as Record<string, unknown>
    const types = Array.isArray(obj["@type"]) ? obj["@type"] : [obj["@type"]]
    if (!types.includes("Recipe")) continue

    const title = typeof obj.name === "string" ? obj.name : ""
    const ingredients = Array.isArray(obj.recipeIngredient)
      ? obj.recipeIngredient.filter((i): i is string => typeof i === "string")
      : []

    let instructions = ""
    const raw = obj.recipeInstructions
    if (typeof raw === "string") {
      instructions = raw
    } else if (Array.isArray(raw)) {
      instructions = raw
        .map(textFromInstructionStep)
        .filter(Boolean)
        .map((step, i) => `${i + 1}. ${step}`)
        .join("\n")
    }

    if (title || ingredients.length > 0) {
      return { title, ingredients, instructions, sourceUrl }
    }
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS })

  try {
    const body = await req.json()
    const url: string | null = typeof body.url === "string" ? body.url.trim() : null
    if (!url || !/^https?:\/\//i.test(url)) return json({ error: "invalid_url" }, 400)

    const pageRes = await fetch(url, {
      headers: {
        // Muchas webs de recetas bloquean peticiones sin User-Agent de
        // navegador real.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
    })
    if (!pageRes.ok) return json({ error: "fetch_failed", status: pageRes.status }, 502)

    // Límite de tamaño para no leer páginas enormes de golpe.
    const html = (await pageRes.text()).slice(0, 3_000_000)

    const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    for (const block of blocks) {
      try {
        const parsed = JSON.parse(block[1].trim())
        const recipe = extractRecipe(parsed, url)
        if (recipe) return json(recipe)
      } catch {
        continue
      }
    }

    return json({ error: "no_recipe_found" }, 404)
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
