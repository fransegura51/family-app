// Simulación para pruebas (no se importa desde la app): un servidor falso con las MISMAS reglas que la migración 0305 (revisión creciente por escritura,
// comparar y cambiar con la revisión de partida, filas por persona) y «dispositivos» con almacenamiento, reloj y red controlables.
import { createPrefsEngine, type PrefConflict, type PrefRow, type PrefsEngine, type PrefsStorage, type PrefsSyncProblem, type PrefsTransport, type PrefValue, type SetResult } from '@/state/prefs/prefsEngine'

export class FakeServer {
  private rev = 0
  private rows = new Map<string, Map<string, { value: PrefValue; rev: number }>>()
  private subs = new Set<{ userId: string; onRow: (row: PrefRow) => void; online: () => boolean }>()
  setCalls: Array<{ userId: string; key: string; value: PrefValue; baseRev: number }> = []

  private userRows(userId: string) {
    let m = this.rows.get(userId)
    if (!m) {
      m = new Map()
      this.rows.set(userId, m)
    }
    return m
  }

  get(userId: string, key: string) {
    return this.userRows(userId).get(key)
  }

  seed(userId: string, key: string, value: PrefValue): number {
    this.rev += 1
    this.userRows(userId).set(key, { value, rev: this.rev })
    return this.rev
  }

  set(userId: string, key: string, value: PrefValue, baseRev: number): SetResult {
    this.setCalls.push({ userId, key, value, baseRev })
    const cur = this.userRows(userId).get(key)
    if ((cur?.rev ?? 0) !== baseRev) return { applied: false, rev: cur?.rev ?? 0, value: cur?.value ?? null }
    this.rev += 1
    this.userRows(userId).set(key, { value, rev: this.rev })
    // Tiempo real: se reparte ANTES de contestar a quien escribió (el eco puede llegar antes que la respuesta).
    for (const s of this.subs) if (s.userId === userId && s.online()) s.onRow({ key, value, rev: this.rev })
    return { applied: true, rev: this.rev, value }
  }

  fetchSince(userId: string, afterRev: number): PrefRow[] {
    return [...this.userRows(userId).entries()]
      .filter(([, r]) => r.rev > afterRev)
      .map(([key, r]) => ({ key, value: r.value, rev: r.rev }))
      .sort((a, b) => a.rev - b.rev)
  }

  subscribe(userId: string, onRow: (row: PrefRow) => void, online: () => boolean) {
    const sub = { userId, onRow, online }
    this.subs.add(sub)
    return () => this.subs.delete(sub)
  }
}

export class FakeStorage implements PrefsStorage {
  data = new Map<string, string>()
  getItem(k: string) {
    return this.data.has(k) ? (this.data.get(k) as string) : null
  }
  setItem(k: string, v: string) {
    this.data.set(k, v)
  }
  removeItem(k: string) {
    this.data.delete(k)
  }
  keys() {
    return [...this.data.keys()]
  }
}

export class FakeClock {
  private t = 0
  private seq = 0
  private timers = new Map<number, { at: number; fn: () => void }>()
  setTimer = (fn: () => void, ms: number) => {
    this.seq += 1
    this.timers.set(this.seq, { at: this.t + ms, fn })
    return this.seq
  }
  clearTimer = (h: unknown) => {
    this.timers.delete(h as number)
  }
  now = () => this.t
  async advance(ms: number) {
    const end = this.t + ms
    for (;;) {
      const due = [...this.timers.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
      if (!due) break
      this.t = Math.max(this.t, due[1].at)
      this.timers.delete(due[0])
      due[1].fn()
      await settle()
    }
    this.t = end
    await settle()
  }
}

export async function settle() {
  for (let i = 0; i < 12; i++) await Promise.resolve()
}

export interface FakeDevice {
  engine: PrefsEngine
  storage: FakeStorage
  clock: FakeClock
  conflicts: PrefConflict[]
  problems: PrefsSyncProblem[]
  remoteChanges: string[][]
  errors: string[]
  online: boolean
  failNextSets: { count: number; error: unknown } | null
  restart(): Promise<void>
}

export function makeDevice(server: FakeServer, userId: string, storage: FakeStorage = new FakeStorage(), clock: FakeClock = new FakeClock()): FakeDevice {
  const dev = {
    storage,
    clock,
    conflicts: [] as PrefConflict[],
    problems: [] as PrefsSyncProblem[],
    remoteChanges: [] as string[][],
    errors: [] as string[],
    online: true,
    failNextSets: null as { count: number; error: unknown } | null,
  } as FakeDevice

  const offlineError = () => Object.assign(new Error('Failed to fetch'), { code: 'NETWORK' })
  const transport: PrefsTransport = {
    async fetchSince(afterRev) {
      if (!dev.online) throw offlineError()
      return server.fetchSince(userId, afterRev)
    },
    async set(key, value, baseRev) {
      if (!dev.online) throw offlineError()
      if (dev.failNextSets && dev.failNextSets.count > 0) {
        dev.failNextSets.count -= 1
        throw dev.failNextSets.error
      }
      return server.set(userId, key, value, baseRev)
    },
    subscribe(onRow, onStatus) {
      onStatus('up')
      return server.subscribe(userId, onRow, () => dev.online)
    },
  }

  const build = () =>
    createPrefsEngine({
      userId,
      storage,
      transport,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
      isOnline: () => dev.online,
      now: clock.now,
      onRemoteChange: (keys) => dev.remoteChanges.push(keys),
      onConflict: (c) => dev.conflicts.push(c),
      onProblem: (p) => dev.problems.push(p),
      reportError: (e, ctx) => dev.errors.push(`${ctx}:${e instanceof Error ? e.message : String(e)}`),
    })
  dev.engine = build()
  dev.restart = async () => {
    dev.engine.stop()
    dev.engine = build()
    await dev.engine.start()
    await settle()
  }
  return dev
}
