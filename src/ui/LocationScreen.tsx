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
  setConsent,
  toggleAutomationRule,
} from '@/data/location'
import { getMemberPhotoUrl, listFamilyMembers } from '@/data/family'
import { ConfirmButton, ConfirmIconButton } from '@/ui/ConfirmButton'
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
import ubicacionHeaderImg from '@/assets/ubicacion/ubicacion-header.jpg'
import { errorMessage } from '@/domain/errorMessage'

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
          className="kitchen-header-menu-fab kitchen-header-menu-fab-lower"
          onClick={() => setMenuOpen((v) => !v)}
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
  return (
    <div className="event-list">
      {shortcuts.map((s) => {
        const meta = UBICACION_MENU_ITEM_META[s.tab]
        return (
          <button key={s.tab} type="button" className="section-shortcut-card" onClick={() => onNavigate(s.tab)}>
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
      setError(errorMessage(err, 'No se pudo obtener la ubicación'))
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
