import { describe, expect, it } from 'vitest'
import { classifyFoodType, FOOD_TYPES } from './foodTypes'
import {
  legacyProductClass,
  resolveProductClass,
  resolveProductClassSafe,
  sharedPairKey,
  unambiguousStore,
  type FamilyClassRef,
  type ProductClassKind,
  type ResolveProductClassInput,
} from './productClass'
import { resolveSharedProductClass, type SharedLearningRow } from './sharedLearning'
import type { StoreChainAliasRow, StoreChainKind, StoreChainRow } from './storeChains'

// Clases de una familia creada desde el catálogo PEPA (nombres y claves del catálogo v1).
const CLASSES: [string, ProductClassKind, string][] = [
  ['Carne', 'alimentacion', 'food.carne'],
  ['Panadería y bollería', 'alimentacion', 'food.panaderia_bolleria'],
  ['Lácteos y huevos', 'alimentacion', 'food.lacteos_huevos'],
  ['Congelados y helados', 'alimentacion', 'food.congelados_helados'],
  ['Snacks y dulces', 'alimentacion', 'food.snacks_dulces'],
  ['Despensa (arroz, pasta, aceite, conservas...)', 'alimentacion', 'food.despensa'],
  ['Verdura y hortalizas', 'alimentacion', 'food.verdura_hortalizas'],
  ['Fruta', 'alimentacion', 'food.fruta'],
  ['Pescado y marisco', 'alimentacion', 'food.pescado_marisco'],
  ['Otros alimentos', 'alimentacion', 'food.otros_alimentos'],
  ['Condimentos y Hierbas', 'alimentacion', 'food.condimentos_hierbas'],
  ['Bebidas no alcohólicas', 'alimentacion', 'food.bebidas_no_alcoholicas'],
  ['Bebidas alcohólicas', 'alimentacion', 'food.bebidas_alcoholicas'],
  ['Postres', 'alimentacion', 'food.postres'],
  ['Limpieza del hogar', 'no_alimentos', 'other.limpieza_hogar'],
  ['Cuidado personal', 'no_alimentos', 'other.cuidado_personal'],
  ['Ropa y calzado', 'no_alimentos', 'other.ropa_calzado'],
  ['Electrónica y hogar', 'no_alimentos', 'other.electronica_hogar'],
  ['Utensilios cocina', 'no_alimentos', 'other.utensilios_cocina'],
  ['Jardín', 'no_alimentos', 'other.jardin'],
  ['Combustible, Aceite y AdBlue', 'no_alimentos', 'other.combustible_aceite_adblue'],
  ['Ferretería y bricolaje', 'no_alimentos', 'other.ferreteria_bricolaje'],
  ['Farmacia y salud', 'no_alimentos', 'other.farmacia_salud'],
  ['Juguetes', 'no_alimentos', 'other.juguetes'],
  ['Mascotas', 'no_alimentos', 'other.mascotas'],
  ['Papelería y oficina', 'no_alimentos', 'other.papeleria_oficina'],
  ['Otros', 'no_alimentos', 'other.otros'],
]
const FAMILY: FamilyClassRef[] = CLASSES.map(([name, kind, catalogKey]) => ({ name, kind, catalogKey }))
const nameOf = (key: string) => FAMILY.find((c) => c.catalogKey === key)?.name as string

const NOT_CONFIRMED = { category: null, classConfirmedAt: null, nonFood: false }
const resolve = (over: Partial<ResolveProductClassInput> & { name: string }) =>
  resolveProductClass({ kind: 'alimentacion', familyClasses: FAMILY, ...over })
const matched = (key: string) => ({ status: 'matched', foodTypeKey: key })

