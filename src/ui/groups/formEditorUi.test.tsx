// @vitest-environment jsdom
// Editor de «Solicitar datos» (pantalla real, datos simulados): preguntas plegables, «＋ Añadir pregunta» con los nueve tipos, ejemplos por tipo,
// editor de opciones y selector de ficha limitado a lo coherente con el tipo.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FIELD_EXAMPLE, FIELD_TYPES, FIELD_TYPE_LABEL, changeFieldType, compatibleMaps, newField, normalizeFields, type FormField } from '@/domain/groupForms'

vi.mock('@/data/supabaseClient', () => ({ supabase: { auth: { getUser: vi.fn() } } }))
const forms = vi.hoisted(() => ({
  createForm: vi.fn(),
  updateForm: vi.fn(),
  setFormRetention: vi.fn(),
  saveTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  listTemplates: vi.fn(),
}))
vi.mock('@/data/groupForms', () => forms)
vi.mock('@/data/groups', () => ({ groupsErrorMessage: (e: unknown) => String((e as Error)?.message ?? e) }))

import { FormEditor, type StartTemplate } from '@/ui/groups/GroupFormBuilder'

beforeEach(() => {
  vi.clearAllMocks()
  forms.createForm.mockResolvedValue('nuevo')
  forms.listTemplates.mockResolvedValue([])
})
afterEach(cleanup)

const field = (type: FormField['type'], label: string, over: Partial<FormField> = {}): FormField => ({ ...newField(type), label, ...over })

const mount = (fields: FormField[]) => {
  const start: StartTemplate = { title: 'Excursión', purpose: 'Organizar la salida', intro: '', fields }
  const onSaved = vi.fn()
  render(
    <MemoryRouter>
      <FormEditor groupId="g" groupName="Clase" defaultRequester="Jennifer" form={null} start={start} onSaved={onSaved} onCancel={() => undefined} />
    </MemoryRouter>,
  )
  return onSaved
}

describe('preguntas plegables', () => {
  it('cada pregunta sale plegada con número, texto, tipo y «Obligatoria»; plegar y desplegar no pierde lo escrito', () => {
    mount([field('email', 'Correo de contacto', { required: true }), field('texto', 'Alergias')])
    const heads = screen.getAllByRole('button', { expanded: false })
    expect(heads.some((h) => /1.*Correo de contacto.*Correo electrónico · Obligatoria/.test(h.textContent ?? ''))).toBe(true)
    expect(screen.queryByLabelText('Texto de la pregunta 1')).toBeNull()
    const first = heads.find((h) => /Correo de contacto/.test(h.textContent ?? ''))!
    fireEvent.click(first)
    const input = screen.getByLabelText('Texto de la pregunta 1') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Correo de la familia' } })
    fireEvent.click(screen.getByRole('button', { expanded: true, name: /Correo de la familia/ }))
    expect(screen.queryByLabelText('Texto de la pregunta 1')).toBeNull()
    expect(screen.getByRole('button', { name: /Correo de la familia/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Correo de la familia/ }))
    expect((screen.getByLabelText('Texto de la pregunta 1') as HTMLInputElement).value).toBe('Correo de la familia')
  })
  it('subir y bajar siguen disponibles en la cabecera', () => {
    mount([field('texto', 'Primera'), field('texto', 'Segunda')])
    fireEvent.click(screen.getByLabelText('Bajar la pregunta 1'))
    const titles = screen.getAllByRole('button', { expanded: false }).map((b) => b.textContent ?? '')
    expect(titles.findIndex((t) => /Segunda/.test(t))).toBeLessThan(titles.findIndex((t) => /Primera/.test(t)))
  })
})

describe('«＋ Añadir pregunta» y ejemplos por tipo', () => {
  it('un solo botón abre el selector con los nueve tipos; la pregunta nueva se abre sola', () => {
    mount([])
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '＋ Añadir pregunta' }))
    const items = within(screen.getByRole('menu')).getAllByRole('menuitem')
    expect(items.map((i) => i.querySelector('.grp-type-name')?.textContent)).toEqual(FIELD_TYPES.map((t) => FIELD_TYPE_LABEL[t]))
    fireEvent.click(items[2]) // Fecha
    expect(screen.queryByRole('menu')).toBeNull()
    const q = screen.getByLabelText('Texto de la pregunta 1') as HTMLInputElement
    expect(q.placeholder).toBe('Por ejemplo: Fecha de nacimiento')
    expect(q.value).toBe('') // el ejemplo es solo orientativo: no se guarda
  })
  it('«Teléfono de urgencia» solo se sugiere para teléfono; cada tipo tiene su ejemplo', () => {
    const ex = FIELD_TYPES.map((t) => FIELD_EXAMPLE[t])
    expect(new Set(ex).size).toBe(9)
    expect(FIELD_TYPES.filter((t) => FIELD_EXAMPLE[t].includes('Teléfono de urgencia'))).toEqual(['telefono'])
    expect(FIELD_EXAMPLE.email).toMatch(/Correo/)
    expect(FIELD_EXAMPLE.si_no).toMatch(/Asistirás/)
    expect(FIELD_EXAMPLE.archivo).toMatch(/autorización firmada/)
  })
  it('cambiar el tipo conserva el texto, la ayuda y la obligatoriedad, y recuerda las opciones', () => {
    const f = field('seleccion', 'Menú', { required: true, help: 'Elige uno', options: ['Normal', 'Vegetariano'] })
    const t = changeFieldType(f, 'texto')
    expect(t).toMatchObject({ label: 'Menú', required: true, help: 'Elige uno', type: 'texto' })
    expect(changeFieldType(t, 'multiple').options).toEqual(['Normal', 'Vegetariano'])
    expect(normalizeFields([t]).fields[0].options).toEqual([]) // al guardar, un texto no lleva opciones
  })
})

