import { describe, expect, it } from 'vitest'
import { routeLocation } from '@/domain/locationRoute'
import { buildMemberAnswer, describeMemberSpot, findMemberByName, googleMapsUrl, notSharingAnswer, parseWhereIs, spokenAge } from '@/domain/memberWhere'
import type { LocationPlace } from '@/domain/types'

const place = (name: string, latitude: number, longitude: number, radiusM = 100, category: string | null = null): LocationPlace => ({
  id: name,
  familyId: 'f',
  name,
  category,
  latitude,
  longitude,
  radiusM,
  notifyArrivals: true,
})

describe('entender «¿dónde está Eric?»', () => {
  it('reconoce las formas habituales de preguntar y de pedir la ubicación', () => {
    const cases: [string, string][] = [
      ['¿Dónde está Eric?', 'eric'],
      ['Pepa, ¿dónde está Fernando?', 'fernando'],
      ['dime dónde está Eric ahora mismo', 'eric'],
      ['dónde anda Fran', 'fran'],
      ['¿Y dónde se ha metido Eric?', 'eric'],
      ['dónde están los niños', 'los ninos'],
      ['mándame la ubicación de Eric', 'eric'],
      ['envíame la ubicación de Fernando', 'fernando'],
      ['pásame la ubicación actual de Eric', 'eric'],
      ['localiza a Eric', 'eric'],
      ['la ubicación de Eric', 'eric'],
      ['¿dónde está Eric, por favor?', 'eric'],
    ]
    for (const [text, subject] of cases) expect(parseWhereIs(text)?.subject, text).toBe(subject)
  })

  it('lo que no es preguntar por una persona no se confunde', () => {
    for (const text of ['añade leche a Mercadona', 'qué tiempo hace en Madrid', 'cuánto se tarda a Valencia', 'dónde', 'quién está más cerca del cole']) {
      expect(parseWhereIs(text), text).toBeNull()
    }
  })

  it('la clasificación de sitios no cambia: «dónde está la farmacia» sigue siendo buscar un sitio (si no es de la familia)', () => {
    expect(routeLocation('dónde está la farmacia')).toMatchObject({ type: 'search' })
    expect(routeLocation('busca una farmacia')).toMatchObject({ type: 'search' })
    expect(parseWhereIs('dónde está la farmacia')?.subject).toBe('farmacia') // se mira primero si «farmacia» es alguien de la familia
  })
})

describe('a quién se refiere el nombre (solo coincidencias exactas)', () => {
  const members = [{ name: 'Eric' }, { name: 'Fernando' }, { name: 'Maria del Mar' }, { name: 'Paco' }]
  it('encuentra por nombre, con o sin mayúsculas ni acentos, y por el primer nombre', () => {
    expect(findMemberByName('eric', members)?.name).toBe('Eric')
    expect(findMemberByName('Fernándo', [{ name: 'Fernándo' }])?.name).toBe('Fernándo')
    expect(findMemberByName('maria', members)?.name).toBe('Maria del Mar')
    expect(findMemberByName('maria del mar', members)?.name).toBe('Maria del Mar')
  })
  it('lo que no es de la familia no se parece a nadie (nada de «más o menos»)', () => {
    for (const subject of ['farmacia', 'la farmacia', 'mercadona', 'erika', 'er', '']) expect(findMemberByName(subject, members), subject).toBeNull()
  })
  it('con dos personas con el mismo nombre no adivina', () => {
    expect(findMemberByName('maria', [{ name: 'Maria Lopez' }, { name: 'Maria Perez' }])).toBeNull()
  })
})

