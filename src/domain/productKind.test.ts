import { describe, expect, it } from 'vitest'
import { resolveProductClass, storedClassKind, type FamilyClassRef, type ProductClassKind } from './productClass'
import { buildProductKindSets, isFoodPurchase } from './products'
import { resolveStoreChain, type StoreChainAliasRow, type StoreChainKind, type StoreChainRow } from './storeChains'
import type { Product } from './types'

// FASE 6C — TIENDA != TIPO DE PRODUCTO. Amazon solo indica DÓNDE se compró; la clase dice QUÉ es y su `kind` manda.
const CLASSES: FamilyClassRef[] = [
  { name: 'Bebidas no alcohólicas', kind: 'alimentacion', catalogKey: 'food.bebidas_no_alcoholicas' },
  { name: 'Carne', kind: 'alimentacion', catalogKey: 'food.carne' },
  { name: 'Ropa y calzado', kind: 'no_alimentos', catalogKey: 'other.ropa_calzado' },
  { name: 'Cuidado personal', kind: 'no_alimentos', catalogKey: 'other.cuidado_personal' },
  { name: 'Electrónica y hogar', kind: 'no_alimentos', catalogKey: 'other.electronica_hogar' },
]

function product(id: string, category: string | null, opts: { nonFood?: boolean; confirmed?: boolean } = {}): Product {
  return {
    id,
    familyId: 'f',
    normalizedName: id,
    displayName: id,
    category,
    brand: null,
    nonFood: opts.nonFood ?? false,
    classConfirmedAt: opts.confirmed === false || category == null ? null : '2026-09-21T17:35:40Z',
    classKind: storedClassKind(category, CLASSES),
  }
}

// ¿Cuenta como alimentación esta compra? `receiptIsFood` = la categoría FINANCIERA del ticket (que no depende del producto).
function counts(p: Product, store: string | null, receiptIsFood: boolean): boolean {
  const { nonFoodProductIds, foodProductIds } = buildProductKindSets([p])
  return isFoodPurchase({ productId: p.id, store, receiptId: 'r1' }, new Set(receiptIsFood ? ['r1'] : []), nonFoodProductIds, foodProductIds)
}

describe('storedClassKind: el conjunto lo da la CLASE, nunca la tienda', () => {
  it('clase existente → su kind; sin clase, vacía o desaparecida → null', () => {
    expect(storedClassKind('Bebidas no alcohólicas', CLASSES)).toBe('alimentacion')
    expect(storedClassKind('Ropa y calzado', CLASSES)).toBe('no_alimentos')
    expect(storedClassKind(null, CLASSES)).toBeNull()
    expect(storedClassKind('  ', CLASSES)).toBeNull()
    expect(storedClassKind('Clase que ya no existe', CLASSES)).toBeNull()
  })
})

describe('A–E: Amazon + clase conocida → el kind de la clase, sin importar la categoría del ticket', () => {
  it('A. Amazon + NESCAFÉ Dolce Gusto (manual «Bebidas no alcohólicas») → ALIMENTACIÓN, aunque el ticket no sea de Alimentación', () => {
    const cafe = product('nescafe', 'Bebidas no alcohólicas')
    expect(cafe.classKind).toBe('alimentacion')
    expect(counts(cafe, 'Amazon', false)).toBe(true)
    expect(counts(cafe, 'Amazon', true)).toBe(true)
    // el resolutor central confirma: clase manual, fuente manual, conjunto alimentación
    const r = resolveProductClass({ name: 'NESCAFÉ Dolce Gusto', product: cafe, kind: 'no_alimentos', familyClasses: CLASSES })
    expect(r).toMatchObject({ className: 'Bebidas no alcohólicas', source: 'manual', kind: 'alimentacion', classKnown: true })
  })

  it('B/C. Amazon + camisetas La Tostadora (manual «Ropa y calzado») → OTROS (las dos)', () => {
    for (const id of ['latostadora', 'pendiente']) {
      const camiseta = product(id, 'Ropa y calzado', { nonFood: true })
      expect(counts(camiseta, 'Amazon', false)).toBe(false)
      // aunque el ticket lo cuente como Alimentación por error, la clase manda
      expect(counts(camiseta, 'Amazon', true)).toBe(false)
    }
  })

  it('D. Amazon + clase manual «Cuidado personal» → OTROS, también con la marca antigua non_food=false (la contradicción auditada)', () => {
    const dodot = product('dodot', 'Cuidado personal', { nonFood: false })
    expect(counts(dodot, 'Amazon', true)).toBe(false)
    expect(counts(dodot, 'Amazon', false)).toBe(false)
  })

  it('E. Amazon + clase manual «Electrónica y hogar» → OTROS', () => {
    const teclado = product('teclado', 'Electrónica y hogar', { nonFood: false })
    expect(counts(teclado, 'Amazon', true)).toBe(false)
    expect(counts(teclado, 'Amazon', false)).toBe(false)
  })
})

