// @vitest-environment jsdom
// Importar participantes (pantalla real, datos simulados): «Apellidos, Nombre» en nombre y apellidos, cambiar la lectura, y reconocer a personas de otros grupos
// (reutilizar sin fusionar solo, con confirmación en bloque, sin trasladar nada económico).
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GroupItem, Participant } from '@/domain/groups'
import { groupKnownPeople } from '@/domain/participantMatch'

vi.mock('@/data/supabaseClient', () => ({ supabase: { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'me' } } }) } } }))

const groupsData = vi.hoisted(() => ({
  addParticipants: vi.fn(),
  listParticipants: vi.fn(),
  loadGroupsHome: vi.fn(),
  updateParticipant: vi.fn(),
  groupsErrorMessage: (e: unknown) => String((e as Error)?.message ?? e),
}))
vi.mock('@/data/groups', () => groupsData)
const contactsData = vi.hoisted(() => ({ loadKnownPeople: vi.fn(), createReusedParticipants: vi.fn() }))
vi.mock('@/data/groupContacts', () => contactsData)
vi.mock('@/services/participantsDocument', () => ({ analyzeParticipantsImage: vi.fn(), ParticipantsReaderUnavailableError: class extends Error {} }))
vi.mock('@/ui/lists/sourceImage', () => ({ imageFileToCanvas: vi.fn(), openPdf: vi.fn() }))

import { ParticipantImport } from '@/ui/groups/ParticipantImport'

const G = '11111111-1111-4111-8111-111111111111'
const group: GroupItem = { id: G, familyId: 'F', name: 'Clase nueva', periodLabel: null, createdBy: 'me', archivedAt: null, copiedFrom: null, createdAt: '2026-10-01', folderId: null, nameFormat: 'full', sortBy: 'name', contactSharePresets: [] }
const person = (over: Partial<Participant>): Participant => ({
  id: 'p', groupId: 'g-otro', name: 'X', surname: null, guardianName: null, phone: null, email: null, payerAlias: null, notes: null, leftAt: null, createdAt: '2026-01-01', ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  groupsData.addParticipants.mockResolvedValue(['n1'])
  contactsData.loadKnownPeople.mockResolvedValue([])
  contactsData.createReusedParticipants.mockResolvedValue(['r1'])
})
afterEach(cleanup)

const paste = async (text: string, existing: Participant[] = []) => {
  const onDone = vi.fn()
  render(<ParticipantImport group={group} existing={existing} onClose={() => undefined} onDone={onDone} />)
  fireEvent.click(screen.getByRole('button', { name: /Pegar texto/ }))
  fireEvent.change(screen.getByLabelText('Texto con los participantes'), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Ver vista previa' }))
  await screen.findByText('Revisa antes de importar')
  return onDone
}

describe('BLOQUE 2.1 · nombre y apellidos en la vista previa', () => {
  it('«Aboutaleb Bassry, Seifeddine» queda como nombre «Seifeddine» y apellidos «Aboutaleb Bassry», y se guardan por separado', async () => {
    const onDone = await paste('Aboutaleb Bassry, Seifeddine\nMellado Vintila, Beatriz')
    const names = screen.getAllByLabelText('Nombre') as HTMLInputElement[]
    const surnames = screen.getAllByLabelText('Apellidos') as HTMLInputElement[]
    expect(names.map((i) => i.value)).toEqual(['Seifeddine', 'Beatriz'])
    expect(surnames.map((i) => i.value)).toEqual(['Aboutaleb Bassry', 'Mellado Vintila'])
    expect(screen.getByText(/«Apellidos, Nombre»/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Importar 2 personas/ }))
    await waitFor(() => expect(groupsData.addParticipants).toHaveBeenCalled())
    expect(groupsData.addParticipants.mock.calls[0][1]).toEqual([
      expect.objectContaining({ name: 'Seifeddine', surname: 'Aboutaleb Bassry', guardianName: null }),
      expect.objectContaining({ name: 'Beatriz', surname: 'Mellado Vintila', guardianName: null }),
    ])
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })
  it('se puede corregir a mano y volver a leer la lista como «Nombre, madre/padre»', async () => {
    await paste('Eric García, Jennifer\nLucía Martínez, Ana')
    fireEvent.click(screen.getByRole('button', { name: /Es «Nombre, madre\/padre»/ }))
    await waitFor(() => expect((screen.getAllByLabelText('Madre/padre') as HTMLInputElement[]).map((i) => i.value)).toEqual(['Jennifer', 'Ana']))
    expect((screen.getAllByLabelText('Nombre') as HTMLInputElement[]).map((i) => i.value)).toEqual(['Eric García', 'Lucía Martínez'])
  })
})

