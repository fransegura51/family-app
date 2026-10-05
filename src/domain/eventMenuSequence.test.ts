import { describe, expect, it } from 'vitest'
import { sanitizeImportProposal } from '@/domain/eventFoodMenu'
import { defaultSections, resolveMenuSections, dishHasKitchenTools } from '@/domain/eventMenuHub'
import { dishCount, menuSequence, moveId, placeNewIds, placementForNewDish } from '@/domain/eventMenuSequence'
import { findMenuConflicts } from '@/domain/eventDietaryNeeds'
import { makeMenuItem, makeNeed } from '@/domain/eventFoodFixtures'
import { REAL_MENU_IN_DOCUMENT_ORDER, realMenuAiResponse } from '@/domain/eventMenuRealFixture'

const seqItem = (id: string, sortOrder: number, over = {}) => makeMenuItem({ id, name: id, sortOrder, ...over })

describe('Importación: la propuesta conserva el ORDEN del documento (1, 2, 24)', () => {
  it('1. A-B-C-D que devuelve la IA → la revisión muestra A-B-C-D', () => {
    const proposal = sanitizeImportProposal({ items: ['A', 'B', 'C', 'D'].map((text) => ({ text, kind: 'dish' })) })
    expect(proposal.items.map((i) => i.text)).toEqual(['A', 'B', 'C', 'D'])
  })
  it('2. clasificar A=Postres, B=Bebidas, C=Otro, D=Aperitivo NO cambia A-B-C-D (la sección es metadato)', () => {
    const proposal = sanitizeImportProposal({
      items: [
        { text: 'A', kind: 'dish', section: 'Postres' },
        { text: 'B', kind: 'dish', section: 'Bebidas' },
        { text: 'C', kind: 'dish', section: 'Otro' },
        { text: 'D', kind: 'dish', section: 'Aperitivo / picoteo' },
      ],
    })
    expect(proposal.items.map((i) => i.text)).toEqual(['A', 'B', 'C', 'D'])
    expect(proposal.items.map((i) => i.section)).toEqual(['Postres', 'Bebidas', 'Otro', 'Aperitivo / picoteo'])
  })
  it('24. el caso REAL: antes de guardar la secuencia es exactamente la del documento, con «Cambio de Tercio» como encabezado', () => {
    const proposal = sanitizeImportProposal(realMenuAiResponse())
    expect(proposal.items.map((i) => i.text)).toEqual(REAL_MENU_IN_DOCUMENT_ORDER)
    const tercio = proposal.items.find((i) => i.text === 'Cambio de Tercio')!
    expect(tercio).toMatchObject({ kind: 'heading', section: null, include: true })
    // Las secciones sugeridas son las que antes lo desordenaban: ahora solo informan
    expect(proposal.items.find((i) => i.text === 'Café con Dulces')?.section).toBe('Postres')
    expect(proposal.items.find((i) => i.text === 'Cubatas digestivos')?.section).toBe('Bebidas')
  })
  it('un repetido (Café … Cena … Café) NO se elimina: dos posiciones distintas', () => {
    const proposal = sanitizeImportProposal({ items: [{ text: 'Café' }, { text: 'Cena', kind: 'heading' }, { text: 'Café' }] })
    expect(proposal.items.map((i) => i.text)).toEqual(['Café', 'Cena', 'Café'])
  })
  it('13/14. el texto significativo se conserva; lo prescindible llega DESMARCADO (no descartado) y lo dudoso queda como nota', () => {
    const proposal = sanitizeImportProposal({
      items: [
        { text: 'Menú Boda Jenny & Paco', kind: 'skip' },
        { text: 'Cóctel de bienvenida', kind: 'heading' },
        { text: 'Servicio de café a las 16:00', kind: 'note' },
        { text: 'Patatas', kind: 'dish' },
      ],
      extraNotes: ['35 € por persona'],
    })
    expect(proposal.items.map((i) => [i.text, i.kind, i.include])).toEqual([
      ['Menú Boda Jenny & Paco', 'note', false],
      ['Cóctel de bienvenida', 'heading', true],
      ['Servicio de café a las 16:00', 'note', true],
      ['Patatas', 'dish', true],
      ['35 € por persona', 'note', false],
    ])
  })
  it('un tipo desconocido se trata como plato (no se pierde); solo los platos llevan sección', () => {
    const proposal = sanitizeImportProposal({ items: [{ text: 'X', kind: 'marciano', section: 'Postres' }, { text: 'Cena', kind: 'heading', section: 'Cena' }] })
    expect(proposal.items[0]).toMatchObject({ kind: 'dish', section: 'Postres' })
    expect(proposal.items[1]).toMatchObject({ kind: 'heading', section: null })
  })
  it('la respuesta ANTIGUA agrupada por secciones se aplana en el orden recibido (compatibilidad mientras se actualiza el servidor)', () => {
    const proposal = sanitizeImportProposal({ sections: [{ section: 'Entrantes', dishes: [{ name: 'A' }, 'B'] }, { section: 'Postres', dishes: [{ name: 'C' }] }] })
    expect(proposal.items.map((i) => [i.text, i.section])).toEqual([
      ['A', 'Entrantes'],
      ['B', 'Entrantes'],
      ['C', 'Postres'],
    ])
  })
})

