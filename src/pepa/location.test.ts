import { beforeEach, describe, expect, it, vi } from 'vitest'

// pepa/location.ts guarda a través de pepa/actions/registry.ts, que trae TODAS las acciones
// registradas (no solo location.addPlace) — hace falta simular también sus módulos de datos para
// que cargar el registro no intente hablar de verdad con Supabase (mismo patrón que actions.test.ts).
vi.mock('@/data/food', () => ({
  setMenuEntry: vi.fn(),
  updateMenuEntry: vi.fn(),
  addRecipeIngredientsToShoppingList: vi.fn(),
  createRecipe: vi.fn(),
}))
vi.mock('@/data/shopping', () => ({ addShoppingItem: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/data/calendar', () => ({ createEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/data/location', () => ({ addPlace: vi.fn().mockResolvedValue(undefined) }))

import { addPlace } from '@/data/location'
import { locationAction, weatherAnswerForPlace, type LocationDeps, type SearchOutcome } from '@/pepa/location'
import { forgetFoundPlace } from '@/pepa/recentContext'
import type { LocationPlace, MemberLocation } from '@/domain/types'
import type { WeatherReport } from '@/domain/weather'

const FARMACIA: LocationPlace = { id: 'p1', familyId: 'f', name: 'Farmacia', category: null, latitude: 40.42, longitude: -3.70, radiusM: 150, notifyArrivals: false }
const COLE: LocationPlace = { id: 'p2', familyId: 'f', name: 'Colegio San José', category: null, latitude: 40.43, longitude: -3.71, radiusM: 100, notifyArrivals: false }
const CARGOFRIO: LocationPlace = { id: 'p3', familyId: 'f', name: 'Cargofrío', category: 'Trabajo', latitude: 38.11, longitude: -0.79, radiusM: 150, notifyArrivals: false }

function found(label: string, latitude: number, longitude: number): SearchOutcome {
  return { ok: true, place: { label, latitude, longitude } }
}
const NOT_FOUND_RESULT: SearchOutcome = { ok: false, reason: 'not-found' }
const DAILY_LIMIT_RESULT: SearchOutcome = { ok: false, reason: 'daily-limit' }

function makeDeps(overrides: Partial<LocationDeps> = {}): LocationDeps {
  return {
    places: vi.fn().mockResolvedValue([FARMACIA, COLE, CARGOFRIO]),
    memberLocations: vi.fn().mockResolvedValue([]),
    members: vi.fn().mockResolvedValue([]),
    currentPosition: vi.fn().mockResolvedValue({ latitude: 40.4, longitude: -3.7 }),
    searchFirstPlace: vi.fn().mockResolvedValue(NOT_FOUND_RESULT),
    drivingEta: vi.fn().mockResolvedValue(null),
    weather: vi.fn().mockResolvedValue(null),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('window', { dispatchEvent: vi.fn() })
  forgetFoundPlace()
})

describe('locationAction: frases que no son de Ubicación', () => {
  it('devuelve null y no toca nada', async () => {
    expect(await locationAction('qué cenamos hoy', makeDeps())).toBeNull()
    expect(await locationAction('necesito comprar leche', makeDeps())).toBeNull()
  })
})

describe('locationAction: buscar', () => {
  it('encuentra un sitio y lo recuerda para poder guardarlo después', async () => {
    const searchFirstPlace = vi.fn().mockResolvedValue(found('Farmacia Rodríguez, Calle Mayor 3', 40.41, -3.69))
    const outcome = await locationAction('busca una farmacia de guardia', makeDeps({ searchFirstPlace }))
    expect(searchFirstPlace).toHaveBeenCalledWith('una farmacia de guardia', { latitude: 40.4, longitude: -3.7 })
    expect(outcome).toEqual({ kind: 'focus-place', text: 'He encontrado Farmacia Rodríguez, Calle Mayor 3. Si quieres guardarlo como lugar frecuente, di «guárdalo».' })
  })

  it('sin resultados, lo dice claro', async () => {
    const outcome = await locationAction('busca un sitio inventado que no existe', makeDeps())
    expect(outcome).toEqual({ kind: 'answer', text: 'No he encontrado ningún sitio llamado «un sitio inventado que no existe». Prueba a buscarlo a mano en Ubicación.' })
  })

  it('si el freno diario ya está gastado, lo dice claro en vez de parecer que no existe (bug real: "Pepa no encuentra Madrid")', async () => {
    const searchFirstPlace = vi.fn().mockResolvedValue(DAILY_LIMIT_RESULT)
    const outcome = await locationAction('busca Madrid', makeDeps({ searchFirstPlace }))
    expect(outcome).toEqual({
      kind: 'answer',
      text: 'Ya has usado hoy el número de veces que este teléfono puede buscar sitios en el mapa (es un freno para no gastar de más, no un fallo). Se puede volver a usar mañana.',
    })
  })
})

describe('locationAction: guardar', () => {
  it('sin haber buscado nada antes, avisa de que no tiene nada que guardar', async () => {
    const outcome = await locationAction('guárdalo', makeDeps())
    expect(outcome).toEqual({ kind: 'answer', text: 'No tengo ningún sitio reciente que guardar. Primero dime, por ejemplo, «busca la farmacia».' })
  })

  it('tras una búsqueda, "guárdalo" propone la tarjeta con el nombre encontrado', async () => {
    const deps = makeDeps({ searchFirstPlace: vi.fn().mockResolvedValue(found('Farmacia Rodríguez', 40.41, -3.69)) })
    await locationAction('busca la farmacia', deps)
    const outcome = await locationAction('guárdalo', deps)
    expect(outcome?.kind).toBe('proposal')
    if (outcome?.kind !== 'proposal') throw new Error('debería ser una propuesta')
    await outcome.proposal.confirm(outcome.proposal.initialSelection)
    expect(addPlace).toHaveBeenCalledWith({ name: 'Farmacia Rodríguez', category: null, latitude: 40.41, longitude: -3.69, radiusM: 150 })
  })

  it('"guárdalo como..." usa el nombre dicho, no el encontrado', async () => {
    const deps = makeDeps({ searchFirstPlace: vi.fn().mockResolvedValue(found('Farmacia Rodríguez', 40.41, -3.69)) })
    await locationAction('busca la farmacia', deps)
    const outcome = await locationAction('guárdalo como Farmacia de la esquina', deps)
    if (outcome?.kind !== 'proposal') throw new Error('debería ser una propuesta')
    await outcome.proposal.confirm(outcome.proposal.initialSelection)
    expect(vi.mocked(addPlace).mock.calls[0][0].name).toBe('farmacia de la esquina')
  })

  it('guardar olvida el sitio recordado, para que un segundo "guárdalo" no lo repita', async () => {
    const deps = makeDeps({ searchFirstPlace: vi.fn().mockResolvedValue(found('Farmacia Rodríguez', 40.41, -3.69)) })
    await locationAction('busca la farmacia', deps)
    await locationAction('guárdalo', deps)
    const second = await locationAction('guárdalo', deps)
    expect(second).toEqual({ kind: 'answer', text: 'No tengo ningún sitio reciente que guardar. Primero dime, por ejemplo, «busca la farmacia».' })
  })
})

describe('locationAction: tiempo en coche', () => {
  it('calcula el tiempo hasta un lugar guardado', async () => {
    const drivingEta = vi.fn().mockResolvedValue({ minutes: 12, km: 4.5, delayMinutes: 0, polyline: null })
    const outcome = await locationAction('cuánto se tarda en coche a la farmacia', makeDeps({ drivingEta }))
    expect(drivingEta).toHaveBeenCalledWith({ latitude: 40.4, longitude: -3.7 }, { latitude: 40.42, longitude: -3.7, label: 'Farmacia' })
    expect(outcome).toEqual({
      kind: 'answer',
      text: 'Desde donde estás, hasta Farmacia se tarda unos 12 minutos en coche (4.5 km), con tráfico fluido, sin retenciones.',
    })
  })

  it('petición real: "que me marque la ruta hasta Madrid como en Google Maps" — avisa a la pantalla con el trazado', async () => {
    const drivingEta = vi.fn().mockResolvedValue({ minutes: 12, km: 4.5, delayMinutes: 0, polyline: 'abc123' })
    await locationAction('cuánto se tarda en coche a la farmacia', makeDeps({ drivingEta }))
    expect(window.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'family-app:route-computed', detail: { polyline: 'abc123' } }))
  })

  it('sin trazado (Google no lo ha podido calcular), no avisa a la pantalla', async () => {
    const drivingEta = vi.fn().mockResolvedValue({ minutes: 12, km: 4.5, delayMinutes: 0, polyline: null })
    await locationAction('cuánto se tarda en coche a la farmacia', makeDeps({ drivingEta }))
    expect(window.dispatchEvent).not.toHaveBeenCalled()
  })

  it('reconoce varias formas reales de preguntarlo, no solo "se tarda"', async () => {
    const drivingEta = vi.fn().mockResolvedValue({ minutes: 12, km: 4.5, delayMinutes: 0 })
    expect(await locationAction('cuánto tiempo tengo hasta la farmacia', makeDeps({ drivingEta }))).toMatchObject({ kind: 'answer' })
    expect(await locationAction('qué distancia tengo hasta la farmacia', makeDeps({ drivingEta }))).toMatchObject({ kind: 'answer' })
    expect(await locationAction('cuánto queda hasta la farmacia', makeDeps({ drivingEta }))).toMatchObject({ kind: 'answer' })
    expect(await locationAction('cuántos kilómetros tenemos a la farmacia', makeDeps({ drivingEta }))).toMatchObject({ kind: 'answer' })
    expect(await locationAction('qué se tarda en llegar a la farmacia', makeDeps({ drivingEta }))).toMatchObject({ kind: 'answer' })
  })

  it('si no es un lugar guardado, lo busca de verdad en Google Maps (petición real: "incluyendo Madrid")', async () => {
    const searchFirstPlace = vi.fn().mockResolvedValue(found('Madrid, España', 40.4168, -3.7038))
    const drivingEta = vi.fn().mockResolvedValue({ minutes: 90, km: 80, delayMinutes: 5 })
    const outcome = await locationAction('cuánto tiempo tengo hasta Madrid', makeDeps({ searchFirstPlace, drivingEta }))
    expect(searchFirstPlace).toHaveBeenCalledWith('madrid', { latitude: 40.4, longitude: -3.7 })
    expect(drivingEta).toHaveBeenCalledWith({ latitude: 40.4, longitude: -3.7 }, { latitude: 40.4168, longitude: -3.7038, label: 'Madrid, España' })
    expect(outcome).toEqual({
      kind: 'answer',
      text: 'Desde donde estás, hasta Madrid, España se tarda unos 1 hora y 30 minutos en coche (80 km), con algo de tráfico, unos 5 minutos más de lo normal.',
    })
  })

  it('ni guardado ni encontrado en el mapa, lo dice', async () => {
    const outcome = await locationAction('cuánto se tarda en coche al aeropuerto', makeDeps())
    expect(outcome).toEqual({ kind: 'answer', text: 'No he encontrado «aeropuerto», ni entre tus lugares guardados ni buscándolo en el mapa.' })
  })

  it('si el freno diario de búsquedas ya está gastado, lo dice claro (bug real: "Pepa no encuentra Madrid")', async () => {
    const searchFirstPlace = vi.fn().mockResolvedValue(DAILY_LIMIT_RESULT)
    const outcome = await locationAction('cuánto tiempo tengo hasta Madrid', makeDeps({ searchFirstPlace }))
    expect(outcome).toEqual({
      kind: 'answer',
      text: 'Ya has usado hoy el número de veces que este teléfono puede buscar sitios en el mapa (es un freno para no gastar de más, no un fallo). Se puede volver a usar mañana.',
    })
  })

  it('también encuentra el lugar por su categoría, no solo por el nombre', async () => {
    const drivingEta = vi.fn().mockResolvedValue({ minutes: 8, km: 3, delayMinutes: 0 })
    const outcome = await locationAction('cuánto se tarda en coche a trabajo', makeDeps({ drivingEta }))
    expect(drivingEta).toHaveBeenCalledWith({ latitude: 40.4, longitude: -3.7 }, { latitude: 38.11, longitude: -0.79, label: 'Cargofrío' })
    expect(outcome).toEqual({
      kind: 'answer',
      text: 'Desde donde estás, hasta Cargofrío se tarda unos 8 minutos en coche (3 km), con tráfico fluido, sin retenciones.',
    })
  })

  it('sin permiso de ubicación, lo avisa en vez de fallar', async () => {
    const outcome = await locationAction('cuánto se tarda en coche a la farmacia', makeDeps({ currentPosition: vi.fn().mockResolvedValue(null) }))
    expect(outcome).toEqual({ kind: 'answer', text: 'No he podido saber dónde estás ahora mismo — revisa el permiso de ubicación del teléfono.' })
  })
})

