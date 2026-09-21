import { describe, expect, it } from 'vitest'
import { checkCommercialText, findTextKeyCollisions, productTextKey } from './productText'
import { resolveSharedProductClass, type SharedLearningData, type SharedLearningRow } from './sharedLearning'
import type { StoreChainAliasRow, StoreChainKind, StoreChainRow } from './storeChains'

// Cadenas y alias: los que realmente siembra la Fase 3. Aprendizaje: la siembra real de la Fase 4. Todo se lee de las migraciones.
const FILES = import.meta.glob(['/supabase/migrations/0139_catalog_base.sql', '/supabase/migrations/0142_store_chains.sql', '/supabase/migrations/0143_shared_product_learning.sql'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
const CATALOG_SQL = FILES['/supabase/migrations/0139_catalog_base.sql']
const CHAINS_SQL = FILES['/supabase/migrations/0142_store_chains.sql']
const SEED_SQL = FILES['/supabase/migrations/0143_shared_product_learning.sql']

const CHAINS: StoreChainRow[] = [...CHAINS_SQL.matchAll(/\(\s*'([a-z0-9_]+)',\s*'((?:[^']|'')*)',\s*'(supermarket|marketplace|fuel_retail|local_shop)',\s*(true|false)/g)].map((m) => ({
  key: m[1],
  name: m[2],
  kind: m[3] as StoreChainKind,
  learnable: m[4] === 'true',
  status: 'active' as const,
}))
const ALIASES: StoreChainAliasRow[] = [...CHAINS_SQL.matchAll(/\(\s*'([a-z0-9_]+)',\s*'([a-z0-9 ]+)',\s*'(exact|word_prefix)',/g)].map((m) => ({
  chain_key: m[1],
  alias_norm: m[2],
  match_mode: m[3] as 'exact' | 'word_prefix',
}))
const APPROVED: SharedLearningRow[] = [...SEED_SQL.matchAll(/\('([a-z_]+)', '([^']+)', '((?:food|other)\.[a-z_]+)', 'approved', 'pepa_seed_v1', 'pepa_admin', now\(\)\)/g)].map((m) => ({
  chain_key: m[1],
  text_key: m[2],
  food_type_key: m[3],
  status: 'approved' as const,
}))
const AMBIGUOUS: SharedLearningRow[] = [...SEED_SQL.matchAll(/\('([a-z_]+)', '([^']+)', null, 'ambiguous', 'pepa_seed_v1'/g)].map((m) => ({
  chain_key: m[1],
  text_key: m[2],
  food_type_key: null,
  status: 'ambiguous' as const,
}))
const CATALOG_FOOD_KEYS = new Set([...CATALOG_SQL.matchAll(/'((?:food|other)\.[a-z_]+)'/g)].map((m) => m[1]))

const DATA: SharedLearningData = { chains: CHAINS, aliases: ALIASES, learning: [...APPROVED, ...AMBIGUOUS] }
const resolve = (store: string | null | undefined, text: string | null | undefined, data: SharedLearningData = DATA) => resolveSharedProductClass(store, text, data)

