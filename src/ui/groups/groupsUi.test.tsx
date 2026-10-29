// @vitest-environment jsdom
// Gestión de grupos: pantallas reales con la capa de datos simulada (el servidor se ensayó aparte en la base). Cubre carpetas cerradas, grupo solo con nombre, bote con
// exclusiones, historial de solo lectura, WhatsApp sin datos privados y que un bote nuevo vuelve a empezar con todos.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FundDetail } from '@/data/groupFunds'
import type { GroupsHomeData } from '@/data/groups'
import type { GroupItem, Participant } from '@/domain/groups'

vi.mock('@/data/supabaseClient', () => ({ supabase: { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'me' } } }) } } }))
vi.mock('@/state/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/state/useRealtimeRefresh', () => ({ useRealtimeRefresh: () => undefined }))

const groupsData = vi.hoisted(() => ({
  loadGroupsHome: vi.fn(),
  createGroup: vi.fn(),
  createFolder: vi.fn(),
  renameFolder: vi.fn(),
  deleteFolder: vi.fn(),
  moveGroupToFolder: vi.fn(),
  loadGroup: vi.fn(),
  listParticipants: vi.fn(),
  listGroupEvents: vi.fn(),
  listGroupLists: vi.fn(),
  unlinkEventFromGroup: vi.fn(),
  unlinkListFromGroup: vi.fn(),
  updateGroup: vi.fn(),
  deleteGroup: vi.fn(),
  addParticipant: vi.fn(),
  groupsErrorMessage: (e: unknown) => String((e as Error)?.message ?? e),
}))
vi.mock('@/data/groups', () => groupsData)

const fundsData = vi.hoisted(() => ({
  listFunds: vi.fn(),
  loadFund: vi.fn(),
  setMembersState: vi.fn(),
  addMembers: vi.fn(),
  reopenFund: vi.fn(),
  markNoticeReviewed: vi.fn(),
  deleteEmptyFund: vi.fn(),
  listOpenFundsAcrossGroups: vi.fn(),
  listShareLinks: vi.fn(),
  createShareLink: vi.fn(),
  revokeShareLink: vi.fn(),
  fundShareUrl: (t: string) => `https://x/?bote=${t}`,
  closeFund: vi.fn(),
  transferBetweenFunds: vi.fn(),
  updateFund: vi.fn(),
  removeMember: vi.fn(),
  setMemberRequired: vi.fn(),
  addEntry: vi.fn(),
  updateEntry: vi.fn(),
  voidEntry: vi.fn(),
  setAllocations: vi.fn(),
  uploadFundReceipt: vi.fn(),
  getFundReceiptUrl: vi.fn(),
  listIncomingBankTx: vi.fn().mockResolvedValue([]),
  createFund: vi.fn(),
}))
vi.mock('@/data/groupFunds', () => fundsData)

import { FundScreen } from '@/ui/groups/FundScreen'
import { GruposHome } from '@/ui/groups/GruposHome'
import { GroupDetail } from '@/ui/groups/GroupDetail'

const grp = (id: string, name: string, over: Partial<GroupItem> = {}): GroupItem => ({
  id,
  familyId: 'F',
  name,
  periodLabel: null,
  createdBy: 'me',
  archivedAt: null,
  copiedFrom: null,
  createdAt: '2026-01-01',
  folderId: null,
  ...over,
})
const person = (id: string, name: string, over: Partial<Participant> = {}): Participant => ({
  id,
  groupId: 'g1',
  name,
  surname: null,
  guardianName: null,
  phone: null,
  email: null,
  payerAlias: null,
  notes: null,
  leftAt: null,
  createdAt: '2026-01-01',
  ...over,
})

function renderAt(path: string, element: React.ReactNode, route = '/grupos/*') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={route} element={element} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  fundsData.listIncomingBankTx.mockResolvedValue([])
})
afterEach(cleanup)

