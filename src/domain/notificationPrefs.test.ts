// Ajustes de avisos por persona: valores por defecto, validación de horas y zonas.
import { describe, expect, it } from 'vitest'
import { DEFAULT_NOTIFICATION_PREFS, detectDeviceTimezone, isValidTime, isValidTimezone, listTimezones, timezoneLabel } from '@/domain/notificationPrefs'

describe('valores por defecto', () => {
  it('quien ya existe empieza en Europe/Madrid, resumen activado a las 08:00', () => {
    expect(DEFAULT_NOTIFICATION_PREFS.timezone).toBe('Europe/Madrid')
    expect(DEFAULT_NOTIFICATION_PREFS.dailySummaryEnabled).toBe(true)
    expect(DEFAULT_NOTIFICATION_PREFS.dailySummaryTime).toBe('08:00')
  })
  it('los avisos personales de Comunidad empiezan «a cualquier hora»', () => {
    expect(DEFAULT_NOTIFICATION_PREFS.personalCommunityMode).toBe('any')
  })
})

describe('horas y zonas', () => {
  it('hora válida HH:MM', () => {
    for (const ok of ['00:00', '08:00', '23:59', '12:30']) expect(isValidTime(ok)).toBe(true)
    for (const bad of ['24:00', '8:00', '08:60', '', 'abc', '08:00:00']) expect(isValidTime(bad)).toBe(false)
  })
  it('zonas horarias reales sí, inventadas no', () => {
    expect(isValidTimezone('Europe/Madrid')).toBe(true)
    expect(isValidTimezone('America/Mexico_City')).toBe(true)
    expect(isValidTimezone('Marte/Olimpo')).toBe(false)
    expect(isValidTimezone('')).toBe(false)
  })
  it('la zona del dispositivo siempre es válida', () => {
    expect(isValidTimezone(detectDeviceTimezone())).toBe(true)
  })
  it('el selector empieza por las zonas españolas y no repite', () => {
    const zones = listTimezones()
    expect(zones[0]).toBe('Europe/Madrid')
    expect(new Set(zones).size).toBe(zones.length)
  })
  it('la etiqueta enseña la diferencia horaria', () => {
    expect(timezoneLabel('Europe/Madrid', new Date('2026-07-01T12:00:00Z'))).toMatch(/Europe\/Madrid \(GMT\+2\)/)
    expect(timezoneLabel('Europe/Madrid', new Date('2026-01-15T12:00:00Z'))).toMatch(/Europe\/Madrid \(GMT\+1\)/)
  })
})
