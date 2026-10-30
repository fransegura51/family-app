// @vitest-environment jsdom
// Contactos ↔ grupos en pantalla (datos simulados; el servidor se ensayó aparte en la base): corrección de nombres ya importados, formato de nombres, contactos familiares,
// compartir la lista de contactos, invitar responsables con código, «← Volver al grupo» y los accesos de «Añadir».
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GroupItem, Participant } from '@/domain/groups'

vi.mock('@/data/supabaseClient', () => ({ supabase: { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'me' } } }) } } }))
vi.mock('@/state/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/state/useRealtimeRefresh', () => ({ useRealtimeRefresh: () => undefined }))

const groupsData = vi.hoisted(() => ({
  loadGroup: vi.fn(),
  listParticipants: vi.fn(),
  updateParticipant: vi.fn().mockResolvedValue(undefined),
  updateGroup: vi.fn().mockResolvedValue(undefined),
  addParticipant: vi.fn(),
  setParticipantLeft: vi.fn(),
  deleteParticipant: vi.fn(),
  listManagers: vi.fn(),
  listManagerCandidates: vi.fn(),
  listManagerInvites: vi.fn(),
  createManagerInvite: vi.fn(),
  revokeManagerInvite: vi.fn(),
  addManager: vi.fn(),
  removeManager: vi.fn(),
  previewManagerInvite: vi.fn(),
  acceptManagerInvite: vi.fn(),
  previewGroupTransfer: vi.fn(),
  acceptGroupTransfer: vi.fn(),
  linkEventToGroup: vi.fn(),
  linkListToGroup: vi.fn(),
  loadGroupsHome: vi.fn(),
  groupsErrorMessage: (e: unknown) => String((e as Error)?.message ?? e),
}))
vi.mock('@/data/groups', () => groupsData)

const contactsData = vi.hoisted(() => ({
  listLinkedContacts: vi.fn().mockResolvedValue([]),
  listPendingContacts: vi.fn().mockResolvedValue([]),
  loadKnownPeople: vi.fn().mockResolvedValue([]),
  createReusedParticipants: vi.fn(),
  linkContactToParticipant: vi.fn().mockResolvedValue(undefined),
  unlinkContactFromParticipant: vi.fn().mockResolvedValue(undefined),
  addPendingContacts: vi.fn(),
  resolvePending: vi.fn(),
  pendingPhoneKeys: () => new Set<string>(),
}))
vi.mock('@/data/groupContacts', () => contactsData)
vi.mock('@/data/contacts', () => ({ listContacts: vi.fn().mockResolvedValue([]), addContactReturningId: vi.fn(), applyContactPatch: vi.fn() }))
vi.mock('@/data/groupFunds', () => ({ listFunds: vi.fn().mockResolvedValue([]), addMembers: vi.fn(), createFund: vi.fn() }))
vi.mock('@/data/events', () => ({ listEvents: vi.fn().mockResolvedValue([]) }))
vi.mock('@/data/lists', () => ({ loadListsOverview: vi.fn().mockResolvedValue({ lists: [] }), createList: vi.fn() }))
vi.mock('@/services/share', () => ({ shareText: vi.fn().mockResolvedValue(true), shareFiles: vi.fn().mockResolvedValue(false) }))

import { GroupBackLink, readFromGroup } from '@/ui/groups/GroupBackLink'
import { AddSheet } from '@/ui/groups/GroupAddSheets'
import { ManagersSheet } from '@/ui/groups/GroupSidePanels'
import { ParticipantsScreen } from '@/ui/groups/ParticipantsScreen'
import { ReceiveGroup } from '@/ui/groups/ReceiveGroup'

