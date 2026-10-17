// Ajustes de avisos por persona: valores por defecto, validación de horas y zonas.
import { describe, expect, it } from 'vitest'
import {
  COMMUNITY_SUGGESTION_DEFAULT_HOURS,
  COMMUNITY_SUGGESTION_MAX_HOURS,
  COMMUNITY_SUGGESTION_MIN_HOURS,
  DEFAULT_NOTIFICATION_PREFS,
  detectDeviceTimezone,
  isValidTime,
  isValidTimezone,
  listTimezones,
  timezoneLabel,
} from '@/domain/notificationPrefs'

describe('valores por defecto', () => {
  it('quien no ha guardado nada empieza en Europe/Madrid con los dos avisos de tareas activados: hoy a las 08:00 y atrasadas a las 09:00', () => {
    expect(DEFAULT_NOTIFICATION_PREFS.timezone).toBe('Europe/Madrid')
    expect(DEFAULT_NOTIFICATION_PREFS.taskTodayEnabled).toBe(true)
    expect(DEFAULT_NOTIFICATION_PREFS.taskTodayTime).toBe('08:00')
    expect(DEFAULT_NOTIFICATION_PREFS.taskOverdueEnabled).toBe(true)
    expect(DEFAULT_NOTIFICATION_PREFS.taskOverdueTime).toBe('09:00')
  })
  it('los avisos personales de Comunidad empiezan «a cualquier hora»', () => {
    expect(DEFAULT_NOTIFICATION_PREFS.personalCommunityMode).toBe('any')
  })
  it('las sugerencias de Comunidad empiezan activadas, una cada 48 h, con los límites de la base (6-720)', () => {
    expect(DEFAULT_NOTIFICATION_PREFS.communitySuggestionsEnabled).toBe(true)
    expect(DEFAULT_NOTIFICATION_PREFS.communitySuggestionEveryHours).toBe(48)
    expect(COMMUNITY_SUGGESTION_DEFAULT_HOURS).toBe(48)
    expect(COMMUNITY_SUGGESTION_MIN_HOURS).toBe(6)
    expect(COMMUNITY_SUGGESTION_MAX_HOURS).toBe(720)
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
