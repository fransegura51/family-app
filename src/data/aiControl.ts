// Centro de Control de IA (solo administración): llamadas a las funciones ai_admin_* de la base de datos. El servidor exige ser administrador de PEPA en CADA llamada;
// esta capa no decide permisos. Las respuestas se leen con los lectores de src/domain/aiControl.ts (nunca se confía en su forma).
import { supabase } from '@/data/supabaseClient'
import {
  toAiAlerts,
  toAiAudit,
  toAiFamilies,
  toAiFamilyDetail,
  toAiLimits,
  toAiOverview,
  toAiPlans,
  toAiPrices,
  toAiState,
  toProjectionBase,
  type LimitMetric,
  type LimitMode,
  type LimitPeriod,
  type LimitScope,
} from '@/domain/aiControl'

async function call<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

const iso = (d: Date): string => d.toISOString()

export const getAiState = async () => toAiState(await call('ai_admin_state'))
export const setAiGlobal = (enabled: boolean) => call('ai_admin_set_global', { p_enabled: enabled })
export const setAiFunction = (purpose: string, enabled: boolean) => call('ai_admin_set_function', { p_purpose: purpose, p_enabled: enabled })

export const getAiOverview = async (from: Date, to: Date) => toAiOverview(await call('ai_admin_overview', { p_from: iso(from), p_to: iso(to) }))
export const getAiFamilies = async (from: Date, to: Date) => toAiFamilies(await call('ai_admin_families', { p_from: iso(from), p_to: iso(to) }))
export const getAiFamilyDetail = async (familyId: string, from: Date, to: Date) => toAiFamilyDetail(await call('ai_admin_family_detail', { p_family: familyId, p_from: iso(from), p_to: iso(to) }))

export const getAiLimits = async () => toAiLimits(await call('ai_admin_limits'))
export interface SetLimitInput {
  scope: LimitScope
  key: string
  period: LimitPeriod
  metric: LimitMetric
  max: number
  warnPct: number
  mode: LimitMode
  note: string | null
}
export const setAiLimit = (i: SetLimitInput) =>
  call('ai_admin_set_limit', { p_scope: i.scope, p_key: i.key, p_period: i.period, p_metric: i.metric, p_max: i.max, p_warn_pct: i.warnPct, p_mode: i.mode, p_note: i.note })
export const deleteAiLimit = (id: string) => call('ai_admin_delete_limit', { p_id: id })
export const setAiException = (familyId: string, purpose: string | null, until: string | null, note: string | null) =>
  call('ai_admin_set_exception', { p_family: familyId, p_purpose: purpose, p_until: until, p_note: note })
export const deleteAiException = (id: string) => call('ai_admin_delete_exception', { p_id: id })

export const getAiAlerts = async (status: 'open' | 'reviewed' | 'dismissed' | 'all' = 'open') => toAiAlerts(await call('ai_admin_alerts', { p_status: status }))
export const setAiAlertStatus = (id: string, status: 'open' | 'reviewed' | 'dismissed') => call('ai_admin_alert_status', { p_id: id, p_status: status })
export const runAiDetection = async () => Number(await call('ai_admin_run_detection')) || 0
export const setAiThresholds = (t: Record<string, number>) => call('ai_admin_set_thresholds', { p_thresholds: t })

export const getAiPrices = async () => toAiPrices(await call('ai_admin_prices'))
export const addAiPrice = (i: { provider: string; model: string; modality: string; input: number; output: number; validFrom: string; kind: 'confirmed' | 'estimated'; source: string }) =>
  call('ai_admin_add_price', { p_provider: i.provider, p_model: i.model, p_modality: i.modality, p_in: i.input, p_out: i.output, p_valid_from: i.validFrom, p_kind: i.kind, p_source: i.source })
export const getAiProjectionBase = async (days = 30) => toProjectionBase(await call('ai_admin_projection_base', { p_days: days }))
export const getAiAudit = async (limit = 50) => toAiAudit(await call('ai_admin_audit', { p_limit: limit }))

export const getAiPlans = async () => toAiPlans(await call('ai_admin_plans'))
export const upsertAiPlan = (id: string, name: string, priceEur: number | null, active: boolean, note: string | null) =>
  call('ai_admin_upsert_plan', { p_id: id, p_name: name, p_price: priceEur, p_active: active, p_note: note })
export const setAiQuota = (plan: string, purpose: string, period: LimitPeriod, metric: LimitMetric, max: number) =>
  call('ai_admin_set_quota', { p_plan: plan, p_purpose: purpose, p_period: period, p_metric: metric, p_max: max })
export const deleteAiQuota = (plan: string, purpose: string, period: LimitPeriod, metric: LimitMetric) =>
  call('ai_admin_delete_quota', { p_plan: plan, p_purpose: purpose, p_period: period, p_metric: metric })