const G_ID = '11111111-1111-4111-8111-111111111111'
const grp = (over: Partial<GroupItem> = {}): GroupItem => ({
  id: G_ID, familyId: 'F', name: 'Clase de Eric', periodLabel: null, createdBy: 'me', archivedAt: null, copiedFrom: null, createdAt: '2026-10-01', folderId: null,
  nameFormat: 'full', sortBy: 'name', contactSharePresets: [], ...over,
})
const person = (over: Partial<Participant>): Participant => ({
  id: 'p', groupId: G_ID, name: 'X', surname: null, guardianName: null, phone: null, email: null, payerAlias: null, notes: null, leftAt: null, createdAt: '2026-01-01', ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  contactsData.listLinkedContacts.mockResolvedValue([])
  contactsData.listPendingContacts.mockResolvedValue([])
  contactsData.loadKnownPeople.mockResolvedValue([])
  groupsData.updateParticipant.mockResolvedValue(undefined)
  groupsData.updateGroup.mockResolvedValue(undefined)
})
afterEach(cleanup)

const renderParticipants = (people: Participant[], group = grp()) => {
  groupsData.loadGroup.mockResolvedValue(group)
  groupsData.listParticipants.mockResolvedValue(people)
  return render(
    <MemoryRouter>
      <ParticipantsScreen groupId={group.id} />
    </MemoryRouter>,
  )
}

