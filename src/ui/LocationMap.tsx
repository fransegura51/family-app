import { useEffect, useRef } from 'react'
import { loadGoogleMaps } from '@/services/googleMapsLoader'
import type { FamilyMember, MemberLocation, MemberLocationPoint } from '@/domain/types'

function markerIconHtml(member: FamilyMember, photoUrl: string | undefined): string {
  return photoUrl
    ? `<img src="${photoUrl}" style="width:36px;height:36px;border-radius:50%;border:3px solid ${member.color};object-fit:cover;display:block" />`
    : `<span style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;border:3px solid ${member.color};background:${member.color};color:white;font-weight:600">${member.name.charAt(0)}</span>`
}

// Marcador con foto/inicial redonda (Google Maps no trae ese estilo de
// serie) — un OverlayView que sigue al mapa, igual que hacía el divIcon
// de Leaflet antes.
class PhotoMarkerOverlay extends google.maps.OverlayView {
  private div: HTMLDivElement | null = null
  private position: google.maps.LatLng
  private onClick: (() => void) | undefined

  constructor(
    position: google.maps.LatLngLiteral,
    private html: string,
  ) {
    super()
    this.position = new google.maps.LatLng(position)
  }

  setClickHandler(handler: () => void) {
    this.onClick = handler
    if (this.div) this.div.onclick = handler
  }

  setHtml(html: string) {
    this.html = html
    if (this.div) this.div.innerHTML = html
  }

  setPosition(position: google.maps.LatLngLiteral) {
    this.position = new google.maps.LatLng(position)
    this.draw()
  }

  override onAdd() {
    const div = document.createElement('div')
    div.style.position = 'absolute'
    div.style.cursor = 'pointer'
    div.innerHTML = this.html
    if (this.onClick) div.onclick = this.onClick
    this.div = div
    this.getPanes()?.overlayMouseTarget.appendChild(div)
  }

  override draw() {
    if (!this.div) return
    const projection = this.getProjection()
    if (!projection) return
    const point = projection.fromLatLngToDivPixel(this.position)
    if (!point) return
    this.div.style.left = `${point.x - 18}px`
    this.div.style.top = `${point.y - 18}px`
  }

  override onRemove() {
    this.div?.remove()
    this.div = null
  }
}

