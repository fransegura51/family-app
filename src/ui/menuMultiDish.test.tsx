// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MenuEntry, Recipe } from '@/domain/types'

vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))
vi.mock('@/state/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/ui/community/useCommunityVisible', () => ({ useCommunityVisible: () => false }))
vi.mock('@/state/useRealtimeRefresh', () => ({ useRealtimeRefresh: vi.fn() }))

const food = vi.hoisted(() => ({
  listMenuEntries: vi.fn(),
  listRecipes: vi.fn(),
  setMenuEntry: vi.fn(),
  updateMenuEntry: vi.fn(),
  deleteMenuEntry: vi.fn(),
  reorderMenuEntries: vi.fn(),
  copyMenuEntries: vi.fn(),
}))
vi.mock('@/data/food', async (orig) => ({ ...(await orig<typeof import('@/data/food')>()), ...food }))

import { MenuTab } from '@/ui/AlimentacionScreen'
import { useRealtimeRefresh } from '@/state/useRealtimeRefresh'
import { shoppableEntries, kitchenMenuShopping } from '@/domain/kitchenMenuShopping'

const TODAY = new Date()
const pad = (n: number) => String(n).padStart(2, '0')
const ds = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
// La semana que enseña la pantalla empieza HOY (siete días seguidos).
const monday = new Date(TODAY)
monday.setHours(12, 0, 0, 0)
const MON = ds(monday)
const TUE = ds(new Date(monday.getTime() + 86400000))

const rec = (id: string, title: string, ings: { name: string; quantity: string | null; unit: string | null }[]): Recipe =>
  ({ id, familyId: 'F', title, notes: null, imagePath: null, tags: [], servings: 4, servingsSource: null, ingredients: ings.map((i, n) => ({ id: `${id}-${n}`, ...i })) }) as unknown as Recipe
const RECIPES = [
  rec('r1', 'Lentejas', [{ name: 'Lentejas', quantity: '400', unit: 'g' }, { name: 'Zanahoria', quantity: '2', unit: null }]),
  rec('r2', 'Ensalada', [{ name: 'Lechuga', quantity: '1', unit: null }, { name: 'Zanahoria', quantity: '1', unit: null }]),
]
const e = (id: string, date: string, meal: MenuEntry['mealType'], recipeId: string | null, freeText: string | null, sortOrder: number): MenuEntry => ({ id, familyId: 'F', entryDate: date, mealType: meal, recipeId, freeText, sortOrder })
const THREE = [e('e1', MON, 'comida', 'r1', null, 1), e('e2', MON, 'comida', 'r2', null, 2), e('e3', MON, 'comida', null, 'Fruta de temporada', 3)]

beforeEach(() => {
  vi.clearAllMocks()
  food.listRecipes.mockResolvedValue(RECIPES)
  food.listMenuEntries.mockResolvedValue(THREE)
  for (const k of ['setMenuEntry', 'updateMenuEntry', 'deleteMenuEntry', 'reorderMenuEntries']) (food as Record<string, ReturnType<typeof vi.fn>>)[k].mockResolvedValue(undefined)
  food.copyMenuEntries.mockImplementation(async (c: unknown[]) => c.length)
})
afterEach(() => cleanup())

const open = async () => {
  render(
    <MemoryRouter>
      <MenuTab onOpenRecipe={() => undefined} />
    </MemoryRouter>,
  )
  await screen.findByText('Fruta de temporada')
  return (document.querySelector('[aria-label="Más platos de Comida"]') as HTMLElement).parentElement as HTMLElement
}