describe('primera siembra pepa_seed_v1 (leída de la migración)', () => {
  it('169 claves aprobadas y 1 ambigua explícita', () => {
    expect(APPROVED).toHaveLength(169)
    expect(AMBIGUOUS).toEqual([{ chain_key: 'charter', text_key: 'sup bebida fria', food_type_key: null, status: 'ambiguous' }])
  })

  it('recuento por cadena: Mercadona 133, Hiperber 29, Charter 7 y ninguna otra', () => {
    const per: Record<string, number> = {}
    for (const r of APPROVED) per[r.chain_key] = (per[r.chain_key] ?? 0) + 1
    expect(per).toEqual({ mercadona: 133, hiperber: 29, charter: 7 })
  })

  it('recuento por clase', () => {
    const per: Record<string, number> = {}
    for (const r of APPROVED) per[r.food_type_key as string] = (per[r.food_type_key as string] ?? 0) + 1
    expect(per).toEqual({
      'food.carne': 20,
      'food.panaderia_bolleria': 19,
      'other.limpieza_hogar': 16,
      'food.despensa': 15,
      'food.snacks_dulces': 15,
      'food.bebidas_no_alcoholicas': 13,
      'food.lacteos_huevos': 12,
      'food.congelados_helados': 10,
      'food.verdura_hortalizas': 9,
      'food.bebidas_alcoholicas': 8,
      'other.cuidado_personal': 8,
      'food.otros_alimentos': 7,
      'food.condimentos_hierbas': 5,
      'other.utensilios_cocina': 4,
      'food.pescado_marisco': 3,
      'other.otros': 3,
      'food.fruta': 2,
    })
  })

  it('claves únicas y todas apuntan a una clave estable del catálogo (no a un nombre visible)', () => {
    expect(new Set(APPROVED.map((r) => `${r.chain_key}|${r.text_key}`)).size).toBe(169)
    for (const r of APPROVED) {
      expect(CATALOG_FOOD_KEYS.has(r.food_type_key as string), `${r.text_key} → ${r.food_type_key}`).toBe(true)
      expect(r.food_type_key).toMatch(/^(food|other)\.[a-z_]+$/)
    }
  })

  it('cada cadena de la siembra existe y es aprendible; no hay ninguna otra', () => {
    const learnable = new Set(CHAINS.filter((c) => c.learnable).map((c) => c.key))
    for (const r of APPROVED) expect(learnable.has(r.chain_key), r.chain_key).toBe(true)
  })

  it('PRIVACIDAD: las 169 claves pasan la validación, son estables y no contienen datos personales', () => {
    const family = /\b(paco|jennifer|eric|fernando|hepburn|segura|elena|carlos|lucia|navarro)\b/
    for (const r of APPROVED) {
      expect(checkCommercialText(r.text_key), r.text_key).toEqual({ ok: true })
      expect(productTextKey(r.text_key), r.text_key).toBe(r.text_key) // ya normalizada
      expect(r.text_key, r.text_key).toMatch(/^[a-z0-9]+( [a-z0-9]+)*$/)
      expect(r.text_key, r.text_key).not.toMatch(family)
      expect(r.text_key.length, r.text_key).toBeLessThanOrEqual(30)
    }
  })

  it('las filas solo llevan la información generalizable (cadena, clave, clase, lote, aprobación)', () => {
    const insert = SEED_SQL.match(/insert into public\.shared_product_learning \(([^)]*)\) values\n {2}\('mercadona'/)
    expect(insert?.[1].split(',').map((c) => c.trim())).toEqual(['chain_key', 'text_key', 'food_type_key', 'status', 'batch_key', 'approved_by', 'approved_at'])
  })

  it('PARKING (no es un producto) y SUP.BEBIDA FRÍA (ambigua) no están entre las aprobadas', () => {
    expect(APPROVED.filter((r) => /parking|bebida fria/.test(r.text_key))).toEqual([])
    expect(SEED_SQL).not.toMatch(/'parking'/i)
  })
})

