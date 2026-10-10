// «Pepa, ¿dónde está Fran?» / «mándame la ubicación de Fran»: entender la frase y redactar la respuesta con lo que se sabe de esa persona
// (su última posición compartida). Solo reglas, sin IA ni red: lo de buscar a quién se refiere y leer su posición lo hace pepa/location.ts.
//
// Antes, «dónde está X» se tomaba siempre por buscar un SITIO llamado X en Google Maps (domain/locationRoute.ts, SEARCH_TRIGGER_RE). Ahora, si X es
// alguien de la familia, se le localiza a él; si no lo es («dónde está la farmacia»), todo sigue como antes.
import { distanceMeters, formatDistance } from '@/domain/geo'
import { describePositionAge } from '@/domain/positionFreshness'
import { normalize } from '@/domain/voiceQuery'
import type { LocationPlace } from '@/domain/types'

// «dónde está / anda / se encuentra / está ahora mismo…», con «dime», «pepa» o «y» delante.
const WHERE_RE = /^(?:pepa\s+)?(?:dime\s+)?(?:y\s+)?(?:en\s+)?donde\s+(?:esta|anda|se encuentra|estan|andan|se encuentran|se ha metido|se han metido|andara|estara|vive)\s+(.+)$/
// «mándame / envíame / pásame / dame la ubicación (actual) de X».
const SHARE_RE = /^(?:pepa\s+)?(?:mandame|manda|enviame|envia|pasame|pasa|dame|dime)\s+(?:la\s+)?ubicacion\s+(?:actual\s+)?de\s+(.+)$/
// «localiza a X», «ubica a X», «localízame a X».
const LOCATE_RE = /^(?:pepa\s+)?(?:localiza|localizame|ubica|ubicame)\s+a\s+(.+)$/
// «la ubicación de X», «ubicación de X».
const LOCATION_OF_RE = /^(?:pepa\s+)?(?:la\s+)?ubicacion\s+(?:actual\s+)?de\s+(.+)$/

// Relleno que se queda colgando detrás del nombre: «dónde está Fran ahora mismo», «…por favor».
const TAIL_FILLER_RE = /\s+(?:ahora mismo|ahora|en este momento|en estos momentos|actualmente|ya|por favor|porfa|gracias)$/
const LEADING_ARTICLE_RE = /^(?:a|al|el|la)\s+/

export function parseWhereIs(text: string): { subject: string } | null {
  // Sin signos de puntuación («¿Dónde está Eric?», «…Eric, por favor»): se separan con espacios para que no se peguen palabras.
  const n = normalize(text).replace(/[¿?¡!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim()
  const match = WHERE_RE.exec(n) ?? SHARE_RE.exec(n) ?? LOCATE_RE.exec(n) ?? LOCATION_OF_RE.exec(n)
  if (!match) return null
  let subject = match[1].trim()
  for (let i = 0; i < 3; i++) subject = subject.replace(TAIL_FILLER_RE, '').trim()
  subject = subject.replace(LEADING_ARTICLE_RE, '').trim()
  return subject ? { subject } : null
}

// A quién se refiere el nombre dicho. Coincidencia EXACTA por palabras (no aproximada): «la farmacia» no puede acabar siendo «Carmen».
// «Paco» encuentra a «Paco» y a «Paco García»; «Maria» encuentra a «Maria del Mar» si es la única Maria.
export function findMemberByName<T extends { name: string }>(subject: string, members: T[]): T | null {
  const target = normalize(subject).trim()
  if (!target) return null
  const exact = members.filter((m) => normalize(m.name).trim() === target)
  if (exact.length === 1) return exact[0]
  const words = target.split(/\s+/)
  const byFirst = members.filter((m) => {
    const nameWords = normalize(m.name).trim().split(/\s+/)
    return nameWords[0] === words[0] && (words.length === 1 || words.every((w) => nameWords.includes(w)))
  })
  return byFirst.length === 1 ? byFirst[0] : null
}

export interface MemberSpot {
  kind: 'inside' | 'near' | 'none'
  label: string | null
  meters: number
}

// En qué lugar GUARDADO está: dentro de su radio («en Casa») o cerca (menos de 400 m: «a 120 m de Cole Eric»). El nombre es el que se le puso al
// lugar (categoría) si lo hay, igual que en los avisos de llegada/salida.
export function describeMemberSpot(latitude: number, longitude: number, places: LocationPlace[]): MemberSpot {
  let best: { label: string; dist: number; radius: number } | null = null
  for (const place of places) {
    const dist = distanceMeters(latitude, longitude, place.latitude, place.longitude)
    if (!best || dist - place.radiusM < best.dist - best.radius) {
      best = { label: place.category?.trim() || place.name, dist, radius: place.radiusM }
    }
  }
  if (!best) return { kind: 'none', label: null, meters: 0 }
  if (best.dist <= best.radius) return { kind: 'inside', label: best.label, meters: best.dist }
  if (best.dist <= 400) return { kind: 'near', label: best.label, meters: best.dist }
  return { kind: 'none', label: null, meters: best.dist }
}

// «hace 3 minutos», «hace 2 horas y 10 minutos» — escrito completo para que suene bien dicho en voz alta («min» sonaría raro).
export function spokenAge(recordedAt: string, nowMs: number): string {
  const minutes = Math.floor(Math.max(0, nowMs - new Date(recordedAt).getTime()) / 60_000)
  if (minutes < 1) return 'ahora mismo'
  if (minutes < 60) return `hace ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours < 24) {
    const h = `${hours} ${hours === 1 ? 'hora' : 'horas'}`
    return rest === 0 ? `hace ${h}` : `hace ${h} y ${rest} ${rest === 1 ? 'minuto' : 'minutos'}`
  }
  const days = Math.floor(hours / 24)
  return `hace ${days} ${days === 1 ? 'día' : 'días'}`
}

export function googleMapsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude.toFixed(6)},${longitude.toFixed(6)}`
}

export function notSharingAnswer(name: string): string {
  return `${name} no está compartiendo su ubicación ahora mismo, así que no puedo saber dónde está. Para que se vea, ${name} tiene que activar «Compartir ubicación» en PEPA desde su móvil.`
}

// La respuesta hablada. `address` = dirección legible si no está en un lugar guardado (puede ser null).
export function buildMemberAnswer(input: {
  name: string
  recordedAt: string
  nowMs: number
  spot: MemberSpot
  address: string | null
}): string {
  const { name, recordedAt, nowMs, spot, address } = input
  const { stale } = describePositionAge(recordedAt, nowMs)
  const when = spokenAge(recordedAt, nowMs)
  let where: string
  if (spot.kind === 'inside') where = `en ${spot.label}`
  else if (spot.kind === 'near') where = `cerca de ${spot.label}, a ${formatDistance(spot.meters)}`
  else if (address) where = `en ${address}`
  else where = 'en un sitio que no tengo guardado'

  if (!stale) {
    return when === 'ahora mismo' ? `${name} está ${where} ahora mismo.` : `${name} está ${where}. Su ubicación se actualizó ${when}.`
  }
  return `La última vez que ${name} compartió su ubicación fue ${when}, y estaba ${where}. Puede que ya no esté ahí: su móvil no la envía con la aplicación cerrada o en segundo plano.`
}
