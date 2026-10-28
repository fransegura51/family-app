// ETIQUETAS MÚLTIPLES CON REPARTO (ETQ-1). Lógica pura, todo en CÉNTIMOS enteros para que el reparto sume SIEMPRE el importe exacto.
//
// Un movimiento lleva una categoría contable y una o varias etiquetas:
//   · Una sola etiqueta (lo de siempre): expenses.tag_id, sin filas de reparto. Recibe el 100 %.
//   · Varias: filas en expense_tag_shares que suman exactamente el importe; tag_id guarda la principal (la mayor parte).
// El movimiento se cuenta UNA sola vez en el total general; cada etiqueta recibe solo su parte. Lo que no esté repartido (por ejemplo, tras borrar una
// etiqueta) cuenta como «Sin etiqueta»: nunca se inventa ni se pierde dinero.
export interface TagShare {
  tagId: string
  amount: number
}

/** Clave de «Sin etiqueta» en los resúmenes por etiqueta. */
export const NO_TAG = ''

export type SharesByExpense = ReadonlyMap<string, readonly TagShare[]>

export const toCents = (n: number): number => Math.round(n * 100)
export const fromCents = (c: number): number => c / 100

/** Reparte `totalCents` en partes proporcionales a `weights` (método del mayor resto): suma EXACTA y sin partes negativas. */
function apportion(totalCents: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0)
  if (weights.length === 0) return []
  if (sum <= 0) return weights.map((_, i) => (i === 0 ? totalCents : 0))
  const raw = weights.map((w) => (totalCents * w) / sum)
  const base = raw.map((r) => Math.floor(r + 1e-9))
  let left = totalCents - base.reduce((s, b) => s + b, 0)
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r + 1e-9) })).sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (const { i } of order) {
    if (left <= 0) break
    base[i] += 1
    left -= 1
  }
  return base
}

/** A partes iguales; los céntimos que sobran van a las primeras etiquetas (100 € entre 3 → 33,34 · 33,33 · 33,33). */
export function splitEqual(total: number, tagIds: readonly string[]): TagShare[] {
  const parts = apportion(toCents(total), tagIds.map(() => 1))
  return tagIds.map((tagId, i) => ({ tagId, amount: fromCents(parts[i]) }))
}

/** Por porcentajes (admite coma). Deben sumar 100 %; el reparto en euros sale exacto, con los céntimos sueltos a quien tenga mayor resto. */
export function splitByPercent(total: number, parts: readonly { tagId: string; percent: string }[], noun: SplitNoun = TAG_NOUN): SplitResult {
  const nums: number[] = []
  for (const p of parts) {
    const n = parseNumber(p.percent)
    if (n == null || n <= 0) return { ok: false, error: `Escribe un porcentaje mayor que cero en cada ${noun.singular}.` }
    nums.push(n)
  }
  const sum = nums.reduce((s, n) => s + n, 0)
  if (Math.abs(sum - 100) > 0.005) return { ok: false, error: `Los porcentajes suman ${fmt(sum)} %: tienen que sumar 100 %.` }
  const cents = apportion(toCents(total), nums)
  return { ok: true, shares: parts.map((p, i) => ({ tagId: p.tagId, amount: fromCents(cents[i]) })) }
}

/** Por importes en euros (admite coma): deben sumar exactamente el importe del movimiento. */
export function splitByAmounts(total: number, parts: readonly { tagId: string; amount: string }[], noun: SplitNoun = TAG_NOUN): SplitResult {
  const out: TagShare[] = []
  for (const p of parts) {
    const n = parseNumber(p.amount)
    if (n == null || n <= 0) return { ok: false, error: `Escribe un importe mayor que cero en cada ${noun.singular}.` }
    out.push({ tagId: p.tagId, amount: fromCents(toCents(n)) })
  }
  const diff = toCents(total) - out.reduce((s, x) => s + toCents(x.amount), 0)
  if (diff !== 0) {
    return { ok: false, error: diff > 0 ? `Faltan ${fmt(fromCents(diff))} € por repartir.` : `Te pasas ${fmt(fromCents(-diff))} €.` }
  }
  return { ok: true, shares: out }
}

export type SplitResult = { ok: true; shares: TagShare[] } | { ok: false; error: string }