describe('precedencia: MANUAL > SHARED > LEGACY > RULE > FALLBACK', () => {
  it('1. manual: la clase confirmada por la familia gana a todo', () => {
    const r = resolve({ name: 'LECHE SEMI P-6', product: { category: 'Bebidas alcohólicas', classConfirmedAt: '2026-09-21', nonFood: false }, shared: matched('food.lacteos_huevos') })
    expect(r).toMatchObject({ className: 'Bebidas alcohólicas', source: 'manual', foodTypeKey: 'food.bebidas_alcoholicas', sharedOutcome: 'skipped_by_manual' })
  })

  it('2. shared: sin manual, el aprendizaje compartido aprobado gana a las reglas', () => {
    // las reglas dirían «Despensa» por «salsa»; lo aprobado dice Otros alimentos
    const r = resolve({ name: 'SALSA LIGERA', shared: matched('food.otros_alimentos') })
    expect(classifyFoodType('SALSA LIGERA').label).toContain('Despensa')
    expect(r).toMatchObject({ className: 'Otros alimentos', source: 'shared', foodTypeKey: 'food.otros_alimentos', sharedOutcome: 'used' })
  })

  it('3. legacy: una clase histórica SIN confirmar va por debajo de lo compartido y por encima de las reglas', () => {
    const product = { category: 'Carne', classConfirmedAt: null, nonFood: false }
    expect(resolve({ name: 'LECHE SEMI P-6', product })).toMatchObject({ className: 'Carne', source: 'legacy' })
    expect(resolve({ name: 'LECHE SEMI P-6', product, shared: matched('food.lacteos_huevos') })).toMatchObject({ className: 'Lácteos y huevos', source: 'shared' })
  })

  it('4. rule: sin nada anterior, el clasificador por palabras clave', () => {
    expect(resolve({ name: 'BERENJENA RAYADA GR' })).toMatchObject({ className: 'Verdura y hortalizas', source: 'rule', foodTypeKey: 'food.verdura_hortalizas' })
  })

  it('5. fallback: nada resuelve → «Otros alimentos» en Alimentos y «sin clasificar» en Otros', () => {
    expect(resolve({ name: 'BENTO MIX' })).toMatchObject({ className: 'Otros alimentos', source: 'fallback' })
    expect(resolve({ name: 'Auriculares', kind: 'no_alimentos' })).toMatchObject({ className: '', source: 'fallback', foodTypeKey: null })
  })

  it('la cascada completa, paso a paso, sobre el mismo producto', () => {
    const base = { name: 'TIBURON', shared: matched('food.despensa') }
    const manual = { category: 'Snacks y dulces', classConfirmedAt: 'x', nonFood: false }
    const legacy = { category: 'Snacks y dulces', classConfirmedAt: null, nonFood: false }
    expect(resolve({ ...base, product: manual }).source).toBe('manual')
    expect(resolve({ ...base, product: legacy }).source).toBe('shared')
    expect(resolve({ ...base, product: legacy, shared: null }).source).toBe('legacy')
    expect(resolve({ ...base, product: NOT_CONFIRMED, shared: null }).source).toBe('fallback') // «tiburon» no tiene palabra clave
  })
})

