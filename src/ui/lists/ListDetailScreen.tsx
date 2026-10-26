import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  addColumn,
  addListItems,
  deleteColumn,
  deleteList,
  deleteListItems,
  duplicateExistingList,
  eventsLinkedToList,
  loadListDetail,
  pendingShoppingNames,
  renameColumn,
  saveItemPlacements,
  sendItemsToShopping,
  updateList,
  updateListItem,
  type ItemPlacement,
  type ListDetail,
} from '@/data/lists'
import {
  LIST_KIND_LABELS,
  LIST_VISIBILITY_LABELS,
  blockRange,
  canIndent,
  canOutdent,
  displayItems,
  indentItem,
  isObviousDuplicate,
  newId,
  outdentItem,
  plainForShopping,
  progressOf,
  relocateBlock,
  validateTitle,
  type ListColumn,
  type ListItem,
  type ListVisibility,
} from '@/domain/lists'
import { showToast } from '@/state/toast'
import { useRealtimeRefresh } from '@/state/useRealtimeRefresh'
import { ConfirmButton } from '@/ui/ConfirmButton'
import { SectionBreadcrumb } from '@/ui/SectionBreadcrumb'
import { CalendarLinksSheet } from '@/ui/lists/CalendarLinksSheet'
import { useDragSort } from '@/ui/lists/gestures'
import { ImportFlow } from '@/ui/lists/ImportFlow'
import { ItemEditor, type EditorResult } from '@/ui/lists/ItemEditor'
import { ItemRow } from '@/ui/lists/ItemRow'
import { UndoBar, type UndoState } from '@/ui/lists/UndoBar'

interface Draft {
  /** Detrás de qué elemento se crea (null = al final del grupo). */
  afterId: string | null
  columnId: string | null
  depth: 0 | 1
}

// Valor de sort_order entre dos vecinos; null si no cabe nada en medio (hay que renumerar).
function between(prev: number | undefined, next: number | undefined): number | null {
  if (prev != null && next != null) return next - prev >= 2 ? Math.floor((prev + next) / 2) : null
  if (prev != null) return prev + 1000
  if (next != null) return next - 1000
  return Date.now()
}

