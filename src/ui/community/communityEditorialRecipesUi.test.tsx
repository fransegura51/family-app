// @vitest-environment jsdom
// Fichas de recetas en la revisión de borradores y en «Rectificar con Pepa»: verlas completas, compararlas, avisar si Pepa dice algo que no hizo y editarlas a mano.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toReviseProposal } from '@/domain/communityEditorial'
import { toProposals } from '@/domain/communityAdmin'

vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))

const api = vi.hoisted(() => ({
  adminApproveProposal: vi.fn(),
  adminEditProposal: vi.fn(),
  adminListProposals: vi.fn(),
  adminRejectProposal: vi.fn(),
  listCommunityTopics: vi.fn(),
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
const { ProposalCard } = await import('@/ui/community/admin/OfficialTab')

const stew = (over: Record<string, unknown> = {}) => ({
  key: 'estofado-pollo',
  title: 'Estofado casero de pollo con verduras',
  servings: 4,
  ingredients: [
    { name: 'muslos de pollo', quantity: '800', unit: 'g' },
    { name: 'zanahoria', quantity: '3', unit: 'unidades' },
  ],
  steps: ['Dora el pollo.', 'Añade las verduras.', 'Cuece 40 minutos.'],
  tip: 'Mejor de un día para otro.',
  time: { active: 20, total: 70 },
  freeze: { ideal: true, note: 'hasta 3 meses' },
  ...over,
})
const soup = () => ({ key: 'sopa', title: 'Sopa de fideos', servings: 2, ingredients: [{ name: 'fideos', quantity: '100', unit: 'g' }], steps: ['Hierve el caldo.', 'Echa los fideos.'] })

const proposal = (before: unknown[], after: unknown[], notes: string) =>
  toReviseProposal({
    ok: true,
    revision_id: 'rv1',
    notes,
    before: { title: 'Soluciones sencillas para organizar los menús', body: 'Texto del artículo.', payload: { recipes: before } },
    result: { title: 'Soluciones sencillas para organizar los menús', body: 'Texto del artículo.', payload: { recipes: after } },
    quality: [],
  })

const mount = (node: React.ReactNode) => render(<MemoryRouter>{node}</MemoryRouter>)
const open = (section?: string) => mount(<RevisePanel itemId="a1" kind="article" section={section} onChanged={vi.fn()} onClose={vi.fn()} />)
const ask = async (text: string) => {
  fireEvent.change(screen.getByLabelText('¿Qué quieres cambiar?'), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Pedir una nueva versión' }))
  await screen.findByText(/Comparación con la versión anterior/)
}

beforeEach(() => {
  for (const f of [...Object.values(api), ...Object.values(ed)]) f.mockReset()
  ed.listEditorialRevisions.mockResolvedValue([])
  ed.listItemVersions.mockResolvedValue([])
  api.listCommunityTopics.mockResolvedValue([])
})
afterEach(cleanup)

describe('Rectificación: fichas completas y comparación', () => {
  it('receta NUEVA: enseña la ficha completa (ingredientes con cantidad, pasos, consejo, tiempos y congelación) y no avisa', async () => {
    ed.requestRevision.mockResolvedValue(proposal([soup()], [soup(), stew()], 'He añadido la ficha de la receta del estofado.'))
    open('recetas')
    await ask('Añade la receta del estofado de pollo con verduras')
    expect(screen.getByText(/Receta añadida: Estofado casero de pollo con verduras \(2 ingredientes, 3 pasos\)/)).toBeTruthy()
    expect(screen.getAllByText('800 g muslos de pollo').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Cuece 40 minutos.').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Mejor de un día para otro/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Se puede congelar: hasta 3 meses/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/20 min de trabajo · 70 min en total/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Comprueba esto antes de aceptar/)).toBeNull()
    expect(ed.decideRevision).not.toHaveBeenCalled()
  })

  it('receta MODIFICADA: enseña ingredientes, cantidades y pasos que cambian, no solo «Receta cambiada»', async () => {
    const after = stew({ ingredients: [{ name: 'muslos de pollo', quantity: '1000', unit: 'g' }, { name: 'guisantes', quantity: '150', unit: 'g' }], steps: ['Dora el pollo.', 'Añade las verduras y el caldo.', 'Cuece 40 minutos.'] })
    ed.requestRevision.mockResolvedValue(proposal([stew()], [after], 'He ajustado el estofado.'))
    open('recetas')
    await ask('Ajusta las cantidades del estofado')
    expect(screen.getByText(/Receta cambiada: Estofado casero de pollo con verduras \(/)).toBeTruthy()
    expect(screen.getAllByText('Ingredientes').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Cambiado').length).toBeGreaterThan(0)
    expect(screen.getByText('800 g')).toBeTruthy()
    expect(screen.getByText('1000 g')).toBeTruthy()
    expect(screen.getAllByText('Nuevo').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Quitado').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Pasos').length).toBeGreaterThan(0)
  })

  it('receta ELIMINADA: se indica y se puede consultar la ficha que desaparecería', async () => {
    ed.requestRevision.mockResolvedValue(proposal([soup(), stew()], [soup()], 'He quitado el estofado.'))
    open('recetas')
    await ask('Elimina la receta del estofado')
    expect(screen.getByText(/Receta eliminada: Estofado casero de pollo con verduras/)).toBeTruthy()
    expect(screen.getByText('Ficha que se eliminaría')).toBeTruthy()
    expect(screen.queryByText(/Comprueba esto antes de aceptar/)).toBeNull()
  })

  it('propuesta SIN cambios reales en las recetas: no inventa cambios de recetas', async () => {
    ed.requestRevision.mockResolvedValue(proposal([stew()], [stew()], 'He acortado el texto.'))
    open('recetas')
    await ask('Hazlo más corto')
    expect(screen.queryByText('Fichas de recetas')).toBeNull()
    expect(screen.getByText(/Pepa no ha cambiado nada visible/)).toBeTruthy()
  })

  it('«Ver la versión nueva completa» incluye TODAS las fichas de la versión nueva', async () => {
    ed.requestRevision.mockResolvedValue(proposal([soup()], [soup(), stew()], 'He añadido la ficha de la receta del estofado.'))
    open('recetas')
    await ask('Añade la receta del estofado')
    const full = screen.getByText('Ver la versión nueva completa').closest('details') as HTMLElement
    const list = within(full)
    expect(list.getByText(/Fichas de recetas de la versión nueva \(2\)/)).toBeTruthy()
    expect(list.getByText('Sopa de fideos')).toBeTruthy()
    expect(list.getByText('Estofado casero de pollo con verduras')).toBeTruthy()
    expect(list.getAllByText('Ver ingredientes y elaboración')).toHaveLength(2)
  })
})

describe('Rectificación: lo que dice Pepa frente a lo que contiene', () => {
  it('Pepa dice que añadió una receta pero NO hay ninguna ficha nueva: advertencia clara', async () => {
    ed.requestRevision.mockResolvedValue(proposal([soup()], [soup()], 'He incorporado la ficha de la receta del estofado.'))
    open('recetas')
    await ask('Añade la receta del estofado de pollo con verduras')
    const warn = screen.getByText(/Comprueba esto antes de aceptar/).closest('div') as HTMLElement
    expect(warn.textContent).toContain('Pepa dice que ha añadido una receta, pero la propuesta NO contiene ninguna ficha nueva')
    // Se puede rechazar y aceptar sigue sin publicar nada.
    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeTruthy()
    expect(screen.getByText(/Aceptar no publica nada/)).toBeTruthy()
  })

  it('«Receta cambiada» presentada como añadida: avisa de que solo se modificó una existente', async () => {
    ed.requestRevision.mockResolvedValue(proposal([stew()], [stew({ steps: ['Dora el pollo.', 'Cuece.'] })], 'He añadido la ficha de la receta del estofado.'))
    open('recetas')
    await ask('Añade la receta del estofado de pollo con verduras')
    expect(screen.getByText(/Solo se modifica la ficha «Estofado casero de pollo con verduras»/)).toBeTruthy()
  })

  it('artículo que no admite fichas: lo explica y no afirma que se haya añadido', async () => {
    ed.requestRevision.mockResolvedValue(proposal([], [], 'He añadido la ficha de la receta del estofado. Aviso: este artículo no admite fichas de recetas según las reglas actuales: NO se ha añadido ninguna ficha.'))
    open('hogar')
    await ask('Añade la receta del estofado de pollo con verduras')
    const warn = screen.getByText(/Comprueba esto antes de aceptar/).closest('div') as HTMLElement
    expect(warn.textContent).toContain('no admite fichas de recetas según las reglas actuales')
    expect(warn.textContent).toContain('NO se ha añadido ninguna ficha')
  })

  it('aceptar sigue guardando versión nueva sin publicar y rechazar sigue disponible', async () => {
    ed.requestRevision.mockResolvedValue(proposal([soup()], [soup(), stew()], 'He añadido la ficha de la receta del estofado.'))
    ed.decideRevision.mockResolvedValue({ accepted: true, version: 5 })
    open('recetas')
    await ask('Añade la receta del estofado')
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar esta versión' }))
    await waitFor(() => expect(ed.decideRevision).toHaveBeenCalledWith('rv1', true))
    expect((await screen.findAllByText(/No se ha publicado nada/)).length).toBeGreaterThan(0)
  })
})

describe('Borrador: ver y editar las fichas sin publicar ni importar', () => {
  const draft = () =>
    toProposals([
      {
        id: 'a1', kind: 'article', section: 'recetas', topicId: 'recetas-faciles', title: 'Menús sin perder la paciencia', body: 'Texto del artículo.', status: 'proposed', version: 1,
        payload: { editorial: true, sources: [], recipes: [stew(), soup()] }, slotDate: '2026-11-02', generated: true,
      },
    ])[0]
  const view = () => mount(<ProposalCard proposal={draft()} topics={[]} onDone={vi.fn()} />)

  it('la revisión del borrador enseña todas las fichas, completas', () => {
    view()
    expect(screen.getByText(/Fichas de recetas \(2\)/)).toBeTruthy()
    expect(screen.getByText('Estofado casero de pollo con verduras')).toBeTruthy()
    expect(screen.getByText('Sopa de fideos')).toBeTruthy()
    expect(screen.getByText('800 g muslos de pollo')).toBeTruthy()
    expect(screen.getByText('Hierve el caldo.')).toBeTruthy()
  })

  it('«Editar» ofrece las fichas; sin tocarlas se guardan tal cual y NO viajan recetas nuevas', async () => {
    api.adminEditProposal.mockResolvedValue(2)
    view()
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    expect(screen.getByText(/Fichas de recetas \(2\)/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(api.adminEditProposal).toHaveBeenCalled())
    const sent = api.adminEditProposal.mock.calls[0][3] as { recipes: unknown[] }
    expect(sent.recipes).toEqual([stew(), soup()])
  })

  it('cambiar el nombre y el consejo de una ficha se guarda con sus tiempos y su congelación intactos', async () => {
    api.adminEditProposal.mockResolvedValue(2)
    view()
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    fireEvent.change(screen.getAllByLabelText('Nombre de la receta')[0], { target: { value: 'Estofado de pollo' } })
    fireEvent.change(screen.getAllByLabelText('Consejo (opcional)')[0], { target: { value: 'Sírvelo con pan.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(api.adminEditProposal).toHaveBeenCalled())
    const first = (api.adminEditProposal.mock.calls[0][3] as { recipes: Record<string, unknown>[] }).recipes[0]
    expect(first).toMatchObject({ key: 'estofado-pollo', title: 'Estofado de pollo', tip: 'Sírvelo con pan.', time: { active: 20, total: 70 }, freeze: { ideal: true, note: 'hasta 3 meses' } })
  })

  it('conserva las validaciones: una ficha sin nombre no se guarda y se explica', async () => {
    view()
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    fireEvent.change(screen.getAllByLabelText('Nombre de la receta')[0], { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText(/Una ficha de receta no es válida/)).toBeTruthy()
    expect(api.adminEditProposal).not.toHaveBeenCalled()
  })

  it('los borradores sin fichas no muestran ningún editor de recetas', () => {
    const p = toProposals([{ id: 'b1', kind: 'article', section: 'hogar', topicId: 'x', title: 'Ahorrar luz', body: 'Texto', status: 'proposed', version: 1, payload: { editorial: true, sources: [] } }])[0]
    mount(<ProposalCard proposal={p} topics={[]} onDone={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    expect(screen.queryByText(/Fichas de recetas/)).toBeNull()
  })
})

describe('Móvil (iPhone)', () => {
  const css = readFileSync('src/ui/community/admin/editorialRecipes.css', 'utf8')
  it('las fichas se parten en líneas, no fuerzan el ancho y las zonas táctiles miden 44 px', () => {
    expect(css).toContain('overflow-wrap: anywhere')
    expect(css).toMatch(/\.cadm-recipe-name \{[^}]*flex-wrap: wrap/)
    expect(css).toMatch(/summary \{[^}]*min-height: 44px/)
    expect(css).not.toMatch(/white-space:\s*nowrap/)
    expect(css).not.toMatch(/(?<!max-)width:\s*\d{3,}px/)
  })
})