describe('resolutor compartido: ejemplos', () => {
  it.each([
    ['Mercadona', 'LECHE SEMI P-6', 'food.lacteos_huevos'],
    ['Mercadona', 'BERENJENA', 'food.verdura_hortalizas'],
    ['Mercadona', 'HIELO CUBITO 2KG', 'food.congelados_helados'],
    ['Mercadona', 'TIBURON', 'food.despensa'],
    ['Mercadona', 'VELA CIFRA 0', 'other.utensilios_cocina'],
    ['Mercadona', 'VELA CIFRA 4', 'other.utensilios_cocina'],
    ['Hiperber', 'CERVEZA MAHOU TOS', 'food.bebidas_no_alcoholicas'],
    ['Hiperber', 'BURGER MEAT MIXTA', 'food.carne'],
    ['Hiperber', 'PATATAS RUFFLES J', 'food.snacks_dulces'],
    ['Charter', 'RUFFLES JAMÓN 150 G', 'food.snacks_dulces'],
    ['MERCADONA ALMORADI-ALMORADI', 'leche semi p-6', 'food.lacteos_huevos'],
    ['MERCADONA CALLOSA DEL SEG-ALMAJAL (CAMI', 'LECHE  SEMI  P 6', 'food.lacteos_huevos'],
  ])('%s + %s → %s (shared)', (store, text, food) => {
    const r = resolve(store, text)
    expect(r.status).toBe('matched')
    expect(r.foodTypeKey).toBe(food)
    expect(r.source).toBe('shared')
    expect(r.textKey).toBe(productTextKey(text))
  })

  it('Charter + SUP.BEBIDA FRÍA → ambiguo, sin clase', () => {
    for (const text of ['SUP.BEBIDA FRÍA', 'sup bebida fria', 'SUP BEBIDA FRIA']) {
      expect(resolve('Charter', text)).toEqual({ status: 'ambiguous', chainKey: 'charter', textKey: 'sup bebida fria', foodTypeKey: null, source: null, reason: null })
    }
  })

  it('Mercadona + PARKING → no aparece como aprendizaje aprobado', () => {
    expect(resolve('Mercadona', 'PARKING')).toMatchObject({ status: 'not_found', foodTypeKey: null, source: null })
  })

  it('texto desconocido en cadena aprendible → not_found, con su clave', () => {
    expect(resolve('Mercadona', 'GALLETAS MARIA')).toMatchObject({ status: 'not_found', textKey: 'galletas maria', foodTypeKey: null })
  })
})

describe('cadenas no aprendibles', () => {
  it.each([
    ['Repsol', 'BERENJENA', 'repsol'],
    ['Repsol', 'RUFFLES JAMÓN 150 G', 'repsol'],
    ['Amazon', 'LECHE SEMI P-6', 'amazon'],
    ['MACRO ASIA', 'BERENJENA', 'macro_asia'],
    ['E.S. POLIGONO LAS MAROMAS', 'TIBURON', 'es_poligono_las_maromas'],
    ['SUPERMERCADO CONSUM RAFAL-RAFAL', 'LECHE SEMI P-6', 'consum'],
    ['ALDI CALLOSA-CALLOSA DE SE', 'BERENJENA', 'aldi'],
    ['Lidl', 'BERENJENA', 'lidl'],
  ])('%s + %s → chain_not_learnable', (store, text, chain) => {
    expect(resolve(store, text)).toEqual({ status: 'chain_not_learnable', chainKey: chain, textKey: null, foodTypeKey: null, source: null, reason: null })
  })

  it('aunque exista accidentalmente una fila aprobada de esa cadena, mientras learnable=false no se usa', () => {
    const accidental: SharedLearningRow[] = ['repsol', 'amazon', 'macro_asia', 'es_poligono_las_maromas', 'consum', 'aldi', 'lidl'].map((chain_key) => ({
      chain_key,
      text_key: 'berenjena',
      food_type_key: 'food.verdura_hortalizas',
      status: 'approved' as const,
    }))
    const data = { ...DATA, learning: [...DATA.learning, ...accidental] }
    for (const store of ['Repsol', 'Amazon', 'MACRO ASIA', 'E.S. POLIGONO LAS MAROMAS', 'SUPERMERCADO CONSUM RAFAL-RAFAL', 'ALDI CALLOSA-CALLOSA DE SE', 'Lidl']) {
      const r = resolve(store, 'BERENJENA', data)
      expect(r.status, store).toBe('chain_not_learnable')
      expect(r.foodTypeKey, store).toBeNull()
    }
  })

  it('una cadena que pasa a no aprendible deja de servir su aprendizaje', () => {
    const chains = CHAINS.map((c) => (c.key === 'hiperber' ? { ...c, learnable: false } : c))
    expect(resolve('Hiperber', 'BURGER MEAT MIXTA', { ...DATA, chains }).status).toBe('chain_not_learnable')
  })
})

