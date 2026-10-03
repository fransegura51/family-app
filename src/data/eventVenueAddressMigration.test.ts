import { describe, expect, it } from 'vitest'

// Corrección real (bug observado, auditado antes de implementar): al elegir una vivienda particular en
// "Buscar en el mapa" dentro de "Gestionar evento", la dirección postal legible desaparecía al volver a
// abrir el evento, y el enlace compartido caía siempre a coordenadas en bruto. `events` nunca tuvo dónde
// guardar la dirección postal ni el place_id — solo venue_label + venue_latitude/venue_longitude. Mismo
// precedente ya usado en event_moments (migración 0177).
const MIGRATION_FILES = import.meta.glob('/supabase/migrations/0191_event_venue_address_and_place_id.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const MIGRATION = MIGRATION_FILES['/supabase/migrations/0191_event_venue_address_and_place_id.sql']

describe('0191 — events.venue_address / events.venue_place_id', () => {
  it('ambas columnas son nullable, sin default distinto de null (aditiva, compatible con eventos existentes)', () => {
    expect(MIGRATION).toContain('alter table public.events add column venue_address text;')
    expect(MIGRATION).toContain('alter table public.events add column venue_place_id text;')
    expect(MIGRATION).not.toMatch(/venue_address[^;]*default/)
    expect(MIGRATION).not.toMatch(/venue_place_id[^;]*default/)
    expect(MIGRATION).not.toContain('not null')
  })

  it('no toca venue_label ni venue_latitude/venue_longitude — solo añade columnas nuevas', () => {
    expect(MIGRATION).not.toMatch(/alter table .*venue_label/)
    expect(MIGRATION).not.toMatch(/alter table .*venue_latitude/)
    expect(MIGRATION).not.toMatch(/alter table .*venue_longitude/)
  })

  it('no hace backfill (ningún UPDATE) — un evento antiguo se queda con estos campos en null hasta que alguien vuelva a elegir la ubicación', () => {
    expect(MIGRATION.toLowerCase()).not.toContain('update ')
  })
})

describe('capa de datos: src/data/events.ts — lee, mapea y escribe venue_address/venue_place_id', () => {
  const APP = import.meta.glob('/src/data/events.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  const SRC = APP['/src/data/events.ts']

  it('EVENT_SELECT pide venue_address y venue_place_id, junto a venue_latitude/venue_longitude', () => {
    const selectLine = SRC.slice(SRC.indexOf('const EVENT_SELECT'), SRC.indexOf('\n\n', SRC.indexOf('const EVENT_SELECT')))
    expect(selectLine).toContain('venue_latitude')
    expect(selectLine).toContain('venue_longitude')
    expect(selectLine).toContain('venue_address')
    expect(selectLine).toContain('venue_place_id')
  })

  it('mapEvent() mapea las columnas reales a venueAddress/venuePlaceId — nunca inventa un valor por defecto distinto de lo que viene de la fila', () => {
    const mapFn = SRC.slice(SRC.indexOf('function mapEvent('), SRC.indexOf('\nexport async function listEvents'))
    expect(mapFn).toContain('venueAddress: r.venue_address,')
    expect(mapFn).toContain('venuePlaceId: r.venue_place_id,')
  })

  it('updateEvent() acepta venueAddress/venuePlaceId en su patch y los escribe condicionalmente (solo si vienen definidos, igual que el resto de campos)', () => {
    const updateFn = SRC.slice(SRC.indexOf('export async function updateEvent('), SRC.indexOf('\n\n  // Petición real: con la fecha confirmada'))
    expect(updateFn).toContain('venueAddress: string | null')
    expect(updateFn).toContain('venuePlaceId: string | null')
    expect(updateFn).toContain('if (patch.venueAddress !== undefined) update.venue_address = patch.venueAddress')
    expect(updateFn).toContain('if (patch.venuePlaceId !== undefined) update.venue_place_id = patch.venuePlaceId')
  })
})
