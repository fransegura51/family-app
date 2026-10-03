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

  // RETOQUE (corrección real: la dirección postal legible desaparecía al volver a abrir "Gestionar
  // evento") — ManageEventModal (Lugar simple) SÍ pasa ahora onPlaceDetails, para guardar
  // venueAddress/venuePlaceId junto a venue_label/coords — antes se descartaba por completo.
  it('ManageEventModal (Lugar simple de un evento sencillo) pasa onPlaceDetails, guardando address/placeId en su propio estado', () => {
    const manageEventModal = slice(SCREEN_SRC, 'function ManageEventModal(', '\n// Petición real: "Compras" en la rejilla del dashboard')
    const venuePickerCall = slice(manageEventModal, '<EventLocationCoordsPicker', '/>')
    expect(venuePickerCall).toContain('onPlaceDetails={(details) => {')
    expect(venuePickerCall).toContain('setVenueAddress(details.address)')
    expect(venuePickerCall).toContain('setVenuePlaceId(details.placeId)')
    expect(venuePickerCall).toContain('initialAddress={venueAddress}')
    expect(venuePickerCall).toContain('initialPlaceId={venuePlaceId}')
  })

  it('ManageEventModal inicializa venueAddress/venuePlaceId desde el evento guardado, y los incluye al guardar', () => {
    const manageEventModal = slice(SCREEN_SRC, 'function ManageEventModal(', '\n// Petición real: "Compras" en la rejilla del dashboard')
    expect(manageEventModal).toContain('const [venueAddress, setVenueAddress] = useState(event.venueAddress ?? null)')
    expect(manageEventModal).toContain('const [venuePlaceId, setVenuePlaceId] = useState(event.venuePlaceId ?? null)')
    const handleSaveInfo = slice(manageEventModal, 'async function handleSaveInfo(', '\n  async function handleSaveModules')
    expect(handleSaveInfo).toContain('venueAddress: venueAddress,')
    expect(handleSaveInfo).toContain('venuePlaceId: venuePlaceId,')
  })
})

