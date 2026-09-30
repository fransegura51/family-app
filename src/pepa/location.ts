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

export interface LocationDeps {
  places(): Promise<LocationPlace[]>
  memberLocations(): Promise<MemberLocation[]>
  members(): Promise<{ id: string; name: string }[]>
  // null = sin permiso, GPS apagado, o el dispositivo no lo soporta — se avisa, no se rompe nada.
  currentPosition(): Promise<{ latitude: number; longitude: number } | null>
  searchFirstPlace(term: string): Promise<FoundPlace | null>
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

async function resolveDestination(spoken: string, deps: LocationDeps): Promise<Destination | null> {
  const saved = findPlace(spoken, await deps.places())
  if (saved) return { latitude: saved.latitude, longitude: saved.longitude, label: saved.name }
  const found = await deps.searchFirstPlace(spoken)
  if (!found) return null
  rememberFoundPlace(found)
  return { latitude: found.latitude, longitude: found.longitude, label: found.label }
}

async function handleSearch(term: string, deps: LocationDeps): Promise<TalkOutcome> {
  const found = await deps.searchFirstPlace(term)
  if (!found) {
    return { kind: 'answer', text: `No he encontrado ningún sitio llamado «${term}». Prueba a buscarlo a mano en Ubicación.` }
  }
  rememberFoundPlace(found)
  return { kind: 'focus-place', text: `He encontrado ${found.label}. Si quieres guardarlo como lugar frecuente, di «guárdalo».` }
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
  const destination = await resolveDestination(spokenPlace, deps)
  if (!destination) return { kind: 'answer', text: NOT_FOUND(spokenPlace) }
  const origin = await deps.currentPosition()
  if (!origin) return { kind: 'answer', text: 'No he podido saber dónde estás ahora mismo — revisa el permiso de ubicación del teléfono.' }
  const eta = await deps.drivingEta(origin, destination)
  if (!eta) return { kind: 'answer', text: `No he podido calcular el tiempo en coche hasta ${destination.label} ahora mismo.` }
  return { kind: 'answer', text: `Desde donde estás, hasta ${destination.label} se tarda unos ${eta.minutes} minutos en coche (${eta.km} km, con tráfico).` }
}

async function handleNearest(spokenPlace: string, deps: LocationDeps): Promise<TalkOutcome> {
  const [destination, locations, members] = await Promise.all([resolveDestination(spokenPlace, deps), deps.memberLocations(), deps.members()])
  if (!destination) return { kind: 'answer', text: NOT_FOUND(spokenPlace) }
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
