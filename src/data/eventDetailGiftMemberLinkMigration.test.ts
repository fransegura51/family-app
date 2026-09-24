import { describe, expect, it } from 'vitest'

// Eventos Fase 14D — vínculo OPCIONAL a una persona concreta
// (event_guest_members, Fase 14A/14B) desde Detalles para personas
// (event_special_details) y Regalos recibidos (event_gifts_received).
// Sin guest_id redundante (se deriva vía member_id si algún día hace
// falta); sin backfill; recipient_name/guest_name (texto libre) NUNCA
// se tocan ni se sustituyen por un JOIN.
//
// La RLS "hardened" (member_id debe pertenecer a la misma familia Y
// al mismo evento) se verificó EN VIVO contra producción
// (objhgjgrinbhyzscjlbw) con un rehearsal BEGIN/ROLLBACK simulando un
// usuario real de Familia Hepburn (profile 93b0ce0e-...): detalle/
// regalo válidos con member_id correcto OK, member_id de otro evento
// de la misma familia rechazado, member_id de otra familia (Familia
// Demo) rechazado, borrar la persona deja member_id en null y
// conserva el texto histórico (recipient_name intacto), y los 3
// invitados reales de "Bodas de plata" quedaron intactos. No se
// modificó ningún dato real.
const FILES = import.meta.glob(
  ['/supabase/migrations/0165_event_detail_gift_member_link.sql', '/supabase/rollbacks/0165_event_detail_gift_member_link_down.sql'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>
const MIGRATION = FILES['/supabase/migrations/0165_event_detail_gift_member_link.sql']
const ROLLBACK = FILES['/supabase/rollbacks/0165_event_detail_gift_member_link_down.sql']

describe('0165 — esquema: member_id en event_special_details (TEST 1) y event_gifts_received (TEST 2)', () => {
  it('event_special_details.member_id es nullable, FK a event_guest_members, on delete set null', () => {
    expect(MIGRATION).toContain('alter table event_special_details add column member_id uuid references event_guest_members(id) on delete set null')
  })

  it('event_gifts_received.member_id es nullable, FK a event_guest_members, on delete set null', () => {
    expect(MIGRATION).toContain('alter table event_gifts_received add column member_id uuid references event_guest_members(id) on delete set null')
  })

  it('tiene índices para member_id en las dos tablas', () => {
    expect(MIGRATION).toContain('create index idx_event_special_details_member on event_special_details(member_id)')
    expect(MIGRATION).toContain('create index idx_event_gifts_received_member on event_gifts_received(member_id)')
  })
})

describe('0165 — sin guest_id redundante (TEST 3)', () => {
  it('no añade ninguna columna guest_id (se deriva vía member_id si hiciera falta, igual que se documenta)', () => {
    expect(MIGRATION).not.toMatch(/add column guest_id/)
  })
})

describe('0165 — RLS hardened en las dos tablas (TEST 4, TEST 5: cross-evento/cross-familia rechazados)', () => {
  it('event_special_details: member_id, cuando no es null, debe pertenecer a la misma familia y al mismo evento', () => {
    const start = MIGRATION.indexOf('create policy "event_special_details: family crud"')
    const body = MIGRATION.slice(start, MIGRATION.indexOf('event_gifts_received', start))
    expect(body).toContain('member_id is null')
    expect(body).toContain('m.family_id = private.current_family_id() and m.event_id = event_special_details.event_id')
  })

  it('event_gifts_received: member_id, cuando no es null, debe pertenecer a la misma familia y al mismo evento', () => {
    const start = MIGRATION.lastIndexOf('create policy "event_gifts_received: family crud"')
    const body = MIGRATION.slice(start)
    expect(body).toContain('member_id is null')
    expect(body).toContain('m.family_id = private.current_family_id() and m.event_id = event_gifts_received.event_id')
  })

  it('sigue exigiendo has_section_access(\'eventos\') en ambas políticas endurecidas, sin quitar nada de lo que ya había', () => {
    expect(MIGRATION).toContain('using (family_id = private.current_family_id() and private.has_section_access(\'eventos\'))')
  })
})

describe('0165 — sin backfill (TEST 6)', () => {
  it('la migración no actualiza ninguna fila existente (solo ALTER TABLE / CREATE INDEX / DROP+CREATE POLICY)', () => {
    expect(MIGRATION).not.toMatch(/\bupdate\s+event_special_details\b/i)
    expect(MIGRATION).not.toMatch(/\bupdate\s+event_gifts_received\b/i)
  })
})

describe('0165 — rollback', () => {
  it('restaura las políticas simples y elimina member_id, sin borrar ningún detalle/regalo', () => {
    expect(ROLLBACK).toContain('alter table event_special_details drop column if exists member_id')
    expect(ROLLBACK).toContain('alter table event_gifts_received drop column if exists member_id')
    expect(ROLLBACK).not.toMatch(/\bdelete from\b|\btruncate\b/i)
  })
})

const APP = import.meta.glob('/src/data/events.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const SRC = APP['/src/data/events.ts']

describe('capa de datos — event_special_details: recipientName se conserva tal cual (TEST 7)', () => {
  it('SPECIAL_DETAIL_SELECT incluye member_id, y mapSpecialDetail lo mapea sin tocar recipient_name', () => {
    expect(SRC).toContain(
      "const SPECIAL_DETAIL_SELECT = 'id, event_id, family_id, recipient_name, relationship, detail, budget, status, delivery_note, notes, member_id, created_at'",
    )
    const body = SRC.slice(SRC.indexOf('function mapSpecialDetail'), SRC.indexOf('export async function listEventSpecialDetails'))
    expect(body).toContain('recipientName: r.recipient_name,')
    expect(body).toContain('memberId: r.member_id,')
  })

  it('addEventSpecialDetail acepta memberId opcional, sin exigirlo nunca', () => {
    const body = SRC.slice(SRC.indexOf('export async function addEventSpecialDetail'), SRC.indexOf('export async function updateEventSpecialDetail'))
    expect(body).toContain('memberId?: string | null')
    expect(body).toContain('member_id: input.memberId ?? null')
  })

  it('member_id nunca se auto-sincroniza después del alta (TEST 17): updateEventSpecialDetail solo toca status', () => {
    const body = SRC.slice(SRC.indexOf('export async function updateEventSpecialDetail'), SRC.indexOf('export async function deleteEventSpecialDetail'))
    expect(body).not.toContain('member_id')
  })
})

describe('capa de datos — event_gifts_received: guestName se conserva tal cual (TEST 8), regalos de varias personas en texto libre (TEST 12)', () => {
  it('GIFT_SELECT incluye member_id, y mapGiftReceived lo mapea sin tocar guest_name', () => {
    expect(SRC).toContain("const GIFT_SELECT = 'id, event_id, family_id, guest_name, gift_description, cash_amount, note, member_id, created_at'")
    const body = SRC.slice(SRC.indexOf('function mapGiftReceived'), SRC.indexOf('export async function listEventGifts'))
    expect(body).toContain('guestName: r.guest_name,')
    expect(body).toContain('memberId: r.member_id,')
  })

  it('addEventGift acepta memberId opcional; member_id es un único uuid nullable, nunca un array (sin N:M)', () => {
    const body = SRC.slice(SRC.indexOf('export async function addEventGift'), SRC.indexOf('export async function deleteEventGift'))
    expect(body).toContain('memberId?: string | null')
    expect(body).toContain('member_id: input.memberId ?? null')
    expect(body).not.toMatch(/memberIds|member_ids/)
  })

  it('no existe ninguna función updateEventGift que pueda re-sincronizar member_id tras la creación', () => {
    expect(SRC).not.toContain('export async function updateEventGift(')
  })
})

describe('lo que esta fase NO toca (TEST 15, TEST 16)', () => {
  it('event_favor_items (recuerdos por tipo, no por persona) sigue exactamente igual, sin member_id', () => {
    const body = SRC.slice(SRC.indexOf('export async function addEventFavorItem'), SRC.indexOf('export async function updateEventFavorItem') + 500)
    expect(body).not.toContain('member_id')
  })

  it('Economía (finance.ts) no se ha tocado en esta fase', () => {
    const FINANCE = (import.meta.glob('/src/data/finance.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/data/finance.ts']
    expect(FINANCE).not.toContain('event_guest_members')
    expect(FINANCE).not.toContain('event_special_details')
    expect(FINANCE).not.toContain('event_gifts_received')
  })
})
