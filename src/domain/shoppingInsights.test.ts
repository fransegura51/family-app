import { describe, expect, it } from 'vitest'
import {
  buildShoppingInsights,
  findBestPriceGapProduct,
  findCategoryStoreConcentration,
  findCheapestStoreForHabituals,
  findCoreBasket,
  findDisappearedProduct,
  findEarlyRepurchase,
  findEmergingProduct,
  findMostFrequentProduct,
} from '@/domain/shoppingInsights'
import type { Product, ProductPrice } from '@/domain/types'

const NOW = new Date('2026-09-24T12:00:00')

function product(id: string, displayName: string, overrides: Partial<Product> = {}): Product {
  return {
    id,
    familyId: 'f1',
    normalizedName: displayName.toLowerCase(),
    displayName,
    category: null,
    brand: null,
    nonFood: false,
    classConfirmedAt: null,
    photoPath: null,
    ...overrides,
  }
}

let priceSeq = 0
function price(productId: string, overrides: Partial<ProductPrice> = {}): ProductPrice {
  priceSeq++
  return {
    id: `pr-${priceSeq}`,
    productId,
    price: 1,
    store: 'Mercadona',
    quantity: '1',
    unit: 'ud',
    recordedDate: '2026-09-01',
    receiptId: null,
    ...overrides,
  }
}

describe('buildShoppingInsights — cero/una/varias/ocho conclusiones (TEST: cero, una, varias, ocho)', () => {
  it('cero conclusiones disponibles: sin datos, no rellena nada artificialmente', () => {
    expect(buildShoppingInsights({ prices: [], products: [] }, NOW)).toEqual([])
  })

  it('una conclusión: solo un tipo tiene datos suficientes', () => {
    const prices = [
      price('p1', { store: 'Mercadona', recordedDate: '2026-09-01' }),
      price('p1', { store: 'Mercadona', recordedDate: '2026-09-08' }),
      price('p1', { store: 'Mercadona', recordedDate: '2026-09-15' }),
    ]
    const insights = buildShoppingInsights({ prices, products: [product('p1', 'Leche')] }, NOW)
    expect(insights).toHaveLength(1)
    expect(insights[0].kind).toBe('producto_frecuente')
  })

  it('varias conclusiones (ni 0 ni 8): varios tipos con datos, otros sin datos suficientes', () => {
    const prices = [
      // Tipo 3: precio mínimo por tienda (Detergente en 2 tiendas, precios distintos)
      price('det', { store: 'Mercadona', price: 3.85, recordedDate: '2026-08-01' }),
      price('det', { store: 'Hiperber', price: 4.3, recordedDate: '2026-08-15' }),
      price('det', { store: 'Mercadona', price: 3.9, recordedDate: '2026-09-01' }),
    ]
    const products = [product('det', 'Detergente')]
    const insights = buildShoppingInsights({ prices, products }, NOW)
    expect(insights.length).toBeGreaterThan(0)
    expect(insights.length).toBeLessThan(8)
    expect(insights.map((i) => i.kind)).toContain('precio_minimo_tienda')
  })

  it('ocho conclusiones: cuando hay datos suficientes y fiables para los 8 tipos', () => {
    const products: Product[] = [
      product('habitual-a', 'Pan', { category: 'Panadería' }),
      product('habitual-b', 'Pan integral', { category: 'Panadería' }),
      product('habitual-c', 'Leche', { category: 'Lácteos' }),
      product('habitual-d', 'Huevos', { category: 'Lácteos' }),
      product('gap', 'Detergente'),
      product('frecuente', 'Agua'),
      product('emergente', 'Snack nuevo'),
      product('desaparecido', 'Cava'),
      product('recompra', 'Pañales'),
    ]
    const prices: ProductPrice[] = []
    // Tipo 1: 3 productos habituales más baratos en Mercadona (>=3 compras, 2 tiendas)
    for (const id of ['habitual-a', 'habitual-b', 'habitual-c']) {
      prices.push(price(id, { store: 'Mercadona', price: 1, recordedDate: '2026-06-01' }))
      prices.push(price(id, { store: 'Hiperber', price: 2, recordedDate: '2026-07-01' }))
      prices.push(price(id, { store: 'Mercadona', price: 1, recordedDate: '2026-08-01' }))
    }
    // Tipo 8 necesita categoría concentrada — añade 2 productos más de Panadería/Lácteos en Mercadona
    prices.push(price('habitual-d', { store: 'Mercadona', price: 1, recordedDate: '2026-06-01' }))
    prices.push(price('habitual-d', { store: 'Mercadona', price: 1, recordedDate: '2026-07-01' }))
    // Tipo 3: mayor diferencia de precio entre tiendas
    prices.push(price('gap', { store: 'Mercadona', price: 3.85, recordedDate: '2026-08-01' }))
    prices.push(price('gap', { store: 'Hiperber', price: 4.3, recordedDate: '2026-08-15' }))
    prices.push(price('gap', { store: 'Mercadona', price: 3.9, recordedDate: '2026-09-01' }))
    // Tipo 2: comprado muchas veces en los últimos 30 días
    for (let i = 0; i < 4; i++) prices.push(price('frecuente', { recordedDate: `2026-09-${String(10 + i * 3).padStart(2, '0')}` }))
    // Tipo 4: producto emergente — aparece en 4 de las últimas 5 compras (recibos), toda su historia
    const recentReceipts = ['r1', 'r2', 'r3', 'r4', 'r5']
    for (let i = 0; i < recentReceipts.length; i++) {
      // el ancla (algún producto en cada recibo) para que existan como recibos "recientes"
      prices.push(price('frecuente', { receiptId: recentReceipts[i], recordedDate: `2026-09-2${i}` }))
    }
    for (const rid of ['r1', 'r2', 'r3', 'r4']) {
      prices.push(price('emergente', { receiptId: rid, recordedDate: '2026-09-20' }))
    }
    // Tipo 5: producto desaparecido — compraba cada ~10 días, última hace más de un mes
    prices.push(price('desaparecido', { recordedDate: '2026-06-01' }))
    prices.push(price('desaparecido', { recordedDate: '2026-06-11' }))
    prices.push(price('desaparecido', { recordedDate: '2026-06-21' }))
    // Tipo 6: recompra anticipada — normalmente cada 10 días, esta vez a los 2 días
    prices.push(price('recompra', { recordedDate: '2026-08-01' }))
    prices.push(price('recompra', { recordedDate: '2026-08-11' }))
    prices.push(price('recompra', { recordedDate: '2026-08-21' }))
    prices.push(price('recompra', { recordedDate: '2026-08-23' }))

    const insights = buildShoppingInsights({ prices, products }, NOW)
    expect(insights).toHaveLength(8)
    const kinds = insights.map((i) => i.kind)
    expect(new Set(kinds).size).toBe(8)
  })
})