describe('G/H: otras tiendas con clase conocida — comportamiento intacto', () => {
  it('G. Mercadona + producto de alimentación → alimentación', () => {
    expect(counts(product('carne', 'Carne'), 'Mercadona', true)).toBe(true)
    expect(counts(product('carne', 'Carne'), 'Mercadona', false)).toBe(true)
  })
  it('H. Mercadona + producto de no alimentos → otros', () => {
    expect(counts(product('camiseta', 'Ropa y calzado', { nonFood: true }), 'Mercadona', true)).toBe(false)
  })
  it('sin clase conocida, una tienda física sigue igual que antes (alimentación salvo la marca non_food)', () => {
    expect(counts(product('leche', null), 'Mercadona', false)).toBe(true)
    expect(counts(product('bombona', null, { nonFood: true }), 'Mercadona', true)).toBe(false)
  })
})

describe('I/J: corrección manual — el conjunto cambia con la clase elegida, dondequiera que se comprara', () => {
  it('I. FOOD → OTHER: el producto pasa a Otros (con la marca non_food sincronizada o no)', () => {
    const before = product('x', 'Carne')
    expect(counts(before, 'Mercadona', true)).toBe(true)
    // el usuario elige «Ropa y calzado»: category cambia y setProductFoodType escribe non_food=true en la misma escritura
    const after = { ...before, category: 'Ropa y calzado', nonFood: true, classKind: storedClassKind('Ropa y calzado', CLASSES) }
    expect(counts(after, 'Mercadona', true)).toBe(false)
    expect(counts({ ...after, nonFood: false }, 'Amazon', true)).toBe(false) // ni siquiera hace falta la marca: manda la clase
  })
  it('J. OTHER → FOOD: el producto pasa a Alimentos, también en Amazon con un ticket que no es de Alimentación', () => {
    const before = product('x', 'Ropa y calzado', { nonFood: true })
    expect(counts(before, 'Amazon', false)).toBe(false)
    const after = { ...before, category: 'Bebidas no alcohólicas', nonFood: false, classKind: storedClassKind('Bebidas no alcohólicas', CLASSES) }
    expect(counts(after, 'Amazon', false)).toBe(true)
    expect(counts({ ...after, nonFood: true }, 'Amazon', false)).toBe(true) // una marca antigua no puede contradecir la clase
  })
})

describe('K/L: Automático y marca antigua', () => {
  it('K. «Automático» (category NULL, sin confirmar): no hay autoridad manual ni legacy; decide lo dinámico (compartido > reglas > respaldo)', () => {
    const manualOther = product('x', 'Ropa y calzado', { nonFood: true })
    const r = resolveProductClass({ name: 'Leche entera', product: manualOther, kind: 'alimentacion', familyClasses: CLASSES, ignoreStored: true })
    expect(r.source).not.toBe('manual')
    expect(r.source).not.toBe('legacy')
    const cleared = product('x', null, { nonFood: true }) // lo que deja setProductFoodType(id, null)
    expect(cleared.classConfirmedAt).toBeNull()
    expect(cleared.classKind).toBeNull()
    const r2 = resolveProductClass({ name: 'Leche entera', product: cleared, kind: 'alimentacion', familyClasses: CLASSES })
    expect(['shared', 'rule', 'fallback']).toContain(r2.source)
  })

  it('L. una marca non_food antigua NO puede contradecir una clase conocida (en ninguna de las dos direcciones)', () => {
    const foodClassStaleTrue = product('a', 'Bebidas no alcohólicas', { nonFood: true })
    const otherClassStaleFalse = product('b', 'Ropa y calzado', { nonFood: false })
    const sets = buildProductKindSets([foodClassStaleTrue, otherClassStaleFalse])
    expect(sets.foodProductIds.has('a')).toBe(true)
    expect(sets.nonFoodProductIds.has('a')).toBe(false)
    expect(sets.nonFoodProductIds.has('b')).toBe(true)
    expect(sets.foodProductIds.has('b')).toBe(false)
  })

  it('sin clase conocida, non_food sigue siendo la compatibilidad heredada (y solo eso)', () => {
    const sets = buildProductKindSets([product('c', null, { nonFood: true }), product('d', null), product('e', 'Clase borrada', { nonFood: true })])
    expect([...sets.nonFoodProductIds].sort()).toEqual(['c', 'e'])
    expect(sets.foodProductIds.size).toBe(0)
  })
})

