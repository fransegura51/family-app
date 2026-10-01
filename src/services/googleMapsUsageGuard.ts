// Freno de seguridad del mapa — petición real: "que no pase del tope y
// tengamos que pagar de más". Google no deja poner cupos diarios de
// verdad mientras la cuenta esté en la prueba gratuita (ver
// docs/GOOGLE_MAPS.md), así que esto cubre mientras tanto el caso más
// peligroso: que algo se quede enganchado pidiendo mapas o búsquedas
// una y otra vez sin que nadie se dé cuenta (un bucle, una pestaña que
// no para de recargar...). No es un tope real de gasto — para eso hace
// falta el cupo de Google, en cuanto la cuenta salga de la prueba
// gratuita — pero sí para un uso normal de la familia en un solo día.
//
// Cuenta por dispositivo (localStorage), no por familia entera: cada
// móvil lleva su propia cuenta. Se reinicia solo cada día.

// Petición real: "quiero que me amplíes el freno a 5 veces más mientras estoy con las pruebas" —
// x5 temporal mientras prueba todo lo nuevo de Ubicación (rutas, avisos de lugar...) sin toparse
// con el freno a media tarde. Si hace falta volver a los de antes, son 80/40/30.
const LIMITS = {
  map: 400, // cargar el mapa (Ubicación + selector de sitio)
  search: 200, // buscar una dirección o reconocer un sitio nuevo
  eta: 150, // calcular el tiempo de llegada en coche (Routes API)
} as const

export type GuardKind = keyof typeof LIMITS

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function storageKey(kind: GuardKind): string {
  return `pepa-google-maps-guard-${kind}`
}

function readCount(kind: GuardKind): number {
  try {
    const raw = localStorage.getItem(storageKey(kind))
    if (!raw) return 0
    const parsed: { day: string; count: number } = JSON.parse(raw)
    return parsed.day === today() ? parsed.count : 0
  } catch {
    // Sin localStorage (privado, bloqueado...) no se puede contar — se deja pasar,
    // el cupo de Google sigue siendo la protección real cuando exista.
    return 0
  }
}

function writeCount(kind: GuardKind, count: number) {
  try {
    localStorage.setItem(storageKey(kind), JSON.stringify({ day: today(), count }))
  } catch {
    // Igual que arriba: si no se puede guardar, no se cuenta, pero tampoco se rompe nada.
  }
}

// true si todavía se puede usar hoy; además, deja constancia del uso.
export function allowGoogleMapsUse(kind: GuardKind): boolean {
  const count = readCount(kind)
  if (count >= LIMITS[kind]) return false
  writeCount(kind, count + 1)
  return true
}

// Solo mira si YA se ha llegado al tope de hoy, sin contar un uso más — para poder avisar de que el
// motivo es el freno diario (y no un fallo real) ANTES de intentar la llamada de verdad. Bug real
// reportado ("Pepa no encuentra Madrid"): sin esto, agotar el cupo probando cosas se veía igual que
// un fallo real de búsqueda — no había forma de saber cuál de las dos cosas era.
export function hasReachedGoogleMapsLimit(kind: GuardKind): boolean {
  return readCount(kind) >= LIMITS[kind]
}

export class GoogleMapsDailyLimitError extends Error {
  constructor() {
    super('Se ha alcanzado el límite diario de uso del mapa en este dispositivo. Vuelve a intentarlo mañana.')
    this.name = 'GoogleMapsDailyLimitError'
  }
}
