// Comunidad PEPA — autoguardado TEMPORAL del editor (solo protección ante accidentes: cerrar sin querer, perder la conexión, que el móvil recargue la página).
// Vive en `localStorage` de ESTE dispositivo, por persona. NO es un borrador: no sube nada al servidor, no cuesta peticiones y NO promete conservar nada
// (solo el guardado manual de «Guardar borrador» se conserva 30 días). Todo acceso va con try/catch: en modo privado o sin espacio, simplemente no hay autoguardado.
import { DRAFT_DAYS, POST_KINDS, SECTIONS } from '@/domain/community'
import { isFormBlank, isFormDirty, type PostForm } from '@/domain/communityPostForm'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

// Qué se está escribiendo: una publicación nueva sin borrador, un borrador guardado o la edición de una publicación ya publicada.
export type BufferScope = 'new' | `draft:${string}` | `edit:${string}`

export interface BufferEntry {
  // Momento (ms) del último autoguardado.
  savedAt: number
  form: PostForm
}

type BufferStore = Record<string, BufferEntry>

const KEY_PREFIX = 'pepa.community.draftBuffer.v1.'
export const MAX_BUFFER_ENTRIES = 8
const DAY_MS = 24 * 60 * 60 * 1000

export function bufferScope(input: { postId?: string | null; draftId?: string | null }): BufferScope {
  if (input.postId) return `edit:${input.postId}`
  if (input.draftId) return `draft:${input.draftId}`
  return 'new'
}

export function bufferKey(profileId: string): string {
  return KEY_PREFIX + profileId
}

// localStorage puede lanzar al ser LEÍDO (privado, bloqueado): se devuelve null y la pantalla funciona igual, sin autoguardado.
export function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function isPostForm(v: unknown): v is PostForm {
  if (typeof v !== 'object' || v === null) return false
  const f = v as Record<string, unknown>
  return (
    POST_KINDS.some((k) => k.id === f.kind) &&
    (f.section === null || SECTIONS.some((s) => s.id === f.section)) &&
    (f.topicId === null || typeof f.topicId === 'string') &&
    typeof f.title === 'string' &&
    typeof f.body === 'string' &&
    Array.isArray(f.photos) &&
    f.photos.every((p) => typeof p === 'string') &&
    (f.recipe === null || (typeof f.recipe === 'object' && Array.isArray((f.recipe as Record<string, unknown>).ingredients)))
  )
}

// Quita lo caducado (mismo plazo que los borradores), lo corrupto y lo que sobre (se queda lo más reciente).
export function pruneStore(store: BufferStore, now: number): BufferStore {
  const alive = Object.entries(store).filter(
    ([, e]) => e && typeof e.savedAt === 'number' && now - e.savedAt < DRAFT_DAYS * DAY_MS && isPostForm(e.form),
  )
  alive.sort((a, b) => b[1].savedAt - a[1].savedAt)
  return Object.fromEntries(alive.slice(0, MAX_BUFFER_ENTRIES))
}

function readStore(profileId: string, storage: StorageLike | null, now: number): BufferStore {
  if (!storage) return {}
  try {
    const raw = storage.getItem(bufferKey(profileId))
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    return pruneStore(parsed as BufferStore, now)
  } catch {
    return {}
  }
}

function writeStore(profileId: string, store: BufferStore, storage: StorageLike | null): boolean {
  if (!storage) return false
  try {
    if (Object.keys(store).length === 0) storage.removeItem(bufferKey(profileId))
    else storage.setItem(bufferKey(profileId), JSON.stringify(store))
    return true
  } catch {
    return false
  }
}

export function readBuffer(profileId: string, scope: BufferScope, storage: StorageLike | null = defaultStorage(), now = Date.now()): BufferEntry | null {
  return readStore(profileId, storage, now)[scope] ?? null
}

// Un formulario vacío no se autoguarda (y borra lo que hubiera: no hay nada que proteger). Devuelve si se pudo escribir.
export function writeBuffer(
  profileId: string,
  scope: BufferScope,
  form: PostForm,
  storage: StorageLike | null = defaultStorage(),
  now = Date.now(),
): boolean {
  if (isFormBlank(form)) return clearBuffer(profileId, scope, storage, now)
  const store = readStore(profileId, storage, now)
  store[scope] = { savedAt: now, form }
  return writeStore(profileId, pruneStore(store, now), storage)
}

export function clearBuffer(profileId: string, scope: BufferScope, storage: StorageLike | null = defaultStorage(), now = Date.now()): boolean {
  const store = readStore(profileId, storage, now)
  if (!(scope in store)) return true
  delete store[scope]
  return writeStore(profileId, store, storage)
}

// ¿Es más nuevo que el último guardado MANUAL? (sin guardado manual = cualquier autoguardado cuenta)
export function isBufferNewer(entry: BufferEntry, serverSavedAt: string | null): boolean {
  if (!serverSavedAt) return true
  const server = new Date(serverSavedAt).getTime()
  return Number.isNaN(server) || entry.savedAt > server
}

// Se ofrece «Recuperar lo que estabas escribiendo» solo si es más nuevo que lo guardado, trae algo y es DISTINTO de lo que ya se está viendo.
export function shouldOfferBuffer(entry: BufferEntry | null, baseline: PostForm, serverSavedAt: string | null): boolean {
  if (!entry) return false
  if (isFormBlank(entry.form)) return false
  if (!isBufferNewer(entry, serverSavedAt)) return false
  return isFormDirty(entry.form, baseline)
}
