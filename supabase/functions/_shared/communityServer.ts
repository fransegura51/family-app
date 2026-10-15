// Piezas comunes de las funciones de servidor de Comunidad PEPA (community-summarize, community-pepa, community-weekly-proposals y
// community-maintenance). Código PURO (sin APIs de Deno ni imports «npm:»): así los tests normales del proyecto lo ejecutan tal cual y las funciones
// reciben el cliente de Supabase «por la puerta» (inyección), lo que permite probarlas por simulación sin tocar nada real.

export interface DbError {
  message: string
}
export interface DbResult<T = unknown> {
  data: T | null
  error: DbError | null
}
export type Row = Record<string, unknown>

// Lo mínimo que estas funciones usan del cliente de Supabase con la clave de servicio (service_role). El cliente real
// (`createClient(...)` de supabase-js) lo cumple; se declara aquí solo lo que se usa para que las simulaciones de los tests sean pequeñas.
export interface ServiceClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<DbResult>
  from(table: string): {
    // `select(...)` se puede esperar tal cual (tabla pequeña) o filtrar con `.eq(...)` (una sola condición de igualdad).
    select(columns: string): PromiseLike<DbResult<Row[]>> & { eq(column: string, value: unknown): PromiseLike<DbResult<Row[]>> }
    insert(rows: Row[]): PromiseLike<{ error: DbError | null }>
  }
  storage: {
    from(bucket: string): {
      remove(paths: string[]): PromiseLike<DbResult>
      list(
        path?: string,
        options?: { limit?: number; offset?: number; sortBy?: { column: string; order: 'asc' | 'desc' } },
      ): PromiseLike<DbResult<StorageEntry[]>>
    }
  }
}

// Una entrada de la lista del almacenamiento: las carpetas llegan con `id` nulo y sin fechas.
export interface StorageEntry {
  name: string
  id?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Cabeceras CORS: solo las usa la función que llama la app desde el navegador (community-summarize). Las de cron no las necesitan.
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function jsonResponse(body: unknown, status = 200, withCors = false): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...(withCors ? CORS_HEADERS : {}) },
  })
}

// Comparación de texto en tiempo constante: no deja pistas de cuántos caracteres del secreto se han acertado.
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const x = enc.encode(a)
  const y = enc.encode(b)
  let diff = x.length ^ y.length
  const len = Math.max(x.length, y.length)
  for (let i = 0; i < len; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

// Autenticación de las funciones por cron: igual que send-due-reminders y send-user-push (cabecera x-cron-secret contra el secreto
// `cron_shared_secret` del Vault), no con el JWT de una persona. Devuelve null si la llamada es válida o la respuesta 401 que hay que devolver.
export async function authorizeCron(req: Request, client: ServiceClient): Promise<Response | null> {
  const provided = req.headers.get('x-cron-secret')
  if (!provided) return new Response('unauthorized', { status: 401 })
  const { data: expected, error } = await client.rpc('get_app_secret', { p_name: 'cron_shared_secret' })
  if (error || typeof expected !== 'string' || !expected || !timingSafeEqual(provided, expected)) {
    return new Response('unauthorized', { status: 401 })
  }
  return null
}

// Fecha de hoy en Madrid (YYYY-MM-DD): los contadores de IA de Comunidad cuentan «por día de Madrid» (migración 0273).
export function madridDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

// Lunes (YYYY-MM-DD) de la semana de Madrid a la que pertenece `now`: es la «semana del lote» (batch_week) de las propuestas semanales.
export function mondayOfMadridWeek(now: Date): string {
  const [y, m, d] = madridDate(now).split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  const dow = date.getUTCDay() === 0 ? 7 : date.getUTCDay() // 1 lunes … 7 domingo
  date.setUTCDate(date.getUTCDate() - (dow - 1))
  return date.toISOString().slice(0, 10)
}

export function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((x): x is Row => typeof x === 'object' && x !== null && !Array.isArray(x)) : []
}
