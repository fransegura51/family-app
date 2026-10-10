import { describe, expect, it } from 'vitest'
import { conceptsForWalletType, GOAL_EMOJI_OPTIONS } from '@/domain/kidWalletConcepts'

// Pequeños Grandes, Fase 9 (orden de recuperación de requisitos, autorización directa del usuario
// 2026-10-10) — "conceptos con emojis (niños que no leen)".
describe('conceptsForWalletType', () => {
  it('ingreso y gasto tienen cada uno su propio catálogo, con emoji en todas', () => {
    const income = conceptsForWalletType('ingreso')
    const expense = conceptsForWalletType('gasto')
    expect(income.length).toBeGreaterThan(0)
    expect(expense.length).toBeGreaterThan(0)
    for (const c of [...income, ...expense]) {
      expect(c.emoji.length).toBeGreaterThan(0)
      expect(c.label.length).toBeGreaterThan(0)
    }
  })
  it('ingreso y gasto no comparten catálogo (conceptos distintos para cada uno)', () => {
    const incomeKeys = new Set(conceptsForWalletType('ingreso').map((c) => c.key))
    const expenseKeys = new Set(conceptsForWalletType('gasto').map((c) => c.key))
    for (const k of incomeKeys) expect(expenseKeys.has(k)).toBe(false)
  })
  it('ahorro e impuesto no tienen catálogo propio — el formulario sigue con solo texto libre', () => {
    expect(conceptsForWalletType('ahorro')).toEqual([])
    expect(conceptsForWalletType('impuesto')).toEqual([])
  })
})

describe('GOAL_EMOJI_OPTIONS (Fase 10)', () => {
  it('catálogo cerrado no vacío, nunca duplicados', () => {
    expect(GOAL_EMOJI_OPTIONS.length).toBeGreaterThan(0)
    expect(new Set(GOAL_EMOJI_OPTIONS).size).toBe(GOAL_EMOJI_OPTIONS.length)
  })
})
