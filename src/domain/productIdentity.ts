// IDENTIDAD DE PRODUCTO: ¿dos productos son el mismo, equivalentes, o distintos?
//
// Clasificar dos productos en la misma categoría NO los hace el mismo producto: aquí se comparan marca, variante, formato y tamaño del
// NOMBRE, y la clase (CAT-1) solo sirve para DESCARTAR (clases conocidas y distintas → distintos), nunca para unir.
//
//   identical  — misma marca, producto y presentación (aunque el ticket abrevie distinto)
//   equivalent — mismo producto genérico, distinta marca o tamaño, con rasgos suficientes para comparar precios
//   possible   — parecidos pero falta un dato esencial (una variante, una palabra): SUGERENCIA corregible, nunca automática
//   different  — no se comparan (leche entera ≠ leche desnatada)
//
// Puro: sin red, sin IA. Los nombres de marca vienen de una lista corta + products.brand; lo que no se reconoce como marca cuenta como
// palabra del producto (más conservador: ante la duda, «possible» o «different», nunca una coincidencia inventada).
import { compareIdentities } from './catalog/identify'
import { identifyProduct } from './catalog/identify'
import { productTextKey } from './productText'
import { parseProductSize, stripSize, type ParsedSize } from './productSize'

export type ProductRelation = 'identical' | 'equivalent' | 'possible' | 'different'

export interface ProductSignature {
  /** Nombre normalizado completo (clave de texto estable). */
  key: string
  brand: string | null
  /** Palabras del producto sin marca ni tamaño ni palabras vacías. */
  core: string[]
  /** Variantes que cambian de producto (entera, desnatada, sin lactosa, integral...). */
  variants: string[]
  size: ParsedSize | null
}

// Abreviaturas habituales de ticket → palabra completa (ya sin tildes ni mayúsculas). Solo las inequívocas.
const ABBREVIATIONS: Record<string, string> = {
  ent: 'entera',
  entera: 'entera',
  desn: 'desnatada',
  desnat: 'desnatada',
  semi: 'semidesnatada',
  semid: 'semidesnatada',
  semides: 'semidesnatada',
  integ: 'integral',
  nat: 'natural',
  cong: 'congelado',
  pq: 'pequeno',
  peq: 'pequeno',
  gde: 'grande',
  lact: 'lactosa',
  vin: 'vinagre',
  agridulc: 'agridulce',
  azuc: 'azucar',
  frit: 'frito',
  tom: 'tomate',
}

const STOPWORDS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'con', 'para', 'y', 'a', 'en', 'un', 'una', 'al', 'por', 'bandeja', 'bolsa', 'envase', 'botella', 'bote', 'lata', 'brik', 'tarro'])

// Rasgos que convierten un producto en OTRO: si difieren (o uno los tiene y el otro no) no son equivalentes.
const VARIANT_WORDS = new Set([
  'entera', 'desnatada', 'semidesnatada', 'lactosa', 'integral', 'light', 'zero', 'cero', 'azucar', 'azucares', 'bio', 'eco', 'ecologico',
  'natural', 'sabor', 'chocolate', 'fresa', 'vainilla', 'limon', 'naranja', 'sal', 'salado', 'frito', 'tostado', 'congelado', 'fresco',
  'grande', 'pequeno', 'mediano', 'picante', 'sin', 'alcohol', 'gluten', 'proteina', 'proteinas', 'fibra', 'vegetal', 'soja', 'avena', 'almendra',
  'arroz', 'cola', 'agridulce', 'vinagre', 'aceite', 'oliva', 'virgen', 'extra', 'girasol', 'blanco', 'negro', 'rubio', 'tinto', 'rosado',
])
const NEGATORS = new Set(['sin'])

// Marcas blancas y marcas nacionales frecuentes. Una marca distinta NO impide la equivalencia; una marca igual con producto distinto, sí.
const BRANDS: string[] = [
  'hacendado', 'deliplus', 'bosque verde', 'milbona', 'carrefour', 'alcampo', 'eroski', 'auchan', 'dia', 'consum', 'compy', 'cien', 'pilos',
  'pascual', 'puleva', 'president', 'danone', 'nestle', 'nescafe', 'coca cola', 'pepsi', 'fanta', 'sprite', 'aquarius', 'nutella', 'kinder',
  'oreo', 'gallina blanca', 'lechera', 'asturiana', 'kaiku', 'calvo', 'bonduelle', 'barilla', 'gallo', 'brillante', 'sos', 'fallera', 'ybarra',
  'hellmanns', 'heinz', 'knorr', 'maggi', 'ron', 'cola cao', 'nesquik', 'lays', 'pringles', 'campofrio', 'oscar mayer', 'elpozo', 'central lechera',
  'ariel', 'fairy', 'scottex', 'colhogar', 'dodot', 'mahou', 'estrella damm', 'cruzcampo', 'san miguel', 'heineken', 'font vella', 'bezoya', 'vichy',
]

function singular(word: string): string {
  if (word.length > 4 && word.endsWith('es') && /[sxzl]es$|ones$/.test(word)) return word.slice(0, -2)
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1)
  return word
}

function extractBrand(text: string, declared: string | null | undefined): { brand: string | null; rest: string } {
  const keyed = ` ${text} `
  const candidates = [...(declared ? [productTextKey(declared)] : []), ...BRANDS].filter(Boolean).sort((a, b) => b.length - a.length)
  for (const b of candidates) {
    if (keyed.includes(` ${b} `)) return { brand: b, rest: keyed.replace(` ${b} `, ' ').trim() }
  }
  return { brand: null, rest: text }
}

