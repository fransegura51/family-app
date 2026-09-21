// PRESENTACIÓN BREVE de Economía. PEPA es un asistente familiar, no un informe contable: por defecto contesta
// corto, natural, con la conclusión primero y casi sin cifras ("bastante más", "sobre todo", "una parte
// importante"). El motor NO cambia: estas funciones leen exactamente el mismo `Analysis` que los textos
// completos (financeAnalysis) y solo deciden cómo contarlo. El detalle (importes, diferencias, porcentajes,
// desglose) sigue disponible bajo petición: "dame las cifras", "¿cuánto exactamente?", "desglósamelo"...
import {
  aLabel,
  baselineLabel,
  categoryMovers,
  MOVER_MIN_EUR,
  noData,
  rankCutCandidates,
  STABLE_PCT,
  whenLead,
  type Analysis,
  type CategoryChange,
} from '@/domain/financeAnalysis'
import { categoryParentName, formatEuros, spendingRows, sum, type FinanceData } from '@/domain/financeCompute'

export interface BriefAnswer {
  text: string
  // Lo mencionado por orden (categorías): permite "¿y cuál es la segunda?" sin volver a empezar el análisis.
  items?: string[]
}

export const OFFER_FIGURES = 'Si quieres las cifras, dímelo.'

// ─── Lenguaje cualitativo ───

type Direction = 'more' | 'less' | 'same'
type Size = 'same' | 'slight' | 'clear' | 'big'

function sizeOf(pct: number | null, diff: number | null): Size {
  if (diff === null || diff === 0) return 'same'
  if (pct === null) return 'clear'
  const p = Math.abs(pct)
  if (p < STABLE_PCT) return 'same'
  if (p < 15) return 'slight'
  if (p < 40) return 'clear'
  return 'big'
}

function directionOf(diff: number | null): Direction {
  return diff === null || diff === 0 ? 'same' : diff > 0 ? 'more' : 'less'
}

const COMPARATIVE: Record<Exclude<Direction, 'same'>, Record<Exclude<Size, 'same'>, string>> = {
  more: { slight: 'algo más', clear: 'bastante más', big: 'mucho más' },
  less: { slight: 'algo menos', clear: 'bastante menos', big: 'mucho menos' },
}

function comparative(dir: Direction, size: Size): string {
  return dir === 'same' || size === 'same' ? 'prácticamente lo mismo' : COMPARATIVE[dir][size]
}

// "unos 280 €", "unos 1.250 €": una cifra redondeada, solo cuando hace falta para entender.
function roughEuros(n: number): string {
  const step = n < 100 ? 5 : n < 1000 ? 10 : 50
  return `unos ${formatEuros(Math.round(n / step) * step)}`
}

function fractionWord(share: number): string {
  if (share >= 75) return 'la mayor parte'
  if (share >= 50) return 'más de la mitad'
  if (share >= 33) return 'un tercio o más'
  if (share >= 20) return 'una parte importante'
  return 'una parte pequeña'
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}

function bankNote(a: Analysis): string {
  return a.dataQuality.bankStale ? ' Ojo: la conexión del banco está caducada, así que puede faltar gasto reciente.' : ''
}

function emptyText(a: Analysis): string | null {
  const empty = noData(a)
  return empty ? empty.map((f) => f.text).join(' ') : null
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1)
}

// "Este mes estáis gastando bastante más que el mismo tramo del mes pasado."
function spendSentence(a: Analysis): string | null {
  if (a.expenses.difference === null) return null
  const dir = directionOf(a.expenses.difference)
  const size = sizeOf(a.expenses.percentChange, a.expenses.difference)
  const lead = whenLead(a)
  if (size === 'same') return `${lead} ${a.period.ongoing ? 'vais' : 'fuisteis'} prácticamente igual que ${baselineLabel(a)}.`
  return `${lead} ${a.period.ongoing ? 'estáis gastando' : 'gastasteis'} ${comparative(dir, size)} que ${baselineLabel(a)}.`
}

