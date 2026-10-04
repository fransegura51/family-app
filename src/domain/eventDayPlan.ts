// Plan del día — reglas puras (orden, coincidencias de hora, borrador de edición). Sin Supabase ni React.
//
// Dos zonas, una regla clara:
//  · CON HORA  → cronológico automático (hora ASC); sort_order solo DESEMPATA elementos a la misma hora.
//  · SIN HORA  → orden manual (sort_order ASC). Al ponerles hora saltan solos a su sitio cronológico; al
//                quitársela vuelven a «Sin hora».
// Nunca se inventa una hora: sin hora = null (jamás 00:00).
import type { EventDayPlanItem } from '@/domain/types'

// ---------------------------------------------------------------------
// Identidad estable de los elementos generados por el configurador
// ---------------------------------------------------------------------
export const FOOD_MOMENT_SOURCE_PREFIX = 'comida.momentos:'

export function foodMomentSourceKey(momentKey: string): string {
  return `${FOOD_MOMENT_SOURCE_PREFIX}${momentKey}`
}

export function foodMomentKeyFromSource(sourceKey: string | null): string | null {
  if (!sourceKey || !sourceKey.startsWith(FOOD_MOMENT_SOURCE_PREFIX)) return null
  const key = sourceKey.slice(FOOD_MOMENT_SOURCE_PREFIX.length)
  return key || null
}

// Generado Y todavía bajo el control de su decisión (el × y la edición lo saben).
export function isLinkedGenerated(item: Pick<EventDayPlanItem, 'decisionId' | 'sourceKey'>): boolean {
  return item.decisionId !== null && item.sourceKey !== null
}

// ---------------------------------------------------------------------
// Hora
// ---------------------------------------------------------------------
// 'HH:MM:SS' (Postgres) o 'HH:MM' (input time) → 'HH:MM'; vacío → null.
export function timeKey(time: string | null | undefined): string | null {
  if (!time) return null
  const trimmed = time.trim()
  return trimmed ? trimmed.slice(0, 5) : null
}

// ---------------------------------------------------------------------
// Orden
// ---------------------------------------------------------------------
function byCreation(a: EventDayPlanItem, b: EventDayPlanItem): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

function bySortOrder(a: EventDayPlanItem, b: EventDayPlanItem): number {
  return a.sortOrder - b.sortOrder || byCreation(a, b)
}

export function compareTimed(a: EventDayPlanItem, b: EventDayPlanItem): number {
  const ta = timeKey(a.itemTime) ?? ''
  const tb = timeKey(b.itemTime) ?? ''
  if (ta !== tb) return ta < tb ? -1 : 1
  return bySortOrder(a, b)
}

export interface DayPlanView {
  timed: EventDayPlanItem[]
  untimed: EventDayPlanItem[]
}

export function splitDayPlan(items: EventDayPlanItem[]): DayPlanView {
  const timed = items.filter((i) => timeKey(i.itemTime) !== null).sort(compareTimed)
  const untimed = items.filter((i) => timeKey(i.itemTime) === null).sort(bySortOrder)
  return { timed, untimed }
}

// Orden de lectura de todo el plan (con hora y, después, sin hora): lo que ven el banner «Siguiente» y la tarjeta.
export function orderedDayPlan(items: EventDayPlanItem[]): EventDayPlanItem[] {
  const { timed, untimed } = splitDayPlan(items)
  return [...timed, ...untimed]
}

// ---------------------------------------------------------------------
// Coincidencias de hora
// ---------------------------------------------------------------------
export interface TimeGroup {
  time: string // 'HH:MM'
  items: EventDayPlanItem[] // ya en el orden de desempate vigente
  // true = todos los miembros llevan la confirmación «coinciden» PARA ESTA hora.
  confirmed: boolean
}