describe('LA FAMILIA MANDA: lo compartido nunca pisa lo manual', () => {
  it('la familia corrigió X → Clase A; lo compartido dice X → Clase B: gana A (manual), siempre', () => {
    const product = { category: 'Carne', classConfirmedAt: '2026-09-21T10:00:00Z', nonFood: false }
    for (const shared of [matched('food.lacteos_huevos'), matched('food.fruta'), matched('food.carne')]) {
      const r = resolve({ name: 'LECHE SEMI P-6', product, shared })
      expect(r.className).toBe('Carne')
      expect(r.source).toBe('manual')
    }
  })

  it('aunque el aprendizaje compartido se actualice después: mismo resultado con cualquier versión del conocimiento', () => {
    const product = { category: 'Cuidado personal', classConfirmedAt: 'x', nonFood: true }
    const before = resolve({ name: 'PAPEL HIGIENICO 4 CA', kind: 'no_alimentos', product, shared: matched('other.limpieza_hogar') })
    const after = resolve({ name: 'PAPEL HIGIENICO 4 CA', kind: 'no_alimentos', product, shared: matched('other.utensilios_cocina') })
    expect(before).toEqual(after)
    expect(after).toMatchObject({ className: 'Cuidado personal', source: 'manual' })
  })

  it('una clase manual cuya clase ya no existe en la familia sigue siendo manual (no se sustituye)', () => {
    const r = resolve({ name: 'X', product: { category: 'Mascotas viejas', classConfirmedAt: 'x', nonFood: false }, shared: matched('food.carne') })
    expect(r).toMatchObject({ className: 'Mascotas viejas', source: 'manual', classKnown: false })
  })

  it('el non_food antiguo no tiene más autoridad que una clase confirmada: manda el conjunto de la clase', () => {
    // clase de Alimentos confirmada aunque el producto arrastre non_food=true
    const a = resolve({ name: 'CERVEZA', kind: 'no_alimentos', product: { category: 'Carne', classConfirmedAt: 'x', nonFood: true } })
    expect(a).toMatchObject({ className: 'Carne', kind: 'alimentacion', source: 'manual' })
    // y al revés (Amazon: clase de Otros con non_food=false)
    const b = resolve({ name: 'Teclado', kind: 'alimentacion', product: { category: 'Electrónica y hogar', classConfirmedAt: 'x', nonFood: false } })
    expect(b).toMatchObject({ className: 'Electrónica y hogar', kind: 'no_alimentos', source: 'manual' })
  })

  it('una clase histórica SIN confirmar no tiene autoridad manual por sí misma', () => {
    const r = resolve({ name: 'LECHE', product: { category: 'Carne', classConfirmedAt: null, nonFood: false }, shared: matched('food.lacteos_huevos') })
    expect(r.source).not.toBe('manual')
    expect(r.className).toBe('Lácteos y huevos')
  })
})

describe('lo compartido no decide → se sigue (nunca rompe)', () => {
  it.each([
    ['ambiguous', { status: 'ambiguous', foodTypeKey: null }],
    ['not_found', { status: 'not_found', foodTypeKey: null }],
    ['invalid', { status: 'invalid', foodTypeKey: null }],
    ['chain_unresolved', { status: 'chain_unresolved', foodTypeKey: null }],
    ['chain_not_learnable', { status: 'chain_not_learnable', foodTypeKey: null }],
  ])('%s → reglas', (status, shared) => {
    const r = resolve({ name: 'BERENJENA RAYADA GR', shared })
    expect(r).toMatchObject({ className: 'Verdura y hortalizas', source: 'rule', sharedOutcome: status })
  })

  it('ambiguous con una clase guardada sin confirmar → esa clase histórica (nunca una clase compartida inventada)', () => {
    const r = resolve({ name: 'SUP.BEBIDA FRÍA', product: { category: 'Bebidas alcohólicas', classConfirmedAt: null, nonFood: false }, shared: { status: 'ambiguous', foodTypeKey: null } })
    expect(r).toMatchObject({ className: 'Bebidas alcohólicas', source: 'legacy', sharedOutcome: 'ambiguous' })
  })

  it('«matched» sin clave, o con la clave de una clase que la familia no tiene → se ignora', () => {
    expect(resolve({ name: 'BERENJENA RAYADA GR', shared: { status: 'matched', foodTypeKey: null } }).source).toBe('rule')
    const sinPostres = FAMILY.filter((c) => c.catalogKey !== 'food.postres')
    const r = resolve({ name: 'FLAN', familyClasses: sinPostres, shared: matched('food.postres') })
    expect(r.sharedOutcome).toBe('class_not_in_family')
    expect(r.source).not.toBe('shared')
  })

  it('la RPC caída o sin tienda: sin resultado compartido (null/undefined) → igual que antes', () => {
    for (const shared of [null, undefined]) {
      expect(resolve({ name: 'BERENJENA RAYADA GR', shared })).toMatchObject({ source: 'rule', sharedOutcome: 'not_consulted' })
    }
  })

  it('conjunto distinto (Historial/Economía): lo compartido de Otros no se cuela en Alimentos; con conjunto por defecto (producto nuevo) sí lo fija', () => {
    const shared = matched('other.limpieza_hogar')
    const fixed = resolve({ name: 'GEL WC PERFUMADO', kind: 'alimentacion', shared })
    expect(fixed).toMatchObject({ source: 'fallback', sharedOutcome: 'kind_mismatch' })
    const byDefault = resolve({ name: 'GEL WC PERFUMADO', kind: 'alimentacion', kindIsDefault: true, shared })
    expect(byDefault).toMatchObject({ className: 'Limpieza del hogar', kind: 'no_alimentos', source: 'shared' })
  })

  it('un fallo inesperado del resolutor devuelve el comportamiento anterior, no una excepción', () => {
    const broken = { name: 'LECHE', kind: 'alimentacion', familyClasses: null } as unknown as ResolveProductClassInput
    // familyClasses nulo solo falla si se llega a mirarlo; forzamos un fallo real:
    const input = { ...broken, shared: matched('food.carne') }
    const r = resolveProductClassSafe(input)
    expect(r.source).toBe('fallback')
    expect(r.sharedOutcome).toBe('error')
    expect(r.className).toBe(legacyProductClass(input))
  })
})

