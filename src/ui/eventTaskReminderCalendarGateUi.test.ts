import { describe, expect, it } from 'vitest'

// Bloque A — campana/Calendario/avisos. Auditado: calendar_event_reminders cuelga de un calendar_event,
// y calendar_event_id en event_tasks ES el estado de "Mostrar en Calendario" — no se crea ningún sistema
// paralelo de avisos; solo se mejora la UX de la campana reutilizando linkEventTaskToCalendar (ya
// idempotente: si la tarea ya está enlazada, no duplica nada).
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function fn(source: string, signature: string, endMarker = '\n  }'): string {
  const start = source.indexOf(signature)
  expect(start, `no se encontró "${signature}"`).toBeGreaterThan(-1)
  return source.slice(start, source.indexOf(endMarker, start) + endMarker.length)
}

describe('CASO 1 — tarea sin fecha: toast, nunca abre el selector ni Editar', () => {
  it('reminderGateFor devuelve "no_date" cuando la tarea no tiene fecha', () => {
    const body = fn(UI, 'function reminderGateFor(')
    expect(body).toContain("if (!t.dueDate) return 'no_date'")
  })
  it('ReminderBell, con gate "no_date", llama a onNoDateTap y no abre el menú', () => {
    const body = fn(UI, 'async function handleClick(')
    expect(body).toContain("if (gate === 'no_date') {")
    expect(body).toContain('onNoDateTap()')
    const noDateBranch = body.slice(body.indexOf("if (gate === 'no_date')"), body.indexOf("if (gate === 'not_in_calendar')"))
    expect(noDateBranch).not.toContain('setOpen')
    expect(noDateBranch).not.toContain('onEnableCalendar')
  })
  it('el toast dice exactamente lo pedido', () => {
    expect(UI).toContain("onNoDateTap: () => showToast('Añade una fecha a la tarea para poder configurar avisos.'),")
  })
})

describe('CASO 2 — tarea con fecha pero sin Calendario: confirmación, y al aceptar enlaza y abre el selector', () => {
  it('reminderGateFor devuelve "not_in_calendar" cuando hay fecha pero no calendarEventId', () => {
    const body = fn(UI, 'function reminderGateFor(')
    expect(body).toContain("if (!t.calendarEventId) return 'not_in_calendar'")
  })
  it('pide confirmación antes de añadir al Calendario', () => {
    const body = fn(UI, 'async function handleClick(')
    expect(body).toContain("window.confirm('Para añadir avisos, esta tarea debe estar en el Calendario. ¿Añadirla?')")
  })
  it('cancelar la confirmación no llama a onEnableCalendar (no modifica nada)', () => {
    const body = fn(UI, 'async function handleClick(')
    const notInCalendarBranch = body.slice(body.indexOf("if (gate === 'not_in_calendar')"))
    expect(notInCalendarBranch).toContain('if (!window.confirm(')
    expect(notInCalendarBranch.indexOf('return')).toBeLessThan(notInCalendarBranch.indexOf('onEnableCalendar()'))
  })
  it('aceptar enlaza al Calendario (reutilizando linkEventTaskToCalendar, idempotente) y abre el selector', () => {
    const body = fn(UI, 'async function enableCalendarForReminder(')
    expect(body).toContain('await linkEventTaskToCalendar(t.id)')
    expect(body).toContain('await reloadTasks()')
    const handleClickBody = fn(UI, 'async function handleClick(')
    expect(handleClickBody).toContain('const ok = await onEnableCalendar()')
    expect(handleClickBody).toContain('if (ok) setOpen(true)')
  })
  it('conserva fecha/hora/responsables: linkEventTaskToCalendar nunca los toca aquí (misma función ya validada, sin cambios)', () => {
    const body = fn(UI, 'async function enableCalendarForReminder(')
    expect(body).not.toMatch(/due_date|due_time|assigned_member_id|priority/i)
  })
  it('si falla, muestra error y no dice que se añadió (nunca estado fingido)', () => {
    const body = fn(UI, 'async function enableCalendarForReminder(')
    expect(body).toContain("setError(errorMessage(err, 'No se pudo añadir la tarea al Calendario'))")
    expect(body).toContain('return false')
  })
})

describe('CASO 3 — tarea ya en Calendario: comportamiento existente sin cambios', () => {
  it('gate "ok" abre/cierra el menú normalmente, igual que antes', () => {
    const body = fn(UI, 'async function handleClick(')
    expect(body).toContain('setOpen((v) => !v)')
  })
  it('varios recordatorios simultáneos y "Sin aviso" siguen intactos (mismo modelo validado en f7ca245)', () => {
    expect(UI).toContain('const selection = taskReminderSelectionFrom(reminders)')
    expect(UI).toContain('🔕 Sin aviso')
  })
})

describe('no se crea ningún sistema paralelo de recordatorios', () => {
  it('EventosScreen sigue sin ninguna llamada directa a calendar_event_reminders (todo vía replaceReminders/listEventReminders)', () => {
    expect(UI).not.toContain("from('calendar_event_reminders')")
  })
})
