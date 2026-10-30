// @vitest-environment jsdom
// BLOQUE 1 · Contactos: tarjetas compactas (correo completo, sin botones repetidos), ficha completa al tocar, datos opcionales ampliados, compartir varios y que un dato
// nuevo no pisa uno existente al importar un .vcf.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact } from '@/domain/types'

vi.mock('@/data/supabaseClient', () => ({ supabase: { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'me' } } }) } } }))
vi.mock('@/services/contactPicker', () => ({ isContactPickerSupported: () => false, pickContacts: vi.fn() }))

const share = vi.hoisted(() => ({ shareText: vi.fn().mockResolvedValue(true) }))
vi.mock('@/services/share', () => share)

const data = vi.hoisted(() => ({
  listContacts: vi.fn(),
  addContact: vi.fn().mockResolvedValue(undefined),
  addContactReturningId: vi.fn().mockResolvedValue('new'),
  updateContact: vi.fn().mockResolvedValue(undefined),
  applyContactPatch: vi.fn().mockResolvedValue(undefined),
  updateContactBirthDate: vi.fn().mockResolvedValue(undefined),
  deleteContact: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/data/contacts', () => data)
const links = vi.hoisted(() => ({ listLinksOfContact: vi.fn().mockResolvedValue([]) }))
vi.mock('@/data/groupContacts', () => links)

import { ContactsScreen } from '@/ui/ContactsScreen'

const contact = (over: Partial<Contact>): Contact => ({
  id: 'c1', familyId: 'f', name: 'Colegio Los Álamos', category: 'Colegio', phone: null, email: null, notes: null, birthDate: null, birthdayFavorite: false, ...over,
})
const LONG = 'secretaria.administracion.colegio.losalamos.madrid@educacionmadrid.example.org'

beforeEach(() => {
  vi.clearAllMocks()
  links.listLinksOfContact.mockResolvedValue([])
  data.listContacts.mockResolvedValue([
    contact({ id: 'c1', name: 'Colegio Los Álamos', category: 'Colegio', phone: '911223344', email: LONG, notes: 'Extensión 4' }),
    contact({ id: 'c2', name: 'Jennifer', surname: 'Hepburn', nickname: 'Jenni', category: 'Familia', phone: '611111111', extraPhones: ['622222222'], extraEmails: ['otro@x.es'], birthDate: '1990-05-17' }),
  ])
})
afterEach(cleanup)

const renderScreen = () =>
  render(
    <MemoryRouter>
      <ContactsScreen />
    </MemoryRouter>,
  )

describe('BLOQUE 1.1 · tarjetas compactas', () => {
  it('el correo largo se ve entero (sin recortar) y la tarjeta enseña lo esencial', async () => {
    renderScreen()
    const card = await screen.findByRole('button', { name: /Abrir la ficha de Colegio Los Álamos/ })
    expect(within(card).getByText(LONG)).toBeTruthy() // el texto completo está en pantalla
    expect(within(card).getByText(/Colegio · 911223344/)).toBeTruthy()
    // El correo puede ocupar varias líneas: la hoja de estilos no lo recorta con puntos suspensivos.
    const css = (await import('node:fs')).readFileSync('src/ui/styles.css', 'utf8')
    const block = css.slice(css.indexOf('.contact-card-email {'), css.indexOf('}', css.indexOf('.contact-card-email {')))
    expect(block).toContain('overflow-wrap: anywhere')
    expect(block).not.toContain('nowrap')
    expect(block).not.toContain('ellipsis')
  })
  it('no hay botones repetidos en cada tarjeta (llamar, compartir, editar, eliminar viven en la ficha)', async () => {
    renderScreen()
    await screen.findByRole('button', { name: /Abrir la ficha de Colegio/ })
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Compartir contacto' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Llamar' })).toBeNull()
  })
  it('muestra nombre y apellidos, el apodo y que hay más teléfonos y correos', async () => {
    renderScreen()
    const card = await screen.findByRole('button', { name: /Abrir la ficha de Jennifer Hepburn/ })
    expect(within(card).getByText(/«Jenni»/)).toBeTruthy()
    expect(within(card).getByText(/611111111 \(\+1\)/)).toBeTruthy()
    expect(within(card).getByText('otro@x.es')).toBeTruthy()
  })
  it('la búsqueda y los filtros de siempre siguen funcionando (también por apodo)', async () => {
    renderScreen()
    await screen.findByRole('button', { name: /Abrir la ficha de Colegio/ })
    fireEvent.change(screen.getByPlaceholderText(/Buscar por nombre/), { target: { value: 'jenni' } })
    expect(screen.queryByRole('button', { name: /Abrir la ficha de Colegio/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Abrir la ficha de Jennifer/ })).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText(/Buscar por nombre/), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Familia' }))
    expect(screen.queryByRole('button', { name: /Abrir la ficha de Colegio/ })).toBeNull()
  })
})

