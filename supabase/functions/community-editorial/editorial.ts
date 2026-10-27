import type { CommunityAi } from '../_shared/communityAi.ts'
import { CORS_HEADERS, type DbResult, type ServiceClient, UUID_RE, authorizeCron, jsonResponse } from '../_shared/communityServer.ts'
import { generateArticles } from './articles.ts'
import { generateMenu } from './menu.ts'
import { generatePoll } from './poll.ts'
import { type ReviseFailure, parseItem, parseReviseRequest, reviseItem } from './revise.ts'
import { type EditorialKind, type GenContext, type KindResult, asRecord, callRpc, isMonday, rpcErrorCode } from './util.ts'

// PROGRAMA EDITORIAL SEMANAL de Comunidad PEPA: genera con IA los BORRADORES de la semana (7 artículos, una encuesta y el menú) y rectifica borradores a
// petición de un administrador. GENERAR NO ES PUBLICAR: esta función solo crea elementos en estado «proposed» (RPC de servicio) y guarda propuestas de
// rectificación; no aprueba, no programa ni publica nada, y no modifica ningún elemento existente.
//
// Entradas (POST JSON):
//   · cabecera x-cron-secret válida → modo cron:  {action:'cron'}
//   · Authorization: Bearer <JWT de una persona administradora> → {action:'generate', kind, week?} y {action:'revise', item_id, instruction, scope, target?}

export interface UserSession {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<DbResult>
}

export interface EditorialDeps {
  admin: ServiceClient
  getAi(): Promise<CommunityAi | null>
  // Comprueba el JWT de la persona y devuelve un acceso con SU sesión, o null.
  authenticate(authorization: string): Promise<UserSession | null>
  now?: () => Date
}

const KINDS: EditorialKind[] = ['articles', 'poll', 'menu']
const WEEK_KEY: Record<EditorialKind, string> = { articles: 'articles_week', poll: 'poll_week', menu: 'menu_week' }

const json = (body: unknown, status = 200): Response => jsonResponse(body, status, true)
const err = (error: string, status: number): Response => json({ ok: false, error }, status)

interface Config {
  launched: boolean
  enabled: Record<EditorialKind, boolean>
  due: boolean
  weeks: Record<EditorialKind, string | null>
}

async function readConfig(admin: ServiceClient): Promise<Config | null> {
  const r = await callRpc(admin, 'community_service_editorial_config')
  const rec = r.error ? null : asRecord(r.data)
  if (!rec) return null
  const week = (k: EditorialKind): string | null => (isDate(rec[WEEK_KEY[k]]) ? (rec[WEEK_KEY[k]] as string) : null)
  return {
    launched: rec.launched === true,
    enabled: { articles: rec.articles_enabled === true, poll: rec.polls_enabled === true, menu: rec.menu_enabled === true },
    due: rec.due === true,
    weeks: { articles: week('articles'), poll: week('poll'), menu: week('menu') },
  }
}

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

// Ejecuta el generador del tipo y cierra la ejecución (finish_run) pase lo que pase: una ejecución nunca se queda «en curso».
async function executeRun(ctx: GenContext, kind: EditorialKind, runId: string, week: string): Promise<KindResult> {
  let result: KindResult
  try {
    result = kind === 'articles' ? await generateArticles(ctx, runId, week) : kind === 'poll' ? await generatePoll(ctx, runId, week) : await generateMenu(ctx, runId, week)
  } catch (e) {
    console.error('[community-editorial] error inesperado generando', kind, String(e))
    result = { status: 'error', created: 0, expected: 0, itemIds: [], errors: ['INTERNAL'], detail: {} }
  }
  // Solo códigos cortos: nunca texto de personas ni de la IA.
  const code = result.errors[0] ?? null
  await callRpc(ctx.admin, 'community_service_editorial_finish_run', {
    p_run: runId,
    p_status: result.status,
    p_created: result.created,
    p_expected: result.expected,
    p_error: result.status === 'ok' ? null : code,
    p_detail: { ...result.detail, errors: result.errors },
  })
  return result
}

// Una sola preparación de la IA por petición (si no hace falta, no se prepara).
function lazyAi(deps: EditorialDeps): () => Promise<CommunityAi | null> {
  let pending: Promise<CommunityAi | null> | null = null
  return () => (pending ??= deps.getAi())
}

async function handleCron(deps: EditorialDeps): Promise<Response> {
  const cfg = await readConfig(deps.admin)
  if (!cfg) return err('config_failed', 500)
  if (!cfg.launched) return json({ ok: true, skipped: 'not_launched' })
  // Solo los tipos con interruptor activo Y que toquen ya. Sin ninguno: ni begin_run ni IA.
  const todo = KINDS.filter((k) => cfg.enabled[k] && cfg.due && cfg.weeks[k] !== null)
  if (todo.length === 0) return json({ ok: true, ran: [] })
  const ctx: GenContext = { admin: deps.admin, getAi: lazyAi(deps) }
  const ran = (
    await Promise.all(
      todo.map(async (kind) => {
        const week = cfg.weeks[kind] as string
        const b = await callRpc(deps.admin, 'community_service_editorial_begin_run', { p_kind: kind, p_trigger: 'schedule', p_week: week, p_user: null })
        // null = ya hecho, en curso o reintentos agotados: no se genera nada.
        if (b.error || typeof b.data !== 'string' || !b.data) return null
        const r = await executeRun(ctx, kind, b.data, week)
        return { kind, run_id: b.data, status: r.status, created: r.created, expected: r.expected }
      }),
    )
  ).filter((x) => x !== null)
  return json({ ok: true, ran })
}