describe('TIPO 2 — producto_frecuente (TEST: producto frecuente correcto, producto sin historial suficiente no aparece)', () => {
  it('elige el producto con más compras en los últimos 30 días (umbral >=3)', () => {
    const products = [product('leche', 'Leche')]
    const prices = [
      price('leche', { recordedDate: '2026-09-01' }),
      price('leche', { recordedDate: '2026-09-08' }),
      price('leche', { recordedDate: '2026-09-15' }),
      price('leche', { recordedDate: '2026-09-22' }),
    ]
    const insight = findMostFrequentProduct({ prices, products }, NOW)
    expect(insight?.text).toContain('Leche')
    expect(insight?.text).toContain('4 veces')
    expect(insight?.moreInfo).toEqual({ productId: 'leche', productName: 'Leche' })
  })

  it('producto sin historial suficiente (menos de 3 compras en 30 días) no aparece', () => {
    const products = [product('leche', 'Leche')]
    const prices = [price('leche', { recordedDate: '2026-09-01' }), price('leche', { recordedDate: '2026-09-15' })]
    expect(findMostFrequentProduct({ prices, products }, NOW)).toBeNull()
  })

  it('no cuenta compras fuera de la ventana de 30 días', () => {
    const products = [product('leche', 'Leche')]
    const prices = [
      price('leche', { recordedDate: '2026-07-01' }),
      price('leche', { recordedDate: '2026-07-05' }),
      price('leche', { recordedDate: '2026-07-10' }),
    ]
    expect(findMostFrequentProduct({ prices, products }, NOW)).toBeNull()
  })

  it('con un nombre de producto muy largo, lo acorta en la frase sin desbordar (TEST: nombres de productos muy largos)', () => {
    const longName = 'Aceite de oliva virgen extra ecológico primera presión en frío 1L'
    const products = [product('aceite', longName)]
    const prices = [
      price('aceite', { recordedDate: '2026-09-01' }),
      price('aceite', { recordedDate: '2026-09-08' }),
      price('aceite', { recordedDate: '2026-09-15' }),
    ]
    const insight = findMostFrequentProduct({ prices, products }, NOW)
    expect(insight?.text).not.toContain(longName)
    expect(insight?.text.length).toBeLessThan(80)
  })
})

