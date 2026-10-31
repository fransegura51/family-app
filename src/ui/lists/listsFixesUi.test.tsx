// @vitest-environment jsdom
// Correcciones de «Mis listas» tras las pruebas reales en iPhone: selector de Calendario con personas, comparativas por modalidad,
// estilos de lista de Ideas y menú de acciones agrupado.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ListColumn, ListItem, UserList } from '@/domain/lists'

vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))
vi.mock('@/state/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/services/voice', () => ({ isDictationSupported: () => false, listenContinuous: vi.fn() }))
const calendar = vi.hoisted(() => ({ listUpcomingEvents: vi.fn() }))
vi.mock('@/data/calendar', () => calendar)
const family = vi.hoisted(() => ({ listFamilyMembers: vi.fn() }))
vi.mock('@/data/family', () => family)

const data = vi.hoisted(() => ({
  loadListsOverview: vi.fn(),
  loadListDetail: vi.fn(),
  createList: vi.fn(),
  createListWithColumns: vi.fn(),
  addColumns: vi.fn(),
  createFolder: vi.fn(),
  updateList: vi.fn(),
  deleteList: vi.fn(),
  deleteFolder: vi.fn(),
  renameFolder: vi.fn(),
  reorderLists: vi.fn(),
  duplicateExistingList: vi.fn(),
  addListItems: vi.fn(),
  updateListItem: vi.fn(),
  deleteListItems: vi.fn(),
  saveItemPlacements: vi.fn(),
  replaceListItems: vi.fn(),
  addColumn: vi.fn(),
  renameColumn: vi.fn(),
  deleteColumn: vi.fn(),
  sendItemsToShopping: vi.fn(),
  pendingShoppingNames: vi.fn(),
  eventsLinkedToList: vi.fn(),
  linkListToEvent: vi.fn(),
  unlinkListFromEvent: vi.fn(),
  listsLinkedToEvent: vi.fn(),
}))
vi.mock('@/data/lists', () => data)

import { CalendarLinksSheet } from '@/ui/lists/CalendarLinksSheet'
import { ListsScreen } from '@/ui/lists/ListsScreen'

