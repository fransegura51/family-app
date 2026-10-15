import { asRecord } from '../_shared/ai/validate.ts'

// Datos REALES de Eurostat (API pública de difusión, sin clave) para el artículo semanal de investigación.
//
// Principios (especificación, «Artículos oficiales de investigación»): solo fuentes externas fiables, con fecha y metodología, sin datos inventados.
//   · Las FUENTES (título, editorial, enlace, fecha) las construye este código a partir del catálogo y de la fecha que devuelve Eurostat: la IA nunca
//     escribe un enlace.
//   · Las CIFRAS del artículo salen de los datos descargados y se VERIFICAN por código: todo número del texto debe estar en los datos (o ser una cifra
//     calculada aquí a partir de ellos). Si no, el artículo se descarta.
//   · Si la API falla o los datos no son suficientes, NO hay artículo.
//
// Documentación: https://ec.europa.eu/eurostat/web/user-guides/data-browser/api-data-access/api-getting-started/api
//   Formato: GET {base}/{dataset}?format=JSON&lang=EN&geo=ES&geo=EU27_2020&coicop=CP01&unit=RCH_A_AVG&sinceTimePeriod=2020  → JSON-stat 2.0
//   (dimensiones en `id`, tamaños en `size`, valores en `value` como objeto disperso: posición plana = Σ índice_i × zancada_i).
// Códigos verificados contra la API real el 15/10/2026.

export const EUROSTAT_API_BASE = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data'
export const eurostatBrowserUrl = (dataset: string): string => `https://ec.europa.eu/eurostat/databrowser/view/${dataset}/default/table?lang=en`

export const GEO_SPAIN = 'ES'
export const GEO_EU = 'EU27_2020'

export interface EurostatEntry {
  // Identificador interno (estable) del indicador.
  id: string
  // Conjunto de datos de Eurostat.
  dataset: string
  // Filtros de la consulta (dimensiones con un solo valor).
  filters: Record<string, string>
  // Título del indicador (para la ficha de la fuente y el texto).
  title: string
  // Qué mide, en lenguaje llano (se lo damos a la IA para que no invente su significado).
  measure: string
  // Unidad en la que se expresan los números del artículo.
  unit: string
  // Multiplicador de los valores brutos (por mil → por cien = 0,1).
  scale: number
  // Año desde el que se piden datos: hace `yearsBack` años, o el fijo si la serie no es anual continua.
  yearsBack?: number
  sinceFixed?: number
  // Número mínimo de periodos con dato en España Y en la UE para considerar el conjunto suficiente.
  minCommonPeriods: number
  // Tema del catálogo de Comunidad (community_topics) donde se publicará el artículo.
  topicId: string
  // Cifras que pueden aparecer en el texto aparte de los datos (base del índice, nombre «UE-27»...).
  extraNumbers: number[]
}

// CATÁLOGO CORTO Y CURADO. Para cambiar de indicador o añadir otro basta editar esta lista (códigos de Eurostat).
export const EUROSTAT_CATALOG: EurostatEntry[] = [
  {
    id: 'food-inflation',
    dataset: 'prc_hicp_aind',
    filters: { coicop: 'CP01', unit: 'RCH_A_AVG' },
    title: 'IPCA anual: alimentos y bebidas no alcohólicas',
    measure: 'cuánto han subido o bajado de media los precios de los alimentos y bebidas no alcohólicas respecto al año anterior',
    unit: '%',
    scale: 1,
    yearsBack: 6,
    minCommonPeriods: 4,
    topicId: 'ahorro-economia',
    extraNumbers: [27],
  },
  {
    id: 'housing-energy-inflation',
    dataset: 'prc_hicp_aind',
    filters: { coicop: 'CP04', unit: 'RCH_A_AVG' },
    title: 'IPCA anual: vivienda, agua, electricidad, gas y otros combustibles',
    measure: 'cuánto han subido o bajado de media los precios de la vivienda, el agua, la electricidad, el gas y otros combustibles respecto al año anterior',
    unit: '%',
    scale: 1,
    yearsBack: 6,
    minCommonPeriods: 4,
    topicId: 'ahorro-economia',
    extraNumbers: [27],
  },
  {
    id: 'food-budget-share',
    dataset: 'hbs_str_t211',
    filters: { coicop: 'CP01' },
    title: 'Estructura del gasto de los hogares: alimentos y bebidas no alcohólicas',
    measure: 'qué parte del gasto total de los hogares se va en alimentos y bebidas no alcohólicas (encuesta de presupuestos familiares, cada cinco años)',
    unit: '% del gasto del hogar',
    scale: 0.1, // Eurostat lo da «por mil»
    sinceFixed: 2010,
    minCommonPeriods: 2,
    topicId: 'ahorro-economia',
    extraNumbers: [27],
  },
  {
    id: 'housing-budget-share',
    dataset: 'hbs_str_t211',
    filters: { coicop: 'CP04' },
    title: 'Estructura del gasto de los hogares: vivienda, agua, electricidad, gas y otros combustibles',
    measure: 'qué parte del gasto total de los hogares se va en vivienda, agua, electricidad, gas y otros combustibles (encuesta de presupuestos familiares, cada cinco años)',
    unit: '% del gasto del hogar',
    scale: 0.1,
    sinceFixed: 2010,
    minCommonPeriods: 2,
    topicId: 'ahorro-economia',
    extraNumbers: [27],
  },
]

