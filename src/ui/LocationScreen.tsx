import { FormEvent, useEffect, useState } from 'react'
import { ReorderableTabBar } from '@/ui/ReorderableTabBar'
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
  setConsent,
  toggleAutomationRule,
} from '@/data/location'
import { getMemberPhotoUrl, listFamilyMembers } from '@/data/family'
import { ConfirmButton } from '@/ui/ConfirmButton'
import { distanceMeters, formatDistance } from '@/domain/geo'
import { getCurrentPosition } from '@/services/geolocation'
import {
  getLastError as getSharingError,
  getLastPosition,
  getSharingMemberId,
  startSharing as startSharingGlobal,
  stopSharing as stopSharingGlobal,
  subscribe as subscribeSharing,
} from '@/services/locationSharing'
import { LocationMap } from '@/ui/LocationMap'
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

const SUB_TABS = ['Ubicación', 'Reglas'] as const
type SubTab = (typeof SUB_TABS)[number]

export function LocationScreen({ role, profileId }: { role: FamilyRole; profileId: string }) {
  const [tab, setTab] = useState<SubTab>('Ubicación')

  return (
    <div className="screen">
      <h1>Ubicación y avisos</h1>
      <p className="muted">
        Desactivada por defecto. Solo se comparte si activas el consentimiento explícitamente. El
        mapa muestra la ruta de las últimas 24h — pasado ese tiempo se borra sola.
      </p>
      <ReorderableTabBar storageKey="ubicacion" tabs={SUB_TABS} active={tab} onSelect={setTab} />

      {tab === 'Ubicación' && <LocationTab isAdmin={role === 'admin'} profileId={profileId} />}
      {tab === 'Reglas' && <RulesTab />}
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
  // El propio compartir (watchPosition) ya no vive aquí — vive en
  // services/locationSharing.ts, fuera de React, para que no se pare al
  // salir de esta pantalla (ver comentario en ese archivo). Aquí solo se
  // refleja su estado.
  const [sharingAs, setSharingAs] = useState<string>(() => getSharingMemberId() ?? '')

  // `silent` = refresco en segundo plano (la actualización periódica de
  // cada 30s) sin poner toda la pantalla en "Cargando…" — con `setLoading(true)`
  // ahí, la pantalla entera se borraba y volvía a montar cada 30 segundos,
  // incluso en mitad de que alguien tocara "Activar" o eligiera quién
  // lleva el dispositivo (bug real reportado: "no me funciona", captura
  // mostrando la pantalla congelada en "Cargando…").
  function reload(silent = false) {
    if (!silent) setLoading(true)
    Promise.all([listFamilyMembers(), listConsents(), listMemberLocations(), listPlaces()])
      .then(async ([m, c, l, p]) => {
        setMembers(m)
        setConsents(c)
        setLocations(l)
        setPlaces(p)

        const historyEntries = await Promise.all(
          l.map(async (loc) => [loc.memberId, await listMemberLocationHistory(loc.memberId)] as const),
        )
        setHistories(Object.fromEntries(historyEntries))

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

  useEffect(() => reload(), []) // eslint-disable-line react-hooks/exhaustive-deps

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
  // tocando algo en ese momento.
  useEffect(() => {
    const interval = setInterval(() => reload(true), 30_000)
    return () => clearInterval(interval)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el consentimiento')
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

  return (
    <div>
      {error && <p className="error">{error}</p>}

      {/* Mapa grande con los miembros arriba, al estilo de las apps de
          localización familiar (captura de referencia) — petición
          real: "que se vea así con los nombres arriba... que el mapa
          ocupe toda la pantalla". Se sale del margen normal de la
          pantalla para llegar de borde a borde. */}
      <div className="location-map-hero">
        <LocationMap
          members={members}
          locations={sharedNow}
          histories={histories}
          photoUrls={photoUrls}
          onSelectMember={setSelectedMemberId}
        />
        <div className="location-map-chips">
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
              </button>
            )
          })}
        </div>
      </div>

      {/* Tocar un chip o un marcador abre aquí debajo su información —
          petición real: "que al tocar se abra debajo del mapa la
          información" — en vez de una ventana emergente encima. */}
      {selectedMember ? (
        <div className="card task-card">
          <MemberAvatar member={selectedMember} size={40} />
          <div className="task-card-main">
            <strong>{selectedMember.name}</strong>
            <p className="muted">
              {!selectedEnabled
                ? 'Ubicación no compartida'
                : sharedNow.some((l) => l.memberId === selectedMember.id)
                  ? 'Compartiendo ubicación'
                  : 'Compartir activado, esperando posición…'}
            </p>
          </div>
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
            Todavía no aparece nadie en el mapa. Activa el consentimiento de alguien más abajo y, desde el móvil de
            esa persona, entra aquí y toca su nombre en "Este dispositivo" para empezar a compartir.
          </p>
        )
      )}

      <h2 className="section-title">Consentimiento</h2>
      <div className="event-list">
        {members.map((m) => {
          const consent = consents.find((c) => c.memberId === m.id)
          const enabled = consent?.enabled ?? false
          // El admin puede activar/desactivar a cualquiera; cada persona
          // también puede activar/desactivar la suya propia (los menores
          // sin cuenta propia dependen del admin).
          const canToggle = isAdmin || m.linkedProfileId === profileId
          return (
            <div key={m.id} className="card task-card">
              <MemberAvatar member={m} size={32} />
              <div className="task-card-main">
                <strong>{m.name}</strong>
                <p className="muted">{enabled ? 'Compartir activado' : 'Desactivado'}</p>
              </div>
              {canToggle && (
                <button
                  type="button"
                  className="task-toggle"
                  onClick={() => handleToggleConsent(m.id, !enabled)}
                >
                  {enabled ? 'Desactivar' : 'Activar'}
                </button>
              )}
            </div>
          )
        })}
      </div>

      <h2 className="section-title">Este dispositivo</h2>
      {sharingAs ? (
        <div className="card banner">
          <p>Compartiendo como {members.find((m) => m.id === sharingAs)?.name}.</p>
          <p className="muted">Sigue actualizándose aunque salgas de esta pantalla, no hace falta dejarla abierta.</p>
          <button type="button" onClick={stopSharingGlobal}>
            Dejar de compartir
          </button>
        </div>
      ) : (
        <div className="card member-form">
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

      <h2 className="section-title">Lugares frecuentes</h2>
      <div className="event-list">
        {places.map((place) => (
          <PlaceRow key={place.id} place={place} locations={locations} members={members} onDeleted={reload} />
        ))}
        {places.length === 0 && <p className="muted">No hay lugares guardados.</p>}
      </div>
      <AddPlaceForm onAdded={reload} />

      <PlaceHistorySection members={members} consents={consents} />
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
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
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
  onDeleted,
}: {
  place: LocationPlace
  locations: MemberLocation[]
  members: FamilyMember[]
  onDeleted: () => void
}) {
  return (
    <div className="card task-card">
      <div className="task-card-main">
        <strong>{place.name}</strong>
        <p className="muted">Radio {place.radiusM} m</p>
        {locations.map((loc) => {
          const member = members.find((m) => m.id === loc.memberId)
          if (!member) return null
          const dist = distanceMeters(loc.latitude, loc.longitude, place.latitude, place.longitude)
          const near = dist <= place.radiusM
          return (
            <p key={loc.memberId} className="muted">
              {member.name}: {formatDistance(dist)} {near && '· cerca'}
            </p>
          )
        })}
      </div>
      <ConfirmButton label="Eliminar" onConfirm={() => deletePlace(place.id).then(onDeleted)} />
    </div>
  )
}

function AddPlaceForm({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState('')
  const [radiusM, setRadiusM] = useState(150)
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleUseCurrentPosition() {
    try {
      setCoords(await getCurrentPosition())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo obtener la ubicación')
    }
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
      await addPlace({ name, latitude: coords.latitude, longitude: coords.longitude, radiusM })
      setName('')
      setCoords(null)
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      <h2>Nuevo lugar</h2>
      <label>
        Nombre
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Supermercado" required />
      </label>
      <label>
        Radio (m)
        <input type="number" value={radiusM} onChange={(e) => setRadiusM(Number(e.target.value))} />
      </label>
      <button type="button" className="link-button" onClick={handleUseCurrentPosition}>
        {coords ? '✓ Ubicación capturada' : '📍 Usar mi ubicación actual'}
      </button>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Guardando…' : 'Guardar lugar'}
      </button>
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

  return (
    <div>
      {error && <p className="error">{error}</p>}
      <div className="event-list">
        {rules.map((rule) => (
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
        {rules.length === 0 && <p className="muted">No hay reglas todavía.</p>}
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
      setName('')
      setMessage('')
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      <h2>Nueva regla</h2>
      <label>
        Nombre
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mochila escolar" required />
      </label>
      <label>
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
        <label>
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
        <label>
          Hora
          <input type="time" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} required />
        </label>
      )}
      <label>
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
        <input type="text" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="¡No olvides la mochila!" required />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Guardando…' : 'Crear regla'}
      </button>
    </form>
  )
}
