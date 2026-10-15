import { type ServiceClient, type StorageEntry, UUID_RE, asRows, authorizeCron, jsonResponse } from '../_shared/communityServer.ts'

// Mantenimiento de las fotos de Comunidad (la llama el cron cada 15 minutos con la cabecera x-cron-secret):
//   1. Borra del almacenamiento (bucket «community-media») las fotos de la cola community_media_deletions que YA no usa nada (la base de datos solo devuelve
//      esas) y las marca como hechas. Borrar filas de storage.objects por SQL dejaría el archivo en el almacenamiento: por eso se hace aquí, con la API.
//   2. Una vez al día: busca fotos SUELTAS (subidas hace más de 2 días que no usa ninguna publicación, comentario, receta ni borrador) y las encola;
//      se borrarán en la siguiente pasada. Con volumen limitado por ejecución (carpetas, objetos y páginas), para no agotar la función ni el coste.
// No usa IA.

export const MEDIA_BUCKET = 'community-media'
export const PENDING_BATCH = 100
// Las fotos sueltas solo se buscan entre las de más de 2 días (da margen a quien aún está escribiendo una publicación).
export const ORPHAN_MIN_AGE_MS = 2 * 24 * 3600 * 1000
export const SWEEP_MAX_FOLDERS = 60 // carpetas (una por perfil público) que se revisan por barrido
export const SWEEP_PAGE_SIZE = 100
export const SWEEP_MAX_PAGES_PER_FOLDER = 3
export const SWEEP_MAX_CANDIDATES = 500 // fotos que se consultan a la base de datos por barrido
const ORPHAN_CHECK_CHUNK = 100
// El barrido diario ocurre en la primera pasada de las 03:00 UTC (las 04:00-05:00 en Madrid: poca actividad). Como el cron va cada 15 minutos,
// «hora 3 y minuto menor que 15» ocurre una sola vez al día.
export const SWEEP_UTC_HOUR = 3
export const SWEEP_CYCLE_FOLDERS = 6000 // vuelta completa del recorrido por carpetas (100 días de 60 carpetas)

// Las fotos de Comunidad viven en «<id del perfil público>/<uuid>.jpg». Solo se acepta esa forma: nada de «..», rutas absolutas ni otras carpetas.
const PHOTO_PATH_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9._-]{1,120}$/i

export function isValidPhotoPath(path: unknown): path is string {
  return typeof path === 'string' && path.length <= 200 && !path.includes('..') && PHOTO_PATH_RE.test(path)
}

export interface PendingDeletion {
  id: string
  path: string
}

export function parsePending(data: unknown): { valid: PendingDeletion[]; invalid: string[]; otherBucket: number } {
  const valid: PendingDeletion[] = []
  const invalid: string[] = []
  let otherBucket = 0
  for (const r of asRows(data)) {
    if (typeof r.id !== 'string' || !UUID_RE.test(r.id)) continue
    // Solo se toca este bucket: una fila de otro bucket no se borra desde aquí (ni se marca como hecha).
    if (r.bucket !== MEDIA_BUCKET) {
      otherBucket++
      continue
    }
    if (isValidPhotoPath(r.path)) valid.push({ id: r.id, path: r.path })
    // Una ruta con forma inválida no puede ser una foto de Comunidad: se marca como hecha para no bloquear la cola, pero NO se manda al almacenamiento.
    else invalid.push(r.id)
  }
  return { valid, invalid, otherBucket }
}

export interface MaintenanceDeps {
  admin: ServiceClient
  now?: () => Date
}

export interface MaintenanceReport {
  deleted: number
  invalidSkipped: number
  deletionFailed: boolean
  sweep?: { ran: boolean; scanned: number; orphansQueued: number }
}

// 1) Cola de borrado.
export async function processDeletionQueue(admin: ServiceClient): Promise<{ deleted: number; invalidSkipped: number; failed: boolean }> {
  const pending = await admin.rpc('community_service_pending_media_deletions', { p_limit: PENDING_BATCH })
  if (pending.error) return { deleted: 0, invalidSkipped: 0, failed: true }
  const { valid, invalid, otherBucket } = parsePending(pending.data)
  if (otherBucket > 0) console.error('[community-maintenance] filas de la cola de otro bucket (no se tocan):', otherBucket)

  let failed = false
  const doneIds: string[] = [...invalid]
  if (valid.length > 0) {
    const removed = await admin.storage.from(MEDIA_BUCKET).remove(valid.map((v) => v.path))
    if (removed.error) {
      // No se marca nada: se reintenta en la siguiente pasada (borrar un archivo que ya no existe no es un error).
      failed = true
      console.error('[community-maintenance] no se pudieron borrar fotos del almacenamiento')
    } else {
      doneIds.push(...valid.map((v) => v.id))
    }
  }
  if (doneIds.length > 0) {
    const marked = await admin.rpc('community_service_mark_media_deleted', { p_ids: doneIds })
    if (marked.error) failed = true
  }
  return { deleted: failed ? 0 : valid.length, invalidSkipped: invalid.length, failed }
}

// ¿Toca el barrido diario en esta pasada? (primera de las 03:00 UTC) o forzado desde el cuerpo de la petición.
export function isSweepSlot(now: Date): boolean {
  return now.getUTCHours() === SWEEP_UTC_HOUR && now.getUTCMinutes() < 15
}

