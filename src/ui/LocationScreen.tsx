import { KitchenHeaderWithMenu } from '@/ui/KitchenHeaderWithMenu'
import { FormEvent, useEffect, useRef, useState } from 'react'
import { SectionBreadcrumb } from '@/ui/SectionBreadcrumb'
import { useSectionHome } from '@/ui/useSectionHome'
import {
  UBICACION_MENU_ITEM_META,
  ubicacionMenuEntryMeta,
  isCustomUbicacionMenuKey,
  loadUbicacionMenuLayout,
  loadUbicacionPinnedItems,
  saveUbicacionPinnedItems,
  type UbicacionMenuEntry,
  type UbicacionMenuGroup,
  type UbicacionMenuItemKey,
} from '@/state/ubicacionMenu'
import {
  addPlace,
  createAutomationRule,
  deleteAutomationRule,
  deletePlace,
  listAutomationRules,
  listConsents,
  listMemberLocationHistory,
  listMemberLocations,
  listPlaces,
  listPlaceVisits,
  muteAutomationRule,
  PLACE_NOTIFY_RULE_PREFIX,
  setConsent,
  setPlaceNotifyArrivals,
  toggleAutomationRule,
  updatePlace,
} from '@/data/location'
import { getMemberPhotoUrl, listFamilyMembers } from '@/data/family'
import { ConfirmButton } from '@/ui/ConfirmButton'
import { distanceMeters, formatDistance, formatDuration, trafficDescription } from '@/domain/geo'
import { getCurrentPosition } from '@/services/geolocation'
import { getDrivingEta, type DrivingEta } from '@/services/drivingEta'
import { shareText } from '@/services/share'
import {
  getLastError as getSharingError,
  getLastPosition,
  getSharingMemberId,
  startSharing as startSharingGlobal,
  stopSharing as stopSharingGlobal,
  subscribe as subscribeSharing,
} from '@/services/locationSharing'
import { LocationMap } from '@/ui/LocationMap'
import { LocationPickerModal } from '@/ui/LocationPickerModal'
import { MemberAvatar } from '@/ui/MemberAvatar'
import type {
  AutomationRule,
  AutomationTriggerType,
  FamilyMember,
  FamilyRole,
  LocationConsent,
  LocationPlace,
  LocationPlaceVisit,
  MemberLocation,
  MemberLocationPoint,
} from '@/domain/types'
import ubicacionHeaderImg from '@/assets/ubicacion/ubicacion-header.jpg'
import { errorMessage } from '@/domain/errorMessage'
import { describePositionAge } from '@/domain/positionFreshness'
import { googleMapsUrl } from '@/domain/memberWhere'
import { consumeMemberFocus, onMemberFocus } from '@/services/mapFocus'
import { pastelPalette } from '@/domain/colors'
import { formatTime } from '@/domain/dateFormat'
import { usePrefChange } from '@/state/prefs/usePrefChange'
import { useHelpDestinations } from '@/help/destinations'
import { HelpDestMark } from '@/help/ui/HelpDest'
import { emitHelpEvent } from '@/help/tours/helpBus'

const SUB_TABS = ['Inicio', 'Ubicación', 'Reglas'] as const
type SubTab = (typeof SUB_TABS)[number]

function isUbicacionSubTab(key: UbicacionMenuItemKey): key is SubTab {
  return (SUB_TABS as readonly string[]).includes(key)
}

export function LocationScreen({ role, profileId }: { role: FamilyRole; profileId: string }) {
  const [tab, setTab] = useState<SubTab>('Inicio')
  // "Ubicación" del breadcrumb siempre vuelve a Inicio, incluso ya estando en /ubicacion.
  useSectionHome(() => setTab('Inicio'))
  // «Llévame» y tutoriales de la Ayuda: las pestañas de Ubicación (no son rutas) se abren por su nombre.
  useHelpDestinations({
    'ubicacion.inicio': () => setTab('Inicio'),
    'ubicacion.mapa': () => setTab('Ubicación'),
    'ubicacion.reglas': () => setTab('Reglas'),
    // Las tres pestañas de debajo del mapa viven dentro de «Ubicación»: aquí se abre esa pestaña principal y LocationTab elige la interna (mismo destino).
    'ubicacion.lugares': () => setTab('Ubicación'),
    'ubicacion.estoy-aqui': () => setTab('Ubicación'),
    'ubicacion.compartir': () => setTab('Ubicación'),
  })
  // Petición real: "el formato que has hecho ahora para meter todas
  // las pestañas me gusta mucho, aplícalo a toda la aplicación" —
  // mismo desplegable ☰ con sacar/meter/editar que Economía.
  const [menuOpen, setMenuOpen] = useState(false)
  const [pinnedItems, setPinnedItems] = useState<UbicacionMenuItemKey[]>(() => loadUbicacionPinnedItems())
  const [menuLayout, setMenuLayout] = useState<UbicacionMenuGroup[]>(() => loadUbicacionMenuLayout())
  usePrefChange('familyapp:ubicacion-pinned-tabs', () => setPinnedItems(loadUbicacionPinnedItems()))
  usePrefChange('familyapp:ubicacion-menu-layout', () => setMenuLayout(loadUbicacionMenuLayout()))
  const [placeholderNotice, setPlaceholderNotice] = useState(false)

  function togglePinnedItem(key: UbicacionMenuItemKey) {
    setPinnedItems((prev) => {
      const next = prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]
      saveUbicacionPinnedItems(next)
      return next
    })
  }

  function handleAction(key: UbicacionMenuItemKey) {
    if (isUbicacionSubTab(key)) setTab(key)
  }

  const flatMenuEntries = menuLayout.flatMap((g) => g.items)

  return (
    <div className="screen">
      {/* Petición real, con imagen de referencia: "cabecera Ubicación,
          mismas instrucciones que antes" (mismo tratamiento que las
          demás cabeceras con foto). */}
      <KitchenHeaderWithMenu
        imgSrc={ubicacionHeaderImg}
        alt="Ubicación"
        open={menuOpen}
        ariaLabel={menuOpen ? 'Cerrar menú de Ubicación' : 'Abrir menú de Ubicación'}
        helpId="ubicacion.menu"
        onToggle={() => {
            if (!menuOpen) window.scrollTo({ top: 0, behavior: 'smooth' })
            setMenuOpen((v) => !v)
          }}
      />
      <SectionBreadcrumb subsection={UBICACION_MENU_ITEM_META[tab].label} />
      <p className="muted" data-help-id="ubicacion.intro">
        Desactivada por defecto. Solo se comparte si activas el consentimiento explícitamente. El
        mapa muestra la ruta de las últimas 24h — pasado ese tiempo se borra sola. Línea continua: recorrido
        registrado. Línea de rayas: tramo sin datos (el móvil solo manda su posición con la app abierta).
      </p>
      {menuOpen && (
        <UbicacionMenuDropdown
          activeTab={tab}
          layout={menuLayout}
          pinnedItems={pinnedItems}
          onTogglePin={togglePinnedItem}
          onActivate={handleAction}
          onClose={() => setMenuOpen(false)}
        />
      )}

      {pinnedItems.length > 0 && (
        <div className="filter-row">
          {flatMenuEntries
            .filter((entry) => pinnedItems.includes(entry.key))
            .map((entry) => {
              const meta = ubicacionMenuEntryMeta(entry)
              return (
                <button
                  key={entry.key}
                  type="button"
                  className={'chip' + (isUbicacionSubTab(entry.key) && tab === entry.key ? ' chip-active' : '')}
                  onClick={() => {
                    if (isCustomUbicacionMenuKey(entry.key)) {
                      setPlaceholderNotice(true)
                      setTimeout(() => setPlaceholderNotice(false), 2500)
                    } else {
                      handleAction(entry.key)
                    }
                  }}
                >
                  {meta.icon} {meta.label}
                </button>
              )
            })}
        </div>
      )}
      {placeholderNotice && (
        <p className="muted" style={{ fontSize: 12 }}>
          Todavía no hay nada aquí — pídemelo cuando lo necesites y lo construyo.
        </p>
      )}

      {tab === 'Inicio' && <HelpDestMark id="ubicacion.inicio" />}
      {tab === 'Ubicación' && <HelpDestMark id="ubicacion.mapa" />}
      {tab === 'Reglas' && <HelpDestMark id="ubicacion.reglas" />}
      {tab === 'Inicio' && <UbicacionInicioTab onNavigate={setTab} />}
      {tab === 'Ubicación' && <LocationTab isAdmin={role === 'admin'} profileId={profileId} />}
      {tab === 'Reglas' && <RulesTab />}
    </div>
  )
}

