import { describe, expect, it } from 'vitest'

// Eventos — cierre de Fase 2 (Google Maps): Momentos aprovecha nombre/dirección/place_id que Google ya
// devolvía y PEPA descartaba. Reutiliza la integración existente (LocationPickerModal/geocoding.ts/la
// función edge google-maps) de forma aditiva — Calendario y el "Lugar" simple de Eventos no cambian.
const SCREEN_SRC = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']
const PICKER_SRC = (import.meta.glob('/src/ui/LocationPickerModal.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/LocationPickerModal.tsx']
const GEOCODING_SRC = (import.meta.glob('/src/services/geocoding.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/services/geocoding.ts']
const CALENDAR_SRC = (import.meta.glob('/src/ui/CalendarScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/CalendarScreen.tsx']
const FUNCTIONS = import.meta.glob('/supabase/functions/google-maps/index.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const EDGE_SRC = FUNCTIONS['/supabase/functions/google-maps/index.ts']

function slice(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('No se construye un segundo buscador — se amplía el existente de forma aditiva', () => {
  it('la función edge google-maps sigue siendo la única integración; "details" ahora también manda name/address/placeId sin tocar "label"', () => {
    const detailsBlock = slice(EDGE_SRC, 'if (action === "details")', 'if (action === "geocode")')
    expect(detailsBlock).toContain('label: data.formattedAddress ?? data.displayName?.text ?? "Sin nombre"') // exactamente igual que antes
    expect(detailsBlock).toContain('name: data.displayName?.text ?? null')
    expect(detailsBlock).toContain('address: data.formattedAddress ?? null')
    expect(detailsBlock).toContain('placeId,')
  })

  it('PlaceResult (geocoding.ts) declara los 3 campos nuevos como aditivos, label se sigue calculando igual', () => {
    const iface = slice(GEOCODING_SRC, 'export interface PlaceResult {', '\n}')
    expect(iface).toContain('label: string')
    expect(iface).toContain('name: string | null')
    expect(iface).toContain('address: string | null')
    expect(iface).toContain('placeId: string | null')
  })

  it('Calendario (otro consumidor de LocationPickerModal) no se ha tocado — sigue solo mirando latitude/longitude/label', () => {
    const fn = slice(CALENDAR_SRC, 'function handleConfirmMapLocation(result:', '\n  }')
    expect(fn).not.toMatch(/result\.name|result\.address|result\.placeId/)
  })
})

describe('LocationPickerModal — separa nombre/dirección/place_id, nunca solo al elegir el mapa a ciegas', () => {
  it('pickSuggestion (Place Details) guarda name/address/placeId por separado', () => {
    const fn = slice(PICKER_SRC, 'async function pickSuggestion(', '\n  }')
    expect(fn).toContain('setPlaceName(resolved.name)')
    expect(fn).toContain('setPlaceAddress(resolved.address)')
    expect(fn).toContain('setPlaceId(resolved.placeId ?? s.placeId)')
  })

  it('tocar/arrastrar el mapa (geocodificación inversa) nunca inventa un nombre ni un place_id — solo da dirección', () => {
    const fn = slice(PICKER_SRC, 'async function updateLabel(', '\n  }')
    expect(fn).toContain('setPlaceName(null)')
    expect(fn).toContain('setPlaceId(null)')
    expect(fn).toContain('setPlaceAddress(address)')
  })

  it('handleConfirm manda los 4 campos (coords, label, name, address, placeId) al onConfirm', () => {
    const fn = slice(PICKER_SRC, 'function handleConfirm()', '\n  }')
    expect(fn).toContain('onConfirm({ ...picked, label, name: placeName, address: placeAddress, placeId })')
  })
})

describe('EventLocationCoordsPicker — onPlaceDetails opcional, no rompe al "Lugar" simple que no lo usa', () => {
  const fn = slice(SCREEN_SRC, 'function EventLocationCoordsPicker(', '\nfunction ')

  it('onPlaceDetails es opcional (?) y solo se llama si existe', () => {
    expect(fn).toContain('onPlaceDetails?: (details:')
    expect(fn).toContain('onPlaceDetails?.({ name: result.name, address: result.address, placeId: result.placeId })')
  })

  it('ManageEventModal (Lugar simple de un evento sencillo) no pasa onPlaceDetails — su comportamiento no cambia', () => {
    const manageEventModal = slice(SCREEN_SRC, 'function ManageEventModal(', '\n// Petición real: "Compras" en la rejilla del dashboard')
    const venuePickerCall = slice(manageEventModal, '<EventLocationCoordsPicker coords={venueCoords}', '/>')
    expect(venuePickerCall).not.toContain('onPlaceDetails')
  })
})

describe('MomentForm — nombre personalizado se conserva, Google solo rellena si estaba vacío', () => {
  const fn = slice(SCREEN_SRC, 'function MomentForm(', '\nfunction MomentCard(')

  it('handlePlaceDetails solo sobrescribe locationLabel cuando está vacío', () => {
    const handler = slice(fn, 'function handlePlaceDetails(', '\n  }')
    expect(handler).toContain("if (!locationLabel.trim()) setLocationLabel(details.name ?? details.address ?? '')")
    // Siempre guarda dirección/place_id, tenga o no ya un nombre propio la familia.
    expect(handler).toContain('setLocationAddress(details.address)')
    expect(handler).toContain('setLocationPlaceId(details.placeId)')
  })

  it('se pasa a EventLocationCoordsPicker como onPlaceDetails', () => {
    expect(fn).toContain('<EventLocationCoordsPicker coords={coords} onCoordsChange={setCoords} onPlaceDetails={handlePlaceDetails} />')
  })

  it('el payload guardado incluye locationAddress/locationPlaceId junto al resto', () => {
    const submitFn = slice(fn, 'async function handleSubmit(', '\n  }')
    expect(submitFn).toContain('locationAddress,')
    expect(submitFn).toContain('locationPlaceId,')
  })
})

describe('MomentCard — presentación humana: dirección legible en vez de coordenadas', () => {
  const fn = slice(SCREEN_SRC, 'function MomentCard(', '\nfunction MomentsEditor(')

  it('muestra la dirección como línea secundaria cuando existe', () => {
    expect(fn).toContain('{moment.locationAddress && (')
  })

  it('nunca interpola latitude/longitude directamente en un texto visible (nada de "38.10, -0.79" como sustituto de dirección)', () => {
    expect(fn).not.toMatch(/\{moment\.locationLatitude\}/)
    expect(fn).not.toMatch(/\{moment\.locationLongitude\}/)
    expect(fn).not.toMatch(/toFixed\(/)
  })

  it('"Ver ubicación" usa buildMapsUrl con dirección+place_id (lo más preciso disponible), con fallback a coords/texto ya existente en buildMapsUrl', () => {
    expect(fn).toContain('buildMapsUrl(moment.locationAddress ?? moment.locationLabel ?? \'\', coords, moment.locationPlaceId)')
  })

  it('"Ver ubicación" sigue apareciendo con solo el nombre (ubicación antigua: solo location_label + coordenadas, sin dirección/place_id)', () => {
    expect(fn).toContain('{(moment.locationLabel || moment.locationAddress) && (')
  })
})
