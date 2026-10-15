// Comunidad PEPA — lógica pura de DESCUBRIMIENTO (portada, secciones, buscador y guardados). Sin red y sin React: así se puede probar sin navegador.
// Aquí viven: qué bloques tiene la portada y cómo se evita repetir una publicación, qué órdenes admite cada sección (p. ej. «Mejor valoradas» solo en
// Recetas) y cómo se pasan los filtros entre la dirección (URL), la petición al servidor y el historial de búsquedas.
import type { ListPostsParams } from '@/data/community'
import {
  MAX_TITLE,
  ORDER_LABELS,
  KIND_LABELS,
  SECTIONS,
  type AnyPostKind,
  type CommunitySection,
  type CommunityTopic,
  type PostOrder,
} from '@/domain/community'

// ---------------------------------------------------------------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------------------------------------------------------------

// Tamaño de página de las listas (el servidor admite hasta 50). Una página = una petición.
export const LIST_PAGE_SIZE = 20
// Portada: cada bloque pide UNA vez unas pocas publicaciones (algo más de las que se enseñan, para poder quitar las repetidas sin dejar un bloque cojo).
export const HOME_BLOCK_FETCH = 8
export const HOME_BLOCK_SHOW = 5
// Buscador: con menos letras no se pide ni se busca (ahorra peticiones y evita resultados absurdos).
export const MIN_SEARCH_CHARS = 2
export const SUGGEST_DELAY_MS = 300
export const MAX_QUERY_CHARS = 120

export const ALL_KINDS: AnyPostKind[] = ['receta', 'pregunta', 'consejo', 'anecdota', 'encuesta', 'articulo']

export type HomeBlockId = 'recientes' | 'comentados' | 'sin_respuesta' | 'para_mi'

// El orden de esta lista es la PRIORIDAD: si una publicación cabe en dos bloques, se queda en el primero.
export const HOME_BLOCKS: { id: HomeBlockId; title: string; order: PostOrder; personal: boolean }[] = [
  { id: 'recientes', title: 'Más recientes', order: 'recientes', personal: false },
  { id: 'comentados', title: 'Más comentados', order: 'comentados', personal: false },
  { id: 'sin_respuesta', title: 'Preguntas sin responder', order: 'sin_respuesta', personal: false },
  { id: 'para_mi', title: 'Para mí', order: 'para_mi', personal: true },
]

// ---------------------------------------------------------------------------------------------------------------------------------
// Portada: bloques sin repetir
// ---------------------------------------------------------------------------------------------------------------------------------

export interface BlockItems<T extends { id: string }> {
  id: HomeBlockId
  items: T[]
}

