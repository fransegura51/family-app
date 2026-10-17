// Descubrimiento de Comunidad: bloques de la portada sin repeticiones, órdenes por sección y paso de filtros entre la dirección, el servidor y el historial.
import { describe, expect, it } from 'vitest'
import type { CommunityTopic } from '@/domain/community'
import {
  askTitleFromQuery,
  coherentFilters,
  dedupeBlocks,
  describeFilters,
  discoveryFiltersToParams,
  discoveryListParams,
  discoverySignature,
  emptyListMessage,
  filtersFromRecord,
  filtersToRecord,
  hasSectionFilters,
  HOME_BLOCKS,
  isCommunitySection,
  isSearchable,
  normalizeQuery,
  parseKind,
  parseOrder,
  parseTopics,
  readDiscoveryFilters,
  readSectionFilters,
  searchOrders,
  sectionFiltersToParams,
  sectionListParams,
  sectionOrders,
  sectionSignature,
  splitFeaturedTopics,
  toggleTopic,
  topicBelongsToSection,
  topicsForSection,
  type DiscoveryFilters,
} from '@/domain/communityDiscovery'

const TOPICS: CommunityTopic[] = [
  { id: 'postres-dulces', section: 'recetas', label: 'Postres y dulces' },
  { id: 'platos-principales', section: 'recetas', label: 'Platos principales' },
  { id: 'ahorro-economia', section: 'hogar', label: 'Ahorro y economía' },
]

const card = (id: string) => ({ id, title: `Publicación ${id}` })

describe('portada: bloques sin repetir', () => {
  it('los bloques son los cuatro de la especificación y en ese orden de prioridad', () => {
    expect(HOME_BLOCKS.map((b) => b.id)).toEqual(['recientes', 'comentados', 'sin_respuesta', 'para_mi'])
    expect(HOME_BLOCKS.map((b) => b.order)).toEqual(['recientes', 'comentados', 'sin_respuesta', 'para_mi'])
    // Solo «Para mí» es personal.
    expect(HOME_BLOCKS.filter((b) => b.personal).map((b) => b.id)).toEqual(['para_mi'])
  })

  it('una publicación solo sale en el primer bloque que la tiene', () => {
    const out = dedupeBlocks(
      [
        { id: 'recientes', items: [card('a'), card('b'), card('c')] },
        { id: 'comentados', items: [card('b'), card('d')] },
        { id: 'sin_respuesta', items: [card('a'), card('d'), card('e')] },
        { id: 'para_mi', items: [card('c'), card('f')] },
      ],
      10,
    )
    expect(out.map((b) => [b.id, b.items.map((i) => i.id)])).toEqual([
      ['recientes', ['a', 'b', 'c']],
      ['comentados', ['d']],
      ['sin_respuesta', ['e']],
      ['para_mi', ['f']],
    ])
    const all = out.flatMap((b) => b.items.map((i) => i.id))
    expect(new Set(all).size).toBe(all.length)
  })

  it('oculta los bloques que se quedan sin contenido', () => {
    const out = dedupeBlocks([
      { id: 'recientes', items: [card('a')] },
      { id: 'comentados', items: [card('a')] },
      { id: 'sin_respuesta', items: [] },
      { id: 'para_mi', items: [card('b')] },
    ])
    expect(out.map((b) => b.id)).toEqual(['recientes', 'para_mi'])
  })

  it('recorta cada bloque al máximo DESPUÉS de quitar las repetidas (el bloque no queda cojo)', () => {
    const out = dedupeBlocks(
      [
        { id: 'recientes', items: ['1', '2', '3'].map(card) },
        { id: 'comentados', items: ['1', '2', '3', '4', '5', '6', '7'].map(card) },
      ],
      3,
    )
    expect(out[1].items.map((i) => i.id)).toEqual(['4', '5', '6'])
  })

  it('sin nada que enseñar no queda ningún bloque', () => {
    expect(dedupeBlocks([{ id: 'recientes', items: [] }])).toEqual([])
  })

  it('una capa de usuario bloqueado (que también tiene id) tampoco se repite', () => {
    const out = dedupeBlocks([
      { id: 'recientes', items: [{ id: 'x', blockedByMe: true as const }] },
      { id: 'comentados', items: [{ id: 'x', blockedByMe: true as const }, { id: 'y', blockedByMe: true as const }] },
    ])
    expect(out.map((b) => b.items.map((i) => i.id))).toEqual([['x'], ['y']])
  })
})

