import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"
import { normalize } from "./_ported/normalize.ts"
import { buildTodayMenuAnswer, matchMenuQuery, type MealType, type MenuEntryRow } from "./_ported/menu.ts"
import { expandOccurrences } from "./_ported/calendarRecurrence.ts"
import { formatWeatherReport, getWeather, matchWeatherPlace } from "./_ported/weather.ts"

// Lo que pregunta un Echo por voz ("Alexa, pregunta a Pepa qué hay en la lista de la compra") —
// petición real: "¿Se puede integrar la app de Pepa con Alexa?... que cuando la vendamos, la
// familia se puedan conectar con Alexa si lo quieren". Solo lectura esta ronda: lista de la
// compra, agenda de hoy, menú de hoy, el tiempo — nada de añadir/cambiar por voz todavía (eso
// necesita el modelo de diálogo de varios turnos de Alexa, fase aparte).
//
// Sin sesión de usuario nunca — Amazon no tiene un JWT de nadie. La familia se identifica por el
// access_token que Alexa manda en cada pregunta (alexa_links, ver migración
// 0180_alexa_account_linking.sql), conseguido antes con el account linking real (alexa-oauth-token
// + AlexaLinkScreen en la app). Bajo service_role no hay RLS: CADA consulta de abajo filtra a mano
// por family_id, sin excepción — es la única barrera real.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const NOT_UNDERSTOOD =
  "No he entendido esa pregunta. Puedes preguntarme por la lista de la compra, la agenda de hoy, el menú de hoy o el tiempo en un sitio."
const NOT_LINKED =
  "Tu cuenta de Alexa no está conectada con tu familia todavía. Hazlo desde la app de Alexa, en Más, Habilidades, Pepa."

interface AlexaRequest {
  session?: { user?: { accessToken?: string } }
  context?: { System?: { user?: { accessToken?: string } } }
  request: {
    type: "LaunchRequest" | "IntentRequest" | "SessionEndedRequest" | string
    intent?: { name?: string; slots?: Record<string, { value?: string }> }
  }
}

function alexaResponse(text: string, shouldEndSession: boolean): Response {
  return new Response(
    JSON.stringify({
      version: "1.0",
      response: { outputSpeech: { type: "PlainText", text }, shouldEndSession },
    }),
    { headers: { "Content-Type": "application/json" } },
  )
}

async function resolveFamilyId(accessToken: string): Promise<string | null> {
  const { data, error } = await admin.from("alexa_links").select("family_id").eq("access_token", accessToken).maybeSingle()
  if (error || !data) return null
  return data.family_id as string
}

function todayDateStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

// ---------------------------------------------------------------------
// Lista de la compra — puerto de answerShoppingQuery (src/ui/VoiceCapture.tsx), rama general.
// ---------------------------------------------------------------------
async function answerShopping(familyId: string): Promise<string> {
  const { data, error } = await admin
    .from("shopping_items")
    .select("name, store, status")
    .eq("family_id", familyId)
    .eq("status", "pendiente")
  if (error || !data || data.length === 0) return "No tienes nada pendiente en ninguna lista de la compra."

  const byStore = new Map<string, string[]>()
  for (const item of data) {
    const key = (item.store as string | null) || "Sin tienda"
    const list = byStore.get(key) ?? []
    list.push(item.name as string)
    byStore.set(key, list)
  }
  const groups = [...byStore.entries()].sort((a, b) => {
    if (a[0] === "Sin tienda") return 1
    if (b[0] === "Sin tienda") return -1
    return a[0].localeCompare(b[0])
  })
  return groups.map(([store, names]) => `${store}: ${names.join(", ")}`).join(". ") + "."
}

// ---------------------------------------------------------------------
// Menú de hoy — puerto recortado de handleMenuQuery/buildMenuAnswer.
// ---------------------------------------------------------------------
async function answerMenu(familyId: string, meals: MealType[]): Promise<string> {
  const today = todayDateStr()
  const { data, error } = await admin
    .from("menu_entries")
    .select("entry_date, meal_type, free_text, recipes(title)")
    .eq("family_id", familyId)
    .eq("entry_date", today)
  if (error) return "No he podido consultar el menú ahora mismo."

  const entries: MenuEntryRow[] = (data ?? []).map((r) => ({
    entryDate: r.entry_date as string,
    mealType: r.meal_type as MealType,
    recipeTitle: (r.recipes as { title: string } | null)?.title ?? null,
    freeText: r.free_text as string | null,
  }))
  return buildTodayMenuAnswer(today, meals, entries)
}

// ---------------------------------------------------------------------
// Agenda de hoy — puerto recortado (sin sincronización externa, sin distinción por miembro) de
// answerAgendaQuery/answerNextCalendarEvent.
// ---------------------------------------------------------------------
async function answerCalendarToday(familyId: string): Promise<string> {
  const today = todayDateStr()
  const { data, error } = await admin
    .from("calendar_events")
    .select("id, title, start_at, end_at, all_day, recurrence_rule, exception_dates, visibility")
    .eq("family_id", familyId)
    .neq("visibility", "private")
  if (error) return "No he podido consultar la agenda ahora mismo."

  const events = (data ?? []).map((r) => ({
    title: r.title as string,
    startAt: r.start_at as string,
    allDay: r.all_day as boolean,
    recurrenceRule: r.recurrence_rule as string | null,
    exceptionDates: (r.exception_dates as string[]) ?? [],
  }))

  const todayEvents = events.filter((ev) => expandOccurrences(ev, today, today).includes(today))
  if (todayEvents.length > 0) {
    const titles = todayEvents.map((ev) => ev.title)
    return `Hoy tienes: ${titles.join(", ")}.`
  }

  // Nada hoy: busca lo próximo en los siguientes 90 días (mismo criterio que answerNextCalendarEvent).
  const rangeEnd = new Date()
  rangeEnd.setDate(rangeEnd.getDate() + 90)
  const rangeEndStr = `${rangeEnd.getFullYear()}-${String(rangeEnd.getMonth() + 1).padStart(2, "0")}-${String(rangeEnd.getDate()).padStart(2, "0")}`
  let best: { title: string; date: string } | null = null
  for (const ev of events) {
    const occurrences = expandOccurrences(ev, today, rangeEndStr)
    for (const date of occurrences) {
      if (!best || date < best.date) best = { title: ev.title, date }
    }
  }
  if (!best) return "No tienes nada hoy, ni nada próximo en el calendario."
  const label = new Date(best.date + "T00:00").toLocaleDateString("es-ES", { day: "numeric", month: "long" })
  return `Hoy no tienes nada. Lo siguiente es «${best.title}», el ${label}.`
}

