import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { FamilyMember, MemberLocation, MemberLocationPoint } from '@/domain/types'

// Mapa interactivo (Leaflet + OpenStreetMap, gratis y sin API key) con
// la posición de cada persona y su ruta de las últimas 24h. El marcador
// es un círculo con la foto de perfil si la tiene, o su inicial si no.
export function LocationMap({
  members,
  locations,
  histories,
  photoUrls,
}: {
  members: FamilyMember[]
  locations: MemberLocation[]
  histories: Record<string, MemberLocationPoint[]>
  photoUrls: Record<string, string>
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)

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
    layer.clearLayers()

    const bounds: L.LatLngExpression[] = []

    for (const loc of locations) {
      const member = members.find((m) => m.id === loc.memberId)
      if (!member) continue

      const photoUrl = photoUrls[member.id]
      const icon = L.divIcon({
        className: 'member-map-marker',
        html: photoUrl
          ? `<img src="${photoUrl}" style="width:36px;height:36px;border-radius:50%;border:3px solid ${member.color};object-fit:cover;display:block" />`
          : `<span style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;border:3px solid ${member.color};background:${member.color};color:white;font-weight:600">${member.name.charAt(0)}</span>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      })

      L.marker([loc.latitude, loc.longitude], { icon }).addTo(layer).bindPopup(member.name)
      bounds.push([loc.latitude, loc.longitude])

      const history = histories[member.id] ?? []
      if (history.length >= 2) {
        const path = history.map((p) => [p.latitude, p.longitude] as L.LatLngExpression)
        L.polyline(path, { color: member.color, weight: 3, opacity: 0.7 }).addTo(layer)
        bounds.push(...path)
      }
    }

    if (bounds.length > 0) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30], maxZoom: 16 })
    }
  }, [members, locations, histories, photoUrls])

  return <div ref={containerRef} className="location-map" />
}