// Desde qué carpeta empieza el barrido de hoy: avanza SWEEP_MAX_FOLDERS cada día y da la vuelta, así con muchas carpetas se cubren todas en unos días.
export function sweepFolderOffset(now: Date): number {
  const dayIndex = Math.floor(now.getTime() / 86_400_000)
  return (dayIndex * SWEEP_MAX_FOLDERS) % SWEEP_CYCLE_FOLDERS
}

function isOldEnough(entry: StorageEntry, now: Date): boolean {
  const created = Date.parse(entry.created_at ?? entry.updated_at ?? '')
  return Number.isFinite(created) && now.getTime() - created >= ORPHAN_MIN_AGE_MS
}

// Lista candidatos (fotos de más de 2 días) del almacenamiento, con volumen limitado.
export async function listSweepCandidates(admin: ServiceClient, now: Date): Promise<string[]> {
  const bucket = admin.storage.from(MEDIA_BUCKET)
  let offset = sweepFolderOffset(now)
  let top = await bucket.list('', { limit: SWEEP_MAX_FOLDERS, offset, sortBy: { column: 'name', order: 'asc' } })
  // Pasado el final de la lista (hay menos carpetas que el desplazamiento de hoy): se empieza otra vez desde el principio.
  if (!top.error && (top.data ?? []).length === 0 && offset > 0) {
    offset = 0
    top = await bucket.list('', { limit: SWEEP_MAX_FOLDERS, offset, sortBy: { column: 'name', order: 'asc' } })
  }
  if (top.error) return []

  const out: string[] = []
  for (const folder of top.data ?? []) {
    if (out.length >= SWEEP_MAX_CANDIDATES) break
    // Las carpetas llegan sin id. Un archivo suelto en la raíz no tiene la forma de una foto de Comunidad: se ignora.
    if (folder.id || !UUID_RE.test(folder.name)) continue
    for (let page = 0; page < SWEEP_MAX_PAGES_PER_FOLDER && out.length < SWEEP_MAX_CANDIDATES; page++) {
      // Las más antiguas primero: son las que pueden estar sueltas.
      const files = await bucket.list(folder.name, { limit: SWEEP_PAGE_SIZE, offset: page * SWEEP_PAGE_SIZE, sortBy: { column: 'created_at', order: 'asc' } })
      if (files.error) break
      const entries = files.data ?? []
      for (const f of entries) {
        if (!f.id || f.name.startsWith('.')) continue // subcarpetas y marcadores vacíos
        const path = `${folder.name}/${f.name}`
        if (isOldEnough(f, now) && isValidPhotoPath(path)) out.push(path)
        if (out.length >= SWEEP_MAX_CANDIDATES) break
      }
      if (entries.length < SWEEP_PAGE_SIZE) break
    }
  }
  return out
}

// 2) Barrido de fotos sueltas: la base de datos decide cuáles no usa nada (community_service_orphan_check) y se encolan para borrarlas.
export async function sweepOrphans(admin: ServiceClient, now: Date): Promise<{ scanned: number; orphansQueued: number }> {
  const candidates = await listSweepCandidates(admin, now)
  let queued = 0
  for (let i = 0; i < candidates.length; i += ORPHAN_CHECK_CHUNK) {
    const chunk = candidates.slice(i, i + ORPHAN_CHECK_CHUNK)
    const checked = await admin.rpc('community_service_orphan_check', { p_paths: chunk })
    if (checked.error || !Array.isArray(checked.data)) continue
    // Solo se encola lo que la base de datos devuelve Y estaba en la lista que se le dio.
    const asked = new Set(chunk)
    const orphans = checked.data.filter((p): p is string => typeof p === 'string' && asked.has(p))
    if (orphans.length === 0) continue
    const inserted = await admin.from('community_media_deletions').insert(orphans.map((path) => ({ bucket: MEDIA_BUCKET, path })))
    if (!inserted.error) queued += orphans.length
  }
  return { scanned: candidates.length, orphansQueued: queued }
}

export async function runMaintenance(deps: MaintenanceDeps, opts: { forceSweep?: boolean } = {}): Promise<MaintenanceReport> {
  const now = (deps.now ?? (() => new Date()))()
  const queue = await processDeletionQueue(deps.admin)
  const report: MaintenanceReport = { deleted: queue.deleted, invalidSkipped: queue.invalidSkipped, deletionFailed: queue.failed }
  if (opts.forceSweep || isSweepSlot(now)) {
    try {
      report.sweep = { ran: true, ...(await sweepOrphans(deps.admin, now)) }
    } catch (err) {
      // El barrido es un extra: si falla, la cola ya se ha procesado y se vuelve a intentar mañana.
      console.error('[community-maintenance] barrido de fotos sueltas fallido:', String(err))
      report.sweep = { ran: false, scanned: 0, orphansQueued: 0 }
    }
  }
  return report
}

export async function handleMaintenance(req: Request, deps: MaintenanceDeps): Promise<Response> {
  const denied = await authorizeCron(req, deps.admin)
  if (denied) return denied
  try {
    let forceSweep = false
    try {
      const body = (await req.json()) as { sweep?: unknown } | null
      forceSweep = body?.sweep === true
    } catch {
      /* cuerpo vacío: lo normal en la llamada del cron */
    }
    return jsonResponse({ ok: true, ...(await runMaintenance(deps, { forceSweep })) })
  } catch (err) {
    console.error('[community-maintenance] error inesperado:', String(err))
    return jsonResponse({ ok: false, error: 'internal_error' }, 500)
  }
}
