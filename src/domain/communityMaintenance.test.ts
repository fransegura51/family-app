// community-maintenance: borrado de fotos de Comunidad del almacenamiento y barrido diario de fotos sueltas. Simulación completa (sin Supabase real).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MEDIA_BUCKET,
  PENDING_BATCH,
  SWEEP_MAX_CANDIDATES,
  SWEEP_MAX_FOLDERS,
  handleMaintenance,
  isSweepSlot,
  isValidPhotoPath,
  listSweepCandidates,
  parsePending,
  processDeletionQueue,
  runMaintenance,
  sweepFolderOffset,
  sweepOrphans,
} from '../../supabase/functions/community-maintenance/maintenance'
import { RpcFailure, SECRET, U1, U2, U3, cronRequest, fakeClient, secretRpc, type RpcHandler } from './communityServerFakes'
import type { StorageEntry } from '../../supabase/functions/_shared/communityServer'

const ID1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
const ID2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
const ID3 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'
const P1 = `${U1}/f1.jpg`
const P2 = `${U1}/f2.jpg`

const NOW = new Date('2026-10-15T03:05:00Z') // dentro del primer cuarto de hora de las 03:00 UTC
const old = (name: string, daysAgo = 5): StorageEntry => ({ name, id: `obj-${name}`, created_at: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString() })

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined))
afterEach(() => vi.restoreAllMocks())

describe('rutas de foto', () => {
  it('solo acepta «<uuid del perfil>/<archivo>» sin trucos', () => {
    expect(isValidPhotoPath(P1)).toBe(true)
    expect(isValidPhotoPath(`${U1}/${'a'.repeat(36)}.jpg`)).toBe(true)
    for (const bad of ['../x/y.jpg', `${U1}/../${U2}/a.jpg`, '/abs/a.jpg', 'sin-carpeta.jpg', `${U1}/a/b.jpg`, `${U1}/`, `no-uuid/a.jpg`, `${U1}/a b.jpg`, 5, null, `${U1}/${'a'.repeat(300)}.jpg`]) {
      expect(isValidPhotoPath(bad), String(bad)).toBe(false)
    }
  })
  it('separa filas válidas, inválidas y de otro bucket', () => {
    const out = parsePending([
      { id: ID1, bucket: MEDIA_BUCKET, path: P1 },
      { id: ID2, bucket: MEDIA_BUCKET, path: '../../etc/passwd' },
      { id: ID3, bucket: 'otro-bucket', path: P2 },
      { id: 'no-uuid', bucket: MEDIA_BUCKET, path: P2 },
    ])
    expect(out.valid).toEqual([{ id: ID1, path: P1 }])
    expect(out.invalid).toEqual([ID2])
    expect(out.otherBucket).toBe(1)
  })
})

describe('cola de borrado', () => {
  it('borra del almacenamiento las rutas que devuelve la base de datos y las marca hechas', async () => {
    const c = fakeClient({ rpc: { community_service_pending_media_deletions: () => [{ id: ID1, bucket: MEDIA_BUCKET, path: P1 }, { id: ID2, bucket: MEDIA_BUCKET, path: P2 }], community_service_mark_media_deleted: () => 2 } })
    const out = await processDeletionQueue(c)
    expect(out).toEqual({ deleted: 2, invalidSkipped: 0, failed: false })
    expect(c.removed).toEqual([[P1, P2]])
    expect(c.argsOf('community_service_pending_media_deletions')).toEqual([{ p_limit: PENDING_BATCH }])
    expect(c.argsOf('community_service_mark_media_deleted')).toEqual([{ p_ids: [ID1, ID2] }])
  })
  it('si el almacenamiento falla NO marca nada (se reintenta en la siguiente pasada)', async () => {
    const c = fakeClient({ removeFails: true, rpc: { community_service_pending_media_deletions: () => [{ id: ID1, bucket: MEDIA_BUCKET, path: P1 }] } })
    const out = await processDeletionQueue(c)
    expect(out).toMatchObject({ deleted: 0, failed: true })
    expect(c.count('community_service_mark_media_deleted')).toBe(0)
  })
  it('una ruta inválida no llega al almacenamiento pero sí se marca hecha (no bloquea la cola)', async () => {
    const c = fakeClient({ rpc: { community_service_pending_media_deletions: () => [{ id: ID1, bucket: MEDIA_BUCKET, path: '../x.jpg' }] } })
    const out = await processDeletionQueue(c)
    expect(c.removed).toEqual([])
    expect(out.invalidSkipped).toBe(1)
    expect(c.argsOf('community_service_mark_media_deleted')).toEqual([{ p_ids: [ID1] }])
  })
  it('cola vacía: no toca el almacenamiento ni marca nada', async () => {
    const c = fakeClient({ rpc: { community_service_pending_media_deletions: () => [] } })
    expect(await processDeletionQueue(c)).toEqual({ deleted: 0, invalidSkipped: 0, failed: false })
    expect(c.removed).toEqual([])
    expect(c.count('community_service_mark_media_deleted')).toBe(0)
  })
  it('error al pedir la cola: informa sin lanzar', async () => {
    const c = fakeClient({ rpc: { community_service_pending_media_deletions: () => new RpcFailure('x') } })
    expect((await processDeletionQueue(c)).failed).toBe(true)
  })
  it('no borra nada de otro bucket', async () => {
    const c = fakeClient({ rpc: { community_service_pending_media_deletions: () => [{ id: ID1, bucket: 'avatars', path: P1 }] } })
    await processDeletionQueue(c)
    expect(c.removed).toEqual([])
    expect(c.count('community_service_mark_media_deleted')).toBe(0)
  })
})

