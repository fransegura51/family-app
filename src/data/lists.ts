import { supabase } from '@/data/supabaseClient'
import {
  duplicateList,
  type ListColumn,
  type ListFolder,
  type ListItem,
  type ListKind,
  type ListSortMode,
  type ListVisibility,
  type UserList,
} from '@/domain/lists'

// Mis listas (migración 0321). La privacidad la hace cumplir el servidor (RLS): aquí solo se pide y se pinta lo que llega.

async function currentFamilyId(): Promise<string> {
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  const { data, error } = await supabase.from('profiles').select('family_id').eq('id', userResult.user.id).single()
  if (error) throw error
  return data.family_id
}

const LIST_COLS = 'id, family_id, created_by, title, kind, visibility, folder_id, sort_order, sort_mode, archived_at, created_at, updated_at'
const ITEM_COLS = 'id, list_id, family_id, depth, text, rich, done, done_at, sort_order, column_id, created_at, updated_at'

/* eslint-disable @typescript-eslint/no-explicit-any */
const toList = (r: any): UserList => ({
  id: r.id,
  familyId: r.family_id,
  createdBy: r.created_by,
  title: r.title,
  kind: r.kind as ListKind,
  visibility: r.visibility as ListVisibility,
  folderId: r.folder_id,
  sortOrder: Number(r.sort_order),
  sortMode: r.sort_mode as ListSortMode,
  archivedAt: r.archived_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})