describe('secciones y órdenes', () => {
  it('solo recetas y hogar son secciones', () => {
    expect(isCommunitySection('recetas')).toBe(true)
    expect(isCommunitySection('hogar')).toBe(true)
    expect(isCommunitySection('anecdotas')).toBe(false)
    expect(isCommunitySection(undefined)).toBe(false)
    expect(isCommunitySection(null)).toBe(false)
  })

  it('«Mejor valoradas» solo existe en Recetas', () => {
    expect(sectionOrders('recetas')).toEqual(['recientes', 'comentados', 'valoradas', 'sin_respuesta', 'no_leidas', 'para_mi'])
    expect(sectionOrders('hogar')).toEqual(['recientes', 'comentados', 'sin_respuesta', 'no_leidas', 'para_mi'])
    expect(sectionOrders('hogar')).not.toContain('valoradas')
  })

  it('un orden no permitido en la dirección cae en «Más recientes»', () => {
    expect(readSectionFilters('hogar', new URLSearchParams('orden=valoradas')).order).toBe('recientes')
    expect(readSectionFilters('recetas', new URLSearchParams('orden=valoradas')).order).toBe('valoradas')
    expect(readSectionFilters('recetas', new URLSearchParams('orden=inventado')).order).toBe('recientes')
    expect(parseOrder(null, ['recientes'])).toBe('recientes')
  })

  it('el orden inicial es «Más recientes» (dirección limpia)', () => {
    const f = readSectionFilters('recetas', new URLSearchParams(''))
    expect(f).toEqual({ topics: [], order: 'recientes', kind: null })
    expect(sectionFiltersToParams(f).toString()).toBe('')
  })

  it('el buscador no ofrece «Para mí» y «Mejor valoradas» desaparece al elegir Hogar', () => {
    expect(searchOrders(null)).toEqual(['recientes', 'comentados', 'valoradas'])
    expect(searchOrders('recetas')).toContain('valoradas')
    expect(searchOrders('hogar')).toEqual(['recientes', 'comentados'])
  })

  it('el tipo desconocido se ignora', () => {
    expect(parseKind('receta')).toBe('receta')
    expect(parseKind('articulo')).toBe('articulo')
    expect(parseKind('otra')).toBeNull()
    expect(parseKind(null)).toBeNull()
  })
})

describe('sección: de la dirección a la petición', () => {
  it('lee tema, orden y tipo y construye los parámetros del listado', () => {
    const f = readSectionFilters('recetas', new URLSearchParams('tema=postres-dulces&orden=comentados&tipo=pregunta'))
    expect(f).toEqual({ topics: ['postres-dulces'], order: 'comentados', kind: 'pregunta' })
    expect(sectionListParams('recetas', f, 40, 20)).toEqual({ section: 'recetas', topics: ['postres-dulces'], kind: 'pregunta', order: 'comentados', limit: 20, offset: 40 })
  })

  it('sin filtros pide TODOS los contenidos de la sección', () => {
    const p = sectionListParams('hogar', readSectionFilters('hogar', new URLSearchParams('')), 0)
    expect(p).toMatchObject({ section: 'hogar', topics: [], kind: null, order: 'recientes', offset: 0 })
  })

  it('escribe en la dirección solo lo que no es por defecto y se puede leer de vuelta', () => {
    const f = { topics: ['platos-principales'], order: 'valoradas' as const, kind: null }
    const qs = sectionFiltersToParams(f)
    expect(qs.toString()).toBe('tema=platos-principales&orden=valoradas')
    expect(readSectionFilters('recetas', qs)).toEqual(f)
  })

  it('la firma cambia con la sección, el tema, el orden y el tipo', () => {
    const base = { topics: [] as string[], order: 'recientes' as const, kind: null }
    const sigs = new Set([
      sectionSignature('recetas', base),
      sectionSignature('hogar', base),
      sectionSignature('recetas', { ...base, topics: ['x'] }),
      sectionSignature('recetas', { ...base, order: 'comentados' }),
      sectionSignature('recetas', { ...base, kind: 'receta' }),
    ])
    expect(sigs.size).toBe(5)
  })
})

