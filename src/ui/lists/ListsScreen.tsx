import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  createFolder,
  createList,
  deleteFolder,
  deleteList,
  duplicateExistingList,
  loadListsOverview,
  renameFolder,
  reorderLists,
  updateList,
  type ListsOverview,
} from '@/data/lists'
import {
  LIST_KIND_HINTS,
  LIST_KIND_LABELS,
  progressOf,
  searchLists,
  validateFolderName,
  validateTitle,
  type ListFolder,
  type ListKind,
  type UserList,
} from '@/domain/lists'
import { emitHelpEvent } from '@/help/tours/helpBus'
import { useRealtimeRefresh } from '@/state/useRealtimeRefresh'
import { ConfirmButton } from '@/ui/ConfirmButton'
import { SectionBreadcrumb } from '@/ui/SectionBreadcrumb'
import { useDragSort } from '@/ui/lists/gestures'
import { ListDetailScreen } from '@/ui/lists/ListDetailScreen'
import { UndoBar, type UndoState } from '@/ui/lists/UndoBar'
import '@/ui/lists/lists.css'

export function ListsScreen() {
  // Ruta única «/listas/*»: lo que sigue a «/listas/» es el identificador de la lista.
  const listId = useParams()['*']?.split('/')[0] || undefined
  return listId ? <ListDetailScreen listId={listId} /> : <ListsHome />
}

type Sheet =
  | { type: 'newList' }
  | { type: 'newFolder' }
  | { type: 'renameFolder'; folder: ListFolder }
  | { type: 'move'; list: UserList }
  | null

const OPEN_KEY = 'pepa-listas-carpetas-abiertas'
function readOpen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

