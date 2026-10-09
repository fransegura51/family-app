import { describe, expect, it } from 'vitest'

// PEPA Eventos, prompt maestro — Fase 6: Parte B2 (servicios estructurados dentro de una oferta) y Parte
// B4 (versionado — una oferta puede marcar que es una revisión de otra, sin fusionarlas). Migración 0227.
// B2 es SOLO un desglose opcional: event_task_group_offers.amount sigue siendo el total tal cual lo dio
// el proveedor, nunca recalculado a partir de las líneas.
const SRC = (import.meta.glob('/src/data/eventTaskGroups.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/data/eventTaskGroups.ts']
const MIG = (import.meta.glob('/supabase/migrations/0227_event_task_group_offer_items.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
  '/supabase/migrations/0227_event_task_group_offer_items.sql'
]

function fn(source: string, signature: string): string {
  const start = source.indexOf(signature)
  expect(start, `no se encontró "${signature}"`).toBeGreaterThan(-1)
  return source.slice(start, source.indexOf('\n}', start) + 2)
}

describe('migración 0227 — aditiva, event_task_group_offers.amount nunca se recalcula a partir de las líneas', () => {
  it('event_task_group_offer_items tiene RLS familiar vía la oferta (igual que el resto del módulo)', () => {
    expect(MIG).toContain('create table event_task_group_offer_items')
    expect(MIG).toContain('alter table event_task_group_offer_items enable row level security')
    expect(MIG).toContain('exists (select 1 from event_task_group_offers o where o.id = offer_id and o.family_id = private.current_family_id())')
  })
  it('subtotal/quantity/unit_price son NULLABLE y nunca se tocan con un default distinto de null — nada se inventa', () => {
    expect(MIG).toContain('quantity numeric(10, 2) null')
    expect(MIG).toContain('unit_price numeric(10, 2) null')
    expect(MIG).toContain('subtotal numeric(10, 2) null')
  })
  it('is_package/selected tienen default explícito (false / true) — nunca quedan ambiguos', () => {
    expect(MIG).toContain('is_package boolean not null default false')
    expect(MIG).toContain('selected boolean not null default true')
  })
  it('offer_id es ON DELETE CASCADE (un servicio no tiene sentido sin su oferta)', () => {
    expect(MIG).toContain('offer_id uuid not null references event_task_group_offers(id) on delete cascade')
  })
  it('supersedes_offer_id es nullable y ON DELETE SET NULL — borrar la oferta anterior nunca bloquea ni borra la revisión', () => {
    expect(MIG).toContain('alter table event_task_group_offers add column supersedes_offer_id uuid null references event_task_group_offers(id) on delete set null')
  })
  it('no toca event_payments ni event_budget_items — sigue siendo solo información para comparar', () => {
    const code = MIG.split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n')
    expect(code).not.toMatch(/event_payments|event_budget_items/i)
  })
})

describe('addEventTaskGroupOfferItem — family_id siempre viene de la propia oferta, nunca inventado', () => {
  it('usa offer.familyId y offer.id, con sort_order por Date.now() (mismo patrón que el resto del módulo)', () => {
    const body = fn(SRC, 'export async function addEventTaskGroupOfferItem(')
    expect(body).toContain('offer_id: offer.id,')
    expect(body).toContain('family_id: offer.familyId,')
    expect(body).toContain('sort_order: Date.now(),')
  })
  it('is_package/selected tienen el mismo default que la base de datos cuando no se especifican', () => {
    const body = fn(SRC, 'export async function addEventTaskGroupOfferItem(')
    expect(body).toContain('is_package: input.isPackage ?? false,')
    expect(body).toContain('selected: input.selected ?? true,')
  })
})

describe('updateEventTaskGroupOfferItem — solo actualiza los campos presentes en el patch', () => {
  it('nunca pisa un campo que no se pasó', () => {
    const body = fn(SRC, 'export async function updateEventTaskGroupOfferItem(')
    expect(body).toContain('if (patch.subtotal !== undefined) update.subtotal = patch.subtotal')
    expect(body).toContain('if (patch.quantity !== undefined) update.quantity = patch.quantity')
  })
})

describe('setEventTaskGroupOfferItemSelected — solo cambia selected, nunca contrata ni completa nada', () => {
  it('es un UPDATE de un único campo', () => {
    const body = fn(SRC, 'export async function setEventTaskGroupOfferItemSelected(')
    expect(body).toContain(".update({ selected }).eq('id', id)")
    expect(body).not.toMatch(/resolveEventTaskGroup|addEventPayment/)
  })
})

describe('listEventTaskGroupOfferItems — ordenado, solo lectura', () => {
  it('ordena por sort_order ascendente', () => {
    const body = fn(SRC, 'export async function listEventTaskGroupOfferItems(')
    expect(body).toContain(".eq('offer_id', offerId).order('sort_order', { ascending: true })")
  })
})

describe('Parte B4 — supersedesOfferId se guarda igual en la oferta de un encargo y en una oferta suelta', () => {
  it('addEventTaskGroupOffer lo acepta y lo guarda (nunca lo infiere solo)', () => {
    const body = fn(SRC, 'export async function addEventTaskGroupOffer(')
    expect(body).toContain('supersedes_offer_id: input.supersedesOfferId ?? null,')
  })
  it('addLooseTaskGroupOffer lo acepta y lo guarda igual', () => {
    const body = fn(SRC, 'export async function addLooseTaskGroupOffer(')
    expect(body).toContain('supersedes_offer_id: input.supersedesOfferId ?? null,')
  })
  it('updateEventTaskGroupOffer puede cambiarlo después, igual que cualquier otro campo del patch', () => {
    const body = fn(SRC, 'export async function updateEventTaskGroupOffer(')
    expect(body).toContain('if (patch.supersedesOfferId !== undefined) update.supersedes_offer_id = patch.supersedesOfferId')
  })
})