describe('locationAction: quién está más cerca', () => {
  it('ordena por distancia y dice quién gana', async () => {
    const locations: MemberLocation[] = [
      { memberId: 'm1', familyId: 'f', latitude: 40.421, longitude: -3.701, recordedAt: '2026-09-30T10:00:00Z' }, // muy cerca
      { memberId: 'm2', familyId: 'f', latitude: 41.5, longitude: -4.5, recordedAt: '2026-09-30T10:00:00Z' }, // lejos
    ]
    const members = [
      { id: 'm1', name: 'Eric' },
      { id: 'm2', name: 'Jennifer' },
    ]
    const outcome = await locationAction('quién está más cerca de la farmacia', makeDeps({ memberLocations: vi.fn().mockResolvedValue(locations), members: vi.fn().mockResolvedValue(members) }))
    expect(outcome).toMatchObject({ kind: 'answer' })
    expect((outcome as { text: string }).text).toContain('Eric está más cerca de Farmacia')
  })

  it('nadie compartiendo ubicación, lo dice', async () => {
    const outcome = await locationAction('quién está más cerca de la farmacia', makeDeps())
    expect(outcome).toEqual({ kind: 'answer', text: 'Nadie está compartiendo su ubicación ahora mismo.' })
  })

  it('también encuentra el lugar por su categoría, no solo por el nombre (petición real)', async () => {
    const locations: MemberLocation[] = [{ memberId: 'm1', familyId: 'f', latitude: 38.111, longitude: -0.791, recordedAt: '2026-09-30T10:00:00Z' }]
    const members = [{ id: 'm1', name: 'Jennifer' }]
    const outcome = await locationAction(
      'quién está más cerca de trabajo',
      makeDeps({ memberLocations: vi.fn().mockResolvedValue(locations), members: vi.fn().mockResolvedValue(members) }),
    )
    expect(outcome).toMatchObject({ kind: 'answer' })
    expect((outcome as { text: string }).text).toContain('Jennifer está más cerca de Cargofrío')
  })

  it('si no es un lugar guardado, también lo busca en Google Maps', async () => {
    const searchFirstPlace = vi.fn().mockResolvedValue(found('Madrid, España', 40.4168, -3.7038))
    const locations: MemberLocation[] = [{ memberId: 'm1', familyId: 'f', latitude: 40.42, longitude: -3.7, recordedAt: '2026-09-30T10:00:00Z' }]
    const members = [{ id: 'm1', name: 'Eric' }]
    const outcome = await locationAction(
      'quién está más cerca de Madrid',
      makeDeps({ searchFirstPlace, memberLocations: vi.fn().mockResolvedValue(locations), members: vi.fn().mockResolvedValue(members) }),
    )
    expect(outcome).toMatchObject({ kind: 'answer' })
    expect((outcome as { text: string }).text).toContain('Eric está más cerca de Madrid, España')
  })
})

