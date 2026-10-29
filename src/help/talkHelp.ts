import { normalize } from '@/domain/voiceQuery'
import { moduleAccess, type HelpAccessResult, type HelpContext } from '@/help/access'
import { cardsOfModule, HELP_MODULE_BY_ID } from '@/help/catalog'
import type { SearchResponse } from '@/help/search/searchEngine'
import type { HelpCard, HelpGo, HelpModuleId } from '@/help/types'
import { TOURS } from '@/help/tours/registry'
import { SERIES, chaptersOf, type TutorialSeries } from '@/help/tours/series'
import { searchSeries, seriesProgress } from '@/help/tours/series/search'

// «Necesito ayuda con compras» en «Hablar con PEPA»: Pepa lleva a esa pantalla y EXPLICA por voz lo que cuenta la Ayuda («Pepa te acompaña»). Nada se inventa: el texto sale
// de las fichas y del resumen del módulo del catálogo de la Ayuda (src/help/catalog), con los mismos permisos que la Ayuda (src/help/access.ts).

/** Lo que necesita de la Ayuda: sus permisos y su buscador (los da HelpProvider; en las pruebas se arman con el mismo catálogo). */
export interface TalkHelpApi {
  ctx: HelpContext
  search(query: string): SearchResponse
  accessOfCard(card: HelpCard): HelpAccessResult
  /** ¿Puede esta cuenta hacer ese recorrido «Enséñame» / «Conoce esta sección»? */
  canDoTour(tourId: string): boolean
  /** ¿Puede esta cuenta hacer esa serie de tutoriales (recorrido completo por capítulos)? Sin indicar, se permite lo que permitan sus capítulos. */
  canDoSeries?(seriesId: string): boolean
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
  ['compras', /\b(?:compras?|lista de la compra|supermercados?|tickets?|historial de precios|comparar precios|estadistica de compras)\b/],
  ['calendario', /\b(?:calendario|agenda|tareas?|citas?)\b/],
  ['cocina', /\b(?:cocina|recetas?|menu semanal|menus?|alimentacion)\b/],
  ['economia', /\b(?:economia|dinero|gastos?|presupuestos?|banco|movimientos|ahorros?)\b/],
  ['eventos', /\b(?:eventos?|fiestas?|celebraciones|invitados)\b/],
  ['pequenos', /\b(?:pequenos grandes|puntos|recompensas|educacion financiera|listas? de deseos)\b/],
  ['cumpleanos', /\b(?:cumpleanos)\b/],
  ['contactos', /\b(?:contactos|agenda de contactos)\b/],
  ['galeria', /\b(?:galeria|fotos)\b/],
  ['documentos', /\b(?:documentos)\b/],
  ['listas', /\b(?:mis listas|listas)\b/],
  ['grupos', /\b(?:gestion de grupos|grupos?|botes?|bote compartido|colecta|recaudacion)\b/],
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

// «Recorrido completo de compras», «enséñame todo de la cocina», «por capítulos», «capítulo dos de la lista»: pedir el tutorial entero o un capítulo suelto (25/10/2026).
const COURSE_WORDS = /\b(?:recorrido|recorridos|tutorial|tutoriales|curso|capitulos?|por partes)\b/
const COURSE_COMPLETE = /\b(?:completo|completa|entero|entera|todo|desde el principio|de principio a fin)\b/
const COURSE_CHAPTER_N = /\b(?:capitulo\s+(\w+)|(primer|primero|segundo|tercer|tercero|cuarto|quinto|sexto|septimo|octavo|noveno|decimo|ultimo)\s+capitulo)\b/
const COURSE_TOPIC_NOISE = new Set([
  'recorrido', 'recorridos', 'tutorial', 'tutoriales', 'curso', 'capitulo', 'capitulos', 'por', 'partes', 'completo', 'completa', 'entero', 'entera', 'todo', 'desde', 'principio',
  'fin', 'de', 'a', 'dame', 'dime', 'quiero', 'ver', 'hacer', 'el', 'la', 'los', 'las', 'del', 'un', 'una', 'en', 'con', 'ensename', 'ensenanos', 'pepa', 'por favor', 'cuales', 'que',
  'hay', 'tienes', 'empieza', 'empezar', 'ponme', 'pon', 'primer', 'primero', 'segundo', 'tercer', 'tercero', 'cuarto', 'quinto', 'sexto', 'septimo', 'octavo', 'noveno', 'decimo',
  'ultimo', 'uno', 'dos', 'tres', 'cinco', 'siete', 'ocho', 'nueve', 'diez', 'cuatro', 'seis', 'me', 'te', 'lo', 'y', 'al', 'sobre', 'para',
])
const NUMBER_WORDS: Record<string, number> = {
  uno: 1, primer: 1, primero: 1, dos: 2, segundo: 2, tres: 3, tercer: 3, tercero: 3, cuatro: 4, cuarto: 4, cinco: 5, quinto: 5, seis: 6, sexto: 6, siete: 7, septimo: 7, ocho: 8,
  octavo: 8, nueve: 9, noveno: 9, diez: 10, decimo: 10,
}

export function looksLikeCourseRequest(text: string): boolean {
  return COURSE_WORDS.test(normalize(text))
}

export function looksLikeHelpRequest(text: string): boolean {
  return HELP_INTENT.test(normalize(text)) || looksLikeCourseRequest(text)
}

// Pedir ayuda desde la PRIMERA palabra («necesito ayuda con…», «explícame…», «cómo funciona…»): solo así gana a Economía, Cocina y Ubicación, que reconocen frases con
// palabras parecidas («cómo funciona el presupuesto» no es una consulta de gasto). Si la frase solo lleva «ayuda» más adentro, se prueba después que ellas.
const HELP_OPENER =
  /^(?:(?:oye|hola|vale|pepa|por favor)\s+)*(?:(?:necesito|quiero|dame)\s+ayuda|ayuda\b|ayudame|ayudanos|como\s+(?:funciona|funcionan|se usa|se utiliza|se usan|uso|se maneja)|explicame|explicanos|ensename|ensenanos|para que sirve|para que sirven|que puedo hacer (?:en|con)|no se (?:usar|como))/

// «Recorrido completo de…», «capítulos de…», «enséñame todo de…» desde la primera palabra.
const COURSE_OPENER = /^(?:(?:oye|hola|vale|pepa|por favor|dame|dime|quiero|ponme|pon|empieza)\s+)*(?:el\s+|los\s+|un\s+)?(?:recorrido|recorridos|tutorial|tutoriales|curso|capitulos?|por capitulos|el capitulo|ensename todo|ensenanos todo)\b/

export function startsLikeHelpRequest(text: string): boolean {
  const n = normalize(text).trim()
  return HELP_OPENER.test(n) || COURSE_OPENER.test(n)
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

function minutesText(seconds: number): string {
  const m = Math.max(1, Math.round(seconds / 60))
  return `unos ${m} minuto${m === 1 ? '' : 's'}`
}

function chapterNumber(text: string): number | null {
  const m = COURSE_CHAPTER_N.exec(normalize(text))
  if (!m) return null
  const w = (m[1] ?? m[2] ?? '').trim()
  if (w === 'ultimo') return Infinity
  if (/^\d+$/.test(w)) return Number(w)
  return NUMBER_WORDS[w] ?? null
}

// Recorrido completo / capítulos de una serie de tutoriales, por voz. null = la frase no es de esto.
function answerCourseRequest(text: string, api: TalkHelpApi): TalkHelpAnswer | null {
  if (!looksLikeCourseRequest(text)) return null
  const n = normalize(text)
  const moduleId = moduleMentioned(text)
  const canSeries = api.canDoSeries ?? (() => true)
  const topic = n
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !COURSE_TOPIC_NOISE.has(w))
  const topicText = (moduleId ? topic.filter((w) => !MODULE_WORDS.find(([id]) => id === moduleId)?.[1].test(w)) : topic).join(' ')

  let pool: TutorialSeries[] = SERIES.filter((s) => (!moduleId || s.module === moduleId) && canSeries(s.id) && chaptersOf(s).some((c) => api.canDoTour(c.id)))
  if (pool.length === 0) {
    return { kind: 'say', text: moduleId ? 'De esa sección no tengo recorridos que puedas hacer con tu cuenta.' : '¿De qué sección quieres el recorrido? Por ejemplo: «recorrido completo de compras».' }
  }
  if (topicText.length >= 3) {
    const ranked = searchSeries(topicText, { canDoSeries: (id) => pool.some((s) => s.id === id), canDoChapter: api.canDoTour })
    if (ranked.length > 0) pool = ranked.filter((r) => r.score === ranked[0].score).map((r) => r.series)
  }
  const mod = HELP_MODULE_BY_ID.get(pool[0].module)
  const modLabel = mod?.label ?? 'esa sección'
  const modPath = mod?.path ?? '/'

  // Varias series posibles y no se ha dicho cuál: se dicen los nombres y se lleva a la pantalla.
  if (pool.length > 1) {
    const names = pool.map((s) => s.title)
    return {
      kind: 'go',
      text: `En ${modLabel} tengo estos recorridos: ${names.join('; ')}. Dime, por ejemplo, «recorrido completo de ${names[0].toLowerCase()}» o «capítulos de ${names[0].toLowerCase()}».`,
      go: { path: modPath },
      title: modLabel,
      moduleId: pool[0].module,
    }
  }

  const series = pool[0]
  const chapters = chaptersOf(series).filter((c) => api.canDoTour(c.id))
  const go: HelpGo = { path: modPath }
  const number = chapterNumber(text)

  // «Capítulo dos de la lista»: empieza justo ese capítulo.
  if (number !== null) {
    const idx = number === Infinity ? chapters.length - 1 : number - 1
    const chapter = chapters[idx]
    if (!chapter) return { kind: 'say', text: `«${series.title}» tiene ${chapters.length} capítulo${chapters.length === 1 ? '' : 's'}; no hay un capítulo ${number}.` }
    return {
      kind: 'go',
      text: `Capítulo ${idx + 1} de ${chapters.length} de «${series.title}»: ${sentence(chapter.title)} Te lo enseño en pantalla, paso a paso.`,
      go,
      title: chapter.title,
      moduleId: series.module,
      tourId: chapter.id,
    }
  }

  // «Por capítulos» / «qué capítulos hay»: se dicen los capítulos (sin empezar ninguno) para elegir.
  if (/\bcapitulos?\b|\bpor partes\b/.test(n) && !COURSE_COMPLETE.test(n)) {
    const list = chapters.map((c, i) => `${i + 1}, ${plainTitle(c.title)}`).join('; ')
    return {
      kind: 'go',
      text: `«${series.title}» tiene ${chapters.length} capítulo${chapters.length === 1 ? '' : 's'}: ${list}. Dime, por ejemplo, «capítulo 2 de ${series.title.toLowerCase()}» para empezar por ese, o «recorrido completo» para hacerlo entero.`,
      go,
      title: series.title,
      moduleId: series.module,
    }
  }

  // Recorrido completo: desde el principio, o por donde se quedó.
  const prog = seriesProgress(series, api.canDoTour)
  const first = chapters[0]
  const startAt = prog.complete || !prog.started ? first : (prog.next ?? first)
  const resumed = startAt.id !== first.id
  return {
    kind: 'go',
    text: resumed
      ? `Sigo con «${series.title}» por donde lo dejaste: ${sentence(startAt.title)} Te lo enseño en pantalla, paso a paso.`
      : `Empiezo el recorrido completo de «${series.title}»: ${chapters.length} capítulo${chapters.length === 1 ? '' : 's'}, ${minutesText(chapters.reduce((t, c) => t + c.durationSec, 0))}. Te lo enseño en pantalla, paso a paso.`,
    go,
    title: series.title,
    moduleId: series.module,
    tourId: startAt.id,
  }
}

const NOT_SURE = `¿Con qué necesitas ayuda? Puedo explicarte, por ejemplo: ${['Compras', 'Calendario', 'La cocina', 'Economía', 'Eventos', 'Ubicación'].join(', ')}. Dime «necesito ayuda con compras» y te llevo y te lo cuento.`

/** null = la frase no pide ayuda (sigue el camino de siempre). */
export function answerHelpRequest(text: string, api: TalkHelpApi): TalkHelpAnswer | null {
  if (!looksLikeHelpRequest(text)) return null
  const course = answerCourseRequest(text, api)
  if (course) return course
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
