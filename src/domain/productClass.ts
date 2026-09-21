// RESOLUTOR CENTRAL de la clase de un producto. Es la ÚNICA función que decide qué clase se muestra; todos los puntos de lectura
// (Tickets, Lista de la compra, Historial, Economía) la usan.
//
// PRINCIPIO: LA FAMILIA MANDA. Orden de precedencia:
//   1. manual   — la familia eligió/corrigió la clase (products.class_confirmed_at) → gana SIEMPRE, aunque el aprendizaje compartido
//                 diga otra cosa o se actualice después;
//   2. shared   — aprendizaje compartido PEPA aprobado para (cadena de ESTE contexto, texto comercial);
//   3. legacy   — clase histórica guardada SIN confirmar (products.category antigua): ya no tiene autoridad manual, pero se
//                 respeta por debajo del aprendizaje compartido y por encima de las reglas (equivale a lo que se veía antes);
//   4. rule     — clasificador local por palabras clave (classifyFoodType);
//   5. fallback — nada resuelve ("Otros alimentos" en Alimentos, "Sin clasificar" en Otros).
//
// El aprendizaje compartido es una MEJORA, no una dependencia: si no hay resultado (sin cadena, cadena no aprendible, error de la
// RPC...) se sigue con legacy → reglas → respaldo, es decir, igual que antes. Nunca se guarda un resultado compartido, de reglas o de
// respaldo en products.category: se resuelve dinámicamente.
//
// Este módulo es PURO: el resultado compartido ya viene resuelto (lo carga sharedClassLoader por lotes).
import { classifyFoodType } from './foodTypes'

export type ProductClassKind = 'alimentacion' | 'no_alimentos'
export type ProductClassSource = 'manual' | 'shared' | 'legacy' | 'rule' | 'fallback'

/** Clase de la familia (family_food_types). catalogKey = clave estable del catálogo PEPA, o null si es personal. */
export interface FamilyClassRef {
  name: string
  kind: ProductClassKind
  catalogKey: string | null
}

/** Lo que el resolutor necesita saber de un producto ya guardado. */
export interface ProductClassProduct {
  category: string | null
  classConfirmedAt: string | null
  nonFood: boolean
}

/** Resultado del aprendizaje compartido para el (tienda, texto) de ESTE contexto; undefined/null = no consultado o no disponible. */
export interface SharedClassHint {
  status: string
  foodTypeKey: string | null
}

export interface ResolveProductClassInput {
  /** Texto comercial del producto (el que sale en el ticket). */
  name: string
  /** Producto guardado, si existe. */
  product?: ProductClassProduct | null
  /** Conjunto en el que se está leyendo (lo decide quien llama, igual que antes). */
  kind: ProductClassKind
  /**
   * true = `kind` es solo una SUPOSICIÓN por defecto (producto nuevo: «tienda física = Alimentos»), no un dato del producto ni
   * del contexto. Entonces el aprendizaje compartido aprobado puede fijar el conjunto (p. ej. un detergente nuevo → Otros).
   * Con un producto ya existente o un contexto fijado por otra regla (Historial, Economía) se mantiene el conjunto de siempre.
   */
  kindIsDefault?: boolean
  familyClasses: readonly FamilyClassRef[]
  shared?: SharedClassHint | null
  /** "Automático": ignora la clase guardada (manual y legacy) y devuelve lo que resolvería sin ella. */
  ignoreStored?: boolean
}

export type SharedOutcome = 'used' | 'not_consulted' | 'class_not_in_family' | 'kind_mismatch' | 'skipped_by_manual' | string

export interface ResolvedProductClass {
  /** Nombre visible de la clase; '' = sin clasificar. */
  className: string
  /** Clave estable de la clase cuando se conoce (para el aprendizaje/analítica); null si no. */
  foodTypeKey: string | null
  /** Conjunto de la clase resuelta. Con clase manual conocida manda el de la clase, no el non_food antiguo. */
  kind: ProductClassKind
  source: ProductClassSource
  /** Qué pasó con el aprendizaje compartido en esta resolución (para depurar y para el modo sombra). */
  sharedOutcome: SharedOutcome
  /** manual/legacy: ¿la clase guardada sigue existiendo entre las de la familia? */
  classKnown: boolean
}

// Clave del catálogo de las clases por reglas (bebidas queda sin clave: alcohólicas / no alcohólicas no se adivina).
const RULE_KEY_TO_FOOD_TYPE_KEY: Record<string, string | null> = {
  bebidas: null,
  congelados: 'food.congelados_helados',
  snacks: 'food.snacks_dulces',
  panaderia: 'food.panaderia_bolleria',
  lacteos: 'food.lacteos_huevos',
  pescado: 'food.pescado_marisco',
  carne: 'food.carne',
  fruta: 'food.fruta',
  verdura: 'food.verdura_hortalizas',
  despensa: 'food.despensa',
  otros: 'food.otros_alimentos',
}

function findClassByName(classes: readonly FamilyClassRef[], name: string): FamilyClassRef | undefined {
  return classes.find((c) => c.name === name)
}

