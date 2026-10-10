import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

// Lista de deseos, Parte C del prompt — "al pegar un enlace de producto, recuperar automáticamente su
// fotografía principal". Mismo patrón ya en producción que import-recipe-url (schema.org/JSON-LD + og:image
// como respaldo) y fetch-image-url (descarga server-side para evitar CORS, sube al storage privado) — se
// copian ambas a propósito en vez de compartirlas por HTTP entre funciones (mismo criterio ya documentado
// en esos dos archivos: cada función independiente, no vale la pena la complicación para 20 líneas).
// Nunca bloquea el guardado del deseo: si no se encuentra imagen, o falla la descarga, se devuelve
// imagePath: null y el formulario sigue funcionando (subida manual o sin foto).

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

// Auditoría de seguridad: el servidor descarga la URL del producto que pase un usuario con sesión, y
// luego la de su imagen — sin esto, se podría usar como puente hacia direcciones internas (localhost, red
// privada, metadatos de la nube) — SSRF. Solo http(s) a hosts públicos. Copia de fetch-image-url/
// import-recipe-url (a propósito).
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

async function fetchAndStoreImage(
  admin: ReturnType<typeof createClient>,
  imageUrl: string,
  familyId: string,
): Promise<{ path: string; mimeType: string } | null> {
  try {
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
    const { error } = await admin.storage.from("wishlist_items").upload(path, buffer, { contentType })
    if (error) return null
    return { path, mimeType: contentType }
  } catch {
    return null
  }
}

// image/images de schema.org/Product: URL suelta, array de URLs, ImageObject {url}, o array de ellos —
// siempre se coge la primera utilizable.
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

// Respaldo cuando la web no trae schema.org/Product (muchas tiendas solo ponen Open Graph) — nunca una
// imagen cualquiera de la página, solo la que la propia web marca explícitamente como LA imagen principal.
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

function extractProductImage(jsonLd: unknown): string | null {
  const candidates: unknown[] = Array.isArray(jsonLd)
    ? jsonLd
    : jsonLd && typeof jsonLd === "object" && Array.isArray((jsonLd as { "@graph"?: unknown })["@graph"])
      ? (jsonLd as { "@graph": unknown[] })["@graph"]
      : [jsonLd]

  for (const item of candidates) {
    if (!item || typeof item !== "object") continue
    const obj = item as Record<string, unknown>
    const types = Array.isArray(obj["@type"]) ? obj["@type"] : [obj["@type"]]
    if (!types.includes("Product")) continue
    const found = extractImageUrl(obj.image)
    if (found) return found
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
    const productUrl: string | null = typeof body.productUrl === "string" ? body.productUrl.trim() : null
    if (!productUrl || !isPublicHttpUrl(productUrl)) return json({ error: "invalid_url" }, 400)

    const pageRes = await fetch(productUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
    })
    if (!pageRes.ok) return json({ error: "fetch_failed", status: pageRes.status }, 502)

    const html = (await pageRes.text()).slice(0, 3_000_000)

    let imageUrl: string | null = null
    const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    for (const block of blocks) {
      try {
        imageUrl = extractProductImage(JSON.parse(block[1].trim()))
        if (imageUrl) break
      } catch {
        continue
      }
    }
    if (!imageUrl) imageUrl = extractMetaImage(html, productUrl)
    if (!imageUrl) return json({ error: "no_image_found" }, 404)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: profileRow } = await admin.from("profiles").select("family_id").eq("id", userData.user.id).single()
    if (!profileRow) return json({ error: "no_family" }, 400)

    const stored = await fetchAndStoreImage(admin, imageUrl, profileRow.family_id)
    if (!stored) return json({ error: "download_failed" }, 502)
    return json({ imagePath: stored.path, mimeType: stored.mimeType })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
