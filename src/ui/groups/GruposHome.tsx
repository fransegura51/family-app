import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import gruposHeaderImg from '@/assets/grupos/grupos-header.svg'
import { createFolder, createGroup, deleteFolder, groupsErrorMessage, loadGroupsHome, moveGroupToFolder, renameFolder, type GroupsHomeData } from '@/data/groups'
import { cleanFolderName, groupTitle, organizeGroups, type GroupFolder, type GroupItem } from '@/domain/groups'
import { emitHelpEvent } from '@/help/tours/helpBus'
import { useRealtimeRefresh } from '@/state/useRealtimeRefresh'
import { ConfirmButton } from '@/ui/ConfirmButton'
import { SectionBreadcrumb } from '@/ui/SectionBreadcrumb'
import { Field, GroupSheet } from '@/ui/groups/GroupSheet'
import '@/ui/groups/groups.css'

const OPEN_KEY = 'pepa-grupos-carpetas-abiertas'
function readOpen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

type Sheet = { type: 'newGroup'; folderId?: string | null } | { type: 'newFolder' } | { type: 'renameFolder'; folder: GroupFolder } | { type: 'move'; group: GroupItem } | null

export function GruposHome() {
  const navigate = useNavigate()
  const [data, setData] = useState<GroupsHomeData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<Set<string>>(readOpen) // las carpetas empiezan CERRADAS; solo se recuerdan las que la persona abre
  const [sheet, setSheet] = useState<Sheet>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const reload = useCallback(async () => {
    try {
      setData(await loadGroupsHome())
      setError(null)
    } catch (e) {
      setError(groupsErrorMessage(e, 'No se han podido cargar los grupos.'))
    }
  }, [])
  useEffect(() => {
    void reload()
  }, [reload])
  useRealtimeRefresh(['groups', 'group_participants', 'group_folders', 'group_placements', 'group_managers'], reload, { paused: sheet !== null })

  const home = useMemo(() => (data ? organizeGroups(data.groups, data.folders, query) : null), [data, query])
  const searching = query.trim().length > 0

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify([...next]))
      } catch {
        /* sin almacenamiento: vale mientras la pantalla esté abierta */
      }
      return next
    })

  const run = async (fn: () => Promise<void>) => {
    try {
      await fn()
      setError(null)
      await reload()
    } catch (e) {
      setError(groupsErrorMessage(e))
    }
  }

  const row = (g: GroupItem) => (
    <div key={g.id} className="grp-folder-head" style={{ marginBottom: 8 }}>
      <Link to={`/grupos/${g.id}`} className="grp-row" style={{ marginBottom: 0 }}>
        <span aria-hidden="true">👥</span>
        <span className="grp-row-main">
          <span className="grp-row-title">{groupTitle(g)}</span>
          <span className="grp-row-sub" style={{ display: 'block' }}>
            {data?.participantCounts[g.id] ?? 0} participantes{g.copiedFrom ? ' · copia recibida' : ''}
          </span>
        </span>
      </Link>
      <button type="button" className="link-button" aria-label={`Mover «${g.name}» a una carpeta`} onClick={() => setSheet({ type: 'move', group: g })}>
        📁
      </button>
    </div>
  )

  return (
    <div className="screen grp-screen">
      <div className="kitchen-header">
        <img src={gruposHeaderImg} alt="Gestión de grupos" className="kitchen-header-img" />
      </div>
      <SectionBreadcrumb subsection="Inicio" />
      {error && <p className="error">{error}</p>}

      <div className="grp-actions">
        <button type="button" className="primary-button" data-help-id="grupos.nuevo-grupo" onClick={() => setSheet({ type: 'newGroup' })}>
          ＋ Nuevo grupo
        </button>
        <button type="button" className="grp-secondary" data-help-id="grupos.nueva-carpeta" onClick={() => setSheet({ type: 'newFolder' })}>
          📁 Nueva carpeta
        </button>
        <Link to="/grupos/recibir" className="grp-secondary" data-help-id="grupos.recibir" style={{ display: 'inline-flex', alignItems: 'center' }}>
          Recibir un grupo
        </Link>
      </div>

      <input className="grp-input" type="search" placeholder="Buscar un grupo" aria-label="Buscar un grupo" value={query} onChange={(e) => setQuery(e.target.value)} data-help-id="grupos.buscador" />

      {!data && !error && <p className="muted">Cargando…</p>}

      {home && (
        <div data-help-id="grupos.lista">
          {home.folders.map(({ folder, groups }) => {
            const isOpen = searching || open.has(folder.id)
            return (
              <div key={folder.id} className="grp-folder">
                <div className="grp-folder-head">
                  <button type="button" className="grp-row grp-row-folder" aria-expanded={isOpen} onClick={() => toggle(folder.id)}>
                    <span aria-hidden="true">{isOpen ? '📂' : '📁'}</span>
                    <span className="grp-row-main">
                      <span className="grp-row-title">{folder.name}</span>
                      <span className="grp-row-sub" style={{ display: 'block' }}>
                        {groups.length} {groups.length === 1 ? 'grupo' : 'grupos'}
                      </span>
                    </span>
                  </button>
                  <button type="button" className="link-button" aria-label={`Opciones de la carpeta ${folder.name}`} onClick={() => setMenuId(menuId === folder.id ? null : folder.id)}>
                    ⋯
                  </button>
                </div>
                {menuId === folder.id && (
                  <div className="grp-menu">
                    <button type="button" className="link-button" onClick={() => (setMenuId(null), setSheet({ type: 'newGroup', folderId: folder.id }))}>
                      ＋ Nuevo grupo aquí
                    </button>
                    <button type="button" className="link-button" onClick={() => (setMenuId(null), setSheet({ type: 'renameFolder', folder }))}>
                      Cambiar nombre
                    </button>
                    <ConfirmButton
                      label="Eliminar carpeta"
                      confirmMessage="Se borra la carpeta; los grupos que tiene se quedan, sin carpeta."
                      onConfirm={() => {
                        setMenuId(null)
                        void run(() => deleteFolder(folder.id))
                      }}
                    />
                  </div>
                )}
                {isOpen && <div className="grp-folder-body">{groups.length ? groups.map(row) : <p className="muted">Carpeta vacía. Usa 📁 en un grupo para moverlo aquí.</p>}</div>}
              </div>
            )
          })}
          {home.loose.map(row)}
          {data && data.groups.length === 0 && (
            <p className="muted">Aún no tienes grupos. Crea el primero con «＋ Nuevo grupo»: una clase, un equipo, un grupo de amigos…</p>
          )}
          {data && data.groups.length > 0 && home.folders.length === 0 && home.loose.length === 0 && home.archived.length === 0 && <p className="muted">Ningún grupo coincide con la búsqueda.</p>}
        </div>
      )}

      {home && home.archived.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button type="button" className="link-button" aria-expanded={showArchived || searching} onClick={() => setShowArchived((v) => !v)}>
            {showArchived || searching ? 'Ocultar' : 'Ver'} archivados ({home.archived.length})
          </button>
          {(showArchived || searching) && home.archived.map(row)}
        </div>
      )}

      {sheet && data && (
        <HomeSheet
          sheet={sheet}
          data={data}
          onClose={() => setSheet(null)}
          onCreateGroup={(name, folderId) =>
            run(async () => {
              const id = await createGroup(name, folderId)
              emitHelpEvent('grupos.group-created') // para los tutoriales: el grupo YA está guardado
              setSheet(null)
              navigate(`/grupos/${id}`)
            })
          }
          onCreateFolder={(name) =>
            run(async () => {
              await createFolder(name)
              setSheet(null)
            })
          }
          onRenameFolder={(id, name) =>
            run(async () => {
              await renameFolder(id, name)
              setSheet(null)
            })
          }
          onMove={(groupId, folderId) =>
            run(async () => {
              await moveGroupToFolder(groupId, folderId)
              setSheet(null)
              if (folderId) setOpen((p) => new Set(p).add(folderId))
            })
          }
        />
      )}
    </div>
  )
}