describe('Secuencia explícita (3–8, 17–19)', () => {
  it('el orden sale de la posición explícita, no de created_at, el nombre ni la sección', () => {
    const items = [
      seqItem('z', 3000, { category: 'Entrantes', createdAt: '2026-01-01T00:00:00Z' }),
      seqItem('a', 1000, { category: 'Postres', createdAt: '2026-12-31T00:00:00Z' }),
      seqItem('m', 2000, { category: null, createdAt: '2026-06-01T00:00:00Z' }),
    ]
    expect(menuSequence(items).map((i) => i.id)).toEqual(['a', 'm', 'z'])
  })
  it('5–8. cambiar de sección, renombrar, añadir nota o vincular receta NO cambia la posición (solo cambian esos campos)', () => {
    const before = [seqItem('a', 1000, { category: 'Postres' }), seqItem('b', 2000, { category: 'Bebidas' }), seqItem('c', 3000)]
    const after = before.map((i) => (i.id === 'a' ? { ...i, category: 'Entrantes', name: 'Café renombrado', notes: 'con leche', recipeId: 'r1' } : i))
    expect(menuSequence(after).map((i) => i.id)).toEqual(menuSequence(before).map((i) => i.id))
  })
  it('un mismo nombre en dos posiciones coexiste (18): la identidad es el id', () => {
    const items = [seqItem('1', 1000, { name: 'Café' }), seqItem('2', 2000, { name: 'Cena', kind: 'heading' }), seqItem('3', 3000, { name: 'Café' })]
    expect(menuSequence(items).map((i) => i.name)).toEqual(['Café', 'Cena', 'Café'])
  })
  it('17. reordenar a mano (▲▼ / arrastrar) produce el orden pedido', () => {
    expect(moveId(['A', 'B', 'C', 'D'], 'D', -1)).toEqual(['A', 'B', 'D', 'C'])
    expect(moveId(['A', 'B', 'C', 'D'], 'A', 1)).toEqual(['B', 'A', 'C', 'D'])
  })
  it('19. una SEGUNDA importación coloca lo nuevo donde se elige sin reordenar lo existente', () => {
    const existing = ['e1', 'e2', 'e3']
    expect(placeNewIds(existing, ['n1', 'n2'], { type: 'end' })).toEqual(['e1', 'e2', 'e3', 'n1', 'n2'])
    expect(placeNewIds(existing, ['n1', 'n2'], { type: 'start' })).toEqual(['n1', 'n2', 'e1', 'e2', 'e3'])
    expect(placeNewIds(existing, ['n1', 'n2'], { type: 'after', itemId: 'e2' })).toEqual(['e1', 'e2', 'n1', 'n2', 'e3'])
    // un elemento de referencia que ya no existe → al final (nunca se pierde nada ni se mueve nada)
    expect(placeNewIds(existing, ['n1'], { type: 'after', itemId: 'fantasma' })).toEqual(['e1', 'e2', 'e3', 'n1'])
    // los existentes conservan SIEMPRE su orden relativo
    for (const placement of [{ type: 'end' }, { type: 'start' }, { type: 'after', itemId: 'e1' }] as const) {
      expect(placeNewIds(existing, ['n'], placement).filter((id) => id.startsWith('e'))).toEqual(existing)
    }
  })
})

