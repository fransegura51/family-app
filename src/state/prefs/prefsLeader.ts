// Solo UNA ventana del navegador habla con el servidor de preferencias (CONFIG-01.1). Si PEPA está abierta en dos ventanas del mismo navegador (p. ej. la app instalada y
// una pestaña), comparten el mismo almacenamiento: dos motores a la vez se pisarían la cola de pendientes y la ventana que NO escribió en el almacenamiento se quedaba con la
// pantalla vieja. La ventana «líder» (Web Locks) arranca el motor; las demás se enteran por el aviso de almacenamiento y repintan. Si la líder se cierra, otra toma el relevo.
// Sin Web Locks (navegadores antiguos) cada ventana arranca su motor, como antes.
export interface LocksApi {
  request(name: string, options: { signal?: AbortSignal }, callback: () => Promise<void>): Promise<unknown>
}

// `locks`: omitido = los del navegador; null = sin Web Locks (se arranca directamente).
export function runAsLeader(name: string, start: () => () => void, locksArg?: LocksApi | null): () => void {
  const locks = locksArg === undefined ? defaultLocks() : locksArg
  if (!locks) return start()
  const abort = new AbortController()
  let cancelled = false
  let stopEngine: (() => void) | null = null
  let release: (() => void) | null = null
  locks
    .request(name, { signal: abort.signal }, () => {
      if (cancelled) return Promise.resolve()
      return new Promise<void>((resolve) => {
        release = resolve
        stopEngine = start() // se mantiene el candado mientras viva esta ventana (o hasta que se pare)
      })
    })
    .catch(() => {
      /* petición cancelada al parar */
    })
  return () => {
    cancelled = true
    abort.abort()
    stopEngine?.()
    stopEngine = null
    release?.()
    release = null
  }
}

function defaultLocks(): LocksApi | undefined {
  if (typeof navigator === 'undefined') return undefined
  const l = (navigator as unknown as { locks?: LocksApi }).locks
  return l && typeof l.request === 'function' ? l : undefined
}
