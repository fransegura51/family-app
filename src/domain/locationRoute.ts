// "Hablar con PEPA" (botón general) también entiende Ubicación: buscar un sitio, guardarlo como
// lugar frecuente, o preguntar por el tiempo en coche o quién está más cerca de uno ya guardado.
// Solo reglas, sin IA — igual que domain/talkRoute.ts para calendario/compra. Se comprueba DESPUÉS
// de Cocina (pepa/talk.ts, runTalk) para que "busca una receta de tortilla" lo siga resolviendo
// Cocina, nunca esto.
import { extractPlaceSearchTerm, normalize } from '@/domain/voiceQuery'

export type LocationIntent =
  | { type: 'search'; term: string }
  // name = null cuando no se ha dicho un nombre nuevo ("guárdalo") — se usa el del sitio encontrado.
  | { type: 'save'; name: string | null }
  | { type: 'eta'; place: string }
  | { type: 'nearest'; place: string }

// "Guárdalo", "guárdame esto", "guarda este sitio", "guárdalo como Farmacia de la esquina" — a
// propósito NO incluye el resto de verbos de guardar de siempre (domain/voiceQuery.ts,
// looksLikeSaveInstruction), que ya sirven para la compra y el calendario: aquí solo cuenta si
// menciona claramente un sitio/lugar, o si es la frase corta y sin nada más detrás (petición real:
// "guárdalo" a secas, justo después de haber buscado uno).
const SAVE_BARE_RE = /^guarda(?:lo|la|me(?:lo|la)?)?$/
const SAVE_PLACE_RE = /^guarda(?:lo|la|me(?:lo|la)?)?\s+(?:este\s+)?(?:sitio|lugar)(?:\s+como\s+(.+))?$/
const SAVE_AS_RE = /^guarda(?:lo|la|me(?:lo|la)?)?\s+como\s+(.+)$/

// "Cuánto se tarda en coche a X", "cuánto tardo hasta X", "cuánto tiempo se tarda al aeropuerto".
const ETA_RE = /^cuanto (?:se tarda|tardamos|tardo|tiempo (?:se tarda|tardamos|tardo))(?:\s+en coche)?\s+(?:a(?:l)?|hasta)\s+(.+)$/

// "Quién está más cerca de X", "quién anda más cerca del cole".
const NEAREST_RE = /^quien(?:\s+(?:esta|anda|vive))?\s+mas cerca\s+(?:de(?:l)?|a)\s+(.+)$/

// A propósito NO incluye "necesito" (a diferencia de domain/voiceQuery.ts, PLACE_QUERY_PREFIXES,
// que sí lo tiene): ahí es seguro porque el botón "📍 Buscar sitio" ya deja claro que TODO lo dicho
// es una búsqueda de sitio, pero aquí, en el botón general, "necesito comprar leche" tiene que
// seguir yendo a la lista de la compra (domain/talkRoute.ts, BUY_STATEMENT) — no a Ubicación.
const SEARCH_TRIGGER_RE = /^(?:buscame|busca|encuentrame|encuentra|quiero encontrar|donde hay|dime donde hay|donde esta|donde queda)\s+/

export function routeLocation(text: string): LocationIntent | null {
  const n = normalize(text)

  const eta = ETA_RE.exec(n)
  if (eta) return { type: 'eta', place: eta[1].trim() }

  const nearest = NEAREST_RE.exec(n)
  if (nearest) return { type: 'nearest', place: nearest[1].trim() }

  const saveAs = SAVE_AS_RE.exec(n)
  if (saveAs) return { type: 'save', name: saveAs[1].trim() || null }
  const savePlace = SAVE_PLACE_RE.exec(n)
  if (savePlace) return { type: 'save', name: (savePlace[1] ?? '').trim() || null }
  if (SAVE_BARE_RE.test(n)) return { type: 'save', name: null }

  if (SEARCH_TRIGGER_RE.test(n)) {
    const term = extractPlaceSearchTerm(text)
    if (term) return { type: 'search', term }
  }

  return null
}
