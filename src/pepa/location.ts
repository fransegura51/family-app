// "Hablar con PEPA" (botón general) entendiendo Ubicación: buscar un sitio, guardarlo, o preguntar
// por el tiempo en coche o quién está más cerca de un lugar ya guardado — petición real: "que
// podamos buscar sitios por voz... a través del botón general de Pepa". Se comprueba en
// pepa/talk.ts (runTalk) DESPUÉS de Cocina, así que "busca una receta de tortilla" lo sigue
// resolviendo Cocina, nunca esto.
import { distanceMeters, formatDistance } from '@/domain/geo'
import { routeLocation } from '@/domain/locationRoute'
import { normalize } from '@/domain/voiceQuery'
import { DEFAULT_PLACE_RADIUS_M } from '@/pepa/actions/locationActions'
import { proposeAction } from '@/pepa/actions/registry'
import type { ActionContext } from '@/pepa/actions/types'
import { forgetFoundPlace, pendingFoundPlace, rememberFoundPlace, type FoundPlace } from '@/pepa/recentContext'
import type { TalkOutcome } from '@/pepa/talk'
import type { LocationPlace, MemberLocation } from '@/domain/types'

// Antes era `Promise<FoundPlace | null>`, así que agotar el freno diario (búsquedas de hoy ya
// gastadas, googleMapsUsageGuard.ts) se veía IGUAL que "no existe ese sitio" — bug real reportado:
// "la gilipollas de Pepa no encuentra Madrid" (que obviamente existe) tras un día entero probando
// cosas que ya habían consumido el cupo de búsquedas. Con el motivo aparte, el aviso dice la verdad.
export type SearchOutcome = { ok: true; place: FoundPlace } | { ok: false; reason: 'daily-limit' | 'not-found' }

export interface LocationDeps {
  places(): Promise<LocationPlace[]>
  memberLocations(): Promise<MemberLocation[]>
  members(): Promise<{ id: string; name: string }[]>
  // null = sin permiso, GPS apagado, o el dispositivo no lo soporta — se avisa, no se rompe nada.
  currentPosition(): Promise<{ latitude: number; longitude: number } | null>
  // bias = acerca los resultados a esas coordenadas sin excluir los de lejos (p. ej. "Madrid" sigue
  // encontrándose aunque no estés cerca) — sobre todo para el botón "📍 Buscar sitio cercano".
  searchFirstPlace(term: string, bias?: { latitude: number; longitude: number } | null): Promise<SearchOutcome>
  drivingEta(origin: { latitude: number; longitude: number }, destination: { latitude: number; longitude: number }): Promise<{ minutes: number; km: number } | null>
}

function emptyContext(): ActionContext {
  return { recipes: [], menuEntries: [], shoppingItemNames: [], members: [], today: new Date() }
}

// "la farmacia", "el cole de los niños"... contra el nombre guardado — quitando el artículo delante
// (si lo hay) para que "la farmacia" encuentre un lugar guardado como "Farmacia", y al revés.
function stripLeadingArticle(text: string): string {
  return text.replace(/^(?:el|la|los|las)\s+/, '')
}

// Petición real: "le he puesto trabajo [de categoría]... y le he dicho a Pepa quién está más cerca
// de trabajo y no lo ha reconocido... también quiero que reconozca las categorías" — busca tanto
// por el nombre del lugar ("Cargofrío") como por su categoría ("Trabajo"), no solo el nombre. Con
// varios lugares que compartan categoría (dos "Trabajo" distintos, uno por persona) se queda con la
// coincidencia más larga/exacta — no distingue de quién es cada uno, no hay ese dato guardado.
function findPlace(spoken: string, places: LocationPlace[]): LocationPlace | null {
  const target = stripLeadingArticle(normalize(spoken))
  if (!target) return null
  let best: { place: LocationPlace; matchLength: number } | null = null
  for (const place of places) {
    for (const raw of [place.name, place.category]) {
      if (!raw) continue
      const candidate = normalize(raw)
      if (candidate === target || candidate.includes(target) || target.includes(candidate)) {
        if (!best || candidate.length > best.matchLength) best = { place, matchLength: candidate.length }
      }
    }
  }
  return best?.place ?? null
}

const NOT_FOUND = (spoken: string) => `No he encontrado «${spoken}», ni entre tus lugares guardados ni buscándolo en el mapa.`
const DAILY_LIMIT = 'Ya has usado hoy el número de veces que este teléfono puede buscar sitios en el mapa (es un freno para no gastar de más, no un fallo). Se puede volver a usar mañana.'

// Petición real: "quiero preguntarle... cuánto tiempo tengo hasta trabajo... o qué tiempo tengo
// hasta Madrid... incluyendo Madrid y todos los lugares que están en Google Maps" — antes "cuánto
// se tarda"/"quién está más cerca" solo miraban los lugares ya guardados; ahora, si no hay ninguno
// guardado con ese nombre o categoría, lo busca de verdad en Google Maps (la misma búsqueda que
// "busca X"), igual que si estuviera guardado. Si viene de esa búsqueda, se recuerda (como al
// buscar) para poder decir "guárdalo" justo después sin tener que buscarlo otra vez.
interface Destination {
  latitude: number
  longitude: number
  label: string
}

