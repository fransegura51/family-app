// Formato de fechas que ve la persona (España): DD/MM/AAAA. Solo presentación; lo guardado sigue siendo ISO.
import { describe, expect, it } from 'vitest'
import { formatDate, formatDateFromTimestamp, formatDateRange, formatDateTime, formatTime } from '@/domain/dateFormat'

describe('formatDate (fechas de calendario, sin hora)', () => {
  it('2026-10-16 → 16/10/2026, con ceros a la izquierda', () => {
    expect(formatDate('2026-10-16')).toBe('16/10/2026')
    expect(formatDate('2026-03-05')).toBe('05/03/2026')
  })

  it('NO se desplaza de día aunque la zona horaria sea cualquiera (se trocea como texto, nunca pasa por Date)', () => {
    const previous = process.env.TZ
    for (const tz of ['Pacific/Kiritimati', 'America/Los_Angeles', 'Europe/Madrid', 'UTC']) {
      process.env.TZ = tz
      expect(formatDate('2026-01-01')).toBe('01/01/2026')
      expect(formatDate('2026-12-31')).toBe('31/12/2026')
    }
    process.env.TZ = previous
  })

  it('vacío o sin valor sigue vacío (o el texto orientativo que se indique); nunca inventa una fecha', () => {
    expect(formatDate(null)).toBe('')
    expect(formatDate(undefined)).toBe('')
    expect(formatDate('')).toBe('')
    expect(formatDate(null, 'Sin fecha')).toBe('Sin fecha')
  })

  it('lo que no es una fecha ISO se devuelve tal cual (no aparece «NaN/NaN» ni «Invalid Date»)', () => {
    expect(formatDate('mañana')).toBe('mañana')
    expect(formatDate('16/10/2026')).toBe('16/10/2026')
  })

  it('un timestamp ISO usado solo por su día enseña ese día', () => {
    expect(formatDate('2026-10-16T18:30:00')).toBe('16/10/2026')
  })
})

describe('formatDateTime / formatTime / formatDateFromTimestamp (marcas de tiempo)', () => {
  it('Europe/Madrid en horario de verano (UTC+2) y de invierno (UTC+1)', () => {
    expect(formatDateTime('2026-10-16T16:30:00Z', 'Europe/Madrid')).toBe('16/10/2026 18:30')
    expect(formatDateTime('2026-12-16T16:30:00Z', 'Europe/Madrid')).toBe('16/12/2026 17:30')
  })

  it('el día del cambio de hora: 25/10/2026 (fin del horario de verano) y 29/03/2026 (inicio)', () => {
    expect(formatDateTime('2026-10-25T00:30:00Z', 'Europe/Madrid')).toBe('25/10/2026 02:30')
    expect(formatDateTime('2026-10-25T02:30:00Z', 'Europe/Madrid')).toBe('25/10/2026 03:30')
    expect(formatDateTime('2026-03-29T00:30:00Z', 'Europe/Madrid')).toBe('29/03/2026 01:30')
    expect(formatDateTime('2026-03-29T01:30:00Z', 'Europe/Madrid')).toBe('29/03/2026 03:30')
  })

  it('medianoche se escribe 00:xx (24 h), nunca 24:xx; y el día cambia según la zona', () => {
    expect(formatDateTime('2026-10-15T22:05:00Z', 'Europe/Madrid')).toBe('16/10/2026 00:05')
    expect(formatTime('2026-10-15T22:05:00Z', 'Europe/Madrid')).toBe('00:05')
    expect(formatDateFromTimestamp('2026-10-15T22:05:00Z', 'Europe/Madrid')).toBe('16/10/2026')
    expect(formatDateFromTimestamp('2026-10-15T22:05:00Z', 'UTC')).toBe('15/10/2026')
  })

  it('sin valor o valor inválido: vacío, nunca «Invalid Date»', () => {
    expect(formatDateTime(null)).toBe('')
    expect(formatDateTime('no es fecha')).toBe('')
    expect(formatTime(undefined)).toBe('')
    expect(formatDateTime(null, undefined, '—')).toBe('—')
  })
})

describe('formatDateRange', () => {
  it('escribe las dos fechas en español', () => {
    expect(formatDateRange('2026-10-01', '2026-10-16')).toBe('01/10/2026 – 16/10/2026')
  })
})
