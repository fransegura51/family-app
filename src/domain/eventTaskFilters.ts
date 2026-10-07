// Preparativos: filtro de la LISTA por responsable y correspondencia entre la campana y los cinco recordatorios.
// Solo presentación: no cambia datos, prioridades ni la recomendación global del evento.
import type { EventReminder } from '@/domain/reminders'

// Claves del filtro: 'none' (sin responsables activos), 'm:<memberId>' (familiar), 'h:<helperId>' (persona externa).
export const NO_RESPONSIBLE_KEY = 'none'

export interface ResponsibleTaskLike {
  assignedMemberId: string | null
  responsibleMemberIds?: string[]
  helpers?: { helperId: string | null }[]
}

// Una tarea aparece SOLO si tiene asignados A TODOS los responsables elegidos (intersección, no unión) —
// petición real: "Jennifer + Paco" debe mostrar solo tareas con los dos, nunca con cualquiera de los dos.
// Sin claves = sin filtro. Las referencias históricas (helperId null) no cuentan como responsables activos.
// Mismo criterio para familiares y externos: cada clave, sea 'm:' o 'h:', es una condición más que TODAS
// las claves elegidas deben cumplir a la vez.
export function taskMatchesResponsibleFilter(task: ResponsibleTaskLike, selected: string[]): boolean {
  if (selected.length === 0) return true
  const memberIds = task.responsibleMemberIds && task.responsibleMemberIds.length > 0 ? task.responsibleMemberIds : task.assignedMemberId ? [task.assignedMemberId] : []
  const helperIds = (task.helpers ?? []).flatMap((h) => (h.helperId ? [h.helperId] : []))
  const hasNone = memberIds.length === 0 && helperIds.length === 0
  return selected.every((key) => {
    if (key === NO_RESPONSIBLE_KEY) return hasNone
    if (key.startsWith('m:')) return memberIds.includes(key.slice(2))
    if (key.startsWith('h:')) return helperIds.includes(key.slice(2))
    return false
  })
}

// "Sin asignar" y una persona concreta son mutuamente excluyentes (una tarea no puede estar a la vez sin
// responsable y asignada a alguien) — al elegir uno se descarta el otro, en vez de permitir una
// combinación que nunca podría coincidir con ninguna tarea real.
export function toggleResponsibleFilterKey(selected: string[], key: string): string[] {
  if (selected.includes(key)) return selected.filter((k) => k !== key)
  if (key === NO_RESPONSIBLE_KEY) return [NO_RESPONSIBLE_KEY]
  return [...selected.filter((k) => k !== NO_RESPONSIBLE_KEY), key]
}

// Varios avisos por tarea (antes "como mucho uno" en Preparativos; el esquema real — calendar_event_reminders,
// migración 0021 — ya admite varios por evento desde siempre, como ya usan los eventos de Calendario de
// verdad: aquí solo se generaliza la UI de tareas para usar la misma arquitectura, sin tocar el esquema
// más allá de la constraint de minutes_before, ver migración 0211).
//
// «Sin aviso» no es un estado que se pueda tener activo a la vez que otros — es la ACCIÓN de quitarlos
// todos (igual que antes), así que no aparece aquí como clave seleccionable.
export type ReminderPresetKey = 'same_day' | '1_day' | '1_week'
export const REMINDER_PRESET_MINUTES: Record<ReminderPresetKey, number> = { same_day: 0, '1_day': 1440, '1_week': 10080 }
const REMINDER_PRESET_KEYS = Object.keys(REMINDER_PRESET_MINUTES) as ReminderPresetKey[]

// Único hueco "Personalizado": como antes, un valor a la vez (el ejemplo pedido — «1 semana + 1 día +
// Personalizado: 3 horas» — solo necesita uno). Si por lo que sea hay guardados varios avisos que no
// coinciden con ningún preset (nunca debería pasar hoy, pero por si acaso), se conservan TODOS al
// escribir de nuevo — remindersFromSelection nunca los pierde, solo el primero se ve/edita como "el" campo
// personalizado del editor.
export interface TaskReminderSelection {
  presets: Set<ReminderPresetKey>
  custom: { minutesBefore: number } | null
  extraCustom: { minutesBefore: number }[]
}

function presetKeyForMinutes(minutesBefore: number): ReminderPresetKey | null {
  return REMINDER_PRESET_KEYS.find((k) => REMINDER_PRESET_MINUTES[k] === minutesBefore) ?? null
}

// Lee los avisos reales guardados (sin importar el orden) y los traduce al estado de la interfaz.
export function taskReminderSelectionFrom(reminders: Pick<EventReminder, 'minutesBefore'>[]): TaskReminderSelection {
  const presets = new Set<ReminderPresetKey>()
  const customs: { minutesBefore: number }[] = []
  for (const r of reminders) {
    const key = presetKeyForMinutes(r.minutesBefore)
    if (key) presets.add(key)
    else customs.push({ minutesBefore: r.minutesBefore })
  }
  return { presets, custom: customs[0] ?? null, extraCustom: customs.slice(1) }
}

// Avisos a guardar para un estado de selección — nunca pierde un "extraCustom" que ya existiera.
export function remindersFromSelection(sel: TaskReminderSelection): EventReminder[] {
  const out: EventReminder[] = []
  for (const key of sel.presets) out.push({ minutesBefore: REMINDER_PRESET_MINUTES[key], anchor: 'start' })
  if (sel.custom) out.push({ minutesBefore: sel.custom.minutesBefore, anchor: 'start' })
  for (const c of sel.extraCustom) out.push({ minutesBefore: c.minutesBefore, anchor: 'start' })
  return out
}

// Alterna UN preset estándar dentro de los avisos ya guardados — nunca toca el resto (presets ni personalizado).
export function toggledPresetReminders(reminders: Pick<EventReminder, 'minutesBefore'>[], key: ReminderPresetKey): EventReminder[] {
  const sel = taskReminderSelectionFrom(reminders)
  if (sel.presets.has(key)) sel.presets.delete(key)
  else sel.presets.add(key)
  return remindersFromSelection(sel)
}

// true si existe algún aviso activo (uno o varios) — la campana solo distingue 🔔/🔕, nunca cuenta cuántos.
export function hasAnyReminder(reminders: Pick<EventReminder, 'minutesBefore'>[]): boolean {
  return reminders.length > 0
}
