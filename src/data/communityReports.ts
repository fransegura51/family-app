// Comunidad PEPA — avisos de contenido inapropiado de personas SIN poder participar (visitantes y lectores sin alias) y su revisión por la administración.
// Mismo estilo que `data/community.ts` (todo por funciones del servidor, respuestas en camelCase, errores con código), pero en un archivo propio para no
// mezclar este contrato con el resto. El servidor (migración 0268) ya aplica los topes contra abusos: aquí no se confía en nada del cliente.
import { supabase } from '@/data/supabaseClient'
import type { VisitorResolution } from '@/domain/communityAdmin'
import { toCommunityError } from '@/domain/communityErrors'

// snake_case → camelCase en profundidad (copia mínima de `camelize` de data/community.ts: así este módulo no depende de aquel).
function camel<T>(value: unknown): T {
  if (Array.isArray(value)) return value.map((v) => camel(v)) as T
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())] = camel(v)
    return out as T
  }
  return value as T
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw toCommunityError(error)
  return camel<T>(data)
}

export type VisitorReportType = 'post' | 'comment' | 'review'

// Aviso desde la propia aplicación de alguien que NO puede usar `community_report` (solo lectura, sin alias o expulsado/a). `p_client_hash` va vacío: la
// huella técnica solo la calcula el Worker de Cloudflare; aquí el servidor ya sabe que hay sesión (origen «lector»). Nunca oculta nada por sí solo.
export const visitorReport = (type: VisitorReportType, id: string, reason: string, detail: string | null, contact: string | null = null) =>
  rpc<{ ok: boolean; alreadyReported?: boolean }>('community_visitor_report', {
    p_type: type,
    p_id: id,
    p_reason: reason,
    p_detail: detail,
    p_contact: contact,
    p_client_hash: null,
  })

// ---- Centro de Mando (solo administradores; el servidor lo comprueba con NOT_ADMIN)
export const adminListVisitorReports = (status: 'open' | 'resolved' = 'open', limit = 20, offset = 0) =>
  rpc<Record<string, unknown>[]>('community_admin_list_visitor_reports', { p_status: status, p_limit: limit, p_offset: offset })

export const adminResolveVisitorReport = (id: string, resolution: VisitorResolution, note: string | null, hide: boolean) =>
  rpc<Record<string, unknown>>('community_admin_resolve_visitor_report', { p_id: id, p_resolution: resolution, p_note: note, p_hide: hide })