// Corrección real (comprobada en iPhone): "Ver en Google Maps" DENTRO del formulario (antes de guardar)
// seguía abriendo por coordenadas aunque Google diera un place_id real, porque EventLocationCoordsPicker
// reenviaba name/address/placeId hacia MomentForm pero nunca se quedaba su propia copia para su PROPIO
// enlace. MomentCard (la ficha ya guardada) ya estaba bien — este bloque cubre específicamente el otro.
describe('EventLocationCoordsPicker — "Ver en Google Maps" (dentro del formulario) usa place_id, no solo coordenadas', () => {
  const fn = slice(SCREEN_SRC, 'function EventLocationCoordsPicker(', '\nfunction ')

  it('handleConfirmMapLocation guarda su propia copia de name/address/placeId, no solo los reenvía', () => {
    const confirmFn = slice(fn, 'function handleConfirmMapLocation(', '\n  }')
    expect(confirmFn).toContain('setPickedName(result.name)')
    expect(confirmFn).toContain('setPickedAddress(result.address)')
    expect(confirmFn).toContain('setPickedPlaceId(result.placeId)')
    // Sigue reenviando a MomentForm exactamente igual que antes — este cambio es aditivo.
    expect(confirmFn).toContain('onPlaceDetails?.({ name: result.name, address: result.address, placeId: result.placeId })')
  })

  // RETOQUE (corrección real: sin place_id, el enlace caía siempre a coordenadas en bruto aunque hubiera
  // una dirección legible) — buildMapsUrl ahora recibe pickedAddress como 4º argumento explícito, con
  // prioridad entre coordenadas y place_id (ver buildMapsUrl en domain/events.ts).
  it('el enlace pasa pickedPlaceId como 3er argumento y pickedAddress como 4º de buildMapsUrl', () => {
    expect(fn).toContain('buildMapsUrl(pickedName ?? pickedLabel ?? \'\', coords, pickedPlaceId, pickedAddress)')
  })

  it('Caso B (punto manual, sin place_id): pickedPlaceId se queda null — nunca se infiere por proximidad, nada en este componente llama a una búsqueda "nearby" para adivinarlo', () => {
    expect(fn).not.toMatch(/nearby|closest|proximity/i)
  })

  it('Quitar limpia también nombre/dirección/place_id, no solo coordenadas y pickedLabel', () => {
    const clearFn = slice(fn, 'function handleClear()', '\n  }')
    expect(clearFn).toContain('onCoordsChange(null)')
    expect(clearFn).toContain('setPickedLabel(null)')
    expect(clearFn).toContain('setPickedName(null)')
    expect(clearFn).toContain('setPickedAddress(null)')
    expect(clearFn).toContain('setPickedPlaceId(null)')
  })

  // RETOQUE (bug detectado al implementar la persistencia): Quitar ya limpiaba su PROPIA copia, pero
  // nunca avisaba a quien la usa desde fuera (ManageEventModal/MomentForm) — "Guardar" después de Quitar
  // habría vuelto a escribir la address/placeId antigua aunque coords ya fuera null.
  it('Quitar también avisa a onPlaceDetails con los 3 campos a null, para que la copia externa (ManageEventModal/MomentForm) no se quede con datos obsoletos', () => {
    const clearFn = slice(fn, 'function handleClear()', '\n  }')
    expect(clearFn).toContain('onPlaceDetails?.({ name: null, address: null, placeId: null })')
  })

  // RETOQUE (requisito real: "Gestión del evento" debe reconstruir la dirección guardada al volver a
  // entrar, no solo mostrar "Ubicación real guardada") — initialAddress/initialPlaceId son opcionales y
  // aditivos: quien no los pase (Calendario, MomentForm en alta) sigue arrancando en null como siempre.
  it('acepta initialAddress/initialPlaceId opcionales para reconstruir el resumen guardado al reabrir', () => {
    expect(fn).toContain('initialAddress?: string | null')
    expect(fn).toContain('initialPlaceId?: string | null')
    expect(fn).toContain('useState<string | null>(initialAddress ?? null)')
    expect(fn).toContain('useState<string | null>(initialPlaceId ?? null)')
  })

  it('nombre y dirección se muestran en líneas separadas, no fusionados en un único texto ambiguo', () => {
    expect(fn).toContain('{pickedName ? (')
    expect(fn).toContain('<div>✓ {pickedName}</div>')
    expect(fn).toContain('{pickedAddress && <div>{pickedAddress}</div>}')
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

// Bug real (iPhone, segunda ronda): el buscador nunca mostraba resultados y tocar un establecimiento
// del mapa no capturaba su place_id. Causa raíz A: geocoding.ts convertía CUALQUIER fallo (cupo
// diario agotado, red caída, error real de la API) en el mismo [] / null que "Google no ha
// encontrado nada" — indistinguible. Causa raíz B: el listener de click del mapa solo miraba
// e.latLng, nunca e.placeId (el campo que Google ya manda cuando se toca un icono de
// establecimiento). Corrección: dejar propagar los errores reales y leer e.placeId reutilizando
// exactamente la misma vía que elegir un resultado del buscador — nunca inferir por proximidad.
describe('geocoding.ts — ya no convierte cupo agotado / error real en "sin resultados"', () => {
  it('las 3 funciones comprueban hasReachedGoogleMapsLimit y lanzan GoogleMapsDailyLimitError antes de llamar, sin tragarlo', () => {
    expect(GEOCODING_SRC).toContain("import { allowGoogleMapsUse, GoogleMapsDailyLimitError, hasReachedGoogleMapsLimit } from '@/services/googleMapsUsageGuard'")
    const search = slice(GEOCODING_SRC, 'export async function searchPlaces(', '\n}')
    const resolve = slice(GEOCODING_SRC, 'export async function resolvePlace(', '\n}')
    const reverse = slice(GEOCODING_SRC, 'export async function reverseGeocode(', '\n}')
    for (const fn of [search, resolve, reverse]) {
      expect(fn).toContain("if (hasReachedGoogleMapsLimit('search')) throw new GoogleMapsDailyLimitError()")
    }
  })

  it('ninguna de las 3 funciones vuelve a tragar un error real con try/catch-return-[]/null', () => {
    const search = slice(GEOCODING_SRC, 'export async function searchPlaces(', '\n}')
    const resolve = slice(GEOCODING_SRC, 'export async function resolvePlace(', '\n}')
    const reverse = slice(GEOCODING_SRC, 'export async function reverseGeocode(', '\n}')
    for (const fn of [search, resolve, reverse]) {
      expect(fn).not.toContain('try {')
      expect(fn).not.toContain('catch')
    }
  })
})

describe('LocationPickerModal — errores reales distinguidos de "sin resultados", nunca el mismo mensaje genérico', () => {
  it('handleSearch usa errorMessage() (el mismo patrón que ya usa el resto del archivo) en vez de un texto fijo para cualquier fallo', () => {
    const fn = slice(PICKER_SRC, 'async function handleSearch(', '\n  }')
    expect(fn).toContain("setError(errorMessage(err, 'No se pudo buscar esa dirección ahora mismo.'))")
  })

  it('pickSuggestion también usa errorMessage() en su catch, no solo en el caso !resolved', () => {
    const fn = slice(PICKER_SRC, 'async function pickSuggestion(', '\n  }')
    expect(fn).toContain("setError(errorMessage(err, 'No se pudo obtener ese sitio ahora mismo.'))")
  })

  it('"sin resultados" solo se muestra tras una búsqueda real sin error — nunca a la vez que un mensaje de error', () => {
    expect(PICKER_SRC).toContain('{searched && suggestions.length === 0 && !error && (')
    expect(PICKER_SRC).toContain('No se han encontrado lugares con ese nombre.')
  })
})

describe('LocationPickerModal — tocar un establecimiento del mapa captura su place_id (nunca por proximidad)', () => {
  const clickHandler = slice(PICKER_SRC, "map.addListener('click',", '\n        })')

  it('lee e.placeId (IconMouseEvent) y llama e.stop() para que Google no abra su propia ficha encima', () => {
    expect(clickHandler).toContain('(e as google.maps.IconMouseEvent).placeId')
    expect(clickHandler).toContain('e.stop()')
  })

  it('cuando hay placeId, resuelve por la MISMA vía que elegir del buscador — llama a pickSuggestion(), no duplica la lógica de resolvePlace', () => {
    expect(clickHandler).toContain('void pickSuggestion({ label: \'\', placeId: clickedPlaceId })')
  })

  it('nunca infiere un placeId por proximidad ni busca el más cercano', () => {
    expect(clickHandler).not.toMatch(/nearby|closest|proximity/i)
  })

  it('cuando NO hay placeId (punto sin establecimiento), se mantiene el comportamiento anterior: coordenadas + geocodificación inversa', () => {
    expect(clickHandler).toContain('placeMarker(e.latLng.lat(), e.latLng.lng(), false)')
    expect(clickHandler).toContain('void updateLabel(e.latLng.lat(), e.latLng.lng())')
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
