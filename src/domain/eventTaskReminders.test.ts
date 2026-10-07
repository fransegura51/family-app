import { describe, expect, it } from 'vitest'
import { hasAnyReminder, remindersFromSelection, taskReminderSelectionFrom, toggledPresetReminders, type TaskReminderSelection } from '@/domain/eventTaskFilters'
import { reminderLabel, unitAndAmountFromMinutes } from '@/domain/reminders'

// BUG real (iPhone): "new row for relation calendar_event_reminders violates check constraint
// calendar_event_reminders_minutes_before_check" — causa real: "El mismo día" guardaba minutesBefore=0,
// y la constraint (migración 0021) exigía minutes_before > 0. Corregido en la migración 0211
// (minutes_before >= 0): 0 es un valor legítimo ("en el momento mismo"), nunca negativo ni inventado.
//
// Aprovechando el arreglo, Preparativos pasa de "como mucho un aviso" a varios avisos simultáneos por
// tarea, reutilizando la MISMA tabla (calendar_event_reminders ya admite varias filas por evento desde
// siempre — así ya funcionan los recordatorios de eventos reales de Calendario).

describe('BUG real: «El mismo día» (minutesBefore=0) ya se guarda sin violar la constraint', () => {
  it('0 es un valor válido para el preset same_day', () => {
    const sel: TaskReminderSelection = { presets: new Set(['same_day']), custom: null, extraCustom: [] }
    expect(remindersFromSelection(sel)).toEqual([{ minutesBefore: 0, anchor: 'start' }])
  })
  it('reminderLabel(0) dice "el mismo día", nunca "0 años"/"0 minutos"', () => {
    expect(reminderLabel(0, 'start')).toBe('el mismo día')
    expect(reminderLabel(0, 'end')).toBe('justo cuando termine')
  })
})

describe('«1 día antes» y «1 semana antes» se guardan correctamente', () => {
  it('1 día antes = 1440 minutos', () => {
    const sel: TaskReminderSelection = { presets: new Set(['1_day']), custom: null, extraCustom: [] }
    expect(remindersFromSelection(sel)).toEqual([{ minutesBefore: 1440, anchor: 'start' }])
  })
  it('1 semana antes = 10080 minutos', () => {
    const sel: TaskReminderSelection = { presets: new Set(['1_week']), custom: null, extraCustom: [] }
    expect(remindersFromSelection(sel)).toEqual([{ minutesBefore: 10080, anchor: 'start' }])
  })
})

describe('varios avisos simultáneos por tarea', () => {
  it('dos recordatorios a la vez (1 semana + 1 día)', () => {
    const sel: TaskReminderSelection = { presets: new Set(['1_week', '1_day']), custom: null, extraCustom: [] }
    const out = remindersFromSelection(sel)
    expect(out).toHaveLength(2)
    expect(out).toEqual(expect.arrayContaining([{ minutesBefore: 1440, anchor: 'start' }, { minutesBefore: 10080, anchor: 'start' }]))
  })
  it('tres recordatorios a la vez (1 semana + 1 día + el mismo día)', () => {
    const sel: TaskReminderSelection = { presets: new Set(['1_week', '1_day', 'same_day']), custom: null, extraCustom: [] }
    expect(remindersFromSelection(sel)).toHaveLength(3)
  })
  it('personalizado puede coexistir con los presets (1 semana + 1 día + 3 horas antes)', () => {
    const sel: TaskReminderSelection = { presets: new Set(['1_week', '1_day']), custom: { minutesBefore: 180 }, extraCustom: [] }
    const out = remindersFromSelection(sel)
    expect(out).toHaveLength(3)
    expect(out).toEqual(expect.arrayContaining([{ minutesBefore: 180, anchor: 'start' }]))
  })
  it('desactivar uno conserva los demás (toggledPresetReminders solo toca la clave indicada)', () => {
    const existing = [{ minutesBefore: 10080, anchor: 'start' as const }, { minutesBefore: 1440, anchor: 'start' as const }]
    const after = toggledPresetReminders(existing, '1_day') // lo quita
    expect(after).toEqual([{ minutesBefore: 10080, anchor: 'start' }])
  })
  it('activar uno nuevo conserva los que ya había', () => {
    const existing = [{ minutesBefore: 10080, anchor: 'start' as const }]
    const after = toggledPresetReminders(existing, '1_day') // lo añade
    expect(after).toHaveLength(2)
    expect(after).toEqual(expect.arrayContaining([{ minutesBefore: 10080, anchor: 'start' }, { minutesBefore: 1440, anchor: 'start' }]))
  })
  it('activar/desactivar un preset nunca toca un personalizado ya activo', () => {
    const existing = [{ minutesBefore: 180, anchor: 'start' as const }]
    const after = toggledPresetReminders(existing, '1_week')
    expect(after).toEqual(expect.arrayContaining([{ minutesBefore: 180, anchor: 'start' }, { minutesBefore: 10080, anchor: 'start' }]))
  })
  it('«Sin aviso» (array vacío) no deja ningún recordatorio activo', () => {
    expect(hasAnyReminder([])).toBe(false)
  })
})