/** Firma comparable de un producto a partir de su nombre (y, si se conoce, su marca guardada). */
export function productSignature(name: string, declaredBrand?: string | null): ProductSignature {
  const size = parseProductSize(name)
  const key = productTextKey(name)
  const withoutSize = productTextKey(stripSize(name))
  const { brand, rest } = extractBrand(withoutSize, declaredBrand)
  const words = rest
    .split(' ')
    .filter(Boolean)
    .map((w) => ABBREVIATIONS[w] ?? w)
    .filter((w) => !STOPWORDS.has(w) && !/^\d+$/.test(w))
    .map(singular)
  const core = [...new Set(words)].sort()
  const variants = core.filter((w) => VARIANT_WORDS.has(w))
  return { key, brand, core, variants, size }
}

export interface RelationVerdict {
  relation: ProductRelation
  /** Frases cortas del porqué (para el panel «¿es el mismo producto?» y para depurar). */
  reasons: string[]
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i])
}

function isSubset(small: readonly string[], big: readonly string[]): boolean {
  return small.every((w) => big.includes(w))
}

/** Clases CAT-1 de ambos si se conocen: solo sirven para descartar. */
export interface ClassHint {
  a?: string | null
  b?: string | null
}

export function compareProducts(
  a: { name: string; brand?: string | null },
  b: { name: string; brand?: string | null },
  classes: ClassHint = {},
): RelationVerdict {
  const sa = productSignature(a.name, a.brand)
  const sb = productSignature(b.name, b.brand)

  if (classes.a && classes.b && classes.a !== classes.b) return { relation: 'different', reasons: ['clases distintas'] }
  if (sa.core.length === 0 || sb.core.length === 0) return { relation: 'different', reasons: ['sin datos suficientes del nombre'] }

  // CATÁLOGO MAESTRO: si ambos artículos se identifican, el catálogo manda en lo que NO son el mismo producto (talla 3 ≠ talla 4, leche entera ≠ semidesnatada,
  // patata fresca ≠ patata frita) y en lo que SÍ lo es aunque el ticket lo escriba distinto («O.V.E.»). Si solo es una sugerencia, nunca sube la relación.
  const catalog = compareIdentities(identifyProduct(a.name, a.brand), identifyProduct(b.name, b.brand))
  if (catalog) {
    if (catalog.relation === 'different') return { relation: 'different', reasons: catalog.reasons }
    if (catalog.relation === 'identical' || catalog.relation === 'equivalent') return catalog
    const old = compareByWords(sa, sb)
    return isAutomatic(old.relation) ? { relation: 'possible', reasons: catalog.reasons } : old
  }
  return compareByWords(sa, sb)
}

/** Las reglas de siempre: palabras del nombre, marca, variantes y tamaño. Es lo que se usa cuando el catálogo maestro no identifica alguno de los dos. */
function compareByWords(sa: ProductSignature, sb: ProductSignature): RelationVerdict {

  // Magnitud de envase: peso con volumen o con recuento no se comparan.
  if (sa.size && sb.size && sa.size.magnitude !== sb.size.magnitude) return { relation: 'different', reasons: ['una se vende por peso/volumen y la otra por unidades'] }

  const sameCore = sameSet(sa.core, sb.core)
  const sameBrand = sa.brand === sb.brand
  const sameSize = sa.size?.magnitude === sb.size?.magnitude && sa.size?.amount === sb.size?.amount

  if (sameCore) {
    if (sameBrand && sameSize) return { relation: 'identical', reasons: ['misma marca, producto y presentación'] }
    // Un solo término genérico («leche», «arroz») no basta: faltaría saber la variante. Sugerencia, no coincidencia.
    if (sa.core.length < 2 && sa.variants.length === 0) return { relation: 'possible', reasons: ['solo coincide una palabra genérica; falta la variante'] }
    if (!sameBrand) return { relation: 'equivalent', reasons: ['mismo producto, distinta marca'] }
    return { relation: 'equivalent', reasons: ['mismo producto, distinto tamaño'] }
  }

  // Variantes que chocan: leche ENTERA vs DESNATADA, con vs «sin lactosa»...
  const va = sa.variants.filter((v) => !NEGATORS.has(v))
  const vb = sb.variants.filter((v) => !NEGATORS.has(v))
  const onlyA = va.filter((v) => !vb.includes(v))
  const onlyB = vb.filter((v) => !va.includes(v))
  if (onlyA.length > 0 && onlyB.length > 0) return { relation: 'different', reasons: [`variantes distintas (${onlyA[0]} / ${onlyB[0]})`] }

  // Uno es el otro más palabras: si las que sobran son variantes, es OTRO producto; si no, puede ser solo una marca desconocida.
  if (isSubset(sa.core, sb.core) || isSubset(sb.core, sa.core)) {
    const extra = isSubset(sa.core, sb.core) ? sb.core.filter((w) => !sa.core.includes(w)) : sa.core.filter((w) => !sb.core.includes(w))
    const variant = extra.find((w) => VARIANT_WORDS.has(w))
    if (variant) {
      // «Leche» a secas puede ser cualquier leche: se sugiere (falta la variante). Con un núcleo ya concreto («arroz redondo» frente a «arroz redondo integral») son productos distintos.
      const bare = isSubset(sa.core, sb.core) ? sa.core : sb.core
      return bare.length < 2 ? { relation: 'possible', reasons: [`falta indicar la variante («${variant}»)`] } : { relation: 'different', reasons: [`una lleva «${variant}» y la otra no`] }
    }
    return { relation: 'possible', reasons: ['parecidos, pero sobra una palabra (¿marca?) que no se reconoce'] }
  }
  return { relation: 'different', reasons: ['productos distintos'] }
}

/** ¿Se aplica sola (alta confianza) o es una sugerencia para que la familia confirme? */
export function isAutomatic(relation: ProductRelation): boolean {
  return relation === 'identical' || relation === 'equivalent'
}