describe('dónde está: lugar guardado, cerca o ninguno', () => {
  const places = [place('Casa', 38.1054, -0.85, 100), place('Av. Rafael Alberti, 30, Rafal', 38.1016, -0.849, 150, 'Cole Eric')]
  it('dentro del radio: «en Casa», y con el nombre que se le puso (categoría) si lo hay', () => {
    expect(describeMemberSpot(38.10542, -0.85007, places)).toMatchObject({ kind: 'inside', label: 'Casa' })
    expect(describeMemberSpot(38.10158, -0.84898, places)).toMatchObject({ kind: 'inside', label: 'Cole Eric' })
  })
  it('cerca (menos de 400 m) o lejos de todo', () => {
    expect(describeMemberSpot(38.1054, -0.8535, places)).toMatchObject({ kind: 'near', label: 'Casa' }) // ~ 30 m fuera... pero dentro de 400 m
    expect(describeMemberSpot(38.2, -0.9, places)).toMatchObject({ kind: 'none' })
    expect(describeMemberSpot(38.1, -0.8, [])).toMatchObject({ kind: 'none' })
  })
})

describe('la respuesta (se dice en voz alta, sin abreviaturas)', () => {
  const now = new Date('2026-10-10T18:00:00Z').getTime()
  const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString()

  it('la edad se escribe completa', () => {
    expect(spokenAge(at(0), now)).toBe('ahora mismo')
    expect(spokenAge(at(1), now)).toBe('hace 1 minuto')
    expect(spokenAge(at(7), now)).toBe('hace 7 minutos')
    expect(spokenAge(at(60), now)).toBe('hace 1 hora')
    expect(spokenAge(at(135), now)).toBe('hace 2 horas y 15 minutos')
    expect(spokenAge(at(60 * 49), now)).toBe('hace 2 días')
  })

  it('si está al día: dónde está y cuándo se actualizó', () => {
    const inside = describeMemberSpot(38.10542, -0.85007, [place('Casa', 38.1054, -0.85, 100)])
    expect(buildMemberAnswer({ name: 'Eric', recordedAt: at(0), nowMs: now, spot: inside, address: null })).toBe('Eric está en Casa ahora mismo.')
    expect(buildMemberAnswer({ name: 'Eric', recordedAt: at(3), nowMs: now, spot: inside, address: null })).toBe('Eric está en Casa. Su ubicación se actualizó hace 3 minutos.')
  })

  it('fuera de un lugar guardado dice la dirección si la hay, y si no, lo reconoce', () => {
    const none = { kind: 'none' as const, label: null, meters: 0 }
    expect(buildMemberAnswer({ name: 'Eric', recordedAt: at(1), nowMs: now, spot: none, address: 'Calle Mayor 3, Almoradí' })).toContain('Eric está en Calle Mayor 3, Almoradí')
    expect(buildMemberAnswer({ name: 'Eric', recordedAt: at(1), nowMs: now, spot: none, address: null })).toContain('en un sitio que no tengo guardado')
    const near = { kind: 'near' as const, label: 'Cole Eric', meters: 120 }
    expect(buildMemberAnswer({ name: 'Eric', recordedAt: at(1), nowMs: now, spot: near, address: null })).toContain('cerca de Cole Eric, a 120 m')
  })

  it('con la posición vieja avisa de que puede que ya no esté ahí (no la da por actual)', () => {
    const inside = describeMemberSpot(38.10542, -0.85007, [place('Casa', 38.1054, -0.85, 100)])
    const text = buildMemberAnswer({ name: 'Eric', recordedAt: at(180), nowMs: now, spot: inside, address: null })
    expect(text).toContain('La última vez que Eric compartió su ubicación fue hace 3 horas')
    expect(text).toContain('Puede que ya no esté ahí')
  })

  it('si no comparte, lo dice claro y explica qué hacer', () => {
    expect(notSharingAnswer('Eric')).toContain('Eric no está compartiendo su ubicación')
    expect(notSharingAnswer('Eric')).toContain('«Compartir ubicación»')
  })

  it('el enlace de Google Maps lleva las coordenadas', () => {
    expect(googleMapsUrl(38.1054, -0.85)).toBe('https://www.google.com/maps/search/?api=1&query=38.105400,-0.850000')
  })
})