describe('buscador y guardados', () => {
  it('no se busca ni se sugiere con menos de 2 letras', () => {
    expect(isSearchable('')).toBe(false)
    expect(isSearchable(' a ')).toBe(false)
    expect(isSearchable('  ab')).toBe(true)
    expect(isSearchable(null)).toBe(false)
  })

  it('normaliza el texto: espacios repetidos, recorte y máximo de 120 letras', () => {
    expect(normalizeQuery('  tortilla   de   patata ')).toBe('tortilla de patata')
    expect(normalizeQuery('a'.repeat(300))).toHaveLength(120)
    expect(normalizeQuery(undefined)).toBe('')
  })

  it('lee y escribe los filtros en la dirección (ida y vuelta)', () => {
    const f: DiscoveryFilters = { q: 'galletas', section: 'recetas', topic: 'postres-dulces', kind: 'receta', order: 'valoradas' }
    const qs = discoveryFiltersToParams(f)
    expect(readDiscoveryFilters(qs, true)).toEqual(f)
    expect(discoveryFiltersToParams({ q: 'x1', section: null, topic: null, kind: null, order: 'recientes' }).toString()).toBe('q=x1')
  })

  it('en Hogar no vale «Mejor valoradas» ni un tema de Recetas', () => {
    expect(readDiscoveryFilters(new URLSearchParams('q=ahorro&seccion=hogar&orden=valoradas'), true).order).toBe('recientes')
    const fixed = coherentFilters({ q: 'x1', section: 'hogar', topic: 'postres-dulces', kind: null, order: 'valoradas' }, TOPICS)
    expect(fixed.topic).toBeNull()
    expect(fixed.order).toBe('recientes')
    // Un tema de la sección elegida se conserva.
    expect(coherentFilters({ q: 'x1', section: 'recetas', topic: 'postres-dulces', kind: null, order: 'valoradas' }, TOPICS)).toMatchObject({ topic: 'postres-dulces', order: 'valoradas' })
  })

  it('Guardados no usa el orden de la dirección', () => {
    expect(readDiscoveryFilters(new URLSearchParams('orden=comentados'), false).order).toBe('recientes')
  })

  it('construye la petición con texto, filtros y paginación; Guardados añade saved', () => {
    const f: DiscoveryFilters = { q: 'galletas', section: 'recetas', topic: null, kind: 'receta', order: 'comentados' }
    expect(discoveryListParams(f, 20, 20)).toEqual({ section: 'recetas', topic: null, kind: 'receta', order: 'comentados', query: 'galletas', limit: 20, offset: 20 })
    expect(discoveryListParams({ ...f, q: '' }, 0, 20, { saved: true })).toMatchObject({ query: null, saved: true })
  })

  it('la firma distingue cualquier cambio de texto o filtro', () => {
    const a: DiscoveryFilters = { q: 'sopa', section: null, topic: null, kind: null, order: 'recientes' }
    expect(discoverySignature(a)).not.toBe(discoverySignature({ ...a, q: 'sopas' }))
    expect(discoverySignature(a)).not.toBe(discoverySignature({ ...a, kind: 'pregunta' }))
    expect(discoverySignature(a)).toBe(discoverySignature({ ...a }))
  })

  it('el historial guarda los filtros como diccionario de textos y se recupera igual', () => {
    const f: DiscoveryFilters = { q: 'galletas', section: 'recetas', topic: 'postres-dulces', kind: 'receta', order: 'comentados' }
    const rec = filtersToRecord(f)
    expect(rec).toEqual({ seccion: 'recetas', tema: 'postres-dulces', tipo: 'receta', orden: 'comentados' })
    expect(filtersFromRecord('galletas', rec)).toEqual(f)
    expect(filtersToRecord({ q: 'x1', section: null, topic: null, kind: null, order: 'recientes' })).toEqual({})
  })

  it('lo que llega del historial no es de fiar: valores raros se descartan', () => {
    expect(filtersFromRecord(' sopa ', { seccion: 'otra', tipo: 'xx', orden: 'para_mi', tema: 5 })).toEqual({
      q: 'sopa',
      section: null,
      topic: null,
      kind: null,
      order: 'recientes',
    })
    expect(filtersFromRecord('sopa', null).order).toBe('recientes')
    expect(filtersFromRecord('sopa', { seccion: 'hogar', orden: 'valoradas' }).order).toBe('recientes')
  })

  it('describe los filtros de una búsqueda para el historial', () => {
    const f: DiscoveryFilters = { q: 'galletas', section: 'recetas', topic: 'postres-dulces', kind: 'receta', order: 'comentados' }
    expect(describeFilters(f, TOPICS)).toEqual(['Recetas y cocina', 'Postres y dulces', 'Receta', 'Más comentados'])
    expect(describeFilters({ ...f, section: null, topic: null, kind: null, order: 'recientes' }, TOPICS)).toEqual([])
  })

  it('«Preguntar a la comunidad» precompleta el título con lo buscado (con tope de longitud)', () => {
    expect(askTitleFromQuery('  ¿cómo   hago   bizcocho? ')).toBe('¿cómo hago bizcocho?')
    expect(askTitleFromQuery('a'.repeat(300)).length).toBeLessThanOrEqual(140)
  })

  it('temas por sección', () => {
    expect(topicsForSection(TOPICS, 'recetas').map((t) => t.id)).toEqual(['postres-dulces', 'platos-principales'])
    expect(topicsForSection(TOPICS, null)).toHaveLength(3)
    expect(topicBelongsToSection(TOPICS, 'ahorro-economia', 'hogar')).toBe(true)
    expect(topicBelongsToSection(TOPICS, 'ahorro-economia', 'recetas')).toBe(false)
    expect(topicBelongsToSection(TOPICS, 'no-existe', null)).toBe(false)
    expect(topicBelongsToSection(TOPICS, null, 'hogar')).toBe(true)
  })
})

