import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

// Petición real: "si la receta es importada por URL que coja la
// imagen principal de allí, si no que se pueda subir una foto propia
// o buscar una de internet" — para el caso "buscar de internet" no
// hay presupuesto para una API de búsqueda de pago (el proyecto es
// "todo gratis"): la persona la busca ella misma en el navegador y
// pega aquí la URL de la imagen que ha encontrado. Esta función la
// descarga desde el servidor (evita el bloqueo CORS que tendría un
// fetch() directo desde el navegador contra un CDN externo) y la deja
// guardada en nuestro propio storage privado, igual que cualquier
// otra foto de la app — así no depende de que esa web externa
// mantenga la imagen disponible para siempre.

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

const MAX_BYTES = 8 * 1024 * 1024

// Auditoría de seguridad: esta función descarga desde el servidor la URL
// que le pase un usuario con sesión. Sin esto, alguien podría usarla
// para que el servidor consultara direcciones internas (localhost, la
// red privada del proveedor, el endpoint de metadatos de la nube...) —
// el clásico SSRF. Solo se aceptan http(s) hacia nombres/IP públicos.
export function isPublicHttpUrl(raw: string): boolean {
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS })

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return json({ error: "unauthorized" }, 401)

    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) return json({ error: "unauthorized" }, 401)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: profileRow, error: profileError } = await admin
      .from("profiles")
      .select("family_id")
      .eq("id", userData.user.id)
      .single()
    if (profileError || !profileRow) return json({ error: "no_family" }, 400)

    const body = await req.json()
    const imageUrl: string | null = typeof body.url === "string" ? body.url.trim() : null
    if (!imageUrl || !isPublicHttpUrl(imageUrl)) return json({ error: "invalid_url" }, 400)

    const imagePath = await fetchAndStoreImage(admin, imageUrl, profileRow.family_id)
    if (!imagePath) return json({ error: "download_failed" }, 502)
    return json({ imagePath })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})

// La misma lógica se repite en import-recipe-url (a propósito — son
// dos funciones independientes, no vale la pena la complicación de
// que una llame a la otra por HTTP para 20 líneas).
async function fetchAndStoreImage(
  admin: ReturnType<typeof createClient>,
  imageUrl: string,
  familyId: string,
): Promise<string | null> {
  try {
    // redirect: "manual" — una URL pública podría redirigir a una interna.
    const res = await fetch(imageUrl, {
      redirect: "manual",
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    })
    if (!res.ok) return null
    const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim()
    const ext = EXT_BY_TYPE[contentType]
    if (!ext) return null

    const buffer = await res.arrayBuffer()
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) return null

    const path = `${familyId}/${crypto.randomUUID()}.${ext}`
    const { error } = await admin.storage.from("recipe-photos").upload(path, buffer, { contentType })
    if (error) return null
    return path
  } catch {
    return null
  }
}
