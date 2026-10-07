import { describe, expect, it } from 'vitest'
import { hasAnyReminder, remindersFromSelection, taskReminderSelectionFrom, toggledPresetReminders, type TaskReminderSelection } from '@/domain/eventTaskFilters'

// Bloque F de la tanda "+ Nueva tarea / Colaboradores": confirma que nada de esta tanda (eliminar el alta
// rápida, el nuevo formulario de creación, el filtro AND, "👥 Colaboradores") introdujo una regresión en
// el modelo de varios avisos validado en f7ca245.

describe('«El mismo día» = 0 sigue siendo un valor válido', () => {
  it('se representa y se reconstruye igual, sin convertirse en "personalizado"', () => {
    const sel = taskReminderSelectionFrom([{ minutesBefore: 0 }])
    expect(sel.presets.has('same_day')).toBe(true)
    expect(sel.custom).toBeNull()
    expect(remindersFromSelection(sel)).toEqual([{ minutesBefore: 0, anchor: 'start' }])
  })
})

describe('varios presets simultáneos siguen funcionando', () => {
  it('1 semana + 1 día + el mismo día, los tres a la vez', () => {
    const sel: TaskReminderSelection = { presets: new Set(['1_week', '1_day', 'same_day']), custom: null, extraCustom: [] }
    expect(remindersFromSelection(sel)).toHaveLength(3)
  })
})

describe('personalizado sigue coexistiendo con los presets', () => {
  it('1 semana + 1 día + personalizado (3 horas)', () => {
    const sel: TaskReminderSelection = { presets: new Set(['1_week', '1_day']), custom: { minutesBefore: 180 }, extraCustom: [] }
    const out = remindersFromSelection(sel)
    expect(out).toHaveLength(3)
    expect(out).toEqual(expect.arrayContaining([{ minutesBefore: 180, anchor: 'start' }]))
  })
})

describe('desactivar uno conserva los demás (misma garantía de antes)', () => {
  it('quitar 1 día de un conjunto de tres deja los otros dos intactos', () => {
    const existing = [{ minutesBefore: 10080, anchor: 'start' as const }, { minutesBefore: 1440, anchor: 'start' as const }, { minutesBefore: 0, anchor: 'start' as const }]
    const after = toggledPresetReminders(existing, '1_day')
    expect(after).toEqual(expect.arrayContaining([{ minutesBefore: 10080, anchor: 'start' }, { minutesBefore: 0, anchor: 'start' }]))
    expect(after).toHaveLength(2)
  })
})

describe('campana: 🔕/🔔 sigue sin cambios', () => {
  it('ningún aviso → inactiva; cualquier número de avisos → activa', () => {
    expect(hasAnyReminder([])).toBe(false)
    expect(hasAnyReminder([{ minutesBefore: 1440 }])).toBe(true)
    expect(hasAnyReminder([{ minutesBefore: 1440 }, { minutesBefore: 10080 }])).toBe(true)
  })
})

const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

describe('campana rápida y Editar tarea siguen leyendo/escribiendo la misma fuente tras esta tanda', () => {
  it('ambas usan taskReminderSelectionFrom sobre el mismo almacén (calendar_event_reminders vía listEventReminders/replaceReminders)', () => {
    expect(UI).toContain('const selection = taskReminderSelectionFrom(reminders)') // ReminderBell
    expect(UI).toContain('const sel = taskReminderSelectionFrom(reminders)') // efecto de carga en TaskEditModal (editar Y crear)
  })
  it('el modal de creación también carga sus recordatorios con el mismo efecto (solo si ya hay calendarEventId, nunca inventado)', () => {
    expect(UI).toContain('if (!task?.calendarEventId) return')
  })
})
