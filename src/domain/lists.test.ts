import { describe, expect, it } from 'vitest'
import {
  applyFormat,
  blockRange,
  canIndent,
  canOutdent,
  clearFormat,
  cleanImportedLines,
  displayItems,
  duplicateList,
  indentItem,
  isObviousDuplicate,
  isValidRich,
  matchesQuery,
  moveBlock,
  normalizeOutline,
  outdentItem,
  parseRich,
  plainForShopping,
  progressOf,
  removeItem,
  richOrNull,
  richToPlain,
  sanitizeRich,
  searchLists,
  serializeRich,
  sortPendingFirst,
  splitDictation,
  splitLines,
  validateFolderName,
  validateTitle,
  type ListColumn,
  type ListItem,
  type UserList,
} from '@/domain/lists'

describe('Mis listas — texto con formato limitado', () => {
  it('guarda y recupera negrita y color en palabras sueltas', () => {
    const spans = parseRich('Comprar <b>mochila</b> <c:rojo>azul</c> y <b><c:verde>lápices</c></b>')
    expect(spans.map((s) => [s.text, s.bold, s.color])).toEqual([
      ['Comprar ', false, null],
      ['mochila', true, null],
      [' ', false, null],
      ['azul', false, 'rojo'],
      [' y ', false, null],
      ['lápices', true, 'verde'],
    ])
    expect(serializeRich(spans)).toBe('Comprar <b>mochila</b> <c:rojo>azul</c> y <b><c:verde>lápices</c></b>')
    expect(richToPlain('Comprar <b>mochila</b> <c:rojo>azul</c>')).toBe('Comprar mochila azul')
  })
  it('lo que no es formato permitido se descarta o se trata como texto: nunca etiquetas inseguras', () => {
    const dirty = '<script>alert(1)</script><b onclick="x">hola</b><img src=x><c:fucsia>x</c>'
    const clean = sanitizeRich(dirty)
    expect(clean).not.toContain('<script')
    expect(clean).not.toContain('<img')
    // lo no permitido queda como TEXTO escapado (inofensivo), nunca como etiqueta real
    expect(clean).toContain('&lt;script&gt;')
    expect(clean.replace(/<\/?b>|<\/?c(:[a-z]+)?>/g, '')).not.toContain('<')
    expect(isValidRich(clean)).toBe(true)
    expect(isValidRich(dirty)).toBe(false)
  })
  it('los signos < > & del texto se escapan y vuelven igual', () => {
    const spans = [{ text: '5 < 6 & 7 > 2', bold: true, color: null }]
    const markup = serializeRich(spans)
    expect(markup).toBe('<b>5 &lt; 6 &amp; 7 &gt; 2</b>')
    expect(parseRich(markup)).toEqual(spans)
  })
  it('un color desconocido no se acepta; las etiquetas sin cerrar no rompen nada', () => {
    expect(parseRich('<c:desconocido>hola</c>')[0].color).toBeNull()
    expect(richToPlain('<b>sin cerrar')).toBe('sin cerrar')
  })
  it('aplica negrita o color solo a la parte seleccionada y se puede quitar', () => {
    let spans = parseRich('comprar dos cuadernos')
    spans = applyFormat(spans, 8, 11, { bold: true })
    expect(serializeRich(spans)).toBe('comprar <b>dos</b> cuadernos')
    spans = applyFormat(spans, 12, 21, { color: 'azul' })
    expect(serializeRich(spans)).toBe('comprar <b>dos</b> <c:azul>cuadernos</c>')
    spans = applyFormat(spans, 5, 16, { bold: true })
    expect(richToPlain(serializeRich(spans))).toBe('comprar dos cuadernos')
    spans = clearFormat(spans, 0, 100)
    expect(richOrNull(spans)).toBeNull()
  })
  it('una selección vacía no cambia nada', () => {
    const spans = parseRich('hola')
    expect(applyFormat(spans, 2, 2, { bold: true })).toBe(spans)
  })
  it('texto sin formato real se guarda como null', () => {
    expect(richOrNull(parseRich('solo texto'))).toBeNull()
    expect(richOrNull(parseRich('<b>algo</b>'))).toBe('<b>algo</b>')
  })
  it('al enviar a Compras se usa texto limpio, sin formato', () => {
    expect(plainForShopping({ text: 'x', rich: '<b>Leche</b> <c:rojo>entera</c>' })).toBe('Leche entera')
    expect(plainForShopping({ text: '  Pan   integral ', rich: null })).toBe('Pan integral')
  })
})

