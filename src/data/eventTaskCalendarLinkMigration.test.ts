import { describe, expect, it } from 'vitest'

// Eventos Fase 9 — Tarea → Calendario (0163). Mismo patrón ya
// certificado que events.rsvp_deadline_calendar_event_id: enlace
// ESTABLE por id, nunca se resuelve buscando por título; la propia
// presencia del id es el estado de "Mostrar en Calendario". Nullable,
// backward-compatible: las tareas existentes no se enlazan solas.
const FILES = import.meta.glob(['/supabase/migrations/0163_event_task_calendar_link.sql', '/supabase/rollbacks/0163_event_task_calendar_link_down.sql'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
const MIGRATION = FILES['/supabase/migrations/0163_event_task_calendar_link.sql']
const ROLLBACK = FILES['/supabase/rollbacks/0163_event_task_calendar_link_down.sql']

describe('0163 — event_tasks.calendar_event_id', () => {
  it('es nullable y referencia calendar_events con on delete set null', () => {
    expect(MIGRATION).toContain('add column calendar_event_id uuid references calendar_events(id) on delete set null')
    expect(MIGRATION).not.toMatch(/not null/i)
    expect(MIGRATION).not.toMatch(/on delete cascade/i)
  })

  it('nunca hace backfill ni infiere enlaces existentes', () => {
    expect(MIGRATION).not.toMatch(/^\s*update\s+event_tasks/im)
    expect(MIGRATION).not.toMatch(/^\s*insert\s+into\s+calendar_events/im)
  })

  it('tiene índice', () => {
    expect(MIGRATION).toContain('create index if not exists event_tasks_calendar_event_id_idx on event_tasks(calendar_event_id)')
  })

  it('el rollback quita exactamente la columna y su índice', () => {
    expect(ROLLBACK).toContain('alter table event_tasks drop column if exists calendar_event_id')
    expect(ROLLBACK).toContain('drop index if exists event_tasks_calendar_event_id_idx')
    expect(ROLLBACK).not.toMatch(/\bdrop table\b/i)
  })
})

const APP = import.meta.glob('/src/data/events.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const SRC = APP['/src/data/events.ts']

function fnBody(name: string, nextName: string): string {
  const start = SRC.indexOf(`export async function ${name}`)
  expect(start).toBeGreaterThan(-1)
  return SRC.slice(start, SRC.indexOf(`\nexport async function ${nextName}`, start))
}

describe('capa de datos: enlace estable, nunca por título', () => {
  it('linkEventTaskToCalendar es idempotente (no duplica si ya está enlazada) y exige fecha', () => {
    const body = fnBody('linkEventTaskToCalendar', 'unlinkEventTaskFromCalendar')
    expect(body).toContain('if (task.calendar_event_id) return')
    expect(body).toContain("if (!task.due_date) throw new Error('Esta tarea todavía no tiene fecha')")
    expect(body).not.toMatch(/\.eq\('title'/)
  })

  it('unlinkEventTaskFromCalendar borra el calendar_events enlazado y limpia la referencia (vía el helper compartido)', () => {
    const start = SRC.indexOf('export async function unlinkEventTaskFromCalendar')
    const body = SRC.slice(start, SRC.indexOf('\nasync function syncLinkedTaskCalendarEventSafely', start))
    expect(body).toContain('await unlinkEventTaskCalendarById(taskId, task.calendar_event_id)')
    const helperStart = SRC.indexOf('async function unlinkEventTaskCalendarById')
    const helperBody = SRC.slice(helperStart, SRC.indexOf('\nexport async function unlinkEventTaskFromCalendar', helperStart))
    expect(helperBody).toContain("from('calendar_events').delete()")
    expect(helperBody).toContain('calendar_event_id: null')
  })

  it('updateEventTask sincroniza el calendario enlazado cuando cambia título o fecha, nunca al cambiar solo "done"/responsable', () => {
    const start = SRC.indexOf('export async function updateEventTask')
    const body = SRC.slice(start, SRC.indexOf('\n// Fase 9', start))
    expect(body).toContain('if (patch.title !== undefined || patch.dueDate !== undefined) await syncLinkedTaskCalendarEventSafely(id)')
  })

  it('deleteEventTask limpia el calendar_events asociado antes de borrar la tarea', () => {
    const start = SRC.indexOf('export async function deleteEventTask')
    const body = SRC.slice(start, start + 500)
    expect(body).toContain("select('calendar_event_id')")
    expect(body).toContain("from('calendar_events').delete()")
  })

  it('un fallo al sincronizar el calendario nunca revierte ni bloquea el guardado de la tarea (patrón "safely")', () => {
    const start = SRC.indexOf('async function syncLinkedTaskCalendarEventSafely')
    const body = SRC.slice(start, SRC.indexOf('\nexport async function deleteEventTask', start))
    expect(body).toContain('} catch {')
    expect(body).toContain('showToast(')
  })
})
