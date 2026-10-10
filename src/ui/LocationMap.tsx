import { useEffect, useRef, useState } from 'react'
import { loadGoogleMaps } from '@/services/googleMapsLoader'
import { allowGoogleMapsUse } from '@/services/googleMapsUsageGuard'
import { buildTrackDetail, decodePolyline, distanceMeters, type TrackPoint } from '@/domain/geo'
import { chunkVehicleRun, splitIntoParts } from '@/domain/roadTrace'
import { routeColorFor } from '@/domain/routeColor'
import { getCachedRoad, joinRoadPaths, requestRoad, type RoadPath } from '@/services/roadTrace'
import type { FamilyMember, MemberLocation, MemberLocationPoint } from '@/domain/types'

function markerIconHtml(member: FamilyMember, photoUrl: string | undefined): string {
  return photoUrl
    ? `<img src="${photoUrl}" style="width:36px;height:36px;border-radius:50%;border:3px solid ${member.color};object-fit:cover;display:block" />`
    : `<span style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;border:3px solid ${member.color};background:${member.color};color:white;font-weight:600">${member.name.charAt(0)}</span>`
}

type PhotoMarkerOverlay = google.maps.OverlayView & {
  setClickHandler: (handler: () => void) => void
  setHtml: (html: string) => void
  setPosition: (position: google.maps.LatLngLiteral) => void
}

// Marcador con foto/inicial redonda (Google Maps no trae ese estilo de
// serie) — un OverlayView que sigue al mapa, igual que hacía el divIcon
// de Leaflet antes.
//
// OJO: la clase se construye AQUÍ, no en el módulo — «extends
// google.maps.OverlayView» se evaluaría en cuanto se importa el
// archivo, y el script de Google (que crea `google`) se carga aparte,
// de forma asíncrona. Definirla a este nivel rompía la pantalla entera
// con «google is not defined» antes incluso de intentar pintar el
// mapa (bug real, visto en producción). Se construye una única vez, la
// primera vez que hace falta, y se reutiliza siempre después.
let PhotoMarkerOverlayClass: (new (position: google.maps.LatLngLiteral, html: string) => PhotoMarkerOverlay) | null = null

