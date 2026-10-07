import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

// Recibe las posiciones que manda OwnTracks (app gratuita para iPhone/Android que lee el GPS en segundo plano; modo
// HTTP: un POST con usuario y contraseña por cada posición). Es el puente que permite saber dónde está alguien con la
// app de PEPA cerrada — ver migración 0213_owntracks_background_location.sql.
//
// Sin JWT de usuario (lo llama el móvil, no la app): la autenticación es HTTP Basic con usuario = id del miembro y
// contraseña = su código personal. El código solo se comprueba en la base (huella sha256, función
// ingest_member_location, solo service_role). Esta función no guarda nada por sí misma ni escribe el código en logs.
//
// OwnTracks espera 200 con un JSON (array) de respuesta: `[]` significa «recibido, nada que devolver».

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_BODY_CHARS = 8192

function parseBasicAuth(header: string | null): { user: string; pass: string } | null {
  if (!header || !header.startsWith("Basic ")) return null
  try {
    const decoded = atob(header.slice(6).trim())
    const i = decoded.indexOf(":")
    if (i < 0) return null
    return { user: decoded.slice(0, i), pass: decoded.slice(i + 1) }
  } catch {
    return null
  }
}

function emptyReply(): Response {
  return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } })
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return new Response("method not allowed", { status: 405 })

    const creds = parseBasicAuth(req.headers.get("authorization"))
    if (!creds || !UUID_RE.test(creds.user) || creds.pass.length < 32 || creds.pass.length > 128) {
      return new Response("unauthorized", { status: 401 })
    }

    const raw = await req.text()
    if (raw.length > MAX_BODY_CHARS) return new Response("payload too large", { status: 413 })

    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return new Response("bad request", { status: 400 })
    }

    // Solo las posiciones interesan; el resto de mensajes de OwnTracks (transiciones, waypoints, estado…) se
    // reciben sin más para que la app no los reintente.
    if (msg._type !== "location") return emptyReply()

    const lat = msg.lat
    const lon = msg.lon
    if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      return new Response("bad request", { status: 400 })
    }
    const tst = typeof msg.tst === "number" && Number.isFinite(msg.tst) && msg.tst > 0 ? new Date(msg.tst * 1000).toISOString() : null
    const acc = typeof msg.acc === "number" && Number.isFinite(msg.acc) ? msg.acc : null

    const { data, error } = await supabaseAdmin.rpc("ingest_member_location", {
      p_member_id: creds.user,
      p_token: creds.pass,
      p_lat: lat,
      p_lon: lon,
      p_tst: tst,
      p_acc: acc,
    })
    if (error) {
      console.error("[owntracks-ingest] rpc error:", error.message)
      return new Response("internal error", { status: 500 })
    }
    if (data === "unauthorized") return new Response("unauthorized", { status: 401 })

    // 'ok' | 'stale' | 'no_consent' | 'inaccurate' | 'invalid': todos son «recibido»; el motivo no se devuelve.
    return emptyReply()
  } catch (err) {
    console.error("[owntracks-ingest] error:", String(err))
    return new Response("internal error", { status: 500 })
  }
})