describe('locationAction: el tiempo (meteorológico) y la previsión', () => {
  const REPORT: WeatherReport = {
    now: { temperatureC: 21, code: 0 },
    forecast: [
      { date: '2026-10-01', maxC: 26, minC: 17, code: 0, rainChance: 10 },
      { date: '2026-10-02', maxC: 24, minC: 16, code: 95, rainChance: 70 },
    ],
  }

  it('dice el tiempo y la previsión de un lugar guardado', async () => {
    const weather = vi.fn().mockResolvedValue(REPORT)
    const outcome = await locationAction('qué tiempo hace en la farmacia', makeDeps({ weather }))
    expect(weather).toHaveBeenCalledWith(40.42, -3.7)
    expect(outcome).toEqual({
      kind: 'answer',
      text: 'En Farmacia ahora mismo hay 21°, despejado. Previsión: mañana 24°/16°, con un 70% de posibilidades de lluvia.',
    })
  })

  it('si no es un lugar guardado, también lo busca en Google Maps (petición real: "incluyendo Madrid")', async () => {
    const searchFirstPlace = vi.fn().mockResolvedValue(found('Madrid, España', 40.4168, -3.7038))
    const weather = vi.fn().mockResolvedValue(REPORT)
    const outcome = await locationAction('qué tiempo hace en Madrid', makeDeps({ searchFirstPlace, weather }))
    expect(searchFirstPlace).toHaveBeenCalledWith('madrid', { latitude: 40.4, longitude: -3.7 })
    expect(weather).toHaveBeenCalledWith(40.4168, -3.7038)
    expect(outcome).toMatchObject({ kind: 'answer' })
    expect((outcome as { text: string }).text).toContain('En Madrid, España ahora mismo hay 21°')
  })

  it('no necesita saber dónde estás tú (a diferencia del tiempo en coche)', async () => {
    const currentPosition = vi.fn().mockResolvedValue(null)
    const weather = vi.fn().mockResolvedValue(REPORT)
    const outcome = await locationAction('qué tiempo hace en la farmacia', makeDeps({ currentPosition, weather }))
    expect(outcome).toMatchObject({ kind: 'answer' })
    expect((outcome as { text: string }).text).not.toContain('permiso de ubicación')
  })

  it('ni guardado ni encontrado en el mapa, lo dice', async () => {
    const outcome = await locationAction('qué tiempo hace en un sitio inventado', makeDeps())
    expect(outcome).toEqual({ kind: 'answer', text: 'No he encontrado «un sitio inventado», ni entre tus lugares guardados ni buscándolo en el mapa.' })
  })

  it('si Open-Meteo falla, lo dice sin romper nada', async () => {
    const weather = vi.fn().mockResolvedValue(null)
    const outcome = await locationAction('qué tiempo hace en la farmacia', makeDeps({ weather }))
    expect(outcome).toEqual({ kind: 'answer', text: 'No he podido consultar el tiempo en Farmacia ahora mismo.' })
  })
})