describe('BLOQUE 2.2 · reconocer participantes de otros grupos', () => {
  const clase = person({ id: 'a', groupId: 'g1', name: 'Pepito', surname: 'García', guardianName: 'Ana', phone: '611111111' })
  const futbol = person({ id: 'b', groupId: 'g2', name: 'Pepito', surname: 'García', phone: '622222222' })
  const known = () =>
    groupKnownPeople(
      [
        { participant: clase, groupName: 'Clase de Eric' },
        { participant: futbol, groupName: 'Fútbol' },
        { participant: person({ id: 'c', groupId: 'g1', name: 'Marta', surname: 'López', phone: '633333333' }), groupName: 'Clase de Eric' },
      ],
      [{ participantId: 'a', name: 'Ana', relation: 'madre' }],
    )

  it('enseña TODAS las candidatas con sus grupos, contactos y diferencias; no fusiona nada solo', async () => {
    contactsData.loadKnownPeople.mockResolvedValue(known())
    await paste('García, Pepito\t600000000\nNueva, Persona')
    expect(await screen.findByText(/Ya tienes a Pepito García registrado/)).toBeTruthy()
    const box = screen.getByText(/Ya tienes a Pepito García registrado/).closest('div')!.parentElement as HTMLElement
    expect(within(box).getAllByText(/Pepito García ·/)).toHaveLength(2) // dos fichas distintas: dos candidatas
    expect(within(box).getByText(/Clase de Eric/)).toBeTruthy()
    expect(within(box).getByText(/Fútbol/)).toBeTruthy()
    expect(within(box).getByText(/Contactos: Ana \(madre\)/)).toBeTruthy()
    expect(within(box).getAllByText(/≠ Teléfono/).length).toBeGreaterThan(0)
    // Sin pulsar nada, por defecto se crea una persona NUEVA.
    fireEvent.click(screen.getByRole('button', { name: /Importar 2 personas/ }))
    await waitFor(() => expect(groupsData.addParticipants).toHaveBeenCalled())
    expect(contactsData.createReusedParticipants).toHaveBeenCalledWith(G, [])
  })
  it('reutilizar comparte identidad y datos personales, sin trasladar notas ni alias de pago', async () => {
    contactsData.loadKnownPeople.mockResolvedValue(known())
    await paste('López, Marta')
    expect(await screen.findByText(/Ya tienes a Marta López registrado/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reutilizar esta ficha' }))
    fireEvent.click(screen.getByRole('button', { name: /reutilizar 1/ }))
    await waitFor(() => expect(contactsData.createReusedParticipants).toHaveBeenCalled())
    const [groupId, items] = contactsData.createReusedParticipants.mock.calls[0]
    expect(groupId).toBe(G)
    expect(items).toHaveLength(1)
    expect(items[0].sourceId).toBe('c')
    expect(items[0].data).toEqual({ name: 'Marta', surname: 'López', guardianName: null, phone: '633333333', email: null, personId: 'c' })
    expect(Object.keys(items[0].data)).not.toContain('notes')
  })
  it('en listas grandes se confirman las coincidencias de una vez (solo las que coinciden en nombre y teléfono, o las de un único candidato)', async () => {
    contactsData.loadKnownPeople.mockResolvedValue(known())
    await paste('López, Marta\t633 333 333\nGarcía, Pepito')
    // Marta: único candidato y mismo teléfono (fuerte). Pepito: dos candidatos (ambiguo).
    fireEvent.click(await screen.findByRole('button', { name: /Reutilizar las 1 que coinciden en nombre y teléfono/ }))
    fireEvent.click(screen.getByRole('button', { name: /Importar 1 persona y reutilizar 1/ }))
    await waitFor(() => expect(contactsData.createReusedParticipants).toHaveBeenCalled())
    expect(contactsData.createReusedParticipants.mock.calls[0][1]).toHaveLength(1)
    expect(groupsData.addParticipants.mock.calls[0][1]).toEqual([expect.objectContaining({ name: 'Pepito', surname: 'García' })])
  })
  it('sin coincidencias no sale ningún aviso', async () => {
    contactsData.loadKnownPeople.mockResolvedValue(known())
    await paste('Inventado, Nadie')
    await screen.findByText('Revisa antes de importar')
    expect(screen.queryByText(/Ya tienes a/)).toBeNull()
  })
})
