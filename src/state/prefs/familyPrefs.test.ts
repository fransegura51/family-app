// Preferencias de la FAMILIA (migración 0343): el modo y el orden del Comparador se comparten entre los miembros de la familia con el MISMO motor que las preferencias
// personales (revisiones, comparar y cambiar, conflictos). Servidor falso en memoria que imita `user_prefs`, `family_prefs`, `set_user_pref` y `set_family_pref`.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = { key: string; value: unknown; rev: number }
const server = vi.hoisted(() => ({
  seq: 0,
  profiles: {} as Record<string, string | null>,
  user: new Map<string, Row>(), // `${userId}|${key}`
  family: new Map<string, Row>(), // `${familyId}|${key}`
  me: 'a',
  channels: [] as { name: string; filter?: string; table?: string }[],
  removed: [] as string[],
}))

vi.mock('@/data/supabaseClient', () => {
  const familyOf = (u: string) => server.profiles[u] ?? null
  const rows = (map: Map<string, Row>, prefix: string) => [...map.entries()].filter(([k]) => k.startsWith(prefix + '|')).map(([, r]) => r)
  const query = (table: string) => {
    let after = 0
    const api = {
      select: () => api,
      gt: (_c: string, v: number) => {
        after = v
        return api
      },
      order: () => api,
      limit: () =>
        Promise.resolve({
          data:
            table === 'user_prefs'
              ? rows(server.user, server.me).filter((r) => r.rev > after).sort((x, y) => x.rev - y.rev)
              : table === 'family_prefs' && familyOf(server.me)
                ? rows(server.family, familyOf(server.me) as string).filter((r) => r.rev > after).sort((x, y) => x.rev - y.rev)
                : [],
          error: null,
        }),
      eq: () => api,
      maybeSingle: () => Promise.resolve({ data: { family_id: familyOf(server.me) }, error: null }),
    }
    return api
  }
  const casSet = (map: Map<string, Row>, owner: string, key: string, value: unknown, base: number) => {
    const k = `${owner}|${key}`
    const cur = map.get(k)
    if (base === 0 ? !cur : cur && cur.rev === base) {
      const row = { key, value, rev: ++server.seq }
      map.set(k, row)
      return { applied: true, rev: row.rev, value }
    }
    return { applied: false, rev: cur?.rev ?? 0, value: cur?.value ?? null }
  }
  return {
    supabase: {
      from: (t: string) => query(t),
      rpc: (name: string, a: { p_key: string; p_value: unknown; p_base_rev: number }) => {
        if (name === 'set_family_pref') {
          const fam = familyOf(server.me)
          if (!fam) return Promise.resolve({ data: null, error: { code: '42501', message: 'NOT_AUTHORIZED' } })
          if (!/^familyapp:compras-compare-(mode|sort)$/.test(a.p_key)) return Promise.resolve({ data: null, error: { code: '22023', message: 'INVALID_KEY' } })
          return Promise.resolve({ data: [casSet(server.family, fam, a.p_key, a.p_value, a.p_base_rev)], error: null })
        }
        if (/compare/.test(a.p_key)) return Promise.resolve({ data: null, error: { code: '22023', message: 'INVALID_KEY' } })
        return Promise.resolve({ data: [casSet(server.user, server.me, a.p_key, a.p_value, a.p_base_rev)], error: null })
      },
      channel: (name: string) => {
        const entry: { name: string; filter?: string; table?: string } = { name }
        server.channels.push(entry)
        const ch = {
          on: (_e: string, cfg: { filter: string; table: string }) => {
            entry.filter = cfg.filter
            entry.table = cfg.table
            return ch
          },
          subscribe: (cb: (s: string) => void) => {
            cb('SUBSCRIBED')
            return ch
          },
        }
        return ch
      },
      removeChannel: (ch: unknown) => {
        void ch
        server.removed.push('x')
      },
    },
  }
})

import { createPrefsEngine, type PrefsStorage } from '@/state/prefs/prefsEngine'
import { createSupabasePrefsTransport } from '@/state/prefs/prefsTransport'
import { FAMILY_PREF_PATTERN_SOURCES, isFamilyPrefKey, isSyncedPrefKey } from '@/state/prefs/prefsRegistry'

const MODE = 'familyapp:compras-compare-mode'
const SORT = 'familyapp:compras-compare-sort'
const root = process.cwd()

function memStorage(): PrefsStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k), keys: () => [...data.keys()] }
}