describe('barrido diario de fotos sueltas', () => {
  it('solo toca en la primera pasada de las 03:00 UTC (una vez al día con el cron cada 15 min)', () => {
    const slots = [0, 15, 30, 45].map((m) => isSweepSlot(new Date(Date.UTC(2026, 9, 15, 3, m))))
    expect(slots).toEqual([true, false, false, false])
    expect(isSweepSlot(new Date('2026-10-15T04:00:00Z'))).toBe(false)
    expect(isSweepSlot(new Date('2026-10-15T14:00:00Z'))).toBe(false)
  })
  it('una pasada normal (fuera de hora) no lista el almacenamiento', async () => {
    const c = fakeClient({ rpc: { community_service_pending_media_deletions: () => [] } })
    const report = await runMaintenance({ admin: c, now: () => new Date('2026-10-15T09:15:00Z') })
    expect(report.sweep).toBeUndefined()
    expect(c.listCalls).toHaveLength(0)
  })
  it('lista solo fotos de MÁS de 2 días, pregunta a la base de datos y encola solo las sueltas', async () => {
    const c = fakeClient({
      storage: { [U1]: [old('vieja-usada.jpg'), old('vieja-suelta.jpg'), old('reciente.jpg', 1), old('.emptyFolderPlaceholder')] },
      rpc: { community_service_orphan_check: (a) => (a.p_paths as string[]).filter((p) => p.endsWith('vieja-suelta.jpg')) },
    })
    const out = await sweepOrphans(c, NOW)
    expect(out).toEqual({ scanned: 2, orphansQueued: 1 })
    expect(c.argsOf('community_service_orphan_check')).toEqual([{ p_paths: [`${U1}/vieja-usada.jpg`, `${U1}/vieja-suelta.jpg`] }])
    expect(c.inserted).toEqual([{ table: 'community_media_deletions', rows: [{ bucket: MEDIA_BUCKET, path: `${U1}/vieja-suelta.jpg` }] }])
  })
  it('lo que devuelve la base de datos solo se encola si estaba en la lista consultada', async () => {
    const c = fakeClient({ storage: { [U1]: [old('a.jpg')] }, rpc: { community_service_orphan_check: () => [`${U1}/a.jpg`, `${U2}/de-otro.jpg`, 7] } })
    await sweepOrphans(c, NOW)
    expect(c.inserted[0].rows).toEqual([{ bucket: MEDIA_BUCKET, path: `${U1}/a.jpg` }])
  })
  it('ignora archivos con nombre raro, archivos sueltos en la raíz y carpetas que no son un perfil', async () => {
    const c = fakeClient({ storage: { [U1]: [old('con espacio.jpg'), old('ok.jpg')], 'no-es-perfil': [old('x.jpg')] } })
    const candidates = await listSweepCandidates(c, NOW)
    expect(candidates).toEqual([`${U1}/ok.jpg`])
  })
  it('con volumen limitado: como mucho SWEEP_MAX_CANDIDATES fotos por barrido', async () => {
    const many = Array.from({ length: 150 }, (_, i) => old(`f${i}.jpg`))
    const storage: Record<string, StorageEntry[]> = {}
    for (const u of [U1, U2, U3, '44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666']) storage[u] = many
    const c = fakeClient({ storage })
    const candidates = await listSweepCandidates(c, NOW)
    expect(candidates.length).toBeLessThanOrEqual(SWEEP_MAX_CANDIDATES)
    expect(candidates.length).toBe(SWEEP_MAX_CANDIDATES)
    expect(c.listCalls.length).toBeLessThan(40)
  })
  it('las carpetas se piden con un tope por barrido y el recorrido avanza cada día', async () => {
    const c = fakeClient({ storage: { [U1]: [old('a.jpg')] } })
    await listSweepCandidates(c, NOW)
    expect((c.listCalls[0].options as { limit: number }).limit).toBe(SWEEP_MAX_FOLDERS)
    const d1 = sweepFolderOffset(new Date('2026-10-15T03:00:00Z'))
    const d2 = sweepFolderOffset(new Date('2026-10-16T03:00:00Z'))
    expect((d2 - d1 + 6000) % 6000).toBe(SWEEP_MAX_FOLDERS)
  })
  it('si hoy el recorrido empieza más allá de la última carpeta, vuelve a empezar desde el principio', async () => {
    const c = fakeClient({ storage: { [U1]: [old('a.jpg')] } })
    // Un día en el que el desplazamiento no es 0 y no hay carpetas tan lejos.
    const day = new Date('2026-10-17T03:00:00Z')
    expect(sweepFolderOffset(day)).toBeGreaterThan(0)
    expect(await listSweepCandidates(c, day)).toEqual([`${U1}/a.jpg`])
  })
  it('un fallo del barrido no estropea la cola ya procesada', async () => {
    const c = fakeClient({ rpc: { community_service_pending_media_deletions: () => [{ id: ID1, bucket: MEDIA_BUCKET, path: P1 }], community_service_orphan_check: () => new RpcFailure('x') }, storage: { [U1]: [old('a.jpg')] } })
    const report = await runMaintenance({ admin: c, now: () => NOW })
    expect(report.deleted).toBe(1)
    expect(report.sweep).toEqual({ ran: true, scanned: 1, orphansQueued: 0 })
  })
  it('si falla el insert de la cola, no cuenta lo encolado', async () => {
    const c = fakeClient({ insertFails: true, storage: { [U1]: [old('a.jpg')] }, rpc: { community_service_orphan_check: (a) => a.p_paths } })
    expect((await sweepOrphans(c, NOW)).orphansQueued).toBe(0)
  })
})

