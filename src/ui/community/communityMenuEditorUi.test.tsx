// @vitest-environment jsdom
// Editor del menú semanal del Centro Editorial: Semana → Día → Comida → recetas, vista previa real, comprobación editorial y guardado que nunca aprueba ni publica.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EDIT_DAYS, type Rec } from '@/domain/communityMenuEdit'

vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))
vi.mock('@/data/communityMenu', () => ({ previewMenuImport: vi.fn(), runMenuImport: vi.fn() }))
vi.mock('@/data/shopping', () => ({ listShoppingItems: vi.fn(), addShoppingItems: vi.fn() }))
vi.mock('@/data/shoppingStores', () => ({ listShoppingStores: vi.fn(async () => []) }))
const api = vi.hoisted(() => ({ adminListProposals: vi.fn(), adminEditProposal: vi.fn(), camelize: (x: unknown) => x, getPost: vi.fn() }))
vi.mock('@/data/community', () => api)

const { MenuEditor } = await import('@/ui/community/admin/MenuEditor')
const { MenuPreview, MenuCheckSummary } = await import('@/ui/community/admin/MenuPreview')

const recipe = (title: string, over: Rec = {}): Rec => ({
  title,
  servings: 4,
  ingredients: [{ name: `base de ${title}`, quantity: '200', unit: 'g' }],
  steps: ['Cocina todo.'],
  tip: 'Un truco.',
  time: { active: 10, total: 30 },
  freeze: { ideal: true, note: 'Tres meses.' },
  ...over,
})
const menuOf = (): Rec => ({
  version: 1,
  servings: 4,
  days: EDIT_DAYS.map((day, i) => ({
    day,
    meals: {
      comida: { title: `Comida ${i}`, side: 'Pan', recipes: [recipe(`Comida ${i}`)] },
      cena: { title: `Cena ${i}`, side: 'Fruta', recipes: [recipe(`Cena ${i}`), recipe('Manzana', { simple: true, steps: [], tip: undefined })] },
    },
  })),
})
const payload = () => ({ schedule: 'saturday', source: 'Banco editorial', editorial: { slot: 7 }, menu: menuOf() })
const row = (over: Rec = {}) => ({ id: 'm1', kind: 'menu', title: 'Menú semanal de Pepa', body: 'Texto de la publicación', version: 4, status: 'proposed', published_post_id: null, payload: payload(), ...over })

const mount = (props: Partial<Parameters<typeof MenuEditor>[0]> = {}) => {
  const onClose = vi.fn()
  const onSaved = vi.fn()
  render(
    <MemoryRouter>
      <MenuEditor menuId="m1" onClose={onClose} onSaved={onSaved} {...props} />
    </MemoryRouter>,
  )
  return { onClose, onSaved }
}
const loaded = async () => {
  await screen.findByRole('tablist', { name: 'Días de la semana' })
}

beforeEach(() => {
  api.adminListProposals.mockReset()
  api.adminEditProposal.mockReset()
  api.adminListProposals.mockImplementation(async (status: string) => (status === 'proposed' ? [row()] : []))
  api.adminEditProposal.mockResolvedValue(5)
})
afterEach(cleanup)

