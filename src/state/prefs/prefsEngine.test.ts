import { describe, expect, it } from 'vitest'
import { PREFS_OWNER_KEY, prefsMetaKey } from '@/state/prefs/prefsEngine'
import { FakeClock, FakeServer, FakeStorage, makeDevice, settle } from '@/state/prefs/prefsSimulation'

const NAV = 'familyapp:tab-order:bottom-nav'
const THEME = 'familyapp:color-theme'
const USER = 'user-a'

async function twoDevices(server = new FakeServer()) {
  const a = makeDevice(server, USER)
  const b = makeDevice(server, USER)
  await a.engine.start()
  await b.engine.start()
  await settle()
  return { server, a, b }
}

describe('sincronización entre dos dispositivos (servidor y tiempo real simulados)', () => {
  it('ordenador → móvil: el cambio llega al otro dispositivo sin recargar', async () => {
    const { a, b } = await twoDevices()
    a.engine.set(NAV, '["/","/compras"]')
    await a.clock.advance(1000)
    expect(b.storage.getItem(NAV)).toBe('["/","/compras"]')
    expect(b.remoteChanges.flat()).toContain(NAV) // la pantalla se entera (repinta) por el aviso de cambio remoto
  })

  it('móvil → ordenador: en el otro sentido también', async () => {
    const { a, b } = await twoDevices()
    b.engine.set(NAV, '["/","/dinero"]')
    await b.clock.advance(1000)
    expect(a.storage.getItem(NAV)).toBe('["/","/dinero"]')
    expect(a.remoteChanges.flat()).toContain(NAV)
  })

  it('cambios consecutivos del mismo valor: se sube solo el último, partiendo de la revisión original', async () => {
    const { server, a } = await twoDevices()
    a.engine.set(NAV, '1')
    a.engine.set(NAV, '2')
    a.engine.set(NAV, '3')
    await a.clock.advance(1000)
    expect(server.setCalls.filter((c) => c.key === NAV)).toEqual([{ userId: USER, key: NAV, value: '3', baseRev: 0 }])
    expect(server.get(USER, NAV)?.value).toBe('3')
    expect(a.engine.pendingCount()).toBe(0)
  })

  it('no pisa preferencias distintas: un dispositivo con datos antiguos cambia el tema y el orden del menú de otro se conserva', async () => {
    const { server, a, b } = await twoDevices()
    // B se queda con su copia (revisión 0 de todo) pero A cambia el menú y B no lo ve todavía (sin red).
    b.online = false
    a.engine.set(NAV, 'orden-nuevo')
    await a.clock.advance(1000)
    // B, aún sin red, cambia OTRA preferencia.
    b.engine.set(THEME, 'vivo')
    b.online = true
    await b.engine.pull()
    await b.clock.advance(5000)
    await settle()
    expect(server.get(USER, NAV)?.value).toBe('orden-nuevo')
    expect(server.get(USER, THEME)?.value).toBe('vivo')
    expect(b.storage.getItem(NAV)).toBe('orden-nuevo')
    expect(a.storage.getItem(THEME)).toBe('vivo')
    expect(b.conflicts).toHaveLength(0)
  })

  it('cambio simultáneo de la MISMA preferencia: prevalece el confirmado primero, el otro recibe aviso y puede recuperar el suyo', async () => {
    const { server, a, b } = await twoDevices()
    a.online = false // para que B no reciba el cambio de A en tiempo real y ambos partan de la misma revisión
    b.online = false
    a.engine.set(NAV, 'A')
    b.engine.set(NAV, 'B')
    a.online = true
    await a.clock.advance(1000) // A confirma primero
    b.online = true
    await b.clock.advance(5000) // B intenta subir 'B' partiendo de la revisión 0 → rechazado
    expect(server.get(USER, NAV)?.value).toBe('A')
    expect(b.storage.getItem(NAV)).toBe('A')
    expect(b.conflicts).toEqual([{ key: NAV, rejectedValue: 'B', appliedValue: 'A' }])
    expect(b.engine.rejectedKeys()).toEqual([NAV])
    // La persona decide recuperar el suyo: ahora SÍ es el último cambio confirmado y llega a A.
    expect(b.engine.recoverRejected(NAV)).toBe(true)
    await b.clock.advance(1000)
    expect(server.get(USER, NAV)?.value).toBe('B')
    expect(a.storage.getItem(NAV)).toBe('B')
    expect(b.engine.rejectedKeys()).toEqual([])
  })

  it('cambio hecho SIN conexión que parte de una revisión antigua no pisa uno más reciente: se avisa al reconectar', async () => {
    const { server, a, b } = await twoDevices()
    a.engine.set(NAV, 'v1')
    await a.clock.advance(1000)
    expect(b.storage.getItem(NAV)).toBe('v1')
    b.online = false
    b.engine.set(NAV, 'b-offline')
    a.engine.set(NAV, 'v2')
    await a.clock.advance(1000)
    b.online = true
    await b.engine.pull() // al reconectar se descarga lo nuevo antes de subir
    expect(b.conflicts).toEqual([{ key: NAV, rejectedValue: 'b-offline', appliedValue: 'v2' }])
    expect(b.storage.getItem(NAV)).toBe('v2')
    expect(server.get(USER, NAV)?.value).toBe('v2')
  })

  it('el eco de lo que uno mismo guarda no se toma como conflicto aunque llegue antes que la respuesta', async () => {
    const { server, a, b } = await twoDevices()
    a.engine.set(NAV, 'mio')
    await a.clock.advance(1000)
    expect(a.conflicts).toHaveLength(0)
    expect(a.engine.pendingCount()).toBe(0)
    expect(server.get(USER, NAV)?.value).toBe('mio')
    expect(b.storage.getItem(NAV)).toBe('mio')
  })

  it('recuperación tras desconexión: lo cambiado mientras estaba sin red se descarga al volver (sin necesidad del canal en tiempo real)', async () => {
    const { a, b } = await twoDevices()
    b.online = false
    a.engine.set(NAV, 'mientras-offline')
    a.engine.set(THEME, 'neutro')
    await a.clock.advance(1000)
    expect(b.storage.getItem(NAV)).toBeNull()
    b.online = true
    await b.engine.pull()
    expect(b.storage.getItem(NAV)).toBe('mientras-offline')
    expect(b.storage.getItem(THEME)).toBe('neutro')
  })

  it('cerrar y volver a abrir: los cambios pendientes sin red sobreviven y se suben al volver', async () => {
    const server = new FakeServer()
    const a = makeDevice(server, USER)
    await a.engine.start()
    a.online = false
    a.engine.set(NAV, 'pendiente')
    await a.clock.advance(1000)
    expect(server.get(USER, NAV)).toBeUndefined()
    a.engine.stop() // se cierra la app
    a.online = true
    await a.restart() // se vuelve a abrir
    await a.clock.advance(2000)
    expect(server.get(USER, NAV)?.value).toBe('pendiente')
    expect(a.engine.pendingCount()).toBe(0)
  })

  it('al abrir en un dispositivo nuevo recibe lo guardado en la cuenta (sin recarga) y lo de la cuenta manda sobre lo local distinto', async () => {
    const server = new FakeServer()
    server.seed(USER, NAV, 'de-la-cuenta')
    const storage = new FakeStorage()
    storage.setItem(NAV, 'local-viejo')
    storage.setItem(THEME, 'vivo') // la cuenta no tiene el tema: se sube
    const dev = makeDevice(server, USER, storage)
    await dev.engine.start()
    await dev.clock.advance(2000)
    expect(storage.getItem(NAV)).toBe('de-la-cuenta')
    expect(server.get(USER, THEME)?.value).toBe('vivo')
  })

  it('una preferencia nueva tras actualizar la app que solo existe en el dispositivo se sube en el siguiente arranque', async () => {
    const server = new FakeServer()
    const dev = makeDevice(server, USER)
    await dev.engine.start()
    await dev.clock.advance(1000)
    dev.storage.setItem('pepa.eventMenuView', 'secciones')
    await dev.restart()
    await dev.clock.advance(2000)
    expect(server.get(USER, 'pepa.eventMenuView')?.value).toBe('secciones')
  })

  it('«volver al valor predeterminado» (null) elimina la preferencia en los demás dispositivos', async () => {
    const { a, b } = await twoDevices()
    a.engine.set(NAV, 'x')
    await a.clock.advance(1000)
    expect(b.storage.getItem(NAV)).toBe('x')
    a.engine.set(NAV, null)
    await a.clock.advance(1000)
    expect(b.storage.getItem(NAV)).toBeNull()
  })
})

