import { describe, expect, it } from 'vitest'
import { PAGE_SIZE, fetchAllRows } from '@/data/paginate'

function fakeTable(total: number) {
  const calls: [number, number][] = []
  const page = async (from: number, to: number) => {
    calls.push([from, to])
    const data = Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => ({ id: from + i }))
    return { data, error: null }
  }
  return { page, calls }
}

describe('fetchAllRows', () => {
  it('devuelve todas las filas cuando hay más de una página (el caso del corte a 1000)', async () => {
    const { page, calls } = fakeTable(2250)
    const rows = await fetchAllRows(page)
    expect(rows).toHaveLength(2250)
    expect(rows[0].id).toBe(0)
    expect(rows[2249].id).toBe(2249)
    expect(calls).toEqual([
      [0, PAGE_SIZE - 1],
      [PAGE_SIZE, 2 * PAGE_SIZE - 1],
      [2 * PAGE_SIZE, 3 * PAGE_SIZE - 1],
    ])
  })

  it('hace una sola petición cuando la primera página ya es corta', async () => {
    const { page, calls } = fakeTable(546)
    const rows = await fetchAllRows(page)
    expect(rows).toHaveLength(546)
    expect(calls).toHaveLength(1)
  })

  it('con exactamente una página llena pide una segunda (vacía) para confirmar el final', async () => {
    const { page, calls } = fakeTable(PAGE_SIZE)
    const rows = await fetchAllRows(page)
    expect(rows).toHaveLength(PAGE_SIZE)
    expect(calls).toHaveLength(2)
  })

  it('una tabla vacía devuelve [] sin fallar', async () => {
    const { page } = fakeTable(0)
    expect(await fetchAllRows(page)).toEqual([])
  })

  it('propaga el error de Supabase en vez de devolver datos a medias', async () => {
    const page = async () => ({ data: null, error: { message: 'permission denied' } })
    await expect(fetchAllRows(page)).rejects.toEqual({ message: 'permission denied' })
  })
})