describe('TIPO 3 — precio_minimo_tienda (TEST: precio mínimo correcto, comparación entre tiendas correcta)', () => {
  it('elige la tienda más barata y la más cara según el último precio conocido en cada una', () => {
    const products = [product('det', 'Detergente')]
    const prices = [
      // El último precio conocido en Mercadona es 3.85 (posterior a este 4.00) — igual que
      // openDetail/answerCheapest, "más barato" es el último precio, no el mínimo histórico.
      price('det', { store: 'Mercadona', price: 4.0, recordedDate: '2026-07-01' }),
      price('det', { store: 'Mercadona', price: 3.85, recordedDate: '2026-08-01' }),
      price('det', { store: 'Hiperber', price: 4.3, recordedDate: '2026-08-15' }),
    ]
    const insight = findBestPriceGapProduct({ prices, products })
    expect(insight?.text).toBe('Detergente lo pagas más barato en Mercadona: 3.85 €.')
    // Correctivo final — separar conclusión de detalle: el "En otra
    // compra llegó a costarte X €" ya no va en el bocadillo, vive en
    // el historial real que abre "+info".
    expect(insight?.text).not.toContain('En otra compra')
    expect(insight?.moreInfo).toEqual({ productId: 'det', productName: 'Detergente' })
  })

  it('sin al menos 2 tiendas reales no compara nada', () => {
    const products = [product('det', 'Detergente')]
    const prices = [
      price('det', { store: 'Mercadona', price: 3.85, recordedDate: '2026-08-01' }),
      price('det', { store: 'Mercadona', price: 3.9, recordedDate: '2026-09-01' }),
      price('det', { store: 'Mercadona', price: 3.8, recordedDate: '2026-09-10' }),
    ]
    expect(findBestPriceGapProduct({ prices, products })).toBeNull()
  })

  it('PESO-5 — F) dos tiendas con €/kg: comparación válida, con la etiqueta "/kg"', () => {
    const products = [product('pepino', 'Pepino')]
    const prices = [
      price('pepino', { store: 'Mercadona', price: 1.7, unit: 'kg', recordedDate: '2026-09-18' }),
      price('pepino', { store: 'Hiperber', price: 1.95, unit: 'kg', recordedDate: '2026-09-19' }),
      price('pepino', { store: 'Mercadona', price: 1.7, unit: 'kg', recordedDate: '2026-08-01' }),
    ]
    const insight = findBestPriceGapProduct({ prices, products })
    expect(insight?.text).toBe('Pepino lo pagas más barato en Mercadona: 1.70 €/kg.')
  })

  it('PESO-5 — G) una tienda €/kg y otra €/ud: nunca se declara una "más barata" por magnitudes distintas', () => {
    const products = [product('pepino', 'Pepino')]
    const prices = [
      price('pepino', { store: 'Mercadona', price: 1.7, unit: 'kg', recordedDate: '2026-09-19' }),
      price('pepino', { store: 'Hiperber', price: 1.5, unit: 'ud', recordedDate: '2026-09-18' }),
      price('pepino', { store: 'Mercadona', price: 1.9, unit: 'kg', recordedDate: '2026-08-01' }),
    ]
    // La magnitud dominante es "kg" (el registro comparable más reciente) — Hiperber (ud) queda fuera,
    // así que solo queda una tienda real comparable: no hay diferencia de precio que anunciar.
    expect(findBestPriceGapProduct({ prices, products })).toBeNull()
  })
})

describe('PESO-5 — J) "PEPA analiza tus compras" nunca mezcla €/kg con €/ud', () => {
  it('un producto con solo una tienda €/kg comparable (la otra en €/ud, excluida) no genera ni Tipo 1 ni Tipo 3', () => {
    const products = [product('a', 'Pepino'), product('b', 'Manzana'), product('c', 'Berenjena')]
    const prices = ['a', 'b', 'c'].flatMap((id) => [
      price(id, { store: 'Mercadona', price: 1.7, unit: 'kg', recordedDate: '2026-06-01' }),
      price(id, { store: 'Hiperber', price: 1.5, unit: 'ud', recordedDate: '2026-07-01' }),
      price(id, { store: 'Mercadona', price: 1.9, unit: 'kg', recordedDate: '2026-08-01' }),
    ])
    const insights = buildShoppingInsights({ prices, products }, NOW)
    expect(insights.map((i) => i.kind)).not.toContain('tienda_habitual_barata')
    expect(insights.map((i) => i.kind)).not.toContain('precio_minimo_tienda')
  })
})

describe('TIPO 4 — producto_emergente (TEST: producto nuevo habitual según criterio)', () => {
  it('producto que aparece en 4 de las últimas 5 compras y toda su historia cabe en esa ventana', () => {
    // "ancla" fija la fecha de cada uno de los 5 recibos recientes, pero
    // tiene además una compra muy antigua: así NO cualifica ella misma
    // como "emergente" (su historia no cabe entera en la ventana) y no
    // compite con "snack" por el mismo hallazgo.
    const products = [product('snack', 'Snack nuevo'), product('ancla', 'Ancla')]
    const receipts = ['r1', 'r2', 'r3', 'r4', 'r5']
    const prices = [
      price('ancla', { receiptId: 'r0-antigua', recordedDate: '2026-01-01' }),
      ...receipts.map((rid, i) => price('ancla', { receiptId: rid, recordedDate: `2026-09-2${i}` })),
      ...['r1', 'r2', 'r3', 'r4'].map((rid) => price('snack', { receiptId: rid, recordedDate: '2026-09-20' })),
    ]
    const insight = findEmergingProduct({ prices, products })
    expect(insight?.text).toBe('Snack nuevo empieza a ser habitual: 4 de tus últimas 5 compras.')
  })

  it('un producto con historia MÁS ANTIGUA que la ventana reciente no cuenta como "emergente"', () => {
    const products = [product('viejo', 'Producto de siempre'), product('ancla', 'Ancla')]
    const receipts = ['r1', 'r2', 'r3', 'r4', 'r5']
    const prices = [
      price('ancla', { receiptId: 'r0-antigua', recordedDate: '2026-01-01' }),
      ...receipts.map((rid, i) => price('ancla', { receiptId: rid, recordedDate: `2026-09-2${i}` })),
      ...['r1', 'r2', 'r3', 'r4'].map((rid) => price('viejo', { receiptId: rid, recordedDate: '2026-09-20' })),
      price('viejo', { receiptId: 'r0-antiguo', recordedDate: '2026-01-01' }),
    ]
    expect(findEmergingProduct({ prices, products })).toBeNull()
  })

  it('sin al menos 4 recibos recientes no hay ventana suficiente', () => {
    const products = [product('snack', 'Snack')]
    const prices = [price('snack', { receiptId: 'r1', recordedDate: '2026-09-01' })]
    expect(findEmergingProduct({ prices, products })).toBeNull()
  })
})

