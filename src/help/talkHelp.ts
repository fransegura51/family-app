import { normalize } from '@/domain/voiceQuery'
import { moduleAccess, type HelpAccessResult, type HelpContext } from '@/help/access'
import { cardsOfModule, HELP_MODULE_BY_ID } from '@/help/catalog'
import type { SearchResponse } from '@/help/search/searchEngine'
import type { HelpCard, HelpGo, HelpModuleId } from '@/help/types'
import { TOURS } from '@/help/tours/registry'

// «Necesito ayuda con compras» en «Hablar con PEPA»: Pepa lleva a esa pantalla y EXPLICA por voz lo que cuenta la Ayuda («Pepa te acompaña»). Nada se inventa: el texto sale
// de las fichas y del resumen del módulo del catálogo de la Ayuda (src/help/catalog), con los mismos permisos que la Ayuda (src/help/access.ts).

/** Lo que necesita de la Ayuda: sus permisos y su buscador (los da HelpProvider; en las pruebas se arman con el mismo catálogo). */
export interface TalkHelpApi {
  ctx: HelpContext
  search(query: string): SearchResponse
  accessOfCard(card: HelpCard): HelpAccessResult
  /** ¿Puede esta cuenta hacer ese recorrido «Enséñame» / «Conoce esta sección»? */
  canDoTour(tourId: string): boolean
}

export type TalkHelpAnswer =
  /** Explicar de palabra y llevar a la pantalla. Con `tourId`, además se arranca el recorrido guiado (marca en pantalla dónde pulsar, cambia de pantalla y habla cada paso). */
  | { kind: 'go'; text: string; go: HelpGo; title: string; moduleId: HelpModuleId; tourId?: string }
  /** Solo explicar (no hay pantalla a la que llevar, o la cuenta no tiene acceso). */
  | { kind: 'say'; text: string }

// Cómo se pide ayuda: «necesito ayuda con…», «ayúdame con…», «cómo funciona…», «explícame…», «para qué sirve…», «qué puedo hacer en…», «no sé usar…».
const HELP_INTENT =
  /\b(?:(?:necesito|quiero|dame|me das|puedes darme|pido)\s+ayuda|ayuda\s+(?:con|en|sobre|para|de|a)\b|ayudame|ayudanos|como\s+(?:funciona|funcionan|se usa|se utiliza|se usan|uso|se maneja|va)|explicame|explicanos|ensename|ensenanos|para que sirve|para que sirven|que puedo hacer (?:en|con)|que se puede hacer (?:en|con)|no se (?:usar|como usar|como funciona))\b/

// Palabras que identifican cada sección. Se miran por palabra completa sobre el texto normalizado (sin tildes ni mayúsculas).
const MODULE_WORDS: [HelpModuleId, RegExp][] = [
  ['pepa', /\b(?:hablar con pepa|el asistente|asistente de voz|hablarle a pepa|botones redondos)\b/],
  ['compras', /\b(?:compras?|lista de la compra|supermercados?|tickets?|historial de precios|estadistica de compras)\b/],
  ['calendario', /\b(?:calendario|agenda|tareas?|citas?)\b/],
  ['cocina', /\b(?:cocina|recetas?|menu semanal|menus?|alimentacion)\b/],
  ['economia', /\b(?:economia|dinero|gastos?|presupuestos?|banco|movimientos|ahorros?)\b/],
  ['eventos', /\b(?:eventos?|fiestas?|celebraciones|invitados)\b/],
  ['pequenos', /\b(?:pequenos grandes|puntos|recompensas|educacion financiera|listas? de deseos)\b/],
  ['cumpleanos', /\b(?:cumpleanos)\b/],
  ['contactos', /\b(?:contactos|agenda de contactos)\b/],
  ['galeria', /\b(?:galeria|fotos)\b/],
  ['documentos', /\b(?:documentos)\b/],
  ['ubicacion', /\b(?:ubicacion|localizacion|el mapa|mapa)\b/],
  ['comunidad', /\b(?:comunidad)\b/],
  ['notificaciones', /\b(?:notificaciones|avisos|la campana)\b/],
  ['cuentas', /\b(?:mi cuenta|contrasena|el pin|huella|cerrar sesion|invitar a alguien)\b/],
  ['configuracion', /\b(?:configuracion|ajustes|opciones)\b/],
  ['familia', /\b(?:familia|miembros)\b/],
  ['inicio', /\b(?:inicio|pantalla principal|portada)\b/],
]