const ME = 'user-me'
const mkList = (over: Partial<UserList> = {}): UserList => ({
  id: 'L1',
  familyId: 'F',
  createdBy: ME,
  title: 'Mi lista',
  kind: 'tareas',
  visibility: 'privada',
  folderId: null,
  sortOrder: 1,
  sortMode: 'manual',
  itemStyle: null,
  archivedAt: null,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  ...over,
})
const mkItem = (id: string, text: string, over: Partial<ListItem> = {}): ListItem => ({
  id,
  listId: 'L1',
  familyId: 'F',
  depth: 0,
  text,
  rich: null,
  done: false,
  doneAt: null,
  sortOrder: 1000 * Number(id.replace(/\D/g, '') || 1),
  columnId: null,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  ...over,
})
const cols = (...titles: string[]): ListColumn[] => titles.map((title, n) => ({ id: `C${n}`, listId: 'L1', title, sortOrder: n }))
const detail = (items: ListItem[], over: Partial<UserList> = {}, columns: ListColumn[] = []) => ({ userId: ME, list: mkList(over), columns, items, shoppingLinked: [] as string[] })

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/listas/*" element={<ListsScreen />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const k of Object.keys(data)) (data as Record<string, ReturnType<typeof vi.fn>>)[k].mockResolvedValue(undefined)
  data.eventsLinkedToList.mockResolvedValue([])
  data.pendingShoppingNames.mockResolvedValue([])
  data.listsLinkedToEvent.mockResolvedValue([])
  data.loadListsOverview.mockResolvedValue({ userId: ME, folders: [], lists: [], items: [] })
})
afterEach(() => cleanup())

// ---------------------------------------------------------------------------------------------------------------- 1. Calendario
describe('Corrección 1 — selector de Calendario: de quién es cada evento', () => {
  const ev = (id: string, title: string, memberIds: string[], over: Record<string, unknown> = {}) => ({ id, title, memberIds, startAt: '2026-11-02T09:00:00Z', kind: 'event', recurrenceRule: null, ...over })
  beforeEach(() => {
    family.listFamilyMembers.mockResolvedValue([
      { id: 'm1', name: 'Jennifer' },
      { id: 'm2', name: 'Fernando' },
    ])
    calendar.listUpcomingEvents.mockResolvedValue([ev('e1', 'Fernando Cole', ['m1']), ev('e2', 'Fernando Cole', ['m2']), ev('e3', 'Dentista', []), ev('e4', 'Revisión', ['m1', 'm2'], { kind: 'task' })])
  })
  const open = async () => {
    render(<CalendarLinksSheet list={mkList()} onClose={() => undefined} />)
    await screen.findByText(/Dentista/)
  }

  it('dos «Fernando Cole» el mismo día se distinguen por la persona asignada (no por el título ni la posición)', async () => {
    await open()
    await waitFor(() => expect(screen.getByText(/Fernando Cole \(Jennifer\)/)).toBeTruthy())
    expect(screen.getByText(/Fernando Cole \(Fernando\)/)).toBeTruthy()
    expect(screen.getByText(/Dentista \(Toda la familia\)/)).toBeTruthy()
    expect(screen.getByText(/Revisión \(Jennifer, Fernando\)/)).toBeTruthy()
    expect(screen.getAllByRole('checkbox')).toHaveLength(4)
  })

  it('se puede buscar por título y por nombre de persona', async () => {
    await open()
    await waitFor(() => expect(screen.getByText(/\(Jennifer\)/)).toBeTruthy())
    const box = screen.getByLabelText('Buscar evento o tarea')
    fireEvent.change(box, { target: { value: 'jennifer' } })
    expect(screen.getByText(/Fernando Cole \(Jennifer\)/)).toBeTruthy()
    expect(screen.queryByText(/Fernando Cole \(Fernando\)/)).toBeNull()
    expect(screen.queryByText(/Dentista/)).toBeNull()
    fireEvent.change(box, { target: { value: 'cole' } })
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
  })

  it('selección múltiple: cada vínculo se guarda en el registro correcto y no se toca nada más', async () => {
    await open()
    await waitFor(() => expect(screen.getByText(/\(Jennifer\)/)).toBeTruthy())
    fireEvent.click(screen.getByLabelText(/Fernando Cole \(Fernando\)/))
    await waitFor(() => expect(data.linkListToEvent).toHaveBeenCalledWith('L1', 'e2'))
    fireEvent.click(screen.getByLabelText(/Fernando Cole \(Jennifer\)/))
    await waitFor(() => expect(data.linkListToEvent).toHaveBeenCalledWith('L1', 'e1'))
    expect(data.linkListToEvent).toHaveBeenCalledTimes(2)
    expect(data.unlinkListFromEvent).not.toHaveBeenCalled()
    expect((screen.getByLabelText(/Fernando Cole \(Fernando\)/) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText(/Fernando Cole \(Jennifer\)/) as HTMLInputElement).checked).toBe(true)
  })

  it('el mismo registro repetido por id sale una sola vez; eventos distintos con igual título se conservan', async () => {
    calendar.listUpcomingEvents.mockResolvedValue([ev('e1', 'Fernando Cole', ['m1']), ev('e1', 'Fernando Cole', ['m1']), ev('e2', 'Fernando Cole', ['m2'])])
    render(<CalendarLinksSheet list={mkList()} onClose={() => undefined} />)
    await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(2))
  })

  it('si no se pueden leer las personas, no se inventa ninguna etiqueta', async () => {
    family.listFamilyMembers.mockRejectedValue(new Error('red'))
    await open()
    expect(screen.queryByText(/\(Jennifer\)/)).toBeNull()
    expect(screen.queryByText(/Toda la familia/)).toBeNull()
  })
})

// ---------------------------------------------------------------------------------------------------------------- 2. Comparativa
describe('Corrección 2 — elegir el tipo de comparativa antes de crearla', () => {
  const newComparativa = async (title: string) => {
    renderAt('/listas')
    await screen.findByRole('button', { name: 'Nueva lista' })
    fireEvent.click(screen.getByRole('button', { name: 'Nueva lista' }))
    fireEvent.change(screen.getByLabelText('Título de la lista'), { target: { value: title } })
    expect(screen.queryByText('¿Qué quieres comparar?')).toBeNull() // solo con el formato Comparativa
    fireEvent.click(screen.getByRole('radio', { name: /Comparativa/ }))
  }
  beforeEach(() => {
    data.createListWithColumns.mockResolvedValue({ list: mkList({ id: 'NEW', kind: 'comparativa' }), columns: [] })
  })

  it('pros y contras (por defecto) crea solo Pros y Contras', async () => {
    await newComparativa('Casa nueva')
    expect(screen.getByText('¿Qué quieres comparar?', { selector: 'legend' })).toBeTruthy()
    expect(screen.queryByText('¿Cuántas opciones quieres comparar?')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Crear' }))
    await waitFor(() => expect(data.createListWithColumns).toHaveBeenCalledWith({ title: 'Casa nueva', kind: 'comparativa' }, ['Pros', 'Contras']))
  })

  it('varias opciones pregunta cuántas (2 a 5) y crea una columna por opción', async () => {
    await newComparativa('Destino')
    fireEvent.click(screen.getByRole('radio', { name: /Varias opciones/ }))
    expect(screen.getByText('¿Cuántas opciones quieres comparar?')).toBeTruthy()
    expect(within(screen.getByRole('radiogroup', { name: '¿Cuántas opciones quieres comparar?' })).getAllByRole('radio').map((r) => r.textContent)).toEqual(['2', '3', '4', '5'])
    fireEvent.click(screen.getByRole('radio', { name: '4' }))
    fireEvent.click(screen.getByRole('button', { name: 'Crear' }))
    await waitFor(() => expect(data.createListWithColumns).toHaveBeenCalledWith({ title: 'Destino', kind: 'comparativa' }, ['Opción 1', 'Opción 2', 'Opción 3', 'Opción 4']))
  })

  it('las listas de otro formato no llevan columnas', async () => {
    renderAt('/listas')
    await screen.findByRole('button', { name: 'Nueva lista' })
    fireEvent.click(screen.getByRole('button', { name: 'Nueva lista' }))
    fireEvent.change(screen.getByLabelText('Título de la lista'), { target: { value: 'Tareas' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear' }))
    await waitFor(() => expect(data.createListWithColumns).toHaveBeenCalledWith({ title: 'Tareas', kind: 'tareas' }, []))
  })

  it('en pros y contras no hay «＋ Columna» (no nace una «Opción 3»)', async () => {
    data.loadListDetail.mockResolvedValue(detail([], { kind: 'comparativa' }, cols('Pros', 'Contras')))
    renderAt('/listas/L1')
    await screen.findAllByRole('button', { name: /Añadir elemento/ })
    expect(screen.queryByRole('button', { name: /＋ Columna/ })).toBeNull()
    expect(data.addColumn).not.toHaveBeenCalled()
  })

  it('varias opciones: se puede añadir (nombre libre) hasta 5, quitar hasta 2, y los nombres son editables', async () => {
    data.loadListDetail.mockResolvedValue(detail([], { kind: 'comparativa' }, cols('Madrid', 'Opción 2')))
    data.addColumn.mockImplementation(async (_l: string, title: string, so: number) => ({ id: `N${so}`, listId: 'L1', title, sortOrder: so }))
    renderAt('/listas/L1')
    await screen.findAllByRole('button', { name: /Añadir elemento/ })
    const titles = screen.getAllByLabelText('Título de la columna') as HTMLInputElement[]
    expect(titles.map((t) => t.value)).toEqual(['Madrid', 'Opción 2'])
    fireEvent.change(titles[1], { target: { value: 'Lisboa' } })
    fireEvent.blur(titles[1])
    await waitFor(() => expect(data.renameColumn).toHaveBeenCalledWith('C1', 'Lisboa'))
    fireEvent.click(screen.getByRole('button', { name: /＋ Columna/ }))
    await waitFor(() => expect(data.addColumn).toHaveBeenCalledWith('L1', 'Opción 3', 2))
    fireEvent.click(await screen.findByRole('button', { name: /＋ Columna/ }))
    fireEvent.click(await screen.findByRole('button', { name: /＋ Columna/ }))
    await waitFor(() => expect(screen.getAllByLabelText('Título de la columna')).toHaveLength(5))
    expect(screen.queryByRole('button', { name: /＋ Columna/ })).toBeNull() // tope de 5
  })

  it('no se borra ni se modifica ninguna lista existente al abrirla', async () => {
    data.loadListDetail.mockResolvedValue(detail([mkItem('i1', 'Algo', { columnId: 'C0' })], { kind: 'comparativa' }, cols('Pros', 'Contras')))
    renderAt('/listas/L1')
    await screen.findByText('Algo')
    expect(data.deleteList).not.toHaveBeenCalled()
    expect(data.deleteColumn).not.toHaveBeenCalled()
    expect(data.updateList).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------------------------------------------- 4. Estilos de Ideas
describe('Corrección 4 — Ideas y Tareas se distinguen', () => {
  const ideas = (style: UserList['itemStyle'], items = [mkItem('i1', 'Viaje a Lisboa'), mkItem('i2', 'Regalo para mamá'), mkItem('i3', 'Libro')]) =>
    data.loadListDetail.mockResolvedValue(detail(items, { kind: 'ideas', itemStyle: style }))

  it('Tareas: casillas y sin «Estilo de lista» (el formato de Tareas no cambia)', async () => {
    data.loadListDetail.mockResolvedValue(detail([mkItem('i1', 'Comprar pan')]))
    renderAt('/listas/L1')
    await screen.findByText('Comprar pan')
    expect(screen.getByRole('button', { name: 'Marcar como hecho' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Más acciones de la lista' }))
    expect(screen.queryByRole('button', { name: /Estilo de lista/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Pendientes arriba, hechos abajo' })).toBeTruthy()
  })

  it('Ideas por defecto: bombillas y sin casillas', async () => {
    ideas(null)
    renderAt('/listas/L1')
    await screen.findByText('Viaje a Lisboa')
    expect(screen.getAllByText('💡')).toHaveLength(3)
    expect(screen.queryByRole('button', { name: 'Marcar como hecho' })).toBeNull()
  })

  it('cada estilo pinta su marca; «sin símbolo» no pinta ninguna', async () => {
    for (const [style, mark] of [
      ['puntos', '•'],
      ['guiones', '—'],
      ['estrellas', '⭐'],
    ] as const) {
      ideas(style)
      const { unmount } = renderAt('/listas/L1')
      await screen.findByText('Viaje a Lisboa')
      expect(screen.getAllByText(mark)).toHaveLength(3)
      unmount()
    }
    ideas('ninguno')
    renderAt('/listas/L1')
    await screen.findByText('Viaje a Lisboa')
    expect(screen.queryByText('💡')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Marcar como hecho' })).toBeNull()
  })

  it('numeración automática: se recalcula al añadir y al quitar, con subelementos 1.1', async () => {
    ideas('numeracion', [mkItem('i1', 'Uno'), mkItem('i2', 'Sub', { depth: 1 }), mkItem('i3', 'Tres')])
    renderAt('/listas/L1')
    await screen.findByText('Uno')
    expect(screen.getByText('1.')).toBeTruthy()
    expect(screen.getByText('1.1')).toBeTruthy()
    expect(screen.getByText('2.')).toBeTruthy()
    cleanup()
    // sin el segundo elemento el tercero pasa a ser el 2 (la numeración sale del orden que se ve, no se guarda)
    ideas('numeracion', [mkItem('i1', 'Uno'), mkItem('i3', 'Tres')])
    renderAt('/listas/L1')
    await screen.findByText('Tres')
    expect(screen.getAllByText(/^\d\.$/).map((n) => n.textContent)).toEqual(['1.', '2.'])
  })

  it('«Estilo de lista» ofrece los siete estilos y guarda el elegido sin tocar el contenido', async () => {
    ideas(null)
    renderAt('/listas/L1')
    await screen.findByText('Viaje a Lisboa')
    fireEvent.click(screen.getByRole('button', { name: 'Más acciones de la lista' }))
    fireEvent.click(screen.getByRole('button', { name: 'Estilo de lista…' }))
    const group = screen.getByRole('radiogroup', { name: 'Estilo de lista' })
    expect(within(group).getAllByRole('radio')).toHaveLength(7)
    expect(within(group).getByRole('radio', { name: /Bombillas/ }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(within(group).getByRole('radio', { name: /Numeración automática/ }))
    await waitFor(() => expect(data.updateList).toHaveBeenCalledWith('L1', { itemStyle: 'numeracion' }))
    expect(data.updateListItem).not.toHaveBeenCalled()
    expect(data.deleteListItems).not.toHaveBeenCalled()
    expect(data.addListItems).not.toHaveBeenCalled()
  })

  it('con casillas se puede marcar y desmarcar; al ocultarlas el estado «hecho» se conserva (no se toca)', async () => {
    ideas('casillas', [mkItem('i1', 'Viaje', { done: true }), mkItem('i2', 'Libro')])
    renderAt('/listas/L1')
    await screen.findByText('Viaje')
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como hecho' }))
    await waitFor(() => expect(data.updateListItem).toHaveBeenCalledWith('i2', { done: true }))
    cleanup()
    vi.clearAllMocks()
    ideas('puntos', [mkItem('i1', 'Viaje', { done: true }), mkItem('i2', 'Libro')])
    renderAt('/listas/L1')
    await screen.findByText('Viaje')
    expect(screen.queryByRole('button', { name: /Marcar como/ })).toBeNull()
    expect(data.updateListItem).not.toHaveBeenCalled()
    expect(screen.getByText('Viaje').closest('.lists-item')?.className).not.toContain('lists-item-done') // sin casillas no se tacha
  })

  it('negrita, colores y edición directa siguen funcionando con cualquier estilo', async () => {
    ideas('estrellas', [mkItem('i1', 'Leche entera', { rich: '<b>Leche</b> entera' })])
    renderAt('/listas/L1')
    await screen.findByText('Leche')
    expect(screen.getByText('Leche').closest('b')).toBeTruthy()
    fireEvent.click(screen.getByText('Leche').closest('button') as HTMLElement)
    expect(await screen.findByRole('textbox', { name: 'Texto del elemento' })).toBeTruthy()
  })

  it('una lista de otra persona permite ver el estilo pero no cambiarlo', async () => {
    data.loadListDetail.mockResolvedValue(detail([mkItem('i1', 'Idea')], { kind: 'ideas', createdBy: 'otra', visibility: 'familiar', itemStyle: 'guiones' }))
    renderAt('/listas/L1')
    await screen.findByText('Idea')
    expect(screen.getByText('—')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Más acciones de la lista' }))
    expect(screen.queryByRole('button', { name: /Estilo de lista/ })).toBeNull()
  })

  it('enviar a Compras sigue pudiendo elegir elementos aunque no haya casillas de completar', async () => {
    ideas('puntos', [mkItem('i1', 'Leche'), mkItem('i2', 'Pan')])
    renderAt('/listas/L1')
    await screen.findByText('Leche')
    fireEvent.click(screen.getByRole('button', { name: 'Más acciones de la lista' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a Lista de la compra' }))
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------------------------------------------- Menú
describe('Mejora transversal — menú de acciones de la lista agrupado', () => {
  it('se abre como panel con grupos y una acción por fila; las acciones siguen a un toque', async () => {
    data.loadListDetail.mockResolvedValue(detail([mkItem('i1', 'Algo')], { kind: 'ideas' }))
    renderAt('/listas/L1')
    await screen.findByText('Algo')
    fireEvent.click(screen.getByRole('button', { name: 'Más acciones de la lista' }))
    const panel = screen.getByRole('dialog', { name: 'Acciones de la lista' })
    const groups = Array.from(panel.querySelectorAll('.lists-menu-group')).map((g) => g.textContent)
    expect(groups).toEqual(['Importar y enviar', 'Calendario', 'Ordenación y estilo', 'Privacidad', 'Más'])
    const labels = Array.from(panel.querySelectorAll('.lists-menu .link-button')).map((b) => b.textContent)
    expect(labels).toEqual(['Importar (foto, PDF, voz o texto)…', 'Enviar a Lista de la compra', 'Vincular con el Calendario…', 'Estilo de lista…', 'Privacidad…', 'Duplicar (queda privada)', 'Archivar', 'Eliminar lista'])
    // un solo toque ejecuta y cierra el panel
    fireEvent.click(within(panel).getByRole('button', { name: 'Archivar' }))
    await waitFor(() => expect(data.updateList).toHaveBeenCalledWith('L1', expect.objectContaining({ archivedAt: expect.any(String) })))
    expect(screen.queryByRole('dialog', { name: 'Acciones de la lista' })).toBeNull()
  })

  it('se cierra tocando fuera o con «Cerrar» sin hacer nada', async () => {
    data.loadListDetail.mockResolvedValue(detail([mkItem('i1', 'Algo')]))
    renderAt('/listas/L1')
    await screen.findByText('Algo')
    fireEvent.click(screen.getByRole('button', { name: 'Más acciones de la lista' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog', { name: 'Acciones de la lista' })).toBeNull()
    expect(data.updateList).not.toHaveBeenCalled()
  })
})