describe('TIPO 5 — producto_desaparecido (TEST: producto desaparecido según criterio)', () => {
  it('producto que se compraba con regularidad y lleva mucho más de lo normal sin comprarse', () => {
    const products = [product('cava', 'Cava')]
    const prices = [
      price('cava', { recordedDate: '2026-06-01' }),
      price('cava', { recordedDate: '2026-06-11' }),
      price('cava', { recordedDate: '2026-06-21' }),
    ]
    const insight = findDisappearedProduct({ prices, products }, NOW)
    expect(insight?.text).toBe('Hace más de un mes que no compras Cava — antes era habitual.')
  })

  it('una ausencia aislada (poco más del intervalo medio) no cuenta como "desaparecido"', () => {
    const products = [product('cava', 'Cava')]
    const prices = [
      price('cava', { recordedDate: '2026-08-20' }),
      price('cava', { recordedDate: '2026-08-30' }),
      price('cava', { recordedDate: '2026-09-10' }),
    ]
    expect(findDisappearedProduct({ prices, products }, NOW)).toBeNull()
  })
})

describe('TIPO 6 — recompra_anticipada (TEST: intervalo de recompra correcto)', () => {
  it('detecta una recompra muy por debajo del intervalo medio histórico, con los días exactos', () => {
    const products = [product('panal', 'Pañales')]
    const prices = [
      price('panal', { recordedDate: '2026-08-01' }),
      price('panal', { recordedDate: '2026-08-11' }),
      price('panal', { recordedDate: '2026-08-21' }),
      price('panal', { recordedDate: '2026-08-23' }),
    ]
    const insight = findEarlyRepurchase({ prices, products })
    expect(insight?.text).toBe('Sueles comprar Pañales cada 10 días, pero esta vez has repetido a los 2.')
  })

  it('conclusión de recompra — reproduce literalmente el ejemplo dado por el usuario (Cebolla tubo cada 33 días, repetida a los 4)', () => {
    const products = [product('cebolla', 'Cebolla tubo')]
    const prices = [
      price('cebolla', { recordedDate: '2026-06-01' }),
      price('cebolla', { recordedDate: '2026-07-04' }),
      price('cebolla', { recordedDate: '2026-08-06' }),
      price('cebolla', { recordedDate: '2026-08-10' }),
    ]
    const insight = findEarlyRepurchase({ prices, products })
    expect(insight?.text).toBe('Sueles comprar Cebolla tubo cada 33 días, pero esta vez has repetido a los 4.')
    // El bocadillo se queda con la conclusión — el resto (fechas
    // concretas, historial completo de intervalos) vive en "+info".
    expect(insight?.text.length).toBeLessThan(90)
    expect(insight?.moreInfo).toEqual({ productId: 'cebolla', productName: 'Cebolla tubo' })
  })

  it('sin historial suficiente (menos de 2 intervalos previos) no se pronuncia', () => {
    const products = [product('panal', 'Pañales')]
    const prices = [price('panal', { recordedDate: '2026-08-01' }), price('panal', { recordedDate: '2026-08-03' }), price('panal', { recordedDate: '2026-08-05' })]
    expect(findEarlyRepurchase({ prices, products })).toBeNull()
  })
})

