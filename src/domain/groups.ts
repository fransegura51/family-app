// Gestión de grupos — dominio puro: organización en carpetas (máximo dos niveles), búsqueda y fichas de participantes.
// Las carpetas son de cada persona (organización, no permisos); un grupo sin colocar está suelto en la pantalla principal.

export interface GroupItem {
  id: string
  familyId: string
  name: string
  periodLabel: string | null
  createdBy: string
  archivedAt: string | null
  copiedFrom: { group?: string; responsible?: string; copiedAt?: string; mode?: string; contacts?: boolean } | null
  createdAt: string
  /** Carpeta donde LA PERSONA que mira colocó el grupo (null = suelto). */
  folderId: string | null
  /** Cómo se muestran los participantes en listas y mensajes de este grupo, y cómo se ordenan (0354). */
  nameFormat: 'first' | 'first_unique' | 'full' | 'surname_first'
  sortBy: 'name' | 'surname'
  /** Configuraciones guardadas de «Compartir lista de contactos» (sin datos personales). */
  contactSharePresets: unknown[]
}

export interface GroupFolder {
  id: string
  name: string
  sortOrder: number
}

export interface Participant {
  id: string
  groupId: string
  name: string
  surname: string | null
  guardianName: string | null
  phone: string | null
  email: string | null
  payerAlias: string | null
  notes: string | null
  leftAt: string | null
  createdAt: string
  /** Identidad compartida con las fichas de este mismo niño/a en otros grupos (0354); null = ficha propia. */
  personId?: string | null
}

export interface GroupHome {
  folders: { folder: GroupFolder; groups: GroupItem[] }[]
  loose: GroupItem[]
  archived: GroupItem[]
}

const MARKS = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g')

/** Texto comparable: sin acentos, minúsculas y espacios simples. */
export function foldText(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(MARKS, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export function groupTitle(g: Pick<GroupItem, 'name' | 'periodLabel'>): string {
  return g.periodLabel ? `${g.name} — ${g.periodLabel}` : g.name
}

/**
 * Pantalla principal: carpetas (cerradas por defecto), grupos sueltos y archivados. Con búsqueda solo salen los grupos que coinciden (y las carpetas que los contienen).
 * Los archivados no aparecen mezclados: tienen su propio acceso.
 */
export function organizeGroups(groups: GroupItem[], folders: GroupFolder[], query = ''): GroupHome {
  const q = foldText(query)
  const matches = (g: GroupItem) => !q || foldText(groupTitle(g)).includes(q)
  const active = groups.filter((g) => !g.archivedAt && matches(g))
  const archived = groups.filter((g) => g.archivedAt && matches(g)).sort((a, b) => (b.archivedAt ?? '').localeCompare(a.archivedAt ?? ''))
  const byName = (a: GroupItem, b: GroupItem) => a.name.localeCompare(b.name, 'es')
  const known = new Set(folders.map((f) => f.id))
  const out: GroupHome = { folders: [], loose: [], archived }
  for (const f of [...folders].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es'))) {
    const inside = active.filter((g) => g.folderId === f.id).sort(byName)
    if (q && inside.length === 0) continue
    out.folders.push({ folder: f, groups: inside })
  }
  out.loose = active.filter((g) => !g.folderId || !known.has(g.folderId)).sort(byName)
  return out
}

/** Nombre con el que se muestra a un participante en listas y mensajes: el identificativo, con apellidos si los hay. */
export function participantName(p: Pick<Participant, 'name' | 'surname'>): string {
  return [p.name, p.surname].filter((x) => x && x.trim()).join(' ').trim()
}

export function sortParticipants(list: Participant[]): Participant[] {
  return [...list].sort((a, b) => participantName(a).localeCompare(participantName(b), 'es'))
}

export function filterParticipants(list: Participant[], query: string): Participant[] {
  const q = foldText(query)
  if (!q) return list
  return list.filter((p) => foldText([p.name, p.surname, p.guardianName, p.phone, p.email].filter(Boolean).join(' ')).includes(q))
}

export function activeParticipants(list: Participant[]): Participant[] {
  return list.filter((p) => !p.leftAt)
}

/** Nombre de una carpeta válido: sin espacios sobrantes, 1–80 caracteres. */
export function cleanFolderName(raw: string): string | null {
  const n = raw.replace(/\s+/g, ' ').trim()
  return n.length >= 1 && n.length <= 80 ? n : null
}

/** Etiqueta de un curso: «2026/27» a partir del año en que empieza (septiembre en adelante). */
export function schoolYearLabel(d: Date = new Date()): string {
  const y = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1
  return `${y}/${String((y + 1) % 100).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------------------------- invitados de un evento que vienen de un grupo
export interface GuestOrigin {
  guestId: string
  displayName: string
  participantId: string
}

export interface GuestDiff {
  /** Participantes activos de los grupos que aún no son invitados del evento. */
  toAdd: Participant[]
  /** Invitados cuyo nombre en el grupo ya no coincide con el del evento. */
  toRename: { guestId: string; from: string; to: string }[]
  /** Invitados cuyo participante se dio de baja (o ya no existe en esos grupos). */
  toRemove: { guestId: string; name: string }[]
}

/**
 * Qué cambió en los grupos desde que se importaron los invitados. Solo calcula: aplicar los cambios es una acción manual que la persona revisa (no se tocan
 * invitaciones ya enviadas por sorpresa).
 */
export function diffGroupGuests(guests: GuestOrigin[], participants: Participant[]): GuestDiff {
  const byId = new Map(participants.map((p) => [p.id, p]))
  const known = new Set(guests.map((g) => g.participantId))
  const diff: GuestDiff = { toAdd: [], toRename: [], toRemove: [] }
  for (const p of participants) if (!p.leftAt && !known.has(p.id)) diff.toAdd.push(p)
  for (const g of guests) {
    const p = byId.get(g.participantId)
    if (!p || p.leftAt) diff.toRemove.push({ guestId: g.guestId, name: g.displayName })
    else if (participantName(p) !== g.displayName) diff.toRename.push({ guestId: g.guestId, from: g.displayName, to: participantName(p) })
  }
  return diff
}