describe('Charter != Consum: no hay herencia entre cadenas', () => {
  it('Charter encuentra lo suyo; Consum no lo reutiliza', () => {
    expect(resolve('Charter', 'RUFFLES JAMÓN 150 G')).toMatchObject({ status: 'matched', chainKey: 'charter', foodTypeKey: 'food.snacks_dulces' })
    expect(resolve('SUPERMERCADO CONSUM RAFAL-RAFAL', 'RUFFLES JAMÓN 150 G')).toMatchObject({ status: 'chain_not_learnable', chainKey: 'consum', foodTypeKey: null })
    expect(resolve('Consum', 'RUFFLES JAMÓN 150 G')).toMatchObject({ status: 'chain_unresolved', foodTypeKey: null })
  })

  it('aunque Consum fuese aprendible, la clave de Charter no le sirve (la identidad incluye la cadena)', () => {
    const chains = CHAINS.map((c) => (c.key === 'consum' ? { ...c, learnable: true } : c))
    const r = resolve('SUPERMERCADO CONSUM RAFAL-RAFAL', 'RUFFLES JAMÓN 150 G', { ...DATA, chains })
    expect(r).toMatchObject({ status: 'not_found', chainKey: 'consum', foodTypeKey: null })
  })

  it('lo de una cadena no se filtra a otra aprendible', () => {
    expect(resolve('Hiperber', 'RUFFLES JAMÓN 150 G').status).toBe('not_found')
    expect(resolve('Charter', 'CERVEZA MAHOU TOS').status).toBe('not_found')
    expect(resolve('Hiperber', 'CERVEZA MAHOU 1L').status).toBe('not_found')
    // misma cerveza, clases distintas según la cadena y el texto exacto
    expect(resolve('Charter', 'CERVEZA MAHOU 1L').foodTypeKey).toBe('food.bebidas_alcoholicas')
    expect(resolve('Hiperber', 'CERVEZA MAHOU TOS').foodTypeKey).toBe('food.bebidas_no_alcoholicas')
  })
})

describe('estados: solo approved devuelve clase', () => {
  const withRow = (status: SharedLearningRow['status'], food: string | null) => ({
    ...DATA,
    learning: [{ chain_key: 'mercadona', text_key: 'producto de prueba', food_type_key: food, status }],
  })

  it.each([
    ['approved', 'food.fruta', 'matched', 'food.fruta'],
    ['ambiguous', null, 'ambiguous', null],
    ['retired', 'food.fruta', 'not_found', null],
    ['pending', 'food.fruta', 'not_found', null],
  ] as const)('%s', (status, food, expectedStatus, expectedFood) => {
    const r = resolve('Mercadona', 'PRODUCTO DE PRUEBA', withRow(status, food))
    expect(r.status).toBe(expectedStatus)
    expect(r.foodTypeKey).toBe(expectedFood)
  })

  it('un ambiguo nunca devuelve clase aunque la fila la lleve por error', () => {
    expect(resolve('Mercadona', 'PRODUCTO DE PRUEBA', withRow('ambiguous', 'food.fruta')).foodTypeKey).toBeNull()
  })

  it('una clase retirada del catálogo no se devuelve', () => {
    const data = { ...DATA, approvedFoodTypeKeys: new Set([...CATALOG_FOOD_KEYS].filter((k) => k !== 'other.otros')) }
    expect(resolve('Mercadona', 'BOLSA PLASTICO', data)).toMatchObject({ status: 'not_found', foodTypeKey: null, reason: 'class_retired' })
    expect(resolve('Mercadona', 'BERENJENA', data).status).toBe('matched')
  })
})

