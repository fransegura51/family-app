import { describe, expect, it } from 'vitest'
import { assignColumns, mergeWithPrevious, moveLine, normalizeReviewDepth, shouldAskAiToSplit, splitLineAt, toReviewLines } from '@/domain/listImport'
import { splitDictation, splitLines } from '@/domain/lists'

const texts = (l: { text: string }[]) => l.map((x) => x.text)

describe('dictado: separación local (la misma que alimenta Compras: pausas → comas)', () => {
  it('un solo elemento se queda como uno', () => {
    expect(splitDictation('Comprar platos')).toEqual(['Comprar platos'])
  })
  it('varios elementos con pausas (el micrófono las une con comas)', () => {
    expect(splitDictation('comprar platos, comprar toallas, limpiar la ducha')).toEqual(['Comprar platos', 'Comprar toallas', 'Limpiar la ducha'])
  })
  it('enumeración con «y» y sin puntuación en el último', () => {
    expect(splitDictation('comprar platos, comprar toallas y limpiar la ducha')).toEqual(['Comprar platos', 'Comprar toallas', 'Limpiar la ducha'])
  })
  it('enumeración con puntos y mayúsculas', () => {
    expect(splitDictation('Comprar platos. Comprar toallas. Limpiar la ducha.')).toEqual(['Comprar platos', 'Comprar toallas', 'Limpiar la ducha'])
  })
  it('pegado con viñetas o numeración: una línea por elemento', () => {
    expect(splitLines('1. Comprar platos\n- Comprar toallas\n• Limpiar la ducha')).toEqual(['Comprar platos', 'Comprar toallas', 'Limpiar la ducha'])
  })
  it('reconocimiento imperfecto sin pausas ni comas: queda una línea y SÍ se pide separarla (IA, como en Compras)', () => {
    const parts = splitDictation('Regalo platos comprado toallas limpia la ducha entregar el suelo')
    expect(parts).toHaveLength(1)
    expect(shouldAskAiToSplit(parts)).toBe(true)
  })
  it('un elemento corto o ya separado no gasta IA', () => {
    expect(shouldAskAiToSplit(['Pan'])).toBe(false)
    expect(shouldAskAiToSplit(['Uno', 'Dos'])).toBe(false)
  })
})

describe('revisión: separar, unir, mover', () => {
  const base = () => toReviewLines([{ text: 'Regalo platos comprado toallas' }, { text: 'Limpiar la ducha', depth: 1 }])
  it('«Separar aquí» parte la línea en el cursor sin perder texto y la segunda hereda sangría y columna', () => {
    const lines = toReviewLines([{ text: 'Regalo platos comprado toallas', depth: 1, columnId: 'C2' }])
    const out = splitLineAt(lines, lines[0].key, 'Regalo platos'.length)
    expect(texts(out)).toEqual(['Regalo platos', 'Comprado toallas'])
    expect(out.map((l) => [l.depth, l.columnId])).toEqual([
      [1, 'C2'],
      [1, 'C2'],
    ])
    expect(out[0].key).toBe(lines[0].key)
    expect(out[1].key).not.toBe(out[0].key)
  })
  it('separar al principio o al final no crea elementos vacíos', () => {
    const lines = base()
    expect(splitLineAt(lines, lines[0].key, 0)).toBe(lines)
    expect(splitLineAt(lines, lines[0].key, lines[0].text.length)).toBe(lines)
    expect(splitLineAt(lines, 999999, 3)).toBe(lines)
  })
  it('«Unir con el anterior» junta dos líneas y conserva las propiedades de la primera', () => {
    const lines = toReviewLines([
      { text: 'Regalo platos', columnId: 'C1' },
      { text: 'Comprado toallas', columnId: 'C2' },
    ])
    const out = mergeWithPrevious(lines, lines[1].key)
    expect(texts(out)).toEqual(['Regalo platos comprado toallas'])
    expect(out[0].columnId).toBe('C1')
    expect(mergeWithPrevious(lines, lines[0].key)).toBe(lines) // la primera no tiene anterior
  })
  it('separar y volver a unir devuelve el texto original', () => {
    const lines = toReviewLines([{ text: 'Comprar platos comprar toallas' }])
    const split = splitLineAt(lines, lines[0].key, 'Comprar platos'.length)
    expect(texts(mergeWithPrevious(split, split[1].key))).toEqual(['Comprar platos comprar toallas'])
  })
  it('mover sube y baja sin salirse', () => {
    const lines = toReviewLines([{ text: 'a' }, { text: 'b' }, { text: 'c' }])
    expect(texts(moveLine(lines, lines[2].key, -1))).toEqual(['a', 'c', 'b'])
    expect(texts(moveLine(lines, lines[0].key, -1))).toEqual(['a', 'b', 'c'])
    expect(texts(moveLine(lines, lines[2].key, 1))).toEqual(['a', 'b', 'c'])
  })
  it('el primer elemento nunca es subelemento', () => {
    expect(normalizeReviewDepth(toReviewLines([{ text: 'a', depth: 1 }, { text: 'b', depth: 1 }])).map((l) => l.depth)).toEqual([0, 1])
  })
})

describe('columnas del destino', () => {
  it('conserva la columna elegida si existe y manda a la predeterminada la que ya no existe', () => {
    const lines = toReviewLines([{ text: 'a', columnId: 'C2' }, { text: 'b', columnId: 'BORRADA' }, { text: 'c' }])
    const out = assignColumns(lines, ['C1', 'C2', 'C3'], 'C1')
    expect(out.map((l) => l.columnId)).toEqual(['C2', 'C1', 'C1'])
  })
})