// Cada semana toca un indicador distinto (rotación por número de semana del año: no se repite el tema semana tras semana).
export function pickEntry(weekMonday: string, catalog: EurostatEntry[] = EUROSTAT_CATALOG): EurostatEntry {
  const [y, m, d] = weekMonday.split('-').map(Number)
  const dayOfYear = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86_400_000)
  return catalog[Math.floor(dayOfYear / 7) % catalog.length]
}

export function buildEurostatUrl(entry: EurostatEntry, nowYear: number): string {
  const q = new URLSearchParams()
  q.set('format', 'JSON')
  q.set('lang', 'EN')
  q.append('geo', GEO_SPAIN)
  q.append('geo', GEO_EU)
  for (const [k, v] of Object.entries(entry.filters)) q.set(k, v)
  q.set('sinceTimePeriod', String(entry.sinceFixed ?? nowYear - (entry.yearsBack ?? 6)))
  return `${EUROSTAT_API_BASE}/${entry.dataset}?${q.toString()}`
}

export interface DataPoint {
  geo: string
  period: string
  value: number
}
export interface EurostatDataset {
  entry: EurostatEntry
  // Fecha (YYYY-MM-DD) de la última actualización del conjunto, tal como la informa Eurostat.
  updated: string
  label: string
  points: DataPoint[]
}

const round1 = (n: number): number => Math.round(n * 10) / 10

// Posición de cada código dentro de una dimensión JSON-stat (el índice puede ser un objeto código→posición o una lista ordenada de códigos).
function categoryIndex(dim: unknown): Record<string, number> | null {
  const cat = asRecord(asRecord(dim)?.category)
  const index = cat?.index
  if (Array.isArray(index)) return Object.fromEntries(index.map((code, i) => [String(code), i]))
  const rec = asRecord(index)
  if (!rec) return null
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(rec)) {
    if (typeof v !== 'number') return null
    out[k] = v
  }
  return out
}

// Interpreta la respuesta JSON-stat de Eurostat. Devuelve null si no tiene la forma esperada (nunca inventa un dato).
export function parseJsonStat(json: unknown, entry: EurostatEntry): EurostatDataset | null {
  const rec = asRecord(json)
  if (!rec || rec.class !== 'dataset') return null
  const ids = rec.id
  const sizes = rec.size
  const dims = asRecord(rec.dimension)
  if (!Array.isArray(ids) || !Array.isArray(sizes) || ids.length !== sizes.length || !dims) return null
  if (!ids.every((x) => typeof x === 'string') || !sizes.every((x) => typeof x === 'number' && Number.isInteger(x) && x >= 0)) return null

  const geoPos = ids.indexOf('geo')
  const timePos = ids.indexOf('time')
  if (geoPos < 0 || timePos < 0) return null
  // Todas las demás dimensiones deben tener un único valor (los filtros del catálogo): si no, la lectura sería ambigua.
  if (sizes.some((s: number, i: number) => i !== geoPos && i !== timePos && s !== 1)) return null

  const geoIndex = categoryIndex(dims.geo)
  const timeIndex = categoryIndex(dims.time)
  if (!geoIndex || !timeIndex) return null

  // Zancadas: el índice plano de (geo g, tiempo t) es g × zancada_geo + t × zancada_tiempo.
  const strides: number[] = []
  let acc = 1
  for (let i = sizes.length - 1; i >= 0; i--) {
    strides[i] = acc
    acc *= sizes[i] as number
  }

  const values = rec.value
  const valueAt = (flat: number): unknown => (Array.isArray(values) ? values[flat] : asRecord(values)?.[String(flat)])

  const points: DataPoint[] = []
  for (const [geo, g] of Object.entries(geoIndex)) {
    for (const [period, t] of Object.entries(timeIndex)) {
      const raw = valueAt(g * strides[geoPos] + t * strides[timePos])
      if (typeof raw !== 'number' || !Number.isFinite(raw)) continue
      points.push({ geo, period, value: round1(raw * entry.scale) })
    }
  }

  const updatedRaw = typeof rec.updated === 'string' ? rec.updated : ''
  const updated = /^\d{4}-\d{2}-\d{2}/.test(updatedRaw) ? updatedRaw.slice(0, 10) : ''
  if (!updated) return null
  return { entry, updated, label: typeof rec.label === 'string' ? rec.label : entry.title, points }
}

export interface FetchDeps {
  fetchFn?: typeof fetch
  now?: () => Date
  timeoutMs?: number
}