describe('BLOQUE 1.2 · ficha completa', () => {
  it('al tocar la tarjeta se abre la ficha con todos los datos y las acciones', async () => {
    links.listLinksOfContact.mockResolvedValue([{ participantId: 'p1', participantName: 'Eric García', groupId: 'g1', groupName: 'Clase de Eric', relation: 'madre' }])
    renderScreen()
    fireEvent.click(await screen.findByRole('button', { name: /Abrir la ficha de Jennifer Hepburn/ }))
    const dlg = await screen.findByRole('dialog', { name: 'Jennifer Hepburn' })
    for (const t of ['611111111', '622222222', '17 de mayo']) expect(within(dlg).getAllByText(new RegExp(t)).length).toBeGreaterThan(0)
    expect(within(dlg).getByRole('link', { name: '611111111' }).getAttribute('href')).toBe('tel:611111111')
    expect(within(dlg).getByRole('link', { name: 'otro@x.es' }).getAttribute('href')).toBe('mailto:otro@x.es')
    expect(await within(dlg).findByText('Eric García')).toBeTruthy() // relaciones familiares
    expect(within(dlg).getByRole('link', { name: 'Clase de Eric' })).toBeTruthy()
    expect(within(dlg).getAllByRole('link', { name: /Llamar/ }).length).toBeGreaterThan(0)
    for (const b of [/Compartir/, /Editar/, /Eliminar/]) expect(within(dlg).getAllByRole('button', { name: b }).length).toBeGreaterThan(0)
  })
  it('compartir desde la ficha manda nombre, teléfonos y correos', async () => {
    renderScreen()
    fireEvent.click(await screen.findByRole('button', { name: /Abrir la ficha de Jennifer Hepburn/ }))
    const dlg = await screen.findByRole('dialog', { name: 'Jennifer Hepburn' })
    fireEvent.click(within(dlg).getByRole('button', { name: /Compartir/ }))
    await waitFor(() => expect(share.shareText).toHaveBeenCalled())
    expect(share.shareText.mock.calls[0][0].text).toBe('Jennifer Hepburn · 611111111 · 622222222 · otro@x.es')
  })
  it('editar: «Más datos» es opcional y plegado; los campos nuevos se guardan sin tocar los de siempre', async () => {
    renderScreen()
    fireEvent.click(await screen.findByRole('button', { name: /Abrir la ficha de Colegio/ }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Colegio Los Álamos' })).getByRole('button', { name: /Editar/ }))
    const form = (await screen.findByText('Editar contacto')).closest('.modal-sheet') as HTMLElement
    expect(within(form).queryByLabelText('Apodo o nombre habitual')).toBeNull() // plegado por defecto
    fireEvent.click(within(form).getByRole('button', { name: /Más datos/ }))
    fireEvent.change(within(form).getByLabelText('Apellidos'), { target: { value: 'Secretaría' } })
    fireEvent.change(within(form).getByPlaceholderText('Otro teléfono'), { target: { value: '933445566' } })
    fireEvent.click(within(form).getAllByRole('button', { name: 'Añadir' })[0])
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(data.updateContact).toHaveBeenCalled())
    expect(data.updateContact.mock.calls[0][0]).toBe('c1')
    expect(data.updateContact.mock.calls[0][1]).toMatchObject({ name: 'Colegio Los Álamos', phone: '911223344', email: LONG, surname: 'Secretaría', extraPhones: ['933445566'] })
  })
  it('un contacto de siempre se edita sin rellenar nada nuevo: no se obliga a nada', async () => {
    renderScreen()
    fireEvent.click(await screen.findByRole('button', { name: /Abrir la ficha de Colegio/ }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Colegio Los Álamos' })).getByRole('button', { name: /Editar/ }))
    const form = (await screen.findByText('Editar contacto')).closest('.modal-sheet') as HTMLElement
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(data.updateContact).toHaveBeenCalled())
  })
})

describe('BLOQUE 1.3 · compartir varios', () => {
  it('en modo «Compartir varios» tocar una tarjeta la marca (no abre la ficha) y manda las elegidas', async () => {
    renderScreen()
    fireEvent.click(await screen.findByRole('button', { name: '📤 Compartir varios' }))
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar Colegio Los Álamos' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '📤 Compartir 1 contacto' }))
    await waitFor(() => expect(share.shareText).toHaveBeenCalled())
    expect(share.shareText.mock.calls[0][0].text).toContain(LONG)
  })
})

describe('BLOQUE 1.3 · datos nuevos de un contacto que ya existe (importar .vcf)', () => {
  const vcf = (phone: string) => {
    const content = `BEGIN:VCARD\nVERSION:3.0\nFN:Colegio Los Álamos\nTEL:${phone}\nEND:VCARD\n`
    // jsdom no implementa Blob.text(): se añade solo para esta prueba.
    return Object.assign(new File([content], 'c.vcf', { type: 'text/vcard' }), { text: async () => content })
  }
  const upload = async (file: File) => {
    const input = (await screen.findByText(/Importar contactos desde el móvil/)).closest('div')!.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [file] })
    fireEvent.change(input)
    // Un contacto que ya existe sale sin marcar: se marca para importarlo.
    fireEvent.click(await screen.findByRole('checkbox', { name: /Colegio Los Álamos/ }))
  }
  it('con otro teléfono pregunta y, por defecto, conserva el anterior: nunca se sobrescribe solo', async () => {
    renderScreen()
    await upload(vcf('+34 699 888 777'))
    expect(await screen.findByText(/Ya existe en tu agenda con otro dato — Teléfono/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Importar 1/ }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /Importar 1/ })).toBeNull())
    expect(data.applyContactPatch).not.toHaveBeenCalled()
    expect(data.addContactReturningId).not.toHaveBeenCalled()
    expect(data.updateContact).not.toHaveBeenCalled()
  })
  it('añadir como adicional conserva el teléfono principal y guarda el nuevo aparte', async () => {
    renderScreen()
    await upload(vcf('+34 699 888 777'))
    await screen.findByText(/Ya existe en tu agenda con otro dato/)
    expect(screen.getByRole('button', { name: 'Sustituir el anterior' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Añadir como adicional' }))
    fireEvent.click(screen.getByRole('button', { name: /Importar 1/ }))
    await waitFor(() => expect(data.applyContactPatch).toHaveBeenCalled())
    const [id, patch] = data.applyContactPatch.mock.calls[0]
    expect(id).toBe('c1')
    expect(patch.phone).toBeUndefined()
    expect(patch.extraPhones).toEqual(['+34 699 888 777'])
  })
  it('sustituir cambia el principal solo si se elige', async () => {
    renderScreen()
    await upload(vcf('+34 699 888 777'))
    await screen.findByText(/Ya existe en tu agenda con otro dato/)
    fireEvent.click(screen.getByRole('button', { name: 'Sustituir el anterior' }))
    fireEvent.click(screen.getByRole('button', { name: /Importar 1/ }))
    await waitFor(() => expect(data.applyContactPatch).toHaveBeenCalled())
    expect(data.applyContactPatch.mock.calls[0][1].phone).toBe('+34 699 888 777')
  })
  it('el mismo teléfono escrito de otra forma no es un conflicto: no pregunta nada', async () => {
    renderScreen()
    await upload(vcf('911 22 33 44'))
    await screen.findByRole('button', { name: /Importar 1/ })
    expect(screen.queryByText(/Ya existe en tu agenda con otro dato/)).toBeNull()
  })
})