describe('personas y claves', () => {
  it('otra persona con el mismo navegador: su caché se limpia y no se mezclan preferencias', async () => {
    const server = new FakeServer()
    const storage = new FakeStorage()
    const first = makeDevice(server, 'persona-1', storage)
    await first.engine.start()
    first.engine.set(NAV, 'orden-de-1')
    await first.clock.advance(1000)
    first.engine.stop()
    expect(storage.getItem(PREFS_OWNER_KEY)).toBe('persona-1')
    const second = makeDevice(server, 'persona-2', storage)
    await second.engine.start()
    await second.clock.advance(1000)
    expect(storage.getItem(NAV)).toBeNull()
    expect(storage.getItem(PREFS_OWNER_KEY)).toBe('persona-2')
    expect(server.get('persona-2', NAV)).toBeUndefined()
    expect(server.get('persona-1', NAV)?.value).toBe('orden-de-1')
  })

  it('el cambio de una persona no llega a otra persona', async () => {
    const server = new FakeServer()
    const p1 = makeDevice(server, 'persona-1')
    const p2 = makeDevice(server, 'persona-2')
    await p1.engine.start()
    await p2.engine.start()
    p1.engine.set(NAV, 'solo-1')
    await p1.clock.advance(1000)
    expect(p2.storage.getItem(NAV)).toBeNull()
  })

  it('claves no sincronizables solo se guardan en el dispositivo, nunca se suben', async () => {
    const { server, a } = await twoDevices()
    a.engine.set('familyapp:location-sharing-member-id', 'abc')
    a.engine.set('otra:clave', 'x')
    await a.clock.advance(2000)
    expect(a.storage.getItem('otra:clave')).toBe('x')
    expect(server.setCalls).toHaveLength(0)
  })

  it('un valor demasiado grande se rechaza visiblemente, sin subirlo', async () => {
    const { server, a } = await twoDevices()
    a.engine.set(NAV, 'x'.repeat(9000))
    await a.clock.advance(2000)
    expect(server.setCalls).toHaveLength(0)
    expect(a.problems.some((p) => p.message?.includes('demasiado grande'))).toBe(true)
  })
})

