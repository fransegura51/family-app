import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

// "Lista de deseos" (Pequeños Grandes) — página pública para un invitado SIN cuenta PEPA: ver una lista
// de regalos y reservar uno. Mismo patrón, ya en producción, que supabase/functions/event-rsvp: esta
// función solo devuelve JSON (Supabase fuerza Content-Type: text/plain + CSP sandbox en toda función
// edge, así que servir HTML de verdad aquí se descargaría como archivo en vez de abrirse) — quien la
// renderiza de verdad es WishlistGuestScreen (src/ui/WishlistGuestScreen.tsx), ruta pública de la propia
// SPA ("/?deseos=TOKEN", por la RAÍZ, un archivo real en GitHub Pages sin el truco de 404.html).
//
// Autenticación: el token de 24 bytes en la URL (wishlists.guest_token, mismo patrón que
// event_guests.rsvp_token) es la única identificación — sin JWT, con el rol de servicio, así que aquí hay
// que reimplementar a mano qué es público (la lista, sus regalos, si cada uno está disponible/reservado/
// cuántos conjuntos) y qué NO lo es nunca (quién ha reservado qué — ni para el propio invitado que mira,
// ni para nadie: el secreto de una reserva es real incluso para un invitado externo).
//
// verify_jwt = false a propósito — mismo motivo que event-rsvp: la llamada no lleva Authorization.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } })
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

// Mismo rpc genérico que ya usa event-rsvp (rsvp_rate_limits/rsvp_rate_limit_hit) — namespace de clave
// propio ("wl:...") para no compartir cupo con RSVP, misma tabla y mecanismo, nada nuevo que mantener.
async function underRateLimit(admin: ReturnType<typeof createClient>, req: Request, scopeKey: string, limit: number): Promise<boolean> {
  const ip = (req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? "").split(",")[0].trim() || "unknown"
  const byIp = await admin.rpc("rsvp_rate_limit_hit", { p_key: "wl_ip:" + (await sha256Hex(ip)), p_limit: 60, p_window_seconds: 600 })
  if (byIp.error || byIp.data !== true) return false
  const byScope = await admin.rpc("rsvp_rate_limit_hit", { p_key: "wl:" + (await sha256Hex(scopeKey)), p_limit: limit, p_window_seconds: 600 })
  return !byScope.error && byScope.data === true
}

interface WishlistRow {
  id: string
  family_id: string
  owner_member_id: string
  year: number
  occasion: string
  celebration_date: string | null
}

interface ItemRow {
  id: string
  name: string
  description: string | null
  link: string | null
  price: number | null
  allow_joint: boolean
  photo_storage_path: string | null
  sort_order: number
}

interface ReservationRow {
  id: string
  item_id: string
  allow_joint: boolean
  undone_at: string | null
}

// Solo lo que un invitado puede saber: nunca quién reservó qué, ni aquí ni para sí mismo (el secreto es
// real también para el propio invitado que reserva — solo se queda con su reservationToken, su única
// forma de deshacerlo después).
async function publicItems(admin: ReturnType<typeof createClient>, items: ItemRow[]): Promise<Record<string, unknown>[]> {
  const { data: reservationsData } = await admin
    .from("wishlist_item_reservations")
    .select("id, item_id, allow_joint, undone_at")
    .in("item_id", items.map((i) => i.id))
    .is("undone_at", null)
  const reservations = (reservationsData ?? []) as ReservationRow[]
  const byItem = new Map<string, ReservationRow[]>()
  for (const r of reservations) {
    if (!byItem.has(r.item_id)) byItem.set(r.item_id, [])
    byItem.get(r.item_id)!.push(r)
  }

  const out: Record<string, unknown>[] = []
  for (const item of items.sort((a, b) => a.sort_order - b.sort_order)) {
    const active = byItem.get(item.id) ?? []
    let photoUrl: string | null = null
    if (item.photo_storage_path) {
      const { data } = await admin.storage.from("wishlist_items").createSignedUrl(item.photo_storage_path, 3600)
      photoUrl = data?.signedUrl ?? null
    }
    const status = active.length === 0 ? "disponible" : item.allow_joint ? "conjunto" : "reservado"
    out.push({
      id: item.id,
      name: item.name,
      description: item.description,
      link: item.link,
      price: item.price,
      photoUrl,
      allowJoint: item.allow_joint,
      status,
      jointCount: item.allow_joint ? active.length : undefined,
    })
  }
  return out
}

