// Fase 14E — "Exportar invitados". Modelo canónico puro: una sola
// representación de filas a partir de la que se construyen las 3 vistas
// (mesas/familias/alfabético) y, más adelante, CSV/impresión/compartir
// — nunca una lógica distinta por formato (petición explícita: "Todos
// consumen el mismo modelo").
//
// No recalcula nada que ya exista: reutiliza computeGuestBreakdownStatus
// y computeTableOccupancy de domain/events.ts tal cual (mismo criterio
// que ya ve el organizador en Invitados/Mesas), nunca reimplementa su
// lógica. adults_count/children_count (event_guests) siguen siendo la
// fuente de verdad — esto solo LEE, nunca escribe ni modifica nada.
//
// Reglas de la Fase 14E ya cerradas (ver informe de auditoría 14D):
// - Grupo SIN personas desglosadas → una fila "group_aggregate" (todo
//   el grupo cuenta como unidad, exactamente el modo "unidad" de
//   computeGuestSeatingStatus/computeTableOccupancy) — nunca se
//   inventan nombres para esas personas.
// - Grupo CON personas desglosadas → una fila "named" por persona +
//   como mucho una fila "pending_adult"/"pending_child" con el resto
//   sin identificar (adults_count - adultos nombrados, etc.) — nunca
//   más gente de la declarada, nunca menos.
// - Una persona pendiente de identificar NUNCA se asigna a una mesa
//   (seatable: false) — solo el grupo agregado (sin desglose) hereda la
//   mesa de su unidad, porque esa asignación SÍ es real y ya existe.
// - RSVP sigue siendo de GRUPO: toda fila hereda el rsvpStatus de su
//   grupo tal cual, nunca se inventa un estado individual.
// - Nunca se intenta reconciliar adults_count/children_count con
//   rsvp_adults_count/rsvp_children_count cuando difieren — se
//   muestran los dos números, nunca se decide automáticamente quién
//   falta.
import { computeGuestBreakdownStatus, computeTableOccupancy } from '@/domain/events'
import type { EventGuest, EventGuestInviteScope, EventGuestMember, EventGuestMemberType, EventGuestRsvpStatus, EventTableSeat } from '@/domain/types'

export type GuestExportOrganizeMode = 'mesas' | 'familias' | 'alfabetico'
export type GuestExportAttendanceFilter = 'todos' | 'confirmados'

export type ExportRowKind = 'named' | 'pending_adult' | 'pending_child' | 'group_aggregate'

// groupId/tableId son SOLO para agrupar internamente (comparar/unir
// filas del mismo grupo o mesa) — nunca deben aparecer en un CSV, un
// texto compartido o el HTML de impresión. groupName/tableName son la
// única forma "humana" de identificar grupo/mesa que debe salir fuera.
export interface ExportGuestRow {
  groupId: string
  groupName: string
  kind: ExportRowKind
  personName: string | null
  personType: EventGuestMemberType | null
  count: number
  tableId: string | null
  tableName: string | null
  seatable: boolean
  groupRsvpStatus: EventGuestRsvpStatus
  groupInviteScope: EventGuestInviteScope | null
  groupDeclaredAdults: number
  groupDeclaredChildren: number
  groupConfirmedAdults: number | null
  groupConfirmedChildren: number | null
}

export interface GuestExportModel {
  rows: ExportGuestRow[]
  tables: EventTableSeat[]
  filteredGuests: EventGuest[]
  filteredMembersByGuestId: Record<string, EventGuestMember[]>
}

interface GuestExportInput {
  guests: EventGuest[]
  membersByGuestId: Record<string, EventGuestMember[]>
  tables: EventTableSeat[]
}