// Descarga y lee un indicador. null si la API falla (red, estado HTTP, formato) o si los datos no bastan: en ese caso NO hay artículo.
export async function fetchEurostat(entry: EurostatEntry, deps: FetchDeps = {}): Promise<EurostatDataset | null> {
  const fetchFn = deps.fetchFn ?? fetch
  const nowYear = (deps.now ?? (() => new Date()))().getUTCFullYear()
  try {
    const res = await fetchFn(buildEurostatUrl(entry, nowYear), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(deps.timeoutMs ?? 20_000),
    })
    if (!res.ok) {
      await res.body?.cancel()
      console.error('[community-weekly] Eurostat respondió', res.status)
      return null
    }
    const dataset = parseJsonStat(await res.json(), entry)
    if (!dataset) return null
    return commonRows(dataset).length >= entry.minCommonPeriods ? dataset : null
  } catch (err) {
    console.error('[community-weekly] fallo al consultar Eurostat:', String(err))
    return null
  }
}

export interface CommonRow {
  period: string
  es: number
  eu: number
  // España menos la Unión Europea (en las mismas unidades), redondeada a un decimal.
  diff: number
}

// Periodos con dato en España Y en la UE, de más antiguo a más reciente.
export function commonRows(ds: EurostatDataset): CommonRow[] {
  const es = new Map(ds.points.filter((p) => p.geo === GEO_SPAIN).map((p) => [p.period, p.value]))
  const eu = new Map(ds.points.filter((p) => p.geo === GEO_EU).map((p) => [p.period, p.value]))
  return [...es.keys()]
    .filter((period) => eu.has(period))
    .sort()
    .map((period) => ({ period, es: es.get(period)!, eu: eu.get(period)!, diff: round1(es.get(period)! - eu.get(period)!) }))
}

export interface Facts {
  rows: CommonRow[]
  // Cambio de España y de la UE entre el primer y el último periodo común (calculado aquí).
  esChange: number
  euChange: number
  // Claves de TODAS las cifras que el texto puede usar.
  allowed: Set<string>
  // Claves de las cifras que son valores de los datos (no años ni derivadas): el artículo debe usar varias.
  dataValues: Set<string>
}

// Clave canónica de un número: 11,60 y 11.6 → «11.6»; el signo no cuenta (el texto lo expresa con «subió/bajó»).
export function numberKey(n: number): string {
  return String(Math.abs(Number(n.toFixed(2))))
}

export function buildFacts(ds: EurostatDataset): Facts {
  const rows = commonRows(ds)
  const first = rows[0]
  const last = rows[rows.length - 1]
  const esChange = round1(last.es - first.es)
  const euChange = round1(last.eu - first.eu)
  const allowed = new Set<string>()
  const dataValues = new Set<string>()
  for (const p of ds.points) {
    allowed.add(numberKey(p.value))
    dataValues.add(numberKey(p.value))
    allowed.add(numberKey(Number(p.period)))
  }
  for (const r of rows) allowed.add(numberKey(r.diff))
  allowed.add(numberKey(esChange))
  allowed.add(numberKey(euChange))
  allowed.add(numberKey(Number(ds.updated.slice(0, 4))))
  for (const n of ds.entry.extraNumbers) allowed.add(numberKey(n))
  return { rows, esChange, euChange, allowed, dataValues }
}

// Números que aparecen escritos en un texto («11,6», «2,5 %», «2024»), como claves canónicas. Los separadores de miles («1.234») se interpretan como tales.
export function extractNumbers(text: string): string[] {
  const out: string[] = []
  for (const token of text.match(/\d+(?:[.,]\d+)*/g) ?? []) {
    let t = token
    if (t.includes('.') && t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '')
    else t = t.replace(',', '.')
    const n = Number(t)
    out.push(Number.isFinite(n) ? numberKey(n) : t)
  }
  return out
}

export interface NumberCheck {
  ok: boolean
  unknown: string[]
  dataValuesUsed: number
}

// VERIFICACIÓN: todo número del texto debe estar en los datos descargados (o ser una cifra calculada a partir de ellos) y el texto debe apoyarse en al menos
// `minDataValues` valores reales. Si no, el artículo se descarta.
export function verifyNumbers(texts: string[], facts: Facts, minDataValues = 3): NumberCheck {
  const used = texts.flatMap(extractNumbers)
  const unknown = [...new Set(used.filter((k) => !facts.allowed.has(k)))]
  const dataValuesUsed = new Set(used.filter((k) => facts.dataValues.has(k))).size
  return { ok: unknown.length === 0 && dataValuesUsed >= minDataValues, unknown, dataValuesUsed }
}

// Número con coma decimal española («11,6»).
export const formatEs = (n: number): string => String(n).replace('.', ',')

// Fecha YYYY-MM-DD → «06/02/2026».
export const formatDateEs = (iso: string): string => iso.split('-').reverse().join('/')