describe('casos reales del inventario aprobado (cadena real + texto real, resolutor completo)', () => {
  const FILES = import.meta.glob(['/supabase/migrations/0142_store_chains.sql', '/supabase/migrations/0143_shared_product_learning.sql'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  const CHAINS_SQL = FILES['/supabase/migrations/0142_store_chains.sql']
  const SEED_SQL = FILES['/supabase/migrations/0143_shared_product_learning.sql']
  const chains: StoreChainRow[] = [...CHAINS_SQL.matchAll(/\(\s*'([a-z0-9_]+)',\s*'((?:[^']|'')*)',\s*'(supermarket|marketplace|fuel_retail|local_shop)',\s*(true|false)/g)].map((m) => ({ key: m[1], name: m[2], kind: m[3] as StoreChainKind, learnable: m[4] === 'true', status: 'active' as const }))
  const aliases: StoreChainAliasRow[] = [...CHAINS_SQL.matchAll(/\(\s*'([a-z0-9_]+)',\s*'([a-z0-9 ]+)',\s*'(exact|word_prefix)',/g)].map((m) => ({ chain_key: m[1], alias_norm: m[2], match_mode: m[3] as 'exact' | 'word_prefix' }))
  const learning: SharedLearningRow[] = [
    ...[...SEED_SQL.matchAll(/\('([a-z_]+)', '([^']+)', '((?:food|other)\.[a-z_]+)', 'approved', 'pepa_seed_v1', 'pepa_admin', now\(\)\)/g)].map((m) => ({ chain_key: m[1], text_key: m[2], food_type_key: m[3], status: 'approved' as const })),
    ...[...SEED_SQL.matchAll(/\('([a-z_]+)', '([^']+)', null, 'ambiguous', 'pepa_seed_v1'/g)].map((m) => ({ chain_key: m[1], text_key: m[2], food_type_key: null, status: 'ambiguous' as const })),
  ]
  const data = { chains, aliases, learning }

  // Lo que hace la app: consulta compartida del contexto (tienda + texto) y resolutor central.
  function classFor(store: string | null, text: string, product = null as ResolveProductClassInput['product'], kind: ProductClassKind = 'alimentacion') {
    const shared = store ? resolveSharedProductClass(store, text, data) : null
    return resolveProductClass({ name: text, product, kind, kindIsDefault: product == null, familyClasses: FAMILY, shared: shared ? { status: shared.status, foodTypeKey: shared.foodTypeKey } : null })
  }

  it.each([
    ['Mercadona', 'LECHE SEMI P-6', 'Lácteos y huevos'],
    ['Mercadona', 'BERENJENA', 'Verdura y hortalizas'],
    ['Mercadona', 'HIELO CUBITO 2KG', 'Congelados y helados'],
    ['Mercadona', 'TIBURON', 'Despensa (arroz, pasta, aceite, conservas...)'],
    ['Mercadona', 'VELA CIFRA 0', 'Utensilios cocina'],
    ['Mercadona', 'VELA CIFRA 4', 'Utensilios cocina'],
    ['Hiperber', 'CERVEZA MAHOU TOS', 'Bebidas no alcohólicas'],
    ['Hiperber', 'BURGER MEAT MIXTA', 'Carne'],
    ['Hiperber', 'PATATAS RUFFLES J', 'Snacks y dulces'],
    ['Charter', 'RUFFLES JAMÓN 150 G', 'Snacks y dulces'],
  ])('%s + %s → %s (shared)', (store, text, expected) => {
    expect(classFor(store, text)).toMatchObject({ className: expected, source: 'shared' })
  })

  it('un producto nuevo de limpieza en una tienda física se fija como «Otros» por lo compartido (no como alimento)', () => {
    expect(classFor('Mercadona', '10 S.JARDÍN C. FÁCIL')).toMatchObject({ className: 'Limpieza del hogar', kind: 'no_alimentos', source: 'shared' })
  })

  it('Charter + SUP.BEBIDA FRÍA → lo compartido NO decide: cae a reglas/respaldo, o a la clase manual', () => {
    expect(classFor('Charter', 'SUP.BEBIDA FRÍA')).toMatchObject({ source: 'rule', sharedOutcome: 'ambiguous', className: 'Bebidas' })
    const manual = { category: 'Bebidas alcohólicas', classConfirmedAt: 'x', nonFood: false }
    expect(classFor('Charter', 'SUP.BEBIDA FRÍA', manual)).toMatchObject({ source: 'manual', className: 'Bebidas alcohólicas' })
    const legacy = { category: 'Bebidas alcohólicas', classConfirmedAt: null, nonFood: false }
    expect(classFor('Charter', 'SUP.BEBIDA FRÍA', legacy)).toMatchObject({ source: 'legacy', className: 'Bebidas alcohólicas' })
  })

  it('Mercadona + PARKING: comportamiento actual documentado — sin aprendizaje; se resuelve por reglas/respaldo o por su clase guardada', () => {
    // Corrección real: "PARKING" no lleva ninguna palabra de comida y el
    // conjunto "alimentación" aquí es solo la suposición por defecto de
    // un producto nuevo — en vez de mentir "Otros alimentos", cae en el
    // catálogo de Otros (no alimentos) que la familia ya tiene.
    expect(classFor('Mercadona', 'PARKING')).toMatchObject({ source: 'fallback', sharedOutcome: 'not_found', className: 'Otros', kind: 'no_alimentos' })
    const stored = { category: 'Otros', classConfirmedAt: null, nonFood: true }
    expect(classFor('Mercadona', 'PARKING', stored, 'no_alimentos')).toMatchObject({ source: 'legacy', className: 'Otros' })
  })

  it('un producto nuevo sin ninguna palabra de comida (real: "DESATASCADOR") cae en Otros (no alimentos), nunca en Otros alimentos', () => {
    expect(classFor('Mercadona', 'DESATASCADOR')).toMatchObject({ className: 'Otros', kind: 'no_alimentos', source: 'fallback' })
  })

  it('un producto nuevo que SÍ tiene palabra de comida real sigue clasificándose en Alimentos como siempre', () => {
    expect(classFor('Mercadona', 'BERENJENA')).toMatchObject({ className: 'Verdura y hortalizas', kind: 'alimentacion' })
    expect(classFor('Mercadona', 'BERENJENA').source).not.toBe('fallback')
  })

  it('conjunto "alimentación" NO por defecto (contexto ya sabido, p. ej. Historial en su pestaña de Alimentos): sigue devolviendo Otros alimentos, no se manda a Otros', () => {
    // kindIsDefault false/ausente = el llamador ya sabe que es Alimentos (no es una suposición) — comportamiento intacto.
    const r = resolveProductClass({ name: 'DESATASCADOR', kind: 'alimentacion', familyClasses: FAMILY, shared: null })
    expect(r).toMatchObject({ className: 'Otros alimentos', kind: 'alimentacion', source: 'fallback' })
  })

  it('si la familia ya no tiene la clase "Otros" de no_alimentos (borrada/renombrada), nunca se inventa una — cae de vuelta al comportamiento anterior', () => {
    const sinOtrosNoAlimentos = FAMILY.filter((c) => !(c.kind === 'no_alimentos' && c.name === 'Otros'))
    const r = resolveProductClass({ name: 'DESATASCADOR', kind: 'alimentacion', kindIsDefault: true, familyClasses: sinOtrosNoAlimentos, shared: null })
    expect(r).toMatchObject({ className: 'Otros alimentos', kind: 'alimentacion', source: 'fallback' })
  })

  it('un producto YA existente con clase manual o histórica nunca se reclasifica por este cambio', () => {
    const manual = { category: 'Mascotas', classConfirmedAt: '2026-09-21', nonFood: false }
    expect(resolveProductClass({ name: 'DESATASCADOR', product: manual, kind: 'alimentacion', kindIsDefault: true, familyClasses: FAMILY, shared: null })).toMatchObject({
      className: 'Mascotas',
      source: 'manual',
    })
    const legacy = { category: 'Otros alimentos', classConfirmedAt: null, nonFood: false }
    expect(resolveProductClass({ name: 'DESATASCADOR', product: legacy, kind: 'alimentacion', kindIsDefault: true, familyClasses: FAMILY, shared: null })).toMatchObject({
      className: 'Otros alimentos',
      source: 'legacy',
    })
  })

  it.each([
    ['Repsol', 'BERENJENA'],
    ['Amazon', 'LECHE SEMI P-6'],
    ['MACRO ASIA', 'BERENJENA'],
    ['E.S. POLIGONO LAS MAROMAS', 'TIBURON'],
    ['SUPERMERCADO CONSUM RAFAL-RAFAL', 'LECHE SEMI P-6'],
    ['ALDI CALLOSA-CALLOSA DE SE', 'BERENJENA'],
    ['Lidl', 'BERENJENA'],
  ])('%s + %s: lo compartido no decide; reglas/respaldo/manual siguen funcionando', (store, text) => {
    const auto = classFor(store, text)
    expect(auto.source).not.toBe('shared')
    expect(auto.sharedOutcome).toBe('chain_not_learnable')
    const manual = classFor(store, text, { category: 'Mascotas', classConfirmedAt: 'x', nonFood: false })
    expect(manual).toMatchObject({ className: 'Mascotas', source: 'manual' })
  })

  it('sin tienda o con tienda no reconocida: lo compartido se salta', () => {
    expect(classFor(null, 'LECHE SEMI P-6')).toMatchObject({ source: 'rule', sharedOutcome: 'not_consulted' })
    expect(classFor('Huperber', 'BURGER MEAT MIXTA')).toMatchObject({ source: 'rule', sharedOutcome: 'chain_unresolved' })
    expect(classFor('COFIDIS AMAZON-CORNELLA DE L', 'BERENJENA').sharedOutcome).toBe('chain_unresolved')
  })

  it('Charter no reutiliza lo de Consum ni Hiperber lo de Charter', () => {
    expect(classFor('Charter', 'CERVEZA MAHOU TOS').sharedOutcome).toBe('not_found')
    expect(classFor('Hiperber', 'RUFFLES JAMÓN 150 G').sharedOutcome).toBe('not_found')
  })

  it('las 169 claves aprobadas siguen resolviendo a su clase (producto nuevo, sin nada guardado)', () => {
    const approved = learning.filter((l) => l.status === 'approved')
    expect(approved).toHaveLength(169)
    const displayChain: Record<string, string> = { mercadona: 'Mercadona', hiperber: 'Hiperber', charter: 'Charter' }
    for (const row of approved) {
      const r = classFor(displayChain[row.chain_key], row.text_key)
      expect(r.source, row.text_key).toBe('shared')
      expect(r.foodTypeKey, row.text_key).toBe(row.food_type_key)
      expect(r.className, row.text_key).toBe(nameOf(row.food_type_key as string))
    }
  })

  it('con la clase confirmada por la familia, ninguna de las 169 cambia aunque lo compartido diga otra cosa', () => {
    const approved = learning.filter((l) => l.status === 'approved')
    const displayChain: Record<string, string> = { mercadona: 'Mercadona', hiperber: 'Hiperber', charter: 'Charter' }
    for (const row of approved) {
      const mine = { category: 'Mascotas', classConfirmedAt: '2026-09-21', nonFood: false }
      const r = classFor(displayChain[row.chain_key], row.text_key, mine)
      expect(r, row.text_key).toMatchObject({ className: 'Mascotas', source: 'manual' })
    }
  })
})

describe('equivalencia con el comportamiento anterior cuando lo compartido no interviene', () => {
  const NAMES = ['LECHE ENTERA', 'CERVEZA MAHOU', 'TIBURON', 'BENTO MIX', 'Pechuga de pollo (kg)', 'PAN DE MOLDE', 'REFRES COCA-COLA', '', 'X']
  const STORED = [null, 'Carne', 'Mascotas', '  Fruta  ', '']

  it('sin resultado compartido y sin confirmar → misma clase que antes (guardada, o por reglas en Alimentos)', () => {
    for (const name of NAMES)
      for (const category of STORED)
        for (const kind of ['alimentacion', 'no_alimentos'] as const) {
          const product = { category, classConfirmedAt: null, nonFood: kind === 'no_alimentos' }
          const now = resolveProductClass({ name, product, kind, familyClasses: FAMILY, shared: null }).className
          expect(now, `${name}|${category}|${kind}`).toBe(legacyProductClass({ name, product, kind }))
        }
  })

  it('con clase guardada CONFIRMADA también coincide con lo anterior (la clase guardada se mostraba igual)', () => {
    for (const name of NAMES)
      for (const category of ['Carne', 'Mascotas']) {
        const product = { category, classConfirmedAt: 'x', nonFood: false }
        expect(resolveProductClass({ name, product, kind: 'alimentacion', familyClasses: FAMILY, shared: matched('food.fruta') }).className).toBe(legacyProductClass({ name, product, kind: 'alimentacion' }))
      }
  })

  it('las reglas siguen siendo el clasificador de siempre: mismo nombre de clase que classifyFoodType', () => {
    for (const name of NAMES.filter(Boolean)) {
      const rule = classifyFoodType(name)
      const r = resolveProductClass({ name, kind: 'alimentacion', familyClasses: FAMILY })
      expect(r.className).toBe(rule.label)
      expect(r.source).toBe(rule.key === 'otros' ? 'fallback' : 'rule')
    }
    expect(FOOD_TYPES.length).toBeGreaterThan(5)
  })
})

describe('contexto de tienda: nunca se atribuye una cadena arbitraria', () => {
  it('sharedPairKey no distingue mayúsculas ni espacios de los bordes', () => {
    expect(sharedPairKey(' Mercadona ', 'LECHE semi P-6')).toBe(sharedPairKey('mercadona', 'leche semi p-6'))
    expect(sharedPairKey('Mercadona', 'a')).not.toBe(sharedPairKey('Hiperber', 'a'))
  })

  it('un solo nombre de tienda en TODAS las compras → esa tienda', () => {
    expect(unambiguousStore([{ store: 'Mercadona' }, { store: 'mercadona ' }])).toBe('Mercadona')
  })

  it('comprado en varias tiendas → ninguna (aunque una sea la última)', () => {
    expect(unambiguousStore([{ store: 'Mercadona' }, { store: 'Hiperber' }])).toBeNull()
  })

  it('alguna compra sin tienda, o ninguna compra → ninguna', () => {
    expect(unambiguousStore([{ store: 'Mercadona' }, { store: null }])).toBeNull()
    expect(unambiguousStore([{ store: '  ' }])).toBeNull()
    expect(unambiguousStore([])).toBeNull()
  })
})

describe('«Automático» (restablecer): sin clase histórica guardada NO puede resolver por legacy', () => {
  // Al elegir «Automático» la app guarda category = NULL y class_confirmed_at = NULL (setProductFoodType(id, null)).
  const RESET = { category: null, classConfirmedAt: null, nonFood: false }
  const KINDS: ProductClassKind[] = ['alimentacion', 'no_alimentos']

  it('antes de restablecer, una clase histórica sin confirmar resolvía por legacy; después ya no', () => {
    const before = resolve({ name: 'LECHE SEMI P-6', product: { category: 'Carne', classConfirmedAt: null, nonFood: false }, shared: null })
    expect(before.source).toBe('legacy')
    const after = resolve({ name: 'LECHE SEMI P-6', product: RESET, shared: null })
    expect(after.source).not.toBe('legacy')
    expect(after.className).not.toBe('Carne')
  })

  it('desde manual: elegir «Automático» borra la decisión y el producto continúa por shared → rule → fallback', () => {
    const manual = { category: 'Mascotas', classConfirmedAt: '2026-09-21', nonFood: false }
    expect(resolve({ name: 'LECHE SEMI P-6', product: manual, shared: matched('food.lacteos_huevos') }).source).toBe('manual')
    // tras restablecer:
    expect(resolve({ name: 'LECHE SEMI P-6', product: RESET, shared: matched('food.lacteos_huevos') })).toMatchObject({ className: 'Lácteos y huevos', source: 'shared' })
    expect(resolve({ name: 'BERENJENA RAYADA GR', product: RESET, shared: { status: 'not_found', foodTypeKey: null } })).toMatchObject({ className: 'Verdura y hortalizas', source: 'rule' })
    expect(resolve({ name: 'BENTO MIX', product: RESET, shared: null })).toMatchObject({ className: 'Otros alimentos', source: 'fallback' })
  })

  it('nunca legacy con category NULL o en blanco, sea cual sea lo compartido y el conjunto', () => {
    const blanks = [null, '', '   ']
    const shareds = [null, undefined, matched('food.fruta'), { status: 'ambiguous', foodTypeKey: null }, { status: 'not_found', foodTypeKey: null }, { status: 'chain_not_learnable', foodTypeKey: null }]
    for (const category of blanks)
      for (const shared of shareds)
        for (const kind of KINDS)
          for (const name of ['LECHE ENTERA', 'BENTO MIX', 'GEL WC']) {
            const r = resolve({ name, kind, product: { category, classConfirmedAt: null, nonFood: kind === 'no_alimentos' }, shared })
            expect(['shared', 'rule', 'fallback'], `${name}|${category}|${kind}`).toContain(r.source)
          }
  })

  it('la opción «Automático» de la interfaz (ignoreStored) equivale a un producto ya restablecido', () => {
    const stored = { category: 'Mascotas', classConfirmedAt: 'x', nonFood: false }
    for (const shared of [null, matched('food.lacteos_huevos')]) {
      const ignoring = resolve({ name: 'LECHE SEMI P-6', product: stored, shared, ignoreStored: true })
      const reset = resolve({ name: 'LECHE SEMI P-6', product: RESET, shared })
      expect({ ...ignoring, classKnown: 0 }).toEqual({ ...reset, classKnown: 0 })
    }
  })
})