describe('pantalla principal', () => {
  const home: GroupsHomeData = {
    userId: 'me',
    groups: [grp('g1', 'Clase de Eric', { folderId: 'f1' }), grp('g2', 'Equipo de fútbol'), grp('g3', 'Clase antigua', { archivedAt: '2026-06-30' })],
    folders: [{ id: 'f1', name: 'Cole', sortOrder: 1 }],
    participantCounts: { g1: 24, g2: 12 },
  }
  it('las carpetas aparecen cerradas y se abren al tocarlas; los grupos sueltos y los archivados van aparte', async () => {
    groupsData.loadGroupsHome.mockResolvedValue(home)
    renderAt('/grupos', <GruposHome />)
    await screen.findByText('Equipo de fútbol')
    expect(screen.queryByText('Clase de Eric')).toBeNull() // dentro de la carpeta cerrada
    expect(screen.queryByText('Clase antigua')).toBeNull() // archivado
    fireEvent.click(screen.getByRole('button', { name: /^Cole/ }))
    expect(await screen.findByText('Clase de Eric')).toBeTruthy()
    expect(screen.getByText(/24 participantes/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Ver archivados/ }))
    expect(await screen.findByText('Clase antigua')).toBeTruthy()
  })

  it('crear un grupo pide solo el nombre', async () => {
    groupsData.loadGroupsHome.mockResolvedValue({ ...home, groups: [], folders: [] })
    groupsData.createGroup.mockResolvedValue('nuevo')
    renderAt('/grupos', <GruposHome />)
    await screen.findByText(/Aún no tienes grupos/)
    fireEvent.click(screen.getByRole('button', { name: /Nuevo grupo/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByText(/fecha|categoría|participantes/i)).toBeNull()
    fireEvent.change(within(dialog).getByPlaceholderText(/Clase de Eric/), { target: { value: 'Clase de Eric' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Crear grupo' }))
    await waitFor(() => expect(groupsData.createGroup).toHaveBeenCalledWith('Clase de Eric', null))
  })

  it('un nombre vacío no crea nada', async () => {
    groupsData.loadGroupsHome.mockResolvedValue({ ...home, groups: [], folders: [] })
    renderAt('/grupos', <GruposHome />)
    await screen.findByText(/Aún no tienes grupos/)
    fireEvent.click(screen.getByRole('button', { name: /Nuevo grupo/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Crear grupo' }))
    expect(await screen.findByText(/Escribe el nombre del grupo/)).toBeTruthy()
    expect(groupsData.createGroup).not.toHaveBeenCalled()
  })
})

describe('pantalla de un grupo', () => {
  it('muestra solo lo que existe (sin módulos vacíos), el acceso destacado a participantes y «Añadir» con las tres opciones', async () => {
    groupsData.loadGroup.mockResolvedValue(grp('g1', 'Clase de Eric'))
    groupsData.listParticipants.mockResolvedValue([person('p1', 'Eric'), person('p2', 'Lucía'), person('p3', 'Baja', { leftAt: '2026-01-01' })])
    fundsData.listFunds.mockResolvedValue([])
    groupsData.listGroupEvents.mockResolvedValue([{ id: 'e1', title: 'Fiesta' }])
    groupsData.listGroupLists.mockResolvedValue([])
    renderAt('/grupos/g1', <GroupDetail groupId="g1" />)
    await screen.findByRole('heading', { name: 'Clase de Eric' })
    expect(screen.getByText(/2 participantes/)).toBeTruthy() // la persona de baja no cuenta
    expect(screen.getByText(/Gestionar participantes/)).toBeTruthy()
    expect(screen.getByText('Fiesta')).toBeTruthy()
    expect(screen.queryByText('Botes')).toBeNull()
    expect(screen.queryByText('Listas')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Añadir/ }))
    const dialog = await screen.findByRole('dialog')
    for (const t of ['💰 Bote compartido', '🎉 Evento', '📝 Lista vinculada']) expect(within(dialog).getByText(t)).toBeTruthy()
  })
})

describe('bote', () => {
  const people = Array.from({ length: 6 }, (_, i) => person(`p${i}`, `Alumno ${i}`, { phone: `61200000${i}`, guardianName: `Madre ${i}`, payerAlias: `alias${i}` }))
  const fundBase = {
    id: 'f1',
    groupId: 'g1',
    name: 'Excursión',
    contributionType: 'igual' as const,
    defaultAmount: 10,
    status: 'abierto' as const,
    closedAt: null,
    closeNote: null,
    leftoverAmount: null,
    leftoverDestination: null,
    reopenedCount: 0,
    readonlyHistory: false,
    history: null,
    createdAt: '2026-01-01',
  }
  const detail = (over: Partial<FundDetail['fund']> = {}): FundDetail => ({
    fund: { ...fundBase, ...over },
    members: people.map((p) => ({ participantId: p.id, state: 'participa' as const, requiredAmount: null })),
    entries: [
      { id: 'e1', fundId: 'f1', kind: 'aportacion', amount: 20, entryDate: '2026-11-02', payerLabel: 'Bizum de Madre 0', method: 'bizum', concept: null, receiptPath: null, hadReceipt: false, bankTransactionId: null, transferId: null, counterpartFundId: null, voidedAt: null, voidReason: null, createdAt: '2026-11-02' },
      { id: 'e2', fundId: 'f1', kind: 'aportacion', amount: 5, entryDate: '2026-11-03', payerLabel: null, method: 'efectivo', concept: null, receiptPath: null, hadReceipt: false, bankTransactionId: null, transferId: null, counterpartFundId: null, voidedAt: null, voidReason: null, createdAt: '2026-11-03' },
    ],
    allocations: [
      { entryId: 'e1', participantId: 'p0', amount: 10 },
      { entryId: 'e1', participantId: 'p1', amount: 10 },
    ],
    notices: [],
  })

  function setup(d: FundDetail) {
    groupsData.loadGroup.mockResolvedValue(grp('g1', 'Clase de Eric'))
    groupsData.listParticipants.mockResolvedValue(people)
    fundsData.loadFund.mockResolvedValue(d)
    return renderAt('/grupos/g1/bote/f1', <FundScreen groupId="g1" fundId="f1" />)
  }

  it('resumen: lo previsto, lo recaudado, lo pendiente y el saldo; el Bizum de dos hermanos cuenta una vez; lo sin identificar se avisa', async () => {
    setup(detail())
    await screen.findByRole('heading', { name: 'Excursión' })
    const stats = document.querySelector('.grp-stats') as HTMLElement
    const t = stats.textContent ?? ''
    expect(t).toContain('60 €Previsto') // 6 × 10
    expect(t).toContain('25 €Recaudado') // 20 + 5
    expect(t).toContain('40 €Pendiente') // 60 − 20 pagados
    expect(t).toContain('25 €Saldo disponible')
    expect(screen.getByText((_, el) => el?.classList.contains('grp-banner') === true && /5 € de ingresos sin identificar/.test(el.textContent ?? ''))).toBeTruthy()
    expect(screen.getByText(/2 pagados · 4 pendientes/)).toBeTruthy()
  })

  it('excluir a varios alumnos afecta solo a este bote', async () => {
    setup(detail())
    await screen.findByRole('heading', { name: 'Excursión' })
    fireEvent.click(screen.getByRole('button', { name: /Seleccionar varios/ }))
    for (const n of [2, 3, 4]) fireEvent.click(await screen.findByLabelText(`Seleccionar a Alumno ${n}`))
    fireEvent.click(screen.getByRole('button', { name: 'No participan' }))
    await waitFor(() => expect(fundsData.setMembersState).toHaveBeenCalledWith('f1', expect.arrayContaining(['p2', 'p3', 'p4']), 'no_participa'))
    expect(fundsData.setMembersState.mock.calls[0][1]).toHaveLength(3)
  })

  it('compartir por WhatsApp: vista previa con los nombres de los niños y sin teléfonos, madres ni alias', async () => {
    setup(detail())
    await screen.findByRole('heading', { name: 'Excursión' })
    fireEvent.click(screen.getByRole('button', { name: /Compartir por WhatsApp/ }))
    const text = (await screen.findByLabelText('Texto a compartir')) as HTMLTextAreaElement
    expect(text.value).toContain('Pendientes de pago (4 de 6)')
    expect(text.value).toContain('• Alumno 2 — 10 €')
    expect(text.value).not.toContain('Alumno 0')
    for (const secret of ['61200000', 'Madre', 'alias', 'Bizum de']) expect(text.value).not.toContain(secret)
  })

  it('un historial recibido es de solo lectura: se identifica como «Gestión anterior» y no ofrece registrar ni cerrar ni reabrir', async () => {
    setup(detail({ readonlyHistory: true, status: 'cerrado', history: { responsible: 'Ana', group: 'Clase 2025', from: '2025-09-01', to: '2026-06-01', chain: [{}, {}] } }))
    await screen.findByRole('heading', { name: 'Excursión' })
    expect(screen.getAllByText(/Gestión anterior/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Recibido de Ana/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Registrar/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Reabrir/ })).toBeNull()
    expect(screen.queryByRole('button', { name: '⋯' })).toBeNull()
  })

  it('un bote cerrado propio se puede reabrir (con registro en el servidor) y no deja registrar hasta reabrirlo', async () => {
    setup(detail({ status: 'cerrado', closedAt: '2026-12-01T10:00:00Z' }))
    await screen.findByRole('heading', { name: 'Excursión' })
    expect(screen.queryByRole('button', { name: /＋ Registrar/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Reabrir para corregir/ }))
    await waitFor(() => expect(fundsData.reopenFund).toHaveBeenCalledWith('f1'))
  })

  it('personas del grupo que no están en el bote se ofrecen para incorporar, sin hacerlo solas', async () => {
    const d = detail()
    d.members = d.members.slice(0, 4)
    setup(d)
    await screen.findByRole('heading', { name: 'Excursión' })
    expect(screen.getByText(/2 personas del grupo no están en este bote/)).toBeTruthy()
    expect(fundsData.addMembers).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Incorporar' }))
    await waitFor(() => expect(fundsData.addMembers).toHaveBeenCalledWith('f1', ['p4', 'p5']))
  })
})