export function buildGuestExportModel(input: GuestExportInput, attendance: GuestExportAttendanceFilter): GuestExportModel {
  const filteredGuests = attendance === 'confirmados' ? input.guests.filter((g) => g.rsvpStatus === 'confirmado') : input.guests
  const filteredMembersByGuestId: Record<string, EventGuestMember[]> = {}
  for (const g of filteredGuests) filteredMembersByGuestId[g.id] = input.membersByGuestId[g.id] ?? []

  const tableNameById = new Map(input.tables.map((t) => [t.id, t.name]))
  const tableName = (tableId: string | null): string | null => (tableId != null ? (tableNameById.get(tableId) ?? null) : null)

  const rows: ExportGuestRow[] = []
  for (const g of filteredGuests) {
    const members = filteredMembersByGuestId[g.id]
    const groupConfirmedAdults = g.rsvpStatus === 'confirmado' ? (g.rsvpAdultsCount ?? g.adultsCount) : null
    const groupConfirmedChildren = g.rsvpStatus === 'confirmado' ? (g.rsvpChildrenCount ?? g.childrenCount) : null
    const groupFields = {
      groupId: g.id,
      groupName: g.displayName,
      groupRsvpStatus: g.rsvpStatus,
      groupInviteScope: g.inviteScope,
      groupDeclaredAdults: g.adultsCount,
      groupDeclaredChildren: g.childrenCount,
      groupConfirmedAdults,
      groupConfirmedChildren,
    }

    if (members.length === 0) {
      // Modo "unidad" (idéntico a computeGuestSeatingStatus/
      // computeTableOccupancy): el grupo entero cuenta como una única
      // plaza agregada, y SÍ hereda la mesa de la unidad si la tiene —
      // esa asignación es real, no hay nada "pendiente" que resolver.
      rows.push({
        ...groupFields,
        kind: 'group_aggregate',
        personName: null,
        personType: null,
        count: g.adultsCount + g.childrenCount,
        tableId: g.tableId,
        tableName: tableName(g.tableId),
        seatable: true,
      })
      continue
    }

    for (const m of members) {
      rows.push({
        ...groupFields,
        kind: 'named',
        personName: m.name,
        personType: m.personType,
        count: 1,
        tableId: m.tableId,
        tableName: tableName(m.tableId),
        seatable: true,
      })
    }

    const status = computeGuestBreakdownStatus(g, members)
    const pendingAdults = Math.max(0, g.adultsCount - status.adultsMembers)
    const pendingChildren = Math.max(0, g.childrenCount - status.childrenMembers)
    // Personas declaradas pero todavía sin nombre: nunca se inventan,
    // nunca se asignan a una mesa (seatable: false) — igual que en
    // pantalla (Mesas), donde no hay ningún <select> para una plaza sin
    // nombre.
    if (pendingAdults > 0) {
      rows.push({ ...groupFields, kind: 'pending_adult', personName: null, personType: 'adulto', count: pendingAdults, tableId: null, tableName: null, seatable: false })
    }
    if (pendingChildren > 0) {
      rows.push({ ...groupFields, kind: 'pending_child', personName: null, personType: 'nino', count: pendingChildren, tableId: null, tableName: null, seatable: false })
    }
  }

  return { rows, tables: input.tables, filteredGuests, filteredMembersByGuestId }
}

// ---------------------------------------------------------------------
// Etiquetas — el esquema real de datos no guarda género de la persona
// (person_type solo distingue adulto/niño), así que las etiquetas son
// siempre invariables ("adulto"/"niño"), nunca adivinadas a partir del
// nombre.
// ---------------------------------------------------------------------
export function personTypeLabel(type: EventGuestMemberType): string {
  return type === 'adulto' ? 'adulto' : 'niño'
}

export function rsvpStatusLabel(status: EventGuestRsvpStatus): string {
  switch (status) {
    case 'confirmado':
      return 'Confirmado'
    case 'no_asiste':
      return 'No asiste'
    case 'no_seguro':
      return 'No seguro'
    default:
      return 'Pendiente'
  }
}

export function inviteScopeLabel(scope: EventGuestInviteScope | null): string {
  switch (scope) {
    case 'solo_ceremonia':
      return 'Solo ceremonia'
    case 'solo_celebracion':
      return 'Solo celebración'
    default:
      return 'Ceremonia + celebración'
  }
}

