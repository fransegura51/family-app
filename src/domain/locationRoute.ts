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
  | { type: 'weather'; place: string }

// "Guárdalo", "guárdame esto", "guarda este sitio", "guárdalo como Farmacia de la esquina" — a
// propósito NO incluye el resto de verbos de guardar de siempre (domain/voiceQuery.ts,
// looksLikeSaveInstruction), que ya sirven para la compra y el calendario: aquí solo cuenta si
// menciona claramente un sitio/lugar, o si es la frase corta y sin nada más detrás (petición real:
// "guárdalo" a secas, justo después de haber buscado uno).
const SAVE_BARE_RE = /^guarda(?:lo|la|me(?:lo|la)?)?$/
const SAVE_PLACE_RE = /^guarda(?:lo|la|me(?:lo|la)?)?\s+(?:este\s+)?(?:sitio|lugar)(?:\s+como\s+(.+))?$/
const SAVE_AS_RE = /^guarda(?:lo|la|me(?:lo|la)?)?\s+como\s+(.+)$/

// "Cuánto se tarda en coche a X", "cuánto tardo hasta X", "cuánto tiempo se tarda al aeropuerto",
// y también, peticiones reales: "cuánto tiempo tengo hasta trabajo", "qué tiempo tengo hasta
// Madrid", "qué distancia tengo hasta X", "cuánto queda hasta Valencia", "cuántos kilómetros
// tenemos a Bilbao", "qué se tarda en llegar a Alicante" — con "cuanto"/"cuantos"/"cuantas"/"que"
// delante; "tiempo"/"kilómetros"/"km"/"distancia" de por medio (o nada); varios verbos
// (tarda/tardamos/tardo/tengo/tenemos/hay/queda/quedan/falta/faltan); y "en coche"/"en llegar"/"en
// el coche"/"para llegar" antes de la "a"/"hasta"/"hacia" final, o nada. La respuesta ya lleva
// minutos Y km siempre (pepa/location.ts), así que da igual por cuál de las dos se pregunte.
//
// SIN "^" delante a propósito (petición real, 01/10/2026: "le estoy preguntando cuánto se tarda
// hasta Barcelona y no sabe decírmelo... a la tercera o a la cuarta vez" lo entendía bien, con la
// MISMA pregunta repetida) — el dictado por voz a veces mete ruido delante sin que la persona lo
// note (un carraspeo, un "eh" que el teléfono transcribe, un trocito de "Pepa" que no se ha quitado
// del todo): exigir que la frase entera empezara justo por "cuánto"/"qué" tiraba a la basura
// preguntas que, quitando ese ruido inicial, eran perfectamente válidas. Ahora basta con que el
// patrón aparezca en algún punto de lo dicho, siga sin romperse hasta el final, y el sitio sea
// literalmente lo último (así no confunde "cuánto cuesta la cena de esta noche" con una pregunta de
// Ubicación, que no termina en "a/hasta/hacia + sitio").
const ETA_RE =
  /(?:cuant[oa]s?|que)\s+(?:(?:tiempo|kilometros|km|distancia)\s+)?(?:se tarda|tardamos|tardo|tengo|tenemos|hay|quedan?|faltan?)(?:\s+(?:en\s+(?:coche|el coche|llegar)|para\s+llegar))?\s+(?:a(?:l)?|hasta|hacia)\s+(.+)$/

// "Quién está más cerca de X", "quién anda más cerca del cole".
const NEAREST_RE = /^quien(?:\s+(?:esta|anda|vive))?\s+mas cerca\s+(?:de(?:l)?|a)\s+(.+)$/