// Un «dispositivo»: motor + caché propios para una persona. Cada operación fija quién habla con el servidor falso.
function device(user: string) {
  const storage = memStorage()
  const conflicts: { key: string; rejectedValue: unknown; appliedValue: unknown }[] = []
  const remote: string[][] = []
  const engine = createPrefsEngine({
    userId: user,
    storage,
    transport: createSupabasePrefsTransport(user),
    setTimer: () => 0,
    clearTimer: () => undefined,
    isOnline: () => true,
    now: () => 0,
    onRemoteChange: (k) => remote.push(k),
    onConflict: (c) => conflicts.push(c),
    onProblem: () => undefined,
  })
  const as = async <T>(fn: () => Promise<T> | T): Promise<T> => {
    server.me = user
    return fn()
  }
  return { storage, engine, conflicts, remote, as }
}

beforeEach(() => {
  server.seq = 100
  server.profiles = { a: 'fam1', b: 'fam1', c: 'fam2', d: null }
  server.user.clear()
  server.family.clear()
  server.channels = []
  server.removed = []
})

describe('claves familiares', () => {
  it('solo el modo y el orden del Comparador son familiares; el resto sigue siendo personal', () => {
    expect(FAMILY_PREF_PATTERN_SOURCES.length).toBe(1)
    expect(isFamilyPrefKey(MODE)).toBe(true)
    expect(isFamilyPrefKey(SORT)).toBe(true)
    expect(isFamilyPrefKey('familyapp:compras-compare-otra')).toBe(false)
    for (const k of ['familyapp:color-theme', 'familyapp:tab-order:bottom-nav', 'familyapp:compras-menu-layout', 'pepa:auto-confirm', 'familyapp:movement-color-mode']) {
      expect(isFamilyPrefKey(k), k).toBe(false)
      expect(isSyncedPrefKey(k), k).toBe(true)
    }
    expect(isSyncedPrefKey(MODE)).toBe(true)
  })
})

describe('familia con dos miembros (motor real + servidor falso)', () => {
  it('lo que elige una persona llega a la otra y a sus otros dispositivos; otra familia no lo ve', async () => {
    const a1 = device('a')
    const b1 = device('b')
    const c1 = device('c')
    await a1.as(() => a1.engine.start())
    await b1.as(() => b1.engine.start())
    await c1.as(() => c1.engine.start())

    a1.engine.set(MODE, 'alternativas')
    await a1.as(() => a1.engine.flushNow())
    expect(server.family.get('fam1|' + MODE)?.value).toBe('alternativas')
    expect(server.user.size).toBe(0) // nada de esto se guarda como preferencia personal

    await b1.as(() => b1.engine.pull())
    expect(b1.storage.getItem(MODE)).toBe('alternativas')
    expect(b1.remote.flat()).toContain(MODE)

    // Un segundo dispositivo de B que arranca después lo recibe en la descarga inicial.
    const b2 = device('b')
    await b2.as(() => b2.engine.start())
    expect(b2.storage.getItem(MODE)).toBe('alternativas')

    await c1.as(() => c1.engine.pull())
    expect(c1.storage.getItem(MODE)).toBeNull()
  })

  it('cambio simultáneo: gana el ya confirmado, la otra persona recibe el aviso y puede recuperar el suyo', async () => {
    const a1 = device('a')
    const b1 = device('b')
    await a1.as(() => a1.engine.start())
    await b1.as(() => b1.engine.start())

    // Los dos eligen a la vez sin haberse visto (los dos parten de «no existía»).
    a1.engine.set(SORT, 'precio')
    b1.engine.set(SORT, 'az')
    await a1.as(() => a1.engine.flushNow())
    await b1.as(() => b1.engine.flushNow())

    expect(server.family.get('fam1|' + SORT)?.value).toBe('precio')
    expect(b1.storage.getItem(SORT)).toBe('precio')
    expect(b1.conflicts).toEqual([{ key: SORT, rejectedValue: 'az', appliedValue: 'precio' }])
    expect(a1.conflicts).toEqual([])

    // «Recuperar el mío»: B vuelve a aplicar su valor partiendo de la revisión vigente.
    expect(b1.engine.recoverRejected(SORT)).toBe(true)
    await b1.as(() => b1.engine.flushNow())
    expect(server.family.get('fam1|' + SORT)?.value).toBe('az')
    await a1.as(() => a1.engine.pull())
    expect(a1.storage.getItem(SORT)).toBe('az')
  })

  it('un valor que solo estaba en un aparato (sin subir) lo sube el primero y los demás adoptan ese', async () => {
    const a1 = device('a')
    const b1 = device('b')
    a1.storage.setItem(MODE, 'alternativas')
    b1.storage.setItem(MODE, 'identicos')
    await a1.as(() => a1.engine.start())
    await b1.as(() => b1.engine.start())
    expect(server.family.get('fam1|' + MODE)?.value).toBe('alternativas')
    expect(b1.storage.getItem(MODE)).toBe('alternativas')
  })

  it('una preferencia personal sigue siendo personal: no la ve el otro miembro', async () => {
    const a1 = device('a')
    const b1 = device('b')
    await a1.as(() => a1.engine.start())
    await b1.as(() => b1.engine.start())
    a1.engine.set('familyapp:color-theme', 'oscuro')
    await a1.as(() => a1.engine.flushNow())
    expect(server.user.get('a|familyapp:color-theme')?.value).toBe('oscuro')
    expect(server.family.size).toBe(0)
    await b1.as(() => b1.engine.pull())
    expect(b1.storage.getItem('familyapp:color-theme')).toBeNull()
  })

  it('un valor personal antiguo de las claves del Comparador (anterior a la 0343) se ignora al descargar', async () => {
    server.user.set('a|' + MODE, { key: MODE, value: 'alternativas', rev: 5 })
    server.family.set('fam1|' + MODE, { key: MODE, value: 'identicos', rev: 90 })
    const a1 = device('a')
    await a1.as(() => a1.engine.start())
    expect(a1.storage.getItem(MODE)).toBe('identicos')
  })

  it('sin familia o sin permiso: el servidor rechaza, el cambio no se queda en bucle y no se pierde en silencio', async () => {
    const d1 = device('d')
    await d1.as(() => d1.engine.start())
    d1.engine.set(MODE, 'alternativas')
    await d1.as(() => d1.engine.flushNow())
    expect(d1.engine.pendingCount()).toBe(0)
    expect(d1.engine.rejectedKeys()).toContain(MODE)
    expect(server.family.size).toBe(0)
  })
})