type O = { id: string; depth: 0 | 1; done: boolean }
const o = (id: string, depth: 0 | 1 = 0, done = false): O => ({ id, depth, done })
const ids = (items: O[]) => items.map((i) => `${i.depth ? '·' : ''}${i.id}`).join(' ')

describe('Mis listas — dos niveles sin subelementos huérfanos', () => {
  it('el primer elemento nunca puede ser subelemento', () => {
    expect(ids(normalizeOutline([o('a', 1), o('b', 1)]))).toBe('a ·b')
    expect(canIndent([o('a'), o('b')], 0)).toBe(false)
    expect(canIndent([o('a'), o('b')], 1)).toBe(true)
  })
  it('sangría y desangrar', () => {
    const items = [o('a'), o('b'), o('c')]
    const ind = indentItem(items, 1)
    expect(ids(ind)).toBe('a ·b c')
    expect(canOutdent(ind, 1)).toBe(true)
    expect(ids(outdentItem(ind, 1))).toBe('a b c')
    expect(indentItem(items, 0)).toBe(items)
  })
  it('un elemento con subelementos no puede pasar a subelemento (serían tres niveles)', () => {
    const items = [o('a'), o('b'), o('c', 1)]
    expect(canIndent(items, 1)).toBe(false)
    expect(indentItem(items, 1)).toBe(items)
  })
  it('mover un elemento arrastra a sus subelementos', () => {
    const items = [o('a'), o('b'), o('b1', 1), o('b2', 1), o('c')]
    expect(blockRange(items, 1)).toEqual([1, 4])
    expect(ids(moveBlock(items, 1, 5))).toBe('a c b ·b1 ·b2')
    expect(ids(moveBlock(items, 4, 1))).toBe('a c b ·b1 ·b2')
    expect(ids(moveBlock(items, 1, 0))).toBe('b ·b1 ·b2 a c')
  })
  it('mover sobre sí mismo no cambia nada; un subelemento puesto el primero deja de serlo', () => {
    const items = [o('a'), o('b'), o('b1', 1)]
    expect(moveBlock(items, 1, 2)).toBe(items)
    expect(ids(moveBlock(items, 2, 0))).toBe('b1 a b')
  })
  it('quitar un elemento promueve a sus subelementos; nunca los pasa a otro elemento', () => {
    const items = [o('a'), o('b'), o('b1', 1), o('b2', 1), o('c')]
    expect(ids(removeItem(items, 1))).toBe('a b1 b2 c')
    expect(ids(removeItem(items, 2))).toBe('a b ·b2 c')
    expect(ids(removeItem([o('a'), o('a1', 1)], 0))).toBe('a1')
  })
})

describe('Mis listas — orden y progreso', () => {
  it('pendientes arriba y completados abajo respetando el orden manual y los bloques', () => {
    const items = [o('a', 0, true), o('a1', 1, true), o('b'), o('c', 0, true), o('d'), o('d1', 1, false)]
    expect(ids(sortPendingFirst(items))).toBe('b d ·d1 a ·a1 c')
    expect(displayItems(items, 'manual')).toBe(items)
    expect(ids(displayItems(items, 'pendientes_arriba'))).toBe('b d ·d1 a ·a1 c')
  })
  it('el progreso cuenta solo los elementos principales', () => {
    expect(progressOf([o('a', 0, true), o('a1', 1, true), o('b')])).toEqual({ done: 1, total: 2 })
  })
})