/** Cómo se llama lo que se reparte en los mensajes (el mismo editor sirve para etiquetas y para clasificaciones). */
export interface SplitNoun {
  singular: string
  plural: string
}
export const TAG_NOUN: SplitNoun = { singular: 'etiqueta', plural: 'etiquetas' }

function parseNumber(s: string): number | null {
  const t = s.trim().replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

const fmt = (n: number) => n.toFixed(2).replace('.', ',')

export type SplitMode = 'equal' | 'amount' | 'percent'

/** Estado del editor de reparto del formulario: etiquetas elegidas, modo y lo escrito en cada una. */
export interface TagSplitDraft {
  ids: string[]
  mode: SplitMode
  inputs: Record<string, string>
}

/** Resuelve el borrador del formulario contra el importe actual. Con menos de 2 etiquetas no hay reparto (ok con []). */
export function resolveTagSplit(split: TagSplitDraft | null, total: number, noun: SplitNoun = TAG_NOUN): SplitResult {
  if (!split || split.ids.length < 2) return { ok: true, shares: [] }
  if (!Number.isFinite(total) || total <= 0) return { ok: false, error: 'Escribe primero el importe del movimiento para poder repartirlo.' }
  if (split.mode === 'equal') return { ok: true, shares: splitEqual(total, split.ids) }
  if (split.mode === 'percent') return splitByPercent(total, split.ids.map((tagId) => ({ tagId, percent: split.inputs[tagId] ?? '' })), noun)
  return splitByAmounts(total, split.ids.map((tagId) => ({ tagId, amount: split.inputs[tagId] ?? '' })), noun)
}

/** Reparto inicial al añadir una segunda etiqueta: a partes iguales (el usuario puede cambiarlo). */
export function startSplit(ids: readonly string[], total: number): TagSplitDraft {
  const inputs: Record<string, string> = {}
  const shares = Number.isFinite(total) && total > 0 ? splitEqual(total, ids) : []
  for (const s of shares) inputs[s.tagId] = s.amount.toFixed(2)
  return { ids: [...ids], mode: 'equal', inputs }
}

/** Al abrir un movimiento que ya tiene reparto: el borrador parte de sus importes reales (modo «en euros»). */
export function splitFromShares(shares: readonly TagShare[]): TagSplitDraft | null {
  if (shares.length < 2) return null
  const inputs: Record<string, string> = {}
  for (const s of shares) inputs[s.tagId] = s.amount.toFixed(2)
  return { ids: shares.map((s) => s.tagId), mode: 'amount', inputs }
}

/** Cambiar de modo conserva lo ya repartido: euros ↔ porcentajes se convierten, y «iguales» recalcula. */
export function changeSplitMode(split: TagSplitDraft, mode: SplitMode, total: number): TagSplitDraft {
  if (mode === split.mode) return split
  const current = resolveTagSplit(split, total)
  const shares = current.ok && current.shares.length > 0 ? current.shares : Number.isFinite(total) && total > 0 ? splitEqual(total, split.ids) : []
  const inputs: Record<string, string> = {}
  if (mode === 'percent') {
    const pct = apportion(10000, shares.map((s) => toCents(s.amount)))
    for (let i = 0; i < shares.length; i++) inputs[shares[i].tagId] = (pct[i] / 100).toFixed(2)
  } else {
    for (const s of shares) inputs[s.tagId] = s.amount.toFixed(2)
  }
  return { ...split, mode, inputs }
}

/** Añadir o quitar una etiqueta del reparto: se recalcula a partes iguales (lo habitual) para que no quede nada sin sentido. */
export function toggleSplitTag(split: TagSplitDraft, tagId: string, total: number): TagSplitDraft | null {
  const ids = split.ids.includes(tagId) ? split.ids.filter((x) => x !== tagId) : [...split.ids, tagId]
  if (ids.length < 2) return null
  const next = startSplit(ids, total)
  return { ...next, mode: split.mode === 'equal' ? 'equal' : 'amount' }
}

/**
 * ECO-UI-02 — selectores de etiqueta: añadir una etiqueta a un reparto. «A partes iguales» se recalcula; en euros o en % se CONSERVA lo ya escrito en las demás y la nueva
 * recibe lo que falta hasta el total (o queda vacía si no falta nada): nunca se pisan importes personalizados.
 */
export function addSplitTag(split: TagSplitDraft, tagId: string, total: number): TagSplitDraft {
  if (split.ids.includes(tagId)) return split
  const ids = [...split.ids, tagId]
  if (split.mode === 'equal') return startSplit(ids, total)
  const inputs = { ...split.inputs }
  const sum = split.ids.reduce((s, id) => s + (parseNumber(split.inputs[id] ?? '') ?? 0), 0)
  const full = split.mode === 'percent' ? 100 : total
  const missing = Number.isFinite(full) ? Math.round((full - sum) * 100) / 100 : 0
  inputs[tagId] = missing > 0 ? missing.toFixed(2) : ''
  return { ...split, ids, inputs }
}

/** Quita una etiqueta del reparto (null si queda una sola: deja de ser reparto). En euros o en % se conserva lo escrito en las demás; el aviso de suma lo da el editor. */
export function removeSplitTag(split: TagSplitDraft, tagId: string, total: number): TagSplitDraft | null {
  const ids = split.ids.filter((x) => x !== tagId)
  if (ids.length < 2) return null
  if (split.mode === 'equal') return startSplit(ids, total)
  const inputs = { ...split.inputs }
  delete inputs[tagId]
  return { ...split, ids, inputs }
}

/** Cambia una etiqueta del reparto por otra (la nueva hereda la parte de la anterior y conserva su posición). */
export function replaceSplitTag(split: TagSplitDraft, oldId: string, newId: string): TagSplitDraft {
  if (oldId === newId || split.ids.includes(newId)) return split
  const inputs = { ...split.inputs }
  inputs[newId] = inputs[oldId] ?? ''
  delete inputs[oldId]
  return { ...split, ids: split.ids.map((x) => (x === oldId ? newId : x)), inputs }
}

interface ExpenseForShares {
  id: string
  amount: number
  tagId: string | null
}

/** Reparto efectivo de un movimiento: siempre suma su importe. Sin filas → la etiqueta única (o «Sin etiqueta») con el 100 %. */
export function sharesOf(expense: ExpenseForShares, byExpense: SharesByExpense | undefined): TagShare[] {
  const rows = byExpense?.get(expense.id)
  if (rows && rows.length >= 2) {
    const assigned = rows.reduce((s, r) => s + toCents(r.amount), 0)
    const rest = toCents(expense.amount) - assigned
    const out = rows.map((r) => ({ tagId: r.tagId, amount: r.amount }))
    if (rest !== 0) out.push({ tagId: NO_TAG, amount: fromCents(rest) })
    return out
  }
  return [{ tagId: expense.tagId ?? NO_TAG, amount: expense.amount }]
}

export function hasTag(expense: ExpenseForShares, byExpense: SharesByExpense | undefined, tagId: string): boolean {
  return sharesOf(expense, byExpense).some((s) => s.tagId === tagId && s.amount > 0)
}

/** Lo que una etiqueta recibe de este movimiento (0 si no la lleva). */
export function tagAmount(expense: ExpenseForShares, byExpense: SharesByExpense | undefined, tagId: string): number {
  return sharesOf(expense, byExpense).filter((s) => s.tagId === tagId).reduce((s, x) => s + x.amount, 0)
}

export interface TagTotal {
  total: number
  /** Movimientos distintos que llevan la etiqueta (un movimiento repartido cuenta una vez en cada etiqueta, y una sola vez en el total general). */
  count: number
}

/** Total por etiqueta (incluida «Sin etiqueta» con NO_TAG). La suma de todas las etiquetas = la suma de los movimientos, sin duplicar. */
export function totalsByTag(expenses: readonly ExpenseForShares[], byExpense: SharesByExpense | undefined): Map<string, TagTotal> {
  const cents = new Map<string, { c: number; n: number }>()
  for (const e of expenses) {
    for (const s of sharesOf(e, byExpense)) {
      if (s.amount <= 0) continue
      const cur = cents.get(s.tagId) ?? { c: 0, n: 0 }
      cur.c += toCents(s.amount)
      cur.n += 1
      cents.set(s.tagId, cur)
    }
  }
  return new Map([...cents].map(([k, v]) => [k, { total: fromCents(v.c), count: v.n }]))
}
