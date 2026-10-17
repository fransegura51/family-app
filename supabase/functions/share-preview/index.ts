import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"
import { DEFAULT_APP_BASE, handleSharePreview, type PreviewDb } from "../_shared/sharePreview.ts"

// Vistas previas de WhatsApp & co. para enlaces de Comunidad (?c=<id de publicación>) y de listas de deseos (?d=<token>).
// Solo LECTURA, con la clave de servicio y UNA consulta mínima por petición (ver _shared/sharePreview.ts: qué se publica y qué no).
// Sin JWT (verify_jwt = false): lo abren los rastreadores de las apps de mensajería. Despliegue y LÍMITE IMPORTANTE (HTML solo con dominio propio de Supabase):
// docs/comunidad/VISTAS_PREVIAS_COMPARTIR.md.
//
// Variables opcionales: APP_BASE (por defecto la web de la app), SHARE_PREVIEW_PUBLIC_URL (dirección pública de esta función, para og:url).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const APP_BASE = Deno.env.get("APP_BASE") ?? DEFAULT_APP_BASE
const SELF_URL = Deno.env.get("SHARE_PREVIEW_PUBLIC_URL") ?? undefined

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const db: PreviewDb = {
  // Solo las columnas que deciden la vista previa; el filtro de «oficial y publicada» se vuelve a comprobar en sharePreview.ts.
  async post(id) {
    const { data, error } = await admin
      .from("community_posts")
      .select("title, kind, is_official, status, ai_excluded")
      .eq("id", id)
      .eq("is_official", true)
      .eq("status", "published")
      .maybeSingle()
    if (error) throw error
    return data ?? null
  },
  // Dos lecturas mínimas (mismo camino que wishlist-guest): token -> dueño -> nombre. Nada de regalos ni reservas.
  async wishlistOwnerName(token) {
    const { data: wl, error } = await admin.from("wishlists").select("owner_member_id").eq("guest_token", token).maybeSingle()
    if (error) throw error
    if (!wl) return null
    const { data: owner, error: e2 } = await admin.from("family_members").select("name").eq("id", wl.owner_member_id).maybeSingle()
    if (e2) throw e2
    return (owner?.name as string | undefined) ?? null
  },
}

Deno.serve((req) => handleSharePreview(req, db, { appBase: APP_BASE, selfUrl: SELF_URL }))
