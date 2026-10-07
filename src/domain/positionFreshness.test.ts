// La pantalla de Ubicación no debe presentar como «en vivo» una posición de hace horas, y una parada no se guarda varias veces.
import { describe, expect, it } from 'vitest'
import { describePositionAge, STALE_POSITION_MS } from '@/domain/positionFreshness'

const FILES = import.meta.glob(['/src/services/locationSharing.ts', '/src/ui/LocationScreen.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const NOW = Date.parse('2026-10-07T19:30:00Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()

describe('describePositionAge', () => {
  it('reciente: no está caducada', () => {
    expect(describePositionAge(ago(20_000), NOW)).toEqual({ stale: false, ageLabel: 'ahora mismo' })
    expect(describePositionAge(ago(3 * 60_000), NOW)).toEqual({ stale: false, ageLabel: 'hace 3 min' })
  })
  it('a partir de 10 minutos está caducada', () => {
    expect(describePositionAge(ago(STALE_POSITION_MS - 1000), NOW).stale).toBe(false)
    expect(describePositionAge(ago(STALE_POSITION_MS), NOW).stale).toBe(true)
  })
  it('horas y días en lenguaje claro (el caso real: 6 h 32 min sin datos)', () => {
    expect(describePositionAge(ago((6 * 60 + 32) * 60_000), NOW)).toEqual({ stale: true, ageLabel: 'hace 6 h 32 min' })
    expect(describePositionAge(ago(2 * 60 * 60_000), NOW).ageLabel).toBe('hace 2 h')
    expect(describePositionAge(ago(26 * 60 * 60_000), NOW).ageLabel).toBe('hace 1 día')
    expect(describePositionAge(ago(5 * 24 * 60 * 60_000), NOW).ageLabel).toBe('hace 5 días')
  })
})

describe('cableado', () => {
  it('la tarjeta ya no dice «Compartiendo ubicación» a secas: indica la antigüedad y avisa si está caducada', () => {
    const screen = FILES['/src/ui/LocationScreen.tsx']
    expect(screen).toContain('describePositionAge(loc.recordedAt, Date.now())')
    expect(screen).toContain('Última posición conocida ${selectedFreshness.ageLabel}')
    expect(screen).toContain('Compartiendo ubicación · actualizada ${selectedFreshness.ageLabel}')
  })
  it('una parada no se guarda varias veces: freno mientras se reconoce y guarda la visita', () => {
    const svc = FILES['/src/services/locationSharing.ts']
    expect(svc).toContain('!candidate.loggedVisitId && !recordingVisit')
    expect(svc).toContain('recordingVisit = true')
    expect(svc).toContain('recordingVisit = false')
  })
})