describe('Menú semanal — varios platos en una comida', () => {
  it('una comida con tres platos los enseña uno debajo de otro, en su orden, sin etiquetas de primer/segundo plato', async () => {
    const slot = await open()
    const text = slot.textContent ?? ''
    expect(text.indexOf('Lentejas')).toBeLessThan(text.indexOf('Ensalada'))
    expect(text.indexOf('Ensalada')).toBeLessThan(text.indexOf('Fruta de temporada'))
    expect(text).not.toMatch(/Primer plato|Segundo plato|Postre/)
    expect(screen.getByRole('button', { name: '+ Añadir otro plato' })).toBeTruthy()
  })

  it('con un solo plato la presentación es la de siempre: sin flechas de orden', async () => {
    food.listMenuEntries.mockResolvedValue([THREE[0]])
    render(
      <MemoryRouter>
        <MenuTab onOpenRecipe={() => undefined} />
      </MemoryRouter>,
    )
    await screen.findByText(/Lentejas/)
    expect(screen.queryByRole('button', { name: /^Subir / })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Bajar / })).toBeNull()
    expect(screen.getByRole('button', { name: '+ Añadir otro plato' })).toBeTruthy()
  })

  it('«+ Añadir otro plato» añade un plato nuevo SIN tocar los que ya había', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: '+ Añadir otro plato' }))
    const picker = document.querySelector('.menu-picker') as HTMLElement
    fireEvent.change(within(picker).getByPlaceholderText('o texto libre'), { target: { value: 'Yogur' } })
    fireEvent.click(within(picker).getByRole('button', { name: 'OK' }))
    await waitFor(() => expect(food.setMenuEntry).toHaveBeenCalledWith({ entryDate: MON, mealType: 'comida', recipeId: null, freeText: 'Yogur' }))
    expect(food.updateMenuEntry).not.toHaveBeenCalled()
    expect(food.deleteMenuEntry).not.toHaveBeenCalled()
  })

  it('también se puede añadir una receta de Cocina como plato adicional', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: '+ Añadir otro plato' }))
    const picker = document.querySelector('.menu-picker') as HTMLElement
    fireEvent.change(within(picker).getByRole('combobox'), { target: { value: 'r2' } })
    fireEvent.click(within(picker).getByRole('button', { name: 'OK' }))
    await waitFor(() => expect(food.setMenuEntry).toHaveBeenCalledWith({ entryDate: MON, mealType: 'comida', recipeId: 'r2', freeText: null }))
  })

  it('cada plato se edita por separado: editar uno solo cambia ESE plato', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Editar Ensalada' }))
    const picker = document.querySelector('.menu-picker') as HTMLElement
    fireEvent.change(within(picker).getByRole('combobox'), { target: { value: 'r1' } })
    fireEvent.click(within(picker).getByRole('button', { name: 'OK' }))
    await waitFor(() => expect(food.updateMenuEntry).toHaveBeenCalledWith('e2', { recipeId: 'r1', freeText: null }))
    expect(food.updateMenuEntry).toHaveBeenCalledTimes(1)
  })

  it('cada plato se elimina por separado (pide confirmación)', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Fruta de temporada del menú' }))
    fireEvent.click(screen.getByRole('button', { name: /Sí|Confirmar|Seguro/i }))
    await waitFor(() => expect(food.deleteMenuEntry).toHaveBeenCalledWith('e3'))
    expect(food.deleteMenuEntry).toHaveBeenCalledTimes(1)
  })

  it('reordenar: subir un plato guarda el nuevo orden de ESA comida y no toca nada más', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Subir Fruta de temporada' }))
    await waitFor(() => expect(food.reorderMenuEntries).toHaveBeenCalledWith(['e1', 'e3', 'e2']))
    expect(food.updateMenuEntry).not.toHaveBeenCalled()
    // y la pantalla ya lo enseña así, sin esperar a recargar
    const text = ((document.querySelector('[aria-label="Más platos de Comida"]') as HTMLElement).parentElement as HTMLElement).textContent ?? ''
    expect(text.indexOf('Fruta de temporada')).toBeLessThan(text.indexOf('Ensalada'))
  })

  it('el primer plato no puede subir y el último no puede bajar', async () => {
    await open()
    expect((screen.getByRole('button', { name: 'Subir Lentejas' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Bajar Fruta de temporada' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('duplicar un día copia TODOS los platos de todas sus comidas, en su orden, al día elegido', async () => {
    food.listMenuEntries.mockResolvedValue([...THREE, e('e4', MON, 'cena', null, 'Sopa', 4)])
    await open()
    const dayLabel = new Date(MON + 'T00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })
    fireEvent.click(screen.getByRole('button', { name: `Copiar los platos de ${dayLabel} a otro día` }))
    const panel = screen.getByRole('group', { name: new RegExp('Copiar .* a otro día') })
    expect((within(panel).getByRole('combobox') as HTMLSelectElement).value).toBe(TUE) // por defecto, el día siguiente
    fireEvent.click(within(panel).getByRole('button', { name: 'Copiar' }))
    await waitFor(() => expect(food.copyMenuEntries).toHaveBeenCalledTimes(1))
    expect(food.copyMenuEntries.mock.calls[0][0]).toEqual([
      { entryDate: TUE, mealType: 'comida', recipeId: 'r1', freeText: null },
      { entryDate: TUE, mealType: 'comida', recipeId: 'r2', freeText: null },
      { entryDate: TUE, mealType: 'comida', recipeId: null, freeText: 'Fruta de temporada' },
      { entryDate: TUE, mealType: 'cena', recipeId: null, freeText: 'Sopa' },
    ])
    expect(food.deleteMenuEntry).not.toHaveBeenCalled()
    expect(food.updateMenuEntry).not.toHaveBeenCalled()
  })

  it('repetir la semana copia todos los platos a la semana siguiente (+7 días) sin borrar nada', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: /Repetir esta semana en la siguiente/ }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Repetir la semana' })).getByRole('button', { name: 'Copiar' }))
    await waitFor(() => expect(food.copyMenuEntries).toHaveBeenCalledTimes(1))
    const next = ds(new Date(monday.getTime() + 7 * 86400000))
    const copies = food.copyMenuEntries.mock.calls[0][0] as { entryDate: string }[]
    expect(copies).toHaveLength(3)
    expect(copies.every((c) => c.entryDate === next)).toBe(true)
    expect(food.deleteMenuEntry).not.toHaveBeenCalled()
  })

  it('un fallo al copiar no cambia nada y lo dice', async () => {
    food.copyMenuEntries.mockRejectedValue(new Error('red'))
    await open()
    fireEvent.click(screen.getByRole('button', { name: /Repetir esta semana en la siguiente/ }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Repetir la semana' })).getByRole('button', { name: 'Copiar' }))
    expect(await screen.findByText(/No se han podido copiar los platos/)).toBeTruthy()
  })

  it('la sincronización se pausa mientras se edita, se añade o se copia (nunca se pisa lo que se teclea)', async () => {
    await open()
    const calls = (useRealtimeRefresh as unknown as ReturnType<typeof vi.fn>).mock.calls
    const last = () => calls[calls.length - 1][2] as { paused: boolean }
    expect(last().paused).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: '+ Añadir otro plato' }))
    expect(last().paused).toBe(true)
  })
})

