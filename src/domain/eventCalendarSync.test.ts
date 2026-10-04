import { describe, expect, it } from 'vitest'
import { calendarEntryFor, calendarRowMatches, planCalendarSync } from '@/domain/eventCalendarSync'

describe('calendarEntryFor — la hora llega como «HH:MM:SS» y nunca produce una marca de tiempo inválida', () => {
  it('«HH:MM:SS» y «HH:MM» dan exactamente el mismo instante (el bug era «17:00:00» + «:00»)', () => {
    const a = calendarEntryFor('2027-02-20', '17:00:00')
    const b = calendarEntryFor('2027-02-20', '17:00')
    expect(a).toEqual(b)
    expect(a.allDay).toBe(false)
    expect(Number.isNaN(new Date(a.startAt).getTime())).toBe(false)
    expect(a.startAt).toBe(new Date('2027-02-20T17:00:00').toISOString())
    expect(a.startAt).not.toMatch(/:\d{2}:\d{2}:\d{2}:/)
  })
  it('sin hora = todo el día, a medianoche UTC (como ya estaban guardados los compromisos de Eventos)', () => {
    expect(calendarEntryFor('2027-02-20', null)).toEqual({ startAt: '2027-02-20T00:00:00.000Z', allDay: true })
  })
})

describe('calendarRowMatches — compara instantes, no textos', () => {
  const event = { title: 'Cumple', eventDate: '2027-02-20', eventTime: '17:00:00', venueLabel: null }
  const row = { start_at: new Date('2027-02-20T17:00:00').toISOString(), all_day: false, title: 'Cumple', location_label: null }
  it('mismo instante en otro formato de texto = igual', () => {
    expect(calendarRowMatches(row, event)).toBe(true)
    expect(calendarRowMatches({ ...row, start_at: row.start_at.replace('T', ' ').replace('.000Z', '+00') }, event)).toBe(true)
  })
  it('hora, día, título, lugar o «todo el día» distintos = hay que actualizar', () => {
    expect(calendarRowMatches({ ...row, start_at: new Date('2027-02-20T18:00:00').toISOString() }, event)).toBe(false)
    expect(calendarRowMatches({ ...row, start_at: new Date('2027-02-21T17:00:00').toISOString() }, event)).toBe(false)
    expect(calendarRowMatches({ ...row, title: 'Otro' }, event)).toBe(false)
    expect(calendarRowMatches({ ...row, location_label: 'Casa' }, event)).toBe(false)
    expect(calendarRowMatches({ ...row, all_day: true }, event)).toBe(false)
  })
  it('un compromiso de todo el día ya guardado (medianoche UTC) coincide con un evento sin hora', () => {
    expect(calendarRowMatches({ start_at: '2027-02-20 00:00:00+00', all_day: true, title: 'Cumple', location_label: null }, { ...event, eventTime: null })).toBe(true)
  })
})

describe('planCalendarSync — qué hacer en el Calendario', () => {
  const base = { archived: false, eventDate: '2027-02-20', dateStatus: 'confirmada' as const, linkedId: null, rowState: null }
  it('Confirmada sin entrada: crear. Provisional sin entrada: nada (no se apunta una fecha sin cerrar)', () => {
    expect(planCalendarSync(base)).toBe('create')
    expect(planCalendarSync({ ...base, dateStatus: 'provisional' })).toBe('none')
  })
  it('con entrada igual: nada (cambiar solo Provisional ↔ Confirmada no escribe); distinta: actualizar, también en Provisional', () => {
    expect(planCalendarSync({ ...base, linkedId: 'c', rowState: 'matches' })).toBe('none')
    expect(planCalendarSync({ ...base, dateStatus: 'provisional', linkedId: 'c', rowState: 'matches' })).toBe('none')
    expect(planCalendarSync({ ...base, linkedId: 'c', rowState: 'differs' })).toBe('update')
    expect(planCalendarSync({ ...base, dateStatus: 'provisional', linkedId: 'c', rowState: 'differs' })).toBe('update')
  })
  it('enlace colgando: Confirmada la recrea; Provisional solo limpia el enlace', () => {
    expect(planCalendarSync({ ...base, linkedId: 'c', rowState: 'missing' })).toBe('create')
    expect(planCalendarSync({ ...base, dateStatus: 'provisional', linkedId: 'c', rowState: 'missing' })).toBe('clear_link')
  })
  it('sin fecha: quitar la entrada si existe; limpiar el enlace si estaba colgando; nada si no había', () => {
    const none = { ...base, eventDate: null, dateStatus: 'pendiente' as const }
    expect(planCalendarSync(none)).toBe('none')
    expect(planCalendarSync({ ...none, linkedId: 'c', rowState: 'matches' })).toBe('remove')
    expect(planCalendarSync({ ...none, linkedId: 'c', rowState: 'differs' })).toBe('remove')
    expect(planCalendarSync({ ...none, linkedId: 'c', rowState: 'missing' })).toBe('clear_link')
  })
  it('un evento archivado nunca toca el Calendario', () => {
    expect(planCalendarSync({ ...base, archived: true })).toBe('none')
    expect(planCalendarSync({ ...base, archived: true, eventDate: null, dateStatus: 'pendiente', linkedId: 'c', rowState: 'matches' })).toBe('none')
  })
})
