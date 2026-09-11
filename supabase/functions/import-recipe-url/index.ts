import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } })
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024

// Auditoría de seguridad: el servidor descarga la URL que le pase un
// usuario con sesión (la página de la receta y luego su imagen). Sin
// esto se podría usar como puente hacia direcciones internas (localhost,
// red privada, metadatos de la nube) — SSRF. Solo http(s) a hosts
// públicos. Copia de fetch-image-url (a propósito: cada función es
// independiente).
function isPublicHttpUrl(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false
  if (url.username || url.password) return false
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "")
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false
  if (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return false
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])]
    if (a === 10 || a === 127 || a === 0) return false
    if (a === 169 && b === 254) return false
    if (a === 172 && b >= 16 && b <= 31) return false
    if (a === 192 && b === 168) return false
    if (a === 100 && b >= 64 && b <= 127) return false
  }
  return true
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
}

// Descarga la imagen desde el servidor (no desde el navegador, para no
// toparse con CORS) y la deja en nuestro storage privado — igual que
// cualquier otra foto de la app, en vez de enlazar directo a la web
// externa (que podría borrar o mover la imagen más adelante).
async function fetchAndStoreImage(admin: ReturnType<typeof createClient>, imageUrl: string, familyId: string): Promise<string | null> {
  try {
    // La URL de la imagen viene de la propia web externa: también se
    // valida, y sin seguir redirecciones (podrían apuntar a algo interno).
    if (!isPublicHttpUrl(imageUrl)) return null
    const res = await fetch(imageUrl, {
      redirect: "manual",
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    })
    if (!res.ok) return null
    const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim()
    const ext = EXT_BY_TYPE[contentType]
    if (!ext) return null
    const buffer = await res.arrayBuffer()
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_BYTES) return null
    const path = `${familyId}/${crypto.randomUUID()}.${ext}`
    const { error } = await admin.storage.from("recipe-photos").upload(path, buffer, { contentType })
    if (error) return null
    return path
  } catch {
    return null
  }
}

// obj.image en schema.org/Recipe puede ser una URL suelta, un array de
// URLs, un ImageObject {url: "..."} o un array de ImageObject — se
// coge siempre la primera imagen utilizable.
function extractImageUrl(image: unknown): string | null {
  if (typeof image === "string") return image
  if (Array.isArray(image)) {
    for (const item of image) {
      const found = extractImageUrl(item)
      if (found) return found
    }
    return null
  }
  if (image && typeof image === "object") {
    const url = (image as { url?: unknown }).url
    if (typeof url === "string") return url
  }
  return null
}

// Muchas webs de recetas (Cookpad entre ellas) no meten la foto dentro
// del bloque schema.org/Recipe, solo en las etiquetas Open Graph que
// usan las redes sociales para la vista previa — petición real: "las
// recetas que saques de internet si puedes que sean con fotos". Se
// prueba como último recurso, solo si el schema.org no trajo ninguna.
function extractMetaImage(html: string, pageUrl: string): string | null {
  for (const name of ["og:image", "twitter:image"]) {
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["']`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${name}["']`, "i"),
    ]
    for (const pattern of patterns) {
      const match = html.match(pattern)
      if (match) {
        try {
          return new URL(match[1], pageUrl).href
        } catch {
          continue
        }
      }
    }
  }
  return null
}

interface ParsedRecipe {
  title: string
  ingredients: string[]
  instructions: string
  sourceUrl: string
  imageUrl: string | null
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
      return { title, ingredients, instructions, sourceUrl, imageUrl: extractImageUrl(obj.image) }
    }
  }
  return null
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
    const url: string | null = typeof body.url === "string" ? body.url.trim() : null
    if (!url || !isPublicHttpUrl(url)) return json({ error: "invalid_url" }, 400)

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
        if (recipe) {
          if (!recipe.imageUrl) recipe.imageUrl = extractMetaImage(html, url)

          // La imagen es un "a mayores" — si falla la descarga, se
          // devuelve la receta igual (texto/ingredientes) sin foto,
          // nunca se rompe la importación entera por esto.
          let imagePath: string | null = null
          if (recipe.imageUrl) {
            const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
            const { data: profileRow } = await admin.from("profiles").select("family_id").eq("id", userData.user.id).single()
            if (profileRow) imagePath = await fetchAndStoreImage(admin, recipe.imageUrl, profileRow.family_id)
          }
          return json({ ...recipe, imagePath })
        }
      } catch {
        continue
      }
    }

    return json({ error: "no_recipe_found" }, 404)
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
