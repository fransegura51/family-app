// @vitest-environment jsdom
// «Rectificar con Pepa» en un menú: elegir el alcance (una receta, una comida, un día o todo el menú) y ver, antes de aceptar, qué recetas se añaden, se eliminan o se modifican.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toReviseProposal } from '@/domain/communityEditorial'
import type { ScopeMenu } from '@/domain/communityMenuDiff'

vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))

const api = vi.hoisted(() => ({
  adminApproveProposal: vi.fn(),
  adminEditProposal: vi.fn(),
  adminListProposals: vi.fn(),
  adminRejectProposal: vi.fn(),
  adminRescheduleMenu: vi.fn(),
}))
vi.mock('@/data/community', () => api)

const ed = vi.hoisted(() => ({
  listEditorialRevisions: vi.fn(),
  listItemVersions: vi.fn(),
  decideRevision: vi.fn(),
  restoreItemVersion: vi.fn(),
  scheduleItem: vi.fn(),
  requestRevision: vi.fn(),
}))
vi.mock('@/data/communityEditorial', async (orig) => ({ ...(await orig<typeof import('@/data/communityEditorial')>()), ...ed }))

const { RevisePanel } = await import('@/ui/community/admin/RevisePanel')
const { MenuRevisePanel } = await import('@/ui/community/admin/MenuRevisePanel')
const { MenuChanges } = await import('@/ui/community/admin/MenuChanges')

const ing = (name: string, quantity: string, unit = 'g') => ({ name, quantity, unit })
const rec = (title: string, extra: Record<string, unknown> = {}) => ({
  title,
  servings: 4,
  ingredients: [ing('Pollo', '600'), ing('Limón', '2', 'unidades')],
  steps: ['Corta el pollo.', 'Cocínalo diez minutos.'],
  ...extra,
})
const meal = (title: string, recipes: unknown[], side = 'Pan') => ({ title, side, recipes })
const menu = (over: Record<number, { comida?: unknown; cena?: unknown }> = {}) => ({
  menu: {
    servings: 4,
    days: ['lunes', 'martes', 'miércoles'].map((day, i) => ({
      day,
      meals: { comida: over[i]?.comida ?? meal(`Comida ${i}`, [rec(`Plato ${i}`)]), cena: over[i]?.cena ?? meal(`Cena ${i}`, [rec(`Cena rica ${i}`)]) },
    })),
  },
})
const proposal = (before: unknown, after: unknown, notes: string) =>
  toReviseProposal({ ok: true, revision_id: 'rv1', notes, before: { title: 'Menú', body: 'Texto', payload: before }, result: { title: 'Menú', body: 'Texto', payload: after }, quality: [] })

const scopeMenu: ScopeMenu = {
  days: [
    { day: 'lunes', comida: { title: 'Comida 0', recipes: [{ title: 'Plato 0' }, { title: 'Ensalada' }] }, cena: { title: 'Cena 0', recipes: [{ title: 'Cena rica 0' }] } },
    { day: 'martes', comida: { title: 'Comida 1', recipes: [{ title: 'Plato 1' }] }, cena: { title: 'Cena 1', recipes: [{ title: 'Cena rica 1' }] } },
  ],
}

const mount = (node: React.ReactNode) => render(<MemoryRouter>{node}</MemoryRouter>)
const ask = async (text = 'Cámbialo por pescado') => {
  fireEvent.change(screen.getByLabelText('¿Qué quieres cambiar?'), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: /Pedir (una nueva|otra) versión/ }))
  await waitFor(() => expect(ed.requestRevision).toHaveBeenCalled())
}

beforeEach(() => {
  for (const f of [...Object.values(api), ...Object.values(ed)]) f.mockReset()
  ed.listEditorialRevisions.mockResolvedValue([])
  ed.listItemVersions.mockResolvedValue([])
})
afterEach(cleanup)