describe('PENDIENTE DE DECISIÓN (F, Q, R): producto realmente desconocido y «Pendiente de clasificar»', () => {
  // Con clase desconocida sigue aplicándose la regla heredada de Amazon (por la categoría del TICKET). Retirarla sin más haría que un
  // producto desconocido pasara a Alimentos; hace falta el estado «Pendiente de clasificar», que se ha detenido a la espera de decisión.
  it('residual documentado: producto Amazon sin clase → lo decide la categoría del ticket (no una clase)', () => {
    const unknown = product('u', null)
    expect(counts(unknown, 'Amazon', false)).toBe(false)
    expect(counts(unknown, 'Amazon', true)).toBe(true)
  })
  it.todo('F. Amazon + producto realmente desconocido → Amazon NO decide FOOD/OTHER (bloqueado: requiere el estado «Pendiente de clasificar»)')
  it.todo('Q. pedido Amazon sin categoría fiable → pendiente de clasificar (bloqueado a la espera de decisión)')
  it.todo('R. el usuario clasifica un pendiente → clasificado (bloqueado a la espera de decisión)')
})

// ── Las cadenas se leen de la propia migración (lo que de verdad se siembra) ──
const FILES = import.meta.glob(['/supabase/migrations/0142_store_chains.sql', '/supabase/migrations/0143_shared_product_learning.sql'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
const CHAINS_SQL = FILES['/supabase/migrations/0142_store_chains.sql']
const SHARED_SQL = FILES['/supabase/migrations/0143_shared_product_learning.sql']
const CHAINS: StoreChainRow[] = [...CHAINS_SQL.matchAll(/\(\s*'([a-z0-9_]+)',\s*'((?:[^']|'')*)',\s*'(supermarket|marketplace|fuel_retail|local_shop)',\s*(true|false)/g)].map((m) => ({
  key: m[1],
  name: m[2].replace(/''/g, "'"),
  kind: m[3] as StoreChainKind,
  learnable: m[4] === 'true',
  status: 'active' as const,
}))
const ALIASES: StoreChainAliasRow[] = [...CHAINS_SQL.matchAll(/\(\s*'([a-z0-9_]+)',\s*'([a-z0-9 ]+)',\s*'(exact|word_prefix)',/g)].map((m) => ({
  chain_key: m[1],
  alias_norm: m[2],
  match_mode: m[3] as 'exact' | 'word_prefix',
}))

describe('M/N/O: COFIDIS no es Amazon; Amazon sigue sin aprendizaje compartido', () => {
  it('M. COFIDIS AMAZON-CORNELLA no se resuelve como Amazon (ni como ninguna cadena): no entra en ningún flujo Amazon', () => {
    const r = resolveStoreChain('COFIDIS AMAZON-CORNELLA DE L', CHAINS, ALIASES)
    expect(r).toEqual({ status: 'unresolved', reason: 'unknown' })
    // las variantes reales de Amazon sí
    for (const store of ['Amazon', 'Amazon ', 'WWW.AMAZON-LUXEMBOURG']) expect(resolveStoreChain(store, CHAINS, ALIASES)).toMatchObject({ status: 'resolved', chainKey: 'amazon' })
  })
  it('N. Amazon sigue learnable=false (marketplace)', () => {
    const amazon = CHAINS.find((c) => c.key === 'amazon')
    expect(amazon).toMatchObject({ kind: 'marketplace', learnable: false })
    expect(resolveStoreChain('Amazon', CHAINS, ALIASES)).toMatchObject({ status: 'resolved', chainKey: 'amazon', learnable: false })
  })
  it('O. ningún producto de Amazon está en el aprendizaje compartido sembrado', () => {
    expect(SHARED_SQL.toLowerCase()).not.toContain('amazon') // ni una sola fila ni regla sembrada para Amazon
    expect(SHARED_SQL).toContain('chain_not_learnable') // y el resolutor rechaza cualquier cadena no aprendible
  })
})

describe('types: ProductClassKind se reutiliza (no hay un segundo clasificador)', () => {
  it('los conjuntos son los mismos valores que usa el resolutor', () => {
    const kinds: ProductClassKind[] = ['alimentacion', 'no_alimentos']
    expect(kinds).toHaveLength(2)
  })
})
