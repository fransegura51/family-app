import { describe, expect, it } from 'vitest'
import {
  EMPTY_STORE_CHOICE,
  FOLLOW_GENERAL,
  canonicalStore,
  pendingStoresByName,
  rowSelectValue,
  setGeneralStore,
  setRowStore,
  setSplit,
  storeForRow,
  storeSummary,
  storeSummaryText,
} from '@/domain/storeAssignment'

const STORES = [{ name: 'Consum' }, { name: 'Hiperber' }, { name: 'Mercadona' }]

describe('tienda de destino al enviar a Compras', () => {
  it('sin elegir nada, todo va «Sin tienda»', () => {
    expect(storeForRow(EMPTY_STORE_CHOICE, 'a', STORES)).toBeNull()
  })

  it('una sola tienda para todos', () => {
    const c = setGeneralStore(EMPTY_STORE_CHOICE, 'Consum')
    expect(['a', 'b', 'c'].map((k) => storeForRow(c, k, STORES))).toEqual(['Consum', 'Consum', 'Consum'])
  })

  it('repartir: la general vale para todos hasta que se cambia un producto; el resto no se toca', () => {
    let c = setSplit(setGeneralStore(EMPTY_STORE_CHOICE, 'Consum'), true)
    c = setRowStore(c, 'huevos', 'Hiperber')
    c = setRowStore(c, 'pan', '')
    expect(storeForRow(c, 'leche', STORES)).toBe('Consum')
    expect(storeForRow(c, 'huevos', STORES)).toBe('Hiperber')
    expect(storeForRow(c, 'pan', STORES)).toBeNull()
    expect(storeForRow(c, 'patatas', STORES)).toBe('Consum')
  })

  it('cambiar la tienda general después NO pisa los productos ya repartidos', () => {
    let c = setSplit(setGeneralStore(EMPTY_STORE_CHOICE, 'Consum'), true)
    c = setRowStore(c, 'huevos', 'Hiperber')
    c = setGeneralStore(c, 'Mercadona')
    expect(storeForRow(c, 'leche', STORES)).toBe('Mercadona')
    expect(storeForRow(c, 'huevos', STORES)).toBe('Hiperber')
  })

  it('quitar el cambio de un producto vuelve a seguir a la general', () => {
    let c = setSplit(setGeneralStore(EMPTY_STORE_CHOICE, 'Consum'), true)
    c = setRowStore(c, 'huevos', 'Hiperber')
    expect(rowSelectValue(c, 'huevos')).toBe('Hiperber')
    c = setRowStore(c, 'huevos', null)
    expect(rowSelectValue(c, 'huevos')).toBe(FOLLOW_GENERAL)
    expect(storeForRow(c, 'huevos', STORES)).toBe('Consum')
  })

  it('al desactivar el reparto se usa la general y lo repartido se conserva por si se vuelve a activar', () => {
    let c = setSplit(setGeneralStore(EMPTY_STORE_CHOICE, 'Consum'), true)
    c = setRowStore(c, 'huevos', 'Hiperber')
    c = setSplit(c, false)
    expect(storeForRow(c, 'huevos', STORES)).toBe('Consum')
    c = setSplit(c, true)
    expect(storeForRow(c, 'huevos', STORES)).toBe('Hiperber')
  })

  it('solo vale una tienda habitual de la familia: una desconocida se descarta y se guarda con el nombre exacto de la familia', () => {
    expect(storeForRow(setGeneralStore(EMPTY_STORE_CHOICE, 'Carrefour'), 'a', STORES)).toBeNull()
    expect(storeForRow(setGeneralStore(EMPTY_STORE_CHOICE, 'consum '), 'a', STORES)).toBe('Consum')
    expect(canonicalStore(STORES, 'HIPERBER')).toBe('Hiperber')
    expect(canonicalStore([], 'Consum')).toBeNull()
  })

  it('resumen: cuántos productos van a cada tienda y cuántos sin tienda', () => {
    let c = setSplit(setGeneralStore(EMPTY_STORE_CHOICE, 'Consum'), true)
    c = setRowStore(c, 'huevos', 'Hiperber')
    c = setRowStore(c, 'pan', '')
    const sum = storeSummary(c, ['leche', 'huevos', 'patatas', 'pan'], STORES)
    expect(sum).toEqual([
      { store: 'Consum', count: 2 },
      { store: 'Hiperber', count: 1 },
      { store: null, count: 1 },
    ])
    expect(storeSummaryText(sum)).toBe('Consum 2 · Hiperber 1 · Sin tienda 1')
  })

  it('productos que ya están pendientes en Compras: se sabe en qué tienda, sin fusionar ni cambiar nada', () => {
    const m = pendingStoresByName([
      { name: 'Leche', status: 'pendiente', store: 'Consum' },
      { name: 'leche', status: 'pendiente', store: null },
      { name: 'Pan', status: 'comprado', store: 'Consum' },
    ])
    expect(m.get('leche')).toEqual(['Consum', null])
    expect(m.has('pan')).toBe(false)
  })
})