function getPhotoMarkerOverlayClass(g: typeof google) {
  if (!PhotoMarkerOverlayClass) {
    PhotoMarkerOverlayClass = class extends g.maps.OverlayView {
      private div: HTMLDivElement | null = null
      private position: google.maps.LatLng
      private onClick: (() => void) | undefined

      constructor(
        position: google.maps.LatLngLiteral,
        private html: string,
      ) {
        super()
        this.position = new g.maps.LatLng(position)
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
        this.position = new g.maps.LatLng(position)
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
  }
  return PhotoMarkerOverlayClass
}

// Mapa interactivo (Google Maps, con el tráfico en vivo activado) con
// la posición de cada persona y su ruta de las últimas 24h. El
// marcador es un círculo con la foto de perfil si la tiene, o su

// Tramo SIN datos (el móvil no mandó nada por el medio): se dibuja de rayas, y si está lejos, por la carretera más probable entre sus dos
// extremos (lo que hace el historial de Google) en vez de en recta cruzando campos. Sigue siendo una estimación: por eso va de rayas.
const MIN_GAP_ROAD_M = 1000
function roadAwareGap(pair: [{ lat: number; lng: number }, { lat: number; lng: number }], onLoaded: () => void): RoadPath {
  const [a, b] = pair
  if (distanceMeters(a.lat, a.lng, b.lat, b.lng) < MIN_GAP_ROAD_M) return pair
  const r = (n: number) => n.toFixed(5)
  const chunk = {
    key: `gap|${r(a.lat)},${r(a.lng)}>${r(b.lat)},${r(b.lng)}`,
    waypoints: [
      { latitude: a.lat, longitude: a.lng },
      { latitude: b.lat, longitude: b.lng },
    ],
  }
  const cached = getCachedRoad(chunk.key)
  if (cached === undefined) void requestRoad(chunk).then((path) => path && onLoaded())
  return cached && cached.length >= 2 ? cached : pair
}

// Camino a dibujar para un tramo continuo: los trozos «en coche» por la carretera (si ya se conoce su trazado), el resto como vienen. Si falta
// algún trazado, se devuelve el tramo tal cual (línea recta) y se pide en segundo plano; `onLoaded` avisa para volver a pintar.
function roadAwarePath(points: TrackPoint[], raw: RoadPath, onLoaded: () => void): RoadPath {
  const parts = splitIntoParts(points)
  if (!parts.some((part) => part.mode === 'vehicle')) return raw
  const out: RoadPath = []
  for (const part of parts) {
    let piece: RoadPath = part.points.map((p) => ({ lat: p.lat, lng: p.lng }))
    if (part.mode === 'vehicle') {
      const chunks = chunkVehicleRun(part.points)
      const cached = chunks.map((chunk) => getCachedRoad(chunk.key))
      chunks.forEach((chunk, i) => {
        if (cached[i] === undefined) void requestRoad(chunk).then((path) => path && onLoaded())
      })
      if (chunks.length > 0 && cached.every((path) => path && path.length >= 2)) piece = joinRoadPaths(cached as RoadPath[])
    }
    out.push(...(out.length ? piece.slice(1) : piece))
  }
  return out
}

// inicial si no.
export function LocationMap({
  members,
  locations,
  histories,
  photoUrls,
  onSelectMember,
  routePolyline,
}: {
  members: FamilyMember[]
  locations: MemberLocation[]
  histories: Record<string, MemberLocationPoint[]>
  photoUrls: Record<string, string>
  onSelectMember?: (memberId: string) => void
  // Petición real: "que me marque la ruta hasta Madrid como en Google Maps" — el trazado (formato
  // polyline de Google, sin decodificar) de la última ruta calculada, o null si no hay ninguna.
  routePolyline?: string | null
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  // Sube cuando llega de Google el trazado por carretera de algún trozo: obliga a volver a pintar las líneas con la carretera.
  const [roadTick, setRoadTick] = useState(0)
  const mapRef = useRef<google.maps.Map | null>(null)
  const googleRef = useRef<typeof google | null>(null)
  const markersRef = useRef<Map<string, PhotoMarkerOverlay>>(new Map())
  // Varias líneas por persona: trozos continuos + tramos discontinuos sin datos.
  const polylinesRef = useRef<Map<string, google.maps.Polyline[]>>(new Map())
  const lineSignaturesRef = useRef<Map<string, string>>(new Map())
  const routeLineRef = useRef<google.maps.Polyline | null>(null)
  // Solo se vuelve a encuadrar el mapa cuando la ruta CAMBIA (no en cada
  // render con la misma ruta) — mismo motivo que fittedIdsRef más abajo.
  const fittedRouteRef = useRef<string | null>(null)
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
    if (!allowGoogleMapsUse('map')) return
    loadGoogleMaps()
      .then((g) => {
        if (cancelled || !containerRef.current || mapRef.current) return
        googleRef.current = g
        const map = new g.maps.Map(containerRef.current, {
          center: { lat: 40.4168, lng: -3.7038 },
          zoom: 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          // Petición real: "que se pueda mover con un dedo no con los 2 dedos como ahora y que se
          // pueda ampliar y disminuir pellizcando" — por defecto, en móvil, Google Maps exige 2
          // dedos para mover el mapa (así el dedo de toda la pantalla no se queda "atrapado" si el
          // mapa está dentro de una página con scroll). 'greedy' hace que un solo dedo mueva el
          // mapa y el pellizco haga zoom, sin pedir los 2 dedos.
          gestureHandling: 'greedy',
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
      routeLineRef.current = null
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
    const g = googleRef.current
    if (!map || !g) return
    const Overlay = getPhotoMarkerOverlayClass(g)

    function clearMemberLines(memberId: string) {
      for (const line of polylinesRef.current.get(memberId) ?? []) line.setMap(null)
      polylinesRef.current.delete(memberId)
      lineSignaturesRef.current.delete(memberId)
    }

    const seenIds = new Set<string>()
    const bounds = new g.maps.LatLngBounds()
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
        const marker = new Overlay(position, html)
        marker.setClickHandler(() => onSelectMemberRef.current?.(member.id))
        marker.setMap(map)
        markersRef.current.set(member.id, marker)
      }
      bounds.extend(position)
      hasBounds = true

      // Petición real: "el mapa no marca el recorrido bien". Un rastro con huecos de horas ya no se une con
      // una recta: lo que se sabe va en línea continua y lo que no (el móvil no mandó nada por el medio)
      // en discontinua — ver buildTrackSegments.
      const history = histories[member.id] ?? []
      const detail = history.length >= 2 ? buildTrackDetail(history.map((p) => ({ lat: p.latitude, lng: p.longitude, at: new Date(p.recordedAt).getTime() }))) : { solid: [], gaps: [], solidPoints: [] }
      const gaps = detail.gaps.map((pair) => roadAwareGap(pair, () => setRoadTick((t) => t + 1)))
      // Los trozos «en coche» se dibujan por la CARRETERA (petición real: «tiene que marcarme la carretera por la que va»): si ya se conoce su
      // trazado se usa; si no, se dibuja la línea recta de siempre y se pide en segundo plano (al llegar, se vuelve a pintar).
      const solid = detail.solid.map((raw, i) => roadAwarePath(detail.solidPoints[i], raw, () => setRoadTick((t) => t + 1)))
      for (const path of solid) for (const p of path) bounds.extend(p)
      for (const path of gaps) for (const p of path) bounds.extend(p)

      // Las líneas solo se recrean si el rastro ha cambiado de verdad — con cada refresco de posición
      // (cada 30 s) borrar y volver a pintarlas todas haría parpadear el mapa, como ya pasó con los marcadores.
      const signature = JSON.stringify([routeColorFor(member.color, member.id), solid.map((s) => [s.length, s[0], s[s.length - 1]]), gaps.map((g) => [g.length, g[0], g[g.length - 1]])])
      if (lineSignaturesRef.current.get(member.id) === signature && polylinesRef.current.has(member.id)) continue
      clearMemberLines(member.id)
      lineSignaturesRef.current.set(member.id, signature)
      const lines: google.maps.Polyline[] = []
      const routeColor = routeColorFor(member.color, member.id)
      for (const path of solid) {
        // Borde blanco (más ancho, por debajo) + línea del color de la persona encima.
        lines.push(new g.maps.Polyline({ path, strokeColor: '#ffffff', strokeWeight: 8, strokeOpacity: 0.9, zIndex: 1, map }))
        lines.push(new g.maps.Polyline({ path, strokeColor: routeColor, strokeWeight: 5, strokeOpacity: 1, zIndex: 2, map }))
      }
      for (const gapPath of gaps) {
        // strokeOpacity 0 + un icono repetido = línea de rayas (la forma que trae Google Maps).
        lines.push(
          new g.maps.Polyline({
            path: gapPath,
            strokeOpacity: 0,
            icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.85, strokeColor: routeColor, scale: 3 }, offset: '0', repeat: '14px' }],
            map,
          }),
        )
      }
      if (lines.length > 0) polylinesRef.current.set(member.id, lines)
    }

    // Quita marcadores/rutas de quien haya dejado de compartir.
    for (const [id, marker] of markersRef.current) {
      if (!seenIds.has(id)) {
        marker.setMap(null)
        markersRef.current.delete(id)
        clearMemberLines(id)
      }
    }

    const idsKey = [...seenIds].sort().join(',')
    if (hasBounds && idsKey !== fittedIdsRef.current) {
      map.fitBounds(bounds, 30)
      const maxZoomListener = g.maps.event.addListenerOnce(map, 'bounds_changed', () => {
        if ((map.getZoom() ?? 0) > 16) map.setZoom(16)
      })
      fittedIdsRef.current = idsKey
      // Evita que el listener se quede colgado si el mapa se destruye justo después.
      setTimeout(() => g.maps.event.removeListener(maxZoomListener), 2000)
    }
  }

  useEffect(() => {
    pendingRef.current = { locations, histories, photoUrls }
    if (mapRef.current) render(pendingRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, locations, histories, photoUrls, roadTick])

  // Petición real: "que me marque la ruta hasta Madrid como en Google Maps" — una línea aparte de
  // las del rastro de 24h (esas son por persona, de su color; esta es LA ruta planeada hasta un
  // destino, en el azul de Google Maps). Si el mapa todavía no ha cargado cuando llega la ruta, se
  // pierde (no hay nada pendiente que reintentar) — en la práctica no pasa, porque una ruta solo
  // llega después de pedirla a propósito, con la pantalla ya abierta un rato.
  useEffect(() => {
    const map = mapRef.current
    const g = googleRef.current
    if (!map || !g) return

    if (!routePolyline) {
      routeLineRef.current?.setMap(null)
      routeLineRef.current = null
      fittedRouteRef.current = null
      return
    }

    const path = decodePolyline(routePolyline)
    if (path.length === 0) return

    if (routeLineRef.current) {
      routeLineRef.current.setPath(path)
    } else {
      routeLineRef.current = new g.maps.Polyline({ path, strokeColor: '#4285F4', strokeWeight: 5, strokeOpacity: 0.85, map })
    }

    if (fittedRouteRef.current !== routePolyline) {
      const bounds = new g.maps.LatLngBounds()
      for (const point of path) bounds.extend(point)
      map.fitBounds(bounds, 40)
      fittedRouteRef.current = routePolyline
    }
  }, [routePolyline])

  return <div ref={containerRef} className="location-map" />
}
