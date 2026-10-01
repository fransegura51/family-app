import { FormEvent, useEffect, useRef, useState } from 'react'
import {
  UBICACION_MENU_ITEM_META,
  ubicacionMenuEntryMeta,
  isCustomUbicacionMenuKey,
  loadUbicacionMenuLayout,
  loadUbicacionPinnedItems,
  saveUbicacionMenuLayout,
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
import { ConfirmButton, ConfirmIconButton } from '@/ui/ConfirmButton'
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
import { pastelPalette } from '@/domain/colors'

const SUB_TABS = ['Inicio', 'Ubicación', 'Reglas'] as const
type SubTab = (typeof SUB_TABS)[number]

function isUbicacionSubTab(key: UbicacionMenuItemKey): key is SubTab {
  return (SUB_TABS as readonly string[]).includes(key)
}

export function LocationScreen({ role, profileId }: { role: FamilyRole; profileId: string }) {
  const [tab, setTab] = useState<SubTab>('Inicio')
  // Petición real: "el formato que has hecho ahora para meter todas
  // las pestañas me gusta mucho, aplícalo a toda la aplicación" —
  // mismo desplegable ☰ con sacar/meter/editar que Economía.
  const [menuOpen, setMenuOpen] = useState(false)
  const [pinnedItems, setPinnedItems] = useState<UbicacionMenuItemKey[]>(() => loadUbicacionPinnedItems())
  const [menuLayout, setMenuLayout] = useState<UbicacionMenuGroup[]>(() => loadUbicacionMenuLayout())
  const [placeholderNotice, setPlaceholderNotice] = useState(false)

  function persistMenuLayout(next: UbicacionMenuGroup[]) {
    setMenuLayout(next)
    saveUbicacionMenuLayout(next)
  }

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
      <div className="kitchen-header">
        <img src={ubicacionHeaderImg} alt="Ubicación" className="kitchen-header-img" />
        <button
          type="button"
          className="kitchen-header-menu-fab kitchen-header-menu-fab-floating kitchen-header-menu-fab-floating-lower"
          onClick={() => {
            if (!menuOpen) window.scrollTo({ top: 0, behavior: 'smooth' })
            setMenuOpen((v) => !v)
          }}
          aria-label={menuOpen ? 'Cerrar menú de Ubicación' : 'Abrir menú de Ubicación'}
        >
          {menuOpen ? '✕' : '☰'} Menú
        </button>
      </div>
      <p className="muted">
        Desactivada por defecto. Solo se comparte si activas el consentimiento explícitamente. El
        mapa muestra la ruta de las últimas 24h — pasado ese tiempo se borra sola.
      </p>
      {menuOpen && (
        <UbicacionMenuDropdown
          activeTab={tab}
          layout={menuLayout}
          onLayoutChange={persistMenuLayout}
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
  onLayoutChange,
  pinnedItems,
  onTogglePin,
  onActivate,
  onClose,
}: {
  activeTab: SubTab
  layout: UbicacionMenuGroup[]
  onLayoutChange: (next: UbicacionMenuGroup[]) => void
  pinnedItems: UbicacionMenuItemKey[]
  onTogglePin: (key: UbicacionMenuItemKey) => void
  onActivate: (key: UbicacionMenuItemKey) => void
  onClose: () => void
}) {
  const [editMode, setEditMode] = useState(false)
  const [addingGroup, setAddingGroup] = useState(false)
  const [addingGroupName, setAddingGroupName] = useState('')
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [addingCustomItem, setAddingCustomItem] = useState(false)
  const [newItemIcon, setNewItemIcon] = useState('📌')
  const [newItemLabel, setNewItemLabel] = useState('')
  const [editingItemKey, setEditingItemKey] = useState<string | null>(null)
  const [editItemIcon, setEditItemIcon] = useState('')
  const [editItemLabel, setEditItemLabel] = useState('')
  const [placeholderNotice, setPlaceholderNotice] = useState(false)

  function moveItem(groupId: string, index: number, direction: -1 | 1) {
    const group = layout.find((g) => g.id === groupId)
    if (!group) return
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= group.items.length) return
    const items = [...group.items]
    ;[items[index], items[newIndex]] = [items[newIndex], items[index]]
    onLayoutChange(layout.map((g) => (g.id === groupId ? { ...g, items } : g)))
  }

  function moveItemToGroup(itemKey: UbicacionMenuItemKey, fromGroupId: string, toGroupId: string) {
    if (fromGroupId === toGroupId) return
    const moved = layout.find((g) => g.id === fromGroupId)?.items.find((it) => it.key === itemKey)
    if (!moved) return
    onLayoutChange(
      layout.map((g) => {
        if (g.id === fromGroupId) return { ...g, items: g.items.filter((it) => it.key !== itemKey) }
        if (g.id === toGroupId) return { ...g, items: [...g.items, moved] }
        return g
      }),
    )
  }

  function handleAddGroup(e: FormEvent) {
    e.preventDefault()
    if (!addingGroupName.trim()) return
    onLayoutChange([...layout, { id: crypto.randomUUID(), name: addingGroupName.trim(), items: [] }])
    setAddingGroupName('')
    setAddingGroup(false)
  }

  function handleRenameGroup(id: string) {
    onLayoutChange(layout.map((g) => (g.id === id ? { ...g, name: renameValue.trim() || null } : g)))
    setRenamingGroupId(null)
  }

  function deleteGroup(id: string) {
    const group = layout.find((g) => g.id === id)
    const rest = layout.filter((g) => g.id !== id)
    if (!group || rest.length === 0) return
    const [first, ...others] = rest
    onLayoutChange([{ ...first, items: [...first.items, ...group.items] }, ...others])
  }

  function handleAddCustomItem(e: FormEvent) {
    e.preventDefault()
    if (!newItemLabel.trim()) return
    const entry: UbicacionMenuEntry = { key: `custom:${crypto.randomUUID()}`, icon: newItemIcon, label: newItemLabel.trim() }
    onLayoutChange(layout.map((g, i) => (i === 0 ? { ...g, items: [...g.items, entry] } : g)))
    setNewItemIcon('📌')
    setNewItemLabel('')
    setAddingCustomItem(false)
  }

  function handleSaveItem(groupId: string, key: UbicacionMenuItemKey) {
    onLayoutChange(
      layout.map((g) =>
        g.id === groupId
          ? { ...g, items: g.items.map((it) => (it.key === key ? { ...it, icon: editItemIcon, label: editItemLabel.trim() || it.label } : it)) }
          : g,
      ),
    )
    setEditingItemKey(null)
  }

  function deleteItem(groupId: string, key: UbicacionMenuItemKey) {
    onLayoutChange(layout.map((g) => (g.id === groupId ? { ...g, items: g.items.filter((it) => it.key !== key) } : g)))
  }

  function handleItemActivate(entry: UbicacionMenuEntry) {
    if (isCustomUbicacionMenuKey(entry.key)) {
      setPlaceholderNotice(true)
      setTimeout(() => setPlaceholderNotice(false), 2500)
      return
    }
    onActivate(entry.key)
    onClose()
  }

  return (
    <div className="economia-menu-dropdown">
      <button type="button" className="link-button economia-menu-edit-toggle" onClick={() => setEditMode((v) => !v)}>
        {editMode ? '✓ Listo' : '✏️ Editar'}
      </button>

      {layout.map((group) => (
        <div key={group.id} className="economia-menu-group">
          {(group.name || editMode) &&
            (renamingGroupId === group.id ? (
              <form
                className="inline-fields"
                style={{ margin: '4px 4px 6px' }}
                onSubmit={(e) => {
                  e.preventDefault()
                  handleRenameGroup(group.id)
                }}
              >
                <input type="text" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus style={{ flex: 1 }} />
                <button type="submit">Guardar</button>
              </form>
            ) : (
              <div className="economia-menu-group-title">
                <span>{group.name ?? 'Sin categoría'}</span>
                {editMode && (
                  <span style={{ display: 'flex', gap: 4 }}>
                    <button
                      type="button"
                      className="link-button"
                      style={{ padding: '2px 6px' }}
                      onClick={() => {
                        setRenamingGroupId(group.id)
                        setRenameValue(group.name ?? '')
                      }}
                      aria-label={`Renombrar categoría ${group.name ?? ''}`}
                    >
                      ✎
                    </button>
                    {layout.length > 1 && (
                      <ConfirmIconButton
                        icon="✕"
                        className="link-button"
                        ariaLabel={`Eliminar categoría ${group.name ?? ''}`}
                        onConfirm={() => deleteGroup(group.id)}
                      />
                    )}
                  </span>
                )}
              </div>
            ))}

          {group.items.map((entry, i) => {
            const meta = ubicacionMenuEntryMeta(entry)
            const isTab = isUbicacionSubTab(entry.key)
            const isCustom = isCustomUbicacionMenuKey(entry.key)

            if (editMode && editingItemKey === entry.key) {
              return (
                <form
                  key={entry.key}
                  className="inline-fields"
                  style={{ margin: '2px 4px' }}
                  onSubmit={(e) => {
                    e.preventDefault()
                    handleSaveItem(group.id, entry.key)
                  }}
                >
                  <input type="text" value={editItemIcon} onChange={(e) => setEditItemIcon(e.target.value)} style={{ width: 48, textAlign: 'center', flex: 'none' }} maxLength={4} autoFocus />
                  <input type="text" value={editItemLabel} onChange={(e) => setEditItemLabel(e.target.value)} style={{ flex: 1 }} />
                  <button type="submit">Guardar</button>
                </form>
              )
            }

            return (
              <div key={entry.key} className={'economia-menu-row' + (isTab && activeTab === entry.key ? ' active' : '')}>
                {editMode ? (
                  <span className="economia-menu-item">
                    <span aria-hidden="true">{meta.icon}</span>
                    {meta.label}
                  </span>
                ) : (
                  <button type="button" className="economia-menu-item" onClick={() => handleItemActivate(entry)}>
                    <span aria-hidden="true">{meta.icon}</span>
                    {meta.label}
                  </button>
                )}

                {editMode ? (
                  <span className="economia-menu-edit-controls">
                    <button type="button" className="link-button" style={{ padding: '2px 6px' }} disabled={i === 0} onClick={() => moveItem(group.id, i, -1)} aria-label={`Subir ${meta.label}`}>
                      ↑
                    </button>
                    <button
                      type="button"
                      className="link-button"
                      style={{ padding: '2px 6px' }}
                      disabled={i === group.items.length - 1}
                      onClick={() => moveItem(group.id, i, 1)}
                      aria-label={`Bajar ${meta.label}`}
                    >
                      ↓
                    </button>
                    <select
                      value={group.id}
                      onChange={(e) => moveItemToGroup(entry.key, group.id, e.target.value)}
                      aria-label={`Mover ${meta.label} a otra categoría`}
                    >
                      {layout.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name ?? 'Sin categoría'}
                        </option>
                      ))}
                    </select>
                    {isCustom && (
                      <>
                        <button
                          type="button"
                          className="link-button"
                          style={{ padding: '2px 6px' }}
                          onClick={() => {
                            setEditingItemKey(entry.key)
                            setEditItemIcon(meta.icon)
                            setEditItemLabel(meta.label)
                          }}
                          aria-label={`Renombrar ${meta.label}`}
                        >
                          ✎
                        </button>
                        <ConfirmIconButton
                          icon="✕"
                          className="link-button"
                          ariaLabel={`Eliminar ${meta.label}`}
                          onConfirm={() => deleteItem(group.id, entry.key)}
                        />
                      </>
                    )}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="economia-menu-pin"
                    onClick={() => onTogglePin(entry.key)}
                    aria-label={pinnedItems.includes(entry.key) ? `Quitar ${meta.label} de la pantalla de Ubicación` : `Sacar ${meta.label} a la pantalla de Ubicación`}
                  >
                    {pinnedItems.includes(entry.key) ? '📍 Quitar' : '📌 Sacar'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ))}

      {placeholderNotice && (
        <p className="muted" style={{ fontSize: 12, padding: '4px 12px' }}>
          Todavía no hay nada aquí — pídemelo cuando lo necesites y lo construyo.
        </p>
      )}

      {editMode && (
        <>
          {addingCustomItem ? (
            <form onSubmit={handleAddCustomItem} className="inline-fields" style={{ margin: '6px 4px' }}>
              <input
                type="text"
                value={newItemIcon}
                onChange={(e) => setNewItemIcon(e.target.value)}
                style={{ width: 48, textAlign: 'center', flex: 'none' }}
                maxLength={4}
                aria-label="Icono"
              />
              <input
                type="text"
                value={newItemLabel}
                onChange={(e) => setNewItemLabel(e.target.value)}
                placeholder="Nombre del acceso"
                autoFocus
                style={{ flex: 1 }}
              />
              <button type="submit">Crear</button>
            </form>
          ) : (
            <button type="button" className="economia-menu-item" onClick={() => setAddingCustomItem(true)}>
              <span aria-hidden="true">📌</span>
              Nuevo acceso
            </button>
          )}

          {addingGroup ? (
            <form onSubmit={handleAddGroup} className="inline-fields" style={{ margin: '6px 4px' }}>
              <input
                type="text"
                value={addingGroupName}
                onChange={(e) => setAddingGroupName(e.target.value)}
                placeholder="Nombre de la categoría"
                autoFocus
                style={{ flex: 1 }}
              />
              <button type="submit">Crear</button>
            </form>
          ) : (
            <button type="button" className="economia-menu-item" onClick={() => setAddingGroup(true)}>
              <span aria-hidden="true">➕</span>
              Nueva categoría
            </button>
          )}
        </>
      )}
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
  // Petición real: "los lugares frecuentes... en un desplegable". Cerrado por defecto — la pantalla
  // ya tiene bastante arriba (mapa, compartir, formulario de añadir).
  const [placesOpen, setPlacesOpen] = useState(false)
  // Petición real: "lo quiero así" (capturas de Google Maps: pestañas abajo del mapa "Lugares" /
  // "¡Estoy aquí!" / "Compartir ubicación") — debajo del mapa (que se queda fijo, como el chip de
  // cada persona) el contenido se reparte en estas 3 pestañas en vez de ir todo seguido en una sola
  // pantalla larga.
  const [panelTab, setPanelTab] = useState<'lugares' | 'estoy-aqui' | 'compartir'>('lugares')

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
  useEffect(() => {
    const interval = setInterval(async () => {
      const historyEntries = await Promise.all(
        locationsRef.current.map(async (loc) => [loc.memberId, await listMemberLocationHistory(loc.memberId)] as const),
      )
      setHistories(Object.fromEntries(historyEntries))
    }, 5 * 60_000)
    return () => clearInterval(interval)
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
            Todavía no aparece nadie en el mapa. Toca el chip de alguien arriba para activar su ubicación y, desde
            el móvil de esa persona, entra aquí y toca su nombre en "Este dispositivo" para empezar a compartir.
          </p>
        )
      )}

      <div className="segmented" style={{ marginTop: 16 }} role="tablist">
        <button type="button" role="tab" aria-selected={panelTab === 'lugares'} className={panelTab === 'lugares' ? 'segmented-active' : ''} onClick={() => setPanelTab('lugares')}>
          🏠 Lugares
        </button>
        <button type="button" role="tab" aria-selected={panelTab === 'estoy-aqui'} className={panelTab === 'estoy-aqui' ? 'segmented-active' : ''} onClick={() => setPanelTab('estoy-aqui')}>
          📍 ¡Estoy aquí!
        </button>
        <button type="button" role="tab" aria-selected={panelTab === 'compartir'} className={panelTab === 'compartir' ? 'segmented-active' : ''} onClick={() => setPanelTab('compartir')}>
          👥 Compartir ubicación
        </button>
      </div>

      {panelTab === 'lugares' && (
        <div>
          {/* Petición real: "lo de añadir otro lo pones arriba para que se vea lo primero y debajo
              los lugares frecuentes [en un desplegable]" — antes la lista de lugares salía siempre
              entera, delante del formulario para añadir uno nuevo. */}
          <AddPlaceForm onAdded={reload} />

          <button type="button" className="guest-breakdown-toggle" onClick={() => setPlacesOpen((v) => !v)} aria-expanded={placesOpen} style={{ marginTop: 20 }}>
            <span className="section-title" style={{ marginTop: 0 }}>
              Lugares frecuentes
            </span>
            <span className="guest-breakdown-chevron" aria-hidden="true">
              {placesOpen ? '︿' : '⌄'}
            </span>
          </button>
          {placesOpen && (
            <div className="event-list">
              {places.map((place) => (
                <PlaceRow key={place.id} place={place} locations={locations} members={members} onChanged={reload} />
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
            <p className="muted inline-fields" style={{ alignItems: 'center' }}>
              📍 Compartiendo como {members.find((m) => m.id === sharingAs)?.name}.
              <button type="button" className="link-button" onClick={stopSharingGlobal}>
                Dejar de compartir
              </button>
            </p>
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

          <h2 className="section-title">¿Quién puede compartir?</h2>
          <p className="muted">
            {isAdmin ? 'Activa o desactiva a cada miembro de la familia.' : 'Solo puedes activar o desactivar tu propia ubicación.'}
          </p>
          <div className="event-list">
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
      await addPlace({ name, category: null, latitude: coords.latitude, longitude: coords.longitude, radiusM: 150, notifyArrivals: true })
      onPlaceAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setAddingQuick(null)
    }
  }

  return (
    <div className="card member-form">
      <p className="muted">Comparte dónde estás ahora mismo, o guarda este sitio como lugar frecuente.</p>
      <button type="button" onClick={handleShareHere} disabled={sharing}>
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
      <div className="inline-fields">
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
  onChanged,
}: {
  place: LocationPlace
  locations: MemberLocation[]
  members: FamilyMember[]
  onChanged: () => void
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
  const [editNotify, setEditNotify] = useState(place.notifyArrivals)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  function startEditing() {
    setEditName(place.name)
    setEditCategory(place.category ?? '')
    setEditRadius(place.radiusM)
    setEditNotify(place.notifyArrivals)
    setEditError(null)
    setEditing(true)
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault()
    setEditSaving(true)
    setEditError(null)
    try {
      await updatePlace(place.id, { name: editName.trim(), category: editCategory.trim() || null, radiusM: editRadius })
      if (editNotify !== place.notifyArrivals) await setPlaceNotifyArrivals(place.id, editNotify)
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
      setEta(await getDrivingEta(loc, place))
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
      <form onSubmit={handleSaveEdit} className="card member-form">
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
        <label className="inline-fields" style={{ alignItems: 'center' }}>
          <input type="checkbox" checked={editNotify} onChange={(e) => setEditNotify(e.target.checked)} />
          🔔 Avisarme cuando alguien llegue o se vaya de aquí
        </label>
        {editError && <p className="error">{editError}</p>}
        <div className="inline-fields">
          <button type="submit" disabled={editSaving}>
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
        {place.notifyArrivals && <p className="muted">🔔 Avisa cuando alguien llega o se va de aquí</p>}
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
        <button type="button" className="link-button" onClick={startEditing} style={{ marginTop: 6 }}>
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
  const [radiusM, setRadiusM] = useState(150)
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
    <form onSubmit={handleSubmit} className="card member-form">
      <h2>Nuevo lugar</h2>
      <label>
        Nombre
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Supermercado" required />
      </label>
      <label>
        Categoría (opcional)
        <input
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Trabajo, casa de mamá, campo de papá…"
        />
      </label>
      <label>
        Radio (m)
        <input type="number" value={radiusM} onChange={(e) => setRadiusM(Number(e.target.value))} />
      </label>
      <label className="inline-fields" style={{ alignItems: 'center' }}>
        <input type="checkbox" checked={notifyArrivals} onChange={(e) => setNotifyArrivals(e.target.checked)} />
        🔔 Avisarme cuando alguien llegue o se vaya de aquí
      </label>
      <div className="inline-fields">
        <button type="button" className="link-button" onClick={() => setPickerOpen(true)}>
          🔍 Buscar por nombre
        </button>
        <button type="button" className="link-button" onClick={handleUseCurrentPosition}>
          {coords ? '✓ Ubicación capturada' : '📍 Usar mi ubicación actual'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
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
  // AutomationWatcher al disparar), así que aquí se verían rotas. Se gestionan desde el propio lugar.
  const visibleRules = rules.filter((rule) => !rule.name.startsWith(PLACE_NOTIFY_RULE_PREFIX))

  return (
    <div>
      {error && <p className="error">{error}</p>}
      <div className="event-list">
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