describe('Un plato manual nace junto a su sección, sin tocar lo existente (21)', () => {
  const dishes = [seqItem('ent1', 1000, { category: 'Entrantes' }), seqItem('post1', 2000, { category: 'Postres' }), seqItem('ent2', 3000, { category: 'Entrantes' })]
  const resolved = resolveMenuSections(defaultSections(false), dishes, false)
  const keyOf = (item: { id: string }) => [...resolved.visible, ...resolved.hidden].find((v) => v.items.some((i) => i.id === item.id))?.key ?? null
  const order = resolved.config.map((c) => c.key)

  it('con platos de su sección: después del ÚLTIMO de esa sección', () => {
    expect(placementForNewDish(dishes, keyOf, 'entrantes', order)).toEqual({ type: 'after', itemId: 'ent2' })
    expect(placementForNewDish(dishes, keyOf, 'postres', order)).toEqual({ type: 'after', itemId: 'post1' })
  })
  it('sin platos en su sección: después de la sección anterior que tenga platos; o al principio; o al final si no hay sección', () => {
    expect(placementForNewDish(dishes, keyOf, 'plato_principal', order)).toEqual({ type: 'after', itemId: 'ent2' }) // entra tras Entrantes, antes de Postres
    expect(placementForNewDish(dishes, keyOf, 'aperitivo', order)).toEqual({ type: 'start' })
    expect(placementForNewDish(dishes, keyOf, null, order)).toEqual({ type: 'end' })
    expect(placementForNewDish([], keyOf, 'entrantes', order)).toEqual({ type: 'end' })
  })
})

describe('Encabezados y notas: no son platos (9–14, 10–12, 20)', () => {
  const heading = makeMenuItem({ id: 'h', name: 'Cambio de Tercio', kind: 'heading', category: null })

  it('9/13. se conservan en su posición como contenido significativo sin fingir ser un plato', () => {
    const items = [seqItem('a', 1000), heading, seqItem('b', 3000)]
    expect(menuSequence(items.map((i) => (i.id === 'h' ? { ...i, sortOrder: 2000 } : i))).map((i) => i.name)).toEqual(['a', 'Cambio de Tercio', 'b'])
    expect(dishCount(items)).toBe(2)
  })
  it('10/11. un separador no ofrece receta ni Compras, ni siquiera cuando la familia es quien cocina', () => {
    expect(dishHasKitchenTools('familia', null, 'heading')).toBe(false)
    expect(dishHasKitchenTools('familia', null, 'note')).toBe(false)
    expect(dishHasKitchenTools('mixto', 'familia', 'heading')).toBe(false)
    expect(dishHasKitchenTools('familia', null, 'dish')).toBe(true)
  })
  it('12/20. un separador no se analiza como alimento en los avisos de necesidades (ni «Cambio de Tercio», ni uno que contenga una palabra de marisco)', () => {
    const needs = [makeNeed({ id: 'n1', category: 'marisco', kind: 'alergia' }), makeNeed({ id: 'n2', guestId: 'g2', category: 'gluten', kind: 'celiaquia' })]
    const items = [
      makeMenuItem({ id: 'd1', name: 'Gamba blanca cocida', kind: 'dish' }),
      makeMenuItem({ id: 'h1', name: 'Cambio de Tercio', kind: 'heading' }),
      makeMenuItem({ id: 'h2', name: 'Cóctel de gambas y pan', kind: 'heading' }),
      makeMenuItem({ id: 'n1', name: 'Pan y cerveza a las 18:00', kind: 'note' }),
    ]
    expect(findMenuConflicts(items, needs).map((c) => c.dishId)).toEqual(['d1'])
  })
  it('las secciones solo clasifican PLATOS: un encabezado nunca crea «Sin sección» ni cuenta para proteger una sección', () => {
    const resolved = resolveMenuSections(defaultSections(false), [heading, makeMenuItem({ id: 'd', kind: 'dish', category: 'Entrantes' })], false)
    expect(resolved.visible.some((v) => v.virtual)).toBe(false)
    expect(resolved.visible.flatMap((v) => v.items).map((i) => i.id)).toEqual(['d'])
  })
})