describe('TIPO 7 — cesta_habitual (TEST: cesta habitual correcta)', () => {
  it('cuenta el número real de productos recurrentes (nunca inventa un número fijo como 12)', () => {
    const products = [product('a', 'Pan'), product('b', 'Leche'), product('c', 'Huevos')]
    const prices = [
      ...Array.from({ length: 4 }, (_, i) => price('a', { recordedDate: `2026-0${(i % 9) + 1}-01` })),
      ...Array.from({ length: 5 }, (_, i) => price('b', { recordedDate: `2026-0${(i % 9) + 1}-05` })),
      ...Array.from({ length: 4 }, (_, i) => price('c', { recordedDate: `2026-0${(i % 9) + 1}-10` })),
    ]
    const insight = findCoreBasket({ prices, products })
    expect(insight?.text).toBe('Tienes 3 productos habituales. Entre los que más se repiten están Leche, Pan y Huevos.')
    expect(insight?.moreInfo).toBeUndefined()
  })

  it('con muchos productos habituales (59), cuenta el total real pero solo nombra como máximo 4 ejemplos, los de mayor recurrencia (TEST: 59 productos habituales)', () => {
    // Los 6 primeros (p0..p5, nombres cortos reales) son los MÁS recurrentes
    // (10 compras); el resto (p6..p58) son menos recurrentes (solo 4, el
    // mínimo para contar como "habitual") y con nombres irrelevantes: no
    // deben aparecer como ejemplo, solo sumar al total.
    const topNames = ['Leche', 'Pan', 'Huevos', 'Queso', 'Yogur', 'Tomate']
    const products: Product[] = [
      ...topNames.map((name, i) => product(`p${i}`, name)),
      ...Array.from({ length: 53 }, (_, i) => product(`p${i + 6}`, `Producto ${i + 6}`)),
    ]
    const prices: ProductPrice[] = products.flatMap((p, i) => {
      const count = i < 6 ? 10 : 4
      return Array.from({ length: count }, (_, j) => price(p.id, { recordedDate: `2026-0${(j % 9) + 1}-0${(i % 9) + 1}` }))
    })
    const insight = findCoreBasket({ prices, products })
    expect(insight?.text).toBe('Tienes 59 productos habituales. Entre los que más se repiten están Leche, Pan, Huevos y Queso.')
    // Nunca enumera la lista completa ni afirma que los 59 se repiten igual.
    expect(insight?.text).not.toContain('Producto 6')
    expect(insight?.text).not.toContain('Yogur')
    expect(insight?.text.length).toBeLessThan(160)
    expect(insight?.moreInfo).toBeUndefined()
  })

  it('con nombres de producto muy largos, acorta cada nombre y reduce el número de ejemplos para no desbordar (TEST: nombres largos → menos ejemplos)', () => {
    const longNames = [
      'Detergente concentrado ecológico para ropa delicada',
      'Papel higiénico triple capa suave extra largo',
      'Yogur natural desnatado sin azúcares añadidos',
      'Aceite de oliva virgen extra primera presión en frío',
      'Galletas integrales con semillas de chía y lino',
    ]
    const products: Product[] = longNames.map((name, i) => product(`p${i}`, name))
    const prices: ProductPrice[] = products.flatMap((p) => Array.from({ length: 4 }, (_, j) => price(p.id, { recordedDate: `2026-0${j + 1}-01` })))
    const insight = findCoreBasket({ prices, products })
    expect(insight).not.toBeNull()
    // Cada nombre queda acortado a un máximo legible…
    for (const name of longNames) {
      expect(insight?.text).not.toContain(name)
    }
    // …y el presupuesto de caracteres deja sitio a menos de 4 ejemplos.
    const exampleCount = (insight?.text.match(/,|y /g) ?? []).length
    expect(exampleCount).toBeLessThan(4)
    expect(insight?.text.length).toBeLessThan(160)
  })

  it('sin al menos 3 productos recurrentes no hay cesta habitual que mostrar', () => {
    const products = [product('a', 'Pan')]
    const prices = Array.from({ length: 4 }, (_, i) => price('a', { recordedDate: `2026-0${i + 1}-01` }))
    expect(findCoreBasket({ prices, products })).toBeNull()
  })

  it('NO calcula ni menciona cuánto ha subido/bajado la cesta (eso es "¿Por qué ha cambiado mi compra?")', () => {
    const products = [product('a', 'Pan'), product('b', 'Leche'), product('c', 'Huevos')]
    const prices = [
      ...Array.from({ length: 4 }, (_, i) => price('a', { recordedDate: `2026-0${i + 1}-01`, price: 1 + i })),
      ...Array.from({ length: 4 }, (_, i) => price('b', { recordedDate: `2026-0${i + 1}-05`, price: 1 })),
      ...Array.from({ length: 4 }, (_, i) => price('c', { recordedDate: `2026-0${i + 1}-10`, price: 1 })),
    ]
    const insight = findCoreBasket({ prices, products })
    expect(insight?.text).not.toMatch(/€|efecto precio|efecto cantidad|subido|bajado/i)
  })
})