describe('menú: lo que cambia, receta por receta', () => {
  it('receta NUEVA (ficha completa), MODIFICADA (ingredientes, cantidades, consejo) y ELIMINADA, cada una con su etiqueta', async () => {
    const before = menu({ 0: { comida: meal('Pollo', [rec('Pollo al limón'), rec('Ensalada', { simple: true, steps: [] })]) }, 1: { cena: meal('Sopa', [rec('Sopa de fideos')]) } })
    const after = menu({
      0: { comida: meal('Pollo', [rec('Pollo al limón', { ingredients: [ing('Pollo', '800'), ing('Limón', '2', 'unidades')], tip: 'Mejor con limón fresco.' }), rec('Ensalada', { simple: true, steps: [] }), rec('Arroz blanco')]) },
      1: { cena: meal('Sopa', []) },
    })
    ed.requestRevision.mockResolvedValue(proposal(before, after, 'He cambiado el pollo y quitado la sopa.'))
    mount(<RevisePanel itemId="m1" kind="menu" scopeTarget={{ scope: 'day', day: 0 }} onClose={vi.fn()} onChanged={vi.fn()} />)
    await ask()
    const section = await screen.findByRole('region', { name: 'Cambios en las recetas del menú' })
    expect(within(section).getByText(/2 comidas cambian: 1 receta nueva, 1 modificada, 1 eliminada\./)).toBeTruthy()
    expect(within(section).getByText('Nueva')).toBeTruthy()
    expect(within(section).getByText('Modificada', { selector: '.cadm-recipe-tag-changed' })).toBeTruthy()
    expect(within(section).getByText('Eliminada')).toBeTruthy()
    // Cantidades: 600 g → 800 g y el consejo nuevo.
    expect(section.textContent).toContain('600')
    expect(section.textContent).toContain('800')
    expect(section.textContent).toMatch(/Se ha añadido un consejo/)
    // Ficha completa de la receta nueva a la vista (ingredientes y elaboración).
    expect(within(section).getAllByText('Arroz blanco').length).toBeGreaterThan(0)
    // Propuesta completa desplegable.
    expect(within(section).getByText('Ver la propuesta completa de lo que cambia')).toBeTruthy()
  })

  it('propuesta SIN cambios reales: lo dice y no inventa tarjetas de receta', async () => {
    ed.requestRevision.mockResolvedValue(proposal(menu(), menu(), 'Lo he dejado como estaba.'))
    mount(<RevisePanel itemId="m1" kind="menu" scopeTarget={{ scope: 'week' }} onClose={vi.fn()} onChanged={vi.fn()} />)
    await ask()
    await screen.findByText(/Pepa no ha cambiado nada visible/)
    expect(screen.queryByRole('region', { name: 'Cambios en las recetas del menú' })).toBeNull()
  })

  it('aviso: el plato sigue llamándose «Martes, cena» aunque cambie la receta (el fallo de la sopa de letras)', () => {
    const before = menu({ 1: { cena: meal('Martes, cena', [rec('Crema de calabacín')]) } })
    const after = menu({ 1: { cena: meal('Martes, cena', [rec('Sopa de letras')]) } })
    mount(<MenuChanges before={before} after={after} notes="He cambiado la cena del martes." />)
    const warn = screen.getByRole('status')
    expect(warn.textContent).toMatch(/Comprueba esto antes de aceptar/)
    expect(warn.textContent).toMatch(/Martes, cena/)
    expect(warn.textContent).toMatch(/no es el nombre de un plato/)
  })

  it('aviso: Pepa dice que ha añadido una receta y la propuesta no añade ninguna', () => {
    const after = menu({ 0: { comida: meal('Comida 0', [rec('Plato 0', { tip: 'Un consejo.' })]) } })
    mount(<MenuChanges before={menu()} after={after} notes="He añadido la receta del arroz." />)
    expect(screen.getByRole('status').textContent).toMatch(/no añade ninguna ficha nueva/)
  })

  it('el nombre del plato y el acompañamiento que cambian se enseñan con «antes → ahora»', () => {
    const after = menu({ 0: { comida: meal('Pollo guisado', [rec('Plato 0')], 'Arroz') } })
    mount(<MenuChanges before={menu()} after={after} notes="x" />)
    const del = screen.getByText('Comida 0')
    expect(del.tagName).toBe('DEL')
    expect(screen.getByText('Pollo guisado', { selector: 'ins' })).toBeTruthy()
    expect(screen.getByText('Arroz', { selector: 'ins' })).toBeTruthy()
  })
})