const FILLER = new Set([
  'necesito', 'quiero', 'dame', 'ayuda', 'ayudame', 'ayudanos', 'con', 'en', 'sobre', 'para', 'de', 'del', 'la', 'el', 'las', 'los', 'un', 'una', 'me', 'te', 'se', 'lo', 'que',
  'como', 'funciona', 'funcionan', 'usa', 'usar', 'uso', 'explicame', 'ensename', 'sirve', 'sirven', 'puedo', 'hacer', 'mi', 'por', 'favor', 'pepa', 'a', 'al', 'y', 'es', 'son',
])

export function looksLikeHelpRequest(text: string): boolean {
  return HELP_INTENT.test(normalize(text))
}

// Pedir ayuda desde la PRIMERA palabra («necesito ayuda con…», «explícame…», «cómo funciona…»): solo así gana a Economía, Cocina y Ubicación, que reconocen frases con
// palabras parecidas («cómo funciona el presupuesto» no es una consulta de gasto). Si la frase solo lleva «ayuda» más adentro, se prueba después que ellas.
const HELP_OPENER =
  /^(?:(?:oye|hola|vale|pepa|por favor)\s+)*(?:(?:necesito|quiero|dame)\s+ayuda|ayuda\b|ayudame|ayudanos|como\s+(?:funciona|funcionan|se usa|se utiliza|se usan|uso|se maneja)|explicame|explicanos|ensename|ensenanos|para que sirve|para que sirven|que puedo hacer (?:en|con)|no se (?:usar|como))/

export function startsLikeHelpRequest(text: string): boolean {
  return HELP_OPENER.test(normalize(text).trim())
}

export function moduleMentioned(text: string): HelpModuleId | null {
  const n = normalize(text)
  for (const [id, re] of MODULE_WORDS) if (re.test(n)) return id
  return null
}

// Lo que queda de la frase tras quitar las palabras de pedir ayuda y el nombre de la sección: lo que de verdad se quiere hacer («añadir una tienda»).
function topicOf(text: string, moduleId: HelpModuleId | null): string {
  let n = normalize(text)
  if (moduleId) {
    const re = MODULE_WORDS.find(([id]) => id === moduleId)?.[1]
    if (re) n = n.replace(re, ' ')
  }
  return n
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w))
    .join(' ')
}

// Título de ficha sin signos de pregunta y en minúscula: «¿Qué cocino hoy?» → «qué cocino hoy».
function plainTitle(title: string): string {
  const t = title.trim().replace(/^[¿¡]+/, '').replace(/[.?!]+$/g, '')
  return t.charAt(0).toLowerCase() + t.slice(1)
}

// Frase de ejemplo para pedir esa ficha: «Crear un evento» → «ayuda para crear un evento»; si no empieza por un verbo en infinitivo → «ayuda con …».
function helpExample(title: string): string {
  const t = plainTitle(title)
  const first = t.split(/\s+/)[0] ?? ''
  return /(?:ar|er|ir)$/.test(first) ? `necesito ayuda para ${t}` : `necesito ayuda con ${t}`
}

function sentence(text: string): string {
  const t = text.trim()
  return /[.!?…]$/.test(t) ? t : `${t}.`
}

export function spokenCard(card: HelpCard): string {
  const parts = [sentence(card.title), sentence(card.quick)]
  if (card.steps && card.steps.length > 0) {
    const ordinals = ['Primero', 'Después', 'Luego', 'Por último']
    const steps = card.steps.slice(0, 4).map((s, i) => `${ordinals[i] ?? 'Luego'}, ${s.trim().charAt(0).toLowerCase()}${s.trim().slice(1).replace(/[.]+$/, '')}.`)
    parts.push(...steps)
  }
  if (card.state === 'parcial' && card.limits && !card.limitsInternal) parts.push(`Ten en cuenta: ${sentence(card.limits)}`)
  return parts.join(' ')
}

function usableCards(moduleId: HelpModuleId, api: TalkHelpApi): HelpCard[] {
  return cardsOfModule(moduleId).filter((c) => c.state !== 'desactivada' && api.accessOfCard(c).status === 'allowed')
}

