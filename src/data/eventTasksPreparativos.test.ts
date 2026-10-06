import { describe, expect, it } from 'vitest'

// Preparativos (migración 0206). Leen el código y la migración reales: las reglas de datos y de interfaz quedan
// protegidas aunque cambien las funciones de Supabase, que no se ejecutan en tests.
const src = (path: string) => (import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[`/${path}`]
const EVENTS = src('src/data/events.ts')
const RESP = src('src/data/eventTaskResponsibles.ts')
const UI = src('src/ui/EventosScreen.tsx')
const MIG = (import.meta.glob('/supabase/migrations/0206_event_tasks_priority_notes_responsibles.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/supabase/migrations/0206_event_tasks_priority_notes_responsibles.sql']

function fn(source: string, signature: string): string {
  const start = source.indexOf(signature)
  return source.slice(start, source.indexOf('\n}', start) + 2)
}

describe('migración 0206 — aditiva, sin backfill, RLS familiar', () => {
  it('columnas nuevas nullable con sus valores permitidos (sin default que invente datos)', () => {
    expect(MIG).toContain("priority text null check (priority in ('alta', 'media', 'baja'))")
    expect(MIG).toContain("priority_source text null check (priority_source in ('pepa', 'usuario'))")
    expect(MIG).toContain('notes text null check (notes is null or char_length(notes) <= 1000)')
    expect(MIG).toContain('due_time time null')
    expect(MIG).toContain('completed_at timestamptz null')
  })

  it('no hay hora sin fecha (nunca 00:00 inventado)', () => {
    expect(MIG).toContain('check (due_time is null or due_date is not null)')
  })

  it('no hay backfill ni borrados de datos existentes', () => {
    const code = MIG.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
    expect(code).not.toMatch(/\bupdate\s+event_tasks\b|\bdelete\s+from\b|\bdrop\s+table\b/i)
  })

  it('varios responsables y personas externas con RLS familiar; el snapshot de la persona externa es obligatorio', () => {
    expect(MIG).toContain('create table event_task_members')
    expect(MIG).toContain('create table event_helpers')
    expect(MIG).toContain('create table event_task_helpers')
    expect(MIG).toContain('helper_name text not null')
    expect(MIG).toContain('helper_id uuid null references event_helpers(id) on delete set null')
    expect(MIG).toMatch(/event_task_helpers[\s\S]*family_id = private\.current_family_id\(\) and private\.has_section_access\('eventos'\)/)
  })

  it('una persona externa no puede asignarse dos veces a la misma tarea', () => {
    expect(MIG).toContain('create unique index event_task_helpers_active_unique on event_task_helpers (task_id, helper_id) where helper_id is not null')
  })
})

describe('prioridad: PEPA propone al crear; lo que elige el usuario manda', () => {
  it('addEventTask guarda la prioridad propuesta con su motivo, o la que indique el usuario', () => {
    const add = fn(EVENTS, 'export async function addEventTask(')
    expect(add).toContain('const proposal = proposeTaskPriority({ title, dependsOnDecision: decisionId !== null })')
    expect(add).toContain("priority_source: priorityFromUser ? 'usuario' : 'pepa'")
    expect(add).toContain('priority_reason: priorityFromUser ? null : proposal.reason')
  })

  it('las tareas generadas al crear el evento y las de decisiones reciben prioridad propuesta', () => {
    expect(EVENTS).toContain("const proposal = proposeTaskPriority({ title: t.title, dependsOnDecision: false })")
    expect(EVENTS).toContain("const proposal = proposeTaskPriority({ title: action.title, dependsOnDecision: true })")
  })

  it('cambiar la prioridad marca el origen como usuario y no vuelve a recalcularse', () => {
    const upd = fn(EVENTS, 'export async function updateEventTask(')
    expect(upd).toContain("update.priority_source = 'usuario'")
    expect(upd).toContain('update.priority_reason = null')
  })

  it('reconciliar fechas o títulos nunca envía la prioridad (no sobrescribe la elegida)', () => {
    const recalc = fn(EVENTS, 'export async function recalculateAutoTasks(')
    expect(recalc).not.toMatch(/priority/)
  })

  it('«Sin prioridad» es una elección explícita: se guarda como null y origen usuario', () => {
    const upd = fn(EVENTS, 'export async function updateEventTask(')
    expect(upd).toContain('update.priority = patch.priority')
  })
})

describe('fecha de completado y hora', () => {
  it('marcar como hecha guarda la fecha de completado; desmarcar la limpia', () => {
    const upd = fn(EVENTS, 'export async function updateEventTask(')
    expect(upd).toContain('update.completed_at = patch.done ? new Date().toISOString() : null')
  })

  it('la hora solo se guarda con fecha; quitar la fecha quita la hora', () => {
    const upd = fn(EVENTS, 'export async function updateEventTask(')
    expect(upd).toContain('if (patch.dueDate === null) update.due_time = null')
    const add = fn(EVENTS, 'export async function addEventTask(')
    expect(add).toContain('due_time: dueDate && extras.dueTime ? extras.dueTime : null')
  })
});

describe('responsables múltiples y personas externas', () => {
  it('el principal sigue siendo el primero de la lista (Calendario de un solo responsable sigue igual)', () => {
    expect(fn(RESP, 'export async function setEventTaskResponsibles(')).toContain('memberIds[0] ?? null')
  })

  it('borrar una persona externa exige elegir: conservar o quitar; nunca en silencio si tiene asignaciones', () => {
    expect(UI).toContain('tiene {helperDeleteFor.assignments} asignación')
    expect(UI).toContain("Conservar las asignaciones (quedan como referencia)")
    expect(UI).toContain("Quitarla también de las tareas")
    expect(RESP).toContain("if (mode === 'remove')")
  })

  it('sin asignaciones se pide una confirmación sencilla antes de borrar', () => {
    expect(UI).toContain('¿Borrar a ${h.name} de este evento?')
  })

  it('conservar deja la referencia histórica con su snapshot; quitar borra antes las asignaciones', () => {
    const del = fn(RESP, 'export async function deleteEventHelper(')
    expect(del.indexOf("if (mode === 'remove')")).toBeLessThan(del.indexOf(".from('event_helpers').delete()"))
    expect(UI).toContain('ya no está en el evento (referencia histórica)')
  })

  it('al asignar, se copia el nombre y la etiqueta (snapshot)', () => {
    const set = fn(RESP, 'export async function setEventTaskHelpers(')
    expect(set).toContain('helper_name: h.name')
    expect(set).toContain('helper_label: h.label ?? null')
  })

  it('editar una persona externa actualiza sus asignaciones activas', () => {
    expect(fn(RESP, 'export async function updateEventHelper(')).toContain('.eq(\'helper_id\', helperId)')
  })

  it('las personas externas no tienen color ni cuenta: el color sigue siendo solo de miembros familiares', () => {
    expect(RESP).not.toMatch(/color/)
  })

  it('el filtro de responsables no existe aún como control: queda documentado como pendiente', () => {
    expect(UI).not.toContain('filtroResponsable')
  })
})

describe('tarjeta: compacta, nota truncada solo en pantalla', () => {
  it('la nota se muestra en una línea con puntos suspensivos; el valor guardado no cambia', () => {
    expect(UI).toContain("textOverflow: 'ellipsis'")
    expect(UI).toContain('whiteSpace: \'nowrap\'')
    expect(UI).toContain('title={task.notes}')
  })

  it('la hora se muestra junto a la fecha; la prioridad como etiqueta', () => {
    expect(UI).toContain("{task.dueTime ? ` · ${task.dueTime}` : ''}")
    expect(UI).toContain('{task.priority && <span className={`event-priority-${task.priority}`}>{PRIORITY_LABELS[task.priority]}</span>}')
  })
})

describe('«Pepa te recomienda» — una sola fuente de verdad, con explicación', () => {
  it('usa el ranking nuevo en la tarjeta, el resaltado y los recordatorios', () => {
    expect(UI).toContain('const upcomingTasks = recommendTasks(tasks, new Date(), 3)')
    expect(UI).not.toContain('rankUpcomingTasks(tasks)')
  })

  it('cada recomendación muestra su motivo', () => {
    expect(UI).toContain('{explanation}')
  })
})

describe('reglas ya validadas que no deben cambiar', () => {
  it('los cinco recordatorios siguen existiendo tal cual', () => {
    for (const option of ['none', 'same_day', '1_day', '1_week', 'custom']) expect(UI).toContain(`value="${option}"`)
  })

  it('Calendario y recordatorio siguen siendo controles independientes', () => {
    expect(UI).toContain('📅 Mostrar en Calendario')
    expect(UI).toContain('Recordatorio')
  })
})
