// Entrada del Cloudflare Worker de la lectura pública de Comunidad PEPA. SOLO exporta el manejador por defecto: un Worker de módulos no puede
// exportar constantes ni funciones sueltas (workerd falla al arrancar con «Incorrect type for map entry»). Toda la lógica está en handler.ts.
import { handle, type CacheLike, type Env } from './handler'

interface WorkerContext {
  waitUntil(promise: Promise<unknown>): void
}

export default {
  async fetch(request: Request, env: Env, ctx: WorkerContext): Promise<Response> {
    // `caches.default` es de Cloudflare (no está en los tipos estándar). En workers.dev no guarda nada, pero tampoco falla.
    const cache = (globalThis as unknown as { caches?: { default?: CacheLike } }).caches?.default ?? null
    return handle(request, env, {
      fetch: (input, init) => fetch(input, init),
      cache,
      waitUntil: (p) => ctx.waitUntil(p),
      now: () => Date.now(),
    })
  },
}