describe('no se crean duplicados', () => {
  it('el mismo preset no se puede añadir dos veces (Set)', () => {
    const sel: TaskReminderSelection = { presets: new Set(['1_day', '1_day' as never]), custom: null, extraCustom: [] }
    expect(remindersFromSelection(sel).filter((r) => r.minutesBefore === 1440)).toHaveLength(1)
  })
  it('alternar un preset activo dos veces seguidas lo deja igual que al principio (quita y vuelve a poner)', () => {
    const existing = [{ minutesBefore: 1440, anchor: 'start' as const }]
    const once = toggledPresetReminders(existing, '1_day')
    const twice = toggledPresetReminders(once, '1_day')
    expect(twice).toEqual(existing)
  })
})

describe('personalizado: válido e inválido', () => {
  it('un valor personalizado válido (3 horas = 180 min) se representa y se reconstruye igual', () => {
    const sel = taskReminderSelectionFrom([{ minutesBefore: 180 }])
    expect(sel.custom).toEqual({ minutesBefore: 180 })
    const { amount, unit } = unitAndAmountFromMinutes(180)
    expect(amount).toBe(3)
    expect(unit).toBe('horas')
  })
  it('0 nunca se interpreta como "personalizado": es siempre el preset same_day', () => {
    const sel = taskReminderSelectionFrom([{ minutesBefore: 0 }])
    expect(sel.presets.has('same_day')).toBe(true)
    expect(sel.custom).toBeNull()
  })
  it('un valor que no coincide con ningún preset se reconoce como personalizado', () => {
    const sel = taskReminderSelectionFrom([{ minutesBefore: 2880 }])
    expect(sel.custom).toEqual({ minutesBefore: 2880 })
    expect(sel.presets.size).toBe(0)
  })
})

describe('compatibilidad con recordatorios existentes', () => {
  it('una tarea con exactamente «1 semana antes» guardada sigue mostrando «1 semana antes» activo y nada más', () => {
    const sel = taskReminderSelectionFrom([{ minutesBefore: 10080 }])
    expect(sel.presets).toEqual(new Set(['1_week']))
    expect(sel.custom).toBeNull()
    // Releer y volver a escribir sin tocar nada debe devolver EXACTAMENTE lo mismo (no se duplica ni se pierde).
    expect(remindersFromSelection(sel)).toEqual([{ minutesBefore: 10080, anchor: 'start' }])
  })
  it('un personalizado antiguo adicional que no coincide con ningún preset nunca se pierde al guardar otros cambios', () => {
    const sel = taskReminderSelectionFrom([{ minutesBefore: 1440 }, { minutesBefore: 20 }, { minutesBefore: 50 }])
    // El primer "extra" (20) se trata como el personalizado editable; el resto (50) se conserva aparte.
    expect(sel.custom).toEqual({ minutesBefore: 20 })
    expect(sel.extraCustom).toEqual([{ minutesBefore: 50 }])
    const rebuilt = remindersFromSelection(sel)
    expect(rebuilt).toEqual(expect.arrayContaining([{ minutesBefore: 1440, anchor: 'start' }, { minutesBefore: 20, anchor: 'start' }, { minutesBefore: 50, anchor: 'start' }]))
  })
})

describe('campana: 🔕/🔔, nunca cuenta cuántos', () => {
  it('ningún aviso → sin campana activa', () => {
    expect(hasAnyReminder([])).toBe(false)
  })
  it('un aviso → campana activa', () => {
    expect(hasAnyReminder([{ minutesBefore: 1440 }])).toBe(true)
  })
  it('varios avisos → campana activa igual (no una campana por aviso)', () => {
    expect(hasAnyReminder([{ minutesBefore: 1440 }, { minutesBefore: 10080 }, { minutesBefore: 0 }])).toBe(true)
  })
})
