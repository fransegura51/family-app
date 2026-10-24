import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('@/data/supabaseClient', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }))

import { adjustPointGrant, adjustPointGrantErrorMessage } from '@/data/rewards'

const row = (over: Record<string, unknown> = {}) => ({
  id: 'n1',
  family_id: 'f',
  member_id: 'm',
  amount: -7,
  reason: 'error',
  granted_by: 'u',
  reverses_grant_id: 'g',
  kind: 'anulacion',
  created_at: '2026-10-23T10:00:00Z',
  ...over,
})

beforeEach(() => rpc.mockReset())

describe('adjustPointGrant — siempre por el RPC del servidor, nunca un insert directo', () => {
  it('corregir envía la acción, la cantidad nueva y el motivo recortado', async () => {
    rpc.mockResolvedValue({ data: row({ kind: 'correccion', amount: -3 }), error: null })
    const out = await adjustPointGrant('g', { action: 'corregir', newAmount: 7 }, '  me equivoqué  ')
    expect(rpc).toHaveBeenCalledWith('adjust_point_grant', { p_grant_id: 'g', p_action: 'corregir', p_new_amount: 7, p_reason: 'me equivoqué' })
    expect(out).toMatchObject({ id: 'n1', kind: 'correccion', amount: -3, reversesGrantId: 'g', grantedBy: 'u' })
  })
  it('anular no envía cantidad; el motivo vacío viaja como null (es opcional)', async () => {
    rpc.mockResolvedValue({ data: row(), error: null })
    await adjustPointGrant('g', { action: 'anular' }, '   ')
    expect(rpc).toHaveBeenCalledWith('adjust_point_grant', { p_grant_id: 'g', p_action: 'anular', p_new_amount: null, p_reason: null })
  })
  it.each([
    ['already_annulled', 'ya estaba anulada'],
    ['not_allowed', 'Solo un adulto'],
    ['grant_not_found', 'No se ha encontrado'],
    ['would_make_balance_negative', 'saldo quedaría en negativo'],
    ['invalid_amount', 'entero entre 1 y 10000'],
    ['no_change', 'la misma'],
    ['not_a_grant', 'Dar puntos'],
  ])('el error del servidor «%s» se traduce a una frase clara', async (code, text) => {
    rpc.mockResolvedValue({ data: null, error: { message: code } })
    await expect(adjustPointGrant('g', { action: 'anular' }, null)).rejects.toThrow(text)
  })
  it('un error desconocido no enseña texto técnico', () => {
    expect(adjustPointGrantErrorMessage(new Error('boom: relation "point_grants" does not exist'))).toBe('No se pudo guardar el cambio. Inténtalo de nuevo.')
  })
})