describe('tiempo real', () => {
  it('abre un canal por la tabla de la persona y otro por la de su familia, filtrados; y los cierra al parar', async () => {
    const a1 = device('a')
    await a1.as(() => a1.engine.start())
    await new Promise((r) => setTimeout(r, 0))
    const tables = server.channels.map((c) => `${c.table}:${c.filter}`)
    expect(tables).toContain('user_prefs:user_id=eq.a')
    expect(tables).toContain('family_prefs:family_id=eq.fam1')
    a1.engine.stop()
    expect(server.removed.length).toBe(2)
  })

  it('sin familia solo hay canal personal', async () => {
    const d1 = device('d')
    await d1.as(() => d1.engine.start())
    await new Promise((r) => setTimeout(r, 0))
    expect(server.channels.map((c) => c.table)).toEqual(['user_prefs'])
  })
})

describe('migración 0343', () => {
  const sql = readFileSync(join(root, 'supabase/migrations/0343_family_prefs.sql'), 'utf8')
  it('existe con su reversión y el interruptor está encendido solo con la migración aplicada', async () => {
    const { COMPARE_PREFS_SYNC_ENABLED } = await import('@/state/prefs/prefsRegistry')
    expect(existsSync(join(root, 'supabase/rollbacks/0343_family_prefs_down.sql'))).toBe(true)
    if (COMPARE_PREFS_SYNC_ENABLED) expect(existsSync(join(root, 'supabase/migrations/0343_family_prefs.sql'))).toBe(true)
  })
  it('las claves familiares del servidor coinciden con las del cliente y salen de las personales', () => {
    expect(sql).toContain("'^familyapp:compras-compare-(mode|sort)$'")
    const userFn = sql.slice(sql.indexOf('create or replace function private.user_pref_key_allowed'), sql.indexOf('create or replace function public.set_family_pref'))
    expect(userFn).not.toContain('compare')
  })
  it('aislamiento: RLS solo de la propia familia, sin escritura directa, y escritura solo con acceso a Compras', () => {
    expect(sql).toContain('enable row level security')
    expect(sql).toMatch(/using \(family_id = \(select private\.current_family_id\(\)\)\)/)
    expect(sql).toContain('revoke all on public.family_prefs from anon, authenticated')
    expect(sql).toContain('grant select on public.family_prefs to authenticated')
    expect(sql).not.toMatch(/grant (insert|update|delete)[^;]*family_prefs/)
    expect(sql).toContain("private.has_section_access('compras')")
    expect(sql).toContain('supabase_realtime')
  })
  it('la migración no borra ni modifica filas personales', () => {
    expect(sql).not.toMatch(/delete\s+from\s+public\.user_prefs/i)
    expect(sql).not.toMatch(/update\s+public\.user_prefs/i)
  })
})