export function timeGroups(timed: EventDayPlanItem[]): TimeGroup[] {
  const groups = new Map<string, EventDayPlanItem[]>()
  for (const item of timed) {
    const key = timeKey(item.itemTime)
    if (!key) continue
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return [...groups.entries()]
    .filter(([, members]) => members.length >= 2)
    .map(([time, members]) => ({
      time,
      items: [...members].sort(bySortOrder),
      confirmed: members.every((m) => timeKey(m.coincideOkTime) === time),
    }))
}

// El grupo (≥2) en el que está un elemento a su hora actual, o null.
export function groupOfItem(items: EventDayPlanItem[], itemId: string): TimeGroup | null {
  const { timed } = splitDayPlan(items)
  const item = timed.find((i) => i.id === itemId)
  const key = item ? timeKey(item.itemTime) : null
  if (!key) return null
  return timeGroups(timed).find((g) => g.time === key) ?? null
}

// Coincidencia que HAY QUE PREGUNTAR tras guardar la hora de un elemento: su grupo existe y aún no está confirmado.
export function pendingCoincidenceFor(items: EventDayPlanItem[], itemId: string): TimeGroup | null {
  const group = groupOfItem(items, itemId)
  return group && !group.confirmed ? group : null
}

export function allPendingCoincidences(items: EventDayPlanItem[]): TimeGroup[] {
  return timeGroups(splitDayPlan(items).timed).filter((g) => !g.confirmed)
}

const COUNT_WORDS: Record<number, string> = { 2: 'dos' }

export function coincidenceHeadline(group: Pick<TimeGroup, 'time' | 'items'>): string {
  const n = group.items.length
  return `Hay ${COUNT_WORDS[n] ?? n} momentos a las ${group.time}`
}

// ---------------------------------------------------------------------
// Reordenar (arrastrando o con Subir/Bajar): siempre produce la lista de ids en el nuevo orden
// ---------------------------------------------------------------------
export function moveId(ids: string[], id: string, delta: -1 | 1): string[] {
  const from = ids.indexOf(id)
  const to = from + delta
  if (from === -1 || to < 0 || to >= ids.length) return ids
  return moveToIndex(ids, from, to)
}

export function moveToIndex(ids: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return ids
  const next = [...ids]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

// ---------------------------------------------------------------------
// Borrador del formulario «Editar momento» / «Añadir momento»
// ---------------------------------------------------------------------
export interface DayPlanDraft {
  title: string
  time: string // 'HH:MM' o ''
  note: string
  showOnShare: boolean
}

export const EMPTY_DAY_PLAN_DRAFT: DayPlanDraft = { title: '', time: '', note: '', showOnShare: true }
export const MISSING_TITLE_MESSAGE = 'Ponle un nombre al momento.'

export function draftFromItem(item: Pick<EventDayPlanItem, 'title' | 'itemTime' | 'note' | 'showOnShare'>): DayPlanDraft {
  return { title: item.title, time: timeKey(item.itemTime) ?? '', note: item.note ?? '', showOnShare: item.showOnShare }
}

export function validateDayPlanDraft(draft: Pick<DayPlanDraft, 'title'>): string | null {
  return draft.title.trim() ? null : MISSING_TITLE_MESSAGE
}

export interface DayPlanPatch {
  title?: string
  itemTime?: string | null
  note?: string | null
  showOnShare?: boolean
}

// Solo lo que ha cambiado. La hora solo entra si cambió (cambiar la hora invalida la confirmación de
// coincidencia; editar la nota no debe hacerlo). Hora vacía = null: nunca 00:00.
export function draftToPatch(draft: DayPlanDraft, original: Pick<EventDayPlanItem, 'title' | 'itemTime' | 'note' | 'showOnShare'>): DayPlanPatch {
  const patch: DayPlanPatch = {}
  const title = draft.title.trim()
  if (title !== original.title) patch.title = title
  if ((timeKey(draft.time) ?? null) !== timeKey(original.itemTime)) patch.itemTime = timeKey(draft.time)
  const note = draft.note.trim() || null
  if (note !== (original.note?.trim() || null)) patch.note = note
  if (draft.showOnShare !== original.showOnShare) patch.showOnShare = draft.showOnShare
  return patch
}

export function isPatchEmpty(patch: DayPlanPatch): boolean {
  return Object.keys(patch).length === 0
}

// Posición a la que llega una fila arrastrada: desplazamiento vertical del dedo / alto de fila, dentro de la lista.
export function dragTargetIndex(startIndex: number, dy: number, itemHeight: number, length: number): number {
  const shift = Math.round(dy / itemHeight)
  return Math.min(length - 1, Math.max(0, startIndex + shift))
}
