import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { FamilyMember, MemberLocation, MemberLocationPoint } from '@/domain/types'

function markerIconHtml(member: FamilyMember, photoUrl: string | undefined): string {
  return photoUrl
    ? `<img src="${photoUrl}" style="width:36px;height:36px;border-radius:50%;border:3px solid ${member.color};object-fit:cover;display:block" />`
    : `<span style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;border:3px solid ${member.color};background:${member.color};color:white;font-weight:600">${member.name.charAt(0)}</span>`
}

// Mapa interactivo (Leaflet + OpenStreetMap, gratis y sin API key) con
// la posición de cada persona y su ruta de las últimas 24h. El marcador
// es un círculo con la foto de perfil si la tiene, o su inicial si no.
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
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())
  const polylinesRef = useRef<Map<string, L.Polyline>>(new Map())
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

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current).setView([40.4168, -3.7038], 12)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map)
    mapRef.current = map
    layerRef.current = L.layerGroup().addTo(map)
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return

    const seenIds = new Set<string>()
    const bounds: L.LatLngExpression[] = []

    for (const loc of locations) {
      const member = members.find((m) => m.id === loc.memberId)
      if (!member) continue
      seenIds.add(member.id)

      const latLng: L.LatLngExpression = [loc.latitude, loc.longitude]
      const existingMarker = markersRef.current.get(member.id)
      // Mover el marcador ya existente en vez de borrar y crear uno
      // nuevo — quitar y volver a poner el icono es lo que se veía
      // como parpadeo en cada actualización de posición.
      if (existingMarker) {
        existingMarker.setLatLng(latLng)
        existingMarker.setIcon(
          L.divIcon({
            className: 'member-map-marker',
            html: markerIconHtml(member, photoUrls[member.id]),
            iconSize: [36, 36],
            iconAnchor: [18, 18],
          }),
        )
      } else {
        const marker = L.marker(latLng, {
          icon: L.divIcon({
            className: 'member-map-marker',
            html: markerIconHtml(member, photoUrls[member.id]),
            iconSize: [36, 36],
            iconAnchor: [18, 18],
          }),
        })
          .addTo(layer)
          .on('click', () => onSelectMemberRef.current?.(member.id))
        markersRef.current.set(member.id, marker)
      }
      bounds.push(latLng)

      const history = histories[member.id] ?? []
      if (history.length >= 2) {
        const path = history.map((p) => [p.latitude, p.longitude] as L.LatLngExpression)
        const existingLine = polylinesRef.current.get(member.id)
        if (existingLine) {
          existingLine.setLatLngs(path)
        } else {
          const line = L.polyline(path, { color: member.color, weight: 3, opacity: 0.7 }).addTo(layer)
          polylinesRef.current.set(member.id, line)
        }
        bounds.push(...path)
      } else {
        polylinesRef.current.get(member.id)?.remove()
        polylinesRef.current.delete(member.id)
      }
    }

    // Quita marcadores/rutas de quien haya dejado de compartir.
    for (const [id, marker] of markersRef.current) {
      if (!seenIds.has(id)) {
        marker.remove()
        markersRef.current.delete(id)
        polylinesRef.current.get(id)?.remove()
        polylinesRef.current.delete(id)
      }
    }

    const idsKey = [...seenIds].sort().join(',')
    if (bounds.length > 0 && idsKey !== fittedIdsRef.current) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30], maxZoom: 16 })
      fittedIdsRef.current = idsKey
    }
  }, [members, locations, histories, photoUrls])

  return <div ref={containerRef} className="location-map" />
}
