// @vitest-environment jsdom
// Corrección 5 — dictado en «Mis listas»: separación como en Compras, separación manual en la revisión y columnas de las comparativas.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ListColumn, UserList } from '@/domain/lists'

vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))
vi.mock('@/services/voice', () => ({ isDictationSupported: () => false, listenContinuous: vi.fn() }))
vi.mock('@/services/listDocument', () => ({ analyzeListImage: vi.fn(), ListReaderUnavailableError: class extends Error {} }))
const ai = vi.hoisted(() => ({ splitListItemsWithAi: vi.fn() }))
vi.mock('@/services/splitGroceryList', () => ai)
const data = vi.hoisted(() => ({
  addListItems: vi.fn(),
  createListWithColumns: vi.fn(),
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
  title: 'Mi lista',
  kind: 'tareas',
  visibility: 'privada',
  folderId: null,
  sortOrder: 1,
  sortMode: 'manual',
  itemStyle: null,
  archivedAt: null,
  createdAt: 'x',
  updatedAt: 'x',
  ...over,
})
const FIVE: ListColumn[] = ['Madrid', 'Lisboa', 'Roma', 'París', 'Viena'].map((title, n) => ({ id: `C${n}`, listId: 'L1', title, sortOrder: n }))
const detailOf = (kind: UserList['kind'], columns: ListColumn[] = []) => ({ userId: 'me', list: list({ kind }), columns, items: [{ sortOrder: 5000 }], shoppingLinked: [] })

const onFinished = vi.fn()
const onClose = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  data.loadListDetail.mockResolvedValue(detailOf('tareas'))
  data.loadListsOverview.mockResolvedValue({ userId: 'me', folders: [], lists: [list(), list({ id: 'L2', title: 'Viaje', kind: 'comparativa' })], items: [] })
  data.addListItems.mockResolvedValue([])
  data.replaceListItems.mockResolvedValue(3)
  data.deleteList.mockResolvedValue(undefined)
  data.createListWithColumns.mockResolvedValue({ list: list({ id: 'NEW' }), columns: [] })
})
afterEach(() => cleanup())

