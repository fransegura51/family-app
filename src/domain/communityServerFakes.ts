// Simulaciones para probar las funciones de servidor de Comunidad (supabase/functions/community-*) en Node, sin Supabase ni Gemini reales:
// un cliente de servicio falso que anota cada llamada y un proveedor de IA falso que devuelve lo que se le indique.
import type { AiGenerateRequest, AiGenerateResult, AiProvider } from '../../supabase/functions/_shared/ai/types'
import { AiProviderError } from '../../supabase/functions/_shared/ai/types'
import { CommunityAi } from '../../supabase/functions/_shared/communityAi'
import type { DbResult, Row, ServiceClient, StorageEntry } from '../../supabase/functions/_shared/communityServer'

// Un manejador de rpc devuelve los datos; para simular un error de la base de datos se devuelve `new RpcFailure('mensaje')`.
export class RpcFailure {
  constructor(readonly message: string) {}
}
export type RpcHandler = (args: Record<string, unknown>) => unknown

export interface FakeCall {
  fn: string
  args: Record<string, unknown>
}

export interface FakeClientOptions {
  rpc?: Record<string, RpcHandler>
  tables?: Record<string, Row[] | RpcFailure>
  // Almacenamiento: carpetas → archivos; `list('')` devuelve las carpetas.
  storage?: Record<string, StorageEntry[]>
  removeFails?: boolean
  insertFails?: boolean
}

export interface FakeClient extends ServiceClient {
  calls: FakeCall[]
  inserted: { table: string; rows: Row[] }[]
  removed: string[][]
  listCalls: { path: string; options: unknown }[]
  count(fn: string): number
  argsOf(fn: string): Record<string, unknown>[]
}

function result(value: unknown): DbResult {
  if (value instanceof RpcFailure) return { data: null, error: { message: value.message } }
  return { data: value ?? null, error: null }
}

export function fakeClient(options: FakeClientOptions = {}): FakeClient {
  const calls: FakeCall[] = []
  const inserted: { table: string; rows: Row[] }[] = []
  const removed: string[][] = []
  const listCalls: { path: string; options: unknown }[] = []
  const tables = options.tables ?? {}

  const client: FakeClient = {
    calls,
    inserted,
    removed,
    listCalls,
    count: (fn) => calls.filter((c) => c.fn === fn).length,
    argsOf: (fn) => calls.filter((c) => c.fn === fn).map((c) => c.args),
    rpc(fn, args = {}) {
      calls.push({ fn, args })
      const handler = options.rpc?.[fn]
      return Promise.resolve(result(handler ? handler(args) : null))
    },
    from(table) {
      const rows = tables[table]
      const read = (filter?: (r: Row) => boolean): DbResult<Row[]> =>
        rows instanceof RpcFailure ? { data: null, error: { message: rows.message } } : { data: (rows ?? []).filter(filter ?? (() => true)), error: null }
      return {
        select() {
          const base = Promise.resolve(read()) as unknown as PromiseLike<DbResult<Row[]>> & { eq(column: string, value: unknown): PromiseLike<DbResult<Row[]>> }
          base.eq = (column, value) => Promise.resolve(read((r) => r[column] === value))
          return base
        },
        insert(newRows) {
          inserted.push({ table, rows: newRows })
          return Promise.resolve({ error: options.insertFails ? { message: 'insert falló' } : null })
        },
      }
    },
    storage: {
      from() {
        return {
          remove(paths) {
            removed.push(paths)
            return Promise.resolve(options.removeFails ? { data: null, error: { message: 'no se pudo borrar' } } : { data: paths.map((name) => ({ name })), error: null })
          },
          list(path = '', opts) {
            listCalls.push({ path, options: opts })
            const storage = options.storage ?? {}
            if (path === '') {
              const all: StorageEntry[] = Object.keys(storage).map((name) => ({ name, id: null }))
              const offset = opts?.offset ?? 0
              return Promise.resolve({ data: all.slice(offset, offset + (opts?.limit ?? 100)), error: null })
            }
            const files = storage[path] ?? []
            const offset = opts?.offset ?? 0
            return Promise.resolve({ data: files.slice(offset, offset + (opts?.limit ?? 100)), error: null })
          },
        }
      },
    },
  }
  return client
}

export interface FakeProvider extends AiProvider {
  requests: AiGenerateRequest[]
}

// Proveedor de IA falso: cada llamada consume la siguiente respuesta de la lista (texto → éxito; Error → fallo del proveedor).
export function fakeProvider(responses: (string | Error)[] | ((req: AiGenerateRequest, n: number) => string | Error)): FakeProvider {
  const requests: AiGenerateRequest[] = []
  return {
    name: 'fake',
    requests,
    async generate(req: AiGenerateRequest): Promise<AiGenerateResult> {
      const n = requests.length
      requests.push(req)
      const next = typeof responses === 'function' ? responses(req, n) : responses[Math.min(n, responses.length - 1)]
      if (next instanceof Error) throw next
      return { text: next, tokensIn: 10, tokensOut: 10 }
    },
  }
}

export const providerError = (status = 500) => new AiProviderError(status, `fake_http_${status}`)

// CommunityAi con el proveedor falso y el presupuesto «permitido» salvo que se diga lo contrario.
export function fakeAi(client: FakeClient, provider: FakeProvider): CommunityAi {
  return new CommunityAi(client, provider, 'modelo-de-prueba')
}

export const allowAi = (allowed = true): Record<string, RpcHandler> => ({ community_service_ai_allowed: () => allowed })

export const U1 = '11111111-1111-4111-8111-111111111111'
export const U2 = '22222222-2222-4222-8222-222222222222'
export const U3 = '33333333-3333-4333-8333-333333333333'
export const U4 = '44444444-4444-4444-8444-444444444444'

export function cronRequest(secret: string | null, body: unknown = {}): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (secret !== null) headers['x-cron-secret'] = secret
  return new Request('https://example.test/functions/v1/x', { method: 'POST', headers, body: JSON.stringify(body) })
}

export const SECRET = 'secreto-compartido-de-prueba'
export const secretRpc: Record<string, RpcHandler> = { get_app_secret: () => SECRET }
