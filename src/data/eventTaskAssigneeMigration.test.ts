import { describe, expect, it } from 'vitest'

// Eventos Fase 6 — responsable de una tarea (0162). Nullable, on delete
// set null, nunca inferido: las tareas ya existentes deben seguir
// funcionando exactamente igual (sin ningún backfill).
const FILES = import.meta.glob(['/supabase/migrations/0162_event_task_assignee.sql', '/supabase/rollbacks/0162_event_task_assignee_down.sql'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
const MIGRATION = FILES['/supabase/migrations/0162_event_task_assignee.sql']
const ROLLBACK = FILES['/supabase/rollbacks/0162_event_task_assignee_down.sql']

describe('0162 — event_tasks.assigned_member_id', () => {
  it('es nullable (ninguna tarea existente se rompe ni se rellena sola)', () => {
    expect(MIGRATION).toContain('add column assigned_member_id uuid references family_members(id) on delete set null')
    expect(MIGRATION).not.toMatch(/not null/i)
  })

  it('nunca infiere ni rellena un responsable — solo añade la columna, sin ningún update/backfill', () => {
    expect(MIGRATION).not.toMatch(/^\s*update\s+event_tasks/im)
  })

  it('on delete set null: borrar un miembro de la familia no borra sus tareas de evento, solo las deja sin asignar', () => {
    expect(MIGRATION).toContain('on delete set null')
    expect(MIGRATION).not.toMatch(/on delete cascade/i)
  })

  it('tiene índice para el filtro/desplegable por responsable', () => {
    expect(MIGRATION).toContain('create index if not exists event_tasks_assigned_member_id_idx on event_tasks(assigned_member_id)')
  })

  it('el rollback quita exactamente la columna y su índice, sin tocar ninguna otra tabla', () => {
    expect(ROLLBACK).toContain('alter table event_tasks drop column if exists assigned_member_id')
    expect(ROLLBACK).toContain('drop index if exists event_tasks_assigned_member_id_idx')
    expect(ROLLBACK).not.toMatch(/\bdrop table\b/i)
  })
})

describe('capa de datos: updateEventTask pasa assignedMemberId tal cual, sin inferirlo', () => {
  it('acepta assignedMemberId (incluido null explícito para "sin asignar") y lo mapea a assigned_member_id', () => {
    const APP = import.meta.glob('/src/data/events.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    const src = APP['/src/data/events.ts']
    const fnIdx = src.indexOf('export async function updateEventTask')
    expect(fnIdx).toBeGreaterThan(-1)
    const fnBody = src.slice(fnIdx, src.indexOf('\n}', fnIdx) + 2)
    expect(fnBody).toContain('assignedMemberId?: string | null')
    expect(fnBody).toContain('if (patch.assignedMemberId !== undefined) update.assigned_member_id = patch.assignedMemberId')
  })

  it('addEventTask nunca asigna un responsable al crear la tarea (siempre "sin asignar")', () => {
    const APP = import.meta.glob('/src/data/events.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    const src = APP['/src/data/events.ts']
    const fnIdx = src.indexOf('export async function addEventTask')
    const fnBody = src.slice(fnIdx, src.indexOf('\n}', fnIdx) + 2)
    expect(fnBody).not.toContain('assigned_member_id')
  })
})