function driverOf(a: Analysis): { rise: CategoryChange | null; fall: CategoryChange | null; explains: boolean } {
  const { rise, fall } = categoryMovers(a)
  const d = a.expenses.difference
  const driver = d !== null && d > 0 ? rise : d !== null && d < 0 ? fall : null
  const explains = !!driver && d !== null && d !== 0 && Math.abs(driver.difference) / Math.abs(d) >= 0.5
  return { rise, fall, explains }
}

// ─── Composiciones breves ───

// "Analiza nuestros gastos" (y el respaldo de código cuando la IA no está disponible).
export function briefOverview(a: Analysis): BriefAnswer {
  const empty = emptyText(a)
  if (empty) return { text: empty + bankNote(a) }
  const parts: string[] = []
  const spend = spendSentence(a)
  if (spend) {
    // Una sola cifra, la del total, redondeada.
    parts.push(spend.replace(/\.$/, ` (${roughEuros(a.expenses.total)}).`))
  } else {
    parts.push(`${whenLead(a)} ${a.period.ongoing ? 'lleváis' : 'habéis gastado'} ${roughEuros(a.expenses.total)}, pero no tengo gasto del periodo anterior con el que compararlo.`)
  }
  if (a.savings.total !== null) {
    const up = (a.expenses.difference ?? 0) > 0
    parts.push(a.savings.total >= 0 ? (up ? 'Aun así seguís ahorrando.' : 'Y seguís ahorrando.') : 'Y estáis gastando más de lo que ingresáis.')
  }
  const { rise, fall, explains } = driverOf(a)
  const top = a.categories[0]
  if (rise && explains) parts.push(`Lo que más ha subido es ${rise.name}${fall ? `, y ${fall.name} ha bajado` : ''}.`)
  else if (fall && (a.expenses.difference ?? 0) < 0) parts.push(`Lo que más ha bajado es ${fall.name}.`)
  else if (top) parts.push(`Lo que más pesa es ${top.name}.`)
  parts.push(OFFER_FIGURES + bankNote(a))
  return { text: parts.join(' '), items: [rise?.name, fall?.name, top?.name].filter((n): n is string => !!n).filter((n, i, all) => all.indexOf(n) === i) }
}

export function briefWhereMoney(a: Analysis): BriefAnswer {
  const empty = emptyText(a)
  if (empty) return { text: empty + bankNote(a) }
  const top = a.categories.slice(0, 3)
  if (top.length === 0) return { text: 'Todavía no tengo gasto que repartir.' }
  const first = top[0]
  const rest = top.slice(1).map((c) => c.name)
  let text = `Lo que más pesa ${lowerFirst(whenLead(a))} es ${first.name}`
  text += rest.length > 0 ? `, y después ${listNames(rest)}.` : '.'
  if (first.share >= 50) text += ` ${first.name} se lleva ${fractionWord(first.share)} del gasto.`
  text += ` ${OFFER_FIGURES}${bankNote(a)}`
  return { text, items: top.map((c) => c.name) }
}

export function briefTopIncrease(a: Analysis): BriefAnswer {
  const empty = emptyText(a)
  if (empty) return { text: empty + bankNote(a) }
  if (!a.hasPrevious) return { text: `No tengo gasto en ${a.cp.previousLabel} con el que comparar.` }
  const { rise, explains } = driverOf(a)
  if (!rise) return { text: `Ninguna categoría ha subido de forma llamativa respecto ${aLabel(baselineLabel(a))}. ${OFFER_FIGURES}` }
  const size = sizeOf(rise.previous > 0 ? (rise.difference / rise.previous) * 100 : null, rise.difference)
  const how = size === 'big' ? 'mucho' : size === 'clear' ? 'bastante' : 'algo'
  return { text: `La categoría que más ha subido es ${rise.name} (${how}).${explains ? ' Explica buena parte del aumento.' : ''} ${OFFER_FIGURES}${bankNote(a)}`, items: [rise.name] }
}

