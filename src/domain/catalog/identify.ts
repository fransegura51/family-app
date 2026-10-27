// NORMALIZADOR de artículos de ticket: «LECHE SEMI P-6» → Leche semidesnatada · «PAÑALES T4» → Pañales talla 4.
//
// Puro y determinista (sin red, sin IA, sin datos de ninguna familia). A partir del texto ORIGINAL del ticket —que nunca se modifica— devuelve el producto
// del catálogo maestro, su clase CAT-1, la marca, los atributos que distinguen productos no equivalentes y el formato que dice el nombre, con un nivel de
// confianza que sale de la evidencia (no de un umbral numérico):
//
//   seguro    una sola entrada del catálogo encaja con palabras completas del nombre y nada compite con ella.
//   probable  encaja, pero con una abreviatura poco segura («INF»), un nombre cortado, una marca que solo sugiere el producto, o dos productos de la
//             misma clase compiten. Es una PROPUESTA: sirve para clasificar, nunca para agrupar sola.
//   dudoso    nada encaja, o dos productos de clases distintas compiten: no se identifica ni se agrupa.
//
// Quién manda cuando hay varias entradas posibles: el NOMBRE PRINCIPAL del producto, que es el primero del ticket («QUESADILLA POLLO» es una quesadilla
// y no pollo; «ATUN ACEITE GIRASOL» es atún y no aceite). Entre candidatos que empiezan en el mismo sitio gana el que explica más palabras.
import { parseProductPack, parseProductSize, stripSize, type PackInput, type ParsedSize } from '../productSize'
import { ATTRS } from './attrs'
import { catalogClass } from './classes'
import type { ClassKind } from './classes'
import { CATALOG_ENTRIES } from './catalogData'
import { extractBrand } from './lexicon'
import type { CatalogEntry, PriceBasis } from './parse'
import { expandPhrases, tokenize } from './tokens'

export type MatchConfidence = 'seguro' | 'probable' | 'dudoso'

export interface ProductIdentity {
  /** Texto original del ticket, sin tocar. */
  raw: string
  entry: CatalogEntry | null
  /** Nombre normalizado («Leche semidesnatada»); null si no se identifica. */
  name: string | null
  classKey: string | null
  kind: ClassKind | null
  brand: string | null
  /** Valor de cada atributo del producto (el valor por defecto incluido); null = falta. */
  attrs: Record<string, string | null>
  /** Atributos obligatorios que no se pudieron leer. */
  missing: string[]
  /** Palabras del nombre que no son producto, marca, tamaño ni atributo (un sabor, un relleno, una marca desconocida). */
  leftover: string[]
  size: ParsedSize | null
  pack: PackInput | null
  basis: PriceBasis | null
  confidence: MatchConfidence
  /** Todos los datos obligatorios están: solo así la identidad sirve para agrupar. */
  complete: boolean
  /** Igual en dos artículos = mismo producto. null si no se identifica con seguridad, la identidad está incompleta o la entrada es solo de clase. */
  identityKey: string | null
  reasons: string[]
}

interface BrandHint {
  entry: string
  attrs?: Record<string, string>
  /** La marca hace varios productos (Pascual, Campofrío): solo sugiere cuando nada más encaja y NUNCA cambia lo que el nombre ya dice. */
  weak?: boolean
}

