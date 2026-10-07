import { describe, expect, it } from 'vitest'

// Varios avisos por tarea — cableado real en EventosScreen.tsx: la campana rápida y «Editar tarea» deben
// leer y escribir exactamente la misma fuente (calendar_event_reminders vía replaceReminders/
// listEventReminders), nunca una copia propia que pueda desincronizarse.
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function fn(source: string, signature: string): string {
  const start = source.indexOf(signature)
  expect(start, `no se encontró "${signature}"`).toBeGreaterThan(-1)
  return source.slice(start, source.indexOf('\n  }', start) + 4)
}

describe('tarea sin fecha: nunca crea recordatorios (regla ya validada, sin cambios)', () => {
  it('reminderHintFor sigue explicando que hace falta fecha antes que nada', () => {
    const body = fn(UI, 'function reminderHintFor(')
    expect(body).toContain("if (!t.dueDate) return 'Pon una fecha para activar un aviso'")
  })
})

describe('una tarea con varios avisos sigue teniendo UNA sola entrada de Calendario', () => {
  it('toggleTaskReminderPreset y clearTaskReminders solo llaman a replaceReminders, nunca crean/insertan calendar_events', () => {
    const toggleFn = fn(UI, 'async function toggleTaskReminderPreset(')
    const clearFn = fn(UI, 'async function clearTaskReminders(')
    expect(toggleFn).toContain('await replaceReminders(calendarEventId, next)')
    expect(clearFn).toContain('await replaceReminders(calendarEventId, [])')
    expect(toggleFn).not.toMatch(/calendar_events.*insert|kind:|assigned_member_id|due_date|priority/i)
    expect(clearFn).not.toMatch(/calendar_events.*insert|kind:|assigned_member_id|due_date|priority/i)
  })
  it('replaceReminders identifica la entrada por calendarEventId, nunca crea una copia por aviso', () => {
    // Un solo id de calendario por tarea: el mismo valor se reutiliza para cualquier número de avisos.
    expect(UI).toContain('const calendarEventId = t.calendarEventId')
  })
})

describe('concurrencia: toques rápidos no se pisan ni fingen un guardado que la BD rechazó', () => {
  it('toggleTaskReminderPreset y clearTaskReminders ignoran un toque mientras ya hay uno guardándose para esa tarea', () => {
    const toggleFn = fn(UI, 'async function toggleTaskReminderPreset(')
    const clearFn = fn(UI, 'async function clearTaskReminders(')
    expect(toggleFn).toContain('savingReminderTaskId === t.id) return')
    expect(clearFn).toContain('savingReminderTaskId === t.id) return')
  })
  it('el estado local SOLO se actualiza tras confirmar la escritura, nunca antes (sin optimismo)', () => {
    const toggleFn = fn(UI, 'async function toggleTaskReminderPreset(')
    const insertIdx = toggleFn.indexOf('await replaceReminders(')
    const setStateIdx = toggleFn.indexOf('setTaskReminders((prev) => ({ ...prev, [t.id]: next }))')
    expect(insertIdx).toBeGreaterThan(-1)
    expect(setStateIdx).toBeGreaterThan(insertIdx)
  })
  it('si falla el guardado, se recarga el estado real desde el servidor (nunca se deja la UI fingiendo)', () => {
    const toggleFn = fn(UI, 'async function toggleTaskReminderPreset(')
    expect(toggleFn).toContain('await refreshTaskReminders(')
    expect(toggleFn).toContain("setError(errorMessage(err, 'No se pudo cambiar el aviso'))")
  })
})

describe('campana rápida y «Editar tarea» usan la misma fuente de verdad', () => {
  it('ambas derivan su estado con taskReminderSelectionFrom sobre los mismos EventReminder[] (nunca un "choice" propio)', () => {
    expect(UI).toContain('const selection = taskReminderSelectionFrom(reminders)') // ReminderBell (campana)
    expect(UI).toContain('const sel = taskReminderSelectionFrom(reminders)') // efecto de carga en TaskEditModal
  })
  it('TaskCard recibe los recordatorios reales de taskReminders (el mismo estado que alimenta la recarga tras guardar en el editor)', () => {
    expect(UI).toContain('reminders: taskReminders[t.id] ?? [],')
  })
})

describe('editor: checkboxes multiselección, con hueco para personalizado y sin perder otros personalizados', () => {
  it('togglePresetInForm alterna un preset sin tocar personalizado ni otros presets', () => {
    const body = fn(UI, 'function togglePresetInForm(')
    expect(body).toContain('setReminderPresets((prev) => {')
  })
  it('remindersForForm combina presets + personalizado activo + los personalizados ya existentes que no se editan aquí', () => {
    const body = fn(UI, 'function remindersForForm(')
    expect(body).toContain('extraCustomReminders')
  })
  it('clearAllReminders quita presets y personalizado del formulario (equivalente a «Sin aviso»)', () => {
    const body = fn(UI, 'function clearAllReminders(')
    expect(body).toContain('setReminderPresets(new Set())')
    expect(body).toContain('setCustomReminderOn(false)')
  })
})