export function ListDetailScreen({ listId }: { listId: string }) {
  const navigate = useNavigate()
  const [detail, setDetail] = useState<ListDetail | null | undefined>(undefined)
  const [items, setItems] = useState<ListItem[]>([])
  const [columns, setColumns] = useState<ListColumn[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [menu, setMenu] = useState(false)
  const [sheet, setSheet] = useState<'privacy' | 'import' | 'calendar' | null>(null)
  const [undo, setUndo] = useState<UndoState | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [titleEditing, setTitleEditing] = useState(false)
  const [titleText, setTitleText] = useState('')
  const [linkedCount, setLinkedCount] = useState(0)

  const load = useCallback(async () => {
    try {
      const d = await loadListDetail(listId)
      setDetail(d)
      if (d) {
        setItems([...d.items].sort((a, b) => a.sortOrder - b.sortOrder))
        setColumns(d.columns)
        setError(null)
        eventsLinkedToList(listId).then((e) => setLinkedCount(e.length), () => undefined)
      }
    } catch {
      setError('No se ha podido cargar la lista. Comprueba la conexión e inténtalo de nuevo.')
      setDetail((cur) => (cur === undefined ? null : cur))
    }
  }, [listId])
  useEffect(() => {
    void load()
  }, [load])

  const list = detail?.list ?? null
  const mine = !!detail && !!list && list.createdBy === detail.userId
  const isComparativa = list?.kind === 'comparativa'

  // Comparativa: siempre hay al menos dos columnas (por defecto «Pros» y «Contras»).
  useEffect(() => {
    if (!detail || !isComparativa || columns.length > 0) return
    void (async () => {
      try {
        const a = await addColumn(listId, 'Pros', 0)
        const b = await addColumn(listId, 'Contras', 1)
        setColumns([a, b])
      } catch {
        setError('No se han podido preparar las columnas de la comparativa.')
      }
    })()
  }, [detail, isComparativa, columns.length, listId])

  const firstColumn = columns[0]?.id ?? null
  // Los elementos sin columna (listas convertidas o importadas) se enseñan en la primera.
  const colOf = useCallback((i: ListItem) => (isComparativa ? (i.columnId ?? firstColumn) : null), [isComparativa, firstColumn])
  const normalized = useMemo(() => (isComparativa ? items.map((i) => (i.columnId ? i : { ...i, columnId: firstColumn })) : items), [items, isComparativa, firstColumn])
  const groupItems = useCallback((key: string | null) => normalized.filter((i) => colOf(i) === key), [normalized, colOf])
  const linked = useMemo(() => new Set(detail?.shoppingLinked ?? []), [detail])

  const fail = (msg = 'No se ha podido guardar el cambio. Se ha vuelto a cargar la lista.') => {
    setError(msg)
    void load()
  }

  // ------------------------------------------------------------------------------------------------- título y ajustes de la lista
  const saveTitle = async () => {
    setTitleEditing(false)
    if (!list || titleText.trim() === list.title) return
    const msg = validateTitle(titleText)
    if (msg) {
      setError(msg)
      return
    }
    try {
      await updateList(list.id, { title: titleText })
      await load()
    } catch {
      fail()
    }
  }
  const changeList = async (patch: Parameters<typeof updateList>[1]) => {
    if (!list) return
    try {
      await updateList(list.id, patch)
      await load()
    } catch {
      fail()
    }
  }

  // ------------------------------------------------------------------------------------------------- elementos
  const toggleDone = async (item: ListItem) => {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)))
    try {
      await updateListItem(item.id, { done: !item.done })
    } catch {
      fail()
    }
  }

  const insertionOrder = (group: ListItem[], afterIndex: number): number | null => between(group[afterIndex]?.sortOrder, group[afterIndex + 1]?.sortOrder)

  const renumberAll = async (arr: ListItem[]): Promise<ListItem[]> => {
    const base = Date.now()
    const out = arr.map((i, n) => ({ ...i, sortOrder: base + n * 1000 }))
    await saveItemPlacements(out.map((i) => ({ id: i.id, sortOrder: i.sortOrder, depth: i.depth, columnId: i.columnId })))
    return out
  }

  const createItem = async (d: Draft, res: EditorResult): Promise<string | null> => {
    const group = groupItems(d.columnId)
    let afterIndex = d.afterId ? group.findIndex((i) => i.id === d.afterId) : group.length - 1
    if (afterIndex >= 0 && d.afterId) afterIndex = blockRange(group, afterIndex)[1] - 1
    const order = insertionOrder(group, afterIndex)
    const id = newId()
    const base: ListItem = {
      id,
      listId,
      familyId: list?.familyId ?? '',
      depth: d.depth,
      text: res.text,
      rich: res.rich,
      done: false,
      doneAt: null,
      sortOrder: order ?? Date.now(),
      columnId: d.columnId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const anchor = afterIndex >= 0 ? group[afterIndex].id : null
    const at = anchor ? items.findIndex((i) => i.id === anchor) + 1 : items.length
    let next = [...items.slice(0, at), base, ...items.slice(at)]
    setItems(next)
    try {
      await addListItems(listId, [{ id, text: res.text, rich: res.rich, depth: d.depth, columnId: d.columnId, sortOrder: base.sortOrder }])
      if (order === null) {
        next = await renumberAll(next)
        setItems(next)
      }
      return id
    } catch {
      fail()
      return null
    }
  }

  const commitEdit = async (item: ListItem, res: EditorResult | null, andNext: boolean) => {
    setEditingId(null)
    if (res && (res.text !== item.text || res.rich !== item.rich)) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, text: res.text, rich: res.rich } : i)))
      try {
        await updateListItem(item.id, { text: res.text, rich: res.rich })
      } catch {
        fail()
        return
      }
    }
    if (andNext && res) setDraft({ afterId: item.id, columnId: colOf(item), depth: item.depth })
  }

  const commitDraft = async (d: Draft, res: EditorResult | null, andNext: boolean) => {
    setDraft(null)
    if (!res) return
    const id = await createItem(d, res)
    if (id && andNext) setDraft({ afterId: id, columnId: d.columnId, depth: d.depth })
  }

  const setDepth = async (item: ListItem, delta: 1 | -1) => {
    const key = colOf(item)
    const group = groupItems(key)
    const idx = group.findIndex((i) => i.id === item.id)
    const next = delta === 1 ? indentItem(group, idx) : outdentItem(group, idx)
    if (next === group) return
    const newDepth = next[idx].depth
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, depth: newDepth } : i)))
    try {
      await updateListItem(item.id, { depth: newDepth })
    } catch {
      fail()
    }
  }

  const deleteItem = async (item: ListItem) => {
    const group = groupItems(colOf(item))
    const idx = group.findIndex((i) => i.id === item.id)
    const [, end] = blockRange(group, idx)
    const children = item.depth === 0 ? group.slice(idx + 1, end) : []
    setItems((prev) => prev.filter((i) => i.id !== item.id).map((i) => (children.some((c) => c.id === i.id) ? { ...i, depth: 0 as const } : i)))
    try {
      await deleteListItems([item.id])
      for (const c of children) await updateListItem(c.id, { depth: 0 })
    } catch {
      fail()
      return
    }
    setUndo({
      message: 'Elemento eliminado',
      undo: () => {
        void (async () => {
          try {
            await addListItems(listId, [{ id: item.id, text: item.text, rich: item.rich, depth: item.depth, done: item.done, columnId: item.columnId, sortOrder: item.sortOrder }])
            for (const c of children) await updateListItem(c.id, { depth: 1 })
          } catch {
            setError('No se ha podido recuperar el elemento.')
          }
          await load()
        })()
      },
    })
  }

  // Arrastrar: el bloque (elemento + subelementos) cambia de sitio o de columna. Solo se guardan los elementos que se han movido.
  const drag = useDragSort((dragId, target) => {
    if (!target || (target.kind !== 'item' && target.kind !== 'column')) return
    const next = relocateBlock(normalized, dragId, target.kind === 'item' ? { id: target.id, after: target.after } : { id: null, columnId: target.id, after: true })
    if (next === normalized) return
    const moved = next.filter((n, i) => normalized[i]?.id !== n.id || normalized[i].depth !== n.depth || normalized[i].columnId !== n.columnId)
    if (moved.length === 0) return
    const first = next.findIndex((n) => n.id === moved[0].id)
    const lo = next[first - 1]?.sortOrder
    const afterBlock = next.slice(first).find((n) => !moved.some((m) => m.id === n.id))
    const hi = afterBlock?.sortOrder
    const step = lo != null && hi != null ? (hi - lo) / (moved.length + 1) : 1000
    const fits = lo == null || hi == null || step >= 1
    const placed = fits ? next.map((n) => {
      const k = moved.findIndex((m) => m.id === n.id)
      if (k < 0) return n
      const so = lo != null && hi != null ? Math.floor(lo + step * (k + 1)) : lo != null ? lo + 1000 * (k + 1) : hi != null ? hi - 1000 * (moved.length - k) : Date.now() + k * 1000
      return { ...n, sortOrder: so }
    }) : next.map((n, i) => ({ ...n, sortOrder: Date.now() + i * 1000 }))
    const changed: ItemPlacement[] = (fits ? placed.filter((n) => moved.some((m) => m.id === n.id)) : placed).map((n) => ({ id: n.id, sortOrder: n.sortOrder, depth: n.depth, columnId: isComparativa ? n.columnId : null }))
    setItems(placed)
    saveItemPlacements(changed).catch(() => fail())
  })

  // ------------------------------------------------------------------------------------------------- comparativa
  const renameCol = async (c: ListColumn, title: string) => {
    const t = title.trim().slice(0, 60)
    if (t === c.title) return
    setColumns((prev) => prev.map((x) => (x.id === c.id ? { ...x, title: t } : x)))
    try {
      await renameColumn(c.id, t)
    } catch {
      fail()
    }
  }
  const addCol = async () => {
    try {
      const c = await addColumn(listId, `Opción ${columns.length + 1}`, columns.length)
      setColumns((prev) => [...prev, c])
    } catch {
      fail()
    }
  }
  const removeCol = async (c: ListColumn) => {
    const rest = columns.filter((x) => x.id !== c.id)
    if (rest.length < 2) return
    const moving = groupItems(c.id)
    try {
      // Sus elementos pasan a la primera columna que queda; nunca se pierden con la columna.
      const dest = rest[0].id
      const tail = groupItems(dest)
      let order = (tail[tail.length - 1]?.sortOrder ?? Date.now()) + 1000
      const placements = moving.map((m) => ({ id: m.id, sortOrder: (order += 1000), depth: m.depth, columnId: dest }))
      await saveItemPlacements(placements)
      await deleteColumn(c.id)
      await load()
    } catch {
      fail()
    }
  }

  // ------------------------------------------------------------------------------------------------- enviar a Compras
  const startSelecting = () => {
    setMenu(false)
    setSelecting(true)
    setSelected(new Set(items.filter((i) => !i.done).map((i) => i.id)))
  }
  const [dupAsk, setDupAsk] = useState<{ fresh: ListItem[]; dup: ListItem[] } | null>(null)
  // Cambios hechos en otro dispositivo: elementos, columnas y datos de la lista. No se recarga mientras se edita un elemento o el título, se elige qué enviar, hay una ventana abierta o se arrastra.
  useRealtimeRefresh(['list_items', 'list_columns', 'user_lists'], load, { paused: editingId !== null || draft !== null || titleEditing || selecting || sheet !== null || dupAsk !== null || drag.dragId !== null })

  const doSend = async (chosen: ListItem[]) => {
    setDupAsk(null)
    if (chosen.length === 0) {
      showToast('No hay nada que enviar.')
      return
    }
    try {
      const n = await sendItemsToShopping(chosen.map((i) => ({ itemId: i.id, name: plainForShopping(i) })))
      showToast(n === 1 ? 'Enviado 1 elemento a la Lista de la compra' : `Enviados ${n} elementos a la Lista de la compra`)
      setSelecting(false)
      setSelected(new Set())
      await load()
    } catch {
      setError('No se ha podido enviar a la Lista de la compra. Inténtalo de nuevo.')
    }
  }
  const confirmSend = async () => {
    const chosen = items.filter((i) => selected.has(i.id))
    if (chosen.length === 0) return
    let names: string[] = []
    try {
      names = await pendingShoppingNames()
    } catch {
      /* sin la comprobación se envía igualmente: es solo un aviso */
    }
    const dup = chosen.filter((c) => names.some((n) => isObviousDuplicate(n, plainForShopping(c))))
    if (dup.length) setDupAsk({ fresh: chosen.filter((c) => !dup.includes(c)), dup })
    else await doSend(chosen)
  }

  // ------------------------------------------------------------------------------------------------- pintado
  if (detail === undefined) return <div className="screen">Cargando la lista…</div>
  if (!detail || !list) {
    return (
      <div className="screen lists-screen">
        <SectionBreadcrumb subsection="Inicio" />
        <p className="error">{error ?? 'Esta lista no existe o no tienes acceso a ella.'}</p>
        <Link to="/listas" className="link-button">
          ← Volver a Mis listas
        </Link>
      </div>
    )
  }

  const progress = progressOf(items)
  const canReorder = list.sortMode === 'manual' && !selecting

  const renderGroup = (key: string | null) => {
    const group = groupItems(key)
    const shown = displayItems(group, list.sortMode)
    const rows = shown.map((item) => {
      if (editingId === item.id) {
        const idx = group.findIndex((i) => i.id === item.id)
        return (
          <div key={item.id} className={'price-row lists-item lists-item-editing' + (item.depth === 1 ? ' lists-item-sub' : '')}>
            <span className="shopping-check lists-check-ghost" aria-hidden="true" />
            <ItemEditor
              initialRich={item.rich}
              initialText={item.text}
              placeholder="Escribe aquí"
              canIndent={canIndent(group, idx)}
              canOutdent={canOutdent(group, idx)}
              onIndent={() => void setDepth(item, 1)}
              onOutdent={() => void setDepth(item, -1)}
              onCommit={(r) => void commitEdit(item, r, false)}
              onEnter={(r) => void commitEdit(item, r, true)}
              onCancel={() => setEditingId(null)}
            />
          </div>
        )
      }
      const idx = shown.findIndex((i) => i.id === item.id)
      void idx
      return (
        <ItemRow
          key={item.id}
          item={item}
          selectMode={selecting}
          selected={selected.has(item.id)}
          linkedToShopping={linked.has(item.id)}
          canReorder={canReorder}
          dragging={drag.dragId === item.id}
          dragOffsetY={drag.offsetY}
          dropMark={drag.over?.id === item.id && drag.dragId !== item.id ? (drag.over.after ? 'after' : 'before') : null}
          dragHandleProps={drag.handleProps(item.id)}
          onToggleDone={(i) => void toggleDone(i)}
          onToggleSelected={(i) =>
            setSelected((prev) => {
              const n = new Set(prev)
              if (n.has(i.id)) n.delete(i.id)
              else n.add(i.id)
              return n
            })
          }
          onEdit={(i) => {
            setDraft(null)
            setEditingId(i.id)
          }}
          onDelete={(i) => void deleteItem(i)}
        />
      )
    })
    // Elemento nuevo en edición
    if (draft && draft.columnId === key) {
      const prevItem = draft.afterId ? group.find((i) => i.id === draft.afterId) : group[group.length - 1]
      const editor = (
        <div key="draft" className={'price-row lists-item lists-item-editing' + (draft.depth === 1 ? ' lists-item-sub' : '')}>
          <span className="shopping-check lists-check-ghost" aria-hidden="true" />
          <ItemEditor
            initialRich={null}
            initialText=""
            placeholder="Nuevo elemento"
            canIndent={draft.depth === 0 && !!prevItem}
            canOutdent={draft.depth === 1}
            onIndent={() => setDraft({ ...draft, depth: 1 })}
            onOutdent={() => setDraft({ ...draft, depth: 0 })}
            onCommit={(r) => void commitDraft(draft, r, false)}
            onEnter={(r) => void commitDraft(draft, r, true)}
            onCancel={() => setDraft(null)}
          />
        </div>
      )
      const at = draft.afterId ? shown.findIndex((i) => i.id === draft.afterId) : shown.length - 1
      const end = at >= 0 ? blockRange(shown, at)[1] : shown.length
      rows.splice(Math.min(end, rows.length), 0, editor)
    }
    return rows
  }

  const addButton = (key: string | null) => (
    <button
      type="button"
      className="lists-add"
      onClick={() => {
        setEditingId(null)
        setDraft({ afterId: null, columnId: key, depth: 0 })
      }}
      data-help-id="listas.anadir-elemento"
    >
      ＋ Añadir elemento
    </button>
  )

  return (
    <div className="screen lists-screen">
      <SectionBreadcrumb subsection={[{ label: 'Inicio', to: '/listas' }, { label: list.title }]} />
      {error && <p className="error">{error}</p>}

      <div className="lists-head">
        {titleEditing ? (
          <input
            autoFocus
            className="lists-title-input"
            value={titleText}
            maxLength={120}
            aria-label="Título de la lista"
            onChange={(e) => setTitleText(e.target.value)}
            onBlur={() => void saveTitle()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              if (e.key === 'Escape') setTitleEditing(false)
            }}
          />
        ) : (
          <h2
            className={'lists-title' + (mine ? ' lists-title-editable' : '')}
            onClick={() => {
              if (!mine) return
              setTitleText(list.title)
              setTitleEditing(true)
            }}
            data-help-id="listas.titulo"
          >
            {list.title}
          </h2>
        )}
        <button type="button" className="member-row-more" aria-label="Más acciones de la lista" aria-expanded={menu} onClick={() => setMenu((v) => !v)} data-help-id="listas.menu">
          ⋯
        </button>
      </div>
      <p className="muted lists-subhead">
        {LIST_KIND_LABELS[list.kind]}
        {list.kind === 'tareas' && progress.total > 0 ? ` · ${progress.done}/${progress.total}` : ''}
        {' · '}
        {mine ? (
          <button type="button" className="lists-privacy-btn" onClick={() => setSheet('privacy')} data-help-id="listas.privacidad">
            {list.visibility === 'privada' ? '🔒' : '👪'} {LIST_VISIBILITY_LABELS[list.visibility]}
          </button>
        ) : (
          <span>👪 Compartida contigo</span>
        )}
        {linkedCount > 0 && (
          <>
            {' · '}
            <button type="button" className="lists-privacy-btn" onClick={() => setSheet('calendar')}>
              📅 {linkedCount}
            </button>
          </>
        )}
        {list.archivedAt ? ' · archivada' : ''}
        {list.sortMode === 'pendientes_arriba' ? ' · pendientes arriba' : ''}
      </p>

      {menu && (
        <div className="member-row-actions lists-menu">
          <button
            type="button"
            className="link-button"
            data-help-id="listas.importar"
            onClick={() => {
              setMenu(false)
              setSheet('import')
            }}
          >
            Importar (foto, PDF, voz o texto)…
          </button>
          <button type="button" className="link-button" data-help-id="listas.enviar-compra" onClick={startSelecting} disabled={items.length === 0}>
            Enviar a Lista de la compra
          </button>
          <button
            type="button"
            className="link-button"
            data-help-id="listas.vincular-calendario"
            onClick={() => {
              setMenu(false)
              setSheet('calendar')
            }}
          >
            Vincular con el Calendario…
          </button>
          {mine && (
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setMenu(false)
                void changeList({ sortMode: list.sortMode === 'manual' ? 'pendientes_arriba' : 'manual' })
              }}
            >
              {list.sortMode === 'manual' ? 'Pendientes arriba, hechos abajo' : 'Volver al orden manual'}
            </button>
          )}
          {mine && (
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setMenu(false)
                setSheet('privacy')
              }}
            >
              Privacidad…
            </button>
          )}
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setMenu(false)
              void (async () => {
                try {
                  const id = await duplicateExistingList(list.id)
                  showToast('Lista duplicada (queda privada)')
                  navigate(`/listas/${id}`)
                } catch {
                  setError('No se ha podido duplicar la lista.')
                }
              })()
            }}
          >
            Duplicar (queda privada)
          </button>
          {mine && (
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setMenu(false)
                void changeList({ archivedAt: list.archivedAt ? null : new Date().toISOString() })
              }}
            >
              {list.archivedAt ? 'Recuperar' : 'Archivar'}
            </button>
          )}
          {mine && (
            <ConfirmButton
              label="Eliminar lista"
              confirmMessage="Se borra la lista y todo lo que contiene."
              onConfirm={() => {
                void deleteList(list.id).then(
                  () => navigate('/listas'),
                  () => setError('No se ha podido eliminar la lista.'),
                )
              }}
            />
          )}
        </div>
      )}

      {selecting && (
        <div className="lists-selectbar" role="region" aria-label="Elegir qué enviar a la compra">
          <strong>Elige qué enviar a la compra</strong>
          <span className="lists-selectbar-actions">
            <button type="button" className="link-button" onClick={() => setSelected(selected.size === items.length ? new Set() : new Set(items.map((i) => i.id)))}>
              {selected.size === items.length ? 'Ninguno' : 'Todos'}
            </button>
            <button type="button" className="primary-button" disabled={selected.size === 0} onClick={() => void confirmSend()}>
              Enviar ({selected.size})
            </button>
            <button type="button" className="link-button" onClick={() => setSelecting(false)}>
              Cancelar
            </button>
          </span>
          <span className="muted">La lista original no cambia. Lo que se compre allí se marcará aquí como hecho.</span>
        </div>
      )}

      {isComparativa ? (
        <div className="lists-columns" style={{ gridTemplateColumns: `repeat(${Math.max(columns.length, 1)}, minmax(150px, 1fr))` }}>
          {columns.map((c) => (
            <div key={c.id} className={'lists-column' + (drag.over?.id === c.id ? ' lists-drop-into' : '')} data-drop-id={c.id} data-drop-kind="column">
              <div className="lists-column-head">
                <input className="lists-column-title" defaultValue={c.title} aria-label="Título de la columna" maxLength={60} placeholder="Columna" onBlur={(e) => void renameCol(c, e.target.value)} />
                {columns.length > 2 && (
                  <ConfirmButton label="✕" ariaLabel={`Quitar la columna ${c.title}`} confirmMessage="Sus elementos pasan a la primera columna." onConfirm={() => void removeCol(c)} />
                )}
              </div>
              {renderGroup(c.id)}
              {addButton(c.id)}
            </div>
          ))}
          {columns.length < 4 && (
            <button type="button" className="lists-add lists-add-column" onClick={() => void addCol()}>
              ＋ Columna
            </button>
          )}
        </div>
      ) : (
        <div className="lists-items">
          {items.length === 0 && !draft && <p className="muted lists-empty">Lista vacía. Toca «Añadir elemento» o impórtala desde una foto, un PDF o por voz.</p>}
          {renderGroup(null)}
          {addButton(null)}
        </div>
      )}

      {dupAsk && (
        <div className="modal-overlay" onClick={() => setDupAsk(null)}>
          <div className="modal-sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>Ya están en la compra</h3>
            <p>Parece que estos productos ya están pendientes en la Lista de la compra:</p>
            <ul>
              {dupAsk.dup.map((d) => (
                <li key={d.id}>{plainForShopping(d)}</li>
              ))}
            </ul>
            <div className="form-actions">
              {dupAsk.fresh.length > 0 && (
                <button type="button" className="primary-button" onClick={() => void doSend(dupAsk.fresh)}>
                  Enviar solo los nuevos ({dupAsk.fresh.length})
                </button>
              )}
              <button type="button" className="secondary-button" onClick={() => void doSend([...dupAsk.fresh, ...dupAsk.dup])}>
                Enviar todos igualmente
              </button>
              <button type="button" className="link-button" onClick={() => setDupAsk(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {sheet === 'privacy' && mine && <PrivacySheet current={list.visibility} onClose={() => setSheet(null)} onPick={(v) => void changeList({ visibility: v }).then(() => setSheet(null))} />}
      {sheet === 'import' && (
        <ImportFlow
          current={list}
          onClose={() => setSheet(null)}
          onFinished={(targetId) => {
            setSheet(null)
            if (targetId === list.id) void load()
            else navigate(`/listas/${targetId}`)
          }}
        />
      )}
      {sheet === 'calendar' && (
        <CalendarLinksSheet
          list={list}
          onClose={() => {
            setSheet(null)
            void eventsLinkedToList(list.id).then((e) => setLinkedCount(e.length), () => undefined)
          }}
        />
      )}
      <UndoBar state={undo} onClose={() => setUndo(null)} />
    </div>
  )
}

function PrivacySheet({ current, onPick, onClose }: { current: ListVisibility; onPick: (v: ListVisibility) => void; onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" role="dialog" aria-modal="true" aria-label="Privacidad de la lista" onClick={(e) => e.stopPropagation()}>
        <h3>¿Quién ve esta lista?</h3>
        <div className="lists-kind-options" role="radiogroup">
          <button type="button" role="radio" aria-checked={current === 'privada'} className={'lists-kind' + (current === 'privada' ? ' lists-kind-active' : '')} onClick={() => onPick('privada')}>
            <strong>🔒 Privada</strong>
            <span className="muted">Solo tú. Nadie más la ve, ni siquiera en carpetas o en el Calendario.</span>
          </button>
          <button type="button" role="radio" aria-checked={current === 'familiar'} className={'lists-kind' + (current === 'familiar' ? ' lists-kind-active' : '')} onClick={() => onPick('familiar')}>
            <strong>👪 Familiar</strong>
            <span className="muted">La ven y la editan los miembros de la familia con acceso a Mis listas. Solo tú puedes cambiar su título, privacidad o borrarla.</span>
          </button>
        </div>
        <p className="muted">Puedes cambiarlo cuando quieras; no se pierde nada.</p>
        <div className="form-actions">
          <button type="button" className="link-button" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
