import { useEffect, useRef, useState } from 'react'
import { reverseGeocode, searchPlaces, type PlaceResult } from '@/services/geocoding'
import { loadGoogleMaps } from '@/services/googleMapsLoader'
import { allowGoogleMapsUse, GoogleMapsDailyLimitError } from '@/services/googleMapsUsageGuard'
import { getCurrentPosition } from '@/services/geolocation'
import { errorMessage } from '@/domain/errorMessage'

const DEFAULT_CENTER = { lat: 40.4168, lng: -3.7038 } // Madrid, solo como punto de partida sin ubicación previa

// Petición real: "que dar a buscar te lleve directamente al mapa, y
// dentro del mapa busques la ubicación que quieras" — un mapa
// interactivo (Google Maps) donde además de buscar se puede tocar o
// arrastrar para afinar el punto exacto. Compartido entre Calendario y
// Eventos.
export function LocationPickerModal({
  initialQuery,
  initialCoords,
  onConfirm,
  onClose,
}: {
  initialQuery?: string
  initialCoords?: { latitude: number; longitude: number } | null
  onConfirm: (result: { latitude: number; longitude: number; label: string | null }) => void
  onClose: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markerRef = useRef<google.maps.Marker | null>(null)
  const [query, setQuery] = useState(initialQuery ?? '')
  const [searching, setSearching] = useState(false)
  const [suggestions, setSuggestions] = useState<PlaceResult[]>([])
  const [locating, setLocating] = useState(false)
  const [picked, setPicked] = useState<{ latitude: number; longitude: number } | null>(initialCoords ?? null)
  const [label, setLabel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)

  async function updateLabel(lat: number, lng: number) {
    setLabel(null)
    try {
      setLabel(await reverseGeocode(lat, lng))
    } catch {
      // La etiqueta es solo informativa — las coordenadas ya han quedado guardadas.
    }
  }

  function placeMarker(lat: number, lng: number, recenter: boolean) {
    const map = mapRef.current
    if (!map) return
    const position = { lat, lng }
    if (markerRef.current) {
      markerRef.current.setPosition(position)
    } else {
      markerRef.current = new google.maps.Marker({ map, position, draggable: true })
      markerRef.current.addListener('dragend', () => {
        const pos = markerRef.current!.getPosition()
        if (!pos) return
        setPicked({ latitude: pos.lat(), longitude: pos.lng() })
        void updateLabel(pos.lat(), pos.lng())
      })
    }
    if (recenter) {
      map.setCenter(position)
      map.setZoom(Math.max(map.getZoom() ?? 15, 15))
    }
    setPicked({ latitude: lat, longitude: lng })
  }

  useEffect(() => {
    let cancelled = false
    if (!allowGoogleMapsUse('map')) {
      setMapError(errorMessage(new GoogleMapsDailyLimitError(), 'No se pudo cargar el mapa'))
      return
    }
    loadGoogleMaps()
      .then((g) => {
        if (cancelled || !containerRef.current || mapRef.current) return
        const start = initialCoords ? { lat: initialCoords.latitude, lng: initialCoords.longitude } : DEFAULT_CENTER
        const map = new g.maps.Map(containerRef.current, {
          center: start,
          zoom: initialCoords ? 15 : 6,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        })
        map.addListener('click', (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return
          placeMarker(e.latLng.lat(), e.latLng.lng(), false)
          void updateLabel(e.latLng.lat(), e.latLng.lng())
        })
        mapRef.current = map
        if (initialCoords) {
          placeMarker(initialCoords.latitude, initialCoords.longitude, false)
          void updateLabel(initialCoords.latitude, initialCoords.longitude)
        }
      })
      .catch((err) => setMapError(errorMessage(err, 'No se pudo cargar el mapa')))
    return () => {
      cancelled = true
      markerRef.current = null
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSearch() {
    if (!query.trim()) return
    setSearching(true)
    setError(null)
    try {
      setSuggestions(await searchPlaces(query.trim()))
    } catch {
      setError('No se pudo buscar esa dirección ahora mismo.')
    } finally {
      setSearching(false)
    }
  }

  function pickSuggestion(s: PlaceResult) {
    placeMarker(s.latitude, s.longitude, true)
    setLabel(s.label)
    setSuggestions([])
  }

  async function handleUseCurrentPosition() {
    setLocating(true)
    setError(null)
    try {
      const pos = await getCurrentPosition()
      placeMarker(pos.latitude, pos.longitude, true)
      void updateLabel(pos.latitude, pos.longitude)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo obtener la ubicación'))
    } finally {
      setLocating(false)
    }
  }

  function handleConfirm() {
    if (!picked) return
    onConfirm({ ...picked, label })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet location-picker-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Elegir ubicación en el mapa
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="inline-fields" style={{ marginBottom: 8 }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void handleSearch()
              }
            }}
            placeholder="Busca una dirección o el nombre de un sitio"
            style={{ flex: 1 }}
          />
          <button type="button" className="link-button" onClick={handleSearch} disabled={!query.trim() || searching}>
            {searching ? 'Buscando…' : '🔍 Buscar'}
          </button>
        </div>
        {suggestions.length > 0 && (
          <div className="card" style={{ padding: 8, marginBottom: 8 }}>
            {suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                className="link-button"
                style={{ display: 'block', textAlign: 'left', width: '100%', padding: '4px 0' }}
                onClick={() => pickSuggestion(s)}
              >
                📍 {s.label}
              </button>
            ))}
          </div>
        )}
        {mapError ? <p className="error">{mapError}</p> : <div ref={containerRef} className="location-picker-map" />}
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Toca cualquier punto del mapa, o arrastra el marcador, para ajustar el sitio exacto.
        </p>
        <div className="inline-fields" style={{ marginTop: 4 }}>
          <button type="button" className="link-button" onClick={handleUseCurrentPosition} disabled={locating}>
            {locating ? 'Obteniendo…' : '📍 Usar mi ubicación actual'}
          </button>
        </div>
        {picked && (
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            {label ?? `${picked.latitude.toFixed(5)}, ${picked.longitude.toFixed(5)}`}
          </p>
        )}
        {error && <p className="error">{error}</p>}
        <div className="inline-fields" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
          <button type="button" className="link-button" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" onClick={handleConfirm} disabled={!picked}>
            Confirmar esta ubicación
          </button>
        </div>
      </div>
    </div>
  )
}