async function loadWishlist(admin: ReturnType<typeof createClient>, token: string): Promise<{ wishlist: WishlistRow; ownerName: string } | null> {
  const { data: wishlist } = await admin
    .from("wishlists")
    .select("id, family_id, owner_member_id, year, occasion, celebration_date")
    .eq("guest_token", token)
    .maybeSingle()
  if (!wishlist) return null
  const w = wishlist as WishlistRow
  const { data: owner } = await admin.from("family_members").select("name").eq("id", w.owner_member_id).maybeSingle()
  return { wishlist: w, ownerName: (owner?.name as string) ?? "" }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS })

  try {
    const url = new URL(req.url)
    const token = url.searchParams.get("token")
    if (!token) return json({ error: "not_found" }, 404)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const loaded = await loadWishlist(admin, token)
    if (!loaded) return json({ error: "not_found" }, 404)
    const { wishlist, ownerName } = loaded

    if (req.method === "GET") {
      const { data: itemsData } = await admin
        .from("wishlist_items")
        .select("id, name, description, link, price, allow_joint, photo_storage_path, sort_order")
        .eq("wishlist_id", wishlist.id)
      const items = await publicItems(admin, (itemsData ?? []) as ItemRow[])
      return json({
        wishlist: { ownerName, occasion: wishlist.occasion, year: wishlist.year, celebrationDate: wishlist.celebration_date },
        items,
      })
    }

    if (req.method === "POST") {
      if (!(await underRateLimit(admin, req, "tok:" + token, 30))) return json({ error: "rate_limited" }, 429)
      const body = await req.json().catch(() => null)
      const action = typeof body?.action === "string" ? body.action : null
      const itemId = typeof body?.itemId === "string" ? body.itemId : null
      if (!action || !itemId) return json({ error: "bad_request" }, 400)

      const { data: itemData } = await admin
        .from("wishlist_items")
        .select("id, allow_joint")
        .eq("id", itemId)
        .eq("wishlist_id", wishlist.id)
        .maybeSingle()
      if (!itemData) return json({ error: "not_found" }, 404)
      const item = itemData as Pick<ItemRow, "id" | "allow_joint">

      if (action === "reserve") {
        const guestName = typeof body.guestName === "string" ? body.guestName.trim().slice(0, 80) : ""
        if (!guestName) return json({ error: "missing_name" }, 400)
        const reservationToken = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "")
        const { error } = await admin.from("wishlist_item_reservations").insert({
          item_id: item.id,
          family_id: wishlist.family_id,
          reserved_by_guest_name: guestName,
          guest_reservation_token: reservationToken,
          allow_joint: item.allow_joint,
        })
        if (error) {
          // 23505 = violación de unicidad: alguien se adelantó justo ahora (protección real frente a
          // reservas simultáneas, a nivel de base de datos, no solo de interfaz).
          if ((error as { code?: string }).code === "23505") return json({ error: "ya_reservado" }, 409)
          return json({ error: "save_failed" }, 500)
        }
        return json({ ok: true, reservationToken })
      }

      if (action === "undo") {
        const reservationToken = typeof body.reservationToken === "string" ? body.reservationToken : null
        if (!reservationToken) return json({ error: "bad_request" }, 400)
        const { data: updated, error } = await admin
          .from("wishlist_item_reservations")
          .update({ undone_at: new Date().toISOString() })
          .eq("item_id", item.id)
          .eq("guest_reservation_token", reservationToken)
          .is("undone_at", null)
          .select("id")
          .maybeSingle()
        if (error || !updated) return json({ error: "not_found" }, 404)
        return json({ ok: true })
      }

      return json({ error: "bad_request" }, 400)
    }

    return json({ error: "method_not_allowed" }, 405)
  } catch {
    return json({ error: "server_error" }, 500)
  }
})