describe('editor del menú', () => {
  it('carga el menú desde la lista de propuestas (contenido completo) y muestra siete días y las comidas del día', async () => {
    mount()
    await loaded()
    expect(api.adminListProposals).toHaveBeenCalledWith('proposed')
    expect(screen.getAllByRole('tab')).toHaveLength(7)
    expect(screen.getByRole('region', { name: 'Comida del lunes' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Cena del lunes' })).toBeTruthy()
    // La cena lleva dos elementos independientes: el plato principal y un elemento sencillo.
    const cena = screen.getByRole('region', { name: 'Cena del lunes' })
    expect(within(cena).getAllByRole('listitem')).toHaveLength(2)
    expect(within(cena).getByText('Plato principal')).toBeTruthy()
    expect(within(cena).getByText('Elemento sencillo')).toBeTruthy()
  })

  it('busca también entre los aprobados y avisa de que editar un menú aprobado exige aprobarlo otra vez', async () => {
    api.adminListProposals.mockImplementation(async (status: string) => (status === 'approved' ? [row({ status: 'approved' })] : []))
    mount()
    await loaded()
    expect(screen.getByText(/ya está aprobado\. Si guardas cambios, vuelve a estar pendiente de aprobar/)).toBeTruthy()
  })

  it('si el menú ya no se puede editar lo dice sin romper nada', async () => {
    api.adminListProposals.mockResolvedValue([])
    mount()
    expect(await screen.findByText(/ya no se puede editar/)).toBeTruthy()
  })

  it('cambiar de día conserva lo editado y muestra las comidas de ese día', async () => {
    mount()
    await loaded()
    fireEvent.change(screen.getByLabelText('Nombre del plato (comida del lunes)'), { target: { value: 'Lentejas' } })
    fireEvent.click(screen.getByRole('tab', { name: 'martes' }))
    expect(screen.getByRole('region', { name: 'Cena del martes' })).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'lunes' }))
    expect((screen.getByLabelText('Nombre del plato (comida del lunes)') as HTMLInputElement).value).toBe('Lentejas')
  })

  it('editar una receta y guardar el menú manda el contenido COMPLETO (schedule, source) con solo esa receta cambiada, sin aprobar ni publicar', async () => {
    const { onSaved } = mount()
    await loaded()
    fireEvent.click(screen.getByRole('button', { name: 'Editar la receta Comida 0' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Nombre de la receta'), { target: { value: 'Lentejas estofadas' } })
    fireEvent.change(within(dialog).getByLabelText('Consejo (opcional)'), { target: { value: 'Mejor al día siguiente.' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar receta' }))
    // Vuelve al mismo día y comida, sin guardar todavía en el servidor.
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.adminEditProposal).not.toHaveBeenCalled()
    expect(screen.getByText('Cambios sin guardar')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Comida del lunes' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Guardar menú' }))
    await waitFor(() => expect(api.adminEditProposal).toHaveBeenCalledTimes(1))
    const [id, title, body, sent, topic] = api.adminEditProposal.mock.calls[0]
    expect(id).toBe('m1')
    expect(title).toBe('Menú semanal de Pepa')
    expect(body).toBe('Texto de la publicación')
    expect(topic).toBeNull()
    expect(sent.schedule).toBe('saturday')
    expect(sent.source).toBe('Banco editorial')
    expect(sent.editorial).toEqual({ slot: 7 })
    const original = payload().menu as Rec
    const days = sent.menu.days as Rec[]
    const edited = ((days[0].meals as Rec).comida as Rec).recipes as Rec[]
    expect(edited[0]).toMatchObject({ title: 'Lentejas estofadas', tip: 'Mejor al día siguiente.', freeze: { ideal: true, note: 'Tres meses.' }, time: { active: 10, total: 30 } })
    // Lo demás, idéntico byte a byte.
    for (let i = 1; i < 7; i++) expect(JSON.stringify(days[i])).toBe(JSON.stringify((original.days as Rec[])[i]))
    expect(JSON.stringify(((days[0].meals as Rec).cena))).toBe(JSON.stringify(((original.days as Rec[])[0].meals as Rec).cena))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(onSaved.mock.calls[0][0]).toMatch(/versión 5\. No se ha aprobado ni publicado: sigue pendiente de aprobar/)
  })

  it('una receta con datos pendientes no se guarda y explica el motivo; Cancelar no cambia nada', async () => {
    mount()
    await loaded()
    fireEvent.click(screen.getByRole('button', { name: 'Editar la receta Comida 0' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Nombre de la receta'), { target: { value: '  ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar receta' }))
    expect(within(dialog).getByRole('alert').textContent).toMatch(/necesita un nombre/)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByText('Cambios sin guardar')).toBeNull()
  })

  it('añadir elemento sencillo, subir/bajar y quitar con confirmación (dos toques)', async () => {
    mount()
    await loaded()
    const cena = () => screen.getByRole('region', { name: 'Cena del lunes' })
    // Subir el elemento sencillo a la primera posición.
    fireEvent.click(within(cena()).getByRole('button', { name: 'Subir la receta Manzana' }))
    expect(within(cena()).getAllByRole('listitem')[0].textContent).toMatch(/Manzana/)
    // Quitar: el primer toque solo arma el botón.
    const quitar = within(within(cena()).getAllByRole('listitem')[0]).getByRole('button', { name: 'Quitar' })
    fireEvent.click(quitar)
    expect(within(cena()).getAllByRole('listitem')).toHaveLength(2)
    fireEvent.click(within(within(cena()).getAllByRole('listitem')[0]).getByRole('button', { name: 'Toca otra vez para quitarla' }))
    expect(within(cena()).getAllByRole('listitem')).toHaveLength(1)
    // La única receta de una comida no se puede quitar.
    expect((within(cena()).getByRole('button', { name: 'Quitar' }) as HTMLButtonElement).disabled).toBe(true)
    // Añadir un elemento sencillo abre la hoja con «sencillo» marcado.
    fireEvent.click(within(cena()).getByRole('button', { name: '+ Añadir elemento sencillo' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Añadir un elemento sencillo' })).toBeTruthy()
    expect((within(dialog).getByLabelText(/Elemento sencillo \(sin pasos/) as HTMLInputElement).checked).toBe(true)
  })

  it('un menú con un error de las reglas del servidor no se puede guardar y se explica antes', async () => {
    mount()
    await loaded()
    fireEvent.change(screen.getByLabelText('Nombre del plato (cena del lunes)'), { target: { value: 'Comida 0' } })
    expect(screen.getByText(/Antes de guardar hay que corregir: lunes: la comida y la cena no pueden ser el mismo plato principal/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Guardar menú' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('el error del servidor se muestra y los cambios se conservan', async () => {
    api.adminEditProposal.mockRejectedValue(Object.assign(new Error('MENU_INVALID'), { message: 'MENU_INVALID' }))
    mount()
    await loaded()
    fireEvent.change(screen.getByLabelText('Nombre del plato (comida del lunes)'), { target: { value: 'Lentejas' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar menú' }))
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0))
    expect((screen.getByLabelText('Nombre del plato (comida del lunes)') as HTMLInputElement).value).toBe('Lentejas')
    expect(screen.getByText('Cambios sin guardar')).toBeTruthy()
  })

  it('avisa de que el texto de la publicación no se reescribe cuando cambia el nombre de un plato', async () => {
    mount()
    await loaded()
    fireEvent.click(screen.getByRole('tab', { name: 'martes' }))
    fireEvent.change(screen.getByLabelText('Nombre del plato (cena del martes)'), { target: { value: 'Sopa de letras' } })
    expect(screen.getByText(/El texto de la publicación no se reescribe solo/)).toBeTruthy()
    expect(screen.getByText(/martes \(cena\): «Cena 1» → «Sopa de letras»/)).toBeTruthy()
  })
})

describe('cerrar sin perder cambios', () => {
  it('sin cambios cierra directamente', async () => {
    const { onClose } = mount()
    await loaded()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('con cambios pide confirmación; «Seguir editando» no cierra y «Descartar» sí', async () => {
    const { onClose } = mount()
    await loaded()
    fireEvent.change(screen.getByLabelText('Nombre del plato (comida del lunes)'), { target: { value: 'Lentejas' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(screen.getByText('Tienes cambios sin guardar. ¿Qué quieres hacer?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }))
    expect(onClose).not.toHaveBeenCalled()
    expect((screen.getByLabelText('Nombre del plato (comida del lunes)') as HTMLInputElement).value).toBe('Lentejas')
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sí, descartar' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(api.adminEditProposal).not.toHaveBeenCalled()
  })

  it('«Guardar menú» desde el aviso guarda y cierra', async () => {
    const { onClose } = mount()
    await loaded()
    fireEvent.change(screen.getByLabelText('Nombre del plato (comida del lunes)'), { target: { value: 'Lentejas' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    const dialog = screen.getByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar menú' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(api.adminEditProposal).toHaveBeenCalledTimes(1)
  })

  it('avisa a quien lo monta de si hay cambios sin guardar (para proteger el cambio de sección)', async () => {
    const onDirtyChange = vi.fn()
    mount({ onDirtyChange })
    await loaded()
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
    fireEvent.change(screen.getByLabelText('Nombre del plato (comida del lunes)'), { target: { value: 'Lentejas' } })
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
  })
})

describe('vista previa y comprobación editorial', () => {
  it('«Vista previa del menú» enseña el menú como lo verá la familia, con las fichas desplegables completas', async () => {
    mount()
    await loaded()
    fireEvent.click(screen.getByRole('button', { name: 'Vista previa del menú' }))
    const preview = screen.getByRole('region', { name: 'Vista previa del menú' })
    // El mismo componente de la publicación: plan semanal con sus siete días y sin las acciones de Cocina/Compras.
    expect(within(preview).getByRole('region', { name: 'Plan semanal del menú' })).toBeTruthy()
    expect(within(preview).getAllByRole('tab')).toHaveLength(7)
    expect(within(preview).queryByRole('button', { name: /Guardar esta receta|Añadir a Compras|Importar/i })).toBeNull()
    const toggles = within(preview).getAllByRole('button', { name: /Ver la receta|Ver receta|receta/i })
    expect(toggles.length).toBeGreaterThan(0)
    fireEvent.click(within(preview).getAllByRole('button', { expanded: false })[0])
    expect(preview.textContent).toMatch(/base de Comida 0/)
    expect(preview.textContent).toMatch(/Cocina todo\./)
    expect(preview.textContent).toMatch(/Un truco\./)
  })

  it('la vista previa refleja lo que se está editando aunque no se haya guardado', async () => {
    mount()
    await loaded()
    fireEvent.change(screen.getByLabelText('Nombre del plato (comida del lunes)'), { target: { value: 'Lentejas viudas' } })
    fireEvent.click(screen.getByRole('button', { name: 'Vista previa del menú' }))
    expect(screen.getByRole('region', { name: 'Vista previa del menú' }).textContent).toMatch(/Lentejas viudas/)
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar la vista previa' }))
    expect(screen.queryByRole('region', { name: 'Vista previa del menú' })).toBeNull()
  })

  it('MenuPreview exportada funciona sola y MenuCheckSummary separa lo que impide aprobar de las recomendaciones', () => {
    const menu = menuOf()
    const days = menu.days as Rec[]
    ;(((days[2].meals as Rec).cena as Rec).recipes as Rec[])[0] = recipe('Rota', { ingredients: [] })
    ;(((days[3].meals as Rec).comida as Rec).recipes as Rec[])[0] = recipe('Sin truco', { tip: undefined })
    const { container } = render(
      <MemoryRouter>
        <MenuPreview menu={menu} title="Menú de prueba" />
        <MenuCheckSummary menu={menu} />
      </MemoryRouter>,
    )
    expect(container.textContent).toMatch(/Menú de prueba/)
    const check = screen.getByRole('region', { name: 'Comprobación editorial del menú' })
    expect(within(check).getByRole('alert').textContent).toMatch(/Impide aprobar/)
    expect(within(check).getByRole('alert').textContent).toMatch(/miércoles · cena · Rota/)
    expect(within(check).getByText(/Recomendaciones \(\d+\) · no impiden aprobar/)).toBeTruthy()
  })

  it('un menú completo dice que no hay nada que impida aprobar; la falta de consejo es solo recomendación', async () => {
    const menu = menuOf()
    ;(((menu.days as Rec[])[0].meals as Rec).comida as Rec).recipes = [recipe('Sin truco', { tip: undefined })]
    render(<MenuCheckSummary menu={menu} />)
    expect(screen.getByRole('status').textContent).toMatch(/nada que impida aprobar/)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText(/Recomendaciones/)).toBeTruthy()
  })

  it('la comprobación del editor se actualiza al editar', async () => {
    mount()
    await loaded()
    const check = screen.getByRole('region', { name: 'Comprobación editorial del menú' })
    expect(check.textContent).toMatch(/14 platos y 21 recetas o elementos \(7 sencillos\)/)
  })
})

describe('móvil y accesibilidad (leyendo el código y la hoja de estilos)', () => {
  const css = readFileSync(`${process.cwd()}/src/ui/community/admin/menuEditor.css`, 'utf8')
  it('siete días en una fila, botones de 44 px, campos de 16 px y zona segura de iOS', () => {
    expect(css).toMatch(/grid-template-columns: repeat\(7, minmax\(0, 1fr\)\)/)
    expect(css).toMatch(/\.cadm-menued-day \{[^}]*min-height: 44px/)
    expect(css).toMatch(/font-size: 16px/)
    expect(css).toMatch(/env\(safe-area-inset-bottom/)
    expect(css).toMatch(/overflow-wrap: anywhere/)
  })
  it('la hoja de la receta es un diálogo modal con nombre accesible y Escape la cierra', async () => {
    mount()
    await loaded()
    fireEvent.click(screen.getByRole('button', { name: 'Editar la receta Comida 0' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('los controles principales llevan marca de ayuda', async () => {
    mount()
    await loaded()
    for (const id of ['comunidad.menu-editor', 'comunidad.menu-editor-dias', 'comunidad.menu-editor-guardar', 'comunidad.menu-editor-vista', 'comunidad.menu-editor-check']) {
      expect(document.querySelector(`[data-help-id="${id}"]`), id).not.toBeNull()
    }
  })
})
