import { describe, expect, it } from 'vitest'

// Bloque D/F — "🗂️ Encargos": agrupación organizativa de Preparativos, deliberadamente SIN relación con
// Proveedores/Presupuesto en esta tanda (ver migración 0212 y el informe). Un grupo principal por tarea.
const SRC = (import.meta.glob('/src/data/eventTaskGroups.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/data/eventTaskGroups.ts']
const MIG = (import.meta.glob('/supabase/migrations/0212_event_task_groups.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
  '/supabase/migrations/0212_event_task_groups.sql'
]

function fn(source: string, signature: string): string {
  const start = source.indexOf(signature)
  expect(start, `no se encontró "${signature}"`).toBeGreaterThan(-1)
  return source.slice(start, source.indexOf('\n}', start) + 2)
}

describe('migración 0212 — aditiva, UN grupo por tarea, nunca borra tareas al borrar un grupo', () => {
  it('event_task_groups tiene RLS familiar, igual que el resto del módulo de Eventos', () => {
    expect(MIG).toContain('create table event_task_groups')
    expect(MIG).toContain('alter table event_task_groups enable row level security')
    expect(MIG).toContain("family_id = private.current_family_id() and private.has_section_access('eventos')")
  })
  it('event_tasks.group_id es nullable con ON DELETE SET NULL — borrar un encargo nunca borra tareas', () => {
    expect(MIG).toContain('alter table event_tasks add column group_id uuid null references event_task_groups(id) on delete set null')
  })
  it('no toca Proveedores ni Presupuesto en absoluto en el SQL real (decisión de producto aparte, ver informe — solo se mencionan en los comentarios)', () => {
    const code = MIG.split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n')
    expect(code).not.toMatch(/event_providers|event_budget_items/i)
  })
  it('no hay backfill ni borrados de datos existentes', () => {
    const code = MIG.split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n')
    expect(code).not.toMatch(/\bupdate\s+event_tasks\b|\bdelete\s+from\b|\bdrop\s+table\b/i)
  })
})

describe('crear, renombrar y borrar un encargo', () => {
  it('addEventTaskGroup crea con el family_id real del evento (nunca inventado)', () => {
    const body = fn(SRC, 'export async function addEventTaskGroup(')
    expect(body).toContain("from('events').select('family_id')")
    expect(body).toContain("from('event_task_groups')\n    .insert({ event_id: eventId, family_id: event.family_id")
  })
  it('renameEventTaskGroup solo actualiza el nombre', () => {
    const body = fn(SRC, 'export async function renameEventTaskGroup(')
    expect(body).toContain("from('event_task_groups').update({ name: name.trim() })")
  })
  it('deleteEventTaskGroup borra SOLO la fila del grupo — nunca toca event_tasks (el FK on delete set null hace el resto)', () => {
    const body = fn(SRC, 'export async function deleteEventTaskGroup(')
    expect(body).toContain("from('event_task_groups').delete()")
    expect(body).not.toContain('event_tasks')
  })
})

describe('asociar/desasociar tareas', () => {
  it('setEventTaskGroup actualiza solo group_id — nunca título, fecha, responsables, prioridad, nota, Calendario ni recordatorios', () => {
    const body = fn(SRC, 'export async function setEventTaskGroup(')
    expect(body).toContain("from('event_tasks').update({ group_id: groupId })")
    expect(body).not.toMatch(/title|due_date|due_time|priority|notes|calendar_event_id|assigned_member_id/)
  })
  it('null quita la tarea del grupo sin borrarla (mismo UPDATE, solo cambia el valor)', () => {
    const body = fn(SRC, 'export async function setEventTaskGroup(')
    expect(body).toContain('groupId: string | null')
  })
  it('countTasksInGroup cuenta, no modifica nada', () => {
    const body = fn(SRC, 'export async function countTasksInGroup(')
    expect(body).toContain("{ count: 'exact', head: true }")
    expect(body).not.toMatch(/\.update\(|\.delete\(|\.insert\(/)
  })
})