function HomeSheet({
  sheet,
  data,
  onClose,
  onCreateGroup,
  onCreateFolder,
  onRenameFolder,
  onMove,
}: {
  sheet: NonNullable<Sheet>
  data: GroupsHomeData
  onClose: () => void
  onCreateGroup: (name: string, folderId: string | null) => Promise<void>
  onCreateFolder: (name: string) => Promise<void>
  onRenameFolder: (id: string, name: string) => Promise<void>
  onMove: (groupId: string, folderId: string | null) => Promise<void>
}) {
  const [text, setText] = useState(sheet.type === 'renameFolder' ? sheet.folder.name : '')
  const [folderId, setFolderId] = useState<string | null>(sheet.type === 'newGroup' ? sheet.folderId ?? null : null)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (sheet.type === 'move') {
    return (
      <GroupSheet title={`Mover «${sheet.group.name}» a…`} onClose={onClose}>
        <div className="grp-chips">
          <button type="button" className={'chip' + (!sheet.group.folderId ? ' chip-active' : '')} onClick={() => void onMove(sheet.group.id, null)}>
            Sin carpeta
          </button>
          {data.folders.map((f) => (
            <button key={f.id} type="button" className={'chip' + (sheet.group.folderId === f.id ? ' chip-active' : '')} onClick={() => void onMove(sheet.group.id, f.id)}>
              📁 {f.name}
            </button>
          ))}
        </div>
        {data.folders.length === 0 && <p className="muted">Aún no tienes carpetas. Crea una con «Nueva carpeta».</p>}
      </GroupSheet>
    )
  }

  const isGroup = sheet.type === 'newGroup'
  const submit = async () => {
    if (busy) return
    if (isGroup) {
      if (!text.trim()) return setProblem('Escribe el nombre del grupo.')
    } else {
      const n = cleanFolderName(text)
      if (!n) return setProblem('Escribe un nombre para la carpeta (hasta 80 letras).')
      const others = data.folders.filter((f) => sheet.type !== 'renameFolder' || f.id !== sheet.folder.id).map((f) => f.name.toLowerCase())
      if (others.includes(n.toLowerCase())) return setProblem('Ya tienes una carpeta con ese nombre.')
    }
    setBusy(true)
    try {
      if (sheet.type === 'newGroup') await onCreateGroup(text, folderId)
      else if (sheet.type === 'newFolder') await onCreateFolder(text)
      else if (sheet.type === 'renameFolder') await onRenameFolder(sheet.folder.id, text)
    } finally {
      setBusy(false)
    }
  }

  return (
    <GroupSheet title={isGroup ? 'Nuevo grupo' : sheet.type === 'newFolder' ? 'Nueva carpeta' : 'Cambiar nombre de la carpeta'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Field label={isGroup ? 'Nombre del grupo' : 'Nombre de la carpeta'}>
          <input
            autoFocus
            className="grp-input"
            placeholder={isGroup ? 'Por ejemplo: Clase de Eric' : 'Por ejemplo: Cole'}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setProblem(null)
            }}
            data-help-id={isGroup ? 'grupos.nombre-grupo' : undefined}
          />
        </Field>
        {isGroup && data.folders.length > 0 && (
          <>
            <p className="muted" style={{ margin: '8px 0 0' }}>
              Carpeta (opcional)
            </p>
            <div className="grp-chips">
              <button type="button" className={'chip' + (!folderId ? ' chip-active' : '')} onClick={() => setFolderId(null)}>
                Sin carpeta
              </button>
              {data.folders.map((f) => (
                <button key={f.id} type="button" className={'chip' + (folderId === f.id ? ' chip-active' : '')} onClick={() => setFolderId(f.id)}>
                  📁 {f.name}
                </button>
              ))}
            </div>
          </>
        )}
        {problem && <p className="error">{problem}</p>}
        <div className="form-actions">
          <button type="submit" className="primary-button" disabled={busy} data-help-id="grupos.crear-grupo">
            {isGroup ? 'Crear grupo' : 'Guardar'}
          </button>
          <button type="button" className="link-button" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </form>
    </GroupSheet>
  )
}