// Petición real: "tiene que reconocer todas las frases que se le digan" — weatherAnswerForPlace es
// lo que llama la IA de respaldo (pepa/talk.ts, askWithAi) cuando NINGÚN patrón de voz ha entendido
// la frase, así que tiene que dar la misma respuesta de siempre (mismo texto, mismos lugares
// guardados o búsqueda en Google Maps) a partir de solo el nombre del sitio.
describe('weatherAnswerForPlace (respaldo de la IA cuando ningún patrón entiende la frase)', () => {
  it('da el mismo texto que el camino normal, a partir de un lugar guardado', async () => {
    const weather = vi.fn().mockResolvedValue({ now: { temperatureC: 21, code: 0 }, forecast: [{ date: '2026-10-01', maxC: 26, minC: 17, code: 0, rainChance: 10 }] })
    const text = await weatherAnswerForPlace('la farmacia', makeDeps({ weather }))
    expect(weather).toHaveBeenCalledWith(40.42, -3.7)
    expect(text).toBe('En Farmacia ahora mismo hay 21°, despejado.')
  })

  it('también busca en Google Maps si no es un lugar guardado', async () => {
    const searchFirstPlace = vi.fn().mockResolvedValue(found('Rafal, Alicante', 38.19, -0.81))
    const weather = vi.fn().mockResolvedValue({ now: { temperatureC: 24, code: 1 }, forecast: [] })
    const text = await weatherAnswerForPlace('Rafal', makeDeps({ searchFirstPlace, weather }))
    expect(text).toBe('En Rafal, Alicante ahora mismo hay 24°, mayormente despejado.')
  })

  it('ni guardado ni encontrado, lo dice igual que el camino normal', async () => {
    const text = await weatherAnswerForPlace('un sitio inventado', makeDeps())
    expect(text).toBe('No he encontrado «un sitio inventado», ni entre tus lugares guardados ni buscándolo en el mapa.')
  })
})