// Marca → producto que suele ser, para cuando el nombre solo trae la marca («FANTA 2L») o para fijar la clase («FANTA NARANJA» es un refresco, no fruta).
// Es una pista: con ella la confianza es «probable».
const BRAND_HINTS: Record<string, BrandHint> = {
  'coca cola': { entry: 'bna.refresco.cola' },
  pepsi: { entry: 'bna.refresco.cola' },
  fanta: { entry: 'bna.refresco' },
  sprite: { entry: 'bna.refresco' },
  schweppes: { entry: 'bna.tonica' },
  aquarius: { entry: 'bna.isotonica' },
  powerade: { entry: 'bna.isotonica' },
  gatorade: { entry: 'bna.isotonica' },
  nestea: { entry: 'bna.te.frio' },
  monster: { entry: 'bna.energetica' },
  'red bull': { entry: 'bna.energetica' },
  'cola cao': { entry: 'desp.cacao.polvo' },
  nesquik: { entry: 'desp.cacao.polvo' },
  nutella: { entry: 'snk.crema.cacao' },
  pringles: { entry: 'snk.patatas.fritas' },
  lays: { entry: 'snk.patatas.fritas' },
  ruffles: { entry: 'snk.patatas.fritas' },
  doritos: { entry: 'snk.nachos' },
  nescafe: { entry: 'desp.cafe.soluble' },
  marcilla: { entry: 'desp.cafe', weak: true },
  dodot: { entry: 'beb.panal' },
  huggies: { entry: 'beb.panal' },
  pampers: { entry: 'beb.panal' },
  dodotis: { entry: 'beb.toallita' },
  almiron: { entry: 'inf.leche.formula' },
  nutriben: { entry: 'inf.leche.formula' },
  aptamil: { entry: 'inf.leche.formula' },
  enfamil: { entry: 'inf.leche.formula' },
  blevit: { entry: 'inf.cereales' },
  whiskas: { entry: 'masc.comida', attrs: { especie: 'gato' } },
  friskies: { entry: 'masc.comida', attrs: { especie: 'gato' } },
  dreamies: { entry: 'masc.snack.gato' },
  pedigree: { entry: 'masc.comida', attrs: { especie: 'perro' } },
  dentastix: { entry: 'masc.snack.perro' },
  catsan: { entry: 'masc.arena' },
  sanicat: { entry: 'masc.arena' },
  skip: { entry: 'limp.detergente' },
  ariel: { entry: 'limp.detergente' },
  persil: { entry: 'limp.detergente' },
  lenor: { entry: 'limp.suavizante' },
  vernel: { entry: 'limp.suavizante' },
  mimosin: { entry: 'limp.suavizante' },
  fairy: { entry: 'limp.lavavajillas' },
  finish: { entry: 'limp.lavavajillas.pastilla' },
  somat: { entry: 'limp.lavavajillas.pastilla' },
  scottex: { entry: 'limp.papel.higienico' },
  colhogar: { entry: 'limp.papel.cocina' },
  kleenex: { entry: 'limp.panuelo' },
  albal: { entry: 'limp.papel.aluminio' },
  colgate: { entry: 'cui.dentifrico' },
  signal: { entry: 'cui.dentifrico' },
  sensodyne: { entry: 'cui.dentifrico' },
  listerine: { entry: 'cui.enjuague' },
  pantene: { entry: 'cui.champu' },
  elvive: { entry: 'cui.champu' },
  fructis: { entry: 'cui.champu' },
  rexona: { entry: 'cui.desodorante' },
  gillette: { entry: 'cui.maquinilla' },
  evax: { entry: 'cui.compresa' },
  ausonia: { entry: 'cui.compresa' },
  tampax: { entry: 'cui.tampon' },
  durex: { entry: 'cui.preservativo' },
  mahou: { entry: 'bal.cerveza' },
  cruzcampo: { entry: 'bal.cerveza' },
  'san miguel': { entry: 'bal.cerveza' },
  heineken: { entry: 'bal.cerveza' },
  'estrella damm': { entry: 'bal.cerveza' },
  'estrella galicia': { entry: 'bal.cerveza' },
  amstel: { entry: 'bal.cerveza' },
  damm: { entry: 'bal.cerveza' },
  alhambra: { entry: 'bal.cerveza' },
  budweiser: { entry: 'bal.cerveza' },
  'font vella': { entry: 'bna.agua' },
  bezoya: { entry: 'bna.agua' },
  lanjaron: { entry: 'bna.agua' },
  evian: { entry: 'bna.agua' },
  pascual: { entry: 'lac.leche', weak: true },
  puleva: { entry: 'lac.leche', weak: true },
  campofrio: { entry: 'emb.otros', weak: true },
  elpozo: { entry: 'emb.otros', weak: true },
  'oscar mayer': { entry: 'emb.otros', weak: true },
}

