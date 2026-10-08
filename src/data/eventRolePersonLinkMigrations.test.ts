import { describe, expect, it } from 'vitest'

// Tanda integrada "Personas especiales, complementos, regalos, preparativos y encargos" — migraciones
// 0218 (event_special_details.role_person_id) y 0219 (event_tasks.role_person_id): vínculo OPCIONAL y
// DURADERO al roster real (event_role_people, migración 0216), nunca por nombre. Mismo patrón "hardened"
// que member_id (migración 0165) / decision_id (migración 0176): ON DELETE SET NULL, con el "with check"
// de RLS exigiendo que, cuando no es null, pertenezca a la misma familia Y al mismo evento.
const FILES = import.meta.glob(
  [
    '/supabase/migrations/0218_event_special_detail_role_person_link.sql',
    '/supabase/rollbacks/0218_event_special_detail_role_person_link_down.sql',
    '/supabase/migrations/0219_event_task_role_person_link.sql',
    '/supabase/rollbacks/0219_event_task_role_person_link_down.sql',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>
const MIG218 = FILES['/supabase/migrations/0218_event_special_detail_role_person_link.sql']
const DOWN218 = FILES['/supabase/rollbacks/0218_event_special_detail_role_person_link_down.sql']
const MIG219 = FILES['/supabase/migrations/0219_event_task_role_person_link.sql']
const DOWN219 = FILES['/supabase/rollbacks/0219_event_task_role_person_link_down.sql']

function withoutComments(sql: string): string {
  return sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
}

describe('0218 — event_special_details.role_person_id: aditiva, on delete set null, RLS endurecida', () => {
  it('columna nullable, FK a event_role_people, on delete set null (borrar la persona nunca borra el detalle/regalo)', () => {
    expect(MIG218).toContain('alter table event_special_details add column role_person_id uuid references event_role_people(id) on delete set null')
  })
  it('tiene índice', () => {
    expect(MIG218).toContain('create index idx_event_special_details_role_person on event_special_details(role_person_id)')
  })
  it('RLS: cuando no es null, role_person_id debe pertenecer a la misma familia Y al mismo evento', () => {
    const body = MIG218.slice(MIG218.indexOf('create policy "event_special_details: family crud"'))
    expect(body).toContain('role_person_id is null')
    expect(body).toContain('rp.family_id = private.current_family_id() and rp.event_id = event_special_details.event_id')
  })
  it('conserva TAL CUAL la condición de member_id ya endurecida en 0165, sin debilitarla', () => {
    const body = MIG218.slice(MIG218.indexOf('create policy "event_special_details: family crud"'))
    expect(body).toContain('member_id is null')
    expect(body).toContain('m.family_id = private.current_family_id() and m.event_id = event_special_details.event_id')
  })
  it('no hay backfill ni borrado de datos existentes', () => {
    const code = withoutComments(MIG218)
    expect(code).not.toMatch(/\bupdate\s+event_special_details\b|\bdelete\s+from\b/i)
  })
  it('rollback: restaura la policy sin role_person_id (solo member_id) y elimina la columna, sin borrar ningún detalle', () => {
    expect(DOWN218).not.toContain('role_person_id is null')
    expect(DOWN218).toContain('alter table event_special_details drop column if exists role_person_id')
    expect(DOWN218).not.toMatch(/\bdelete from\b|\btruncate\b/i)
  })
})

describe('0219 — event_tasks.role_person_id: aditiva, on delete set null, conserva el endurecido de decision_id (0176)', () => {
  it('columna nullable, FK a event_role_people, on delete set null (borrar la persona nunca borra la tarea ya creada)', () => {
    expect(MIG219).toContain('alter table event_tasks add column role_person_id uuid references event_role_people(id) on delete set null')
  })
  it('tiene índice', () => {
    expect(MIG219).toContain('create index idx_event_tasks_role_person on event_tasks(role_person_id)')
  })
  it('RLS: cuando no es null, role_person_id debe pertenecer a la misma familia Y al mismo evento', () => {
    const body = MIG219.slice(MIG219.indexOf('create policy "event_tasks: family crud"'))
    expect(body).toContain('role_person_id is null')
    expect(body).toContain('rp.family_id = private.current_family_id() and rp.event_id = event_tasks.event_id')
  })
  it('CRÍTICO: conserva TAL CUAL el endurecido de decision_id de la migración 0176, nunca lo debilita ni lo quita', () => {
    const body = MIG219.slice(MIG219.indexOf('create policy "event_tasks: family crud"'))
    expect(body).toContain(
      '(decision_id is null or exists (select 1 from event_decisions d where d.id = decision_id and d.family_id = private.current_family_id() and d.event_id = event_tasks.event_id))',
    )
  })
  it('no hay backfill ni borrado de datos existentes', () => {
    const code = withoutComments(MIG219)
    expect(code).not.toMatch(/\bupdate\s+event_tasks\b|\bdelete\s+from\b/i)
  })
  it('rollback: restaura la policy exactamente como quedó en 0176 (solo decision_id, sin role_person_id) y elimina la columna, sin borrar ninguna tarea', () => {
    expect(DOWN219).not.toContain('role_person_id is null')
    expect(DOWN219).toContain(
      '(decision_id is null or exists (select 1 from event_decisions d where d.id = decision_id and d.family_id = private.current_family_id() and d.event_id = event_tasks.event_id))',
    )
    expect(DOWN219).toContain('alter table event_tasks drop column if exists role_person_id')
    expect(DOWN219).not.toMatch(/\bdelete from\b|\btruncate\b/i)
  })
})