describe('Menú semanal — Compras reúne los ingredientes de TODOS los platos de una comida', () => {
  const day = { scope: 'day', date: MON } as const
  it('los tres platos entran en el carrito', () => {
    expect(shoppableEntries(THREE, RECIPES, day).map((x) => x.id)).toEqual(['e1', 'e2', 'e3'])
  })
  it('suma ingredientes repetidos entre platos (zanahoria 2 + 1) y conserva el plato escrito a mano', () => {
    const plan = kitchenMenuShopping(THREE, RECIPES, day, 4)
    const byName = new Map(plan.map((l) => [l.name.toLowerCase(), l]))
    expect(byName.has('lentejas')).toBe(true)
    expect(byName.has('lechuga')).toBe(true)
    expect(byName.has('fruta de temporada')).toBe(true)
    const zan = byName.get('zanahoria')
    expect(String(zan?.quantity)).toMatch(/^3/)
    expect(zan?.sources.length).toBe(2)
  })
  it('el carrito de un solo plato solo lleva sus ingredientes', () => {
    const plan = kitchenMenuShopping(THREE, RECIPES, { scope: 'entry', entryId: 'e2' }, 4)
    expect(plan.map((l) => l.name.toLowerCase()).sort()).toEqual(['lechuga', 'zanahoria'])
  })
  it('el mismo texto escrito a mano en dos platos es UN producto (sin duplicados)', () => {
    const dup = [...THREE, e('e9', MON, 'cena', null, 'fruta de temporada', 9)]
    const plan = kitchenMenuShopping(dup, RECIPES, day, 4)
    expect(plan.filter((l) => l.name.toLowerCase() === 'fruta de temporada')).toHaveLength(1)
  })
})