function ListsHome() {
  const [data, setData] = useState<ListsOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sheet, setSheet] = useState<Sheet>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [open, setOpen] = useState<Set<string>>(() => readOpen())
  const [showArchived, setShowArchived] = useState(false)
  const [undo, setUndo] = useState<UndoState | null>(null)
  const navigate = useNavigate()

  const reload = useCallback(async () => {
    try {
      setData(await loadListsOverview())
      setError(null)
    } catch {
      setError('No se han podido cargar tus listas. Comprueba la conexión e inténtalo de nuevo.')
    }
  }, [])
  useEffect(() => {
    void reload()
  }, [reload])

  const run = useCallback(
    async (fn: () => Promise<unknown>, failMsg = 'No se ha podido guardar el cambio. Inténtalo de nuevo.') => {
      try {
        await fn()
        setError(null)
      } catch {
        setError(failMsg)
      }
      await reload()
    },
    [reload],
  )

  const toggleFolder = (id: string) => {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify([...next]))
      } catch {
        /* sin almacenamiento: se queda como está en esta sesión */
      }
      return next
    })
  }

  const folderIds = useMemo(() => new Set((data?.folders ?? []).map((f) => f.id)), [data])
  // Una lista cuya carpeta no es mía (la creó otra persona y me la comparte) se enseña sin carpeta: nunca se revela la carpeta ajena.
  const myFolderOf = (l: UserList) => (l.folderId && folderIds.has(l.folderId) ? l.folderId : null)
  const active = useMemo(() => (data?.lists ?? []).filter((l) => !l.archivedAt), [data])
  const archived = useMemo(() => (data?.lists ?? []).filter((l) => l.archivedAt), [data])
  const progress = useMemo(() => {
    const by = new Map<string, { done: boolean; depth: number }[]>()
    for (const it of data?.items ?? []) {
      const arr = by.get(it.listId) ?? []
      arr.push(it)
      by.set(it.listId, arr)
    }
    return by
  }, [data])

  const matches = useMemo(() => {
    if (!data || !query.trim()) return null
    const texts: Record<string, string[]> = {}
    for (const it of data.items) (texts[it.listId] ??= []).push(it.text)
    return searchLists(data.lists, texts, query)
  }, [data, query])

  const drag = useDragSort((dragId, target) => {
    if (!data || !target) return
    const dragged = data.lists.find((l) => l.id === dragId)
    if (!dragged || dragged.createdBy !== data.userId) return
    if (target.kind === 'folder') {
      void run(() => updateList(dragId, { folderId: target.id }))
    } else if (target.kind === 'root') {
      if (dragged.folderId) void run(() => updateList(dragId, { folderId: null }))
    } else if (target.kind === 'list') {
      const dest = data.lists.find((l) => l.id === target.id)
      if (!dest) return
      const destFolder = myFolderOf(dest)
      const group = active.filter((l) => myFolderOf(l) === destFolder && l.id !== dragId)
      const at = group.findIndex((l) => l.id === target.id) + (target.after ? 1 : 0)
      group.splice(at, 0, dragged)
      void run(async () => {
        if (myFolderOf(dragged) !== destFolder) await updateList(dragId, { folderId: destFolder })
        await reorderLists(group.filter((l) => l.createdBy === data.userId).map((l) => l.id))
      })
    }
  })

  // Listas, carpetas y elementos cambiados en otro dispositivo; no se recarga con una ventana abierta, un menú desplegado o un arrastre en curso.
  useRealtimeRefresh(['user_lists', 'list_items', 'list_folders'], reload, { paused: sheet !== null || menuId !== null || drag.dragId !== null })

  if (!data && !error) return <div className="screen">Cargando tus listas…</div>

  const renderRow = (l: UserList, showFolder = false) => {
    const mine = data ? l.createdBy === data.userId : false
    const p = progressOf(progress.get(l.id) ?? [])
    const folderName = showFolder && l.folderId ? data?.folders.find((f) => f.id === l.folderId)?.name : null
    const dragging = drag.dragId === l.id
    return (
      <div
        key={l.id}
        className={'lists-row' + (dragging ? ' lists-row-dragging' : '') + (drag.over?.id === l.id && !dragging ? (drag.over.after ? ' lists-drop-after' : ' lists-drop-before') : '')}
        data-drop-id={l.id}
        data-drop-kind="list"
        style={dragging ? { transform: `translateY(${drag.offsetY}px)` } : undefined}
      >
        {!(mine && !query) && <span className="lists-row-spacer" aria-hidden="true" />}
        {mine && !query && (
          <span className="shopping-drag-handle" {...drag.handleProps(l.id)} aria-label="Arrastrar para mover o reordenar">
            ⠿
          </span>
        )}
        <Link to={`/listas/${l.id}`} className="lists-row-main" data-help-id="listas.lista">
          <strong>{l.title}</strong>
          <span className="muted lists-row-meta">
            {LIST_KIND_LABELS[l.kind]}
            {l.kind === 'tareas' && p.total > 0 ? ` · ${p.done}/${p.total}` : ''}
            {p.total === 0 ? ' · vacía' : ''}
            {folderName ? ` · ${folderName}` : ''}
            {l.archivedAt ? ' · archivada' : ''}
          </span>
        </Link>
        <span className="lists-privacy muted" title={l.visibility === 'privada' ? 'Solo tú la ves' : mine ? 'La ve la familia' : 'Compartida contigo'}>
          {l.visibility === 'privada' ? '🔒' : '👪'}
        </span>
        {mine && (
          <button type="button" className="member-row-more" aria-label={`Acciones de ${l.title}`} aria-expanded={menuId === l.id} onClick={() => setMenuId(menuId === l.id ? null : l.id)}>
            ⋯
          </button>
        )}
        {menuId === l.id && (
          <div className="member-row-actions lists-menu">
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setMenuId(null)
                setSheet({ type: 'move', list: l })
              }}
            >
              Mover a…
            </button>
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setMenuId(null)
                void run(async () => {
                  const id = await duplicateExistingList(l.id)
                  navigate(`/listas/${id}`)
                })
              }}
            >
              Duplicar (queda privada)
            </button>
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setMenuId(null)
                void run(() => updateList(l.id, { archivedAt: l.archivedAt ? null : new Date().toISOString() }))
              }}
            >
              {l.archivedAt ? 'Recuperar' : 'Archivar'}
            </button>
            <ConfirmButton
              label="Eliminar lista"
              confirmMessage="Se borra la lista y todo lo que contiene."
              onConfirm={() => {
                setMenuId(null)
                void run(() => deleteList(l.id))
              }}
            />
          </div>
        )}
      </div>
    )
  }

  const rootLists = active.filter((l) => !myFolderOf(l))
  const visibleRoot = matches ? rootLists.filter((l) => matches.has(l.id)) : rootLists

  return (
    <div className="screen lists-screen">
      <h2 className="lists-title">📝 Mis listas</h2>
      <SectionBreadcrumb subsection="Inicio" />
      {error && <p className="error">{error}</p>}

      <input
        type="search"
        className="lists-search"
        placeholder="Buscar por título o contenido"
        aria-label="Buscar en mis listas"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        data-help-id="listas.buscar"
      />
      <div className="lists-actions">
        <button type="button" className="primary-button" onClick={() => setSheet({ type: 'newList' })} data-help-id="listas.nueva-lista">
          Nueva lista
        </button>
        <button type="button" className="secondary-button" onClick={() => setSheet({ type: 'newFolder' })} data-help-id="listas.nueva-carpeta">
          Nueva carpeta
        </button>
      </div>

      {data && data.lists.length === 0 && data.folders.length === 0 && (
        <p className="muted lists-empty">Aún no tienes listas. Crea la primera con «Nueva lista».</p>
      )}
      {matches && matches.size === 0 && <p className="muted lists-empty">No hay ninguna lista con «{query.trim()}».</p>}

      {data?.folders.map((f) => {
        const inFolder = active.filter((l) => myFolderOf(l) === f.id && (!matches || matches.has(l.id)))
        if (matches && inFolder.length === 0) return null
        const isOpen = open.has(f.id) || !!matches
        return (
          <div key={f.id} className={'card lists-folder' + (drag.over?.id === f.id ? ' lists-drop-into' : '')} data-drop-id={f.id} data-drop-kind="folder">
            <div className="lists-folder-head">
              <button type="button" className="lists-folder-toggle" aria-expanded={isOpen} onClick={() => toggleFolder(f.id)}>
                <span aria-hidden="true">{isOpen ? '▾' : '▸'}</span> 📁 <strong>{f.name}</strong>
                <span className="muted"> · {active.filter((l) => myFolderOf(l) === f.id).length}</span>
              </button>
              <button type="button" className="member-row-more" aria-label={`Acciones de la carpeta ${f.name}`} aria-expanded={menuId === f.id} onClick={() => setMenuId(menuId === f.id ? null : f.id)}>
                ⋯
              </button>
            </div>
            {menuId === f.id && (
              <div className="member-row-actions lists-menu">
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    setMenuId(null)
                    setSheet({ type: 'renameFolder', folder: f })
                  }}
                >
                  Cambiar nombre
                </button>
                <ConfirmButton
                  label="Eliminar carpeta"
                  confirmMessage="Se borra la carpeta; las listas que tiene se quedan, sin carpeta."
                  onConfirm={() => {
                    setMenuId(null)
                    void run(() => deleteFolder(f.id))
                  }}
                />
              </div>
            )}
            {isOpen &&
              (inFolder.length ? inFolder.map((l) => renderRow(l)) : <p className="muted lists-empty-folder">Carpeta vacía. Arrastra una lista hasta aquí o usa «Mover a…».</p>)}
          </div>
        )
      })}

      <div className="lists-root" data-drop-id="root" data-drop-kind="root">
        {data && data.folders.length > 0 && visibleRoot.length > 0 && !matches && <p className="muted lists-section-label">Sin carpeta</p>}
        {visibleRoot.map((l) => renderRow(l))}
        {drag.dragId && <div className="lists-root-hint muted">Suelta aquí para sacarla de la carpeta</div>}
      </div>

      {archived.length > 0 && (
        <div className="lists-archived">
          <button type="button" className="link-button" onClick={() => setShowArchived((v) => !v)} aria-expanded={showArchived}>
            {showArchived ? 'Ocultar' : 'Ver'} archivadas ({archived.length})
          </button>
          {showArchived && archived.filter((l) => !matches || matches.has(l.id)).map((l) => renderRow(l, true))}
        </div>
      )}

      {sheet && data && (
        <SheetModal
          sheet={sheet}
          data={data}
          onClose={() => setSheet(null)}
          onCreateList={(title, kind) =>
            run(async () => {
              const l = await createList({ title, kind })
              emitHelpEvent('lists.list-created') // para los tutoriales «Enséñame»: la lista YA está guardada
              setSheet(null)
              navigate(`/listas/${l.id}`)
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
          onMove={(listId, folderId) =>
            run(async () => {
              await updateList(listId, { folderId })
              setSheet(null)
              if (folderId) setOpen((p) => new Set(p).add(folderId))
            })
          }
        />
      )}
      <UndoBar state={undo} onClose={() => setUndo(null)} />
    </div>
  )
}

function SheetModal({
  sheet,
  data,
  onClose,
  onCreateList,
  onCreateFolder,
  onRenameFolder,
  onMove,
}: {
  sheet: NonNullable<Sheet>
  data: ListsOverview
  onClose: () => void
  onCreateList: (title: string, kind: ListKind) => Promise<void>
  onCreateFolder: (name: string) => Promise<void>
  onRenameFolder: (id: string, name: string) => Promise<void>
  onMove: (listId: string, folderId: string | null) => Promise<void>
}) {
  const [text, setText] = useState(sheet.type === 'renameFolder' ? sheet.folder.name : '')
  const [kind, setKind] = useState<ListKind>('tareas')
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const folderNames = data.folders.filter((f) => sheet.type !== 'renameFolder' || f.id !== sheet.folder.id).map((f) => f.name)

  const submit = async () => {
    if (busy) return
    const msg = sheet.type === 'newList' ? validateTitle(text) : validateFolderName(text, folderNames)
    if (msg) {
      setProblem(msg)
      return
    }
    setBusy(true)
    try {
      if (sheet.type === 'newList') await onCreateList(text, kind)
      else if (sheet.type === 'newFolder') await onCreateFolder(text)
      else if (sheet.type === 'renameFolder') await onRenameFolder(sheet.folder.id, text)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {sheet.type === 'move' ? (
          <>
            <h3>Mover «{sheet.list.title}» a…</h3>
            <div className="lists-move-options">
              <button type="button" className={'chip' + (!sheet.list.folderId ? ' chip-active' : '')} onClick={() => void onMove(sheet.list.id, null)}>
                Sin carpeta
              </button>
              {data.folders.map((f) => (
                <button key={f.id} type="button" className={'chip' + (sheet.list.folderId === f.id ? ' chip-active' : '')} onClick={() => void onMove(sheet.list.id, f.id)}>
                  📁 {f.name}
                </button>
              ))}
            </div>
            {data.folders.length === 0 && <p className="muted">Aún no tienes carpetas. Crea una con «Nueva carpeta».</p>}
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
          >
            <h3>{sheet.type === 'newList' ? 'Nueva lista' : sheet.type === 'newFolder' ? 'Nueva carpeta' : 'Cambiar nombre de la carpeta'}</h3>
            <input
              autoFocus
              className="lists-input"
              placeholder={sheet.type === 'newList' ? 'Título de la lista' : 'Nombre de la carpeta'}
              aria-label={sheet.type === 'newList' ? 'Título de la lista' : 'Nombre de la carpeta'}
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setProblem(null)
              }}
            />
            {sheet.type === 'newList' && (
              <div className="lists-kind-options" role="radiogroup" aria-label="Tipo de lista">
                {(Object.keys(LIST_KIND_LABELS) as ListKind[]).map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={kind === k} className={'lists-kind' + (kind === k ? ' lists-kind-active' : '')} onClick={() => setKind(k)}>
                    <strong>{LIST_KIND_LABELS[k]}</strong>
                    <span className="muted">{LIST_KIND_HINTS[k]}</span>
                  </button>
                ))}
              </div>
            )}
            {sheet.type === 'newList' && <p className="muted lists-hint">Será privada: solo tú la verás hasta que decidas compartirla.</p>}
            {problem && <p className="error">{problem}</p>}
            <div className="form-actions">
              <button type="submit" className="primary-button" disabled={busy} data-help-id="listas.crear">
                {sheet.type === 'newList' ? 'Crear' : 'Guardar'}
              </button>
              <button type="button" className="link-button" onClick={onClose}>
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