function pendingLineText(kind: 'pending_adult' | 'pending_child', count: number): string {
  if (kind === 'pending_adult') return `${count} ${count === 1 ? 'adulto pendiente' : 'adultos pendientes'} de identificar`
  return `${count} ${count === 1 ? 'niño pendiente' : 'niños pendientes'} de identificar`
}

// Líneas "N adultos/niños pendientes de identificar" para UNA fila —
// para pending_adult/pending_child es directo; para group_aggregate (un
// grupo entero sin ningún nombre) se deriva de sus propios recuentos
// declarados, sin necesitar una fila "pending" aparte.
function pendingLinesForRow(row: ExportGuestRow): string[] {
  if (row.kind === 'pending_adult') return [pendingLineText('pending_adult', row.count)]
  if (row.kind === 'pending_child') return [pendingLineText('pending_child', row.count)]
  if (row.kind === 'group_aggregate') {
    const lines: string[] = []
    if (row.groupDeclaredAdults > 0) lines.push(pendingLineText('pending_adult', row.groupDeclaredAdults))
    if (row.groupDeclaredChildren > 0) lines.push(pendingLineText('pending_child', row.groupDeclaredChildren))
    return lines
  }
  return []
}

// ---------------------------------------------------------------------
// Vista "Por mesas" — pensada para restaurante/organización/aforo.
// El aforo usa computeTableOccupancy TAL CUAL (nunca un recuento
// propio) para que nunca pueda desviarse del número que ya ve el
// organizador en pantalla.
// ---------------------------------------------------------------------
export interface MesasTableEntry {
  label: string
  personType: EventGuestMemberType | null
}
export interface MesasTableGroup {
  tableName: string
  capacity: number | null
  occupied: number
  overCapacity: boolean
  entries: MesasTableEntry[]
}
export interface MesasPendingGroup {
  groupName: string
  lines: string[]
}
export interface MesasView {
  tableGroups: MesasTableGroup[]
  pending: MesasPendingGroup[]
}

export function buildMesasView(model: GuestExportModel): MesasView {
  const seatableRows = model.rows.filter((r) => r.seatable)
  const tableGroups: MesasTableGroup[] = model.tables.map((t) => {
    const entries = seatableRows
      .filter((r) => r.tableId === t.id)
      .map((r) => ({
        label: r.kind === 'named' ? `${r.personName} — ${personTypeLabel(r.personType as EventGuestMemberType)}` : `${r.groupName} — ${r.count} personas`,
        personType: r.personType,
      }))
    const occupied = computeTableOccupancy(t, model.filteredGuests, model.filteredMembersByGuestId)
    return { tableName: t.name, capacity: t.capacity, occupied, overCapacity: t.capacity != null && occupied > t.capacity, entries }
  })

  const withoutTable = seatableRows.filter((r) => r.tableId == null)
  if (withoutTable.length > 0) {
    tableGroups.push({
      tableName: 'Sin mesa',
      capacity: null,
      occupied: withoutTable.reduce((sum, r) => sum + r.count, 0),
      overCapacity: false,
      entries: withoutTable.map((r) => ({
        label: r.kind === 'named' ? `${r.personName} — ${personTypeLabel(r.personType as EventGuestMemberType)}` : `${r.groupName} — ${r.count} personas`,
        personType: r.personType,
      })),
    })
  }

  const pendingByGroup = new Map<string, MesasPendingGroup>()
  for (const r of model.rows) {
    if (r.seatable) continue
    const lines = pendingLinesForRow(r)
    if (lines.length === 0) continue
    const existing = pendingByGroup.get(r.groupId)
    if (existing) existing.lines.push(...lines)
    else pendingByGroup.set(r.groupId, { groupName: r.groupName, lines: [...lines] })
  }

  return { tableGroups, pending: [...pendingByGroup.values()] }
}