interface AliasRef {
  entry: CatalogEntry
  alias: string[]
  order: number
}

let ALIASES: AliasRef[] | null = null
let BY_TOKEN: Map<string, AliasRef[]> | null = null
let BY_KEY: Map<string, CatalogEntry> | null = null

function build(): void {
  if (ALIASES) return
  const aliases: AliasRef[] = []
  const byToken = new Map<string, AliasRef[]>()
  const byKey = new Map<string, CatalogEntry>()
  CATALOG_ENTRIES.forEach((entry, i) => {
    byKey.set(entry.key, entry)
    for (const alias of entry.aliases) {
      const ref: AliasRef = { entry, alias, order: i }
      aliases.push(ref)
      for (const t of new Set(alias)) {
        const list = byToken.get(t) ?? []
        list.push(ref)
        byToken.set(t, list)
      }
    }
  })
  ALIASES = aliases
  BY_TOKEN = byToken
  BY_KEY = byKey
}

export function catalogEntry(key: string): CatalogEntry | undefined {
  build()
  return BY_KEY?.get(key)
}

interface Candidate {
  ref: AliasRef
  head: number
  count: number
  /** Palabras del nombre que encajaron (las del ticket, aunque vengan cortadas). */
  matched: string[]
  truncated: boolean
}

function candidates(tokens: readonly string[], truncated: boolean): Candidate[] {
  build()
  const refs = new Set<AliasRef>()
  if (!truncated) {
    for (const t of new Set(tokens)) for (const r of BY_TOKEN?.get(t) ?? []) refs.add(r)
  } else {
    for (const r of ALIASES ?? []) refs.add(r)
  }
  const out: Candidate[] = []
  for (const ref of refs) {
    if (ref.entry.not.some((n) => tokens.includes(n))) continue
    const positions: number[] = []
    const matched: string[] = []
    let ok = true
    let usedTruncation = false
    for (const at of ref.alias) {
      let idx = tokens.indexOf(at)
      if (idx < 0 && truncated) {
        // Nombre cortado por el ticket («EMPAN» por «empanadilla»): solo palabras de 4 letras o más y que no sean ya otra palabra completa del catálogo.
        idx = tokens.findIndex((t) => t.length >= 4 && t !== at && at.startsWith(t) && !BY_TOKEN?.has(t))
        if (idx >= 0) usedTruncation = true
      }
      if (idx < 0) {
        ok = false
        break
      }
      positions.push(idx)
      matched.push(tokens[idx])
    }
    if (!ok || (truncated && !usedTruncation)) continue
    out.push({ ref, head: Math.min(...positions), count: ref.alias.length, matched, truncated: usedTruncation })
  }
  return out
}

function best(list: Candidate[]): { top: Candidate[]; chosen: Candidate | null } {
  if (list.length === 0) return { top: [], chosen: null }
  const sorted = [...list].sort((a, b) => a.head - b.head || b.count - a.count || a.ref.order - b.ref.order)
  const first = sorted[0]
  const top = sorted.filter((c) => c.head === first.head && c.count === first.count)
  return { top, chosen: first }
}

function removeOnce(tokens: string[], words: readonly string[]): void {
  for (const w of words) {
    const i = tokens.indexOf(w)
    if (i >= 0) tokens.splice(i, 1)
  }
}

const NOISE_LEFT = new Set(['mini', 'extra', 'nuevo', 'nueva', 'lata'])

const none = (raw: string, brand: string | null, size: ParsedSize | null, pack: PackInput | null, leftover: string[], reasons: string[]): ProductIdentity => ({
  raw,
  entry: null,
  name: null,
  classKey: null,
  kind: null,
  brand,
  attrs: {},
  missing: [],
  leftover,
  size,
  pack,
  basis: null,
  confidence: 'dudoso',
  complete: false,
  identityKey: null,
  reasons,
})

