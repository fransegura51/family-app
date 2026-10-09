import { describe, expect, it } from 'vitest'

// PEPA Eventos, prompt maestro — Parte B1 (Fase 5): ofertas INDEPENDIENTES de los encargos (migración
// 0225). Hasta ahora una oferta exigía un encargo (group_id not null, migración 0223); ahora puede
// registrarse desde el registro global de proveedores (sin evento), desde Proveedores de un evento (con
// evento, sin encargo todavía) o desde un encargo concreto (como siempre). Vincularla a un encargo más
// tarde es SIEMPRE una acción explícita (linkLooseTaskGroupOfferToGroup), nunca automática.
const SRC = (import.meta.glob('/src/data/eventTaskGroups.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/data/eventTaskGroups.ts']
const MIG = (import.meta.glob('/supabase/migrations/0225_event_task_group_offers_decoupled.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
  '/supabase/migrations/0225_event_task_group_offers_decoupled.sql'
]

function fn(source: string, signature: string): string {
  const start = source.indexOf(signature)
  expect(start, `no se encontró "${signature}"`).toBeGreaterThan(-1)
  return source.slice(start, source.indexOf('\n}', start) + 2)
}

describe('migración 0225 — aditiva, group_id pasa a nullable sin tocar el significado de provider_id', () => {
  it('group_id pierde el not null (ya no exige encargo)', () => {
    expect(MIG).toContain('alter table event_task_group_offers alter column group_id drop not null')
  })
  it('event_id y global_provider_id son columnas NUEVAS, nullable — nunca se repurpone provider_id ni group_id', () => {
    expect(MIG).toContain('add column event_id uuid null references events(id) on delete cascade')
    expect(MIG).toContain('add column global_provider_id uuid null references providers_global(id) on delete set null')
    expect(MIG).not.toMatch(/alter column provider_id/)
  })
  it('el backfill de event_id viene SOLO del group_id ya existente (nunca se inventa un evento)', () => {
    expect(MIG).toContain('set event_id = g.event_id')
    expect(MIG).toContain('from event_task_groups g')
    expect(MIG).toContain('where o.group_id = g.id and o.event_id is null')
  })
  it('el backfill de global_provider_id viene SOLO del vínculo global ya existente del proveedor (nunca se fusiona por nombre)', () => {
    expect(MIG).toContain('set global_provider_id = ep.global_provider_id')
    expect(MIG).toContain('from event_providers ep')
    expect(MIG).toContain('where o.provider_id = ep.id and ep.global_provider_id is not null and o.global_provider_id is null')
  })
  it('la RLS cubre los 3 casos (con encargo / con evento sin encargo / suelta sin ninguno) sin debilitar el aislamiento familiar', () => {
    expect(MIG).toContain('family_id = private.current_family_id()')
    expect(MIG).toContain("group_id is not null and exists (select 1 from event_task_groups g where g.id = group_id and g.family_id = private.current_family_id())")
    expect(MIG).toContain("group_id is null and event_id is not null and exists (select 1 from events e where e.id = event_id and e.family_id = private.current_family_id())")
    expect(MIG).toContain('group_id is null and event_id is null')
  })
})

describe('addEventTaskGroupOffer — sigue exigiendo un encargo, pero ahora también guarda su event_id (puente)', () => {
  it('lee family_id Y event_id del grupo (nunca inventa el evento)', () => {
    const body = fn(SRC, 'export async function addEventTaskGroupOffer(')
    expect(body).toContain("from('event_task_groups').select('family_id, event_id')")
    expect(body).toContain('event_id: group.event_id,')
  })
})

describe('addLooseTaskGroupOffer — oferta suelta, group_id SIEMPRE null', () => {
  it('nunca pone group_id', () => {
    const body = fn(SRC, 'export async function addLooseTaskGroupOffer(')
    expect(body).toContain('group_id: null,')
  })
  it('con evento, el family_id es el del evento (consistente con el resto del módulo, nunca inventado)', () => {
    const body = fn(SRC, 'export async function addLooseTaskGroupOffer(')
    expect(body).toContain("from('events').select('family_id')")
  })
  it('sin evento (oferta puramente global), usa la familia actual en vez de inventar un evento', () => {
    const body = fn(SRC, 'export async function addLooseTaskGroupOffer(')
    expect(body).toContain('resolvedFamilyId = await currentFamilyId()')
  })
  it('guarda global_provider_id tal cual lo pide el llamador — nunca lo adivina ni lo deja vacío', () => {
    const body = fn(SRC, 'export async function addLooseTaskGroupOffer(')
    expect(body).toContain('global_provider_id: input.globalProviderId,')
  })
})

describe('listLooseOffersForProvider — nunca mezcla ofertas ya vinculadas a un encargo', () => {
  it('siempre filtra group_id null', () => {
    const body = fn(SRC, 'export async function listLooseOffersForProvider(')
    expect(body).toContain(".is('group_id', null)")
  })
  it('con eventId, se queda solo con las de ese evento; sin eventId, solo con las puramente globales (sin evento)', () => {
    const body = fn(SRC, 'export async function listLooseOffersForProvider(')
    expect(body).toContain("query.eq('event_id', eventId)")
    expect(body).toContain("query.is('event_id', null)")
  })
})

describe('listLooseOffersForEvent — todas las sueltas del evento, para poder vincularlas desde un encargo', () => {
  it('filtra por event_id y group_id null, de cualquier proveedor', () => {
    const body = fn(SRC, 'export async function listLooseOffersForEvent(')
    expect(body).toContain(".eq('event_id', eventId).is('group_id', null)")
  })
})

describe('linkLooseTaskGroupOfferToGroup — vincular es la ÚNICA puerta de "suelta" a "del encargo", y es explícita', () => {
  it('solo actualiza group_id/event_id de la propia oferta — nunca toca amount/status ni crea un pago', () => {
    const body = fn(SRC, 'export async function linkLooseTaskGroupOfferToGroup(')
    expect(body).toContain('.update({ group_id: groupId, event_id: offer.eventId ?? group.event_id })')
    expect(body).not.toMatch(/amount|status:|event_payments|resolveEventTaskGroup/)
  })
  it('si la oferta no tenía evento (suelta puramente global), toma el del encargo al vincularla — nunca se inventa otro', () => {
    const body = fn(SRC, 'export async function linkLooseTaskGroupOfferToGroup(')
    expect(body).toContain("from('event_task_groups').select('event_id').eq('id', groupId).single()")
  })
})

describe('saveEventTaskGroupOfferAttachment — sigue funcionando con group_id null (oferta suelta)', () => {
  it('la ruta de storage nunca queda con el literal "null" cuando no hay encargo', () => {
    const body = fn(SRC, 'export async function saveEventTaskGroupOfferAttachment(')
    expect(body).toContain("offer.groupId ?? offer.eventId ?? 'global'")
  })
})
