import { describe, expect, it } from 'vitest'

// Validación real en iPhone — RSVP público: "Nota (alergia, algún comentario...)" se guardaba y confirmaba
// bien (EventGuest.rsvpNote, ver data/events.ts:762/806/821), pero no había dónde consultarla en la ficha
// del invitado (Invitados, dentro de Eventos). Auditoría del dato completo (RSVP público → RPC/función →
// tabla → lectura del invitado) confirmó hipótesis A: se guarda correctamente, solo faltaba pintarla — no
// se toca ningún modelo ni persistencia aquí, solo la UI de Invitados.
const SRC = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function slice(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('Ficha de invitado (Invitados) — la nota RSVP del invitado se muestra cuando existe', () => {
  const cardBlock = slice(SRC, '{visibleGuests.map((g) => (', '{guests.length === 0 &&')

  it('usa el mismo campo que ya persiste el RSVP público (g.rsvpNote) — no un campo nuevo ni duplicado', () => {
    expect(cardBlock).toContain('{g.rsvpNote && (')
    expect(cardBlock).toContain('📝 Nota: {g.rsvpNote}')
  })

  it('sin nota, no ocupa hueco — el bloque completo depende de que exista de verdad', () => {
    const noteBlock = slice(cardBlock, '{g.rsvpNote && (', ')}')
    expect(noteBlock).not.toContain('Sin nota')
    expect(noteBlock).not.toContain("g.rsvpNote ??")
  })

  it('no la clasifica como "alergia" a la fuerza — se muestra el texto tal cual, puede ser cualquier comentario', () => {
    const noteBlock = slice(cardBlock, '{g.rsvpNote && (', ')}')
    expect(noteBlock).not.toMatch(/alergia:/i)
    expect(noteBlock).toContain('{g.rsvpNote}')
  })

  it('sigue siendo distinta de las notas privadas del organizador (g.notes, ya mostradas en la línea de arriba) — dos campos, dos orígenes, sin mezclarse', () => {
    expect(cardBlock).toContain("{g.notes ? ` · ${g.notes}` : ''}")
    expect(cardBlock.indexOf('g.notes')).toBeLessThan(cardBlock.indexOf('g.rsvpNote'))
  })
})