// ---------------------------------------------------------------------
// El tiempo — puerto de weatherAnswerForPlace/resolveDestination (src/pepa/location.ts): primero
// un lugar guardado de la familia, si no, búsqueda directa en Google Places (no a través de la
// función google-maps, que exige JWT de usuario y aquí nunca lo hay).
// ---------------------------------------------------------------------
async function searchPlaceDirect(query: string): Promise<{ label: string; latitude: number; longitude: number } | null> {
  const { data: apiKey } = await admin.rpc("get_app_secret", { p_name: "GOOGLE_MAPS_SERVER_KEY" })
  if (!apiKey) return null

  const autoRes = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey },
    body: JSON.stringify({ input: query, languageCode: "es", regionCode: "ES" }),
  })
  if (!autoRes.ok) return null
  const autoData = await autoRes.json()
  const placeId = autoData.suggestions?.[0]?.placePrediction?.placeId
  if (!placeId) return null

  const detailsRes = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "displayName,formattedAddress,location" },
  })
  if (!detailsRes.ok) return null
  const details = await detailsRes.json()
  if (!details.location) return null
  return {
    label: details.formattedAddress ?? details.displayName?.text ?? query,
    latitude: details.location.latitude,
    longitude: details.location.longitude,
  }
}

async function answerWeather(familyId: string, spokenPlace: string): Promise<string> {
  const { data: places } = await admin
    .from("location_places")
    .select("name, category, latitude, longitude, radius_m")
    .eq("family_id", familyId)
  const target = normalize(spokenPlace)
  const saved = (places ?? []).find((p) => {
    const name = normalize(p.name as string)
    const category = p.category ? normalize(p.category as string) : null
    return name === target || name.includes(target) || target.includes(name) || category === target
  })

  let destination: { label: string; latitude: number; longitude: number } | null = saved
    ? { label: saved.name as string, latitude: saved.latitude as number, longitude: saved.longitude as number }
    : null

  if (!destination) destination = await searchPlaceDirect(spokenPlace)
  if (!destination) return `No he encontrado «${spokenPlace}», ni entre los lugares guardados ni buscándolo en el mapa.`

  const report = await getWeather(destination.latitude, destination.longitude)
  if (!report) return `No he podido consultar el tiempo en ${destination.label} ahora mismo.`
  return formatWeatherReport(destination.label, report)
}

// ---------------------------------------------------------------------
// Clasificador — mismo orden de siempre (Cocina → compra/calendario → tiempo), simplificado a
// solo-lectura: no hace falta distinguir pregunta/encargo (Alexa, en esta ronda, solo pregunta).
// ---------------------------------------------------------------------
const SHOP_WORDS = /\b(?:compra|compras|comprar|lista|supermercado)\b/
const CAL_WORDS = /\b(?:hoy|agenda|calendario|cita|citas|evento|eventos|tareas|pendiente)\b/

async function answerQuery(text: string, familyId: string): Promise<string> {
  const n = normalize(text)

  const meals = matchMenuQuery(text)
  if (meals) return answerMenu(familyId, meals)

  const place = matchWeatherPlace(n)
  if (place) return answerWeather(familyId, place)

  if (SHOP_WORDS.test(n)) return answerShopping(familyId)
  if (CAL_WORDS.test(n)) return answerCalendarToday(familyId)

  return NOT_UNDERSTOOD
}

Deno.serve(async (req) => {
  try {
    const body = (await req.json()) as AlexaRequest
    const accessToken = body.context?.System?.user?.accessToken ?? body.session?.user?.accessToken
    const familyId = accessToken ? await resolveFamilyId(accessToken) : null

    if (body.request.type === "LaunchRequest") {
      return alexaResponse(
        familyId
          ? "Hola, soy Pepa. Puedes preguntarme por la lista de la compra, la agenda de hoy, el menú o el tiempo."
          : NOT_LINKED,
        false,
      )
    }

    if (body.request.type === "SessionEndedRequest") return new Response(null, { status: 200 })

    if (body.request.type !== "IntentRequest") return alexaResponse(NOT_UNDERSTOOD, true)

    if (!familyId) return alexaResponse(NOT_LINKED, true)

    if (body.request.intent?.name !== "AskPepaIntent") return alexaResponse(NOT_UNDERSTOOD, true)

    const query = body.request.intent?.slots?.Query?.value ?? ""
    if (!query.trim()) return alexaResponse(NOT_UNDERSTOOD, true)

    const text = await answerQuery(query, familyId)
    return alexaResponse(text, true)
  } catch (err) {
    console.error("[alexa-webhook] error:", String(err))
    return alexaResponse("Ha habido un problema contestando a eso. Inténtalo de nuevo en un momento.", true)
  }
})