describe('autenticación por cabecera', () => {
  const handlers: Record<string, RpcHandler> = { ...secretRpc, community_service_pending_media_deletions: () => [] }
  it('sin cabecera o con otra distinta: 401 y no se toca nada', async () => {
    const c = fakeClient({ rpc: handlers })
    expect((await handleMaintenance(cronRequest(null), { admin: c })).status).toBe(401)
    expect((await handleMaintenance(cronRequest('no'), { admin: c })).status).toBe(401)
    expect(c.count('community_service_pending_media_deletions')).toBe(0)
    expect(c.removed).toEqual([])
  })
  it('con el secreto: 200 con el informe; {sweep:true} fuerza el barrido', async () => {
    const c = fakeClient({ rpc: handlers, storage: { [U1]: [old('a.jpg', 5)] } })
    const normal = await handleMaintenance(cronRequest(SECRET), { admin: c, now: () => new Date('2026-10-15T09:00:00Z') })
    expect(normal.status).toBe(200)
    expect(await normal.json()).toMatchObject({ ok: true, deleted: 0 })
    const forced = await handleMaintenance(cronRequest(SECRET, { sweep: true }), { admin: c, now: () => new Date('2026-10-15T09:00:00Z') })
    expect(((await forced.json()) as { sweep: { ran: boolean } }).sweep.ran).toBe(true)
  })
})
