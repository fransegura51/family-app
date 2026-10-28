// CAT-2 — buscador del selector de categorías: por nombre, por la categoría de arriba y por CONCEPTO (el mismo reconocimiento que clasifica los
// movimientos del banco: escribir «netflix», «endesa» o «gasolina» lleva a su categoría). No hay otra tabla de sinónimos: se reutiliza el clasificador.
import { findRule, normalizeConcept, resolveCategoryName, type FamilyCategoryRef } from '../../supabase/functions/_shared/bank/classifyMovement.ts'
import type { BudgetCategory } from '@/domain/types'

export interface CategoryHit {
  category: BudgetCategory
  /** «Vivienda y hogar › Electricidad» para una subcategoría; el propio nombre para una principal. */
  path: string
  /** Por qué sale: el nombre contiene lo escrito, o el concepto (comercio) se reconoce como de esa categoría. */
  via: 'nombre' | 'concepto'
}

const WORD_SPLIT = / +/

function pathOf(category: BudgetCategory, all: readonly BudgetCategory[]): string {
  const parent = category.parentId ? all.find((c) => c.id === category.parentId) : undefined
  return parent ? `${parent.name} › ${category.name}` : category.name
}

/**
 * Categorías que casan con lo escrito. Primero las que empiezan por ello, luego las que lo contienen, y por último la que el clasificador asocia al
 * concepto. Sin acentos ni mayúsculas. Solo categorías del grupo pedido (gastos o ingresos). Máximo `limit`.
 */
export function searchCategories(all: readonly BudgetCategory[], query: string, flow: 'gasto' | 'ingreso', limit = 12): CategoryHit[] {
  const q = normalizeConcept(query).trim()
  if (q === '') return []
  const pool = all.filter((c) => (flow === 'ingreso' ? c.budgetGroup === 'ingresos' : c.budgetGroup !== 'ingresos'))
  const tokens = q.split(WORD_SPLIT)
  const hits: { hit: CategoryHit; rank: number }[] = []
  const seen = new Set<string>()

  for (const category of pool) {
    const name = normalizeConcept(category.name)
    const path = normalizeConcept(pathOf(category, pool))
    const parentName = category.parentId ? normalizeConcept(pool.find((c) => c.id === category.parentId)?.name ?? '') : ''
    const allTokensIn = (text: string) => tokens.every((t) => text.includes(` ${t}`) || text.includes(t))
    let rank = -1
    if (name.includes(` ${q}`)) rank = name.startsWith(` ${q}`) ? 0 : 1
    else if (allTokensIn(name)) rank = 2
    else if (parentName && allTokensIn(path)) rank = 3
    if (rank >= 0) {
      seen.add(category.id)
      hits.push({ hit: { category, path: pathOf(category, pool), via: 'nombre' }, rank })
    }
  }

  const refs: FamilyCategoryRef[] = pool.map((c) => ({ name: c.name, catalogKey: c.catalogKey, budgetGroup: c.budgetGroup }))
  const rule = findRule(` ${q} `, flow)
  const resolved = rule ? resolveCategoryName(rule.key, flow, refs) : null
  if (resolved) {
    const category = pool.find((c) => c.name === resolved.name)
    if (category && !seen.has(category.id)) hits.push({ hit: { category, path: pathOf(category, pool), via: 'concepto' }, rank: 4 })
  }

  return hits
    .sort((a, b) => a.rank - b.rank || a.hit.path.localeCompare(b.hit.path, 'es'))
    .slice(0, limit)
    .map((h) => h.hit)
}

/** Nombres de las categorías más usadas (por nº de movimientos), de más a menos, sin las internas ni las pendientes. */
export function frequentCategoryNames(rows: readonly { category: string | null }[], valid: ReadonlySet<string>, max = 4): string[] {
  const counts = new Map<string, number>()
  for (const r of rows) {
    if (!r.category || !valid.has(r.category) || r.category === 'Otros') continue
    counts.set(r.category, (counts.get(r.category) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
    .slice(0, max)
    .map(([name]) => name)
}