describe('estados vacíos amables', () => {
  it('cada situación tiene su mensaje y siempre una pista', () => {
    for (const [order, filtered] of [
      ['recientes', false],
      ['recientes', true],
      ['sin_respuesta', false],
      ['para_mi', false],
      ['valoradas', false],
    ] as const) {
      const m = emptyListMessage(order, filtered)
      expect(m.title.length).toBeGreaterThan(5)
      expect(m.hint.length).toBeGreaterThan(5)
    }
    expect(emptyListMessage('para_mi', false).hint).toContain('favoritos')
    expect(emptyListMessage('recientes', true).hint).toContain('filtros')
  })
})

describe('sección: varios temas a la vez (lógica O), Todos, Ver todos / Ver menos', () => {
  const topic = (id: string) => ({ id, label: id })
  const RECETAS = ['platos-principales', 'entrantes-aperitivos-tapas', 'recetas-faciles', 'postres-dulces', 'cocina-saludable', 'menus-planificacion', 'trucos-de-cocina', 'aprovechamiento-alimentos'].map(topic)

  it('la dirección admite varios temas (repetidos o separados por comas), sin vacíos ni repetidos', () => {
    expect(parseTopics(new URLSearchParams('tema=a&tema=b&tema=a'))).toEqual(['a', 'b'])
    expect(parseTopics(new URLSearchParams('tema=a,b,,c'))).toEqual(['a', 'b', 'c'])
    expect(parseTopics(new URLSearchParams('tema=a&tema=x'), ['a', 'b'])).toEqual(['a'])
    expect(parseTopics(new URLSearchParams(''))).toEqual([])
  })

  it('pulsar un tema lo añade y pulsarlo otra vez lo quita; «Todos» (lista vacía) limpia', () => {
    expect(toggleTopic([], 'a')).toEqual(['a'])
    expect(toggleTopic(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleTopic(['a', 'b'], 'a')).toEqual(['b'])
    expect(toggleTopic(['b'], 'b')).toEqual([])
  })

  it('con varios temas la petición manda la lista; temas, tipo y orden se combinan y la dirección lo recuerda', () => {
    const f = readSectionFilters('recetas', new URLSearchParams('tema=recetas-faciles&tema=postres-dulces&tipo=receta&orden=no_leidas'))
    expect(f).toEqual({ topics: ['recetas-faciles', 'postres-dulces'], order: 'no_leidas', kind: 'receta' })
    expect(sectionListParams('recetas', f, 0, 20)).toMatchObject({ topics: ['recetas-faciles', 'postres-dulces'], kind: 'receta', order: 'no_leidas' })
    expect(readSectionFilters('recetas', sectionFiltersToParams(f))).toEqual(f)
    expect(hasSectionFilters(f)).toBe(true)
    expect(hasSectionFilters({ topics: [], order: 'no_leidas', kind: null })).toBe(false)
    expect(sectionSignature('recetas', f)).not.toBe(sectionSignature('recetas', { ...f, topics: ['postres-dulces', 'recetas-faciles'] }))
  })

  it('«No leídas primero» se ofrece en las dos secciones, además de recientes, comentadas y sin respuesta', () => {
    expect(sectionOrders('hogar')).toEqual(['recientes', 'comentados', 'sin_respuesta', 'no_leidas', 'para_mi'])
    expect(sectionOrders('recetas')).toEqual(['recientes', 'comentados', 'valoradas', 'sin_respuesta', 'no_leidas', 'para_mi'])
    expect(parseOrder('no_leidas', sectionOrders('hogar'))).toBe('no_leidas')
    expect(parseOrder('no_leidas', searchOrders(null))).toBe('recientes')
  })

  it('se enseñan 3 temas destacados y el resto queda tras «Ver todos los temas», sin repetidos', () => {
    const { featured, rest } = splitFeaturedTopics('recetas', RECETAS, [])
    expect(featured.map((t) => t.id)).toEqual(['platos-principales', 'recetas-faciles', 'trucos-de-cocina'])
    expect(rest).toHaveLength(5)
    expect(new Set([...featured, ...rest].map((t) => t.id)).size).toBe(8)
  })

  it('un tema elegido que estaba escondido se sube a la vista para que no quede oculto', () => {
    const { featured, rest } = splitFeaturedTopics('recetas', RECETAS, ['postres-dulces'])
    expect(featured.map((t) => t.id)).toContain('postres-dulces')
    expect(rest.map((t) => t.id)).not.toContain('postres-dulces')
    expect(featured.length + rest.length).toBe(8)
  })

  it('si faltan destacados fijos se completa con los primeros del catálogo', () => {
    const { featured } = splitFeaturedTopics('hogar', [topic('x1'), topic('x2'), topic('x3'), topic('x4')], [])
    expect(featured.map((t) => t.id)).toEqual(['x1', 'x2', 'x3'])
  })
})