async function resolveDestination(spoken: string, deps: LocationDeps): Promise<{ ok: true; destination: Destination } | { ok: false; reason: 'daily-limit' | 'not-found' }> {
  const saved = findPlace(spoken, await deps.places())
  if (saved) return { ok: true, destination: { latitude: saved.latitude, longitude: saved.longitude, label: saved.name } }
  const bias = await deps.currentPosition()
  const result = await deps.searchFirstPlace(spoken, bias)
  if (!result.ok) return result
  rememberFoundPlace(result.place)
  return { ok: true, destination: { latitude: result.place.latitude, longitude: result.place.longitude, label: result.place.label } }
}

async function handleSearch(term: string, deps: LocationDeps): Promise<TalkOutcome> {
  const bias = await deps.currentPosition()
  const result = await deps.searchFirstPlace(term, bias)
  if (!result.ok) {
    return {
      kind: 'answer',
      text: result.reason === 'daily-limit' ? DAILY_LIMIT : `No he encontrado ningún sitio llamado «${term}». Prueba a buscarlo a mano en Ubicación.`,
    }
  }
  rememberFoundPlace(result.place)
  return { kind: 'focus-place', text: `He encontrado ${result.place.label}. Si quieres guardarlo como lugar frecuente, di «guárdalo».` }
}

async function handleSave(name: string | null): Promise<TalkOutcome> {
  const place = pendingFoundPlace()
  if (!place) {
    return { kind: 'answer', text: 'No tengo ningún sitio reciente que guardar. Primero dime, por ejemplo, «busca la farmacia».' }
  }
  const finalName = (name ?? place.label).trim().slice(0, 80)
  const result = proposeAction(
    'location.addPlace',
    { name: finalName, latitude: place.latitude, longitude: place.longitude, radiusM: DEFAULT_PLACE_RADIUS_M },
    emptyContext(),
  )
  if (!result.ok) return { kind: 'answer', text: `No he podido preparar eso: ${result.errors[0]}` }
  forgetFoundPlace()
  return {
    kind: 'proposal',
    proposal: result.proposal,
    text: `Voy a guardar «${finalName}» como lugar frecuente. Revísalo en la tarjeta y pulsa Guardar.`,
  }
}

async function handleEta(spokenPlace: string, deps: LocationDeps): Promise<TalkOutcome> {
  const resolved = await resolveDestination(spokenPlace, deps)
  if (!resolved.ok) return { kind: 'answer', text: resolved.reason === 'daily-limit' ? DAILY_LIMIT : NOT_FOUND(spokenPlace) }
  const destination = resolved.destination
  const origin = await deps.currentPosition()
  if (!origin) return { kind: 'answer', text: 'No he podido saber dónde estás ahora mismo — revisa el permiso de ubicación del teléfono.' }
  const eta = await deps.drivingEta(origin, destination)
  if (!eta) return { kind: 'answer', text: `No he podido calcular el tiempo en coche hasta ${destination.label} ahora mismo.` }
  return { kind: 'answer', text: `Desde donde estás, hasta ${destination.label} se tarda unos ${eta.minutes} minutos en coche (${eta.km} km, con tráfico).` }
}

async function handleNearest(spokenPlace: string, deps: LocationDeps): Promise<TalkOutcome> {
  const [resolved, locations, members] = await Promise.all([resolveDestination(spokenPlace, deps), deps.memberLocations(), deps.members()])
  if (!resolved.ok) return { kind: 'answer', text: resolved.reason === 'daily-limit' ? DAILY_LIMIT : NOT_FOUND(spokenPlace) }
  const destination = resolved.destination
  const ranked = locations
    .map((loc) => {
      const member = members.find((m) => m.id === loc.memberId)
      return member ? { member, dist: distanceMeters(loc.latitude, loc.longitude, destination.latitude, destination.longitude) } : null
    })
    .filter((x): x is { member: { id: string; name: string }; dist: number } => x !== null)
    .sort((a, b) => a.dist - b.dist)
  if (ranked.length === 0) return { kind: 'answer', text: 'Nadie está compartiendo su ubicación ahora mismo.' }
  const nearest = ranked[0]
  return { kind: 'answer', text: `${nearest.member.name} está más cerca de ${destination.label}, a ${formatDistance(nearest.dist)}.` }
}

export async function locationAction(text: string, deps: LocationDeps): Promise<TalkOutcome | null> {
  const intent = routeLocation(text)
  if (!intent) return null
  switch (intent.type) {
    case 'search':
      return handleSearch(intent.term, deps)
    case 'save':
      return handleSave(intent.name)
    case 'eta':
      return handleEta(intent.place, deps)
    case 'nearest':
      return handleNearest(intent.place, deps)
  }
}