// Recorrido guiado de una ficha («Enséñame»: cardId o card.tour) o de una sección («Conoce esta sección»), si existe y la cuenta puede hacerlo.
function tutorialFor(card: HelpCard, api: TalkHelpApi): string | null {
  const tour = TOURS.find((t) => t.kind !== 'visit' && (t.cardId === card.id || t.id === card.tour))
  return tour && api.canDoTour(tour.id) ? tour.id : null
}

function visitFor(moduleId: HelpModuleId, api: TalkHelpApi): string | null {
  const tour = TOURS.find((t) => t.kind === 'visit' && t.module === moduleId)
  return tour && api.canDoTour(tour.id) ? tour.id : null
}

function overview(moduleId: HelpModuleId, api: TalkHelpApi): TalkHelpAnswer | null {
  const mod = HELP_MODULE_BY_ID.get(moduleId)
  if (!mod) return null
  const access = moduleAccess(mod, api.ctx)
  if (access.status === 'hidden') return null
  if (access.status === 'restricted') return { kind: 'say', text: access.reason ?? 'Tu cuenta no tiene acceso a esta sección.' }
  const cards = usableCards(moduleId, api)
  const ordered = [...cards.filter((c) => c.frequent), ...cards.filter((c) => !c.frequent)].slice(0, 4)
  const can = ordered.length > 0 ? ` Con ${mod.label} puedes, por ejemplo: ${ordered.map((c) => plainTitle(c.title)).join('; ')}.` : ''
  const ask = ordered.length > 0 ? ` Dime, por ejemplo, «${helpExample(ordered[0].title)}» y te lo explico paso a paso.` : ''
  const tourId = visitFor(moduleId, api)
  if (tourId) {
    return {
      kind: 'go',
      text: `Te llevo a ${mod.label} y te la enseño en pantalla, paso a paso: yo te voy marcando cada parte.${ask}`,
      go: { path: mod.path },
      title: mod.label,
      moduleId,
      tourId,
    }
  }
  return {
    kind: 'go',
    text: `Te llevo a ${mod.label}. ${sentence(mod.summary)}${can}${ask}`,
    go: { path: mod.path },
    title: mod.label,
    moduleId,
  }
}

function fromCard(card: HelpCard, api: TalkHelpApi): TalkHelpAnswer {
  const mod = HELP_MODULE_BY_ID.get(card.module)
  const go: HelpGo = card.go ?? { path: mod?.path ?? '/' }
  const tourId = tutorialFor(card, api)
  if (tourId) {
    return {
      kind: 'go',
      text: `${mod ? `En ${mod.label}. ` : ''}${sentence(card.title)} Te lo enseño en pantalla, paso a paso: yo te marco dónde pulsar y tú lo vas haciendo.`,
      go,
      title: card.title,
      moduleId: card.module,
      tourId,
    }
  }
  return { kind: 'go', text: `${mod ? `En ${mod.label}. ` : ''}${spokenCard(card)}`, go, title: card.title, moduleId: card.module }
}

const NOT_SURE = `¿Con qué necesitas ayuda? Puedo explicarte, por ejemplo: ${['Compras', 'Calendario', 'La cocina', 'Economía', 'Eventos', 'Ubicación'].join(', ')}. Dime «necesito ayuda con compras» y te llevo y te lo cuento.`

/** null = la frase no pide ayuda (sigue el camino de siempre). */
export function answerHelpRequest(text: string, api: TalkHelpApi): TalkHelpAnswer | null {
  if (!looksLikeHelpRequest(text)) return null
  const moduleId = moduleMentioned(text)
  const topic = topicOf(text, moduleId)

  // Algo concreto («ayuda con compras para añadir una tienda», «cómo funciona crear un evento»): la ficha que mejor lo explica.
  if (topic.length >= 3) {
    const response = api.search(topic)
    const hit = response.hits.find((h) => h.doc.kind === 'card' && (!moduleId || h.doc.module === moduleId) && api.accessOfCard(h.doc.card).status === 'allowed')
    if (hit && hit.doc.kind === 'card' && (response.confidence === 'clear' || moduleId)) return fromCard(hit.doc.card, api)
  }

  if (moduleId) {
    const answer = overview(moduleId, api)
    if (answer) return answer
  }
  // Pide ayuda pero no dice con qué (y no se reconoce nada): se le pregunta, sin llevarle a ninguna parte.
  if (!moduleId && topic.length < 3) return { kind: 'say', text: NOT_SURE }
  return null
}
