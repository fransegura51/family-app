import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

// Proxy hacia las APIs de Google Maps (Ubicación: buscar un sitio, ver su dirección, calcular
// tiempo en coche) — petición real, 30/09/2026: "Pepa no encuentra Madrid... he probado en otro
// teléfono y en un iPhone, con otra cuenta, y sigue igual". La clave restringida por sitio web
// (VITE_GOOGLE_MAPS_API_KEY, usada por el mapa en sí) exige que el navegador mande exactamente el
// Referer que Google espera para cada petición — en Chrome/Android se puede forzar razonablemente
// bien (referrerPolicy), pero en Safari/iOS no se puede confiar en que se porte igual (ver
// docs/GOOGLE_MAPS.md). Para las llamadas de tipo API REST (no el mapa interactivo en sí, que sigue
// siendo un <script> del propio navegador y no se puede mover aquí) la solución de verdad es que
// las pida el SERVIDOR, con una clave de servidor aparte (sin restricción de sitio web — la
// restringe, en su lugar, el hecho de que solo el servidor la conoce) — igual que ya se hace con
// FatSecret (fatsecret-food) o con Gemini. Se exige JWT de usuario real para que solo la propia
// familia autenticada gaste cuota.

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

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v)
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS })

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return json({ error: "unauthorized" }, 401)

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) return json({ error: "unauthorized" }, 401)

    const body = await req.json()
    const action = body.action as string

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: apiKey, error: keyErr } = await adminClient.rpc("get_app_secret", { p_name: "GOOGLE_MAPS_SERVER_KEY" })
    if (keyErr || !apiKey) return json({ error: "service not configured" }, 500)

    if (action === "autocomplete") {
      const input = typeof body.input === "string" ? body.input.trim() : ""
      if (!input) return json({ error: "missing input" }, 400)
      const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey },
        body: JSON.stringify({ input, languageCode: "es", regionCode: "ES" }),
      })
      if (!res.ok) return json({ error: "google_error", detail: await res.text() }, 502)
      const data = await res.json()
      const suggestions = (data.suggestions ?? [])
        .map((s: Record<string, unknown>) => s.placePrediction)
        .filter((p: unknown): p is Record<string, unknown> => !!p)
        .slice(0, 5)
        .map((p: Record<string, unknown>) => ({
          label: (p.text as { text?: string } | undefined)?.text ?? "Sin nombre",
          placeId: p.placeId,
        }))
      return json({ suggestions })
    }

    if (action === "details") {
      const placeId = typeof body.placeId === "string" ? body.placeId.trim() : ""
      if (!placeId) return json({ error: "missing placeId" }, 400)
      const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
        headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "displayName,formattedAddress,location" },
      })
      if (!res.ok) return json({ error: "google_error", detail: await res.text() }, 502)
      const data = await res.json()
      if (!data.location) return json({ place: null })
      return json({
        place: {
          label: data.formattedAddress ?? data.displayName?.text ?? "Sin nombre",
          latitude: data.location.latitude,
          longitude: data.location.longitude,
        },
      })
    }

    if (action === "geocode") {
      const latitude = body.latitude
      const longitude = body.longitude
      if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) return json({ error: "missing coordinates" }, 400)
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&language=es&key=${encodeURIComponent(apiKey)}`
      const res = await fetch(url)
      if (!res.ok) return json({ error: "google_error", detail: await res.text() }, 502)
      const data = await res.json()
      return json({ address: data.results?.[0]?.formatted_address ?? null })
    }

    if (action === "nearby") {
      const latitude = body.latitude
      const longitude = body.longitude
      if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) return json({ error: "missing coordinates" }, 400)
      const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "places.displayName" },
        body: JSON.stringify({
          maxResultCount: 1,
          rankPreference: "DISTANCE",
          locationRestriction: { circle: { center: { latitude, longitude }, radius: 25 } },
        }),
      })
      if (!res.ok) return json({ error: "google_error", detail: await res.text() }, 502)
      const data = await res.json()
      return json({ name: data.places?.[0]?.displayName?.text ?? null })
    }

    if (action === "route") {
      const origin = body.origin
      const destination = body.destination
      if (!origin || !isFiniteNumber(origin.latitude) || !isFiniteNumber(origin.longitude)) return json({ error: "missing origin" }, 400)
      if (!destination || !isFiniteNumber(destination.latitude) || !isFiniteNumber(destination.longitude)) return json({ error: "missing destination" }, 400)
      const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "routes.duration,routes.distanceMeters" },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } } },
          destination: { location: { latLng: { latitude: destination.latitude, longitude: destination.longitude } } },
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_AWARE",
          languageCode: "es",
        }),
      })
      if (!res.ok) return json({ error: "google_error", detail: await res.text() }, 502)
      const data = await res.json()
      const route = data.routes?.[0]
      if (!route?.duration) return json({ eta: null })
      const seconds = parseInt(String(route.duration).replace("s", ""), 10)
      if (!Number.isFinite(seconds)) return json({ eta: null })
      return json({
        eta: { minutes: Math.max(1, Math.round(seconds / 60)), km: Math.round((route.distanceMeters ?? 0) / 100) / 10 },
      })
    }

    return json({ error: "unknown action" }, 400)
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
