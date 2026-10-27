// EVALUACIÓN del normalizador: mide por separado identificación, clase, formato y confianza, y compara con el clasificador por palabras clave anterior.
// Puro. Se usa con el corpus de pruebas (corpus.ts) y, para la prueba limpia, con las líneas de una familia real (docs/EVALUACION_NORMALIZACION.md).
//
// Principios: una clase acertada NO es una identificación completa; los resultados automáticos nunca se mezclan con los corregidos por una persona; y lo que no
// tiene una respuesta esperada se cuenta aparte (no se presume correcto).
import { classifyFoodType } from '../foodTypes'
import { packTotalSize } from '../productSize'
import { CORPUS, type CorpusCase } from './corpus'
import { catalogEntry, identifyProduct, type ProductIdentity } from './identify'

/** Misma tabla que usa el resolutor de clases para las reglas por palabras clave (productClass.ts), para comparar con el comportamiento anterior. */
const OLD_RULE_TO_CLASS: Record<string, string | null> = {
  bebidas_alcoholicas: 'food.bebidas_alcoholicas',
  bebidas_no_alcoholicas: 'food.bebidas_no_alcoholicas',
  congelados: 'food.congelados_helados',
  snacks: 'food.snacks_dulces',
  panaderia: 'food.panaderia_bolleria',
  lacteos: 'food.lacteos_huevos',
  huevos: 'food.huevos',
  pescado: 'food.pescado_marisco',
  carne: 'food.carne',
  fruta: 'food.fruta',
  verdura: 'food.verdura_hortalizas',
  despensa: 'food.despensa',
  otros: null, // «Otros alimentos» por defecto = no reconoce nada
}

/** Clase CAT-1 que daba el clasificador por palabras clave anterior (null = no reconocía nada: «Otros alimentos» por defecto). */
export function oldRuleClassKey(text: string): string | null {
  return OLD_RULE_TO_CLASS[classifyFoodType(text).key] ?? null
}

export type Verdict = 'correcta' | 'incorrecta' | 'sin_identificar' | 'no_aplica'

export interface EvalRow {
  text: string
  expectedKey: string
  expectedClass: string | null
  got: ProductIdentity
  /** Identificación del producto (clave). `~x` esperada = solo clase. */
  identity: Verdict
  /** Clase CAT-1 asignada por el catálogo. */
  klass: Verdict
  /** Clase que habría dado el clasificador anterior (null = no sabe). */
  oldClass: string | null
  oldKlass: Verdict
  /** Atributos esperados (talla, etapa, tipo de leche...) leídos bien. */
  attrs: Verdict
  /** Formato esperado reconocido bien (cantidad total). */
  format: Verdict
  /** ¿Se agruparía sola con otros de la misma clave? (solo si seguro, completo y no de clase) */
  groupable: boolean
}

function expectedPackTotal(pack: string): { magnitude: string; amount: number } | null {
  const m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?) (g|kg|ml|l|ud)$/.exec(pack)
  if (!m) return null
  const size = packTotalSize({ count: Number(m[1]), amount: Number(m[2]), unit: m[3] as 'g' | 'kg' | 'ml' | 'l' | 'ud' })
  return size ? { magnitude: size.magnitude, amount: size.amount } : null
}

export function evaluateCase(c: CorpusCase): EvalRow {
  const got = identifyProduct(c.text)
  const broadExpected = c.key.startsWith('~')
  const expectedKey = broadExpected ? c.key.slice(1) : c.key
  const none = c.key === '-'
  const entry = none ? undefined : catalogEntry(expectedKey)
  const expectedClass = entry?.classKey ?? null

  let identity: Verdict
  if (none) identity = got.entry && got.confidence !== 'dudoso' ? 'incorrecta' : 'correcta'
  else if (!got.entry || got.confidence === 'dudoso') identity = 'sin_identificar'
  else if (got.entry.key === expectedKey) identity = 'correcta'
  else identity = 'incorrecta'

  let klass: Verdict
  if (none || !expectedClass) klass = 'no_aplica'
  else if (!got.classKey || got.confidence === 'dudoso') klass = 'sin_identificar'
  else klass = got.classKey === expectedClass ? 'correcta' : 'incorrecta'

  const old = none ? null : oldRuleClassKey(c.text)
  let oldKlass: Verdict
  if (none || !expectedClass) oldKlass = 'no_aplica'
  else if (!old) oldKlass = 'sin_identificar'
  else oldKlass = old === expectedClass ? 'correcta' : 'incorrecta'

  let attrs: Verdict = 'no_aplica'
  const wanted = Object.entries(c.attrs)
  if (wanted.length > 0) attrs = wanted.every(([k, v]) => got.attrs[k] === v) ? 'correcta' : got.entry ? 'incorrecta' : 'sin_identificar'

  let format: Verdict = 'no_aplica'
  if (c.pack) {
    const want = expectedPackTotal(c.pack)
    const have = got.pack ? packTotalSize(got.pack) : null
    if (!have) format = 'sin_identificar'
    else if (want && have.magnitude === want.magnitude && Math.abs(have.amount - want.amount) < 1e-6) format = 'correcta'
    else format = 'incorrecta'
  }

  return { text: c.text, expectedKey: c.key, expectedClass, got, identity, klass, oldClass: old, oldKlass, attrs, format, groupable: got.identityKey != null }
}

export interface Tally {
  total: number
  correcta: number
  incorrecta: number
  sin_identificar: number
}

const tally = (rows: readonly EvalRow[], pick: (r: EvalRow) => Verdict): Tally => {
  const t: Tally = { total: 0, correcta: 0, incorrecta: 0, sin_identificar: 0 }
  for (const r of rows) {
    const v = pick(r)
    if (v === 'no_aplica') continue
    t.total += 1
    t[v] += 1
  }
  return t
}

export interface EvalSummary {
  lines: number
  identity: Tally
  klass: Tally
  oldKlass: Tally
  attrs: Tally
  format: Tally
  /** Identificaciones «seguro» incorrectas: lo más grave (agrupaciones en cadena). */
  secureWrong: number
  secureTotal: number
  /** Líneas que se agruparían solas, y cuántas de ellas tienen la clave esperada. */
  groupable: number
  groupableWrong: number
}

export function summarize(rows: readonly EvalRow[]): EvalSummary {
  const secure = rows.filter((r) => r.got.confidence === 'seguro' && r.got.entry)
  return {
    lines: rows.length,
    identity: tally(rows, (r) => r.identity),
    klass: tally(rows, (r) => r.klass),
    oldKlass: tally(rows, (r) => r.oldKlass),
    attrs: tally(rows, (r) => r.attrs),
    format: tally(rows, (r) => r.format),
    secureWrong: secure.filter((r) => r.identity === 'incorrecta').length,
    secureTotal: secure.length,
    groupable: rows.filter((r) => r.groupable).length,
    groupableWrong: rows.filter((r) => r.groupable && r.identity === 'incorrecta').length,
  }
}

export function evaluateCorpus(cases: readonly CorpusCase[] = CORPUS): { rows: EvalRow[]; summary: EvalSummary } {
  const rows = cases.map(evaluateCase)
  return { rows, summary: summarize(rows) }
}
