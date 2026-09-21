import { describe, expect, it } from 'vitest'
import { productTextKey } from './productText'
import { resolveStoreChain, type StoreChainAliasRow, type StoreChainKind, type StoreChainRow } from './storeChains'
import { classifyTicketLine, isProductLine, NON_PRODUCT_RULES, partitionTicketLines } from './ticketLines'

const FILES = import.meta.glob(
  ['/supabase/migrations/0142_store_chains.sql', '/supabase/migrations/0143_shared_product_learning.sql', '/src/domain/ticketLines.ts', '/supabase/functions/mercadona-ticket-webhook/ticketLines.ts'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>
const CHAINS_SQL = FILES['/supabase/migrations/0142_store_chains.sql']
const CHAINS: StoreChainRow[] = [...CHAINS_SQL.matchAll(/\(\s*'([a-z0-9_]+)',\s*'((?:[^']|'')*)',\s*'(supermarket|marketplace|fuel_retail|local_shop)',\s*(true|false)/g)].map((m) => ({ key: m[1], name: m[2], kind: m[3] as StoreChainKind, learnable: m[4] === 'true', status: 'active' as const }))
const ALIASES: StoreChainAliasRow[] = [...CHAINS_SQL.matchAll(/\(\s*'([a-z0-9_]+)',\s*'([a-z0-9 ]+)',\s*'(exact|word_prefix)',/g)].map((m) => ({ chain_key: m[1], alias_norm: m[2], match_mode: m[3] as 'exact' | 'word_prefix' }))

const NON_PRODUCT = 'non_product'

describe('regla mínima: Mercadona + PARKING → no es un producto', () => {
  it('Mercadona + PARKING', () => {
    expect(classifyTicketLine('Mercadona', 'PARKING')).toMatchObject({ kind: NON_PRODUCT, ruleId: 'mercadona.parking' })
    expect(isProductLine('Mercadona', 'PARKING')).toBe(false)
  })

  it.each([' parking ', 'Parking', 'parking', 'PARKING.', '  PARKING  ', 'PÁRKING', 'PARKING ', 'PARKING\t'])('Mercadona + «%s» → misma decisión tras normalizar', (text) => {
    expect(isProductLine('Mercadona', text)).toBe(false)
  })

  it.each(['MERCADONA ALMORADI-ALMORADI', 'MERCADONA CALLOSA DEL SEG-ALMAJAL (CAMI', 'mercadona', 'MERCADONA, S.A.', ' Mercadona '])('tienda «%s» → es Mercadona', (store) => {
    expect(isProductLine(store, 'PARKING')).toBe(false)
  })

  it('la decisión dice por qué (para avisar al usuario)', () => {
    expect(classifyTicketLine('Mercadona', 'PARKING').reason).toMatch(/aparcamiento de Mercadona/)
    expect(classifyTicketLine('Mercadona', 'LECHE').reason).toBeNull()
  })
})

describe('todo lo demás es un producto', () => {
  it('Mercadona + otro producto real → product', () => {
    for (const text of ['LECHE SEMI P-6', 'BERENJENA', 'HIELO CUBITO 2KG', 'TIBURON', 'BOLSA PLASTICO', 'C 0,0 TOSTADA P-6']) {
      expect(classifyTicketLine('Mercadona', text), text).toMatchObject({ kind: 'product', ruleId: null })
    }
  })

  it('otra cadena + PARKING → NO se asume no-producto (sin evidencia específica)', () => {
    for (const store of ['Aldi', 'Hiperber', 'Charter', 'Repsol', 'Amazon', 'MACRO ASIA', 'E.S. POLIGONO LAS MAROMAS', 'Consum', 'Lidl', 'Carrefour', 'Parking Centro', 'SUPER MERCADONA', 'Mercadonas']) {
      expect(isProductLine(store, 'PARKING'), store).toBe(true)
    }
  })

  it('COFIDIS AMAZON u otras tiendas parecidas no activan la regla', () => {
    expect(isProductLine('COFIDIS AMAZON-CORNELLA DE L', 'PARKING')).toBe(true)
  })

  it('sin tienda o sin texto: nunca se descarta nada', () => {
    expect(isProductLine(null, 'PARKING')).toBe(true)
    expect(isProductLine(undefined, 'PARKING')).toBe(true)
    expect(isProductLine('', 'PARKING')).toBe(true)
    expect(isProductLine('   ', 'PARKING')).toBe(true)
    expect(isProductLine('Mercadona', null)).toBe(true)
    expect(isProductLine('Mercadona', '')).toBe(true)
    expect(isProductLine('Mercadona', '   ')).toBe(true)
  })

  it('Charter + SUP.BEBIDA FRÍA → product (la ambigüedad de clase no es una línea no-producto)', () => {
    expect(classifyTicketLine('Charter', 'SUP.BEBIDA FRÍA')).toMatchObject({ kind: 'product' })
    expect(classifyTicketLine('Charter', 'sup bebida fria')).toMatchObject({ kind: 'product' })
  })

  it('VELA CIFRA 0 y VELA CIFRA 4 → product', () => {
    expect(isProductLine('Mercadona', 'VELA CIFRA 0')).toBe(true)
    expect(isProductLine('Mercadona', 'VELA CIFRA 4')).toBe(true)
  })

  it('los textos con números no se descartan por tenerlos', () => {
    for (const text of ['PARKING 0', 'PARKING 2H', 'PARKING 1', '0', '4', '100% INTEGRAL', 'AGUA 1,5L', 'PACK 12 X 33 CL', 'BOLSA CM A.48X60', 'NEVAL 330ML', '12345678']) {
      expect(isProductLine('Mercadona', text), text).toBe(true)
    }
  })

  it('solo el texto EXACTO: variantes de PARKING con más palabras o letras sueltas siguen siendo productos', () => {
    for (const text of ['PARKING GRATIS', 'TARJETA PARKING', 'PARKINGS', 'P A R K I N G', 'PARK', 'PARKING-2']) {
      expect(isProductLine('Mercadona', text), text).toBe(true)
    }
  })

  it('nombres de tienda con otros alfabetos o emojis: no se adivina, se conserva la línea', () => {
    expect(isProductLine('中国 mercadona', 'PARKING')).toBe(true)
    expect(isProductLine('Mercadona 🛒', 'PARKING')).toBe(true)
  })
})

describe('partitionTicketLines: filtrar ANTES de persistir, sin perder nada más', () => {
  const ticket = [
    { name: 'LECHE SEMI P-6', price: 5.4 },
    { name: 'PARKING', price: 0 },
    { name: 'VELA CIFRA 0', price: 1.2 },
    { name: ' parking ', price: 0 },
    { name: 'BERENJENA', price: 1.22 },
  ]

  it('separa los productos de las líneas descartadas, conservando el orden y los datos', () => {
    const { products, skipped } = partitionTicketLines('Mercadona', ticket)
    expect(products.map((l) => l.name)).toEqual(['LECHE SEMI P-6', 'VELA CIFRA 0', 'BERENJENA'])
    expect(skipped.map((s) => s.line.name)).toEqual(['PARKING', ' parking '])
    expect(skipped.every((s) => s.ruleId === 'mercadona.parking' && s.reason.length > 0)).toBe(true)
    // el importe de lo descartado es 0: el total del ticket no cambia
    expect(products.reduce((a, l) => a + l.price, 0)).toBeCloseTo(ticket.reduce((a, l) => a + l.price, 0), 10)
  })

  it('idempotente: volver a procesar el mismo ticket (o lo ya filtrado) da lo mismo y no falla', () => {
    const once = partitionTicketLines('Mercadona', ticket)
    const twice = partitionTicketLines('Mercadona', once.products)
    expect(twice.products).toEqual(once.products)
    expect(twice.skipped).toEqual([])
    expect(partitionTicketLines('Mercadona', ticket)).toEqual(once)
  })

  it('un ticket solo con líneas descartadas, o vacío, no rompe', () => {
    expect(partitionTicketLines('Mercadona', [{ name: 'PARKING' }])).toEqual({ products: [], skipped: [expect.objectContaining({ ruleId: 'mercadona.parking' })] })
    expect(partitionTicketLines('Mercadona', [])).toEqual({ products: [], skipped: [] })
  })

  it('en otra cadena el mismo ticket no pierde ninguna línea', () => {
    expect(partitionTicketLines('Aldi', ticket).products).toHaveLength(5)
    expect(partitionTicketLines(null, ticket).products).toHaveLength(5)
  })
})

describe('arquitectura extensible con reglas verificadas', () => {
  it('hoy solo hay reglas confirmadas con datos reales: una, con su evidencia', () => {
    expect(NON_PRODUCT_RULES.map((r) => r.id)).toEqual(['mercadona.parking'])
    for (const rule of NON_PRODUCT_RULES) {
      expect(rule.evidence.length, rule.id).toBeGreaterThan(30)
      expect(rule.reason.length, rule.id).toBeGreaterThan(10)
      expect(rule.textKeys.length, rule.id).toBeGreaterThan(0)
      // textos ya normalizados (text_key) y sin números: no se descarta nada por llevar números
      for (const key of rule.textKeys) {
        expect(productTextKey(key), key).toBe(key)
        expect(key, key).not.toMatch(/\d/)
      }
    }
  })

  it('cada regla está atada a una cadena registrada y a alias que existen tal cual en store_chain_aliases', () => {
    for (const rule of NON_PRODUCT_RULES) {
      expect(CHAINS.some((c) => c.key === rule.chain), rule.chain).toBe(true)
      for (const a of rule.storeAliases) {
        expect(ALIASES.some((x) => x.chain_key === rule.chain && x.alias_norm === a.alias && x.match_mode === a.mode), a.alias).toBe(true)
      }
    }
  })

  it('no hay reglas globales: ninguna regla se aplica sin cadena', () => {
    for (const rule of NON_PRODUCT_RULES) expect(rule.storeAliases.length, rule.id).toBeGreaterThan(0)
    expect(isProductLine(null, 'PARKING')).toBe(true)
  })

  it('no hay reglas para descuentos, subtotales ni envases hasta que haya datos reales', () => {
    for (const text of ['DESCUENTO', 'SUBTOTAL', 'TOTAL', 'PROMOCION', 'ENVASE', 'DEPOSITO', 'BOLSA PLASTICO', 'REDONDEO']) {
      expect(isProductLine('Mercadona', text), text).toBe(true)
    }
  })
})

describe('coherencia con el resto del sistema (mismas normalizaciones, sin duplicar criterios distintos)', () => {
  const TEXTS = ['PARKING', ' parking ', 'PÁRKING', 'Parking.', 'PARKING 2H', 'P-ARKING', 'parking\n', 'ＰＡＲＫＩＮＧ', 'parking²', '', ' ', 'LECHE', '0', 'VELA CIFRA 0', 'PARKING ']
  const STORES = ['Mercadona', 'MERCADONA ALMORADI-ALMORADI', 'mercadona ', 'MERCADONA, S.A.', 'Mercadonas', 'SUPER MERCADONA', 'Aldi', 'Hiperber', 'Charter', 'Amazon', 'COFIDIS AMAZON-CORNELLA DE L', '', '   ', '中国 mercadona']

  it('el texto se normaliza como productTextKey', () => {
    for (const text of TEXTS) {
      const isParking = productTextKey(text) === 'parking'
      expect(isProductLine('Mercadona', text), JSON.stringify(text)).toBe(!isParking)
    }
  })

  it('la tienda se reconoce igual que resolveStoreChain con los alias reales de la base de datos', () => {
    for (const store of STORES) {
      const resolved = resolveStoreChain(store, CHAINS, ALIASES)
      const isMercadona = resolved.status === 'resolved' && resolved.chainKey === 'mercadona'
      expect(isProductLine(store, 'PARKING'), JSON.stringify(store)).toBe(!isMercadona)
    }
  })

  it('el aprendizaje compartido NO contiene PARKING (la decisión es del extractor, no del clasificador)', () => {
    expect(FILES['/supabase/migrations/0143_shared_product_learning.sql']).not.toMatch(/'parking'/i)
  })

  it('la copia del webhook es IDÉNTICA al original (mismo código en el cliente y en el servidor)', () => {
    expect(FILES['/supabase/functions/mercadona-ticket-webhook/ticketLines.ts']).toBe(FILES['/src/domain/ticketLines.ts'])
  })

  it('el módulo es autocontenido (sin imports) para poder copiarlo al servidor', () => {
    expect(FILES['/src/domain/ticketLines.ts']).not.toMatch(/^import /m)
  })
})
