import { describe, expect, it } from 'vitest'
import { normalizeStoreName, resolveStoreChain, type StoreChainAliasRow, type StoreChainKind, type StoreChainRow } from './storeChains'

// Los alias y las cadenas se leen de la propia migración: la prueba comprueba lo que de verdad se siembra en la base de datos.
const FILES = import.meta.glob('/supabase/migrations/0142_store_chains.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const MIGRATION = FILES['/supabase/migrations/0142_store_chains.sql']

const CHAINS: StoreChainRow[] = [...MIGRATION.matchAll(/\(\s*'([a-z0-9_]+)',\s*'((?:[^']|'')*)',\s*'(supermarket|marketplace|fuel_retail|local_shop)',\s*(true|false)/g)].map((m) => ({
  key: m[1],
  name: m[2].replace(/''/g, "'"),
  kind: m[3] as StoreChainKind,
  learnable: m[4] === 'true',
  status: 'active' as const,
}))
const ALIASES: StoreChainAliasRow[] = [...MIGRATION.matchAll(/\(\s*'([a-z0-9_]+)',\s*'([a-z0-9 ]+)',\s*'(exact|word_prefix)',/g)].map((m) => ({
  chain_key: m[1],
  alias_norm: m[2],
  match_mode: m[3] as 'exact' | 'word_prefix',
}))

const resolve = (store: string | null | undefined, chains = CHAINS, aliases = ALIASES) => resolveStoreChain(store, chains, aliases)
const keyOf = (store: string) => {
  const r = resolve(store)
  return r.status === 'resolved' ? r.chainKey : null
}

describe('semilla leída de la migración', () => {
  it('registra las diez cadenas y sus alias', () => {
    expect(CHAINS.map((c) => c.key).sort()).toEqual(['aldi', 'amazon', 'charter', 'consum', 'es_poligono_las_maromas', 'hiperber', 'lidl', 'macro_asia', 'mercadona', 'repsol'])
    expect(ALIASES).toHaveLength(12)
  })

  it('learnable: solo Mercadona, Hiperber y Charter en la primera siembra', () => {
    expect(CHAINS.filter((c) => c.learnable).map((c) => c.key).sort()).toEqual(['charter', 'hiperber', 'mercadona'])
    for (const key of ['amazon', 'macro_asia', 'repsol', 'es_poligono_las_maromas', 'aldi', 'lidl', 'consum']) {
      expect(CHAINS.find((c) => c.key === key)?.learnable, key).toBe(false)
    }
  })

  it('tipos: supermercados, mercado, venta mixta de combustible y tienda local', () => {
    const kind = (k: string) => CHAINS.find((c) => c.key === k)?.kind
    expect(['mercadona', 'hiperber', 'charter', 'consum', 'aldi', 'lidl'].map(kind)).toEqual(Array(6).fill('supermarket'))
    expect(kind('amazon')).toBe('marketplace')
    expect(kind('macro_asia')).toBe('local_shop')
    expect(kind('repsol')).toBe('fuel_retail')
  })

  it('los alias ya vienen normalizados, son únicos y solo apuntan a cadenas registradas', () => {
    const keys = new Set(CHAINS.map((c) => c.key))
    for (const a of ALIASES) {
      expect(normalizeStoreName(a.alias_norm), a.alias_norm).toBe(a.alias_norm)
      expect(a.alias_norm.length, a.alias_norm).toBeGreaterThanOrEqual(4)
      expect(keys.has(a.chain_key), a.chain_key).toBe(true)
    }
    expect(new Set(ALIASES.map((a) => a.alias_norm)).size).toBe(ALIASES.length)
  })
})

describe('normalizeStoreName', () => {
  it('mayúsculas, tildes, espacios y signos', () => {
    expect(normalizeStoreName('  MERCADONA  ')).toBe('mercadona')
    expect(normalizeStoreName('E.S. POLÍGONO LAS MAROMAS')).toBe('e s poligono las maromas')
    expect(normalizeStoreName('WWW.AMAZON* 7V62L4X05-LUXEMBOURG')).toBe('www amazon 7v62l4x05 luxembourg')
    expect(normalizeStoreName('Carnicería')).toBe('carniceria')
    expect(normalizeStoreName('---')).toBe('')
  })
})

describe('resolveStoreChain: valores reales auditados', () => {
  it.each([
    ['Mercadona', 'mercadona'],
    ['MERCADONA', 'mercadona'],
    ['  mercadona  ', 'mercadona'],
    ['MERCADONA ALMORADI-ALMORADI', 'mercadona'],
    ['MERCADONA CALLOSA DEL SEG-ALMAJAL (CAMI', 'mercadona'],
    ['Hiperber', 'hiperber'],
    ['HIPERBER DISTRIBUCION Y L-RAFAL', 'hiperber'],
    ['Charter', 'charter'],
    ['CHARTER', 'charter'],
    ['Repsol', 'repsol'],
    ['Amazon', 'amazon'],
    ['Amazon ', 'amazon'],
    ['WWW.AMAZON-LUXEMBOURG', 'amazon'],
    ['WWW.AMAZON* 7V62L4X05-LUXEMBOURG', 'amazon'],
    ['MACRO ASIA', 'macro_asia'],
    ['MAKRO ASIA-ALMORADI', 'macro_asia'],
    ['E.S. POLIGONO LAS MAROMAS', 'es_poligono_las_maromas'],
    ['E.S. POLIGONO LAS MAROMAS-ALMORADI', 'es_poligono_las_maromas'],
    ['ALDI CALLOSA-CALLOSA DE SE', 'aldi'],
    ['Aldi', 'aldi'],
    ['Lidl', 'lidl'],
    ['SUPERMERCADO CONSUM RAFAL-RAFAL', 'consum'],
  ])('%s → %s', (store, chain) => {
    expect(keyOf(store)).toBe(chain)
  })

  it('Mercadona, Hiperber y Charter son aprendibles', () => {
    for (const store of ['Mercadona', 'Hiperber', 'Charter']) {
      expect(resolve(store)).toMatchObject({ status: 'resolved', learnable: true })
    }
  })

  it('Charter es cadena propia: nunca se funde con Consum', () => {
    expect(keyOf('Charter')).toBe('charter')
    expect(keyOf('Charter')).not.toBe('consum')
    expect(keyOf('SUPERMERCADO CONSUM RAFAL-RAFAL')).toBe('consum')
    expect(keyOf('Charter Consum')).toBeNull()
    expect(keyOf('Consum Charter')).toBeNull()
    expect(ALIASES.filter((a) => a.chain_key === 'consum').every((a) => !a.alias_norm.includes('charter'))).toBe(true)
  })

  it('Amazon, Macro Asia y las gasolineras NO son aprendibles', () => {
    expect(resolve('Amazon')).toMatchObject({ status: 'resolved', chainKey: 'amazon', learnable: false })
    expect(resolve('MACRO ASIA')).toMatchObject({ status: 'resolved', chainKey: 'macro_asia', learnable: false })
    expect(resolve('E.S. POLIGONO LAS MAROMAS')).toMatchObject({ learnable: false })
    expect(resolve('Repsol')).toMatchObject({ status: 'resolved', chainKey: 'repsol', learnable: false })
  })
})

describe('resolveStoreChain: sin adivinar', () => {
  it.each([
    ['COFIDIS AMAZON-CORNELLA DE L', 'unknown'], // la financiación de Amazon no es Amazon
    ['Amazonas', 'unknown'],
    ['Mercadonas', 'unknown'],
    ['Huperber', 'unknown'], // errata: no hay corrección aproximada
    ['ALDIS BAR', 'unknown'],
    ['Makro', 'unknown'], // "Makro" solo no es Macro Asia
    ['Consum', 'unknown'], // sin dato real con ese nombre
    ['E.S. ABANILLA-SANTOMERA', 'unknown'], // otra gasolinera
    ['E S THADER-MURCIA', 'unknown'],
    ['PETROPRIX ALMORADI-ALMORADI', 'unknown'],
    ['SUPERMERCADO SERMUCO-CIEZA', 'unknown'],
    ['DIA 36136-ALMORADI', 'unknown'],
    ['Carnicería', 'unknown'],
    ['', 'empty'],
    ['   ', 'empty'],
    ['---', 'empty'],
    ['中国 mercadona', 'unsupported_characters'],
    ['Mercadona 🛒', 'unsupported_characters'],
  ])('%s → sin resolver (%s)', (store, reason) => {
    expect(resolve(store)).toEqual({ status: 'unresolved', reason })
  })

  it('null y undefined: sin resolver', () => {
    expect(resolve(null)).toEqual({ status: 'unresolved', reason: 'empty' })
    expect(resolve(undefined)).toEqual({ status: 'unresolved', reason: 'empty' })
  })

  it('nunca por subcadena: la cadena tiene que ser la primera palabra o el nombre entero', () => {
    expect(keyOf('SUPER MERCADONA')).toBeNull()
    expect(keyOf('MIMERCADONA')).toBeNull()
    expect(keyOf('BAR ALDI')).toBeNull()
  })

  it('alias que apuntan a dos cadenas distintas → ambiguo, sin resolver', () => {
    const chains: StoreChainRow[] = [
      { key: 'uno', name: 'Uno', kind: 'supermarket', learnable: true, status: 'active' },
      { key: 'dos', name: 'Dos', kind: 'supermarket', learnable: true, status: 'active' },
    ]
    const aliases: StoreChainAliasRow[] = [
      { chain_key: 'uno', alias_norm: 'super sol', match_mode: 'word_prefix' },
      { chain_key: 'dos', alias_norm: 'super sol norte', match_mode: 'exact' },
    ]
    expect(resolve('SUPER SOL NORTE', chains, aliases)).toEqual({ status: 'unresolved', reason: 'ambiguous' })
    expect(resolve('SUPER SOL SUR', chains, aliases)).toMatchObject({ status: 'resolved', chainKey: 'uno' })
  })

  it('una cadena retirada no resuelve', () => {
    const chains = CHAINS.map((c) => (c.key === 'mercadona' ? { ...c, status: 'inactive' as const, learnable: false } : c))
    expect(resolve('Mercadona', chains)).toEqual({ status: 'unresolved', reason: 'unknown' })
  })
})

describe('la cadena no determina la clase ni la categoría', () => {
  it('la resolución solo contiene la cadena y si es aprendible', () => {
    expect(Object.keys(resolve('Repsol')).sort()).toEqual(['chainKey', 'learnable', 'status'])
    expect(Object.keys(CHAINS[0]).sort()).toEqual(['key', 'kind', 'learnable', 'name', 'status'])
  })

  it('Repsol es una cadena de venta mixta y una bombona de butano no se convierte en Combustible por venir de Repsol', () => {
    expect(CHAINS.find((c) => c.key === 'repsol')?.kind).toBe('fuel_retail')
    const r = resolve('Repsol') as Record<string, unknown>
    for (const forbidden of ['class', 'foodType', 'category', 'classKey', 'categoryKey']) expect(r[forbidden]).toBeUndefined()
  })

  it('el módulo no expone nada que convierta cadena en clase o categoría', async () => {
    const mod = (await import('./storeChains')) as Record<string, unknown>
    expect(Object.keys(mod).sort()).toEqual(['normalizeStoreName', 'resolveStoreChain'])
  })
})
