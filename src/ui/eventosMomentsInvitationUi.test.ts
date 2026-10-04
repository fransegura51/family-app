import { describe, expect, it } from 'vitest'

// Eventos — Cierre de Fase 2: invitación compartida y RSVP público pasan a leer event_moments cuando el
// evento ya los tiene, sin tocar el comportamiento heredado cuando no. Mismo patrón estructural (sin
// jsdom) que el resto de *Ui.test.ts de este archivo.
const SRC = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function slice(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('InvitationModal — texto compartido moments-first con fallback heredado', () => {
  const fn = slice(SRC, "guest: EventGuest\n  onClose: () => void\n  onCreateInvitation: () => void\n}) {", '\nfunction ')

  it('carga event_moments y event_guest_moments al abrirse', () => {
    expect(fn).toContain('listEventMoments(event.id).then(setMoments)')
    expect(fn).toContain('listEventGuestMoments(event.id).then(setGuestMomentLinks)')
  })

  it('resuelve con resolveEventMoments/resolveGuestInvitedMoments (Fase 1) — nunca reimplementa la síntesis', () => {
    expect(fn).toContain('const resolvedMoments = resolveEventMoments(event, moments)')
    expect(fn).toContain('const guestMoments = resolveGuestInvitedMoments(guest, resolvedMoments, guestMomentLinks)')
  })

  it('infoLines y el texto a compartir usan momentsLocationLines/momentsLocationMapLines SOLO cuando hay momentos reales', () => {
    expect(fn).toContain('usingRealMoments ? momentsLocationLines(guestMoments, event.dateStatus) : eventLocationLines(event, guest)')
    expect(fn).toContain('usingRealMoments ? momentsLocationMapLines(guestMoments) : eventLocationMapLines(event, guest)')
  })
})

describe('EventOpenLinkBlock — enlace abierto, todos los momentos reales visibles (sin invitado concreto)', () => {
  const fn = slice(SRC, 'function EventOpenLinkBlock(', '\nfunction ')

  it('carga event_moments al abrirse', () => {
    expect(fn).toContain('listEventMoments(event.id).then(setMoments)')
  })

  it('handleShare usa momentsLocationMapLines cuando hay momentos reales, eventLocationMapLines si no', () => {
    const handleShare = slice(fn, 'async function handleShare()', '\n  }')
    expect(handleShare).toContain('hasRealMoments(resolvedMoments) ? momentsLocationMapLines(resolvedMoments) : eventLocationMapLines(event, { inviteScope: null })')
  })
})

describe('Ningún consumidor nuevo identifica un momento por su título literal (fuera de la rama de compatibilidad ya aprobada en Fase 1)', () => {
  it('momentsLocationLines/momentsLocationMapLines (domain/events.ts) no comparan m.title contra ningún valor fijo', () => {
    const DOMAIN = (import.meta.glob('/src/domain/events.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/domain/events.ts']
    const linesFn = slice(DOMAIN, 'export function momentsLocationLines(', '\n}')
    const mapLinesFn = slice(DOMAIN, 'export function momentsLocationMapLines(', '\n}')
    for (const fn of [linesFn, mapLinesFn]) {
      expect(fn).not.toMatch(/m\.title\s*===/)
    }
  })
})
