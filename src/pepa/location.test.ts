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
import { locationAction, type LocationDeps } from '@/pepa/location'
import { forgetFoundPlace } from '@/pepa/recentContext'
import type { LocationPlace, MemberLocation } from '@/domain/types'

const FARMACIA: LocationPlace = { id: 'p1', familyId: 'f', name: 'Farmacia', category: null, latitude: 40.42, longitude: -3.70, radiusM: 150 }
const COLE: LocationPlace = { id: 'p2', familyId: 'f', name: 'Colegio San José', category: null, latitude: 40.43, longitude: -3.71, radiusM: 100 }

function makeDeps(overrides: Partial<LocationDeps> = {}): LocationDeps {
  return {
    places: vi.fn().mockResolvedValue([FARMACIA, COLE]),
    memberLocations: vi.fn().mockResolvedValue([]),
    members: vi.fn().mockResolvedValue([]),
    currentPosition: vi.fn().mockResolvedValue({ latitude: 40.4, longitude: -3.7 }),
    searchFirstPlace: vi.fn().mockResolvedValue(null),
    drivingEta: vi.fn().mockResolvedValue(null),
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
    const searchFirstPlace = vi.fn().mockResolvedValue({ label: 'Farmacia Rodríguez, Calle Mayor 3', latitude: 40.41, longitude: -3.69 })
    const outcome = await locationAction('busca una farmacia de guardia', makeDeps({ searchFirstPlace }))
    expect(searchFirstPlace).toHaveBeenCalledWith('una farmacia de guardia')
    expect(outcome).toEqual({ kind: 'focus-place', text: 'He encontrado Farmacia Rodríguez, Calle Mayor 3. Si quieres guardarlo como lugar frecuente, di «guárdalo».' })
  })

  it('sin resultados, lo dice claro', async () => {
    const outcome = await locationAction('busca un sitio inventado que no existe', makeDeps())
    expect(outcome).toEqual({ kind: 'answer', text: 'No he encontrado ningún sitio llamado «un sitio inventado que no existe». Prueba a buscarlo a mano en Ubicación.' })
  })
})

describe('locationAction: guardar', () => {
  it('sin haber buscado nada antes, avisa de que no tiene nada que guardar', async () => {
    const outcome = await locationAction('guárdalo', makeDeps())
    expect(outcome).toEqual({ kind: 'answer', text: 'No tengo ningún sitio reciente que guardar. Primero dime, por ejemplo, «busca la farmacia».' })
  })

  it('tras una búsqueda, "guárdalo" propone la tarjeta con el nombre encontrado', async () => {
    const deps = makeDeps({ searchFirstPlace: vi.fn().mockResolvedValue({ label: 'Farmacia Rodríguez', latitude: 40.41, longitude: -3.69 }) })
    await locationAction('busca la farmacia', deps)
    const outcome = await locationAction('guárdalo', deps)
    expect(outcome?.kind).toBe('proposal')
    if (outcome?.kind !== 'proposal') throw new Error('debería ser una propuesta')
    await outcome.proposal.confirm(outcome.proposal.initialSelection)
    expect(addPlace).toHaveBeenCalledWith({ name: 'Farmacia Rodríguez', category: null, latitude: 40.41, longitude: -3.69, radiusM: 150 })
  })

  it('"guárdalo como..." usa el nombre dicho, no el encontrado', async () => {
    const deps = makeDeps({ searchFirstPlace: vi.fn().mockResolvedValue({ label: 'Farmacia Rodríguez', latitude: 40.41, longitude: -3.69 }) })
    await locationAction('busca la farmacia', deps)
    const outcome = await locationAction('guárdalo como Farmacia de la esquina', deps)
    if (outcome?.kind !== 'proposal') throw new Error('debería ser una propuesta')
    await outcome.proposal.confirm(outcome.proposal.initialSelection)
    expect(vi.mocked(addPlace).mock.calls[0][0].name).toBe('farmacia de la esquina')
  })

  it('guardar olvida el sitio recordado, para que un segundo "guárdalo" no lo repita', async () => {
    const deps = makeDeps({ searchFirstPlace: vi.fn().mockResolvedValue({ label: 'Farmacia Rodríguez', latitude: 40.41, longitude: -3.69 }) })
    await locationAction('busca la farmacia', deps)
    await locationAction('guárdalo', deps)
    const second = await locationAction('guárdalo', deps)
    expect(second).toEqual({ kind: 'answer', text: 'No tengo ningún sitio reciente que guardar. Primero dime, por ejemplo, «busca la farmacia».' })
  })
})

describe('locationAction: tiempo en coche', () => {
  it('calcula el tiempo hasta un lugar guardado', async () => {
    const drivingEta = vi.fn().mockResolvedValue({ minutes: 12, km: 4.5 })
    const outcome = await locationAction('cuánto se tarda en coche a la farmacia', makeDeps({ drivingEta }))
    expect(drivingEta).toHaveBeenCalledWith({ latitude: 40.4, longitude: -3.7 }, FARMACIA)
    expect(outcome).toEqual({ kind: 'answer', text: 'Desde donde estás, hasta Farmacia se tarda unos 12 minutos en coche (4.5 km, con tráfico).' })
  })

  it('sin ese lugar guardado, lo dice', async () => {
    const outcome = await locationAction('cuánto se tarda en coche al aeropuerto', makeDeps())
    expect(outcome).toEqual({ kind: 'answer', text: 'No tengo ningún lugar guardado llamado «aeropuerto». Revisa el nombre en Ubicación.' })
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
})
