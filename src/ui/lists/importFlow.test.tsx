// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserList } from '@/domain/lists'

vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))
vi.mock('@/services/voice', () => ({ isDictationSupported: () => false, listenContinuous: vi.fn() }))
vi.mock('@/services/listDocument', () => ({ analyzeListImage: vi.fn(), ListReaderUnavailableError: class extends Error {} }))
const data = vi.hoisted(() => ({
  addListItems: vi.fn(),
  createList: vi.fn(),
  createListWithColumns: vi.fn(),
  addColumns: vi.fn(),
  deleteList: vi.fn(),
  loadListDetail: vi.fn(),
  loadListsOverview: vi.fn(),
  replaceListItems: vi.fn(),
}))
vi.mock('@/data/lists', () => data)

import { ImportFlow } from '@/ui/lists/ImportFlow'

const list = (over: Partial<UserList> = {}): UserList => ({
  id: 'L1',
  familyId: 'F',
  createdBy: 'me',
  title: 'Colegio',
  kind: 'tareas',
  visibility: 'privada',
  folderId: null,
  sortOrder: 1,
  sortMode: 'manual',
  archivedAt: null,
  createdAt: 'x',
  updatedAt: 'x',
  ...over,
})

const onFinished = vi.fn()
const onClose = vi.fn()
const detail = (items: { sortOrder: number }[] = [{ sortOrder: 5000 }], kind = 'tareas') => ({ list: list({ kind: kind as 'tareas' }), columns: [{ id: 'COL', listId: 'L1', title: 'Pros', sortOrder: 0 }], items })

beforeEach(() => {
  vi.clearAllMocks()
  data.loadListDetail.mockResolvedValue(detail())
  data.loadListsOverview.mockResolvedValue({ userId: 'me', folders: [{ id: 'FO', name: 'Casa' }], lists: [list(), list({ id: 'L2', title: 'Vacaciones', folderId: 'FO' })], items: [] })
  data.addListItems.mockResolvedValue([])
  data.replaceListItems.mockResolvedValue(3)
  data.deleteList.mockResolvedValue(undefined)
})
afterEach(() => cleanup())