describe('Mis listas — duplicados y búsqueda', () => {
  it('duplicado evidente: mismo texto comparable, no «contiene»', () => {
    expect(isObviousDuplicate('Leche entera', 'leche  ENTERA')).toBe(true)
    expect(isObviousDuplicate('2 cuadernos', 'Cuadernos')).toBe(true)
    expect(isObviousDuplicate('Pan', 'Pan de molde')).toBe(false)
    expect(isObviousDuplicate('', '')).toBe(false)
  })
  it('la búsqueda ignora tildes y mayúsculas y mira título y contenido', () => {
    expect(matchesQuery('Excursión al Museo', 'EXCURSION')).toBe(true)
    const lists = [{ id: 'l1', title: 'Colegio' }, { id: 'l2', title: 'Vacaciones' }, { id: 'l3', title: 'Casa' }]
    const text = { l1: ['Comprar mochila', 'Cuadernos'], l2: ['Reservar hotel'], l3: [] }
    expect([...searchLists(lists, text, 'mochila')]).toEqual(['l1'])
    expect([...searchLists(lists, text, 'vacac')]).toEqual(['l2'])
    expect([...searchLists(lists, text, '')].sort()).toEqual(['l1', 'l2', 'l3'])
    expect([...searchLists(lists, text, 'nada')]).toEqual([])
  })
})

describe('Mis listas — dictado y líneas pegadas', () => {
  it('«Comprar mochila, dos cuadernos, un estuche y preparar uniforme» da cuatro elementos', () => {
    expect(splitDictation('Comprar mochila, dos cuadernos, un estuche y preparar uniforme')).toEqual([
      'Comprar mochila',
      'Dos cuadernos',
      'Un estuche',
      'Preparar uniforme',
    ])
  })
  it('un solo elemento, vacío y con punto final', () => {
    expect(splitDictation('Llamar al pediatra.')).toEqual(['Llamar al pediatra'])
    expect(splitDictation('   ')).toEqual([])
  })
  it('varias frases separadas por punto y por líneas', () => {
    expect(splitDictation('Pagar el comedor. Revisar la agenda')).toEqual(['Pagar el comedor', 'Revisar la agenda'])
    expect(splitDictation('uno\ndos;tres')).toEqual(['Uno', 'Dos', 'Tres'])
  })
  it('quita viñetas y numeración de un texto pegado', () => {
    expect(splitLines('- leche\n2) pan\n• huevos\n[ ] fruta\n\n')).toEqual(['leche', 'pan', 'huevos', 'fruta'])
  })
  it('limpia lo importado: espacios, vacíos, repetidos seguidos y tope', () => {
    const out = cleanImportedLines([{ text: '  hola   mundo ' }, { text: 'hola mundo' }, { text: '   ' }, { text: 'ilegible', uncertain: true }])
    expect(out).toEqual([{ text: 'hola mundo', uncertain: undefined }, { text: 'ilegible', uncertain: true }])
    expect(cleanImportedLines(Array.from({ length: 500 }, (_, i) => ({ text: `l${i}` }))).length).toBe(200)
  })
})

describe('Mis listas — duplicar', () => {
  const list: UserList = { id: 'L', familyId: 'F', createdBy: 'U', title: 'Colegio', kind: 'tareas', visibility: 'familiar', folderId: 'FOL', sortOrder: 3, sortMode: 'pendientes_arriba', archivedAt: '2026-01-01', createdAt: 'x', updatedAt: 'y' }
  const columns: ListColumn[] = [{ id: 'C1', listId: 'L', title: 'Pros', sortOrder: 0 }]
  const item = (id: string, over: Partial<ListItem> = {}): ListItem => ({ id, listId: 'L', familyId: 'F', depth: 0, text: id, rich: null, done: true, doneAt: 'z', sortOrder: 1, columnId: null, createdAt: 'x', updatedAt: 'y', ...over })
  it('copia contenido y formato con identificadores nuevos, privada, sin carpeta, pendiente y sin vínculos', () => {
    const items = [item('a', { rich: '<b>a</b>' }), item('b', { depth: 1, columnId: 'C1' })]
    const copy = duplicateList(list, columns, items)
    expect(copy.list.id).not.toBe('L')
    expect(copy.list.title).toBe('Colegio (copia)')
    expect(copy.list.visibility).toBe('privada')
    expect(copy.list.folderId).toBeNull()
    expect(copy.list.archivedAt).toBeNull()
    expect(copy.items.map((i) => i.done)).toEqual([false, false])
    expect(copy.items.every((i) => i.doneAt === null)).toBe(true)
    expect(copy.items[0].rich).toBe('<b>a</b>')
    expect(copy.items[1].depth).toBe(1)
    expect(new Set([...copy.items.map((i) => i.id), 'a', 'b']).size).toBe(4)
    // las columnas también se renuevan y los elementos apuntan a la columna NUEVA
    expect(copy.columns[0].id).not.toBe('C1')
    expect(copy.items[1].columnId).toBe(copy.columns[0].id)
  })
  it('la lista original no se toca', () => {
    const items = [item('a')]
    duplicateList(list, columns, items)
    expect(items[0].done).toBe(true)
    expect(list.visibility).toBe('familiar')
  })
})