// "Qué tiempo hace en Madrid", "qué tiempo va a hacer en el cole", "cómo está el tiempo en
// Valencia", "cómo va el tiempo en Rafal", "qué tal el tiempo en Madrid", "dime el tiempo en
// Rafal", "dime qué tiempo hace en Rafal", "previsión en Madrid", "previsión del tiempo en
// Madrid", "previsión meteorológica en Madrid", "qué tiempo hará mañana en Madrid" — petición
// real: "quiero que el asistente de Pepa me diga también el tiempo que hace en un sitio en
// concreto y la previsión". Un día de por medio (hoy/mañana/pasado mañana) es opcional y no
// cambia la respuesta: siempre se dice el tiempo de ahora Y la previsión de los próximos días
// juntos (pepa/location.ts, handleWeather) — no merece la pena distinguir qué día exacto se ha
// pedido por voz. Sin "^" delante, mismo motivo que ETA_RE.
//
// Bug real reportado (01/10/2026): "le he preguntado por el tiempo en Rafal y leyó una nota del
// calendario" — con la primera versión (solo "qué tiempo hace"/"cómo está el tiempo"/"previsión"),
// una frase real tan natural como "cómo va el tiempo en Rafal" o "dime el tiempo en Rafal" no
// encajaba en nada de Ubicación. Ampliado con más formas reales de preguntarlo, Y (segundo bug
// real, misma tarde, "tiene que reconocer todas las frases que se le digan") con cualquier relleno
// de por medio entre el disparador y el sitio (antes solo toleraba "hoy"/"mañana"/"pasado mañana"
// exactos ahí — "qué tiempo hace ahora mismo en Rafal" ya no encajaba por un «ahora mismo» de más).
// "para" quitado a propósito de los conectores (a diferencia de ETA_RE): "tiempo para X" es
// ambiguo de verdad en español ("no tengo tiempo PARA ir a Madrid" no es del tiempo) — "en"/"de"
// cubren con creces cómo se pregunta esto de verdad, sin ese riesgo.
//
// Esto YA NO es la única red: si ni esto ni nada más entiende la frase, pepa/talk.ts (askWithAi)
// se lo pregunta a la IA de respaldo (ver pepaIntent.ts / supabase/functions/_shared/ai/purposes/
// pepaIntent.ts), que ahora también sabe reconocer el tiempo meteorológico en cualquier forma —
// antes esa IA solo entendía de tareas/calendario/compra, así que una frase que no encajara aquí
// acababa contestada con lo más parecido de ESO en vez de con el tiempo.
const WEATHER_RE =
  /(?:que tiempo\s+(?:hace|va a hacer|hara|tenemos|tendremos)|que tal\s+(?:esta\s+)?el tiempo|como\s+(?:esta|va(?:\s+a estar)?)\s+el tiempo|dime(?:\s+(?:que tiempo hace|el tiempo))?|prevision(?:\s+(?:del tiempo|meteorologica))?|el tiempo)[\s\S]*?\s(?:en|de)\s+(.+)$/

// A propósito NO incluye "necesito" (a diferencia de domain/voiceQuery.ts, PLACE_QUERY_PREFIXES,
// que sí lo tiene): ahí es seguro porque el botón "📍 Buscar sitio" ya deja claro que TODO lo dicho
// es una búsqueda de sitio, pero aquí, en el botón general, "necesito comprar leche" tiene que
// seguir yendo a la lista de la compra (domain/talkRoute.ts, BUY_STATEMENT) — no a Ubicación.
// "buscar" (infinitivo, petición real: "buscar cargo frío mediterránea", "buscar casa"), además de
// "busca"/"buscame" — con un ojo puesto en "buscar una receta de X": Cocina (pepa/talk.ts) ya se
// comprueba ANTES que esto para "busca"/"buscame" + "receta", pero su propia lista de verbos no
// incluye "buscar" (domain/kitchenQuery.ts), así que aquí se excluye a mano para que "buscar una
// receta de tortilla" no se trate como si "una receta de tortilla" fuera el nombre de un sitio.
const SEARCH_TRIGGER_RE = /^(?:buscame|busca|buscar|encuentrame|encuentra|quiero encontrar|donde hay|dime donde hay|donde esta|donde queda)\s+/
const RECIPE_SEARCH_RE = /\breceta\b/

export function routeLocation(text: string): LocationIntent | null {
  const n = normalize(text)

  const eta = ETA_RE.exec(n)
  if (eta) return { type: 'eta', place: eta[1].trim() }

  const nearest = NEAREST_RE.exec(n)
  if (nearest) return { type: 'nearest', place: nearest[1].trim() }

  const weather = WEATHER_RE.exec(n)
  if (weather) return { type: 'weather', place: weather[1].trim() }

  const saveAs = SAVE_AS_RE.exec(n)
  if (saveAs) return { type: 'save', name: saveAs[1].trim() || null }
  const savePlace = SAVE_PLACE_RE.exec(n)
  if (savePlace) return { type: 'save', name: (savePlace[1] ?? '').trim() || null }
  if (SAVE_BARE_RE.test(n)) return { type: 'save', name: null }

  if (SEARCH_TRIGGER_RE.test(n) && !RECIPE_SEARCH_RE.test(n)) {
    const term = extractPlaceSearchTerm(text)
    if (term) return { type: 'search', term }
  }

  return null
}
