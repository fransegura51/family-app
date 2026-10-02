import { describe, expect, it } from 'vitest'

// Guardas de 0184_calendar_tasks_categories.sql — FASE CALENDARIO: calendar_events.kind (Evento/Tarea,
// un único motor), calendar_categories (propia, con RLS familiar), calendar_events.category_id, y
// preferencias de visualización por usuario real en profiles.
const FILES = import.meta.glob(
  ['/supabase/migrations/0184_calendar_tasks_categories.sql', '/supabase/rollbacks/0184_calendar_tasks_categories_down.sql'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>
const MIGRATION = FILES['/supabase/migrations/0184_calendar_tasks_categories.sql']
const ROLLBACK = FILES['/supabase/rollbacks/0184_calendar_tasks_categories_down.sql']
const SQL = MIGRATION.replace(/--[^\n]*/g, '')

describe('0184: calendar_events.kind — UN único motor, nunca una tabla "tasks" aparte', () => {
  it('kind nace NOT NULL con default \'event\' — todas las filas existentes quedan kind=\'event\', cambio 100% aditivo', () => {
    expect(SQL).toMatch(/alter table calendar_events add column kind text not null default 'event'/)
  })

  it('constraint que solo admite \'event\'/\'task\' — nunca un tercer valor silencioso', () => {
    expect(SQL).toMatch(/check \(kind in \('event', 'task'\)\)/)
  })

  it('nunca crea una tabla "tasks" independiente', () => {
    expect(SQL).not.toMatch(/create table (public\.)?tasks\b/i)
  })

  it('índice por family_id+kind para listar Eventos/Tareas de una familia eficientemente', () => {
    expect(SQL).toContain('create index idx_calendar_events_kind on calendar_events(family_id, kind)')
  })
})

describe('0184: calendar_categories — propia del Calendario, nunca budget_categories ni tags de otro dominio', () => {
  it('tabla con id/family_id/name/emoji/color nullable/sort_order/created_at', () => {
    const table = SQL.slice(SQL.indexOf('create table calendar_categories'), SQL.indexOf('alter table calendar_categories enable row level security'))
    expect(table).toContain('family_id uuid not null references families(id) on delete cascade')
    expect(table).toContain('name text not null')
    expect(table).toContain('emoji text not null')
    expect(table).toContain('color text,')
    expect(table).toContain('sort_order int not null default 0')
  })

  it('RLS familiar — misma forma exacta que calendar_events: family_id = private.current_family_id()', () => {
    expect(SQL).toMatch(/create policy "calendar_categories: family crud" on calendar_categories for all\s+using \(family_id = private\.current_family_id\(\)\)\s+with check \(family_id = private\.current_family_id\(\)\)/)
  })

  it('índice por family_id', () => {
    expect(SQL).toContain('create index idx_calendar_categories_family on calendar_categories(family_id)')
  })

  it('nunca reutiliza budget_categories ni ninguna tabla de tags de otro dominio', () => {
    expect(SQL).not.toMatch(/budget_categories/)
    expect(SQL).not.toMatch(/\btags\b/)
  })
})

describe('0184: calendar_events.category_id — opcional, borrar categoría nunca borra lo que la llevaba', () => {
  it('FK nullable con on delete set null (nunca cascade)', () => {
    expect(SQL).toMatch(/alter table calendar_events add column category_id uuid references calendar_categories\(id\) on delete set null/)
  })

  it('índice por category_id', () => {
    expect(SQL).toContain('create index idx_calendar_events_category on calendar_events(category_id)')
  })
})

describe('0184: preferencias de Calendario en profiles — POR USUARIO, nunca families/localStorage', () => {
  it('calendar_color_mode: default \'miembros\', constraint miembros/categorias', () => {
    expect(SQL).toMatch(/alter table profiles add column calendar_color_mode text not null default 'miembros'/)
    expect(SQL).toMatch(/check \(calendar_color_mode in \('miembros', 'categorias'\)\)/)
  })

  it('calendar_task_order: default \'eventos_primero\', constraint eventos_primero/tareas_primero', () => {
    expect(SQL).toMatch(/alter table profiles add column calendar_task_order text not null default 'eventos_primero'/)
    expect(SQL).toMatch(/check \(calendar_task_order in \('eventos_primero', 'tareas_primero'\)\)/)
  })

  it('nunca toca families ni crea ninguna tabla de preferencias — vive en profiles, RLS "update own row" ya existente la cubre', () => {
    expect(SQL).not.toMatch(/alter table families/)
    expect(SQL).not.toMatch(/create policy.*profiles/)
  })
})

describe('0184: sincronización externa de Tareas — reutiliza sync_to_google, sin columna nueva (Parte 25)', () => {
  it('no añade ninguna columna de sincronización nueva — el propio comentario documenta la reutilización', () => {
    expect(SQL).not.toMatch(/add column sync/)
    expect(MIGRATION).toMatch(/reutilizando la columna sync_to_google/)
  })
})

describe('0184: aditiva, nunca destructiva', () => {
  it('ningún update/delete/truncate/drop sobre datos existentes', () => {
    expect(SQL).not.toMatch(/\bupdate\s+(?:only\s+)?\w+\s+set\b/i)
    expect(SQL).not.toMatch(/\bdelete from\b|\btruncate\b|\bdrop table\b|\bdrop column\b/i)
  })

  it('el rollback deshace exactamente lo añadido aquí, en orden inverso seguro (constraints antes que columnas)', () => {
    const statements = ROLLBACK.replace(/--[^\n]*/g, '')
    expect(statements).toContain('alter table profiles drop column if exists calendar_task_order')
    expect(statements).toContain('alter table profiles drop column if exists calendar_color_mode')
    expect(statements).toContain('alter table calendar_events drop column if exists category_id')
    expect(statements).toContain('drop table if exists calendar_categories')
    expect(statements).toContain('alter table calendar_events drop column if exists kind')
  })
})