// Las listas de Compras y las estadísticas piden la clase del mismo nombre muchas veces: el resultado es puro, así que se recuerda.
const CACHE = new Map<string, ProductIdentity>()
const CACHE_MAX = 5000

/** Interpreta el texto de un artículo de ticket. `declaredBrand` es la marca que la familia ya guardó para el producto, si la hay. */
export function identifyProduct(raw: string, declaredBrand?: string | null, confirmedKey?: string | null): ProductIdentity {
  const key = [raw ?? '', declaredBrand ?? '', confirmedKey ?? ''].join('\u0000')
  const hit = CACHE.get(key)
  if (hit) return hit
  const out = compute(raw, declaredBrand, confirmedKey)
  if (CACHE.size >= CACHE_MAX) CACHE.clear()
  CACHE.set(key, out)
  return out
}

function compute(raw: string, declaredBrand?: string | null, confirmedKey?: string | null): ProductIdentity {
  build()
  // Producto CONFIRMADO o corregido por la familia (products.catalog_product_key): manda sobre lo que adivine el catálogo.
  const forced = confirmedKey ? BY_KEY?.get(confirmedKey) : undefined
  const original = raw ?? ''
  const size = parseProductSize(original)
  const pack = parseProductPack(original)
  const withoutSize = expandPhrases(stripSize(original))
  const { brand, rest } = extractBrand(withoutSize, declaredBrand)
  const reasons: string[] = []

  const first = tokenize(rest)
  const tokens = first.tokens
  const hint = brand ? BRAND_HINTS[brand] : undefined
  const hinted = hint ? BY_KEY?.get(hint.entry) : undefined
  if (tokens.length === 0 && !hinted && !forced) return none(original, brand, size, pack, [], ['sin palabras de producto'])

  // La marca fija la CLASE («FANTA NARANJA» es un refresco, no fruta): solo compiten entradas de esa clase.
  // Palabras que fijan la CLASE sin ser el producto: «gato» o «perro» en un nombre es de mascotas («LATA GATO ATUN» no es atún en lata).
  const petCue = tokens.some((t) => t === 'perro' || t === 'gato' || t === 'mascota')
  const byCue = (list: Candidate[]) => {
    if (!petCue) return list
    const pets = list.filter((c) => c.ref.entry.classKey === 'other.mascotas')
    return pets.length > 0 ? pets : list
  }
  const sameClass = (list: Candidate[]) => byCue(hinted && !hint?.weak ? list.filter((c) => c.ref.entry.classKey === hinted.classKey) : list)
  let confidence: MatchConfidence = 'seguro'
  let { top, chosen } = best(sameClass(candidates(tokens, false)))
  if (!chosen) {
    ;({ top, chosen } = best(sameClass(candidates(tokens, true))))
    if (chosen) {
      confidence = 'probable'
      reasons.push('nombre cortado en el ticket')
    }
  }
  let entry: CatalogEntry
  let aliasTokens: readonly string[] = []
  if (forced) {
    entry = forced
    top = []
    // Las palabras del nombre que ya dicen qué producto es (sus alias y su nombre) no son diferencia; lo que sobra (un sabor, un relleno) sí.
    const nameWords = tokenize(forced.name).tokens
    aliasTokens = chosen?.ref.entry === forced ? chosen.matched : [...forced.aliases.flatMap((a) => a.filter((w) => tokens.includes(w))), ...nameWords.filter((w) => tokens.includes(w))]
    confidence = 'seguro'
    reasons.length = 0
    reasons.push('confirmado por la familia')
  } else if (hinted && (!chosen || (!hint?.weak && (chosen.ref.entry.broad || chosen.count === 1) && chosen.ref.entry !== hinted))) {
    entry = hinted
    top = []
    // Las palabras del nombre que ya dice la marca-producto («PATATAS» en «PATATAS LAYS») no son diferencia.
    aliasTokens = [...hinted.aliases.flatMap((a) => a.filter((w) => tokens.includes(w))), ...(chosen?.matched ?? [])]
    // Con un tipo genérico de la misma clase («REFRESCO COCA COLA») marca y nombre coinciden; con solo la marca es una propuesta.
    if (!chosen) {
      confidence = 'probable'
      reasons.push(`solo trae la marca (${brand})`)
    }
  } else if (chosen) {
    entry = chosen.ref.entry
    aliasTokens = chosen.matched
  } else {
    return none(original, brand, size, pack, tokens, ['ningún producto del catálogo encaja'])
  }

  // Competencia entre entradas distintas con la misma fuerza.
  const keys = [...new Set(top.map((c) => c.ref.entry.key))]
  if (keys.length > 1) {
    const classes = new Set(top.map((c) => c.ref.entry.classKey))
    if (classes.size > 1) return none(original, brand, size, pack, tokens, [`dos productos de clases distintas encajan por igual (${keys.slice(0, 2).join(' / ')})`])
    confidence = 'probable'
    reasons.push('dos productos parecidos encajan por igual')
  }
  if (!forced && chosen && top.length > 0 && chosen.count === 1 && chosen.head > 0 && confidence === 'seguro') {
    confidence = 'probable'
    reasons.push('la palabra del producto no es la primera del nombre')
  }
  if (!forced && first.soft.length > 0 && confidence === 'seguro') {
    confidence = 'probable'
    reasons.push(`abreviatura poco segura (${first.soft.join(', ')})`)
  }

  // Atributos. Se leen ANTES de quitar las palabras del producto (una palabra puede ser a la vez del nombre y del atributo: «leche CRECIMIENTO»).
  const left = [...tokens]
  let text = rest
  const attrs: Record<string, string | null> = {}
  const missing: string[] = []
  for (const { id, required } of entry.attrs) {
    const def = ATTRS[id]
    let value: string | null = null
    if (def.numeric) {
      const m = def.numeric.re.exec(text)
      if (m) {
        value = m[1]
        text = text.replace(m[0], ' ')
        removeOnce(left, tokenize(m[0]).tokens) // «talla», «4», «t4» dejan de contar como resto
      }
    }
    if (value == null) {
      for (const v of def.values) {
        const hit = v.phrases.find((ph) => ph.length > 0 && ph.every((w) => left.includes(w)))
        if (hit) {
          value = v.value
          removeOnce(left, hit)
          if (def.numeric?.bareDigit) removeOnce(left, [v.value]) // «leche crecimiento 3»: el 3 repite la etapa
          break
        }
      }
    }
    if (value == null && def.numeric?.bareDigit) {
      const at = left.findIndex((w) => /^[1-4]$/.test(w))
      if (at >= 0) {
        value = left[at]
        left.splice(at, 1)
        if (confidence === 'seguro' && !forced) confidence = 'probable'
        reasons.push('la etapa es un número suelto del nombre')
      }
    }
    if (value == null && hint?.attrs?.[id]) value = hint.attrs[id]
    if (value == null && def.defaultValue !== undefined) value = def.defaultValue
    attrs[id] = value
    if (value == null && required) missing.push(id)
  }
  removeOnce(left, aliasTokens)
  const leftover = left.filter((w) => (w.length > 1 || /^\d$/.test(w)) && !NOISE_LEFT.has(w)).sort()

  const complete = missing.length === 0
  if (!complete) reasons.push(`falta ${missing.join(', ')}`)
  const cls = catalogClass(entry.classKey)
  const identityKey = confidence === 'seguro' && complete && !entry.broad ? [entry.key, ...entry.attrs.map((a) => `${a.id}=${attrs[a.id] ?? ''}`), leftover.join(' ')].join('|') : null
  return {
    raw: original,
    entry,
    name: displayName(entry, attrs),
    classKey: entry.classKey,
    kind: cls?.kind ?? entry.kind,
    brand,
    attrs,
    missing,
    leftover,
    size,
    pack,
    basis: entry.basis,
    confidence,
    complete,
    identityKey,
    reasons,
  }
}