describe('locationAction: «¿dónde está Eric?» (solo gente de la misma familia)', () => {
  const NOW = new Date('2026-10-10T18:00:00Z').getTime()
  const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString()
  const ERIC = { id: 'm-eric', name: 'Eric' }
  const FERNANDO = { id: 'm-fer', name: 'Fernando' }
  const CASA: LocationPlace = { id: 'p-casa', familyId: 'f', name: 'Casa', category: null, latitude: 38.1054, longitude: -0.85, radiusM: 100, notifyArrivals: true }
  const loc = (memberId: string, minutesAgo: number, latitude = 38.10542, longitude = -0.85007): MemberLocation => ({
    memberId,
    familyId: 'f',
    latitude,
    longitude,
    recordedAt: ago(minutesAgo),
  })
  const familyDeps = (overrides: Partial<LocationDeps> = {}) =>
    makeDeps({
      members: vi.fn().mockResolvedValue([ERIC, FERNANDO]),
      places: vi.fn().mockResolvedValue([CASA]),
      memberLocations: vi.fn().mockResolvedValue([loc('m-eric', 1)]),
      consents: vi.fn().mockResolvedValue([{ memberId: 'm-eric', enabled: true }]),
      now: () => NOW,
      ...overrides,
    })

  it('dice dónde está y devuelve su posición para abrir el mapa y mandar el enlace', async () => {
    const outcome = await locationAction('Pepa, ¿dónde está Eric?', familyDeps())
    expect(outcome).toEqual({
      kind: 'member-location',
      text: 'Eric está en Casa. Su ubicación se actualizó hace 1 minuto.',
      memberId: 'm-eric',
      latitude: 38.10542,
      longitude: -0.85007,
      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=38.105420,-0.850070',
    })
  })

  it('«mándame la ubicación de Fernando» funciona igual', async () => {
    const deps = familyDeps({ memberLocations: vi.fn().mockResolvedValue([loc('m-fer', 0)]), consents: vi.fn().mockResolvedValue([]) })
    const outcome = await locationAction('mándame la ubicación de Fernando', deps)
    expect(outcome).toMatchObject({ kind: 'member-location', memberId: 'm-fer', text: 'Fernando está en Casa ahora mismo.' })
  })

  it('fuera de un sitio guardado dice la dirección; si falla, lo dice sin ella', async () => {
    const far = familyDeps({ memberLocations: vi.fn().mockResolvedValue([loc('m-eric', 2, 38.2, -0.9)]), addressFor: vi.fn().mockResolvedValue('Calle Mayor 3, Almoradí') })
    expect(await locationAction('¿dónde está Eric?', far)).toMatchObject({ kind: 'member-location', text: expect.stringContaining('Eric está en Calle Mayor 3, Almoradí') })
    const broken = familyDeps({ memberLocations: vi.fn().mockResolvedValue([loc('m-eric', 2, 38.2, -0.9)]), addressFor: vi.fn().mockRejectedValue(new Error('sin red')) })
    expect(await locationAction('¿dónde está Eric?', broken)).toMatchObject({ text: expect.stringContaining('en un sitio que no tengo guardado') })
  })

  it('con la posición vieja avisa de que puede que ya no esté ahí', async () => {
    const deps = familyDeps({ memberLocations: vi.fn().mockResolvedValue([loc('m-eric', 200)]) })
    const outcome = await locationAction('¿dónde está Eric?', deps)
    expect(outcome).toMatchObject({ kind: 'member-location', text: expect.stringContaining('Puede que ya no esté ahí') })
  })

  it('si no comparte su ubicación (sin posición o permiso apagado) lo dice y no abre el mapa', async () => {
    const sinPosicion = await locationAction('¿dónde está Fernando?', familyDeps())
    expect(sinPosicion).toMatchObject({ kind: 'answer', text: expect.stringContaining('Fernando no está compartiendo su ubicación') })
    const apagado = await locationAction('¿dónde está Eric?', familyDeps({ consents: vi.fn().mockResolvedValue([{ memberId: 'm-eric', enabled: false }]) }))
    expect(apagado).toMatchObject({ kind: 'answer', text: expect.stringContaining('Eric no está compartiendo su ubicación') })
  })

  it('una cuenta sin acceso a Ubicación no puede saber dónde está nadie (y no se consulta ninguna posición)', async () => {
    const memberLocations = vi.fn().mockResolvedValue([loc('m-eric', 1)])
    const outcome = await locationAction('¿dónde está Eric?', familyDeps({ canSeeLocation: vi.fn().mockResolvedValue(false), memberLocations }))
    expect(outcome).toMatchObject({ kind: 'answer', text: expect.stringContaining('no tiene acceso a Ubicación') })
    expect(memberLocations).not.toHaveBeenCalled()
  })

  it('si no se puede comprobar el acceso (sin red), no se concede a ciegas', async () => {
    const memberLocations = vi.fn().mockResolvedValue([loc('m-eric', 1)])
    const outcome = await locationAction('¿dónde está Eric?', familyDeps({ canSeeLocation: vi.fn().mockRejectedValue(new Error('sin red')), memberLocations }))
    expect(outcome).toMatchObject({ kind: 'answer', text: expect.stringContaining('no he podido comprobar') })
    expect(memberLocations).not.toHaveBeenCalled()
  })

  it('alguien que no es de la familia no se localiza: «dónde está Eric» con otra familia no devuelve nada', async () => {
    const deps = familyDeps({ members: vi.fn().mockResolvedValue([FERNANDO]), memberLocations: vi.fn().mockResolvedValue([]) })
    const outcome = await locationAction('¿dónde está Eric?', deps)
    expect(outcome).not.toMatchObject({ kind: 'member-location' })
  })

  it('«dónde está la farmacia» sigue buscando un sitio, como siempre', async () => {
    const searchFirstPlace = vi.fn().mockResolvedValue(found('Farmacia Rodríguez, Calle Mayor 3', 40.41, -3.69))
    const outcome = await locationAction('dónde está la farmacia', familyDeps({ searchFirstPlace }))
    expect(outcome).toMatchObject({ kind: 'focus-place' })
    expect(searchFirstPlace).toHaveBeenCalled()
  })
})