export function resolveProductClass(input: ResolveProductClassInput): ResolvedProductClass {
  const stored = input.product?.category?.trim() || ''
  const useStored = !input.ignoreStored && stored !== ''

  // 1. MANUAL: la familia confirmó esta clase. Ni el aprendizaje compartido ni nada la sustituye.
  if (useStored && input.product?.classConfirmedAt) {
    const known = findClassByName(input.familyClasses, stored)
    return {
      className: stored,
      foodTypeKey: known?.catalogKey ?? null,
      kind: known?.kind ?? input.kind, // el non_food antiguo no tiene más autoridad que la clase confirmada
      source: 'manual',
      sharedOutcome: 'skipped_by_manual',
      classKnown: known != null,
    }
  }

  // 2. SHARED: solo si se resolvió una clase aprobada, la familia la tiene y es del mismo conjunto que se está leyendo
  //    (salvo que el conjunto sea solo una suposición por defecto: entonces la clase compartida lo fija).
  let sharedOutcome: SharedOutcome = 'not_consulted'
  if (input.shared) {
    sharedOutcome = input.shared.status
    if (input.shared.status === 'matched' && input.shared.foodTypeKey) {
      const familyClass = input.familyClasses.find((c) => c.catalogKey === input.shared?.foodTypeKey)
      if (!familyClass) sharedOutcome = 'class_not_in_family'
      else if (familyClass.kind !== input.kind && !input.kindIsDefault) sharedOutcome = 'kind_mismatch'
      else {
        return { className: familyClass.name, foodTypeKey: familyClass.catalogKey, kind: familyClass.kind, source: 'shared', sharedOutcome: 'used', classKnown: true }
      }
    }
  }

  // 3. LEGACY: clase histórica guardada sin confirmar.
  if (useStored) {
    const known = findClassByName(input.familyClasses, stored)
    return { className: stored, foodTypeKey: known?.catalogKey ?? null, kind: input.kind, source: 'legacy', sharedOutcome, classKnown: known != null }
  }

  // 4-5. RULE / FALLBACK
  if (input.kind === 'alimentacion') {
    const guess = classifyFoodType(input.name)
    const hit = guess.key !== 'otros'
    return {
      className: guess.label,
      foodTypeKey: RULE_KEY_TO_FOOD_TYPE_KEY[guess.key] ?? null,
      kind: input.kind,
      source: hit ? 'rule' : 'fallback',
      sharedOutcome,
      classKnown: findClassByName(input.familyClasses, guess.label) != null,
    }
  }
  return { className: '', foodTypeKey: null, kind: input.kind, source: 'fallback', sharedOutcome, classKnown: false }
}

/**
 * FASE 6C — Conjunto (alimentación / no alimentos) de la clase GUARDADA de un producto (manual o histórica), o null si no hay clase
 * o ya no existe entre las de la familia. TIENDA != TIPO DE PRODUCTO: aquí la tienda no participa; la clase dice QUÉ es el producto
 * y su `kind` manda sobre la marca heredada `non_food` (que solo vale cuando la clase es desconocida).
 */
export function storedClassKind(category: string | null | undefined, familyClasses: readonly Pick<FamilyClassRef, 'name' | 'kind'>[]): ProductClassKind | null {
  const stored = category?.trim() || ''
  if (stored === '') return null
  return familyClasses.find((c) => c.name === stored)?.kind ?? null
}

/** El comportamiento ANTERIOR a la Fase 5, tal cual: clase guardada, o la adivinada por el nombre en Alimentos. */
export function legacyProductClass(input: { name: string; product?: { category: string | null } | null; kind: ProductClassKind }): string {
  const stored = input.product?.category?.trim() || ''
  return stored || (input.kind === 'alimentacion' ? classifyFoodType(input.name).label : '')
}

/** Igual que resolveProductClass, pero un fallo inesperado devuelve el comportamiento anterior en lugar de romper la pantalla. */
export function resolveProductClassSafe(input: ResolveProductClassInput): ResolvedProductClass {
  try {
    return resolveProductClass(input)
  } catch {
    return {
      className: legacyProductClass(input),
      foodTypeKey: null,
      kind: input.kind,
      source: 'fallback',
      sharedOutcome: 'error',
      classKnown: false,
    }
  }
}

/** Clave estable de un par (tienda, texto) para mapas y cachés. */
export function sharedPairKey(store: string, text: string): string {
  return `${store.trim().toLowerCase()}${text.trim().toLowerCase()}`
}

/**
 * Cadena inequívoca de un producto para el aprendizaje compartido: solo si TODAS sus compras son de la misma tienda (mismo nombre).
 * Sin precios, con alguna compra sin tienda o comprado en varias tiendas → null (el aprendizaje compartido se salta; nunca se le
 * atribuye una cadena arbitraria, p. ej. la del último precio).
 */
export function unambiguousStore(prices: readonly { store: string | null }[]): string | null {
  if (prices.length === 0) return null
  const stores = new Set<string>()
  for (const p of prices) {
    const s = p.store?.trim().toLowerCase()
    if (!s) return null
    stores.add(s)
  }
  if (stores.size !== 1) return null
  return prices.find((p) => p.store?.trim())?.store?.trim() ?? null
}