describe('Mis listas — validaciones', () => {
  it('títulos y nombres de carpeta', () => {
    expect(validateTitle('  ')).not.toBeNull()
    expect(validateTitle('Colegio')).toBeNull()
    expect(validateTitle('x'.repeat(121))).not.toBeNull()
    expect(validateFolderName('', [])).not.toBeNull()
    expect(validateFolderName('Casa', ['casa'])).toMatch(/Ya tienes/)
    expect(validateFolderName('Trabajo', ['Casa'])).toBeNull()
  })
})

import { relocateBlock } from '@/domain/lists'
type R = { id: string; depth: 0 | 1; columnId: string | null }
const r = (id: string, depth: 0 | 1 = 0, columnId: string | null = null): R => ({ id, depth, columnId })
const show = (items: R[]) => items.map((i) => `${i.columnId ?? ''}:${i.depth ? '·' : ''}${i.id}`).join(' ')

describe('Mis listas — arrastrar y soltar', () => {
  it('mueve un elemento con sus subelementos antes o después de otro', () => {
    const items = [r('a'), r('b'), r('b1', 1), r('c')]
    expect(show(relocateBlock(items, 'b', { id: 'c', after: true }))).toBe(':a :c :b :·b1')
    expect(show(relocateBlock(items, 'c', { id: 'a', after: false }))).toBe(':c :a :b :·b1')
  })
  it('soltar dentro de sí mismo no cambia nada', () => {
    const items = [r('a'), r('a1', 1), r('b')]
    expect(relocateBlock(items, 'a', { id: 'a1', after: true })).toBe(items)
  })
  it('un elemento de nivel 0 soltado sobre un subelemento no parte a la familia: va antes o después del bloque', () => {
    const items = [r('a'), r('a1', 1), r('a2', 1), r('b')]
    expect(show(relocateBlock(items, 'b', { id: 'a1', after: true }))).toBe(':a :·a1 :·a2 :b')
    expect(show(relocateBlock(items, 'b', { id: 'a1', after: false }))).toBe(':b :a :·a1 :·a2')
  })
  it('un subelemento puede cambiar de padre', () => {
    const items = [r('a'), r('a1', 1), r('b'), r('b1', 1)]
    expect(show(relocateBlock(items, 'a1', { id: 'b1', after: true }))).toBe(':a :b :·b1 :·a1')
  })
  it('entre columnas: cambia la columna de todo el bloque y no quedan huérfanos', () => {
    const items = [r('p1', 0, 'P'), r('p1a', 1, 'P'), r('c1', 0, 'C')]
    expect(show(relocateBlock(items, 'p1', { id: 'c1', after: true }))).toBe('C:c1 C:p1 C:·p1a')
    expect(show(relocateBlock(items, 'p1a', { id: null, columnId: 'C', after: true }))).toBe('P:p1 C:c1 C:·p1a')
    expect(relocateBlock(items, 'p1a', { id: null, columnId: 'C', after: true }).find((i) => i.id === 'p1a')?.depth).toBe(1 as number | 0)
  })
  it('soltar sobre una columna vacía', () => {
    const items = [r('p1', 0, 'P')]
    expect(show(relocateBlock(items, 'p1', { id: null, columnId: 'C', after: true }))).toBe('C:p1')
  })
})