describe('cadena sin resolver, texto inválido y nunca inventa', () => {
  it.each([
    ['Huperber', 'BURGER MEAT MIXTA', 'unknown'], // errata: sin corrección aproximada
    ['COFIDIS AMAZON-CORNELLA DE L', 'BERENJENA', 'unknown'],
    ['Carnicería', 'BERENJENA', 'unknown'],
    ['', 'BERENJENA', 'empty'],
    [null, 'BERENJENA', 'empty'],
    ['中国 mercadona', 'BERENJENA', 'unsupported_characters'],
  ])('%s → chain_unresolved (%s)', (store, text, reason) => {
    expect(resolve(store as string | null, text)).toEqual({ status: 'chain_unresolved', chainKey: null, textKey: null, foodTypeKey: null, source: null, reason })
  })

  it.each([
    ['jennifer@example.com', 'email,url'],
    ['600 123 456 789', 'long_number,no_letters'],
    ['', 'empty'],
    ['12,50', 'no_letters'],
    ['https://tienda.es', 'url'],
    ['豆腐 200g', 'unsupported_characters'],
  ])('texto inválido «%s» → invalid (%s), sin devolver la clave del texto', (text, reason) => {
    expect(resolve('Mercadona', text)).toEqual({ status: 'invalid', chainKey: 'mercadona', textKey: null, foodTypeKey: null, source: null, reason })
  })

  it('texto nulo o indefinido → inválido', () => {
    expect(resolve('Mercadona', null)).toMatchObject({ status: 'invalid', reason: 'empty' })
    expect(resolve('Mercadona', undefined)).toMatchObject({ status: 'invalid', reason: 'empty' })
  })
})

describe('colisiones de normalización conocidas', () => {
  it('cada pareja converge en UNA clave y conserva la misma clasificación aprobada', () => {
    const collisions = findTextKeyCollisions(['C 0,0 TOSTADA P-6', 'C 0.0 TOSTADA P-6', 'PAPEL HIGIENICO 4 CA', 'PAPEL HIGIÉNICO 4 CA'])
    expect([...collisions.keys()].sort()).toEqual(['c 0 0 tostada p 6', 'papel higienico 4 ca'])
    for (const [text, food] of [
      ['C 0,0 TOSTADA P-6', 'food.bebidas_no_alcoholicas'],
      ['C 0.0 TOSTADA P-6', 'food.bebidas_no_alcoholicas'],
      ['PAPEL HIGIENICO 4 CA', 'other.cuidado_personal'],
      ['PAPEL HIGIÉNICO 4 CA', 'other.cuidado_personal'],
    ]) {
      expect(resolve('Mercadona', text)).toMatchObject({ status: 'matched', foodTypeKey: food })
    }
    expect(APPROVED.filter((r) => r.text_key === 'c 0 0 tostada p 6')).toHaveLength(1)
    expect(APPROVED.filter((r) => r.text_key === 'papel higienico 4 ca')).toHaveLength(1)
  })
})

describe('contrato con la RPC (resultados reales de la base de datos, tal cual)', () => {
  it.each([
    ['Mercadona', 'LECHE SEMI P-6', 'matched', 'mercadona', 'leche semi p 6', 'food.lacteos_huevos', 'shared', null],
    ['Charter', 'SUP.BEBIDA FRÍA', 'ambiguous', 'charter', 'sup bebida fria', null, null, null],
    ['Mercadona', 'PARKING', 'not_found', 'mercadona', 'parking', null, null, null],
    ['Repsol', 'BERENJENA', 'chain_not_learnable', 'repsol', null, null, null, null],
    ['Consum', 'RUFFLES JAMÓN 150 G', 'chain_unresolved', null, null, null, null, 'unknown'],
    ['Mercadona', 'jennifer@example.com', 'invalid', 'mercadona', null, null, null, 'email,url'],
    ['Mercadona', '600 123 456 789', 'invalid', 'mercadona', null, null, null, 'long_number,no_letters'],
    ['Charter', 'CERVEZA MAHOU TOS', 'not_found', 'charter', 'cerveza mahou tos', null, null, null],
    ['COFIDIS AMAZON-CORNELLA DE L', 'BERENJENA', 'chain_unresolved', null, null, null, null, 'unknown'],
  ])('%s + %s', (store, text, status, chainKey, textKey, foodTypeKey, source, reason) => {
    expect(resolve(store, text)).toEqual({ status, chainKey, textKey, foodTypeKey, source, reason })
  })
})

describe('el módulo es puro', () => {
  it('solo expone el resolutor', async () => {
    const mod = (await import('./sharedLearning')) as Record<string, unknown>
    expect(Object.keys(mod)).toEqual(['resolveSharedProductClass'])
  })
})