export function briefChanges(a: Analysis): BriefAnswer {
  const empty = emptyText(a)
  if (empty) return { text: empty + bankNote(a) }
  const parts: string[] = []
  const spend = spendSentence(a)
  parts.push(spend ?? 'No tengo gasto del periodo anterior con el que comparar.')
  const { rise, fall } = categoryMovers(a)
  if (rise) parts.push(`Sube sobre todo ${rise.name}${fall ? ` y baja ${fall.name}` : ''}.`)
  else if (fall) parts.push(`Baja sobre todo ${fall.name}.`)
  if (a.savings.total !== null && a.savings.previous !== null) {
    const d = a.savings.total - a.savings.previous
    if (Math.abs(d) >= MOVER_MIN_EUR) parts.push(d > 0 ? 'Estáis ahorrando algo más.' : 'Estáis ahorrando algo menos.')
  }
  parts.push(OFFER_FIGURES + bankNote(a))
  return { text: parts.join(' '), items: [rise?.name, fall?.name].filter((n): n is string => !!n) }
}

export function briefSavingsTrend(a: Analysis, premise: 'more' | 'less' | null): BriefAnswer {
  if (a.savings.total === null) return { text: `No tengo ingresos registrados ${a.period.label}, así que no puedo saber cómo va el ahorro.${bankNote(a)}` }
  if (a.savings.previous === null) return { text: `No tengo ingresos y gastos del periodo anterior para saber si ahorráis más o menos.${bankNote(a)}` }
  const d = a.savings.total - a.savings.previous
  const dir = directionOf(Math.abs(d) < 1 ? 0 : d)
  const parts: string[] = []
  if (premise && dir !== premise) parts.push(dir === 'same' ? 'En realidad estáis ahorrando lo mismo.' : `En realidad estáis ahorrando ${dir === 'more' ? 'más' : 'menos'}, no ${premise === 'more' ? 'más' : 'menos'}.`)
  const base = a.savings.previous !== 0 ? Math.abs(a.savings.previous) : Math.abs(a.savings.total)
  const size = sizeOf(base > 0 ? (d / base) * 100 : null, Math.abs(d) < 1 ? 0 : d)
  parts.push(`${whenLead(a)} estáis ahorrando ${comparative(dir, size)} que ${baselineLabel(a)}.`)
  if (dir !== 'same' && a.income.previous !== null && a.expenses.previous !== null) {
    const di = a.income.total - a.income.previous
    const de = a.expenses.total - a.expenses.previous
    const cause = Math.abs(de) >= Math.abs(di) ? (de > 0 ? 'gastáis más' : 'gastáis menos') : di > 0 ? 'ingresáis más' : 'ingresáis menos'
    parts.push(`Sobre todo porque ${cause}.`)
  }
  parts.push(OFFER_FIGURES + bankNote(a))
  return { text: parts.join(' ') }
}

// "¿Qué podríamos hacer para ahorrar un poco más?" — dónde se ve margen, sin órdenes.
export function briefCuts(a: Analysis): BriefAnswer {
  const empty = emptyText(a)
  if (empty) return { text: empty + bankNote(a) }
  const ranked = rankCutCandidates(a)
  if (ranked.length === 0) return { text: `Con los datos de ${a.period.label} no veo gastos variables que revisar: casi todo es fijo o necesario.${bankNote(a)}` }
  const names = ranked.map((l) => l.name)
  const allWants = ranked.every((l) => l.necessity === 'quiero')
  const parts = [`${whenLead(a) === 'Este mes' ? 'Este mes veo' : `${whenLead(a)} veo`} margen sobre todo en ${listNames(names)}.`]
  parts.push(allWants ? `Son gastos no esenciales, los más fáciles de ajustar. Yo empezaría revisando ${names.length > 1 ? 'esas' : 'esa'}.` : `Son gastos que no son fijos, así que son los que más margen dan. Yo empezaría por ${names.length > 1 ? 'ahí' : 'ahí'}.`)
  if (!a.leaf.some((l) => l.necessity !== null || l.fixed !== null)) parts.push('Como no tenéis marcado qué es fijo o esencial, me baso solo en cuánto pesa cada cosa.')
  parts.push(OFFER_FIGURES + bankNote(a))
  return { text: parts.join(' '), items: names }
}

