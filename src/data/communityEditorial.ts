// Comunidad — programa editorial semanal con IA y «Rectificar con Pepa» (solo administración). Los datos salen de funciones del servidor (supabase.rpc) y las dos
// acciones con IA («Generar ahora» y «Rectificar») van a la función de servidor `community-editorial` con la sesión de quien llama. Nada de esto publica: generar
// crea borradores y aceptar una rectificación crea una versión nueva que hay que volver a aprobar.
import { supabase } from '@/data/supabaseClient'
import { rpc } from '@/data/community'
import {
  generateErrorText,
  reviseErrorText,
  toEditorialItems,
  toEditorialStatus,
  toGenerateResult,
  toItemVersions,
  toReviseProposal,
  toRevisions,
  toRuns,
  reviseWire,
  type EditorialKey,
  type EditorialToggleKind,
  type GenerateResult,
  type ReviseProposal,
  type ReviseTarget,
} from '@/domain/communityEditorial'

// ---- Estado y listas (RPC de administración; el servidor exige ser administrador de Comunidad)
export const getEditorialStatus = async () => toEditorialStatus(await rpc<unknown>('community_admin_editorial_status'))
// `kind` es el del interruptor: 'articles' | 'polls' | 'menu' (la encuesta se llama 'polls' aquí y 'poll' en el estado devuelto).
export const setEditorialToggle = (kind: EditorialToggleKind, enabled: boolean) => rpc<void>('community_admin_set_editorial_toggle', { p_kind: kind, p_enabled: enabled })
export const listEditorialRuns = async (limit = 30) => toRuns(await rpc<unknown>('community_admin_editorial_runs', { p_limit: limit }))
export const listEditorialItems = async (week: string | null = null) => toEditorialItems(await rpc<unknown>('community_admin_editorial_items', { p_week: week }))
export const listEditorialRevisions = async (itemId: string) => toRevisions(await rpc<unknown>('community_admin_editorial_revisions', { p_item: itemId }))
export const listItemVersions = async (itemId: string) => toItemVersions(await rpc<unknown>('community_admin_item_versions', { p_item: itemId }))
// Publicación automática del menú ya APROBADO a su hora (distinta de la generación). No aprueba nada: solo deja que lo aprobado salga solo.
export const setMenuAutopublish = (enabled: boolean) => rpc<void>('community_admin_set_menu_autopublish', { p_enabled: enabled })
// Aceptar crea una VERSIÓN NUEVA y deja el elemento como borrador (nunca publica). Rechazar no cambia nada. Errores del servidor: STALE y NOT_AVAILABLE.
export async function decideRevision(revisionId: string, accept: boolean): Promise<{ accepted: boolean; version: number | null }> {
  const r = await rpc<{ accepted?: boolean; version?: number } | null>('community_admin_editorial_decide_revision', { p_revision: revisionId, p_accept: accept })
  return { accepted: r?.accepted === true, version: typeof r?.version === 'number' ? r.version : null }
}
export const restoreItemVersion = (itemId: string, version: number) => rpc<number>('community_admin_restore_item_version', { p_item: itemId, p_version: version })
// Reprograma un artículo YA aprobado y aún sin publicar (el instante va en ISO).
export const scheduleItem = (id: string, publishAtIso: string) => rpc<void>('community_admin_schedule_item', { p_id: id, p_publish_at: publishAtIso })

// ---- Función de servidor `community-editorial`
export class EditorialCallError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'EditorialCallError'
    this.code = code
  }
}

// Espera máxima de una llamada con IA (el servidor corta antes, a unos 150 s).
const CALL_TIMEOUT_MS = 175_000

async function callEditorial(body: Record<string, unknown>, toText: (code: string) => string): Promise<Record<string, unknown>> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new EditorialCallError('unauthorized', toText('unauthorized'))
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? ''
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), CALL_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/community-editorial`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError'
    throw new EditorialCallError(aborted ? 'timeout' : 'network', toText(aborted ? 'timeout' : 'network'))
  } finally {
    clearTimeout(timer)
  }
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok || !json || json.ok === false) {
    const code = typeof json?.error === 'string' ? json.error : res.status === 401 ? 'unauthorized' : res.status === 403 ? 'not_admin' : res.status === 409 ? 'busy' : res.status === 504 || res.status === 502 || res.status === 546 ? 'timeout' : 'internal_error'
    throw new EditorialCallError(code, toText(code))
  }
  return json
}

/** «Generar ahora»: prepara BORRADORES del tipo pedido (no publica nada). Funciona aunque el interruptor esté en pausa. */
export async function generateNow(kind: EditorialKey, week?: string): Promise<GenerateResult> {
  const json = await callEditorial({ action: 'generate', kind, ...(week ? { week } : {}) }, generateErrorText)
  return toGenerateResult(json)
}

/** «Rectificar con Pepa»: pide una versión nueva del borrador. Solo PROPONE: no cambia nada hasta que se acepta con `decideRevision`. */
// `target`: sin él (o con `{scope:'week'}`) es la rectificación general; `{day, meal}` (forma antigua) es UNA comida; con `scope`: una receta, una comida, un día o todo el menú.
export async function requestRevision(itemId: string, instruction: string, target?: ReviseTarget | { day: number; meal: 'comida' | 'cena' }): Promise<ReviseProposal> {
  const wire = target ? reviseWire('scope' in target ? target : { scope: 'meal', day: target.day, meal: target.meal }) : reviseWire({ scope: 'week' })
  const json = await callEditorial({ action: 'revise', item_id: itemId, instruction: instruction.trim(), scope: wire.scope, ...(wire.target ? { target: wire.target } : {}) }, reviseErrorText)
  return toReviseProposal(json)
}