// Mapa interactivo (Google Maps, con el tráfico en vivo activado) con
// la posición de cada persona y su ruta de las últimas 24h. El
// marcador es un círculo con la foto de perfil si la tiene, o su
// inicial si no.
export function LocationMap({
  members,
  locations,
  histories,
  photoUrls,
  onSelectMember,
}: {
  members: FamilyMember[]
  locations: MemberLocation[]
  histories: Record<string, MemberLocationPoint[]>
  photoUrls: Record<string, string>
  onSelectMember?: (memberId: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<Map<string, PhotoMarkerOverlay>>(new Map())
  const polylinesRef = useRef<Map<string, google.maps.Polyline>>(new Map())
  // Recuerda a quién se le ajustó ya el encuadre — así solo se vuelve a
  // centrar/hacer zoom cuando aparece o desaparece alguien, no en cada
  // actualización de posición (antes el mapa "parpadeaba": se
  // recentraba y volvía a hacer zoom con cada nuevo punto GPS, muchas
  // veces por minuto — bug real reportado desde iPhone).
  const fittedIdsRef = useRef<string>('')
  // En un ref para no tener que meter onSelectMember en las dependencias
  // del efecto de abajo (que recrearía marcadores de más en cada
  // render solo porque el padre pasó una función nueva).
  const onSelectMemberRef = useRef(onSelectMember)
  onSelectMemberRef.current = onSelectMember
  // Los props llegan antes de que el mapa termine de cargar (la carga del
  // script es async) — se guardan en un ref y el segundo efecto los pinta
  // en cuanto el mapa está listo.
  const pendingRef = useRef<{ locations: MemberLocation[]; histories: Record<string, MemberLocationPoint[]>; photoUrls: Record<string, string> } | null>(
    null,
  )

  useEffect(() => {
    let cancelled = false
    const markers = markersRef.current
    const polylines = polylinesRef.current
    loadGoogleMaps()
      .then((g) => {
        if (cancelled || !containerRef.current || mapRef.current) return
        const map = new g.maps.Map(containerRef.current, {
          center: { lat: 40.4168, lng: -3.7038 },
          zoom: 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        })
        new g.maps.TrafficLayer().setMap(map)
        mapRef.current = map
        if (pendingRef.current) render(pendingRef.current)
      })
      .catch(() => {
        // Sin la clave de Google Maps configurada no hay mapa — el resto de la
        // pantalla (chips de miembros, lista de lugares) sigue funcionando.
      })
    return () => {
      cancelled = true
      mapRef.current = null
      markers.clear()
      polylines.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function render({
    locations,
    histories,
    photoUrls,
  }: {
    locations: MemberLocation[]
    histories: Record<string, MemberLocationPoint[]>
    photoUrls: Record<string, string>
  }) {
    const map = mapRef.current
    if (!map) return

    const seenIds = new Set<string>()
    const bounds = new google.maps.LatLngBounds()
    let hasBounds = false

    for (const loc of locations) {
      const member = members.find((m) => m.id === loc.memberId)
      if (!member) continue
      seenIds.add(member.id)

      const position = { lat: loc.latitude, lng: loc.longitude }
      const html = markerIconHtml(member, photoUrls[member.id])
      const existingMarker = markersRef.current.get(member.id)
      // Mover el marcador ya existente en vez de borrar y crear uno
      // nuevo — quitar y volver a poner el icono es lo que se veía
      // como parpadeo en cada actualización de posición.
      if (existingMarker) {
        existingMarker.setPosition(position)
        existingMarker.setHtml(html)
      } else {
        const marker = new PhotoMarkerOverlay(position, html)
        marker.setClickHandler(() => onSelectMemberRef.current?.(member.id))
        marker.setMap(map)
        markersRef.current.set(member.id, marker)
      }
      bounds.extend(position)
      hasBounds = true

      const history = histories[member.id] ?? []
      if (history.length >= 2) {
        const path = history.map((p) => ({ lat: p.latitude, lng: p.longitude }))
        const existingLine = polylinesRef.current.get(member.id)
        if (existingLine) {
          existingLine.setPath(path)
        } else {
          const line = new google.maps.Polyline({ path, strokeColor: member.color, strokeWeight: 3, strokeOpacity: 0.7, map })
          polylinesRef.current.set(member.id, line)
        }
        for (const p of path) bounds.extend(p)
      } else {
        polylinesRef.current.get(member.id)?.setMap(null)
        polylinesRef.current.delete(member.id)
      }
    }

    // Quita marcadores/rutas de quien haya dejado de compartir.
    for (const [id, marker] of markersRef.current) {
      if (!seenIds.has(id)) {
        marker.setMap(null)
        markersRef.current.delete(id)
        polylinesRef.current.get(id)?.setMap(null)
        polylinesRef.current.delete(id)
      }
    }

    const idsKey = [...seenIds].sort().join(',')
    if (hasBounds && idsKey !== fittedIdsRef.current) {
      map.fitBounds(bounds, 30)
      const maxZoomListener = google.maps.event.addListenerOnce(map, 'bounds_changed', () => {
        if ((map.getZoom() ?? 0) > 16) map.setZoom(16)
      })
      fittedIdsRef.current = idsKey
      // Evita que el listener se quede colgado si el mapa se destruye justo después.
      setTimeout(() => google.maps.event.removeListener(maxZoomListener), 2000)
    }
  }

  useEffect(() => {
    pendingRef.current = { locations, histories, photoUrls }
    if (mapRef.current) render(pendingRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, locations, histories, photoUrls])

  return <div ref={containerRef} className="location-map" />
}
