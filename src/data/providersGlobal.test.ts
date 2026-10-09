import { describe, expect, it } from 'vitest'

// PEPA Eventos, prompt maestro Parte A — registro GLOBAL de proveedores (migración 0224). Decisión
// explícita del usuario: NUNCA tocar el significado de las FK que ya apuntan a event_providers
// (event_payments/event_task_groups/event_task_group_resolutions/event_task_group_offers/
// event_decision_providers.provider_id) — solo una referencia NUEVA (global_provider_id) desde
// event_providers hacia aquí.
const SRC = (import.meta.glob('/src/data/providersGlobal.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/data/providersGlobal.ts']
const EVENTS_SRC = (import.meta.glob('/src/data/events.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/data/events.ts']
const MIG = (import.meta.glob('/supabase/migrations/0224_providers_global_registry.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
  '/supabase/migrations/0224_providers_global_registry.sql'
]

function fn(source: string, signature: string): string {
  const start = source.indexOf(signature)
  expect(start, `no se encontró "${signature}"`).toBeGreaterThan(-1)
  return source.slice(start, source.indexOf('\n}', start) + 2)
}

describe('migración 0224 — aditiva, nunca toca las FK que ya apuntan a event_providers', () => {
  it('providers_global y event_provider_links tienen RLS familiar', () => {
    expect(MIG).toContain('create table providers_global')
    expect(MIG).toContain('alter table providers_global enable row level security')
    expect(MIG).toContain('create table event_provider_links')
    expect(MIG).toContain('alter table event_provider_links enable row level security')
  })
  it('event_providers gana una columna NUEVA (global_provider_id) — nunca se borra ni se renombra ninguna de sus columnas existentes', () => {
    const code = MIG.split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n')
    expect(code).toContain('alter table event_providers add column global_provider_id')
    // El único "drop column" del fichero es sobre la columna temporal de AYUDA en providers_global
    // (source_event_provider_id, solo para emparejar el backfill 1:1) — nunca sobre event_providers.
    expect(code).not.toMatch(/alter table event_providers[^;]*(drop column|rename column)/i)
  })
  it('el backfill crea una ficha global NUEVA por cada event_providers existente — nunca fusiona por coincidencia de nombre', () => {
    expect(MIG).toContain('insert into providers_global')
    expect(MIG).toContain('from event_providers')
    // El emparejamiento usa una columna temporal 1:1 por id (source_event_provider_id), nunca una
    // coincidencia heurística por nombre/fecha que podría fallar con proveedores homónimos.
    expect(MIG).toContain('source_event_provider_id')
    expect(MIG).toContain('where pg.source_event_provider_id = ep.id')
  })
  it('event_provider_links tiene unique(event_id, global_provider_id) — vincular dos veces el mismo proveedor al mismo evento nunca duplica', () => {
    expect(MIG).toContain('unique (event_id, global_provider_id)')
  })
  it('status por defecto "interesado", nunca "descartado" — no se puede inventar que algo ya fue descartado', () => {
    expect(MIG).toContain("status text not null default 'interesado' check (status in ('interesado', 'descartado'))")
  })
})

describe('data/events.ts — event_providers conserva sus 5 FK intactas, solo gana la referencia global', () => {
  it('PROVIDER_SELECT y mapProvider incluyen global_provider_id sin quitar ningún campo existente', () => {
    expect(EVENTS_SRC).toContain('global_provider_id')
    const mapFn = fn(EVENTS_SRC, 'function mapProvider(')
    expect(mapFn).toContain('globalProviderId: r.global_provider_id')
    expect(mapFn).toContain('id: r.id')
    expect(mapFn).toContain('eventId: r.event_id')
  })
})

describe('data/providersGlobal.ts — CRUD global + vínculos por evento', () => {
  it('listProvidersGlobal nunca filtra por evento (toda la familia, A2)', () => {
    const listFn = fn(SRC, 'export async function listProvidersGlobal(')
    expect(listFn).not.toContain('event_id')
  })
  it('linkProviderToEvent es idempotente: si ya existe el vínculo, lo reutiliza en vez de duplicarlo', () => {
    const linkFn = fn(SRC, 'export async function linkProviderToEvent(')
    expect(linkFn).toContain('.maybeSingle()')
    expect(linkFn).toContain('if (existing) return mapLink(existing)')
  })
  it('unlinkProviderFromEvent borra SOLO el vínculo — nunca providers_global (A3: "desvincular sin eliminar globalmente")', () => {
    const unlinkFn = fn(SRC, 'export async function unlinkProviderFromEvent(')
    expect(unlinkFn).toContain("from('event_provider_links').delete()")
    expect(unlinkFn).not.toContain("from('providers_global')")
  })
  it('setEventProviderLinkStatus nunca borra el vínculo — "descartado" siempre se puede deshacer', () => {
    const statusFn = fn(SRC, 'export async function setEventProviderLinkStatus(')
    expect(statusFn).not.toContain('.delete()')
    expect(statusFn).toContain('.update({ status }')
  })
  it('updateProviderGlobal con archived:true nunca borra la fila (igual que event_providers.archived, Fase 5)', () => {
    const updateFn = fn(SRC, 'export async function updateProviderGlobal(')
    expect(updateFn).not.toContain('.delete()')
  })
})