describe('menú: alcance de «Rectificar con Pepa»', () => {
  it('el título dice qué se cambia y la petición lleva el destino exacto (una receta)', async () => {
    ed.requestRevision.mockRejectedValue(new Error('x'))
    mount(<RevisePanel itemId="m1" kind="menu" scopeTarget={{ scope: 'recipe', day: 0, meal: 'comida', recipe: 1 }} onClose={vi.fn()} onChanged={vi.fn()} />)
    expect(screen.getByText('Rectificar con Pepa: Lunes · Comida · receta 2')).toBeTruthy()
    await ask('Pon menos sal')
    expect(ed.requestRevision).toHaveBeenCalledWith('m1', 'Pon menos sal', { scope: 'recipe', day: 0, meal: 'comida', recipe: 1 })
  })

  it('el selector cambia el alcance: receta, comida, día y todo el menú mandan cada uno su destino', async () => {
    ed.requestRevision.mockRejectedValue(new Error('x'))
    mount(<MenuRevisePanel itemId="m1" menu={scopeMenu} onClose={vi.fn()} onChanged={vi.fn()} />)
    // Por defecto, todo el menú.
    expect(screen.getByRole('button', { name: 'Todo el menú' }).getAttribute('aria-pressed')).toBe('true')
    await ask('Más pescado')
    expect(ed.requestRevision).toHaveBeenLastCalledWith('m1', 'Más pescado', { scope: 'week' })

    fireEvent.click(screen.getByRole('button', { name: 'Un día' }))
    fireEvent.change(screen.getByLabelText('Día'), { target: { value: '1' } })
    await ask('Más pescado')
    expect(ed.requestRevision).toHaveBeenLastCalledWith('m1', 'Más pescado', { scope: 'day', day: 1 })

    fireEvent.click(screen.getByRole('button', { name: 'Una comida' }))
    fireEvent.change(screen.getByLabelText('Comida'), { target: { value: 'cena' } })
    await ask('Más pescado')
    expect(ed.requestRevision).toHaveBeenLastCalledWith('m1', 'Más pescado', { scope: 'meal', day: 1, meal: 'cena' })

    fireEvent.click(screen.getByRole('button', { name: 'Una receta' }))
    fireEvent.change(screen.getByLabelText('Día'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('Comida'), { target: { value: 'comida' } })
    fireEvent.change(screen.getByLabelText('Receta'), { target: { value: '1' } })
    await ask('Más pescado')
    expect(ed.requestRevision).toHaveBeenLastCalledWith('m1', 'Más pescado', { scope: 'recipe', day: 0, meal: 'comida', recipe: 1 })
    expect(screen.getByText('Lunes · Comida · receta 2', { selector: 'strong' })).toBeTruthy()
  })

  it('al cambiar de alcance la propuesta que se veía (de otro alcance) desaparece y la instrucción se conserva', async () => {
    ed.requestRevision.mockResolvedValue(proposal(menu(), menu({ 0: { comida: meal('Comida 0', [rec('Plato 0'), rec('Arroz')]) } }), 'He añadido arroz.'))
    mount(<MenuRevisePanel itemId="m1" menu={scopeMenu} initial={{ scope: 'meal', day: 0, meal: 'comida' }} onClose={vi.fn()} onChanged={vi.fn()} />)
    await ask('Añade arroz')
    await screen.findByRole('button', { name: 'Aceptar esta versión' })
    fireEvent.click(screen.getByRole('button', { name: 'Un día' }))
    expect(screen.queryByRole('button', { name: 'Aceptar esta versión' })).toBeNull()
    expect((screen.getByLabelText('¿Qué quieres cambiar?') as HTMLTextAreaElement).value).toBe('Añade arroz')
  })

  it('aceptar guarda la versión nueva pero NO aprueba ni publica nada', async () => {
    ed.requestRevision.mockResolvedValue(proposal(menu(), menu({ 0: { comida: meal('Comida 0', [rec('Plato 0'), rec('Arroz')]) } }), 'He añadido arroz.'))
    ed.decideRevision.mockResolvedValue({ accepted: true, version: 5 })
    const onChanged = vi.fn()
    mount(<MenuRevisePanel itemId="m1" menu={scopeMenu} onClose={vi.fn()} onChanged={onChanged} />)
    await ask('Añade arroz')
    fireEvent.click(await screen.findByRole('button', { name: 'Aceptar esta versión' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(ed.decideRevision).toHaveBeenCalledWith('rv1', true)
    expect(api.adminApproveProposal).not.toHaveBeenCalled()
    expect(api.adminRescheduleMenu).not.toHaveBeenCalled()
    expect(ed.scheduleItem).not.toHaveBeenCalled()
    expect(onChanged.mock.calls[0][0]).toMatch(/No se ha publicado nada/)
  })

  it('rechazar no cambia nada', async () => {
    ed.requestRevision.mockResolvedValue(proposal(menu(), menu({ 0: { comida: meal('Comida 0', [rec('Plato 0'), rec('Arroz')]) } }), 'He añadido arroz.'))
    ed.decideRevision.mockResolvedValue({ accepted: false, version: null })
    const onChanged = vi.fn()
    mount(<MenuRevisePanel itemId="m1" menu={scopeMenu} onClose={vi.fn()} onChanged={onChanged} />)
    await ask('Añade arroz')
    fireEvent.click(await screen.findByRole('button', { name: 'Rechazar' }))
    await waitFor(() => expect(ed.decideRevision).toHaveBeenCalledWith('rv1', false))
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('el selector solo ofrece las comidas y recetas que existen', () => {
    mount(<MenuRevisePanel itemId="m1" menu={scopeMenu} initial={{ scope: 'recipe', day: 0, meal: 'comida', recipe: 0 }} onClose={vi.fn()} onChanged={vi.fn()} />)
    const recipes = within(screen.getByLabelText('Receta')).getAllByRole('option').map((o) => o.textContent)
    expect(recipes).toEqual(['1. Plato 0', '2. Ensalada'])
    expect(within(screen.getByLabelText('Comida')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Comida', 'Cena'])
    expect(within(screen.getByLabelText('Día')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Lunes', 'Martes'])
  })
})

describe('móvil (iPhone, 375 px)', () => {
  const css = readFileSync('src/ui/community/admin/menuChanges.css', 'utf8')
  it('los controles tienen tamaño táctil y nada fuerza el ancho', () => {
    expect(css).toMatch(/\.cadm-scope-chips \.cadm-chip-button \{[^}]*min-height: 44px/)
    expect(css).toMatch(/\.cadm-scope-fields select \{[^}]*min-height: 44px/)
    expect(css).toMatch(/max-width: 100%/)
    expect(css).toMatch(/overflow-wrap: anywhere/)
    expect(css).toMatch(/\.cadm-menu-full > summary \{[^}]*min-height: 44px/)
    expect(css).not.toMatch(/(?:^|[^-])width: \d{3,}px/)
  })
})
