import { describe, expect, it } from 'vitest'

// Eventos Fase 14D — UX: selector opcional de persona en los
// formularios de Detalles (personas especiales) y Regalos recibidos,
// sobre el vínculo member_id de la migración 0165. Las pruebas del
// esquema/RLS/capa de datos viven en
// src/data/eventDetailGiftMemberLinkMigration.test.ts; aquí solo se
// comprueba el cableado de la UI.
const APP = import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const SRC = APP['/src/ui/EventosScreen.tsx']

function window(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('Fase 14D — Detalles: selector opcional de persona (TEST: UX Detalles selector opcional)', () => {
  const modal = window(SRC, 'function AddSpecialDetailModal', '\nfunction GiftsSection')

  it('el selector solo aparece si hay personas desglosadas en el evento (members.length > 0)', () => {
    expect(modal).toContain('{members.length > 0 && (')
  })

  it('addEventSpecialDetail recibe memberId (o null si no se elige ninguno), sin tocar recipientName', () => {
    const body = window(modal, 'async function handleSubmit', 'return (')
    expect(body).toContain('await addEventSpecialDetail(eventId, { recipientName, relationship: relationship || null, detail: detail || null, memberId: memberId || null })')
  })

  it('DetailsSection carga los miembros del evento (listEventGuestMembersForEvent) y los pasa al modal', () => {
    const section = window(SRC, 'function DetailsSection', 'function AddFavorModal')
    expect(section).toContain('listEventGuestMembersForEvent(eventId)')
    expect(section).toContain('<AddSpecialDetailModal')
    expect(section).toContain('members={members}')
  })
})

describe('Fase 14D — Regalos: selector opcional de persona (TEST: UX Regalos selector opcional)', () => {
  const modal = window(SRC, 'function AddGiftModal', '\n// ---------------------------------------------------------------------\n// Fase 3 — Plan del día')

  it('el selector solo aparece si hay personas desglosadas en el evento (members.length > 0)', () => {
    expect(modal).toContain('{members.length > 0 && (')
  })

  it('addEventGift recibe memberId (o null si no se elige ninguno), sin tocar guestName', () => {
    const body = window(modal, 'async function handleSubmit', 'return (')
    expect(body).toContain('guestName,')
    expect(body).toContain('memberId: memberId || null,')
  })

  it('GiftsSection carga los miembros del evento y los pasa al modal', () => {
    const section = window(SRC, 'function GiftsSection', 'function AddGiftModal')
    expect(section).toContain('listEventGuestMembersForEvent(eventId)')
    expect(section).toContain('<AddGiftModal')
    expect(section).toContain('members={members}')
  })
})

describe('Fase 14D — el nombre vinculado se muestra como añadido, nunca sustituye al texto libre', () => {
  it('la fila de un detalle especial sigue mostrando recipientName primero; el nombre de la persona vinculada es un añadido opcional al final', () => {
    const row = window(SRC, '{s.recipientName}', 'ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Borrar" onConfirm={() => deleteEventSpecialDetail')
    expect(row).toContain('{s.recipientName}')
    expect(row).toContain('memberName(s.memberId)')
  })

  it('la fila de un regalo sigue mostrando guestName primero; el nombre de la persona vinculada es un añadido opcional al final', () => {
    const row = window(SRC, '{g.guestName}', 'ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Borrar" onConfirm={() => deleteEventGift')
    expect(row).toContain('{g.guestName}')
    expect(row).toContain('memberName(g.memberId)')
  })
})

describe('Fase 14D — RSVP público sigue sin mencionar Detalles/Regalos ni sus personas', () => {
  it('event-rsvp (Edge Function) no consulta event_special_details ni event_gifts_received', () => {
    const rsvpFn = (import.meta.glob('/supabase/functions/event-rsvp/index.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
      '/supabase/functions/event-rsvp/index.ts'
    ]
    expect(rsvpFn).not.toContain('event_special_details')
    expect(rsvpFn).not.toContain('event_gifts_received')
  })
})
