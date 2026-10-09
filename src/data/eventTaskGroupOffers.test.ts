import { describe, expect, it } from 'vitest'

// Parte B, Fase 6 — "ofertas" recibidas para un encargo, antes de contratar nada. Petición real: "una
// oferta de 150€, un contrato de 100€ y un pago parcial de 40€ NO son 290€ de gasto" — por eso
// event_task_group_offers es una tabla NUEVA, nunca event_payments ni event_budget_items, y seleccionar
// una oferta nunca crea un pago ni toca el presupuesto por sí sola.
const SRC = (import.meta.glob('/src/data/eventTaskGroups.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/data/eventTaskGroups.ts']
const MIG = (import.meta.glob('/supabase/migrations/0223_event_task_group_offers.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
  '/supabase/migrations/0223_event_task_group_offers.sql'
]

function fn(source: string, signature: string): string {
  const start = source.indexOf(signature)
  expect(start, `no se encontró "${signature}"`).toBeGreaterThan(-1)
  return source.slice(start, source.indexOf('\n}', start) + 2)
}

describe('migración 0223 — aditiva, RLS familiar, nunca event_payments/event_budget_items', () => {
  it('event_task_group_offers tiene RLS familiar, igual que el resto del módulo de Eventos', () => {
    expect(MIG).toContain('create table event_task_group_offers')
    expect(MIG).toContain('alter table event_task_group_offers enable row level security')
    expect(MIG).toContain("family_id = private.current_family_id() and private.has_section_access('eventos')")
  })
  it('status solo admite recibida/seleccionada/descartada, por defecto recibida', () => {
    expect(MIG).toContain("status text not null default 'recibida'")
    expect(MIG).toContain("check (status in ('recibida', 'seleccionada', 'descartada'))")
  })
  it('group_id es ON DELETE CASCADE (una oferta no tiene sentido sin su encargo) — nunca toca event_payments ni event_budget_items', () => {
    expect(MIG).toContain('group_id uuid not null references event_task_groups(id) on delete cascade')
    const code = MIG.split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n')
    expect(code).not.toMatch(/event_payments|event_budget_items/i)
  })
  it('bucket de storage propio con políticas por carpeta de familia, mismo patrón que event_food_documents (0192)', () => {
    expect(MIG).toContain("insert into storage.buckets (id, name, public)\nvalues ('event_task_group_offers', 'event_task_group_offers', false)")
    expect(MIG).toContain("bucket_id = 'event_task_group_offers' and (storage.foldername(name))[1] = private.current_family_id()::text")
  })
})

describe('data/eventTaskGroups.ts — CRUD de ofertas', () => {
  it('addEventTaskGroupOffer usa el family_id real del encargo (nunca inventado) y devuelve la oferta completa', () => {
    const body = fn(SRC, 'export async function addEventTaskGroupOffer(')
    expect(body).toContain("from('event_task_groups').select('family_id, event_id')")
    expect(body).toContain('family_id: group.family_id')
    expect(body).toContain('.select(OFFER_SELECT)')
    expect(body).toContain('return mapOffer(data)')
  })
  // Fase 5 (migración 0225, Parte B1) — además de group_id, guarda el event_id real del encargo (puente
  // no destructivo): sigue sin inventar nada, lo lee del propio grupo, nunca de otra parte.
  it('addEventTaskGroupOffer guarda también event_id (el del encargo), para que el puente de la Fase 5 no quede vacío en las ofertas nuevas', () => {
    const body = fn(SRC, 'export async function addEventTaskGroupOffer(')
    expect(body).toContain('event_id: group.event_id,')
  })
  it('updateEventTaskGroupOffer solo actualiza los campos presentes en el patch (nunca pisa el resto con null)', () => {
    const body = fn(SRC, 'export async function updateEventTaskGroupOffer(')
    expect(body).toContain('if (patch.providerName !== undefined)')
    expect(body).toContain('if (patch.amount !== undefined)')
  })
})

describe('data/eventTaskGroups.ts — seleccionar una oferta nunca es pagarla', () => {
  it('selectEventTaskGroupOffer NUNCA llama a addEventPayment ni a updateEventBudgetItem/addEventBudgetItem', () => {
    const body = fn(SRC, 'export async function selectEventTaskGroupOffer(')
    expect(body).not.toContain('addEventPayment')
    expect(body).not.toContain('BudgetItem')
    expect(body).not.toContain('resolveEventTaskGroup')
  })
  it('selectEventTaskGroupOffer revierte cualquier otra "seleccionada" del mismo encargo a "recibida" antes de marcar la nueva — a lo sumo una seleccionada a la vez', () => {
    const body = fn(SRC, 'export async function selectEventTaskGroupOffer(')
    expect(body).toContain(".update({ status: 'recibida' })")
    expect(body.indexOf(".update({ status: 'recibida' })")).toBeLessThan(body.indexOf(".update({ status: 'seleccionada' })"))
  })
})

describe('data/eventTaskGroups.ts — adjunto: nunca se sube antes de que la oferta exista, nunca deja huérfanos', () => {
  it('saveEventTaskGroupOfferAttachment sube el archivo y ACTUALIZA una oferta ya creada (no la crea)', () => {
    const body = fn(SRC, 'export async function saveEventTaskGroupOfferAttachment(')
    expect(body).toContain("from('event_task_group_offers')\n    .update({")
    expect(body).not.toContain('.insert(')
  })
  it('si falla el UPDATE, borra el archivo recién subido (nunca deja un archivo huérfano en storage)', () => {
    const body = fn(SRC, 'export async function saveEventTaskGroupOfferAttachment(')
    expect(body).toContain('if (error) {')
    const errorBlock = body.slice(body.indexOf('if (error) {'), body.indexOf('throw error'))
    expect(errorBlock).toContain("storage.from('event_task_group_offers').remove([path])")
  })
  it('al reemplazar un adjunto, borra el archivo ANTERIOR del storage tras guardar el nuevo', () => {
    const body = fn(SRC, 'export async function saveEventTaskGroupOfferAttachment(')
    expect(body).toContain('if (offer.attachmentStoragePath) {')
    expect(body).toContain("storage.from('event_task_group_offers').remove([offer.attachmentStoragePath])")
  })
  it('deleteEventTaskGroupOffer borra también su adjunto del storage, si tenía uno', () => {
    const body = fn(SRC, 'export async function deleteEventTaskGroupOffer(')
    expect(body).toContain("from('event_task_group_offers').delete()")
    expect(body).toContain('if (offer.attachmentStoragePath) {')
  })
})