// "¿Por qué?" tras una sugerencia: explicación CONCEPTUAL, sin importes.
export function briefWhyCuts(a: Analysis): BriefAnswer {
  const empty = emptyText(a)
  if (empty) return { text: empty + bankNote(a) }
  const ranked = rankCutCandidates(a)
  if (ranked.length === 0) return { text: 'Porque casi todo lo que gastáis es fijo o necesario, y ahí hay poco margen.' }
  const names = ranked.map((l) => l.name)
  const wants = ranked.filter((l) => l.necessity === 'quiero').map((l) => l.name)
  const rose = ranked.filter((l) => l.previous > 0 && l.amount - l.previous >= MOVER_MIN_EUR).map((l) => l.name)
  const share = a.expenses.total > 0 ? (ranked.reduce((s, l) => s + l.amount, 0) / a.expenses.total) * 100 : 0
  const parts: string[] = []
  parts.push(
    wants.length > 0
      ? `Porque ${listNames(names)} ${names.length > 1 ? 'son' : 'es'} de los gastos que no son fijos ni imprescindibles, y esos son los que más se pueden ajustar.`
      : `Porque ${listNames(names)} no ${names.length > 1 ? 'son' : 'es'} un gasto fijo, y los gastos variables son los que más se pueden ajustar.`,
  )
  if (rose.length > 0) parts.push(`Además, ${listNames(rose)} ${rose.length > 1 ? 'han subido' : 'ha subido'} respecto ${aLabel(baselineLabel(a))}.`)
  if (share >= 20) parts.push(`Entre ${names.length > 1 ? 'las dos' : 'ella'} suponen ${fractionWord(share)} del gasto.`)
  parts.push('No significa que gastéis de más: es solo por dónde miraría primero.')
  return { text: parts.join(' '), items: names }
}

// "¿Por qué?" tras un análisis o una comparación: explicación conceptual del cambio.
export function briefWhyChanged(a: Analysis, premise: 'more' | 'less' | null): BriefAnswer {
  const empty = emptyText(a)
  if (empty) return { text: empty + bankNote(a) }
  if (a.expenses.difference === null) return { text: 'No tengo gasto del periodo anterior, así que no puedo saber qué ha cambiado.' + bankNote(a) }
  const d = a.expenses.difference
  const dir = directionOf(Math.abs(a.expenses.percentChange ?? 100) < STABLE_PCT ? 0 : d)
  const parts: string[] = []
  if (premise && dir !== premise) parts.push(dir === 'same' ? 'En realidad el gasto está prácticamente igual.' : `En realidad ${a.period.label === 'este mes' ? 'este mes' : a.period.label} gastáis ${dir === 'more' ? 'más' : 'menos'}, no ${premise === 'more' ? 'más' : 'menos'}.`)
  const { rise, fall } = categoryMovers(a)
  if (dir === 'same') parts.push('El gasto está casi igual, sin cambios que expliquen nada especial.')
  else if (dir === 'more') parts.push(rise ? `Sobre todo por ${rise.name}${a.categories.filter((c) => c.difference >= MOVER_MIN_EUR && c.name !== rise.name).length > 0 ? ` y algo más repartido` : ''}.` : 'Está repartido entre varias categorías; ninguna lo explica por sí sola.')
  else parts.push(fall ? `Sobre todo porque ${fall.name} ha bajado.` : 'Está repartido entre varias categorías; ninguna lo explica por sí sola.')
  const p = a.purchaseChange
  if (p.available && dir !== 'same') {
    const price = Math.abs(p.priceEffect)
    const qty = Math.abs(p.quantityEffect) + Math.abs(p.newProducts) + Math.abs(p.removedProducts)
    if (price + qty >= 1) parts.push(price > qty * 1.5 ? 'En la compra parece influir sobre todo el precio de los productos.' : qty > price * 1.5 ? 'En la compra parece que es más por lo que se compra que por subidas de precio.' : 'En la compra influyen tanto los precios como lo que se compra.')
  } else if (!p.available && dir !== 'same') {
    parts.push('No tengo tickets suficientes para saber si es por precios o por cantidades.')
  }
  parts.push(OFFER_FIGURES + bankNote(a))
  return { text: parts.join(' '), items: [rise?.name, fall?.name].filter((n): n is string => !!n) }
}

