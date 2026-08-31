import { FormEvent, useEffect, useState } from 'react'
import {
  addPlace,
  createAutomationRule,
  deleteAutomationRule,
  deletePlace,
  listAutomationRules,
  listConsents,
  listMemberLocations,
  listPlaces,
  muteAutomationRule,
  setConsent,
  toggleAutomationRule,
  updateMemberLocation,
} from '@/data/location'
import { listFamilyMembers } from '@/data/family'
import { distanceMeters, formatDistance } from '@/domain/geo'
import { getCurrentPosition, watchPosition } from '@/services/geolocation'
import type {
  AutomationRule,
  AutomationTriggerType,
  FamilyMember,
  FamilyRole,
  LocationConsent,
  LocationPlace,
  MemberLocation,
} from '@/domain/types'

const SUB_TABS = ['Ubicación', 'Reglas'] as const
type SubTab = (typeof SUB_TABS)[number]

export function LocationScreen({ role }: { role: FamilyRole }) {
  const [tab, setTab] = useState<SubTab>('Ubicación')

  return (
    <div className="screen">
      <h1>Ubicación y avisos</h1>
      <p className="muted">
        Desactivada por defecto. Solo se comparte si activas el consentimiento explícitamente, y
        solo se guarda la última posición conocida — nunca un historial.
      </p>
      <div className="filter-row">
        {SUB_TABS.map((t) => (
          <button key={t} className={'chip' + (tab === t ? ' chip-active' : '')} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Ubicación' && <LocationTab isAdmin={role === 'admin'} />}
      {tab === 'Reglas' && <RulesTab />}
    </div>
  )
}

// ---------------------------------------------------------------------
// Ubicación (Skill 23/28)
// ---------------------------------------------------------------------

function LocationTab({ isAdmin }: { isAdmin: boolean }) {
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [consents, setConsents] = useState<LocationConsent[]>([])
  const [locations, setLocations] = useState<MemberLocation[]>([])
  const [places, setPlaces] = useState<LocationPlace[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sharingAs, setSharingAs] = useState<string>('')
  const [stopWatch, setStopWatch] = useState<(() => void) | null>(null)

  function reload() {
    setLoading(true)
    Promise.all([listFamilyMembers(), listConsents(), listMemberLocations(), listPlaces()])
      .then(([m, c, l, p]) => {
        setMembers(m)
        setConsents(c)
        setLocations(l)
        setPlaces(p)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])
  useEffect(() => () => stopWatch?.(), [stopWatch])

  async function handleToggleConsent(memberId: string, enabled: boolean) {
    try {
      await setConsent(memberId, enabled)
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el consentimiento')
    }
  }

  function startSharing(memberId: string) {
    setError(null)
    const stop = watchPosition((coords) => {
      updateMemberLocation(memberId, coords.latitude, coords.longitude)
        .then(reload)
        .catch((err: Error) => setError(err.message))
    })
    setSharingAs(memberId)
    setStopWatch(() => stop)
  }

  function stopSharing() {
    stopWatch?.()
    setStopWatch(null)
    setSharingAs('')
  }

  if (loading) return <p className="muted">Cargando…</p>

  return (
    <div>
      {error && <p className="error">{error}</p>}

      <h2 className="section-title">Consentimiento</h2>
      <div className="event-list">
        {members.map((m) => {
          const consent = consents.find((c) => c.memberId === m.id)
          const enabled = consent?.enabled ?? false
          return (
            <div key={m.id} className="card task-card">
              <div className="task-card-main">
                <strong>{m.name}</strong>
                <p className="muted">{enabled ? 'Compartir activado' : 'Desactivado'}</p>
              </div>
              {isAdmin && (
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
          <button type="button" onClick={stopSharing}>
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
                <button key={m.id} className="chip" onClick={() => startSharing(m.id)}>
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
    </div>
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
      <button type="button" className="link-button" onClick={() => deletePlace(place.id).then(onDeleted)}>
        Eliminar
      </button>
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
            <button type="button" className="link-button" onClick={() => deleteAutomationRule(rule.id).then(reload)}>
              Eliminar
            </button>
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