async function dictate(text: string, current: UserList | null = list(), extra: { startColumnId?: string } = {}) {
  render(<ImportFlow current={current} onClose={onClose} onFinished={onFinished} {...extra} />)
  fireEvent.click(screen.getByRole('button', { name: /Dictar o pegar texto/ }))
  fireEvent.change(screen.getByLabelText('Texto a importar'), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
  await screen.findByText('Revisa antes de guardar')
}
const rows = () => (screen.getAllByLabelText('Elemento') as HTMLInputElement[]).map((i) => i.value)
const savedTexts = () => (data.addListItems.mock.calls[0][1] as { text: string }[]).map((i) => i.text)

describe('dictado → elementos independientes', () => {
  it('un solo elemento: una línea y NO se gasta IA', async () => {
    await dictate('Pan')
    expect(rows()).toEqual(['Pan'])
    expect(ai.splitListItemsWithAi).not.toHaveBeenCalled()
  })

  it('varios elementos con pausas (las comas que mete el micrófono) → una línea por elemento, sin IA', async () => {
    await dictate('comprar platos, comprar toallas, limpiar la ducha')
    expect(rows()).toEqual(['Comprar platos', 'Comprar toallas', 'Limpiar la ducha'])
    expect(ai.splitListItemsWithAi).not.toHaveBeenCalled()
  })

  it('enumeración con «y» y sin signos de puntuación en el último', async () => {
    await dictate('comprar platos, comprar toallas y limpiar la ducha')
    expect(rows()).toEqual(['Comprar platos', 'Comprar toallas', 'Limpiar la ducha'])
  })

  it('reconocimiento imperfecto sin pausas: pide a la MISMA IA de separación (con el formato de la lista) y deja revisarlo', async () => {
    ai.splitListItemsWithAi.mockResolvedValue(['regalo platos', 'comprado toallas', 'limpia la ducha', 'entregar el suelo'])
    await dictate('Regalo platos comprado toallas limpia la ducha entregar el suelo')
    expect(ai.splitListItemsWithAi).toHaveBeenCalledWith('Regalo platos comprado toallas limpia la ducha entregar el suelo', 'tareas')
    expect(rows()).toEqual(['Regalo platos', 'Comprado toallas', 'Limpia la ducha', 'Entregar el suelo'])
    expect(screen.getByText(/Pepa ha separado el texto/)).toBeTruthy()
    expect(data.addListItems).not.toHaveBeenCalled() // la IA nunca guarda: primero se revisa
  })

  it('la IA recibe el formato de la lista (Ideas) y no una compra', async () => {
    ai.splitListItemsWithAi.mockResolvedValue(['Viaje a Lisboa', 'Libro de recetas'])
    await dictate('viaje a lisboa libro de recetas', list({ kind: 'ideas' }))
    expect(ai.splitListItemsWithAi).toHaveBeenCalledWith('Viaje a lisboa libro de recetas', 'ideas')
  })

  it('sin conexión con la IA no se pierde nada: queda una línea, se avisa y se puede separar a mano', async () => {
    ai.splitListItemsWithAi.mockRejectedValue(new Error('sin red'))
    await dictate('Comprar platos comprar toallas')
    expect(rows()).toEqual(['Comprar platos comprar toallas'])
    expect(screen.getByText(/No he podido separarlo automáticamente/)).toBeTruthy()
  })

  it('texto pegado con una línea por elemento: no usa IA', async () => {
    await dictate('1. Comprar platos\n2. Comprar toallas')
    expect(rows()).toEqual(['Comprar platos', 'Comprar toallas'])
    expect(ai.splitListItemsWithAi).not.toHaveBeenCalled()
  })
})

describe('revisión: separar a mano, unir, editar y guardar', () => {
  it('«Separar aquí» parte la línea en el cursor; «Unir con el anterior» la vuelve a juntar', async () => {
    ai.splitListItemsWithAi.mockResolvedValue(['Comprar platos comprar toallas'])
    await dictate('Comprar platos comprar toallas')
    const input = screen.getByLabelText('Elemento') as HTMLInputElement
    input.focus()
    input.setSelectionRange('Comprar platos'.length, 'Comprar platos'.length)
    fireEvent.select(input)
    fireEvent.click(screen.getByRole('button', { name: /Separar aquí/ }))
    expect(rows()).toEqual(['Comprar platos', 'Comprar toallas'])
    fireEvent.click(screen.getByRole('button', { name: /Unir con el anterior: Comprar toallas/ }))
    expect(rows()).toEqual(['Comprar platos comprar toallas'])
  })

  it('separar sin cursor o en un extremo avisa y no crea elementos vacíos', async () => {
    await dictate('uno, dos')
    fireEvent.click(screen.getAllByRole('button', { name: /Separar aquí/ })[0])
    expect(screen.getByText(/Pon el cursor en el texto/)).toBeTruthy()
    const input = screen.getAllByLabelText('Elemento')[0] as HTMLInputElement
    input.setSelectionRange(0, 0)
    fireEvent.select(input)
    fireEvent.click(screen.getAllByRole('button', { name: /Separar aquí/ })[0])
    expect(screen.getByText(/Pon el cursor en medio del texto/)).toBeTruthy()
    expect(rows()).toEqual(['Uno', 'Dos'])
  })

  it('editar, eliminar, añadir y reordenar; lo guardado respeta el orden final', async () => {
    await dictate('uno, dos, tres')
    fireEvent.change(screen.getAllByLabelText('Elemento')[1], { target: { value: 'Dos corregido' } })
    fireEvent.click(screen.getByRole('button', { name: 'Subir: Tres' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Quitar este elemento' })[0]) // quita «Uno»
    fireEvent.click(screen.getByRole('button', { name: /Añadir línea/ }))
    const boxes = screen.getAllByLabelText('Elemento') as HTMLInputElement[]
    fireEvent.change(boxes[boxes.length - 1], { target: { value: 'Cuatro' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(data.addListItems).toHaveBeenCalled())
    expect(savedTexts()).toEqual(['Tres', 'Dos corregido', 'Cuatro'])
    expect(onFinished).toHaveBeenCalledWith('L1')
  })

  it('importación en Tareas: añade a la lista, sin columnas', async () => {
    await dictate('comprar platos, limpiar la ducha')
    expect(screen.queryByLabelText(/Columna de/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(data.addListItems).toHaveBeenCalled())
    expect(data.addListItems.mock.calls[0][0]).toBe('L1')
    expect((data.addListItems.mock.calls[0][1] as { columnId: string | null }[]).map((i) => i.columnId)).toEqual([null, null])
  })

  it('importación en Ideas: añade a la lista con el texto limpio', async () => {
    data.loadListDetail.mockResolvedValue(detailOf('ideas'))
    await dictate('viaje a Lisboa, libro de recetas', list({ kind: 'ideas' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(data.addListItems).toHaveBeenCalled())
    expect(savedTexts()).toEqual(['Viaje a Lisboa', 'Libro de recetas'])
  })

  it('cancelar no modifica nada', async () => {
    await dictate('uno, dos')
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onClose).toHaveBeenCalled()
    for (const f of [data.addListItems, data.replaceListItems, data.createListWithColumns, data.deleteList]) expect(f).not.toHaveBeenCalled()
  })
})

describe('comparativas: cada elemento a su columna', () => {
  const cmp = () => list({ kind: 'comparativa' })
  beforeEach(() => {
    data.loadListDetail.mockImplementation(async (id: string) => ({ ...detailOf('comparativa', FIVE), list: list({ id, kind: 'comparativa' }) }))
  })

  it('el selector enseña las columnas REALES (también las cinco y con títulos propios) y lo predeterminado se ve', async () => {
    await dictate('comprar platos, comprar toallas, limpiar la ducha', cmp())
    const selects = await screen.findAllByLabelText(/Columna de/)
    expect(selects).toHaveLength(3)
    const first = selects[0] as HTMLSelectElement
    expect(within(first).getAllByRole('option').map((o) => o.textContent)).toEqual(['Madrid', 'Lisboa', 'Roma', 'París', 'Viena'])
    expect(selects.map((s) => (s as HTMLSelectElement).value)).toEqual(['C0', 'C0', 'C0']) // predeterminada visible, no silenciosa
  })

  it('se pueden asignar elementos distintos a columnas distintas en una sola importación', async () => {
    await dictate('comprar platos, comprar toallas, limpiar la ducha', cmp())
    const selects = (await screen.findAllByLabelText(/Columna de/)) as HTMLSelectElement[]
    fireEvent.change(selects[1], { target: { value: 'C3' } })
    fireEvent.change(selects[2], { target: { value: 'C1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(data.addListItems).toHaveBeenCalled())
    const sent = data.addListItems.mock.calls[0][1] as { text: string; columnId: string }[]
    expect(sent.map((i) => [i.text, i.columnId])).toEqual([
      ['Comprar platos', 'C0'],
      ['Comprar toallas', 'C3'],
      ['Limpiar la ducha', 'C1'],
    ])
  })

  it('si el dictado empieza desde una columna, esa es la predeterminada', async () => {
    await dictate('uno, dos', cmp(), { startColumnId: 'C2' })
    const selects = (await screen.findAllByLabelText(/Columna de/)) as HTMLSelectElement[]
    expect(selects.map((s) => s.value)).toEqual(['C2', 'C2'])
  })

  it('añadir a OTRA comparativa muestra las columnas de esa lista', async () => {
    await dictate('uno, dos', list())
    fireEvent.click(screen.getByRole('radio', { name: /otra lista/ }))
    expect(screen.queryByLabelText(/Columna de/)).toBeNull()
    fireEvent.change(screen.getByLabelText('Lista de destino'), { target: { value: 'L2' } })
    const selects = (await screen.findAllByLabelText(/Columna de/)) as HTMLSelectElement[]
    fireEvent.change(selects[1], { target: { value: 'C4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(data.addListItems).toHaveBeenCalled())
    expect(data.addListItems.mock.calls[0][0]).toBe('L2')
    expect((data.addListItems.mock.calls[0][1] as { columnId: string }[]).map((i) => i.columnId)).toEqual(['C0', 'C4'])
  })

  it('sustituir en una comparativa conserva la columna de cada elemento', async () => {
    await dictate('uno, dos', cmp())
    const selects = (await screen.findAllByLabelText(/Columna de/)) as HTMLSelectElement[]
    fireEvent.change(selects[1], { target: { value: 'C2' } })
    fireEvent.click(screen.getByRole('radio', { name: /Sustituir/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Sustituir…' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, sustituir' }))
    await waitFor(() => expect(data.replaceListItems).toHaveBeenCalled())
    expect(data.replaceListItems.mock.calls[0][1]).toEqual([
      { text: 'Uno', depth: 0, columnId: 'C0' },
      { text: 'Dos', depth: 0, columnId: 'C2' },
    ])
  })

  it('crear una comparativa nueva durante la importación pide primero modalidad y número de columnas, y asigna a las columnas reales', async () => {
    data.createListWithColumns.mockResolvedValue({
      list: list({ id: 'NEW', kind: 'comparativa' }),
      columns: ['Opción 1', 'Opción 2', 'Opción 3'].map((title, n) => ({ id: `R${n}`, listId: 'NEW', title, sortOrder: n })),
    })
    await dictate('uno, dos, tres', null)
    fireEvent.change(screen.getByLabelText('Título de la lista nueva'), { target: { value: 'Destino' } })
    fireEvent.change(screen.getByLabelText('Tipo de lista'), { target: { value: 'comparativa' } })
    expect(screen.getByText('¿Qué quieres comparar?', { selector: 'legend' })).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: /Varias opciones/ }))
    fireEvent.click(screen.getByRole('radio', { name: '3' }))
    const selects = (await screen.findAllByLabelText(/Columna de/)) as HTMLSelectElement[]
    expect(within(selects[0]).getAllByRole('option').map((o) => o.textContent)).toEqual(['Opción 1', 'Opción 2', 'Opción 3'])
    fireEvent.change(selects[1], { target: { value: 'new:2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(data.createListWithColumns).toHaveBeenCalledWith({ title: 'Destino', kind: 'comparativa' }, ['Opción 1', 'Opción 2', 'Opción 3']))
    await waitFor(() => expect(data.addListItems).toHaveBeenCalled())
    expect(data.addListItems.mock.calls[0][0]).toBe('NEW')
    expect((data.addListItems.mock.calls[0][1] as { columnId: string }[]).map((i) => i.columnId)).toEqual(['R0', 'R2', 'R0'])
    expect(onFinished).toHaveBeenCalledWith('NEW')
  })

  it('si falla el guardado de una comparativa nueva no queda una lista vacía por el camino', async () => {
    data.createListWithColumns.mockResolvedValue({ list: list({ id: 'NEW', kind: 'comparativa' }), columns: [{ id: 'R0', listId: 'NEW', title: 'Pros', sortOrder: 0 }, { id: 'R1', listId: 'NEW', title: 'Contras', sortOrder: 1 }] })
    data.addListItems.mockRejectedValue(new Error('red'))
    await dictate('uno', null)
    fireEvent.change(screen.getByLabelText('Título de la lista nueva'), { target: { value: 'X' } })
    fireEvent.change(screen.getByLabelText('Tipo de lista'), { target: { value: 'comparativa' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(data.deleteList).toHaveBeenCalledWith('NEW'))
    expect(onFinished).not.toHaveBeenCalled()
  })

  it('las pruebas de persistencia: lo guardado conserva texto, sangría y columna tal y como se revisó', async () => {
    await dictate('uno, dos', cmp())
    fireEvent.click(screen.getAllByRole('button', { name: 'Poner como subelemento' })[1])
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(data.addListItems).toHaveBeenCalled())
    expect((data.addListItems.mock.calls[0][1] as { depth: number }[]).map((i) => i.depth)).toEqual([0, 1])
  })
})