// ---------------------------------------------------------------------
// Vista "Por familias" — conserva la unidad invitada, con sus personas
// identificadas, pendientes y estado de RSVP (declarado vs. confirmado,
// SIN intentar reconciliarlos nunca).
// ---------------------------------------------------------------------
export interface FamiliaNamedLine {
  text: string
}
export interface FamiliaGroupView {
  groupName: string
  declaredTotal: number
  confirmedTotal: number | null
  rsvpStatusLabel: string
  inviteScopeLabel: string | null
  namedLines: FamiliaNamedLine[]
  pendingLines: string[]
}
export interface FamiliasView {
  groups: FamiliaGroupView[]
}

export function buildFamiliasView(model: GuestExportModel, showInviteScope: boolean): FamiliasView {
  const order: string[] = []
  const byGroup = new Map<string, ExportGuestRow[]>()
  for (const r of model.rows) {
    if (!byGroup.has(r.groupId)) {
      byGroup.set(r.groupId, [])
      order.push(r.groupId)
    }
    byGroup.get(r.groupId)!.push(r)
  }

  const groups: FamiliaGroupView[] = order.map((groupId) => {
    const rows = byGroup.get(groupId)!
    const first = rows[0]
    const declaredTotal = first.groupDeclaredAdults + first.groupDeclaredChildren
    const confirmedTotal = first.groupConfirmedAdults != null && first.groupConfirmedChildren != null ? first.groupConfirmedAdults + first.groupConfirmedChildren : null
    const namedLines = rows
      .filter((r) => r.kind === 'named')
      .map((r) => ({
        text: `${r.personName} — ${personTypeLabel(r.personType as EventGuestMemberType)}${r.tableName ? ` — ${r.tableName}` : ''}`,
      }))
    const pendingLines = rows.flatMap((r) => (r.kind === 'named' ? [] : pendingLinesForRow(r)))
    return {
      groupName: first.groupName,
      declaredTotal,
      // "Si declarado y confirmado son iguales, evitar información
      // redundante" — solo se muestra Confirmados cuando aporta algo.
      confirmedTotal: confirmedTotal != null && confirmedTotal !== declaredTotal ? confirmedTotal : null,
      rsvpStatusLabel: rsvpStatusLabel(first.groupRsvpStatus),
      inviteScopeLabel: showInviteScope ? inviteScopeLabel(first.groupInviteScope) : null,
      namedLines,
      pendingLines,
    }
  })

  return { groups }
}

// ---------------------------------------------------------------------
// Vista "Alfabética" — solo las personas identificadas pueden ordenarse
// realmente por nombre; los pendientes de identificar se listan aparte,
// nunca intercalados a ciegas en el orden alfabético.
// ---------------------------------------------------------------------
export interface AlfabeticoEntry {
  text: string
}
export interface AlfabeticoPendingGroup {
  groupName: string
  lines: string[]
}
export interface AlfabeticoView {
  entries: AlfabeticoEntry[]
  pending: AlfabeticoPendingGroup[]
}

export function buildAlfabeticoView(model: GuestExportModel): AlfabeticoView {
  const named = model.rows.filter((r) => r.kind === 'named')
  const sorted = [...named].sort((a, b) => (a.personName ?? '').localeCompare(b.personName ?? '', 'es'))
  const entries = sorted.map((r) => ({
    text: `${r.personName} — ${personTypeLabel(r.personType as EventGuestMemberType)} · ${r.groupName}${r.tableName ? ` · ${r.tableName}` : ''}`,
  }))

  const pendingByGroup = new Map<string, AlfabeticoPendingGroup>()
  for (const r of model.rows) {
    if (r.kind === 'named') continue
    const lines = pendingLinesForRow(r)
    if (lines.length === 0) continue
    const existing = pendingByGroup.get(r.groupId)
    if (existing) existing.lines.push(...lines)
    else pendingByGroup.set(r.groupId, { groupName: r.groupName, lines: [...lines] })
  }

  return { entries, pending: [...pendingByGroup.values()] }
}