function UbicacionInicioTab({ onNavigate }: { onNavigate: (tab: SubTab) => void }) {
  const shortcuts: { tab: SubTab; body: string }[] = [
    { tab: 'Ubicación', body: 'Mapa en vivo con dónde está cada uno que lo comparte, y lugares frecuentes guardados.' },
    { tab: 'Reglas', body: 'Avisos automáticos al llegar o salir de un sitio, o todos los días a una hora.' },
  ]
  // Un color pastel por tarjeta, igual que Compras Inicio.
  const cardColors = pastelPalette(shortcuts.length)
  return (
    <div className="event-list">
      {shortcuts.map((s, i) => {
        const meta = UBICACION_MENU_ITEM_META[s.tab]
        return (
          <button
            key={s.tab}
            type="button"
            className="section-shortcut-card"
            style={{ background: cardColors[i] }}
            onClick={() => onNavigate(s.tab)}
          >
            <span className="section-shortcut-card-icon" aria-hidden="true">
              {meta.icon}
            </span>
            <span>
              <strong>{meta.label}</strong>
              <p className="muted" style={{ margin: '4px 0 0' }}>
                {s.body}
              </p>
            </span>
          </button>
        )
      })}
    </div>
  )
}

// Copia de EconomiaMenuDropdown adaptada a las claves de Ubicación —
// mismas clases CSS .economia-menu-* (genéricas).
function UbicacionMenuDropdown({
  activeTab,
  layout,
  pinnedItems,
  onTogglePin,
  onActivate,
  onClose,
}: {
  activeTab: SubTab
  layout: UbicacionMenuGroup[]
  pinnedItems: UbicacionMenuItemKey[]
  onTogglePin: (key: UbicacionMenuItemKey) => void
  onActivate: (key: UbicacionMenuItemKey) => void
  onClose: () => void
}) {
  function handleItemActivate(entry: UbicacionMenuEntry) {
    onActivate(entry.key)
    onClose()
  }

  // Este menú solo deja «📌 Sacar» / «📍 Quitar» (poner el acceso como botón en la pantalla). Ya no hay modo «Editar» (24/10/2026): los «accesos personalizados» no abrían
  // ninguna pantalla y se retiraron; el orden y las categorías que cada persona ya tenía guardados se respetan tal cual.
  return (
    <div className="economia-menu-dropdown">
      {layout.map((group) => {
        const items = group.items.filter((entry) => !isCustomUbicacionMenuKey(entry.key))
        if (items.length === 0) return null
        return (
          <div key={group.id} className="economia-menu-group">
            {group.name && (
              <div className="economia-menu-group-title">
                <span>{group.name}</span>
              </div>
            )}

            {items.map((entry) => {
              const meta = ubicacionMenuEntryMeta(entry)
              const isTab = isUbicacionSubTab(entry.key)

              return (
                <div key={entry.key} className={'economia-menu-row' + (isTab && activeTab === entry.key ? ' active' : '')}>
                  <button type="button" className="economia-menu-item" onClick={() => handleItemActivate(entry)}>
                    <span aria-hidden="true">{meta.icon}</span>
                    {meta.label}
                  </button>

                  <button
                    type="button"
                    className="economia-menu-pin"
                    onClick={() => onTogglePin(entry.key)}
                    aria-label={pinnedItems.includes(entry.key) ? `Quitar ${meta.label} de la pantalla de Ubicación` : `Sacar ${meta.label} a la pantalla de Ubicación`}
                  >
                    {pinnedItems.includes(entry.key) ? '📍 Quitar' : '📌 Sacar'}
                  </button>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------
// Ubicación (Skill 23/28)
// ---------------------------------------------------------------------

function LocationTab({ isAdmin, profileId }: { isAdmin: boolean; profileId: string }) {
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [consents, setConsents] = useState<LocationConsent[]>([])
  const [locations, setLocations] = useState<MemberLocation[]>([])
  const [places, setPlaces] = useState<LocationPlace[]>([])
  const [histories, setHistories] = useState<Record<string, MemberLocationPoint[]>>({})
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Miembro tocado en el mapa o en su chip de arriba — petición real:
  // "que al tocar se abra debajo del mapa la información" (captura de
  // referencia de una app de localización familiar).
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  // «Pepa, ¿dónde está Eric?» (services/mapFocus.ts): se selecciona a esa persona y el mapa se centra en ella. Se recoge al montar (Pepa navega aquí
  // justo después de contestar) y también si la pantalla ya estaba abierta.
  const [memberFocus, setMemberFocus] = useState<{ memberId: string; latitude: number; longitude: number; nonce: number } | null>(null)
  useEffect(() => {
    const apply = (focus: { memberId: string; latitude: number; longitude: number }) => {
      setSelectedMemberId(focus.memberId)
      setMemberFocus({ ...focus, nonce: Date.now() })
    }
    const pending = consumeMemberFocus()
    if (pending) apply(pending)
    return onMemberFocus(apply)
  }, [])
  // El propio compartir (watchPosition) ya no vive aquí — vive en
  // services/locationSharing.ts, fuera de React, para que no se pare al
  // salir de esta pantalla (ver comentario en ese archivo). Aquí solo se
  // refleja su estado.
  const [sharingAs, setSharingAs] = useState<string>(() => getSharingMemberId() ?? '')
  // Petición real: "los lugares frecuentes... en un desplegable". Cerrado por defecto — la pantalla
  // ya tiene bastante arriba (mapa, compartir, formulario de añadir).
  const [placesOpen, setPlacesOpen] = useState(false)
  // Petición real: "lo quiero así" (capturas de Google Maps: pestañas abajo del mapa "Lugares" /
  // "¡Estoy aquí!" / "Compartir ubicación") — debajo del mapa (que se queda fijo, como el chip de
  // cada persona) el contenido se reparte en estas 3 pestañas en vez de ir todo seguido en una sola
  // pantalla larga.
  const [panelTab, setPanelTab] = useState<'lugares' | 'estoy-aqui' | 'compartir'>('lugares')
  // «Llévame» y tutoriales de la Ayuda: las tres pestañas internas tampoco son rutas.
  useHelpDestinations({
    'ubicacion.lugares': () => setPanelTab('lugares'),
    'ubicacion.estoy-aqui': () => setPanelTab('estoy-aqui'),
    'ubicacion.compartir': () => setPanelTab('compartir'),
  })
  // Petición real: "que me marque la ruta hasta Madrid como en Google Maps" — el trazado de la
  // última ruta calculada, para dibujarla en LocationMap. Llega de dos sitios: tocar "ver tiempo en
  // coche" en un lugar guardado (PlaceRow, aquí abajo, prop onRoute) o pedírselo a Pepa por voz
  // desde cualquier pantalla (pepa/location.ts, evento "family-app:route-computed" — igual que ya
  // hacía "busca una tienda" con "family-app:focus-store").
  const [routePolyline, setRoutePolyline] = useState<string | null>(null)
  useEffect(() => {
    function handleRouteComputed(e: Event) {
      const detail = (e as CustomEvent<{ polyline: string }>).detail
      if (detail?.polyline) setRoutePolyline(detail.polyline)
    }
    window.addEventListener('family-app:route-computed', handleRouteComputed)
    return () => window.removeEventListener('family-app:route-computed', handleRouteComputed)
  }, [])

  // `silent` = refresco en segundo plano (la actualización periódica de
  // cada 30s) sin poner toda la pantalla en "Cargando…" — con `setLoading(true)`
  // ahí, la pantalla entera se borraba y volvía a montar cada 30 segundos,
  // incluso en mitad de que alguien tocara "Activar" o eligiera quién
  // lleva el dispositivo (bug real reportado: "no me funciona", captura
  // mostrando la pantalla congelada en "Cargando…").
  //
  // BUG REAL GRAVE (consumo de egress de Supabase disparado, forzó pasar
  // a plan de pago): este refresco silencioso de 30s volvía a descargar
  // el rastro COMPLETO de 24h (miles de puntos por persona, uno cada
  // pocos segundos de GPS) de cada miembro compartiendo, cada 30
  // segundos, mientras alguien dejara esta pantalla abierta — sin
  // límite de tiempo. El historial de ruta no necesita ese refresco tan
  // frecuente (apenas cambia en 30s); ahora el refresco silencioso solo
  // trae la posición ACTUAL de cada uno (minúscula), y el rastro
  // completo se pide solo al entrar en la pantalla.
  function reload(silent = false) {
    if (!silent) setLoading(true)
    Promise.all([listFamilyMembers(), listConsents(), listMemberLocations(), listPlaces()])
      .then(async ([m, c, l, p]) => {
        setMembers(m)
        setConsents(c)
        setLocations(l)
        setPlaces(p)

        if (!silent) {
          const historyEntries = await Promise.all(
            l.map(async (loc) => [loc.memberId, await listMemberLocationHistory(loc.memberId)] as const),
          )
          setHistories(Object.fromEntries(historyEntries))
          lastHistoryFetchRef.current = Date.now()
        }

        const withPhoto = m.filter((mem) => mem.photoPath && l.some((loc) => loc.memberId === mem.id))
        const photoEntries = await Promise.all(
          withPhoto.map(async (mem) => [mem.id, await getMemberPhotoUrl(mem.photoPath!)] as const),
        )
        setPhotoUrls(Object.fromEntries(photoEntries))
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => {
        if (!silent) setLoading(false)
      })
  }

  useEffect(() => reload(), [])

  // El watch vive fuera de este componente (services/locationSharing.ts)
  // precisamente para seguir en marcha aunque se salga de esta pantalla
  // — aquí solo hace falta enterarse de sus cambios (nueva posición,
  // error, alguien más empieza/deja de compartir desde su propio móvil)
  // para reflejarlos en pantalla.
  useEffect(() => {
    return subscribeSharing(() => {
      setSharingAs(getSharingMemberId() ?? '')
      const sharingError = getSharingError()
      if (sharingError) setError(sharingError)
      const pos = getLastPosition()
      if (pos) applyOwnLocationUpdate(pos.memberId, pos.latitude, pos.longitude)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Para ver la posición de los DEMÁS sin tener que recargar todo en
  // cada latido GPS propio (ver applyOwnLocationUpdate) — cada 30s es
  // sobrado para "dónde está ahora" y no machaca la base de datos ni el
  // móvil a peticiones. Silencioso: no debe interrumpir a quien esté
  // tocando algo en ese momento. Ya NO trae el rastro de 24h (ver
  // comentario grande en `reload` — ese era el bug real del consumo
  // disparado de Supabase).
  useEffect(() => {
    const interval = setInterval(() => reload(true), 30_000)
    return () => clearInterval(interval)
  }, [])

  // El rastro de la ruta sí conviene refrescarlo de vez en cuando (para
  // ver avanzar el camino si alguien deja la pantalla abierta viendo a
  // otro moverse), pero mucho más de tarde en tarde que la posición
  // actual — cada 5 minutos en vez de cada 30s, con un ref para no
  // reiniciar el temporizador cada vez que `locations` cambia (si no,
  // nunca llegaría a dispararse).
  const locationsRef = useRef(locations)
  locationsRef.current = locations
  //
  // También al volver a la app tras un rato en segundo plano (prueba real con la app nativa: se hizo un trayecto de 45 minutos con la pantalla de
  // Ubicación abierta de antes y la ruta no aparecía, porque el temporizador de 5 minutos no corre con el móvil bloqueado y el rastro solo se
  // pedía al entrar en la pantalla). Como mucho una vez por minuto — es la misma consulta de siempre, no una más frecuente.
  const lastHistoryFetchRef = useRef(Date.now())
  useEffect(() => {
    async function refreshHistories() {
      lastHistoryFetchRef.current = Date.now()
      try {
        const historyEntries = await Promise.all(
          locationsRef.current.map(async (loc) => [loc.memberId, await listMemberLocationHistory(loc.memberId)] as const),
        )
        setHistories(Object.fromEntries(historyEntries))
      } catch {
        // Un fallo puntual de red aquí no debe romper la pantalla; se reintenta en el siguiente refresco.
      }
    }
    const interval = setInterval(refreshHistories, 5 * 60_000)
    function onVisible() {
      if (document.visibilityState === 'visible' && Date.now() - lastHistoryFetchRef.current > 60_000) void refreshHistories()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  async function handleToggleConsent(memberId: string, enabled: boolean) {
    try {
      await setConsent(memberId, enabled)
      reload()
      // Si te activas TÚ mismo/a (no a otro miembro), tiene sentido pedir
      // ya mismo el permiso de ubicación del teléfono y empezar a
      // compartir desde aquí — si no, quedaba activado en la base de
      // datos pero sin que nada pidiera el permiso ni apareciera el
      // icono (bug real: "lo tengo activado" pero no salía en el mapa).
      // Para otra persona (p.ej. un menor) no tiene sentido: el admin no
      // lleva ese teléfono, así que ahí solo se desbloquea el permiso.
      const member = members.find((m) => m.id === memberId)
      if (enabled && member?.linkedProfileId === profileId) startSharingGlobal(memberId)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo cambiar el consentimiento'))
    }
  }

  // El GPS puede dar una posición nueva varias veces por minuto — antes
  // cada una disparaba un reload() completo (miembros, consentimientos,
  // TODO el historial de TODOS, TODAS las fotos firmadas de nuevo), lo
  // que se notaba como lentitud y como el mapa "parpadeando" al
  // reconstruirse entero de golpe (bug real reportado desde iPhone).
  // Aquí solo se actualiza en el sitio la posición y el historial de
  // ESTA persona, con los datos que ya se acaban de guardar — sin
  // ninguna consulta adicional.
  function applyOwnLocationUpdate(memberId: string, latitude: number, longitude: number) {
    const recordedAt = new Date().toISOString()
    const familyId = members.find((m) => m.id === memberId)?.familyId ?? ''
    setLocations((prev) => [...prev.filter((l) => l.memberId !== memberId), { memberId, familyId, latitude, longitude, recordedAt }])
    setHistories((prev) => ({
      ...prev,
      [memberId]: [...(prev[memberId] ?? []), { id: crypto.randomUUID(), memberId, familyId, latitude, longitude, recordedAt }],
    }))
  }


  if (loading) return <p className="muted">Cargando…</p>

  const sharedNow = locations.filter((loc) => consents.find((c) => c.memberId === loc.memberId)?.enabled)
  const selectedMember = members.find((m) => m.id === selectedMemberId) ?? null
  const selectedEnabled = selectedMember ? (consents.find((c) => c.memberId === selectedMember.id)?.enabled ?? false) : false
  const selectedCanToggle = selectedMember ? isAdmin || selectedMember.linkedProfileId === profileId : false
  const freshnessOf = (memberId: string) => {
    const loc = sharedNow.find((l) => l.memberId === memberId)
    return loc ? describePositionAge(loc.recordedAt, Date.now()) : null
  }
  const selectedFreshness = selectedMember ? freshnessOf(selectedMember.id) : null
  const selectedLocation = selectedMember ? sharedNow.find((l) => l.memberId === selectedMember.id) ?? null : null

  return (
    <div>
      {error && <p className="error">{error}</p>}

      {/* Mapa grande con los miembros arriba, al estilo de las apps de
          localización familiar (captura de referencia) — petición
          real: "que se vea así con los nombres arriba... que el mapa
          ocupe toda la pantalla". Se sale del margen normal de la
          pantalla para llegar de borde a borde. */}
      <div className="location-map-hero" data-help-id="ubicacion.map">
        <LocationMap
          members={members}
          locations={sharedNow}
          histories={histories}
          photoUrls={photoUrls}
          onSelectMember={setSelectedMemberId}
          routePolyline={routePolyline}
          focusMemberId={memberFocus}
        />
        <div className="location-map-chips" data-help-id="ubicacion.member-chips">
          {members.map((m) => {
            const enabled = consents.find((c) => c.memberId === m.id)?.enabled ?? false
            return (
              <button
                key={m.id}
                type="button"
                className={'location-map-chip' + (selectedMemberId === m.id ? ' location-map-chip-active' : '')}
                onClick={() => setSelectedMemberId(selectedMemberId === m.id ? null : m.id)}
                aria-label={m.name}
              >
                <MemberAvatar member={m} size={46} />
                {!enabled && (
                  <span className="location-map-chip-paused" aria-label="Ubicación desactivada">
                    ⏸
                  </span>
                )}
                {enabled && freshnessOf(m.id)?.stale && (
                  <span className="location-map-chip-paused" aria-label={`Sin posición reciente (${freshnessOf(m.id)?.ageLabel})`}>
                    🕒
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tocar un chip o un marcador abre aquí debajo su información —
          petición real: "que al tocar se abra debajo del mapa la
          información" — en vez de una ventana emergente encima. */}
      {selectedMember ? (
        <div className="card task-card" data-help-id="ubicacion.member-info">
          <MemberAvatar member={selectedMember} size={40} />
          <div className="task-card-main">
            <strong>{selectedMember.name}</strong>
            <p className="muted">
              {!selectedEnabled
                ? 'Ubicación no compartida'
                : selectedFreshness
                  ? selectedFreshness.stale
                    ? `Última posición conocida ${selectedFreshness.ageLabel}. Su móvil no la envía con la app cerrada o en segundo plano.`
                    : `Compartiendo ubicación · actualizada ${selectedFreshness.ageLabel}`
                  : 'Compartir activado, esperando posición…'}
            </p>
          </div>
          {selectedLocation && (
            <a
              className="task-toggle"
              href={googleMapsUrl(selectedLocation.latitude, selectedLocation.longitude)}
              target="_blank"
              rel="noopener noreferrer"
            >
              📍 Abrir en Google Maps
            </a>
          )}
          {selectedCanToggle && (
            <button
              type="button"
              className="task-toggle"
              onClick={() => handleToggleConsent(selectedMember.id, !selectedEnabled)}
            >
              {selectedEnabled ? 'Desactivar' : 'Activar'}
            </button>
          )}
        </div>
      ) : (
        sharedNow.length === 0 && (
          <p className="muted">
            Todavía no aparece nadie en el mapa. Toca el chip de alguien arriba para activar su ubicación y, desde
            el móvil de esa persona, entra aquí y toca su nombre en "Este dispositivo" para empezar a compartir.
          </p>
        )
      )}

      <div className="segmented" style={{ marginTop: 16 }} role="tablist" data-help-id="ubicacion.panel-tabs">
        <button type="button" role="tab" aria-selected={panelTab === 'lugares'} className={panelTab === 'lugares' ? 'segmented-active' : ''} onClick={() => setPanelTab('lugares')} data-help-id="ubicacion.tab-places">
          🏠 Lugares
        </button>
        <button type="button" role="tab" aria-selected={panelTab === 'estoy-aqui'} className={panelTab === 'estoy-aqui' ? 'segmented-active' : ''} onClick={() => setPanelTab('estoy-aqui')} data-help-id="ubicacion.tab-here">
          📍 ¡Estoy aquí!
        </button>
        <button type="button" role="tab" aria-selected={panelTab === 'compartir'} className={panelTab === 'compartir' ? 'segmented-active' : ''} onClick={() => setPanelTab('compartir')} data-help-id="ubicacion.tab-share">
          👥 Compartir ubicación
        </button>
      </div>

      {panelTab === 'lugares' && <HelpDestMark id="ubicacion.lugares" />}
      {panelTab === 'estoy-aqui' && <HelpDestMark id="ubicacion.estoy-aqui" />}
      {panelTab === 'compartir' && <HelpDestMark id="ubicacion.compartir" />}

      {panelTab === 'lugares' && (
        <div>
          {/* Petición real: "lo de añadir otro lo pones arriba para que se vea lo primero y debajo
              los lugares frecuentes [en un desplegable]" — antes la lista de lugares salía siempre
              entera, delante del formulario para añadir uno nuevo. */}
          <AddPlaceForm onAdded={reload} />

          {/* Petición real (17/10/2026): «Lugares frecuentes» pasaba muy desapercibido y costaba encontrarlo: tarjeta grande, con el título grande y
              cuántos lugares hay guardados. Sigue siendo plegable. */}
          <button type="button" className="places-toggle-card" onClick={() => setPlacesOpen((v) => !v)} aria-expanded={placesOpen} data-help-id="ubicacion.places-toggle">
            <span className="places-toggle-icon" aria-hidden="true">
              🏠
            </span>
            <span className="places-toggle-text">
              <span className="places-toggle-title">Lugares frecuentes</span>
              <span className="places-toggle-sub">
                {places.length === 0 ? 'Ninguno guardado todavía' : places.length === 1 ? '1 lugar guardado' : `${places.length} lugares guardados`} ·{' '}
                {placesOpen ? 'toca para ocultar' : 'toca para ver'}
              </span>
            </span>
            <span className="places-toggle-chevron" aria-hidden="true">
              {placesOpen ? '︿' : '⌄'}
            </span>
          </button>
          {placesOpen && (
            <div className="event-list">
              {places.map((place) => (
                <PlaceRow key={place.id} place={place} locations={locations} members={members} onChanged={reload} onNotifyChanged={(enabled) => setPlaces((prev) => prev.map((p) => (p.id === place.id ? { ...p, notifyArrivals: enabled } : p)))} onRoute={setRoutePolyline} />
              ))}
              {places.length === 0 && <p className="muted">No hay lugares guardados.</p>}
            </div>
          )}

          <PlaceHistorySection members={members} consents={consents} />
        </div>
      )}

      {panelTab === 'estoy-aqui' && <EstoyAquiTab onPlaceAdded={reload} />}

      {panelTab === 'compartir' && (
        <div>
          <h2 className="section-title">Este dispositivo</h2>
          {sharingAs ? (
            // Petición real: "quiero que me la hagas mucho más pequeña, de una sola línea" — antes
            // era una tarjeta grande (título + aviso + botón grande); sigue actualizándose sola
            // igual, solo que ahora no hace falta explicarlo cada vez que se ve la pantalla.
            <p className="muted inline-fields" style={{ alignItems: 'center' }} data-help-id="ubicacion.device-picker">
              📍 Compartiendo como {members.find((m) => m.id === sharingAs)?.name}.
              <button type="button" className="link-button" onClick={stopSharingGlobal}>
                Dejar de compartir
              </button>
            </p>
          ) : (
            <div className="card member-form" data-help-id="ubicacion.device-picker">
              <p className="muted">¿Quién lleva este dispositivo?</p>
              <div className="filter-row">
                {members
                  .filter((m) => consents.find((c) => c.memberId === m.id)?.enabled)
                  .map((m) => (
                    <button key={m.id} className="chip" onClick={() => startSharingGlobal(m.id)}>
                      <MemberAvatar member={m} size={18} />
                      {m.name}
                    </button>
                  ))}
              </div>
              {members.every((m) => !consents.find((c) => c.memberId === m.id)?.enabled) && (
                <p className="muted">Ningún miembro tiene el consentimiento activado todavía.</p>
              )}
            </div>
          )}

          <h2 className="section-title">¿Quién puede compartir?</h2>
          <p className="muted">
            {isAdmin ? 'Activa o desactiva a cada miembro de la familia.' : 'Solo puedes activar o desactivar tu propia ubicación.'}
          </p>
          <div className="event-list" data-help-id="ubicacion.consent-list">
            {members
              .filter((m) => isAdmin || m.linkedProfileId === profileId)
              .map((m) => {
                const enabled = consents.find((c) => c.memberId === m.id)?.enabled ?? false
                return (
                  <div key={m.id} className="card task-card">
                    <MemberAvatar member={m} size={32} />
                    <div className="task-card-main">
                      <strong>{m.name}</strong>
                    </div>
                    <button type="button" className="task-toggle" onClick={() => handleToggleConsent(m.id, !enabled)}>
                      {enabled ? 'Activado' : 'Desactivado'}
                    </button>
                  </div>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}

// Petición real: "lo quiero así" (captura "¡Estoy aquí!" de Google Maps) — compartir dónde estás
// AHORA MISMO, de una vez, sin que haga falta guardarlo como lugar frecuente antes; y, si quieres,
// guardar este sitio de un toque como "Casa" o "Trabajo" (con el aviso de llegada/salida encendido
// de entrada, como en la captura: "Y recibe notificaciones de lugar").
function EstoyAquiTab({ onPlaceAdded }: { onPlaceAdded: () => void }) {
  const [sharing, setSharing] = useState(false)
  const [shareNotice, setShareNotice] = useState<string | null>(null)
  const [shareFallbackUrl, setShareFallbackUrl] = useState<string | null>(null)
  const [addingQuick, setAddingQuick] = useState<'Casa' | 'Trabajo' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleShareHere() {
    setSharing(true)
    setShareNotice(null)
    setShareFallbackUrl(null)
    setError(null)
    try {
      const coords = await getCurrentPosition()
      const url = `https://www.google.com/maps/search/?api=1&query=${coords.latitude},${coords.longitude}`
      try {
        const shared = await shareText({ title: 'Mi ubicación actual', text: `Estoy aquí\n${url}` })
        if (!shared) setShareNotice('Copiado al portapapeles.')
      } catch {
        setShareFallbackUrl(url)
      }
    } catch (err) {
      setError(errorMessage(err, 'No se pudo obtener tu ubicación'))
    } finally {
      setSharing(false)
    }
  }

  async function handleQuickAdd(name: 'Casa' | 'Trabajo') {
    setAddingQuick(name)
    setError(null)
    try {
      const coords = await getCurrentPosition()
      await addPlace({ name, category: null, latitude: coords.latitude, longitude: coords.longitude, radiusM: 50, notifyArrivals: true })
      onPlaceAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setAddingQuick(null)
    }
  }

  return (
    <div className="card member-form" data-help-id="ubicacion.estoy-aqui-card">
      <p className="muted">Comparte dónde estás ahora mismo, o guarda este sitio como lugar frecuente.</p>
      <button type="button" onClick={handleShareHere} disabled={sharing} data-help-id="ubicacion.estoy-aqui-boton">
        {sharing ? 'Obteniendo tu ubicación…' : '📍 Compartir mi ubicación actual'}
      </button>
      {shareNotice && <p className="muted">{shareNotice}</p>}
      {shareFallbackUrl && (
        <p className="muted">
          No se ha podido compartir ni copiar directamente —{' '}
          <a href={shareFallbackUrl} target="_blank" rel="noopener noreferrer">
            toca aquí para abrir la ubicación
          </a>
          .
        </p>
      )}
      <p className="muted" style={{ marginTop: 14 }}>
        Seleccionar un lugar favorito
      </p>
      <div className="inline-fields" data-help-id="ubicacion.quick-add">
        <button type="button" className="link-button" onClick={() => handleQuickAdd('Casa')} disabled={addingQuick !== null}>
          {addingQuick === 'Casa' ? 'Guardando…' : '🏠 Añadir este sitio como «Casa»'}
        </button>
        <button type="button" className="link-button" onClick={() => handleQuickAdd('Trabajo')} disabled={addingQuick !== null}>
          {addingQuick === 'Trabajo' ? 'Guardando…' : '💼 Añadir este sitio como «Trabajo»'}
        </button>
      </div>
      <p className="muted">Y avisa cuando alguien llegue o se vaya de aquí.</p>
      {error && <p className="error">{error}</p>}
    </div>
  )
}

// Petición real: "un desplegable con los sitios en los que ha estado
// cada día... el supermercado que lo reconozca según las tiendas que
// haya en los mapas... y el historial que se pueda hacer por día, por
// semana o por meses". A diferencia del rastro GPS del mapa de arriba
// (últimas 24h, se borra sola), esto guarda solo el NOMBRE de cada
// parada real (ver migración 0058_place_visits y
// services/locationSharing.ts) — se conserva 90 días.
type PlaceHistoryPreset = 'dia' | 'semana' | 'mes'

const PLACE_HISTORY_LABELS: Record<PlaceHistoryPreset, string> = {
  dia: 'Hoy',
  semana: 'Esta semana',
  mes: 'Este mes',
}

function placeHistoryRange(preset: PlaceHistoryPreset): [string, string] {
  const now = new Date()
  if (preset === 'dia') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    return [start.toISOString(), end.toISOString()]
  }
  if (preset === 'semana') {
    const dow = (now.getDay() + 6) % 7 // lunes = 0
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow)
    const end = new Date(monday)
    end.setDate(end.getDate() + 7)
    return [monday.toISOString(), end.toISOString()]
  }
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return [first.toISOString(), next.toISOString()]
}

function groupVisitsByDay(visits: LocationPlaceVisit[]): [string, LocationPlaceVisit[]][] {
  const chronological = [...visits].sort((a, b) => a.arrivedAt.localeCompare(b.arrivedAt))
  const byDay = new Map<string, LocationPlaceVisit[]>()
  for (const v of chronological) {
    const day = v.arrivedAt.slice(0, 10)
    const list = byDay.get(day) ?? []
    list.push(v)
    byDay.set(day, list)
  }
  return [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0]))
}

function placeHhmm(iso: string): string {
  return formatTime(iso)
}

function placeDayLabel(day: string): string {
  return new Date(`${day}T00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
}

function PlaceHistorySection({ members, consents }: { members: FamilyMember[]; consents: LocationConsent[] }) {
  const [preset, setPreset] = useState<PlaceHistoryPreset>('dia')
  const [visits, setVisits] = useState<LocationPlaceVisit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedMember, setExpandedMember] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    const [from, to] = placeHistoryRange(preset)
    listPlaceVisits(from, to)
      .then(setVisits)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [preset])

  const byMember = new Map<string, LocationPlaceVisit[]>()
  for (const v of visits) {
    const list = byMember.get(v.memberId) ?? []
    list.push(v)
    byMember.set(v.memberId, list)
  }

  // Un desplegable por cada miembro con el compartir activado (petición
  // real: "así con todos los miembros que estén conectados"), aunque
  // todavía no tenga ningún sitio registrado — igual que las carpetas
  // de tiendas en Compras/Dinero, que también salen vacías.
  const activeMembers = members.filter((m) => consents.find((c) => c.memberId === m.id)?.enabled)

  return (
    <>
      <h2 className="section-title">Historial de sitios</h2>
      <p className="muted">
        Dónde ha estado cada uno — se reconoce solo (lugares guardados arriba, o buscado en el mapa) cuando alguien
        se queda parado un rato en un sitio nuevo mientras comparte ubicación.
      </p>
      <div className="filter-row" style={{ marginBottom: 8 }}>
        {(['dia', 'semana', 'mes'] as PlaceHistoryPreset[]).map((p) => (
          <button
            key={p}
            type="button"
            className={'chip' + (preset === p ? ' chip-active' : '')}
            onClick={() => setPreset(p)}
          >
            {PLACE_HISTORY_LABELS[p]}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      {loading ? (
        <p className="muted">Cargando…</p>
      ) : (
        <div className="store-folder-grid">
          {activeMembers.map((m) => {
            const memberVisits = byMember.get(m.id) ?? []
            const isOpen = expandedMember === m.id
            return (
              <div key={m.id} className="store-folder">
                <button
                  type="button"
                  className="store-folder-header"
                  onClick={() => setExpandedMember(isOpen ? null : m.id)}
                >
                  <span className="store-folder-icon">
                    <MemberAvatar member={m} size={22} />
                  </span>
                  <span className="store-folder-info">
                    <strong>{m.name}</strong>
                    <span className="muted">
                      {memberVisits.length === 0
                        ? 'Sin sitios registrados'
                        : `${memberVisits.length} ${memberVisits.length === 1 ? 'sitio' : 'sitios'}`}
                    </span>
                  </span>
                  <span className="store-folder-chevron">{isOpen ? '▾' : '▸'}</span>
                </button>
                {isOpen && (
                  <div className="event-list store-folder-contents">
                    {memberVisits.length === 0 ? (
                      <p className="muted">
                        Nada todavía en este periodo — hace falta que {m.name} comparta ubicación y se quede un
                        rato parado en algún sitio para que se reconozca solo.
                      </p>
                    ) : (
                      groupVisitsByDay(memberVisits).map(([day, dayVisits]) => (
                        <div key={day} className="card task-card" style={{ display: 'block' }}>
                          <strong>{placeDayLabel(day)}</strong>
                          <p className="muted">
                            {dayVisits.map((v, i) => (
                              <span key={v.id}>
                                {i > 0 && ' → '}
                                {v.placeName} ({placeHhmm(v.arrivedAt)}
                                {v.leftAt ? `–${placeHhmm(v.leftAt)}` : ''})
                              </span>
                            ))}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })}
          {activeMembers.length === 0 && (
            <p className="muted">
              Nadie tiene el compartir ubicación activado todavía — actívalo arriba, en "Consentimiento".
            </p>
          )}
        </div>
      )}
    </>
  )
}

function PlaceRow({
  place,
  locations,
  members,
  onChanged,
  onNotifyChanged,
  onRoute,
}: {
  place: LocationPlace
  locations: MemberLocation[]
  members: FamilyMember[]
  onChanged: () => void
  // Al marcar o desmarcar el aviso NO se vuelve a pedir nada ni se repinta el resto de la pantalla (mapa, miembros, fotos): solo se cambia ese lugar en la
  // lista. Con el refresco, la pantalla se repintaba y el móvil saltaba (petición real, 17/10/2026: «cuando tico o destico se me sale de la pantalla»).
  onNotifyChanged: (enabled: boolean) => void
  // Petición real: "que me marque la ruta hasta Madrid como en Google Maps" — se llama con el
  // trazado en cuanto se calcula el tiempo en coche, para dibujarlo en el mapa de arriba.
  onRoute: (polyline: string | null) => void
}) {
  // Petición real: "quién está más cerca ahora mismo" — con la misma
  // distancia en línea recta que ya se calculaba (gratis, sin pedir nada
  // a Google), ahora se ordena y se destaca a quien tiene más cerca.
  const ranked = locations
    .map((loc) => {
      const member = members.find((m) => m.id === loc.memberId)
      if (!member) return null
      return { member, loc, dist: distanceMeters(loc.latitude, loc.longitude, place.latitude, place.longitude) }
    })
    .filter((x): x is { member: FamilyMember; loc: MemberLocation; dist: number } => x !== null)
    .sort((a, b) => a.dist - b.dist)

  const [etaFor, setEtaFor] = useState<string | null>(null)
  const [eta, setEta] = useState<DrivingEta | null>(null)
  const [etaLoading, setEtaLoading] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [shareNotice, setShareNotice] = useState<string | null>(null)
  // Petición real: "quiero poder editarlo... poder ponerle la categoría que yo quiera" (trabajo,
  // casa de mamá...) — no solo al crearlo, también después, sobre un lugar ya guardado.
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(place.name)
  const [editCategory, setEditCategory] = useState(place.category ?? '')
  const [editRadius, setEditRadius] = useState(place.radiusM)
  // Nueva posición del lugar (botón «Mover aquí»): null = no se mueve.
  const [editMoveTo, setEditMoveTo] = useState<{ latitude: number; longitude: number } | null>(null)
  const [editLocating, setEditLocating] = useState(false)
  // «Avisarme cuando alguien llegue o se vaya» va VISIBLE en la tarjeta (petición real, 17/10/2026: sin entrar a «Editar»): se guarda al marcarlo o desmarcarlo.
  const [notifyOn, setNotifyOn] = useState(place.notifyArrivals)
  // Ref y no estado: la casilla NO se desactiva mientras guarda (al desactivarse un campo con el foco, el móvil puede saltar de sitio).
  const notifyBusyRef = useRef(false)
  const [notifyError, setNotifyError] = useState<string | null>(null)
  useEffect(() => {
    setNotifyOn(place.notifyArrivals)
  }, [place.notifyArrivals])
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  function startEditing() {
    setEditName(place.name)
    setEditCategory(place.category ?? '')
    setEditRadius(place.radiusM)
    setEditMoveTo(null)
    setEditError(null)
    setEditing(true)
  }

  async function handleToggleNotify(enabled: boolean) {
    if (notifyBusyRef.current) return
    // La pantalla se queda donde está: se apunta cuánto se había bajado y se restaura tras repintar, pase lo que pase.
    const scrollY = window.scrollY
    const keepScroll = () => requestAnimationFrame(() => window.scrollTo(0, scrollY))
    notifyBusyRef.current = true
    setNotifyOn(enabled)
    setNotifyError(null)
    keepScroll()
    try {
      await setPlaceNotifyArrivals(place.id, enabled)
      onNotifyChanged(enabled)
    } catch (err) {
      setNotifyOn(!enabled)
      setNotifyError(errorMessage(err, 'No se pudo cambiar el aviso'))
    } finally {
      notifyBusyRef.current = false
      keepScroll()
    }
  }

  async function handleMoveHere() {
    setEditLocating(true)
    setEditError(null)
    try {
      setEditMoveTo(await getCurrentPosition())
    } catch (err) {
      setEditError(errorMessage(err, 'No se pudo leer tu posición'))
    } finally {
      setEditLocating(false)
    }
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault()
    setEditSaving(true)
    setEditError(null)
    try {
      await updatePlace(place.id, { name: editName.trim(), category: editCategory.trim() || null, radiusM: editRadius, ...(editMoveTo ?? {}) })
      setEditing(false)
      onChanged()
    } catch (err) {
      setEditError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setEditSaving(false)
    }
  }
  // Solo se rellena si ni el menú nativo ni el portapapeles han podido usarse (share.ts,
  // shareText) — un enlace normal de Google Maps, seguro para enseñar y tocar directamente (no es
  // la clave de la app, no expone nada).
  const [shareFallbackUrl, setShareFallbackUrl] = useState<string | null>(null)

  async function handleEta(memberId: string, loc: MemberLocation) {
    setEtaFor(memberId)
    setEta(null)
    setEtaLoading(true)
    try {
      const result = await getDrivingEta(loc, place)
      setEta(result)
      if (result?.polyline) onRoute(result.polyline)
    } finally {
      setEtaLoading(false)
    }
  }

  // Petición real: "cuando le doy a compartir, lo que comparte es una imagen... yo quiero que
  // comparta la ubicación" — antes se mandaba una FOTO del mapa (Static Maps API); ahora se manda
  // un enlace real de Google Maps a este punto exacto, que quien lo reciba puede abrir y usar para
  // llegar. Un enlace normal de Maps no necesita la clave de la app (no es una llamada a la API,
  // solo una URL que abre la app de Maps de quien la reciba), así que tampoco hay límite diario ni
  // nada que pueda fallar por parte de Google — solo puede fallar compartir en sí, en cuyo caso cae
  // al portapapeles y, si eso también falla, se enseña el enlace en la propia pantalla.
  async function handleShareLocation() {
    setSharing(true)
    setShareNotice(null)
    setShareFallbackUrl(null)
    const url = `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`
    try {
      const shared = await shareText({ title: place.name, text: `${place.name}\n${url}` })
      if (!shared) setShareNotice('Copiado al portapapeles.')
    } catch {
      setShareFallbackUrl(url)
    } finally {
      setSharing(false)
    }
  }

  if (editing) {
    return (
      <form onSubmit={handleSaveEdit} className="card member-form" data-help-id="ubicacion.lugar-editar-form">
        <label>
          Nombre
          <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} required />
        </label>
        <label>
          Categoría (opcional)
          <input
            type="text"
            value={editCategory}
            onChange={(e) => setEditCategory(e.target.value)}
            placeholder="Trabajo, casa de mamá, campo de papá…"
          />
        </label>
        <label>
          Radio (m)
          <input type="number" value={editRadius} onChange={(e) => setEditRadius(Number(e.target.value))} />
        </label>
        <div className="inline-fields">
          <button type="button" className="link-button" onClick={handleMoveHere} disabled={editLocating} data-help-id="ubicacion.lugar-mover-aqui">
            {editLocating ? 'Buscando tu posición…' : '📍 Mover el lugar a donde estoy ahora'}
          </button>
        </div>
        {editMoveTo && <p className="muted">El lugar se moverá a tu posición actual cuando pulses «Guardar cambios».</p>}
        {editError && <p className="error">{editError}</p>}
        <div className="inline-fields">
          <button type="submit" disabled={editSaving} data-help-id="ubicacion.lugar-editar-guardar">
            {editSaving ? 'Guardando…' : 'Guardar cambios'}
          </button>
          <button type="button" className="link-button" onClick={() => setEditing(false)}>
            Cancelar
          </button>
        </div>
      </form>
    )
  }

  return (
    <div className="card task-card">
      <div className="task-card-main">
        <strong>{place.name}</strong>
        {place.category && (
          <span className="chip" style={{ marginLeft: 6 }}>
            {place.category}
          </span>
        )}
        <p className="muted">Radio {place.radiusM} m</p>
        <label className="inline-fields" style={{ alignItems: 'center' }}>
          <input type="checkbox" checked={notifyOn} onChange={(e) => void handleToggleNotify(e.target.checked)} />
          🔔 Avisarme cuando alguien llegue o se vaya de aquí
        </label>
        {notifyError && <p className="error">{notifyError}</p>}
        {ranked.map(({ member, loc, dist }, i) => {
          const near = dist <= place.radiusM
          const nearest = i === 0
          return (
            <div key={member.id}>
              <p className="muted">
                {nearest && '⭐ '}
                {member.name}: {formatDistance(dist)} {near && '· cerca'} {nearest && '· más cerca'}
                {nearest && (
                  <>
                    {' · '}
                    <button type="button" className="link-button" onClick={() => handleEta(member.id, loc)} disabled={etaLoading && etaFor === member.id}>
                      🚗 {etaLoading && etaFor === member.id ? 'Calculando…' : 'ver tiempo en coche'}
                    </button>
                  </>
                )}
              </p>
              {etaFor === member.id && eta && (
                <p className="muted">
                  🚗 {formatDuration(eta.minutes)} ({eta.km} km), {trafficDescription(eta.minutes, eta.delayMinutes)}
                </p>
              )}
              {etaFor === member.id && !eta && !etaLoading && <p className="muted">No se pudo calcular el tiempo ahora mismo.</p>}
            </div>
          )
        })}
        <button type="button" className="link-button" onClick={handleShareLocation} disabled={sharing} style={{ marginTop: 6 }}>
          {sharing ? 'Preparando…' : '📍 Compartir esta ubicación'}
        </button>
        {shareNotice && <p className="muted">{shareNotice}</p>}
        {shareFallbackUrl && (
          <p className="muted">
            No se ha podido compartir ni copiar directamente —{' '}
            <a href={shareFallbackUrl} target="_blank" rel="noopener noreferrer">
              toca aquí para abrir la ubicación
            </a>
            .
          </p>
        )}
        <button type="button" className="link-button" onClick={startEditing} style={{ marginTop: 6 }} data-help-id="ubicacion.lugar-editar">
          ✎ Editar
        </button>
      </div>
      <ConfirmButton label="Eliminar" onConfirm={() => deletePlace(place.id).then(onChanged)} />
    </div>
  )
}

function AddPlaceForm({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [radiusM, setRadiusM] = useState(50)
  const [notifyArrivals, setNotifyArrivals] = useState(false)
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Petición real: "si quiero buscar Mercadona Almoradí... que me lleve directamente al mapa...
  // que me lo busque por el nombre y que lo pueda guardar" — antes solo se podía usar la ubicación
  // actual del propio teléfono; ahora reutiliza el mismo buscador con mapa de Calendario/Eventos
  // (LocationPickerModal) para buscar cualquier sitio por su nombre, esté donde esté.
  const [pickerOpen, setPickerOpen] = useState(false)

  async function handleUseCurrentPosition() {
    try {
      setCoords(await getCurrentPosition())
    } catch (err) {
      setError(errorMessage(err, 'No se pudo obtener la ubicación'))
    }
  }

  function handlePicked(result: { latitude: number; longitude: number; label: string | null }) {
    setCoords({ latitude: result.latitude, longitude: result.longitude })
    if (result.label) setName(result.label)
    setPickerOpen(false)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!coords) {
      setError('Usa primero "Usar mi ubicación actual"')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await addPlace({ name, category: category.trim() || null, latitude: coords.latitude, longitude: coords.longitude, radiusM, notifyArrivals })
      emitHelpEvent('location.place-added') // para los tutoriales «Enséñame»: el lugar YA está guardado
      setName('')
      setCategory('')
      setNotifyArrivals(false)
      setCoords(null)
      onAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo crear'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form" data-help-id="ubicacion.place-form">
      <h2>Nuevo lugar</h2>
      <label>
        Nombre
        <input type="text" data-help-id="ubicacion.place-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Supermercado" required />
      </label>
      <label data-help-id="ubicacion.place-category">
        Categoría (opcional)
        <input
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Trabajo, casa de mamá, campo de papá…"
        />
      </label>
      <label data-help-id="ubicacion.place-radius">
        Radio (m)
        <input type="number" value={radiusM} onChange={(e) => setRadiusM(Number(e.target.value))} />
      </label>
      <label className="inline-fields" style={{ alignItems: 'center' }} data-help-id="ubicacion.place-notify">
        <input type="checkbox" checked={notifyArrivals} onChange={(e) => setNotifyArrivals(e.target.checked)} />
        🔔 Avisarme cuando alguien llegue o se vaya de aquí
      </label>
      <div className="inline-fields" data-help-id="ubicacion.place-position">
        <button type="button" className="link-button" onClick={() => setPickerOpen(true)}>
          🔍 Buscar por nombre
        </button>
        <button type="button" className="link-button" onClick={handleUseCurrentPosition}>
          {coords ? '✓ Ubicación capturada' : '📍 Usar mi ubicación actual'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving} data-help-id="ubicacion.place-save">
        {saving ? 'Guardando…' : 'Guardar lugar'}
      </button>
      {pickerOpen && (
        <LocationPickerModal initialQuery={name} onConfirm={handlePicked} onClose={() => setPickerOpen(false)} />
      )}
    </form>
  )
}

// ---------------------------------------------------------------------
// Reglas de automatización (Skill 24)
// ---------------------------------------------------------------------

const TRIGGER_LABELS: Record<AutomationTriggerType, string> = {
  llegada: 'Al llegar a un lugar',
  salida: 'Al salir de un lugar',
  hora_diaria: 'Todos los días a una hora',
}

function RulesTab() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [places, setPlaces] = useState<LocationPlace[]>([])
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    setLoading(true)
    Promise.all([listAutomationRules(), listPlaces(), listFamilyMembers()])
      .then(([r, p, m]) => {
        setRules(r)
        setPlaces(p)
        setMembers(m)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

  if (loading) return <p className="muted">Cargando reglas…</p>

  // Las reglas que crea el interruptor "🔔 avisarme" de cada lugar (LocationTab, PlaceRow) no se
  // enseñan aquí — su nombre/mensaje llevan {miembro}/{lugar} sin sustituir (eso solo lo resuelve
  // el servidor al disparar, ver migración 0186), así que aquí se verían rotas. Se gestionan desde el
  // propio lugar.
  const visibleRules = rules.filter((rule) => !rule.name.startsWith(PLACE_NOTIFY_RULE_PREFIX))

  return (
    <div>
      {error && <p className="error">{error}</p>}
      <div className="event-list" data-help-id="ubicacion.rule-list">
        {visibleRules.map((rule) => (
          <div key={rule.id} className="card task-card">
            <div className="task-card-main">
              <strong>{rule.name}</strong>
              <p className="muted">
                {TRIGGER_LABELS[rule.triggerType]}
                {rule.placeId && ` · ${places.find((p) => p.id === rule.placeId)?.name ?? '?'}`}
                {rule.timeOfDay && ` · ${rule.timeOfDay.slice(0, 5)}`}
                {rule.memberId && ` · ${members.find((m) => m.id === rule.memberId)?.name ?? '?'}`}
              </p>
              <p className="muted">"{rule.message}"</p>
            </div>
            <button
              type="button"
              className="task-toggle"
              data-help-id="ubicacion.rule-state"
              onClick={() => toggleAutomationRule(rule.id, !rule.active).then(reload)}
            >
              {rule.active ? 'Activa' : 'Pausada'}
            </button>
            <button
              type="button"
              className="link-button"
              onClick={() => {
                const until = new Date(Date.now() + 60 * 60 * 1000).toISOString()
                muteAutomationRule(rule.id, until).then(reload)
              }}
            >
              Silenciar 1h
            </button>
            <ConfirmButton label="Eliminar" onConfirm={() => deleteAutomationRule(rule.id).then(reload)} />
          </div>
        ))}
        {visibleRules.length === 0 && <p className="muted">No hay reglas todavía.</p>}
      </div>
      <AddRuleForm places={places} members={members} onAdded={reload} />
    </div>
  )
}

function AddRuleForm({
  places,
  members,
  onAdded,
}: {
  places: LocationPlace[]
  members: FamilyMember[]
  onAdded: () => void
}) {
  const [name, setName] = useState('')
  const [triggerType, setTriggerType] = useState<AutomationTriggerType>('llegada')
  const [memberId, setMemberId] = useState('')
  const [placeId, setPlaceId] = useState('')
  const [timeOfDay, setTimeOfDay] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const isLocationTrigger = triggerType === 'llegada' || triggerType === 'salida'

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createAutomationRule({
        name,
        triggerType,
        memberId: memberId || null,
        placeId: isLocationTrigger ? placeId || null : null,
        timeOfDay: triggerType === 'hora_diaria' ? timeOfDay || null : null,
        message,
      })
      emitHelpEvent('location.rule-created') // para los tutoriales «Enséñame»: la regla YA está guardada
      setName('')
      setMessage('')
      onAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo crear'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form" data-help-id="ubicacion.rule-form">
      <h2>Nueva regla</h2>
      <label>
        Nombre
        <input type="text" data-help-id="ubicacion.rule-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mochila escolar" required />
      </label>
      <label data-help-id="ubicacion.rule-when">
        Cuándo
        <select value={triggerType} onChange={(e) => setTriggerType(e.target.value as AutomationTriggerType)}>
          {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {isLocationTrigger && (
        <label data-help-id="ubicacion.rule-place">
          Lugar
          <select value={placeId} onChange={(e) => setPlaceId(e.target.value)} required>
            <option value="">— elige un lugar —</option>
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {triggerType === 'hora_diaria' && (
        <label data-help-id="ubicacion.rule-time">
          Hora
          <input type="time" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} required />
        </label>
      )}
      <label data-help-id="ubicacion.rule-who">
        Para quién (opcional)
        <select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          <option value="">Cualquiera</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Mensaje del aviso
        <input type="text" data-help-id="ubicacion.rule-message" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="¡No olvides la mochila!" required />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving} data-help-id="ubicacion.rule-save">
        {saving ? 'Guardando…' : 'Crear regla'}
      </button>
    </form>
  )
}