async function toReview(text: string, current: UserList | null = list()) {
  render(<ImportFlow current={current} onClose={onClose} onFinished={onFinished} />)
  fireEvent.click(screen.getByRole('button', { name: /Dictar o pegar texto/ }))
  fireEvent.change(screen.getByLabelText('Texto a importar'), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
  await screen.findByText('Revisa antes de guardar')
}

describe('Mis listas — importar', () => {
  it('un dictado con varios elementos da elementos separados y editables antes de guardar', async () => {
    await toReview('comprar mochila, dos cuadernos, un estuche y preparar uniforme')
    const inputs = screen.getAllByLabelText('Elemento') as HTMLInputElement[]
    expect(inputs.map((i) => i.value)).toEqual(['Comprar mochila', 'Dos cuadernos', 'Un estuche', 'Preparar uniforme'])
    fireEvent.change(inputs[1], { target: { value: '2 cuadernos grandes' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Quitar este elemento' })[3])
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(data.addListItems).toHaveBeenCalled())
    const [target, items] = data.addListItems.mock.calls[0]
    expect(target).toBe('L1')
    expect(items.map((i: { text: string }) => i.text)).toEqual(['Comprar mochila', '2 cuadernos grandes', 'Un estuche'])
    // se añaden DESPUÉS de lo que ya había (sort_order mayor que el último existente)
    expect(items[0].sortOrder).toBeGreaterThan(5000)
    expect(onFinished).toHaveBeenCalledWith('L1')
  })

  it('texto pegado con una línea por elemento (y viñetas) se respeta', async () => {
    await toReview('- leche\n- pan\n2) huevos')
    expect((screen.getAllByLabelText('Elemento') as HTMLInputElement[]).map((i) => i.value)).toEqual(['leche', 'pan', 'huevos'])
  })

  it('sin texto no avanza', async () => {
    render(<ImportFlow current={list()} onClose={onClose} onFinished={onFinished} />)
    fireEvent.click(screen.getByRole('button', { name: /Dictar o pegar texto/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(screen.getByText('Escribe, pega o dicta algo primero.')).toBeTruthy()
  })

  it('sustituir pide confirmación explícita con el número de elementos y solo entonces reemplaza', async () => {
    data.loadListDetail.mockResolvedValue(detail([{ sortOrder: 1 }, { sortOrder: 2 }, { sortOrder: 3 }, { sortOrder: 4 }]))
    await toReview('uno, dos')
    fireEvent.click(screen.getByRole('radio', { name: /Sustituir/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Sustituir…' }))
    expect(await screen.findByText(/Se quitarán los 4 elementos/)).toBeTruthy()
    expect(data.replaceListItems).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Sí, sustituir' }))
    await waitFor(() => expect(data.replaceListItems).toHaveBeenCalledWith('L1', [{ text: 'Uno', depth: 0 }, { text: 'Dos', depth: 0 }]))
    expect(data.addListItems).not.toHaveBeenCalled()
    expect(onFinished).toHaveBeenCalledWith('L1')
  })

  it('crear una lista nueva pide título; se crea privada y si falla a medias no deja una lista vacía', async () => {
    data.createListWithColumns.mockResolvedValue({ list: list({ id: 'NEW', title: 'Nueva' }), columns: [] })
    data.addListItems.mockRejectedValue(new Error('red'))
    await toReview('uno, dos')
    fireEvent.click(screen.getByRole('radio', { name: /Crear una lista nueva/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(screen.getByText('Escribe un título.')).toBeTruthy()
    expect(data.createListWithColumns).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Título de la lista nueva'), { target: { value: 'Nueva' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(data.createListWithColumns).toHaveBeenCalledWith({ title: 'Nueva', kind: 'tareas' }, []))
    await waitFor(() => expect(data.deleteList).toHaveBeenCalledWith('NEW'))
    expect(await screen.findByText(/No se ha cambiado nada/)).toBeTruthy()
    expect(onFinished).not.toHaveBeenCalled()
  })

  it('añadir a otra lista existente (de cualquier carpeta): hay que elegirla y se añade ahí', async () => {
    data.loadListDetail.mockImplementation(async (id: string) => ({ ...detail([{ sortOrder: 10 }]), list: list({ id }) }))
    await toReview('uno')
    fireEvent.click(screen.getByRole('radio', { name: /otra lista/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(screen.getByText('Elige la lista a la que añadirlos.')).toBeTruthy()
    await waitFor(() => expect(screen.getByRole('option', { name: 'Vacaciones (Casa)' })).toBeTruthy())
    fireEvent.change(screen.getByLabelText('Lista de destino'), { target: { value: 'L2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(data.addListItems).toHaveBeenCalled())
    expect(data.addListItems.mock.calls[0][0]).toBe('L2')
    expect(onFinished).toHaveBeenCalledWith('L2')
  })

  it('en una comparativa los importados van a la primera columna', async () => {
    data.loadListDetail.mockResolvedValue(detail([], 'comparativa'))
    data.loadListDetail.mockResolvedValue({ ...detail([]), list: list({ kind: 'comparativa' }) })
    await toReview('uno', list({ kind: 'comparativa' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(data.addListItems).toHaveBeenCalled())
    expect(data.addListItems.mock.calls[0][1][0].columnId).toBe('COL')
  })

  it('cancelar no cambia nada', async () => {
    await toReview('uno, dos')
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onClose).toHaveBeenCalled()
    expect(data.addListItems).not.toHaveBeenCalled()
    expect(data.replaceListItems).not.toHaveBeenCalled()
    expect(data.createListWithColumns).not.toHaveBeenCalled()
  })

  it('sin lista abierta solo ofrece crear una nueva o añadir a otra (importar desde fuera de una lista)', async () => {
    await toReview('uno', null)
    expect(screen.queryByRole('radio', { name: /Añadir a esta lista/ })).toBeNull()
    expect(screen.queryByRole('radio', { name: /Sustituir/ })).toBeNull()
    expect(screen.getByRole('radio', { name: /Crear una lista nueva/ })).toBeTruthy()
  })
})
