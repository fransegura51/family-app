import { describe, expect, it } from 'vitest'
import { runAsLeader, type LocksApi } from '@/state/prefs/prefsLeader'

// Candados de Web Locks simulados: exclusivos por nombre, con cola, y se liberan cuando termina la promesa del que lo tiene.
function fakeLocks(): LocksApi {
  const queues = new Map<string, Array<() => void>>()
  const held = new Set<string>()
  const pump = (name: string) => {
    if (held.has(name)) return
    const next = queues.get(name)?.shift()
    if (next) next()
  }
  return {
    request(name, options, callback) {
      return new Promise((resolve, reject) => {
        const grant = () => {
          held.add(name)
          callback().finally(() => {
            held.delete(name)
            resolve(undefined)
            pump(name)
          })
        }
        if (options.signal?.aborted) return reject(new DOMException('aborted', 'AbortError'))
        const q = queues.get(name) ?? []
        queues.set(name, q)
        const entry = () => {
          if (options.signal?.aborted) return pump(name)
          grant()
        }
        options.signal?.addEventListener('abort', () => {
          const i = q.indexOf(entry)
          if (i >= 0) q.splice(i, 1)
          reject(new DOMException('aborted', 'AbortError'))
        })
        q.push(entry)
        pump(name)
      })
    },
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('una sola ventana habla con el servidor de preferencias', () => {
  it('con dos ventanas solo arranca el motor de la primera; si la primera se cierra, la segunda toma el relevo', async () => {
    const locks = fakeLocks()
    const log: string[] = []
    const w1 = runAsLeader('pepa-prefs:u', () => (log.push('arranca 1'), () => log.push('para 1')), locks)
    await tick()
    const w2 = runAsLeader('pepa-prefs:u', () => (log.push('arranca 2'), () => log.push('para 2')), locks)
    await tick()
    expect(log).toEqual(['arranca 1'])
    w1() // se cierra la ventana líder
    await tick()
    expect(log).toEqual(['arranca 1', 'para 1', 'arranca 2'])
    w2()
    await tick()
    expect(log).toEqual(['arranca 1', 'para 1', 'arranca 2', 'para 2'])
  })

  it('una ventana que se cierra antes de ser líder nunca arranca el motor', async () => {
    const locks = fakeLocks()
    const log: string[] = []
    const w1 = runAsLeader('n', () => (log.push('arranca 1'), () => {}), locks)
    await tick()
    const w2 = runAsLeader('n', () => (log.push('arranca 2'), () => {}), locks)
    w2()
    w1()
    await tick()
    expect(log).toEqual(['arranca 1'])
  })

  it('personas distintas no compiten por el mismo candado', async () => {
    const locks = fakeLocks()
    const log: string[] = []
    runAsLeader('pepa-prefs:a', () => (log.push('a'), () => {}), locks)
    runAsLeader('pepa-prefs:b', () => (log.push('b'), () => {}), locks)
    await tick()
    expect(log.sort()).toEqual(['a', 'b'])
  })

  it('sin Web Locks (navegadores antiguos) el motor arranca directamente, como antes', () => {
    const log: string[] = []
    const stop = runAsLeader('n', () => (log.push('arranca'), () => log.push('para')), null)
    expect(log).toEqual(['arranca'])
    stop()
    expect(log).toEqual(['arranca', 'para'])
  })
})