async function handleGenerate(deps: EditorialDeps, body: Record<string, unknown>, userId: string): Promise<Response> {
  const kind = body.kind
  if (kind !== 'articles' && kind !== 'poll' && kind !== 'menu') return err('bad_request', 400)
  let week: string
  if (body.week !== undefined && body.week !== null) {
    if (!isMonday(body.week)) return err('bad_request', 400)
    week = body.week
  } else {
    // «Generación manual de prueba»: IGNORA los interruptores; solo se lee la semana que toca a ese tipo.
    const cfg = await readConfig(deps.admin)
    const w = cfg?.weeks[kind]
    if (!w) return err('config_failed', 500)
    week = w
  }
  const b = await callRpc(deps.admin, 'community_service_editorial_begin_run', { p_kind: kind, p_trigger: 'manual', p_week: week, p_user: userId })
  if (b.error || typeof b.data !== 'string' || !b.data) return err('busy', 409)
  const r = await executeRun({ admin: deps.admin, getAi: lazyAi(deps) }, kind, b.data, week)
  if (r.status === 'skipped' && r.errors.includes('AI_NOT_ALLOWED')) return json({ ok: false, error: 'ai_not_allowed', run_id: b.data })
  return json({ ok: true, run_id: b.data, status: r.status, created: r.created, expected: r.expected, item_ids: r.itemIds, errors: r.errors })
}

const REVISE_STATUS: Record<ReviseFailure, number> = { ai_not_allowed: 200, ai_failed: 200, invalid_output: 200, bad_request: 400 }

async function handleRevise(deps: EditorialDeps, body: Record<string, unknown>, userId: string): Promise<Response> {
  const req = parseReviseRequest(body)
  if (!req) return err('bad_request', 400)
  const got = await callRpc(deps.admin, 'community_service_editorial_get_item', { p_item: req.itemId })
  const item = got.error ? null : parseItem(got.data)
  if (!item) return err('not_available', 404)

  const out = await reviseItem({ admin: deps.admin, getAi: lazyAi(deps) }, item, req)
  if (!out.ok) return err(out.error, REVISE_STATUS[out.error])

  const before = { title: item.title, body: item.body, payload: item.payload }
  const saved = await callRpc(deps.admin, 'community_service_editorial_save_revision', {
    p_item: item.id,
    p_user: userId,
    p_scope: req.scope,
    p_target: req.target ?? {},
    p_instruction: req.instruction,
    p_before: before,
    p_result: out.result,
    p_notes: out.notes,
  })
  if (saved.error) {
    const code = rpcErrorCode(saved.error)
    if (code === 'RATE_LIMIT') return err('rate_limit', 429)
    if (code === 'NOT_AVAILABLE') return err('not_available', 404)
    return err('ai_failed', 500)
  }
  if (typeof saved.data !== 'string' || !saved.data) return err('ai_failed', 500)
  return json({ ok: true, revision_id: saved.data, notes: out.notes, before, result: out.result, ...(out.quality ? { quality: out.quality } : {}) })
}

export async function handleEditorial(req: Request, deps: EditorialDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (req.method !== 'POST') return err('method_not_allowed', 405)
  try {
    // ---- autenticación: cron (x-cron-secret) o persona administradora (JWT)
    let mode: 'cron' | 'admin'
    let userId: string | null = null
    if (req.headers.get('x-cron-secret')) {
      const denied = await authorizeCron(req, deps.admin)
      if (denied) return err('unauthorized', 401)
      mode = 'cron'
    } else {
      const authorization = req.headers.get('Authorization')
      if (!authorization) return err('unauthorized', 401)
      const session = await deps.authenticate(authorization)
      if (!session) return err('unauthorized', 401)
      const can = await callRpc(session, 'community_admin_can_generate')
      const rec = can.error ? null : asRecord(can.data)
      if (!rec || rec.ok !== true || typeof rec.user !== 'string' || !UUID_RE.test(rec.user)) return err('not_admin', 403)
      mode = 'admin'
      userId = rec.user
    }

    let raw: unknown
    try {
      raw = await req.json()
    } catch {
      return err('bad_request', 400)
    }
    const body = asRecord(raw)
    if (!body) return err('bad_request', 400)

    if (body.action === 'cron') return mode === 'cron' ? await handleCron(deps) : err('forbidden', 403)
    if (body.action === 'generate' || body.action === 'revise') {
      if (mode !== 'admin' || !userId) return err('forbidden', 403)
      return body.action === 'generate' ? await handleGenerate(deps, body, userId) : await handleRevise(deps, body, userId)
    }
    return err('bad_request', 400)
  } catch (e) {
    console.error('[community-editorial] error inesperado:', String(e))
    return err('internal_error', 500)
  }
}