describe('errores de red y de servidor: nada se pierde en silencio', () => {
  it('un fallo pasajero se reintenta con espera creciente y se avisa solo si persiste; al arreglarse se recupera', async () => {
    const { server, a } = await twoDevices()
    a.failNextSets = { count: 4, error: Object.assign(new Error('503'), { code: '503' }) }
    a.engine.set(NAV, 'reintento')
    await a.clock.advance(700)
    expect(a.engine.pendingCount()).toBe(1)
    await a.clock.advance(60_000)
    expect(a.problems.some((p) => p.failing)).toBe(true) // 3 fallos seguidos: se muestra
    expect(a.errors.length).toBeGreaterThan(0)
    await a.clock.advance(120_000)
    expect(server.get(USER, NAV)?.value).toBe('reintento')
    expect(a.engine.pendingCount()).toBe(0)
    expect(a.problems[a.problems.length - 1].failing).toBe(false)
  })

  it('un error que no se arregla reintentando se descarta CON aviso y el valor queda recuperable', async () => {
    const { server, a } = await twoDevices()
    a.failNextSets = { count: 1, error: Object.assign(new Error('INVALID_KEY'), { code: '22023' }) }
    a.engine.set(NAV, 'no-valido')
    await a.clock.advance(1000)
    expect(server.get(USER, NAV)).toBeUndefined()
    expect(a.engine.pendingCount()).toBe(0)
    expect(a.engine.rejectedKeys()).toEqual([NAV])
    expect(a.problems.some((p) => p.message)).toBe(true)
  })

  it('sin conexión no se pierde nada: queda en la cola guardada en el dispositivo', async () => {
    const { a } = await twoDevices()
    a.online = false
    a.engine.set(NAV, 'offline')
    await a.clock.advance(10_000)
    expect(a.engine.pendingCount()).toBe(1)
    const meta = JSON.parse(a.storage.getItem(prefsMetaKey(USER)) as string)
    expect(meta.outbox[NAV].value).toBe('offline')
  })

  it('si el canal en tiempo real se cae y vuelve, se descarga lo que faltaba', async () => {
    const server = new FakeServer()
    const a = makeDevice(server, USER)
    let statusCb: ((s: 'up' | 'down') => void) | null = null
    // Un segundo dispositivo cuyo canal controlamos a mano.
    const clock = new FakeClock()
    const storage = new FakeStorage()
    const { createPrefsEngine } = await import('@/state/prefs/prefsEngine')
    const engine = createPrefsEngine({
      userId: USER,
      storage,
      transport: {
        fetchSince: async (after) => server.fetchSince(USER, after),
        set: async (k, v, base) => server.set(USER, k, v, base),
        subscribe: (_onRow, onStatus) => {
          statusCb = onStatus
          return () => {}
        },
      },
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
      isOnline: () => true,
      now: clock.now,
      onRemoteChange: () => {},
      onConflict: () => {},
      onProblem: () => {},
    })
    await a.engine.start()
    await engine.start()
    statusCb!('down')
    a.engine.set(NAV, 'mientras-caido')
    await a.clock.advance(1000)
    expect(storage.getItem(NAV)).toBeNull() // el canal estaba caído
    statusCb!('up') // vuelve: se descarga lo que faltaba
    await settle()
    expect(storage.getItem(NAV)).toBe('mientras-caido')
  })
})