function displayName(entry: CatalogEntry, attrs: Record<string, string | null>): string {
  const parts: string[] = [entry.name]
  for (const { id } of entry.attrs) {
    const def = ATTRS[id]
    const v = attrs[id]
    if (v == null || v === def.defaultValue) continue
    const spec = def.values.find((x) => x.value === v)
    const label = spec?.label || def.numeric?.label(v) || ''
    if (label && !entry.name.toLowerCase().includes(label.toLowerCase())) parts.push(label)
  }
  return parts.join(' ')
}

// ─── Comparación de dos identidades ───

export type CatalogRelation = 'identical' | 'equivalent' | 'possible' | 'different'

export interface CatalogVerdict {
  relation: CatalogRelation
  reasons: string[]
}

/**
 * ¿Son el mismo producto según el catálogo? null = el catálogo no puede opinar (alguno no se identifica o solo se conoce su clase): quien llama sigue con
 * sus reglas de siempre. Productos distintos del catálogo NUNCA son equivalentes (pañal talla 3 ≠ talla 4, leche entera ≠ semidesnatada, patata fresca ≠ frita).
 */
export function compareIdentities(a: ProductIdentity, b: ProductIdentity, options: { ignoreSize?: boolean } = {}): CatalogVerdict | null {
  if (!a.entry || !b.entry || a.confidence === 'dudoso' || b.confidence === 'dudoso') return null
  if (a.entry.broad || b.entry.broad) return null
  if (a.entry.key !== b.entry.key) return { relation: 'different', reasons: [`productos distintos: ${a.entry.name} / ${b.entry.name}`] }
  let possible = false
  const reasons: string[] = []
  for (const { id } of a.entry.attrs) {
    const va = a.attrs[id]
    const vb = b.attrs[id]
    if (va != null && vb != null) {
      if (va !== vb) return { relation: 'different', reasons: [`${id} distinto (${va} / ${vb})`] }
    } else if (va != null || vb != null) {
      possible = true
      reasons.push(`en uno falta indicar ${id}`)
    } else if (a.missing.includes(id)) {
      possible = true
      reasons.push(`falta indicar ${id}`)
    }
  }
  // Una palabra cortada por el ticket («CAC» por «cacao») es la misma palabra.
  const sameWord = (x: string, y: string) => x === y || (Math.min(x.length, y.length) >= 3 && (x.startsWith(y) || y.startsWith(x)))
  const onlyA = a.leftover.filter((w) => !b.leftover.some((o) => sameWord(w, o)))
  const onlyB = b.leftover.filter((w) => !a.leftover.some((o) => sameWord(w, o)))
  if (onlyA.length > 0 && onlyB.length > 0) return { relation: 'different', reasons: [`variantes distintas (${onlyA[0]} / ${onlyB[0]})`] }
  if (onlyA.length > 0 || onlyB.length > 0) {
    possible = true
    reasons.push('una lleva una palabra más que no se reconoce (¿marca o variante?)')
  }
  if (!options.ignoreSize && a.size && b.size && a.size.magnitude !== b.size.magnitude) return { relation: 'different', reasons: ['una se vende por peso/volumen y la otra por unidades'] }
  if (a.confidence !== 'seguro' || b.confidence !== 'seguro') {
    possible = true
    reasons.push('identificación probable, no segura')
  }
  if (possible) return { relation: 'possible', reasons }
  const sameSize = a.size?.magnitude === b.size?.magnitude && a.size?.amount === b.size?.amount
  if (a.brand === b.brand && sameSize) return { relation: 'identical', reasons: ['mismo producto, marca y presentación'] }
  return { relation: 'equivalent', reasons: [a.brand !== b.brand ? 'mismo producto, distinta marca' : 'mismo producto, distinto tamaño'] }
}