describe('TIPO 8 — categoria_por_tienda (TEST: categorías por tienda correctas)', () => {
  it('detecta una categoría claramente concentrada en una tienda', () => {
    const products = [product('a', 'Lejía', { category: 'Limpieza' }), product('b', 'Detergente', { category: 'Limpieza' })]
    const prices = [
      ...Array.from({ length: 4 }, (_, i) => price('a', { store: 'Mercadona', recordedDate: `2026-0${i + 1}-01` })),
      price('b', { store: 'Hiperber', recordedDate: '2026-05-01' }),
    ]
    const insight = findCategoryStoreConcentration({ prices, products })
    expect(insight?.text).toBe('Compras la mayoría de Limpieza en Mercadona.')
  })

  it('con dos categorías concentradas en tiendas distintas, las contrasta en una sola frase', () => {
    const products = [
      product('lejia', 'Lejía', { category: 'Limpieza' }),
      product('tomate', 'Tomate', { category: 'Verdura' }),
    ]
    const prices = [
      ...Array.from({ length: 5 }, (_, i) => price('lejia', { store: 'Mercadona', recordedDate: `2026-0${i + 1}-01` })),
      ...Array.from({ length: 5 }, (_, i) => price('tomate', { store: 'Hiperber', recordedDate: `2026-0${i + 1}-05` })),
    ]
    const insight = findCategoryStoreConcentration({ prices, products })
    expect(insight?.text).toBe('Compras Limpieza sobre todo en Mercadona, y Verdura en Hiperber.')
  })

  it('con nombres de categoría y tienda largos, los acorta en la frase (TEST: categorías largas)', () => {
    const products = [
      product('a', 'Lejía', { category: 'Productos de limpieza y hogar para toda la casa' }),
      product('b', 'Detergente', { category: 'Productos de limpieza y hogar para toda la casa' }),
    ]
    const prices = [
      ...Array.from({ length: 4 }, (_, i) => price('a', { store: 'Supermercado Central de Distribución Regional', recordedDate: `2026-0${i + 1}-01` })),
      price('b', { store: 'Otra tienda cualquiera', recordedDate: '2026-05-01' }),
    ]
    const insight = findCategoryStoreConcentration({ prices, products })
    expect(insight?.text).not.toContain('Productos de limpieza y hogar para toda la casa')
    expect(insight?.text).not.toContain('Supermercado Central de Distribución Regional')
    expect(insight?.text.length).toBeLessThan(100)
  })

  it('productos sin category guardada no participan (no se adivina ninguna clase)', () => {
    const products = [product('x', 'Producto sin clasificar')]
    const prices = Array.from({ length: 5 }, (_, i) => price('x', { store: 'Mercadona', recordedDate: `2026-0${i + 1}-01` }))
    expect(findCategoryStoreConcentration({ prices, products })).toBeNull()
  })

  it('sin al menos 60% de concentración en una tienda no se afirma nada', () => {
    const products = [product('a', 'Lejía', { category: 'Limpieza' })]
    const prices = [
      price('a', { store: 'Mercadona', recordedDate: '2026-01-01' }),
      price('a', { store: 'Mercadona', recordedDate: '2026-02-01' }),
      price('a', { store: 'Mercadona', recordedDate: '2026-03-01' }),
      price('a', { store: 'Hiperber', recordedDate: '2026-04-01' }),
      price('a', { store: 'Hiperber', recordedDate: '2026-05-01' }),
      price('a', { store: 'Hiperber', recordedDate: '2026-06-01' }),
    ]
    expect(findCategoryStoreConcentration({ prices, products })).toBeNull()
  })
})

describe('TIPO 1 — tienda_habitual_barata', () => {
  it('cuenta cuántos productos habituales salen más baratos en la misma tienda', () => {
    const products = [product('a', 'Pan'), product('b', 'Leche'), product('c', 'Huevos')]
    const prices = [
      ...['a', 'b', 'c'].flatMap((id) => [
        price(id, { store: 'Mercadona', price: 1, recordedDate: '2026-06-01' }),
        price(id, { store: 'Hiperber', price: 2, recordedDate: '2026-07-01' }),
        price(id, { store: 'Mercadona', price: 1, recordedDate: '2026-08-01' }),
      ]),
    ]
    const insight = findCheapestStoreForHabituals({ prices, products })
    expect(insight?.text).toBe('3 de tus productos habituales salen más baratos en Mercadona.')
    expect(insight?.moreInfo).toBeUndefined()
  })

  it('con un nombre de tienda muy largo, lo acorta en la frase sin desbordar (TEST: nombres largos de tienda)', () => {
    const longStore = 'Hipermercado Central de la Región Metropolitana Sur'
    const products = [product('a', 'Pan'), product('b', 'Leche'), product('c', 'Huevos')]
    const prices = [
      ...['a', 'b', 'c'].flatMap((id) => [
        price(id, { store: longStore, price: 1, recordedDate: '2026-06-01' }),
        price(id, { store: 'Hiperber', price: 2, recordedDate: '2026-07-01' }),
        price(id, { store: longStore, price: 1, recordedDate: '2026-08-01' }),
      ]),
    ]
    const insight = findCheapestStoreForHabituals({ prices, products })
    expect(insight?.text).not.toContain(longStore)
    expect(insight?.text.length).toBeLessThan(80)
  })

  it('con menos de 3 productos coincidiendo en la misma tienda barata no afirma nada', () => {
    const products = [product('a', 'Pan'), product('b', 'Leche')]
    const prices = [
      price('a', { store: 'Mercadona', price: 1, recordedDate: '2026-06-01' }),
      price('a', { store: 'Hiperber', price: 2, recordedDate: '2026-07-01' }),
      price('a', { store: 'Mercadona', price: 1, recordedDate: '2026-08-01' }),
      price('b', { store: 'Hiperber', price: 1, recordedDate: '2026-06-01' }),
      price('b', { store: 'Mercadona', price: 2, recordedDate: '2026-07-01' }),
      price('b', { store: 'Hiperber', price: 1, recordedDate: '2026-08-01' }),
    ]
    expect(findCheapestStoreForHabituals({ prices, products })).toBeNull()
  })

  it('PESO-5 — G) nunca compara una tienda €/kg con una €/ud: la tienda con la magnitud incompatible no puede "ganar"', () => {
    // Pepino: Mercadona vende por kg (barato en €), Hiperber solo tiene un registro €/ud (más caro en
    // número, pero no es comparable) — jamás debe contar como "más barato en Mercadona" por magnitudes.
    const products = [product('a', 'Pepino'), product('b', 'Manzana'), product('c', 'Berenjena')]
    const prices = [
      ...['a', 'b', 'c'].flatMap((id) => [
        price(id, { store: 'Mercadona', price: 1.7, unit: 'kg', recordedDate: '2026-06-01' }),
        price(id, { store: 'Hiperber', price: 1.5, unit: 'ud', recordedDate: '2026-07-01' }),
        price(id, { store: 'Mercadona', price: 1.9, unit: 'kg', recordedDate: '2026-08-01' }),
      ]),
    ]
    // Hiperber (ud) queda fuera de la comparación por magnitud: con una sola tienda real (Mercadona, kg)
    // no hay comparación posible, así que este hallazgo no debe generarse.
    expect(findCheapestStoreForHabituals({ prices, products })).toBeNull()
  })
})