export function briefAttention(a: Analysis): BriefAnswer {
  const empty = emptyText(a)
  if (empty) return { text: empty + bankNote(a) }
  const parts: string[] = []
  const items: string[] = []
  const { rise, fall } = categoryMovers(a)
  if (rise) {
    const size = sizeOf(rise.previous > 0 ? (rise.difference / rise.previous) * 100 : null, rise.difference)
    parts.push(`${rise.name} ha subido ${size === 'big' ? 'mucho' : size === 'clear' ? 'bastante' : 'algo'} respecto ${aLabel(baselineLabel(a))}.`)
    items.push(rise.name)
  }
  if (fall && parts.length < 2) {
    parts.push(`${fall.name} ha bajado.`)
    items.push(fall.name)
  }
  if (a.newCategories.length > 0 && parts.length < 3) parts.push(`Aparece gasto en ${a.newCategories[0]} que no había antes.`)
  if (a.necessity.quieroShare !== null && a.necessity.quieroShare >= 30 && parts.length < 3) parts.push(`${fractionWord(a.necessity.quieroShare)[0].toUpperCase()}${fractionWord(a.necessity.quieroShare).slice(1)} del gasto es no esencial.`)
  if (parts.length === 0) return { text: `Con los datos de ${a.period.label} no destaca nada especial. ${OFFER_FIGURES}${bankNote(a)}` }
  parts.push('Es solo lo que destaca en los números; no tiene por qué ser un problema. ' + OFFER_FIGURES + bankNote(a))
  return { text: parts.join(' '), items }
}

// Un solo bloque de categoría ("¿y solo alimentación?", "¿y cuál es la segunda?").
export function briefCategoryFocus(a: Analysis, name: string, data: FinanceData): BriefAnswer {
  const under = (e: { category: string }) => e.category === name || categoryParentName(e.category, data.categories) === name
  const nowRows = spendingRows(data, a.cp.current.from, a.cp.current.to).filter(under)
  const prevRows = spendingRows(data, a.cp.previous.from, a.cp.previous.to).filter(under)
  const amount = sum(nowRows)
  const parts: string[] = []
  if (a.hasPrevious) {
    const before = sum(prevRows)
    const d = amount - before
    const size = sizeOf(before > 0 ? (d / before) * 100 : null, Math.abs(d) < 1 ? 0 : d)
    parts.push(`En ${name} ${a.period.ongoing ? 'estáis gastando' : 'gastasteis'} ${comparative(directionOf(Math.abs(d) < 1 ? 0 : d), size)} que ${baselineLabel(a)} (${roughEuros(amount)}).`)
  } else {
    parts.push(`En ${name} ${a.period.ongoing ? 'lleváis' : 'habéis gastado'} ${roughEuros(amount)}, pero no tengo periodo anterior con el que compararlo.`)
  }
  const inside = new Map<string, number>()
  for (const e of nowRows) inside.set(e.category, (inside.get(e.category) ?? 0) + e.amount)
  const top = [...inside.entries()].sort((x, y) => y[1] - x[1])[0]
  if (inside.size > 1 && top) parts.push(`Lo que más pesa dentro es ${top[0]}.`)
  parts.push(OFFER_FIGURES + bankNote(a))
  return { text: parts.join(' ') }
}

// "Explícamelo más sencillo": UNA frase, palabras de cada día.
export function briefSimpler(a: Analysis): BriefAnswer {
  const empty = emptyText(a)
  if (empty) return { text: empty + bankNote(a) }
  const dir = directionOf(a.expenses.difference)
  const size = sizeOf(a.expenses.percentChange, a.expenses.difference)
  const { rise, fall } = categoryMovers(a)
  if (a.expenses.difference === null) return { text: `En pocas palabras: ${a.period.ongoing ? 'de momento habéis gastado' : 'gastasteis'} ${roughEuros(a.expenses.total)}.` }
  if (size === 'same') return { text: 'En pocas palabras: vais casi igual que antes.' }
  const why = dir === 'more' ? (rise ? `, sobre todo por ${rise.name}` : '') : fall ? `, sobre todo porque ${fall.name} ha bajado` : ''
  return { text: `En pocas palabras: gastáis ${comparative(dir, size)} que antes${why}.` }
}