const toFolder = (r: any): ListFolder => ({ id: r.id, familyId: r.family_id, createdBy: r.created_by, name: r.name, sortOrder: Number(r.sort_order), createdAt: r.created_at })
const toColumn = (r: any): ListColumn => ({ id: r.id, listId: r.list_id, title: r.title, sortOrder: r.sort_order })
export const toListItem = (r: any): ListItem => ({
  id: r.id,
  listId: r.list_id,
  familyId: r.family_id,
  depth: r.depth === 1 ? 1 : 0,
  text: r.text,
  rich: r.rich,
  done: r.done,
  doneAt: r.done_at,
  sortOrder: Number(r.sort_order),
  columnId: r.column_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface ListsOverview {
  userId: string
  folders: ListFolder[]
  lists: UserList[]
  /** Todos los elementos (solo lo mínimo) para buscar por contenido y enseñar el avance. */
  items: { listId: string; text: string; done: boolean; depth: number }[]
}

export async function loadListsOverview(): Promise<ListsOverview> {
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  const [folders, lists, items] = await Promise.all([
    supabase.from('list_folders').select('id, family_id, created_by, name, sort_order, created_at').order('sort_order'),
    supabase.from('user_lists').select(LIST_COLS).order('sort_order'),
    supabase.from('list_items').select('list_id, text, done, depth').limit(20000),
  ])
  if (folders.error) throw folders.error
  if (lists.error) throw lists.error
  if (items.error) throw items.error
  return {
    userId: userResult.user.id,
    folders: folders.data.map(toFolder),
    lists: lists.data.map(toList),
    items: items.data.map((r) => ({ listId: r.list_id, text: r.text, done: r.done, depth: r.depth })),
  }
}

export interface ListDetail {
  userId: string
  list: UserList
  columns: ListColumn[]
  items: ListItem[]
  /** Elementos con vínculo activo a un producto de Compras. */
  shoppingLinked: string[]
}

export async function loadListDetail(id: string): Promise<ListDetail | null> {
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  const { data: listRow, error } = await supabase.from('user_lists').select(LIST_COLS).eq('id', id).maybeSingle()
  if (error) throw error
  if (!listRow) return null
  const [cols, items, links] = await Promise.all([
    supabase.from('list_columns').select('id, list_id, title, sort_order').eq('list_id', id).order('sort_order'),
    supabase.from('list_items').select(ITEM_COLS).eq('list_id', id).order('sort_order'),
    supabase.from('list_shopping_links').select('list_item_id'),
  ])
  if (cols.error) throw cols.error
  if (items.error) throw items.error
  const mapped = items.data.map(toListItem)
  const ids = new Set(mapped.map((i) => i.id))
  return {
    userId: userResult.user.id,
    list: toList(listRow),
    columns: cols.data.map(toColumn),
    items: mapped,
    shoppingLinked: links.error ? [] : links.data.map((r) => r.list_item_id).filter((x) => ids.has(x)),
  }
}

// ------------------------------------------------------------------------------------------------------------- listas
export async function createList(input: { title: string; kind: ListKind; folderId?: string | null; visibility?: ListVisibility }): Promise<UserList> {
  const familyId = await currentFamilyId()
  const { data, error } = await supabase
    .from('user_lists')
    .insert({ family_id: familyId, title: input.title.trim(), kind: input.kind, folder_id: input.folderId ?? null, visibility: input.visibility ?? 'privada' })
    .select(LIST_COLS)
    .single()
  if (error) throw error
  return toList(data)
}

export interface ListPatch {
  title?: string
  kind?: ListKind
  visibility?: ListVisibility
  folderId?: string | null
  sortMode?: ListSortMode
  archivedAt?: string | null
}
export async function updateList(id: string, patch: ListPatch): Promise<void> {
  const row: Record<string, unknown> = {}
  if (patch.title !== undefined) row.title = patch.title.trim()
  if (patch.kind !== undefined) row.kind = patch.kind
  if (patch.visibility !== undefined) row.visibility = patch.visibility
  if (patch.folderId !== undefined) row.folder_id = patch.folderId
  if (patch.sortMode !== undefined) row.sort_mode = patch.sortMode
  if (patch.archivedAt !== undefined) row.archived_at = patch.archivedAt
  const { error } = await supabase.from('user_lists').update(row).eq('id', id)
  if (error) throw error
}

export async function deleteList(id: string): Promise<void> {
  const { error } = await supabase.from('user_lists').delete().eq('id', id)
  if (error) throw error
}

// Orden de las listas: se mandan ya en el orden final y se repartirían valores nuevos (updates sueltos, no upsert: ver shopping.ts).
export async function reorderLists(orderedIds: string[]): Promise<void> {
  const base = Date.now()
  const results = await Promise.all(orderedIds.map((id, i) => supabase.from('user_lists').update({ sort_order: base + i }).eq('id', id)))
  const failed = results.find((r) => r.error)
  if (failed?.error) throw failed.error
}

// Duplicar: copia contenido y formato con ids nuevos; PRIVADA, sin carpeta, todo pendiente y sin vínculos. Si algo falla a medias,
// se borra la lista a medio crear para no dejar copias incompletas.
export async function duplicateExistingList(listId: string): Promise<string> {
  const detail = await loadListDetail(listId)
  if (!detail) throw new Error('La lista ya no existe.')
  const copy = duplicateList(detail.list, detail.columns, detail.items)
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('user_lists').insert({
    id: copy.list.id,
    family_id: familyId,
    title: copy.list.title,
    kind: copy.list.kind,
    visibility: 'privada',
    folder_id: null,
    sort_mode: copy.list.sortMode,
  })
  if (error) throw error
  try {
    if (copy.columns.length) {
      const { error: e } = await supabase.from('list_columns').insert(copy.columns.map((c) => ({ id: c.id, list_id: copy.list.id, title: c.title, sort_order: c.sortOrder })))
      if (e) throw e
    }
    if (copy.items.length) {
      const base = Date.now()
      const { error: e } = await supabase.from('list_items').insert(
        copy.items.map((i, n) => ({ id: i.id, list_id: copy.list.id, family_id: familyId, depth: i.depth, text: i.text, rich: i.rich, done: false, sort_order: base + n, column_id: i.columnId })),
      )
      if (e) throw e
    }
  } catch (e) {
    await supabase.from('user_lists').delete().eq('id', copy.list.id)
    throw e
  }
  return copy.list.id
}

// ------------------------------------------------------------------------------------------------------------- carpetas
export async function createFolder(name: string): Promise<ListFolder> {
  const familyId = await currentFamilyId()
  const { data, error } = await supabase.from('list_folders').insert({ family_id: familyId, name: name.trim() }).select('id, family_id, created_by, name, sort_order, created_at').single()
  if (error) throw error
  return toFolder(data)
}
export async function renameFolder(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('list_folders').update({ name: name.trim() }).eq('id', id)
  if (error) throw error
}
// Borrar una carpeta NUNCA borra sus listas: pasan a «sin carpeta» (on delete set null).
export async function deleteFolder(id: string): Promise<void> {
  const { error } = await supabase.from('list_folders').delete().eq('id', id)
  if (error) throw error
}
export async function reorderFolders(orderedIds: string[]): Promise<void> {
  const base = Date.now()
  const results = await Promise.all(orderedIds.map((id, i) => supabase.from('list_folders').update({ sort_order: base + i }).eq('id', id)))
  const failed = results.find((r) => r.error)
  if (failed?.error) throw failed.error
}

// ------------------------------------------------------------------------------------------------------------- elementos
export interface NewListItem {
  /** Si se da, se usa ese id (deshacer un borrado recupera el MISMO elemento). */
  id?: string
  text: string
  rich?: string | null
  depth?: 0 | 1
  done?: boolean
  columnId?: string | null
  sortOrder?: number
}

export async function addListItems(listId: string, items: NewListItem[]): Promise<ListItem[]> {
  if (items.length === 0) return []
  const familyId = await currentFamilyId()
  const base = Date.now()
  const rows = items.map((i, n) => ({
    ...(i.id ? { id: i.id } : {}),
    list_id: listId,
    family_id: familyId,
    depth: i.depth ?? 0,
    text: i.text,
    rich: i.rich ?? null,
    done: i.done ?? false,
    column_id: i.columnId ?? null,
    sort_order: i.sortOrder ?? base + n * 1000,
  }))
  const { data, error } = await supabase.from('list_items').insert(rows).select(ITEM_COLS)
  if (error) throw error
  return data.map(toListItem)
}

export async function updateListItem(id: string, patch: { text?: string; rich?: string | null; done?: boolean; depth?: 0 | 1; columnId?: string | null }): Promise<void> {
  const row: Record<string, unknown> = {}
  if (patch.text !== undefined) row.text = patch.text
  if (patch.rich !== undefined) row.rich = patch.rich
  if (patch.done !== undefined) row.done = patch.done
  if (patch.depth !== undefined) row.depth = patch.depth
  if (patch.columnId !== undefined) row.column_id = patch.columnId
  const { error } = await supabase.from('list_items').update(row).eq('id', id)
  if (error) throw error
}

export async function deleteListItems(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase.from('list_items').delete().in('id', ids)
  if (error) throw error
}

// Guarda orden, sangría y columna de los elementos indicados (updates sueltos, no upsert: ver shopping.ts).
export interface ItemPlacement {
  id: string
  sortOrder: number
  depth: 0 | 1
  columnId: string | null
}
export async function saveItemPlacements(items: ItemPlacement[]): Promise<void> {
  const results = await Promise.all(items.map((it) => supabase.from('list_items').update({ sort_order: it.sortOrder, depth: it.depth, column_id: it.columnId }).eq('id', it.id)))
  const failed = results.find((r) => r.error)
  if (failed?.error) throw failed.error
}

export async function replaceListItems(listId: string, items: { text: string; rich?: string | null; depth?: 0 | 1 }[]): Promise<number> {
  const { data, error } = await supabase.rpc('replace_list_items', { p_list: listId, p_items: items.map((i) => ({ text: i.text, rich: i.rich ?? '', depth: i.depth ?? 0 })) })
  if (error) throw error
  return Number(data)
}

// ------------------------------------------------------------------------------------------------------------- columnas (comparativa)
export async function addColumn(listId: string, title: string, sortOrder: number): Promise<ListColumn> {
  const { data, error } = await supabase.from('list_columns').insert({ list_id: listId, title, sort_order: sortOrder }).select('id, list_id, title, sort_order').single()
  if (error) throw error
  return toColumn(data)
}
export async function renameColumn(id: string, title: string): Promise<void> {
  const { error } = await supabase.from('list_columns').update({ title }).eq('id', id)
  if (error) throw error
}
export async function deleteColumn(id: string): Promise<void> {
  const { error } = await supabase.from('list_columns').delete().eq('id', id)
  if (error) throw error
}

// ------------------------------------------------------------------------------------------------------------- Compras
// Crea un producto por elemento (texto limpio) con su vínculo estable. Devuelve cuántos se enviaron.
export async function sendItemsToShopping(items: { itemId: string; name: string }[]): Promise<number> {
  const { data, error } = await supabase.rpc('enviar_a_compras', { p_items: items.map((i) => ({ item_id: i.itemId, name: i.name })) })
  if (error) throw error
  return Number(data)
}
// Nombres de los productos que ya están pendientes en Compras (para avisar de duplicados evidentes antes de enviar).
export async function pendingShoppingNames(): Promise<string[]> {
  const { data, error } = await supabase.from('shopping_items').select('name').eq('status', 'pendiente').limit(5000)
  if (error) throw error
  return data.map((r) => r.name)
}

// ------------------------------------------------------------------------------------------------------------- Calendario
export interface LinkedList {
  id: string
  title: string
}
// Listas vinculadas a un evento o tarea (solo las que esta persona puede ver: la RLS oculta el resto).
export async function listsLinkedToEvent(eventId: string): Promise<LinkedList[]> {
  const { data, error } = await supabase.from('list_calendar_links').select('list_id, user_lists(id, title)').eq('event_id', eventId)
  if (error) throw error
  return (data as unknown as { user_lists: { id: string; title: string } | null }[]).flatMap((r) => (r.user_lists ? [{ id: r.user_lists.id, title: r.user_lists.title }] : []))
}
export async function eventsLinkedToList(listId: string): Promise<string[]> {
  const { data, error } = await supabase.from('list_calendar_links').select('event_id').eq('list_id', listId)
  if (error) throw error
  return data.map((r) => r.event_id)
}
export async function linkListToEvent(listId: string, eventId: string): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('list_calendar_links').upsert({ list_id: listId, event_id: eventId, family_id: familyId }, { onConflict: 'list_id,event_id', ignoreDuplicates: true })
  if (error) throw error
}
export async function unlinkListFromEvent(listId: string, eventId: string): Promise<void> {
  const { error } = await supabase.from('list_calendar_links').delete().eq('list_id', listId).eq('event_id', eventId)
  if (error) throw error
}

// Productos de Compras que vienen de Mis listas (para el indicador discreto de la Lista de la compra). La RLS solo devuelve los de listas
// a las que esta persona tiene acceso; si falla, Compras sigue igual (quien llama lo trata como «ninguno»).
export async function linkedShoppingIds(): Promise<string[]> {
  const { data, error } = await supabase.from('list_shopping_links').select('shopping_item_id').limit(5000)
  if (error) throw error
  return data.map((r) => r.shopping_item_id)
}
