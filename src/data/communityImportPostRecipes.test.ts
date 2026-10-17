import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('@/data/supabaseClient', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }))

import { importPostRecipes } from '@/data/community'

describe('importPostRecipes (community_import_post_recipes)', () => {
  beforeEach(() => rpc.mockReset())

  it('es UNA llamada con la publicación, las claves elegidas, la clave de idempotencia y «reuse» por defecto; devuelve el resultado en camelCase', async () => {
    rpc.mockResolvedValue({
      data: { ok: true, replayed: false, post_id: 'p1', recipes: [{ id: 'r1', key: 'migas', title: 'Migas', created: true }], recipes_created: 1, recipes_reused: 0 },
      error: null,
    })
    const r = await importPostRecipes('p1', ['migas'], 'k-1')
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('community_import_post_recipes', { p_post: 'p1', p_keys: ['migas'], p_idempotency_key: 'k-1', p_duplicate_recipes: 'reuse' })
    expect(r.recipesCreated).toBe(1)
    expect(r.recipes[0]).toEqual({ id: 'r1', key: 'migas', title: 'Migas', created: true })
    expect(r.replayed).toBe(false)
  })

  it('los errores propios salen con su frase en español y los de Comunidad siguen siendo los de Comunidad', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'KEY_REUSED' } })
    await expect(importPostRecipes('p1', ['a'], 'k')).rejects.toThrow(/otras opciones/)
    rpc.mockResolvedValue({ data: null, error: { message: 'NO_FAMILY' } })
    await expect(importPostRecipes('p1', ['a'], 'k')).rejects.toThrow(/no tiene una familia/)
    rpc.mockResolvedValue({ data: null, error: { message: 'NOT_AVAILABLE' } })
    await expect(importPostRecipes('p1', ['a'], 'k')).rejects.toThrow(/ya no está disponible/)
  })
})
