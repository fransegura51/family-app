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

describe('resolveEventTaskGroup — un único UPDATE a event_task_groups, nunca toca las tareas del encargo', () => {
  it('fija resolved_at, resolution_method/note y provider/payment de una sola vez', () => {
    const body = fn(SRC, 'export async function resolveEventTaskGroup(')
    expect(body).toContain('const resolvedAt = new Date().toISOString()')
    expect(body).toContain('resolved_at: resolvedAt')
    expect(body).toContain('resolution_method: input.method')
    expect(body).toContain('provider_id: input.providerId ?? null')
    expect(body).toContain('provider_name: input.providerName ?? null')
    expect(body).toContain('payment_id: input.paymentId ?? null')
    expect(body).not.toMatch(/event_tasks|event_providers|event_payments/)
  })
})

// Migración 0220 (plan de pendientes — "Reconciliación de encargos" tras la decisión real del usuario):
// resolver dos veces el mismo encargo NUNCA sobrescribe ni borra la resolución anterior. event_task_groups
// sigue reflejando solo la MÁS RECIENTE (igual que siempre, nada que lea esas columnas se rompe), pero
// AHORA cada resolución queda ADEMÁS como fila nueva en event_task_group_resolutions — histórico append-only.
describe('resolveEventTaskGroup — histórico append-only (migración 0220): resolver de nuevo conserva la resolución anterior', () => {
  it('tras el UPDATE, inserta SIEMPRE una fila nueva en event_task_group_resolutions con el mismo resolvedAt/method/provider/payment', () => {
    const body = fn(SRC, 'export async function resolveEventTaskGroup(')
    expect(body).toContain("from('event_task_group_resolutions').insert({")
    expect(body).toContain('group_id: groupId,')
    expect(body).toContain('family_id: group.family_id,')
    expect(body).toContain('resolved_at: resolvedAt,')
  })
  it('lee family_id del propio grupo (nunca inventado) antes de insertar el histórico', () => {
    const body = fn(SRC, 'export async function resolveEventTaskGroup(')
    expect(body).toContain("from('event_task_groups').select('family_id').eq('id', groupId).single()")
  })
  it('un error al insertar el histórico SÍ se propaga (throw), nunca se traga en silencio', () => {
    const body = fn(SRC, 'export async function resolveEventTaskGroup(')
    expect(body).toContain('if (historyError) throw historyError')
  })
})

describe('listEventTaskGroupResolutions — histórico completo, de la más antigua a la más reciente', () => {
  it('ordena por resolved_at ascendente (para poder mostrar "antes resuelto: X" en orden)', () => {
    const body = fn(SRC, 'export async function listEventTaskGroupResolutions(')
    expect(body).toContain(".eq('group_id', groupId).order('resolved_at', { ascending: true })")
  })
  it('solo lee — nunca modifica event_task_groups ni sus propias filas', () => {
    const body = fn(SRC, 'export async function listEventTaskGroupResolutions(')
    expect(body).not.toMatch(/\.update\(|\.delete\(|\.insert\(/)
  })
})

describe('migración 0220 — event_task_group_resolutions es aditiva, nunca borra ni altera event_task_groups', () => {
  const MIG220 = (import.meta.glob('/supabase/migrations/0220_event_task_group_resolution_history.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
    '/supabase/migrations/0220_event_task_group_resolution_history.sql'
  ]
  it('crea una tabla nueva con FK a event_task_groups on delete cascade (el histórico no sobrevive a borrar el encargo entero)', () => {
    expect(MIG220).toContain('create table event_task_group_resolutions')
    expect(MIG220).toContain('references event_task_groups(id) on delete cascade')
  })
  it('tiene RLS familiar, igual que el resto del módulo', () => {
    expect(MIG220).toContain('alter table event_task_group_resolutions enable row level security')
    expect(MIG220).toContain("family_id = private.current_family_id() and private.has_section_access('eventos')")
  })
  it('no toca ninguna columna de event_task_groups ni de event_tasks', () => {
    const code = MIG220.split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n')
    expect(code).not.toMatch(/alter table event_task_groups\b|alter table event_tasks\b/)
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
