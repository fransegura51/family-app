import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"
import { decideDeletion } from "../_shared/accountDeletion.ts"

// «Borrar mi cuenta» (Familia → Borrar mi cuenta). Dos alcances (reglas en _shared/accountDeletion.ts):
//   · me: borra el acceso de quien llama; la familia sigue con todo lo suyo (su ficha de familiar se queda, sin cuenta).
//   · family: borra la familia entera y los accesos de todas sus cuentas (solo administradoras).
// Quien llama solo puede borrar SU cuenta o SU familia: todo se decide con la sesión (JWT), nunca con un identificador que mande la app.
// Apple (regla 5.1.1(v)) exige poder iniciar el borrado desde dentro de la app.

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

// Cierra los consentimientos bancarios de verdad (con la función de siempre, con la sesión de quien llama); si algo falla se sigue: no debe impedir el borrado.
async function disconnectBanks(authHeader: string, connectionIds: string[]) {
  for (const connectionId of connectionIds) {
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/enable-banking-disconnect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({ connectionId }),
      })
    } catch (err) {
      console.error("[delete-account] no se pudo cerrar un consentimiento bancario", String(err))
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS })
  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return json({ error: "unauthorized" }, 401)
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) return json({ error: "unauthorized" }, 401)
    const userId = userData.user.id

    let body: Record<string, unknown> = {}
    try {
      const parsed = await req.json()
      if (typeof parsed === "object" && parsed !== null) body = parsed
    } catch {
      return json({ error: "invalid body" }, 400)
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: me, error: meError } = await admin.from("profiles").select("id, family_id, role").eq("id", userId).maybeSingle()
    if (meError || !me) return json({ error: "profile_not_found" }, 404)

    const { data: others, error: othersError } = await admin.from("profiles").select("id, role").eq("family_id", me.family_id).neq("id", userId)
    if (othersError) return json({ error: "internal_error" }, 500)
    const decision = decideDeletion({
      scope: body.scope,
      confirm: body.confirm,
      role: String(me.role),
      otherAdmins: (others ?? []).filter((p) => p.role === "admin").length,
      otherProfiles: (others ?? []).length,
    })
    if (!decision.ok) return json({ error: decision.error }, decision.status)

    if (body.scope === "me") {
      // Los consentimientos bancarios que conectó esta persona se cierran en el banco.
      const { data: banks } = await admin.from("bank_connections").select("id").eq("connected_by", userId).neq("status", "revoked")
      await disconnectBanks(authHeader, (banks ?? []).map((b) => b.id as string))
      const { data: prepared, error: prepareError } = await admin.rpc("delete_account_prepare", { p_profile: userId })
      if (prepareError || !prepared?.ok) return json({ error: String(prepared?.error ?? "prepare_failed") }, 409)
      const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
      if (deleteError) {
        console.error("[delete-account] no se pudo borrar el acceso", deleteError.message)
        return json({ error: "delete_failed" }, 500)
      }
      return json({ ok: true, scope: "me" })
    }

    // Familia entera
    const familyId = me.family_id as string
    const { data: banks } = await admin.from("bank_connections").select("id").eq("family_id", familyId).neq("status", "revoked")
    await disconnectBanks(authHeader, (banks ?? []).map((b) => b.id as string))

    // Archivos de la familia (fotos, tickets, documentos…): se borran antes que los datos, para no dejar huérfanos.
    const { data: files } = await admin.rpc("family_storage_paths", { p_family: familyId })
    const byBucket = new Map<string, string[]>()
    for (const f of (files ?? []) as { bucket: string; name: string }[]) byBucket.set(f.bucket, [...(byBucket.get(f.bucket) ?? []), f.name])
    for (const [bucket, names] of byBucket) {
      for (let i = 0; i < names.length; i += 100) {
        const { error: removeError } = await admin.storage.from(bucket).remove(names.slice(i, i + 100))
        if (removeError) console.error("[delete-account] no se pudieron borrar archivos de", bucket, removeError.message)
      }
    }

    const { data: familyProfiles } = await admin.from("profiles").select("id").eq("family_id", familyId)
    // Al borrar la familia se borran en cadena todos sus datos (y los perfiles).
    const { error: familyError } = await admin.from("families").delete().eq("id", familyId)
    if (familyError) {
      console.error("[delete-account] no se pudo borrar la familia", familyError.message)
      return json({ error: "delete_failed" }, 500)
    }
    for (const p of familyProfiles ?? []) {
      const { error: deleteError } = await admin.auth.admin.deleteUser(p.id as string)
      if (deleteError) console.error("[delete-account] no se pudo borrar un acceso", deleteError.message)
    }
    return json({ ok: true, scope: "family" })
  } catch (err) {
    console.error("[delete-account] error inesperado", String(err))
    return json({ error: "internal_error" }, 500)
  }
})