describe('BLOQUE 2.1 · corregir los participantes ya importados', () => {
  const imported = [person({ id: '1', name: 'Aboutaleb Bassry, Seifeddine' }), person({ id: '2', name: 'Brambs , Leo' }), person({ id: '3', name: 'Eric', surname: 'García' })]
  it('avisa de las fichas con «Apellidos, Nombre» y las corrige solo si se marcan, tocando únicamente nombre y apellidos', async () => {
    renderParticipants(imported)
    expect(await screen.findByText(/parecen tener los apellidos dentro del nombre/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Revisar y corregir' }))
    const dlg = await screen.findByRole('dialog', { name: 'Revisar nombres y apellidos' })
    expect(within(dlg).getAllByText(/venía como «Apellidos, Nombre»/).length).toBe(2)
    fireEvent.click(within(dlg).getByRole('button', { name: /Corregir 2 fichas/ }))
    await waitFor(() => expect(groupsData.updateParticipant).toHaveBeenCalledTimes(2))
    expect(groupsData.updateParticipant).toHaveBeenCalledWith('1', { name: 'Seifeddine', surname: 'Aboutaleb Bassry', guardianName: null })
    expect(groupsData.updateParticipant).toHaveBeenCalledWith('2', { name: 'Leo', surname: 'Brambs', guardianName: null })
  })
  it('sin nada que corregir, no sale el aviso', async () => {
    renderParticipants([imported[2]])
    await screen.findByText('Eric García')
    expect(screen.queryByText(/apellidos dentro del nombre/)).toBeNull()
  })
})

describe('BLOQUE 5.1 · formato de nombres', () => {
  const people = [person({ id: '1', name: 'Lucas', surname: 'Alonso' }), person({ id: '2', name: 'Lucas', surname: 'Bravo' }), person({ id: '3', name: 'Eric', surname: 'García' })]
  it('la lista sigue el formato del grupo («Lucas A.», «Lucas B.») y su orden', async () => {
    renderParticipants(people, grp({ nameFormat: 'first_unique' }))
    expect(await screen.findByText('Lucas A.')).toBeTruthy()
    expect(screen.getByText('Lucas B.')).toBeTruthy()
    expect(screen.getByText('Eric')).toBeTruthy()
  })
  it('apellidos, nombre y orden por apellidos', async () => {
    renderParticipants(people, grp({ nameFormat: 'surname_first', sortBy: 'surname' }))
    await screen.findByText('Alonso, Lucas')
    const titles = [...document.querySelectorAll('[data-help-id="grupos.lista-participantes"] .grp-row-title')].map((e) => e.textContent)
    expect(titles).toEqual(['Alonso, Lucas', 'Bravo, Lucas', 'García, Eric'])
  })
  it('se cambia el formato por grupo con vista previa y se guarda en el grupo', async () => {
    renderParticipants(people)
    fireEvent.click(await screen.findByRole('button', { name: /Formato de nombres/ }))
    const dlg = await screen.findByRole('dialog', { name: 'Cómo se muestran los nombres' })
    fireEvent.click(within(dlg).getByRole('radio', { name: 'Solo nombre (diferenciando repetidos)' }))
    expect(within(dlg).getByText('Lucas A.')).toBeTruthy()
    fireEvent.click(within(dlg).getByRole('radio', { name: 'Por apellidos' }))
    fireEvent.click(within(dlg).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(groupsData.updateGroup).toHaveBeenCalledWith(G_ID, { nameFormat: 'first_unique', sortBy: 'surname' }))
  })
})

describe('BLOQUE 4 · contactos familiares de un alumno', () => {
  it('la ficha enseña los teléfonos y correos vinculados y permite vincular o crear sin salir del grupo', async () => {
    contactsData.listLinkedContacts.mockResolvedValue([
      { participantId: '3', contactId: 'c1', relation: 'madre', name: 'Jennifer', surname: 'Hepburn', phone: '611111111', email: 'j@x.es', extraPhones: ['622222222'], extraEmails: [] },
    ])
    renderParticipants([person({ id: '3', name: 'Eric', surname: 'García' })])
    fireEvent.click(await screen.findByText('Eric García'))
    const dlg = await screen.findByRole('dialog', { name: 'Ficha de la persona' })
    expect(within(dlg).getByText('Contactos familiares')).toBeTruthy()
    expect(within(dlg).getByText(/Jennifer Hepburn/)).toBeTruthy()
    expect(within(dlg).getByText('611111111')).toBeTruthy()
    expect(within(dlg).getByText('622222222')).toBeTruthy()
    expect(within(dlg).getByText(/j@x.es/)).toBeTruthy()
    fireEvent.click(within(dlg).getByRole('button', { name: 'Desvincular' }))
    fireEvent.click(within(dlg).getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(contactsData.unlinkContactFromParticipant).toHaveBeenCalledWith('3', 'c1'))
    expect(within(dlg).getByRole('button', { name: /Vincular o crear un contacto/ })).toBeTruthy()
  })
})

describe('BLOQUE 5.2 · compartir la lista de contactos', () => {
  const people = [person({ id: '1', name: 'Eric', surname: 'García', guardianName: 'Jennifer', phone: '600000001' }), person({ id: '2', name: 'Lucía', surname: 'Martínez' })]
  const links = [{ participantId: '1', contactId: 'c1', relation: 'madre', name: 'Jennifer', surname: null, phone: '611111111', email: 'j@x.es', extraPhones: [], extraEmails: [] }]
  it('vista previa con los campos elegidos, solo emails, y sin crear ningún enlace público', async () => {
    contactsData.listLinkedContacts.mockResolvedValue(links)
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    renderParticipants(people)
    fireEvent.click(await screen.findByRole('button', { name: /Compartir contactos/ }))
    const dlg = await screen.findByRole('dialog', { name: 'Compartir lista de contactos' })
    expect(within(dlg).getByText(/No se crea ningún enlace público|no se crea ningún enlace público/i)).toBeTruthy()
    expect(within(dlg).getByRole('checkbox', { name: 'Nombre del alumno' })).toBeTruthy()
    expect(within(dlg).getByRole('checkbox', { name: 'Teléfono' })).toBeTruthy()
    // Vista previa por defecto: alumno, padre/madre y teléfono; Lucía no tiene contacto y se quita.
    const pre = document.querySelector('[data-help-id="grupos.contactos-vista-previa"]')!.textContent ?? ''
    expect(pre).toContain('Eric García · Jennifer · 611111111')
    expect(pre).not.toContain('Lucía')
    fireEvent.click(within(dlg).getByRole('checkbox', { name: 'Correo electrónico' }))
    expect(document.querySelector('[data-help-id="grupos.contactos-vista-previa"]')!.textContent).toContain('j@x.es')
    fireEvent.click(within(dlg).getByRole('button', { name: 'Copiar solo emails' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('j@x.es'))
    // Nunca se incluyen notas, alias ni datos delicados: no hay ningún campo para eso.
    expect(within(dlg).queryByRole('checkbox', { name: /notas|alias|observaciones/i })).toBeNull()
  })
  it('guarda una configuración reutilizable en el grupo', async () => {
    renderParticipants(people)
    fireEvent.click(await screen.findByRole('button', { name: /Compartir contactos/ }))
    const dlg = await screen.findByRole('dialog', { name: 'Compartir lista de contactos' })
    fireEvent.change(within(dlg).getByLabelText('Nombre de la configuración'), { target: { value: 'Teléfonos' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(groupsData.updateGroup).toHaveBeenCalled())
    const arg = groupsData.updateGroup.mock.calls[0][1] as { contactSharePresets: { name: string; fields: string[] }[] }
    expect(arg.contactSharePresets[0]).toMatchObject({ name: 'Teléfonos', fields: ['student', 'guardian', 'phone'] })
  })
})

describe('BLOQUE 8 · invitar responsables con código', () => {
  it('genera un código de un solo uso, lo muestra con su caducidad y permite anularlo', async () => {
    groupsData.listManagers.mockResolvedValue([{ userId: 'me', name: 'Jennifer', isCreator: true }])
    groupsData.listManagerCandidates.mockResolvedValue([])
    groupsData.listManagerInvites.mockResolvedValueOnce([]).mockResolvedValue([{ id: 'i1', code: 'K7M2QX9P', expiresAt: '2026-11-06T10:00:00Z' }])
    groupsData.createManagerInvite.mockResolvedValue('K7M2QX9P')
    groupsData.revokeManagerInvite.mockResolvedValue(undefined)
    render(<ManagersSheet group={grp()} userId="me" onClose={() => undefined} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Invitar responsable mediante código' }))
    expect(await screen.findByText('K7M2QX9P')).toBeTruthy()
    expect(screen.getByText(/De un solo uso · caduca el 06\/11\/2026/)).toBeTruthy()
    expect(groupsData.createManagerInvite).toHaveBeenCalledWith(G_ID)
    fireEvent.click(screen.getByRole('button', { name: 'Anular este código' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(groupsData.revokeManagerInvite).toHaveBeenCalledWith('i1'))
  })

  const Where = () => <p data-testid="where">{useLocation().pathname}</p>
  const renderReceive = () =>
    render(
      <MemoryRouter initialEntries={['/grupos/recibir']}>
        <Routes>
          <Route path="/grupos/recibir" element={<ReceiveGroup />} />
          <Route path="/grupos/:id" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    )
  it('el mismo «Recibir un grupo» acepta un código de responsable: enseña qué grupo y qué permisos, y al aceptar entra en el MISMO grupo', async () => {
    groupsData.previewManagerInvite.mockResolvedValue({ groupName: 'Clase de Eric', fromName: 'Ana', participants: 18, funds: 2, alreadyManager: false })
    groupsData.acceptManagerInvite.mockResolvedValue(G_ID)
    renderReceive()
    fireEvent.change(screen.getByPlaceholderText(/K7M2QX9P/), { target: { value: 'k7m2qx9p' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ver qué recibo' }))
    expect(await screen.findByText(/te invita a ser/)).toBeTruthy()
    expect(screen.getByText(/Es el MISMO grupo, no una copia/)).toBeTruthy()
    expect(screen.getByText(/solo verás de la agenda de Ana los contactos vinculados/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar ser responsable' }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe(`/grupos/${G_ID}`))
    expect(groupsData.acceptManagerInvite).toHaveBeenCalledWith('K7M2QX9P')
    expect(groupsData.acceptGroupTransfer).not.toHaveBeenCalled()
  })
  it('si no es un código de responsable, prueba como copia de grupo (flujo de siempre)', async () => {
    groupsData.previewManagerInvite.mockRejectedValue(new Error('INVALID_CODE'))
    groupsData.previewGroupTransfer.mockResolvedValue({ groupName: 'Clase', fromName: 'Ana', mode: 'participantes', includeContacts: false, participants: 5, funds: 0 })
    renderReceive()
    fireEvent.change(screen.getByPlaceholderText(/K7M2QX9P/), { target: { value: 'ABCD2345' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ver qué recibo' }))
    expect(await screen.findByRole('button', { name: 'Aceptar el grupo' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Aceptar ser responsable' })).toBeNull()
  })
  it('no deja aceptar si ya eres responsable', async () => {
    groupsData.previewManagerInvite.mockResolvedValue({ groupName: 'Clase', fromName: 'Ana', participants: 1, funds: 0, alreadyManager: true })
    renderReceive()
    fireEvent.change(screen.getByPlaceholderText(/K7M2QX9P/), { target: { value: 'ABCD2345' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ver qué recibo' }))
    expect((await screen.findByRole('button', { name: 'Aceptar ser responsable' })) as HTMLButtonElement).toHaveProperty('disabled', true)
  })
})

describe('BLOQUE 7 · volver al grupo y evento con el formulario completo', () => {
  it('readFromGroup solo acepta un grupo bien formado', () => {
    expect(readFromGroup({ fromGroup: { id: G_ID, name: 'Clase' } })).toEqual({ id: G_ID, name: 'Clase' })
    expect(readFromGroup({ fromGroup: { id: 'no-uuid', name: 'x' } })).toBeNull()
    expect(readFromGroup(null)).toBeNull()
    expect(readFromGroup({})).toBeNull()
  })
  it('«← Volver a [grupo]» lleva al grupo exacto; sin grupo de origen no se pinta nada', () => {
    const { unmount } = render(
      <MemoryRouter>
        <GroupBackLink from={{ id: G_ID, name: 'Clase de Eric' }} />
      </MemoryRouter>,
    )
    const a = screen.getByRole('link', { name: /Volver a Clase de Eric/ })
    expect(a.getAttribute('href')).toBe(`/grupos/${G_ID}`)
    unmount()
    const { container } = render(
      <MemoryRouter>
        <GroupBackLink from={null} />
      </MemoryRouter>,
    )
    expect(container.textContent).toBe('')
  })
  it('«Evento» → crear uno nuevo abre el formulario original de Nuevo evento (no uno paralelo) vinculado a este grupo', async () => {
    const onOpen = vi.fn()
    const onClose = vi.fn()
    render(<AddSheet groupId={G_ID} linkedEvents={[]} linkedLists={[]} onClose={onClose} onFundCreated={() => undefined} onLinked={() => undefined} onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: /Evento/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Crear uno nuevo' }))
    expect(screen.getByText(/formulario completo de «Nuevo evento»/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir «Nuevo evento»' }))
    expect(onOpen).toHaveBeenCalledWith(`/eventos?nuevo=1&grupo=${G_ID}`)
    expect(groupsData.linkEventToGroup).not.toHaveBeenCalled() // se vincula al guardar el evento, en Eventos
  })
  it('«Añadir» ofrece «Solicitar datos» (junto a bote, evento y lista)', () => {
    const onOpen = vi.fn()
    render(<AddSheet groupId={G_ID} linkedEvents={[]} linkedLists={[]} onClose={() => undefined} onFundCreated={() => undefined} onLinked={() => undefined} onOpen={onOpen} />)
    for (const n of [/Bote compartido/, /Evento/, /Lista vinculada/]) expect(screen.getByRole('button', { name: n })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Solicitar datos/ }))
    expect(onOpen).toHaveBeenCalledWith(`/grupos/${G_ID}/formularios`)
  })
})
