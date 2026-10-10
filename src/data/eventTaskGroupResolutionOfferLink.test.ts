import { describe, expect, it } from 'vitest'

// PEPA Eventos, prompt maestro — Fase 7 (Parte C2): trazabilidad oferta → encargo (migración 0228).
// Aditiva: nunca cambia el significado de provider_id/payment_id (migración 0215) ni de group_id/
// family_id/method/note (migración 0220) ya existentes.
const SRC = (import.meta.glob('/src/data/eventTaskGroups.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/data/eventTaskGroups.ts']
const MIG = (import.meta.glob('/supabase/migrations/0228_event_task_group_resolution_offer_link.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
  '/supabase/migrations/0228_event_task_group_resolution_offer_link.sql'
]

function fn(source: string, signature: string): string {
  const start = source.indexOf(signature)
  expect(start, `no se encontró "${signature}"`).toBeGreaterThan(-1)
  return source.slice(start, source.indexOf('\n}', start) + 2)
}

describe('migración 0228 — aditiva, mismo patrón que provider_id/payment_id (0215)', () => {
  it('añade offer_id a event_task_groups (la más reciente) y a event_task_group_resolutions (el histórico), ambas ON DELETE SET NULL', () => {
    expect(MIG).toContain('alter table event_task_groups add column offer_id uuid null references event_task_group_offers(id) on delete set null')
    expect(MIG).toContain('alter table event_task_group_resolutions add column offer_id uuid null references event_task_group_offers(id) on delete set null')
  })
  it('no toca ninguna columna existente ni ninguna otra tabla', () => {
    const code = MIG.split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n')
    expect(code).not.toMatch(/drop column|alter column|event_payments|event_budget_items|event_tasks\b/)
  })
})

describe('resolveEventTaskGroup — guarda offer_id igual en event_task_groups y en el histórico', () => {
  it('lo escribe en el UPDATE de event_task_groups', () => {
    const body = fn(SRC, 'export async function resolveEventTaskGroup(')
    expect(body).toContain('offer_id: input.offerId ?? null,')
  })
  it('lo escribe también al insertar la fila de histórico (event_task_group_resolutions)', () => {
    const body = fn(SRC, 'export async function resolveEventTaskGroup(')
    const historyInsert = body.slice(body.indexOf("from('event_task_group_resolutions').insert({"))
    expect(historyInsert).toContain('offer_id: input.offerId ?? null,')
  })
})

describe('listEventTaskGroupResolutions / mapGroup / mapGroupResolution — offer_id se lee igual que los demás campos', () => {
  it('GROUP_SELECT y GROUP_RESOLUTION_SELECT incluyen offer_id', () => {
    expect(SRC).toContain(
      "const GROUP_SELECT = 'id, event_id, name, sort_order, kind, resolved_at, resolution_method, resolution_note, provider_id, provider_name, payment_id, offer_id'",
    )
    expect(SRC).toContain("const GROUP_RESOLUTION_SELECT = 'id, group_id, method, note, provider_id, provider_name, payment_id, offer_id, resolved_at, active'")
  })
})
