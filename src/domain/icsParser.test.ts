import { describe, expect, it } from 'vitest'
import { parseIcs } from '@/domain/icsParser'

const ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:evt-1@example.com',
  'SUMMARY:Cita dentista\\, revisión',
  'DTSTART:20260914T180000Z',
  'DTEND:20260914T190000Z',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:evt-2@example.com',
  'SUMMARY:Cumpleaños de la abuela con un título muy largo que Google',
  '  Calendar pliega en dos líneas físicas',
  'DTSTART;VALUE=DATE:20260920',
  'DTEND;VALUE=DATE:20260921',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:evt-3@example.com',
  'SUMMARY:Natación',
  'DTSTART;TZID=Europe/Madrid:20260915T170000',
  'RRULE:FREQ=WEEKLY;BYDAY=TU,TH;INTERVAL=2;UNTIL=20261231T225959Z;COUNT=40',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:evt-4@example.com',
  'SUMMARY:Cada hora (no soportado)',
  'DTSTART:20260914T080000Z',
  'RRULE:FREQ=HOURLY;INTERVAL=2',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'SUMMARY:Sin fecha de inicio',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART:20260918T100000Z',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n')

describe('parseIcs', () => {
  const events = parseIcs(ICS)

  it('lee los eventos válidos y descarta los que no tienen DTSTART', () => {
    expect(events.map((e) => e.uid)).toEqual(['evt-1@example.com', 'evt-2@example.com', 'evt-3@example.com', 'evt-4@example.com', expect.any(String)])
  })

  it('evento con hora en UTC: ISO exacto, no es de todo el día, y desescapa la coma', () => {
    const e = events[0]
    expect(e.title).toBe('Cita dentista, revisión')
    expect(e.startAt).toBe('2026-09-14T18:00:00.000Z')
    expect(e.endAt).toBe('2026-09-14T19:00:00.000Z')
    expect(e.allDay).toBe(false)
    expect(e.recurrenceRule).toBeNull()
  })

  it('línea plegada unida, y VALUE=DATE es de todo el día en fecha LOCAL', () => {
    const e = events[1]
    expect(e.title).toBe('Cumpleaños de la abuela con un título muy largo que Google Calendar pliega en dos líneas físicas')
    expect(e.allDay).toBe(true)
    const d = new Date(e.startAt)
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2026, 9, 20])
  })

  it('hora flotante (con TZID) se toma como hora local; RRULE se normaliza al formato propio', () => {
    const e = events[2]
    expect(new Date(e.startAt).getHours()).toBe(17)
    // UNTIL solo con fecha; COUNT se ignora a propósito.
    expect(e.recurrenceRule).toBe('FREQ=WEEKLY;BYDAY=TU,TH;INTERVAL=2;UNTIL=2026-12-31')
  })

  it('un FREQ que el calendario propio no sabe expandir se descarta (evento suelto)', () => {
    expect(events[3].recurrenceRule).toBeNull()
  })

  it('sin UID se inventa uno; sin SUMMARY, "(sin título)"', () => {
    const e = events[4]
    expect(e.uid).toMatch(/[0-9a-f-]{36}/)
    expect(e.title).toBe('(sin título)')
  })

  it('texto vacío o sin eventos: lista vacía, sin fallar', () => {
    expect(parseIcs('')).toEqual([])
    expect(parseIcs('BEGIN:VCALENDAR\nEND:VCALENDAR')).toEqual([])
  })
})