describe('editor de opciones', () => {
  const open = () => {
    const onSaved = mount([field('seleccion', 'Talla', { options: ['S', 'M'] })])
    fireEvent.click(screen.getByRole('button', { name: /Talla/ }))
    return onSaved
  }
  it('cada opción en su fila: se añade, se edita, se reordena y se quita', () => {
    open()
    expect((screen.getByLabelText('Opción 1') as HTMLInputElement).value).toBe('S')
    fireEvent.click(screen.getByRole('button', { name: '＋ Añadir opción' }))
    fireEvent.change(screen.getByLabelText('Opción 3'), { target: { value: 'L' } })
    fireEvent.click(screen.getByLabelText('Subir la opción 3'))
    expect(['Opción 1', 'Opción 2', 'Opción 3'].map((l) => (screen.getByLabelText(l) as HTMLInputElement).value)).toEqual(['S', 'L', 'M'])
    fireEvent.click(screen.getByLabelText('Quitar la opción 2'))
    expect(['Opción 1', 'Opción 2'].map((l) => (screen.getByLabelText(l) as HTMLInputElement).value)).toEqual(['S', 'M'])
    expect((screen.getByLabelText('Quitar la opción 1') as HTMLButtonElement).disabled).toBe(true) // mínimo dos
  })
  it('una opción vacía avisa y bloquea el guardado; con todas rellenas se guarda', async () => {
    const onSaved = open()
    fireEvent.click(screen.getByRole('button', { name: '＋ Añadir opción' }))
    expect(screen.getByText(/Rellena o quita las opciones vacías/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar formulario' }))
    expect(await screen.findByText(/Hay opciones vacías en «Talla»/)).toBeTruthy()
    expect(forms.createForm).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Opción 3'), { target: { value: 'L' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar formulario' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('nuevo'))
    expect(forms.createForm.mock.calls[0][1].fields[0].options).toEqual(['S', 'M', 'L'])
  })
})

describe('guardar en la ficha: solo lo coherente con el tipo', () => {
  const choices = (type: FormField['type']) => {
    cleanup()
    mount([field(type, 'Dato')])
    fireEvent.click(screen.getByRole('button', { name: /Dato/ }))
    const sel = screen.queryByLabelText('Ficha de la pregunta 1') as HTMLSelectElement | null
    return sel ? [...sel.options].map((o) => o.textContent) : null
  }
  it('correo → correo; teléfono → teléfono; texto → apellidos y madre/padre/tutor; el resto, nada', () => {
    expect(choices('email')).toEqual(['No guardar en la ficha', 'Correo de la ficha'])
    expect(choices('telefono')).toEqual(['No guardar en la ficha', 'Teléfono de la ficha'])
    expect(choices('texto')).toEqual(['No guardar en la ficha', 'Apellidos', 'Madre, padre o tutor'])
    for (const t of ['fecha', 'numero', 'si_no', 'archivo'] as const) expect(choices(t)).toBeNull()
    cleanup()
    mount([field('fecha', 'Nacimiento')])
    fireEvent.click(screen.getByRole('button', { name: /Nacimiento/ }))
    expect(screen.getByText(/la ficha de la persona no tiene un campo de este tipo/)).toBeTruthy()
  })
  it('el servidor tampoco acepta asociaciones incoherentes, ni para datos delicados', () => {
    expect(compatibleMaps('texto')).toEqual(['surname', 'guardianName'])
    const bad = normalizeFields([
      { ...field('texto', 'a'), id: 'a', mapsTo: 'email' },
      { ...field('telefono', 'b'), id: 'b', mapsTo: 'email' },
      { ...field('email', 'c'), id: 'c', mapsTo: 'email' },
      { ...field('email', 'd'), id: 'd', mapsTo: 'email', sensitive: true },
      { ...field('fecha', 'e'), id: 'e', mapsTo: 'surname' },
    ]).fields
    expect(bad.map((f) => f.mapsTo)).toEqual([null, null, 'email', null, null])
  })
})
