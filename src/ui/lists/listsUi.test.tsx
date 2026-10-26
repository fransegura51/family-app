// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ListColumn, ListFolder, ListItem, UserList } from '@/domain/lists'

vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))
vi.mock('@/data/calendar', () => ({ listUpcomingEvents: vi.fn().mockResolvedValue([]) }))
vi.mock('@/state/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/services/voice', () => ({ isDictationSupported: () => false, listenContinuous: vi.fn() }))

const data = vi.hoisted(() => ({
  loadListsOverview: vi.fn(),
  loadListDetail: vi.fn(),
  createList: vi.fn(),
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

import { ListsScreen } from '@/ui/lists/ListsScreen'

const ME = 'user-me'
const mkList = (over: Partial<UserList> = {}): UserList => ({
  id: 'L1',
  familyId: 'F',
  createdBy: ME,
  title: 'Colegio',
  kind: 'tareas',
  visibility: 'privada',
  folderId: null,
  sortOrder: 1,
  sortMode: 'manual',
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
const mkFolder = (id: string, name: string): ListFolder => ({ id, familyId: 'F', createdBy: ME, name, sortOrder: 1, createdAt: '2026-01-01' })

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
})
afterEach(() => cleanup())

describe('Mis listas — pantalla principal', () => {
  const overview = () => ({
    userId: ME,
    folders: [mkFolder('FOL', 'Casa')],
    lists: [
      mkList({ id: 'A', title: 'Colegio', folderId: 'FOL', visibility: 'familiar' }),
      mkList({ id: 'B', title: 'Vacaciones' }),
      mkList({ id: 'C', title: 'De otra persona', createdBy: 'other', visibility: 'familiar', folderId: 'FOL-AJENA' }),
      mkList({ id: 'D', title: 'Vieja', archivedAt: '2026-02-01' }),
    ],
    items: [
      { listId: 'A', text: 'Comprar mochila', done: true, depth: 0 },
      { listId: 'A', text: 'Cuadernos', done: false, depth: 0 },
      { listId: 'B', text: 'Reservar hotel', done: false, depth: 0 },
    ],
  })

  it('enseña carpetas, listas sin carpeta, indicador de privacidad y avance; la lista de otra persona sale sin carpeta', async () => {
    data.loadListsOverview.mockResolvedValue(overview())
    renderAt('/listas')
    await screen.findByText('Vacaciones')
    expect(screen.getByText('Casa')).toBeTruthy()
    expect(screen.getByText('De otra persona')).toBeTruthy() // su carpeta no es mía: se enseña sin carpeta
    expect(screen.queryByText('Vieja')).toBeNull() // archivada oculta
    expect(screen.getByText(/Ver archivadas \(1\)/)).toBeTruthy()
    expect(screen.getAllByText('🔒').length).toBeGreaterThan(0)
    expect(screen.getAllByText('👪').length).toBeGreaterThan(0)
  })

  it('la carpeta se despliega para ver sus listas y solo las listas propias tienen asa de arrastre', async () => {
    data.loadListsOverview.mockResolvedValue(overview())
    renderAt('/listas')
    await screen.findByText('Vacaciones')
    expect(screen.queryByText('Colegio')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^📁 Casa/ }))
    expect(screen.getByText('Colegio')).toBeTruthy()
    expect(screen.getAllByLabelText('Arrastrar para mover o reordenar').length).toBe(2) // Colegio y Vacaciones; no la de otra persona
  })

  it('busca por título y por contenido, también dentro de carpetas', async () => {
    data.loadListsOverview.mockResolvedValue(overview())
    renderAt('/listas')
    await screen.findByText('Vacaciones')
    const box = screen.getByLabelText('Buscar en mis listas')
    fireEvent.change(box, { target: { value: 'mochila' } })
    expect(screen.getByText('Colegio')).toBeTruthy()
    expect(screen.queryByText('Vacaciones')).toBeNull()
    fireEvent.change(box, { target: { value: 'hotel' } })
    expect(screen.getByText('Vacaciones')).toBeTruthy()
    fireEvent.change(box, { target: { value: 'zzz' } })
    expect(screen.getByText(/No hay ninguna lista con/)).toBeTruthy()
  })

  it('«Nueva lista» pide título y crea una lista PRIVADA del tipo elegido', async () => {
    data.loadListsOverview.mockResolvedValue(overview())
    data.createList.mockResolvedValue(mkList({ id: 'NEW', title: 'Compras', kind: 'ideas' }))
    renderAt('/listas')
    await screen.findByText('Vacaciones')
    fireEvent.click(screen.getByRole('button', { name: 'Nueva lista' }))
    fireEvent.click(screen.getByRole('button', { name: 'Crear' }))
    expect(screen.getByText('Escribe un título.')).toBeTruthy()
    expect(data.createList).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Título de la lista'), { target: { value: 'Compras' } })
    fireEvent.click(screen.getByRole('radio', { name: /Ideas/ }))
    expect(screen.getByText(/Será privada/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Crear' }))
    await waitFor(() => expect(data.createList).toHaveBeenCalledWith({ title: 'Compras', kind: 'ideas' }))
  })

  it('«Nueva carpeta» rechaza un nombre repetido', async () => {
    data.loadListsOverview.mockResolvedValue(overview())
    renderAt('/listas')
    await screen.findByText('Vacaciones')
    fireEvent.click(screen.getByRole('button', { name: 'Nueva carpeta' }))
    fireEvent.change(screen.getByLabelText('Nombre de la carpeta'), { target: { value: 'casa' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(screen.getByText('Ya tienes una carpeta con ese nombre.')).toBeTruthy()
    expect(data.createFolder).not.toHaveBeenCalled()
  })

  it('«Mover a…» mueve la lista a una carpeta', async () => {
    data.loadListsOverview.mockResolvedValue(overview())
    renderAt('/listas')
    await screen.findByText('Vacaciones')
    fireEvent.click(screen.getByRole('button', { name: 'Acciones de Vacaciones' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mover a…' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /📁 Casa/ }))
    await waitFor(() => expect(data.updateList).toHaveBeenCalledWith('B', { folderId: 'FOL' }))
  })

  it('eliminar una carpeta avisa de que sus listas se quedan y no borra listas', async () => {
    data.loadListsOverview.mockResolvedValue(overview())
    renderAt('/listas')
    await screen.findByText('Vacaciones')
    fireEvent.click(screen.getByRole('button', { name: 'Acciones de la carpeta Casa' }))
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar carpeta' }))
    expect(screen.getByText(/las listas que tiene se quedan/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(data.deleteFolder).toHaveBeenCalledWith('FOL'))
    expect(data.deleteList).not.toHaveBeenCalled()
  })
})

describe('Mis listas — dentro de una lista', () => {
  const detail = (items: ListItem[], over: Partial<UserList> = {}, columns: ListColumn[] = []) => ({
    userId: ME,
    list: mkList(over),
    columns,
    items,
    shoppingLinked: [] as string[],
  })

  it('marca y desmarca un elemento (casilla a la izquierda) y lo guarda', async () => {
    data.loadListDetail.mockResolvedValue(detail([mkItem('i1', 'Comprar pan'), mkItem('i2', 'Llamar')]))
    renderAt('/listas/L1')
    await screen.findByText('Comprar pan')
    fireEvent.click(screen.getAllByRole('button', { name: 'Marcar como hecho' })[0])
    await waitFor(() => expect(data.updateListItem).toHaveBeenCalledWith('i1', { done: true }))
    expect(screen.getByRole('button', { name: 'Marcar como pendiente' })).toBeTruthy()
  })

  it('añadir: «Añadir elemento» abre el editor, Intro guarda con texto y abre otro debajo', async () => {
    data.loadListDetail.mockResolvedValue(detail([mkItem('i1', 'Primero')]))
    data.addListItems.mockImplementation(async (_l: string, items: { id: string }[]) => items)
    renderAt('/listas/L1')
    await screen.findByText('Primero')
    fireEvent.click(screen.getByRole('button', { name: /Añadir elemento/ }))
    const box = await screen.findByRole('textbox', { name: 'Texto del elemento' })
    box.textContent = 'Segundo'
    fireEvent.keyDown(box, { key: 'Enter' })
    await waitFor(() => expect(data.addListItems).toHaveBeenCalledTimes(1))
    const sent = data.addListItems.mock.calls[0][1][0]
    expect(sent).toMatchObject({ text: 'Segundo', rich: null, depth: 0 })
    expect(sent.id).toBeTruthy()
    expect(sent.sortOrder).toBeGreaterThan(1000)
    await screen.findByText('Segundo')
    expect(await screen.findByRole('textbox', { name: 'Texto del elemento' })).toBeTruthy() // otro editor para seguir escribiendo
  })

  it('un elemento nuevo vacío no se guarda', async () => {
    data.loadListDetail.mockResolvedValue(detail([mkItem('i1', 'Primero')]))
    renderAt('/listas/L1')
    await screen.findByText('Primero')
    fireEvent.click(screen.getByRole('button', { name: /Añadir elemento/ }))
    const box = await screen.findByRole('textbox', { name: 'Texto del elemento' })
    fireEvent.blur(box)
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Texto del elemento' })).toBeNull())
    expect(data.addListItems).not.toHaveBeenCalled()
  })

  it('tocar el texto lo edita (también si ya está hecho) y conserva el formato al guardar', async () => {
    data.loadListDetail.mockResolvedValue(detail([mkItem('i1', 'Leche entera', { rich: '<b>Leche</b> entera', done: true })]))
    renderAt('/listas/L1')
    await screen.findByText('Leche')
    fireEvent.click(screen.getByText('Leche').closest('button') as HTMLElement)
    const box = await screen.findByRole('textbox', { name: 'Texto del elemento' })
    expect(box.querySelector('b')?.textContent).toBe('Leche')
    // el usuario añade texto al final, dentro del texto plano
    box.appendChild(document.createTextNode(' sin lactosa'))
    fireEvent.blur(box)
    await waitFor(() => expect(data.updateListItem).toHaveBeenCalledWith('i1', { text: 'Leche entera sin lactosa', rich: '<b>Leche</b> entera sin lactosa' }))
  })

  it('negrita sobre la palabra del cursor desde la barra de formato', async () => {
    data.loadListDetail.mockResolvedValue(detail([mkItem('i1', 'comprar pan')]))
    renderAt('/listas/L1')
    await screen.findByText('comprar pan')
    fireEvent.click(screen.getByText('comprar pan'))
    const box = await screen.findByRole('textbox', { name: 'Texto del elemento' })
    // cursor dentro de «pan»
    const text = box.firstChild as Text
    const range = document.createRange()
    range.setStart(text, 10)
    range.setEnd(text, 10)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.click(screen.getByRole('button', { name: 'Negrita' }))
    fireEvent.blur(box)
    await waitFor(() => expect(data.updateListItem).toHaveBeenCalledWith('i1', { text: 'comprar pan', rich: 'comprar <b>pan</b>' }))
  })

  it('la barra de formato solo existe mientras se edita', async () => {
    data.loadListDetail.mockResolvedValue(detail([mkItem('i1', 'Algo')]))
    renderAt('/listas/L1')
    await screen.findByText('Algo')
    expect(screen.queryByRole('toolbar')).toBeNull()
    fireEvent.click(screen.getByText('Algo'))
    await screen.findByRole('toolbar')
    fireEvent.click(screen.getByRole('button', { name: 'Terminar de editar' }))
    await waitFor(() => expect(screen.queryByRole('toolbar')).toBeNull())
  })

  it('eliminar quita el elemento, promueve sus subelementos y se puede DESHACER recuperando el mismo elemento', async () => {
    data.loadListDetail.mockResolvedValue(detail([mkItem('i1', 'Padre'), mkItem('i2', 'Hijo', { depth: 1 })]))
    data.addListItems.mockImplementation(async (_l: string, items: unknown[]) => items)
    renderAt('/listas/L1')
    await screen.findByText('Padre')
    fireEvent.click(screen.getByLabelText('Eliminar Padre'))
    await waitFor(() => expect(data.deleteListItems).toHaveBeenCalledWith(['i1']))
    expect(data.updateListItem).toHaveBeenCalledWith('i2', { depth: 0 })
    expect(screen.queryByText('Padre')).toBeNull()
    expect(screen.getByText('Hijo')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    await waitFor(() => expect(data.addListItems).toHaveBeenCalled())
    expect(data.addListItems.mock.calls[0][1][0]).toMatchObject({ id: 'i1', text: 'Padre' })
    await waitFor(() => expect(data.updateListItem).toHaveBeenCalledWith('i2', { depth: 1 }))
  })

  it('una lista de otra persona (familiar) permite editar elementos pero no cambiar título ni privacidad', async () => {
    data.loadListDetail.mockResolvedValue(detail([mkItem('i1', 'Algo')], { createdBy: 'other', visibility: 'familiar' }))
    renderAt('/listas/L1')
    await screen.findByText('Algo')
    expect(screen.getByText(/Compartida contigo/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Familiar|Privada/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Más acciones de la lista' }))
    expect(screen.queryByRole('button', { name: 'Archivar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Eliminar lista' })).toBeNull()
    expect(screen.getByRole('button', { name: /Duplicar/ })).toBeTruthy()
  })

  it('cambiar la privacidad es un clic y no toca los elementos', async () => {
    data.loadListDetail.mockResolvedValue(detail([mkItem('i1', 'Algo')]))
    renderAt('/listas/L1')
    await screen.findByText('Algo')
    fireEvent.click(screen.getByRole('button', { name: /Privada/ }))
    fireEvent.click(screen.getByRole('radio', { name: /Familiar/ }))
    await waitFor(() => expect(data.updateList).toHaveBeenCalledWith('L1', { visibility: 'familiar' }))
    expect(data.deleteListItems).not.toHaveBeenCalled()
  })

  it('«Pendientes arriba» solo cambia la forma de ordenar (guarda el modo, no mueve datos)', async () => {
    data.loadListDetail.mockResolvedValue(detail([mkItem('i1', 'Hecho', { done: true }), mkItem('i2', 'Pendiente')]))
    renderAt('/listas/L1')
    await screen.findByText('Hecho')
    fireEvent.click(screen.getByRole('button', { name: 'Más acciones de la lista' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pendientes arriba, hechos abajo' }))
    await waitFor(() => expect(data.updateList).toHaveBeenCalledWith('L1', { sortMode: 'pendientes_arriba' }))
    expect(data.saveItemPlacements).not.toHaveBeenCalled()
  })

  it('enviar a la compra: modo selección, aviso de duplicados evidentes y la lista original no cambia', async () => {
    data.loadListDetail.mockResolvedValue(detail([mkItem('i1', 'Leche'), mkItem('i2', 'Pan'), mkItem('i3', 'Hecho ya', { done: true })]))
    data.pendingShoppingNames.mockResolvedValue(['leche'])
    data.sendItemsToShopping.mockResolvedValue(1)
    renderAt('/listas/L1')
    await screen.findByText('Leche')
    fireEvent.click(screen.getByRole('button', { name: 'Más acciones de la lista' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a Lista de la compra' }))
    expect(screen.getByText('Elige qué enviar a la compra')).toBeTruthy()
    // los pendientes vienen marcados de serie; los hechos no
    expect(screen.getByRole('button', { name: /Enviar \(2\)/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Enviar \(2\)/ }))
    await screen.findByText('Ya están en la compra')
    fireEvent.click(screen.getByRole('button', { name: /Enviar solo los nuevos \(1\)/ }))
    await waitFor(() => expect(data.sendItemsToShopping).toHaveBeenCalledWith([{ itemId: 'i2', name: 'Pan' }]))
    expect(data.deleteListItems).not.toHaveBeenCalled()
    expect(data.updateListItem).not.toHaveBeenCalled()
  })

  it('al enviar a Compras se manda texto limpio, sin formato', async () => {
    data.loadListDetail.mockResolvedValue(detail([mkItem('i1', 'Leche entera', { rich: '<b>Leche</b> <c:rojo>entera</c>' })]))
    data.sendItemsToShopping.mockResolvedValue(1)
    renderAt('/listas/L1')
    await screen.findByText('Leche')
    fireEvent.click(screen.getByRole('button', { name: 'Más acciones de la lista' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a Lista de la compra' }))
    fireEvent.click(screen.getByRole('button', { name: /Enviar \(1\)/ }))
    await waitFor(() => expect(data.sendItemsToShopping).toHaveBeenCalledWith([{ itemId: 'i1', name: 'Leche entera' }]))
  })

  it('un fallo de red al marcar vuelve a cargar la lista y avisa', async () => {
    data.loadListDetail.mockResolvedValue(detail([mkItem('i1', 'Algo')]))
    data.updateListItem.mockRejectedValue(new Error('red'))
    renderAt('/listas/L1')
    await screen.findByText('Algo')
    const before = data.loadListDetail.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como hecho' }))
    await screen.findByText(/No se ha podido guardar el cambio/)
    expect(data.loadListDetail.mock.calls.length).toBeGreaterThan(before)
  })

  it('una lista que no existe o sin acceso lo dice y ofrece volver', async () => {
    data.loadListDetail.mockResolvedValue(null)
    renderAt('/listas/NOPE')
    await screen.findByText(/no existe o no tienes acceso/)
    expect(screen.getByText(/Volver a Mis listas/)).toBeTruthy()
  })

  it('comparativa: crea dos columnas por defecto y los elementos viven en su columna', async () => {
    data.loadListDetail.mockResolvedValue(detail([], { kind: 'comparativa' }, []))
    data.addColumn.mockImplementation(async (_l: string, title: string, so: number) => ({ id: `C${so}`, listId: 'L1', title, sortOrder: so }))
    renderAt('/listas/L1')
    await waitFor(() => expect(data.addColumn).toHaveBeenCalledTimes(2))
    expect(data.addColumn.mock.calls.map((c: unknown[]) => c[1])).toEqual(['Pros', 'Contras'])
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Añadir elemento/ }).length).toBe(2))
  })

  it('el fallo de abrir el editor con un texto largo respeta el tope de 1000 caracteres', async () => {
    data.loadListDetail.mockResolvedValue(detail([mkItem('i1', 'x')]))
    data.addListItems.mockImplementation(async (_l: string, items: unknown[]) => items)
    renderAt('/listas/L1')
    await screen.findByText('x')
    fireEvent.click(screen.getByRole('button', { name: /Añadir elemento/ }))
    const box = await screen.findByRole('textbox', { name: 'Texto del elemento' })
    box.textContent = 'a'.repeat(1500)
    await act(async () => {
      fireEvent.blur(box)
    })
    await waitFor(() => expect(data.addListItems).toHaveBeenCalled())
    expect(data.addListItems.mock.calls[0][1][0].text.length).toBe(1000)
  })
})
