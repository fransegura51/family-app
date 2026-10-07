import { describe, expect, it } from 'vitest'

// Bloque D/F — "🗂️ Encargos": agrupación organizativa de Preparativos (migración 0212). Un grupo
// principal por tarea. Tanda Encargos v2 (migración 0215): un encargo puede RESOLVERSE con un proveedor
// real y un precio TOTAL opcional, reutilizando event_providers/event_payments tal cual — nunca
// event_budget_items (ver cabecera de 0215 y el informe de la tanda).
const SRC = (import.meta.glob('/src/data/eventTaskGroups.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/data/eventTaskGroups.ts']
const MIG = (import.meta.glob('/supabase/migrations/0212_event_task_groups.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
  '/supabase/migrations/0212_event_task_groups.sql'
]
const MIG215 = (import.meta.glob('/supabase/migrations/0215_event_task_groups_resolution.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
  '/supabase/migrations/0215_event_task_groups_resolution.sql'
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

describe('migración 0215 — resolución con proveedor/precio opcional, aditiva, nunca toca event_budget_items', () => {
  it('provider_id y payment_id son ON DELETE SET NULL — borrar un proveedor o un pago nunca bloquea ni destruye el histórico de resolución', () => {
    expect(MIG215).toContain('references event_providers(id) on delete set null')
    expect(MIG215).toContain('references event_payments(id) on delete set null')
  })
  it('provider_name es un snapshot aparte (mismo patrón que event_task_helpers.helper_name): sobrevive a editar/borrar el proveedor', () => {
    expect(MIG215).toContain('add column provider_name text null')
  })
  it('resolution_method está acotado a los 4 valores reales', () => {
    expect(MIG215).toContain("check (resolution_method in ('empresa', 'nosotros', 'ayuda', 'otro'))")
  })
  it('kind es único por evento cuando no es null — findOrCreateEventTaskGroupByKind confía en esto', () => {
    expect(MIG215).toContain('create unique index event_task_groups_kind_unique on event_task_groups(event_id, kind) where kind is not null')
  })
  it('nunca toca event_budget_items ni event_tasks — solo añade columnas a event_task_groups', () => {
    const code = MIG215.split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n')
    expect(code).not.toMatch(/event_budget_items|event_tasks\b/)
  })
})

describe('findOrCreateEventTaskGroupByKind — idempotente por kind (nunca por name, que la familia puede renombrar)', () => {
  it('busca primero por (event_id, kind) antes de crear nada', () => {
    const body = fn(SRC, 'export async function findOrCreateEventTaskGroupByKind(')
    expect(body).toContain(".select('id').eq('event_id', eventId).eq('kind', kind).maybeSingle()")
  })
  it('si no existe, lo crea con name=defaultName y kind=kind', () => {
    const body = fn(SRC, 'export async function findOrCreateEventTaskGroupByKind(')
    expect(body).toContain('insert({ event_id: eventId, family_id: familyId, name: defaultName, kind, sort_order: Date.now() })')
  })
  it('una colisión de unicidad concurrente relee en vez de fallar', () => {
    const body = fn(SRC, 'export async function findOrCreateEventTaskGroupByKind(')
    expect(body).toContain('isUniqueViolation(error)')
  })
})

describe('resolveEventTaskGroup — un único UPDATE, nunca toca las tareas del encargo', () => {
  it('fija resolved_at, resolution_method/note y provider/payment de una sola vez', () => {
    const body = fn(SRC, 'export async function resolveEventTaskGroup(')
    expect(body).toContain('resolved_at: new Date().toISOString()')
    expect(body).toContain('resolution_method: input.method')
    expect(body).toContain('provider_id: input.providerId ?? null')
    expect(body).toContain('provider_name: input.providerName ?? null')
    expect(body).toContain('payment_id: input.paymentId ?? null')
    expect(body).not.toMatch(/event_tasks|event_providers|event_payments/)
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
