// INCIDENCIA 31/10/2026 — borrar desde Movimientos el gasto de una compra vinculada dejaba la compra sin vínculo (receipts.expense_id ON DELETE SET NULL). Ahora se rechaza con un
// mensaje claro y el gasto NO se borra; un gasto sin compra vinculada se borra como siempre.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ linked: [] as { id: string }[], deleted: [] as string[], error: null as { message: string } | null }))
vi.mock('@/data/supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({ eq: () => ({ limit: async () => ({ data: table === 'receipts' ? state.linked : [], error: state.error }) }) }),
      delete: () => ({
        eq: async (_col: string, id: string) => {
          state.deleted.push(`${table}:${id}`)
          return { error: null }
        },
      }),
    }),
  },
}))

const { deleteExpense, LINKED_PURCHASE_DELETE_MESSAGE } = await import('@/data/finance')

beforeEach(() => {
  state.linked = []
  state.deleted = []
  state.error = null
})

describe('deleteExpense · protege el vínculo con la compra', () => {
  it('con una compra vinculada NO borra nada y explica por dónde borrarla', async () => {
    state.linked = [{ id: 'receipt-1' }]
    await expect(deleteExpense('expense-1')).rejects.toThrow(LINKED_PURCHASE_DELETE_MESSAGE)
    expect(state.deleted).toEqual([])
  })

  it('sin compra vinculada borra el gasto como siempre', async () => {
    await deleteExpense('expense-2')
    expect(state.deleted).toEqual(['expenses:expense-2'])
  })

  it('si no se puede comprobar el vínculo, tampoco borra (mejor no borrar que perder el vínculo)', async () => {
    state.error = { message: 'sin red' }
    await expect(deleteExpense('expense-3')).rejects.toBeTruthy()
    expect(state.deleted).toEqual([])
  })
})
