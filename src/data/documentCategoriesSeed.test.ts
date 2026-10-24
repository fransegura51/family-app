// Documentos (24/10/2026): una familia nueva recibe las carpetas de siempre al abrir Documentos; una que ya tiene carpetas no recibe nada.
import { beforeEach, describe, expect, it, vi } from 'vitest'

let stored: { id: string; family_id: string; name: string }[] = []
const inserts: string[] = []

vi.mock('@/data/supabaseClient', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: (table: string) => {
      if (table === 'profiles') return { select: () => ({ eq: () => ({ single: async () => ({ data: { family_id: 'f1' } }) }) }) }
      return {
        select: () => ({ order: async () => ({ data: [...stored], error: null }) }),
        insert: async (row: { family_id: string; name: string }) => {
          inserts.push(row.name)
          stored.push({ id: String(stored.length), family_id: row.family_id, name: row.name })
          return { error: null }
        },
      }
    },
  },
}))

import { listDocumentCategories } from '@/data/documentCategories'

beforeEach(() => {
  stored = []
  inserts.length = 0
})

describe('categorías de Documentos por defecto', () => {
  it('una familia sin carpetas recibe Privada, Educación, Casa y Familia', async () => {
    const list = await listDocumentCategories()
    expect(inserts).toEqual(['Privada', 'Educación', 'Casa', 'Familia'])
    expect(list.map((c) => c.name)).toEqual(['Privada', 'Educación', 'Casa', 'Familia'])
  })

  it('una familia que ya tiene carpetas no recibe ninguna más', async () => {
    stored = [{ id: 'x', family_id: 'f1', name: 'Coche' }]
    const list = await listDocumentCategories()
    expect(inserts).toEqual([])
    expect(list.map((c) => c.name)).toEqual(['Coche'])
  })
})
