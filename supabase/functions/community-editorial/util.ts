import { asRecord } from '../_shared/ai/validate.ts'
import type { CommunityAi } from '../_shared/communityAi.ts'
import type { DbResult, ServiceClient } from '../_shared/communityServer.ts'

// Piezas pequeñas y comunes de community-editorial. Código PURO (sin APIs de Deno): se prueba por simulación en Node.

export type EditorialKind = 'articles' | 'poll' | 'menu'
export type RunStatus = 'ok' | 'partial' | 'error' | 'skipped'

// Resultado de generar UN tipo (artículos, encuesta o menú) dentro de una ejecución.
export interface KindResult {
  status: RunStatus
  created: number
  expected: number
  itemIds: string[]
  // Códigos cortos (NUNCA texto de personas ni de la IA).
  errors: string[]
  detail: Record<string, unknown>
}

export interface GenContext {
  admin: ServiceClient
  // La IA se prepara solo cuando hace falta (una ejecución sin nada que hacer no la gasta).
  getAi(): Promise<CommunityAi | null>
}

// Texto sin tildes, minúsculas y solo letras/cifras separadas por un espacio: para comparar títulos y nombres.
export function normKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isMonday(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d && date.getUTCDay() === 1
}

export function addDays(value: string, n: number): string {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export const monthNameEs = (value: string): string => MONTHS[Number(value.slice(5, 7)) - 1]

// «Menú semanal de Pepa: semana del 2 al 8 de noviembre» (si cruza de mes: «del 26 de octubre al 1 de noviembre»).
export function menuTitle(monday: string): string {
  const end = addDays(monday, 6)
  const d1 = Number(monday.slice(8, 10))
  const d2 = Number(end.slice(8, 10))
  const sameMonth = monday.slice(5, 7) === end.slice(5, 7)
  const range = sameMonth ? `del ${d1} al ${d2} de ${monthNameEs(end)}` : `del ${d1} de ${monthNameEs(monday)} al ${d2} de ${monthNameEs(end)}`
  return `Menú semanal de Pepa: semana ${range}`
}

// Códigos de error de las RPC (el mensaje de Postgres empieza por el código).
const RPC_CODES = ['NO_SOURCES', 'TEXT_REQUIRED', 'RECIPES_INVALID', 'MENU_INVALID', 'BAD_KIND', 'NOT_AVAILABLE', 'RATE_LIMIT', 'MENU_TEXT_STALE']
export function rpcErrorCode(message: string): string {
  return RPC_CODES.find((c) => message.includes(c)) ?? 'DB_ERROR'
}

export interface RpcOutcome {
  data: unknown
  error: string | null
}

// Llama a una RPC sin que una excepción rompa la ejecución. `error` es solo el mensaje técnico (no se devuelve a nadie: se convierte en código).
export async function callRpc(client: { rpc(fn: string, args?: Record<string, unknown>): PromiseLike<DbResult> }, fn: string, args?: Record<string, unknown>): Promise<RpcOutcome> {
  try {
    const r = await client.rpc(fn, args)
    return r.error ? { data: null, error: r.error.message || 'error' } : { data: r.data, error: null }
  } catch (err) {
    return { data: null, error: String(err) }
  }
}

export const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
export const asStrings = (v: unknown): string[] => asArray(v).filter((x): x is string => typeof x === 'string')
export { asRecord }

// Ejecuta tareas con un máximo de `limit` a la vez (conserva el orden de los resultados).
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

// Estado final según lo creado y lo esperado.
export function statusFor(created: number, expected: number, satisfiedOther = 0): RunStatus {
  const done = created + satisfiedOther
  if (expected > 0 && done >= expected) return 'ok'
  return done > 0 ? 'partial' : 'error'
}