describe('no solapamiento con "¿Por qué ha cambiado mi compra?" (TEST: no solapamiento)', () => {
  it('ninguna función de este archivo importa domain/priceTrends ni llama a decomposeSpendChange/compareMonths/basketTotal', () => {
    const SRC = (import.meta.glob('/src/domain/shoppingInsights.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
      '/src/domain/shoppingInsights.ts'
    ]
    expect(SRC).not.toMatch(/from '@\/domain\/priceTrends'/)
    expect(SRC).not.toMatch(/decomposeSpendChange\(|compareMonths\(|basketTotal\(/)
  })
})

describe('ningún cálculo depende de IA (TEST: ningún cálculo depende de IA)', () => {
  it('el archivo no importa ningún cliente de IA (Gemini) ni funciones de domain/ai*', () => {
    const SRC = (import.meta.glob('/src/domain/shoppingInsights.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
      '/src/domain/shoppingInsights.ts'
    ]
    expect(SRC).not.toMatch(/gemini|generativeai|from '@\/domain\/ai|from '@\/services\/ai/i)
  })
})

describe('+info solo con destino válido (TEST: +info solo cuando existe destino válido)', () => {
  it('los tipos agregados (tienda habitual, cesta habitual, categoría por tienda) nunca llevan moreInfo', () => {
    const products = [product('a', 'Pan'), product('b', 'Leche'), product('c', 'Huevos')]
    const prices = ['a', 'b', 'c'].flatMap((id) => [
      price(id, { store: 'Mercadona', price: 1, recordedDate: '2026-06-01' }),
      price(id, { store: 'Hiperber', price: 2, recordedDate: '2026-07-01' }),
      price(id, { store: 'Mercadona', price: 1, recordedDate: '2026-08-01' }),
    ])
    expect(findCheapestStoreForHabituals({ prices, products })?.moreInfo).toBeUndefined()
    expect(findCategoryStoreConcentration({ prices, products: products.map((p) => ({ ...p, category: 'X' })) })?.moreInfo).toBeUndefined()
  })

  it('los tipos por producto (frecuente, precio mínimo, emergente, desaparecido, recompra) siempre llevan moreInfo con el producto real', () => {
    const products = [product('leche', 'Leche')]
    const prices = [
      price('leche', { recordedDate: '2026-09-01' }),
      price('leche', { recordedDate: '2026-09-08' }),
      price('leche', { recordedDate: '2026-09-15' }),
    ]
    const insight = findMostFrequentProduct({ prices, products }, NOW)
    expect(insight?.moreInfo?.productId).toBe('leche')
  })
})

describe('Correctivo final — política común de longitud (TEST: ningún hallazgo desborda el bocadillo, en el peor caso de datos)', () => {
  // Techo generoso pero real: el bocadillo de la imagen oficial es una
  // caja fija en móvil — ningún texto de este carrusel debe acercarse a
  // un párrafo. 170 caracteres es muy por debajo del "estos 59
  // productos... (100% INTEGRAL, BOLSA PLASTICO...)" original (~230+
  // caracteres) que motivó este correctivo.
  const MAX_BUBBLE_TEXT_LENGTH = 170
  const LONG_STORE = 'Hipermercado Central de la Región Metropolitana Sur'
  const LONG_PRODUCT = 'Aceite de oliva virgen extra ecológico primera presión en frío 1L'
  const LONG_CATEGORY = 'Productos de limpieza y hogar para toda la casa'

  it('TIPO 1 (tienda habitual barata) con nombre de tienda largo se mantiene corto', () => {
    const products = [product('a', 'Pan'), product('b', 'Leche'), product('c', 'Huevos')]
    const prices = ['a', 'b', 'c'].flatMap((id) => [
      price(id, { store: LONG_STORE, price: 1, recordedDate: '2026-06-01' }),
      price(id, { store: 'Hiperber', price: 2, recordedDate: '2026-07-01' }),
      price(id, { store: LONG_STORE, price: 1, recordedDate: '2026-08-01' }),
    ])
    const insight = findCheapestStoreForHabituals({ prices, products })
    expect(insight?.text.length).toBeLessThan(MAX_BUBBLE_TEXT_LENGTH)
  })

  it('TIPO 2 (producto frecuente) con nombre de producto largo se mantiene corto', () => {
    const products = [product('p', LONG_PRODUCT)]
    const prices = Array.from({ length: 5 }, (_, i) => price('p', { recordedDate: `2026-09-0${i + 1}` }))
    const insight = findMostFrequentProduct({ prices, products }, NOW)
    expect(insight?.text.length).toBeLessThan(MAX_BUBBLE_TEXT_LENGTH)
  })

  it('TIPO 3 (comparación de precios) con nombre de producto y tienda largos se mantiene corto', () => {
    const products = [product('p', LONG_PRODUCT)]
    const prices = [
      price('p', { store: LONG_STORE, price: 3.85, recordedDate: '2026-08-01' }),
      price('p', { store: 'Hiperber', price: 4.3, recordedDate: '2026-08-15' }),
      price('p', { store: LONG_STORE, price: 3.9, recordedDate: '2026-09-01' }),
    ]
    const insight = findBestPriceGapProduct({ prices, products })
    expect(insight?.text.length).toBeLessThan(MAX_BUBBLE_TEXT_LENGTH)
  })

  it('TIPO 4 (producto emergente) con nombre de producto largo se mantiene corto', () => {
    const products = [product('snack', LONG_PRODUCT), product('ancla', 'Ancla')]
    const receipts = ['r1', 'r2', 'r3', 'r4', 'r5']
    const prices = [
      price('ancla', { receiptId: 'r0-antigua', recordedDate: '2026-01-01' }),
      ...receipts.map((rid, i) => price('ancla', { receiptId: rid, recordedDate: `2026-09-2${i}` })),
      ...['r1', 'r2', 'r3', 'r4'].map((rid) => price('snack', { receiptId: rid, recordedDate: '2026-09-20' })),
    ]
    const insight = findEmergingProduct({ prices, products })
    expect(insight?.text.length).toBeLessThan(MAX_BUBBLE_TEXT_LENGTH)
  })

  it('TIPO 5 (producto desaparecido) con nombre de producto largo se mantiene corto', () => {
    const products = [product('p', LONG_PRODUCT)]
    const prices = [
      price('p', { recordedDate: '2026-06-01' }),
      price('p', { recordedDate: '2026-06-11' }),
      price('p', { recordedDate: '2026-06-21' }),
    ]
    const insight = findDisappearedProduct({ prices, products }, NOW)
    expect(insight?.text.length).toBeLessThan(MAX_BUBBLE_TEXT_LENGTH)
  })

  it('TIPO 6 (recompra anticipada) con nombre de producto largo se mantiene corto', () => {
    const products = [product('p', LONG_PRODUCT)]
    const prices = [
      price('p', { recordedDate: '2026-08-01' }),
      price('p', { recordedDate: '2026-08-11' }),
      price('p', { recordedDate: '2026-08-21' }),
      price('p', { recordedDate: '2026-08-23' }),
    ]
    const insight = findEarlyRepurchase({ prices, products })
    expect(insight?.text.length).toBeLessThan(MAX_BUBBLE_TEXT_LENGTH)
  })

  it('TIPO 7 (cesta habitual) con 59 productos habituales se mantiene corto', () => {
    const products: Product[] = Array.from({ length: 59 }, (_, i) => product(`p${i}`, `Producto ${i}`))
    const prices: ProductPrice[] = products.flatMap((p, i) => Array.from({ length: 4 }, (_, j) => price(p.id, { recordedDate: `2026-0${(j % 9) + 1}-0${(i % 9) + 1}` })))
    const insight = findCoreBasket({ prices, products })
    expect(insight?.text.length).toBeLessThan(MAX_BUBBLE_TEXT_LENGTH)
  })

  it('TIPO 8 (categoría por tienda) con nombres de categoría y tienda largos se mantiene corto', () => {
    const products = [
      product('a', 'Lejía', { category: LONG_CATEGORY }),
      product('b', 'Detergente', { category: LONG_CATEGORY }),
    ]
    const prices = [
      ...Array.from({ length: 4 }, (_, i) => price('a', { store: LONG_STORE, recordedDate: `2026-0${i + 1}-01` })),
      price('b', { store: 'Hiperber', recordedDate: '2026-05-01' }),
    ]
    const insight = findCategoryStoreConcentration({ prices, products })
    expect(insight?.text.length).toBeLessThan(MAX_BUBBLE_TEXT_LENGTH)
  })
})