// Quita de cada bloque lo que ya se ha enseñado en uno anterior (respetando el orden de los bloques), recorta a `max` y descarta los bloques que quedan
// vacíos (los bloques sin contenido se OCULTAN). Una publicación nunca sale dos veces entre los bloques visibles.
export function dedupeBlocks<T extends { id: string }>(blocks: BlockItems<T>[], max: number = HOME_BLOCK_SHOW): BlockItems<T>[] {
  const seen = new Set<string>()
  const out: BlockItems<T>[] = []
  for (const block of blocks) {
    const items: T[] = []
    for (const item of block.items) {
      if (items.length >= max) break
      if (seen.has(item.id)) continue
      seen.add(item.id)
      items.push(item)
    }
    if (items.length > 0) out.push({ id: block.id, items })
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Secciones y órdenes
// ---------------------------------------------------------------------------------------------------------------------------------

export function isCommunitySection(value: unknown): value is CommunitySection {
  return typeof value === 'string' && SECTIONS.some((s) => s.id === value)
}

export function parseSection(raw: string | null | undefined): CommunitySection | null {
  return isCommunitySection(raw) ? raw : null
}

export function parseKind(raw: string | null | undefined): AnyPostKind | null {
  return raw && (ALL_KINDS as string[]).includes(raw) ? (raw as AnyPostKind) : null
}

// Órdenes que ofrece cada sección. «Mejor valoradas» solo existe en Recetas (las valoraciones son de recetas): en Hogar y familia no se ofrece.
export function sectionOrders(section: CommunitySection): PostOrder[] {
  const base: PostOrder[] = ['recientes', 'comentados']
  if (section === 'recetas') base.push('valoradas')
  base.push('sin_respuesta', 'para_mi')
  return base
}

// Órdenes del buscador y de guardados: sin «Para mí» ni «sin responder» (no tienen sentido sobre un texto buscado). «Mejor valoradas» solo si no se ha
// elegido Hogar y familia.
export function searchOrders(section: CommunitySection | null): PostOrder[] {
  return section === 'hogar' ? ['recientes', 'comentados'] : ['recientes', 'comentados', 'valoradas']
}

// Una dirección con un orden no permitido (p. ej. ?orden=valoradas en Hogar) cae en «Más recientes».
export function parseOrder(raw: string | null | undefined, allowed: PostOrder[]): PostOrder {
  return raw && (allowed as string[]).includes(raw) ? (raw as PostOrder) : 'recientes'
}

export function orderLabel(order: PostOrder, inSearch = false): string {
  if (inSearch && order === 'valoradas') return 'Mejor valoradas (solo recetas)'
  return ORDER_LABELS[order]
}

export function topicsForSection(topics: CommunityTopic[], section: CommunitySection | null): CommunityTopic[] {
  return section ? topics.filter((t) => t.section === section) : topics
}

export function topicBelongsToSection(topics: CommunityTopic[], topicId: string | null, section: CommunitySection | null): boolean {
  if (!topicId) return true
  const t = topics.find((x) => x.id === topicId)
  if (!t) return false
  return !section || t.section === section
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Sección: filtros que viven en la dirección (?tema=&orden=&tipo=)
// ---------------------------------------------------------------------------------------------------------------------------------

export interface SectionFilters {
  topic: string | null
  order: PostOrder
  kind: AnyPostKind | null
}

export function readSectionFilters(section: CommunitySection, sp: URLSearchParams): SectionFilters {
  return {
    topic: sp.get('tema') || null,
    order: parseOrder(sp.get('orden'), sectionOrders(section)),
    kind: parseKind(sp.get('tipo')),
  }
}

// Solo se escribe en la dirección lo que NO es el valor por defecto («Más recientes» y «Todos» no se escriben): así la dirección limpia = pantalla inicial.
export function sectionFiltersToParams(f: SectionFilters): URLSearchParams {
  const q = new URLSearchParams()
  if (f.topic) q.set('tema', f.topic)
  if (f.order !== 'recientes') q.set('orden', f.order)
  if (f.kind) q.set('tipo', f.kind)
  return q
}

export function sectionListParams(section: CommunitySection, f: SectionFilters, offset: number, limit: number = LIST_PAGE_SIZE): ListPostsParams {
  return { section, topic: f.topic, kind: f.kind, order: f.order, limit, offset }
}

// Firma de lo que se está viendo: si cambia, la lista se vuelve a pedir desde el principio.
export function sectionSignature(section: CommunitySection, f: SectionFilters): string {
  return `${section}|${f.topic ?? ''}|${f.order}|${f.kind ?? ''}`
}

export function hasSectionFilters(f: SectionFilters): boolean {
  return f.topic !== null || f.kind !== null
}

// Texto amable del estado vacío de una sección según lo que se estaba mirando.
export function emptyListMessage(order: PostOrder, filtered: boolean): { title: string; hint: string } {
  if (filtered) return { title: 'No hay publicaciones con estos filtros.', hint: 'Prueba con otro tema o tipo, o quita los filtros.' }
  if (order === 'sin_respuesta') return { title: 'No hay preguntas sin responder ahora mismo.', hint: 'Buena señal: se están contestando. Si tienes una duda, pregúntala tú.' }
  if (order === 'para_mi') {
    return { title: 'Todavía no tenemos nada que recomendarte.', hint: 'Elige tus temas favoritos o sigue a personas que te gusten, y aquí verás lo que más te interese.' }
  }
  if (order === 'valoradas') return { title: 'Todavía no hay recetas valoradas.', hint: 'Prueba una receta de otra familia y ponle tus estrellas.' }
  return { title: 'Todavía no hay publicaciones aquí.', hint: '¡Sé la primera persona en publicar!' }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Buscador y guardados: texto + sección + tema + tipo + orden (?q=&seccion=&tema=&tipo=&orden=)
// ---------------------------------------------------------------------------------------------------------------------------------

export interface DiscoveryFilters {
  q: string
  section: CommunitySection | null
  topic: string | null
  kind: AnyPostKind | null
  order: PostOrder
}

export const EMPTY_FILTERS: DiscoveryFilters = { q: '', section: null, topic: null, kind: null, order: 'recientes' }

// Espacios repetidos fuera, recorte y tope de longitud (el servidor guarda como mucho 120 letras del historial).
export function normalizeQuery(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_CHARS)
}

export function isSearchable(q: string | null | undefined): boolean {
  return normalizeQuery(q).length >= MIN_SEARCH_CHARS
}

export function readDiscoveryFilters(sp: URLSearchParams, withOrder: boolean): DiscoveryFilters {
  const section = parseSection(sp.get('seccion'))
  return {
    q: normalizeQuery(sp.get('q')),
    section,
    topic: sp.get('tema') || null,
    kind: parseKind(sp.get('tipo')),
    order: withOrder ? parseOrder(sp.get('orden'), searchOrders(section)) : 'recientes',
  }
}

export function discoveryFiltersToParams(f: DiscoveryFilters): URLSearchParams {
  const q = new URLSearchParams()
  if (f.q) q.set('q', f.q)
  if (f.section) q.set('seccion', f.section)
  if (f.topic) q.set('tema', f.topic)
  if (f.kind) q.set('tipo', f.kind)
  if (f.order !== 'recientes') q.set('orden', f.order)
  return q
}

// Al cambiar la sección, el orden y el tema deben seguir teniendo sentido (Hogar no tiene «Mejor valoradas»; un tema de Recetas no vale en Hogar).
export function coherentFilters(f: DiscoveryFilters, topics: CommunityTopic[] | null): DiscoveryFilters {
  const order = (searchOrders(f.section) as string[]).includes(f.order) ? f.order : 'recientes'
  const topic = topics && f.topic && !topicBelongsToSection(topics, f.topic, f.section) ? null : f.topic
  return { ...f, order, topic }
}

export function discoveryListParams(f: DiscoveryFilters, offset: number, limit: number = LIST_PAGE_SIZE, extra: Partial<ListPostsParams> = {}): ListPostsParams {
  return {
    section: f.section,
    topic: f.topic,
    kind: f.kind,
    order: f.order,
    query: f.q ? f.q : null,
    limit,
    offset,
    ...extra,
  }
}

export function discoverySignature(f: DiscoveryFilters): string {
  return `${f.q}|${f.section ?? ''}|${f.topic ?? ''}|${f.kind ?? ''}|${f.order}`
}

export function hasDiscoveryFilters(f: DiscoveryFilters): boolean {
  return f.section !== null || f.topic !== null || f.kind !== null
}

// ---- Historial de búsquedas: se guarda el texto aparte y los filtros como un diccionario simple de textos (así lo espera el servidor)

export function filtersToRecord(f: DiscoveryFilters): Record<string, string> {
  const r: Record<string, string> = {}
  if (f.section) r.seccion = f.section
  if (f.topic) r.tema = f.topic
  if (f.kind) r.tipo = f.kind
  if (f.order !== 'recientes') r.orden = f.order
  return r
}

// Lo que viene del servidor no es de fiar: cada valor se valida igual que si viniera de la dirección.
export function filtersFromRecord(query: string, record: Record<string, unknown> | null | undefined): DiscoveryFilters {
  const r = record ?? {}
  const str = (k: string) => (typeof r[k] === 'string' ? (r[k] as string) : null)
  const section = parseSection(str('seccion'))
  return {
    q: normalizeQuery(query),
    section,
    topic: str('tema') || null,
    kind: parseKind(str('tipo')),
    order: parseOrder(str('orden'), searchOrders(section)),
  }
}

// Frase corta con los filtros de una búsqueda del historial: «Recetas y cocina · Postres y dulces · Receta · Más comentados».
export function describeFilters(f: DiscoveryFilters, topics: CommunityTopic[] | null): string[] {
  const parts: string[] = []
  if (f.section) parts.push(SECTIONS.find((s) => s.id === f.section)?.title ?? '')
  if (f.topic) parts.push(topics?.find((t) => t.id === f.topic)?.label ?? '')
  if (f.kind) parts.push(KIND_LABELS[f.kind])
  if (f.order !== 'recientes') parts.push(ORDER_LABELS[f.order])
  return parts.filter(Boolean)
}

// «Preguntar a la comunidad» precompleta el título con lo buscado (respetando el máximo de un título).
export function askTitleFromQuery(q: string): string {
  return normalizeQuery(q).slice(0, MAX_TITLE)
}
