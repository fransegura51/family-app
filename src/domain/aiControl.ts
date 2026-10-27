// Centro de Control de IA (Centro de Administración → «Control de IA»): tipos, lectores de las respuestas del servidor, textos en español, periodos, estado efectivo de cada
// función y proyección de costes. Lógica PURA (sin red ni React) para poder probarla sin pantalla.
//
// Reglas que esta capa no puede romper: (1) las cifras de coste son ESTIMACIONES salvo que el servidor diga «confirmado»; (2) nunca se muestra contenido de las familias:
// solo números y nombres de funciones/familias/personas; (3) las proyecciones se identifican siempre como proyecciones, nunca como gasto real.
import { madridParts, madridWallToInstant } from '@/domain/communityAdmin'

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const asRec = (v: unknown): Rec => (isRec(v) ? v : {})
const rows = (v: unknown): Rec[] => (Array.isArray(v) ? v.filter(isRec) : [])
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d)
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const num = (v: unknown, d = 0): number => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : d
}
const bool = (v: unknown): boolean => v === true

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Módulos
// ---------------------------------------------------------------------------------------------------------------------------------------------------
export type AiModuleId = 'compras_economia' | 'comunidad' | 'ayuda' | 'cocina' | 'mis_listas' | 'eventos' | 'otros'

export const AI_MODULES: { id: AiModuleId; label: string; icon: string }[] = [
  { id: 'compras_economia', label: 'Compras y Economía', icon: '🛒' },
  { id: 'comunidad', label: 'Comunidad', icon: '🛡️' },
  { id: 'ayuda', label: 'Ayuda y asistencia', icon: '📖' },
  { id: 'cocina', label: 'Cocina', icon: '🍳' },
  { id: 'mis_listas', label: 'Mis listas', icon: '📝' },
  { id: 'eventos', label: 'Eventos', icon: '🎉' },
  { id: 'otros', label: 'Otros módulos con IA', icon: '🧩' },
]

export function moduleLabel(id: string): string {
  return AI_MODULES.find((m) => m.id === id)?.label ?? 'Otros módulos con IA'
}

export function moduleIcon(id: string): string {
  return AI_MODULES.find((m) => m.id === id)?.icon ?? '🧩'
}

const asModule = (v: unknown): AiModuleId => AI_MODULES.find((m) => m.id === v)?.id ?? 'otros'

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Estado general y funciones
// ---------------------------------------------------------------------------------------------------------------------------------------------------
export type AiNeed = 'global' | 'community_launched' | 'community_ai_enabled'

export interface AiFunctionRow {
  purpose: string
  label: string
  module: AiModuleId
  description: string
  origin: 'family' | 'automatic' | 'admin'
  needs: AiNeed[]
  /** Interruptor propio de la función (independiente del general). */
  enabled: boolean
  calls24h: number
  failed24h: number
  lastCall: string | null
  lastFailure: string | null
}

export interface AiCommunityState {
  launched: boolean
  aiEnabled: boolean
  dailyCap: number
  usedToday: number
  scheduleArticles: boolean
  schedulePolls: boolean
  scheduleMenu: boolean
}

export interface AiState {
  enabled: boolean
  provider: string
  model: string
  keyConfigured: boolean
  plansEnforced: boolean
  thresholds: Record<string, number>
  community: AiCommunityState
  openAlerts: number
  functions: AiFunctionRow[]
  unregistered: string[]
}

const NEEDS: AiNeed[] = ['global', 'community_launched', 'community_ai_enabled']
const ORIGINS = ['family', 'automatic', 'admin'] as const

export function toAiState(raw: unknown): AiState {
  const r = asRec(raw)
  const c = asRec(r.community)
  const thresholds: Record<string, number> = {}
  for (const [k, v] of Object.entries(asRec(r.thresholds))) if (typeof v === 'number') thresholds[k] = v
  return {
    enabled: r.enabled !== false,
    provider: str(r.provider, 'gemini'),
    model: str(r.model, ''),
    keyConfigured: bool(r.key_configured),
    plansEnforced: bool(r.plans_enforced),
    thresholds,
    community: {
      launched: bool(c.launched),
      aiEnabled: bool(c.ai_enabled),
      dailyCap: num(c.daily_cap, 300),
      usedToday: num(c.used_today),
      scheduleArticles: bool(c.schedule_articles),
      schedulePolls: bool(c.schedule_polls),
      scheduleMenu: bool(c.schedule_menu),
    },
    openAlerts: num(r.open_alerts),
    functions: rows(r.functions).map((f) => ({
      purpose: str(f.purpose),
      label: str(f.label, str(f.purpose)),
      module: asModule(f.module),
      description: str(f.description),
      origin: ORIGINS.find((o) => o === f.origin) ?? 'family',
      needs: (Array.isArray(f.needs) ? f.needs : []).filter((n): n is AiNeed => NEEDS.includes(n as AiNeed)),
      enabled: f.enabled !== false,
      calls24h: num(f.calls_24h),
      failed24h: num(f.failed_24h),
      lastCall: strOrNull(f.last_call),
      lastFailure: strOrNull(f.last_failure),
    })),
    unregistered: (Array.isArray(r.unregistered) ? r.unregistered : []).filter((x): x is string => typeof x === 'string'),
  }
}

export const NEED_TEXT: Record<AiNeed, string> = {
  global: 'Funciona solo si la inteligencia artificial de PEPA está activada.',
  community_launched: 'Necesita que Comunidad esté abierta.',
  community_ai_enabled: 'Necesita además el interruptor «Inteligencia artificial de Comunidad» (Comunidad → Configuración).',
}

export type AiFunctionStatus =
  | { kind: 'on' }
  | { kind: 'off' }
  | { kind: 'global_off' }
  | { kind: 'waiting'; reason: string }
  | { kind: 'technical'; reason: string }

/** Estado REAL de una función: distingue apagado voluntario, espera por una dependencia y fallo técnico. */
export function functionStatus(fn: AiFunctionRow, s: AiState): AiFunctionStatus {
  if (!s.enabled) return { kind: 'global_off' }
  if (!fn.enabled) return { kind: 'off' }
  if (fn.needs.includes('community_launched') && !s.community.launched) return { kind: 'waiting', reason: 'Comunidad todavía no está abierta.' }
  if (fn.needs.includes('community_ai_enabled') && !s.community.aiEnabled) return { kind: 'waiting', reason: 'Falta activar «Inteligencia artificial de Comunidad» en Comunidad → Configuración.' }
  if (!s.keyConfigured) return { kind: 'technical', reason: 'Falta la clave del proveedor de IA.' }
  if (fn.calls24h >= 3 && fn.failed24h === fn.calls24h) return { kind: 'technical', reason: `Las ${fn.calls24h} últimas llamadas han fallado.` }
  return { kind: 'on' }
}

export const STATUS_TEXT: Record<AiFunctionStatus['kind'], string> = {
  on: 'Activada',
  off: 'Desactivada por ti',
  global_off: 'Parada por el interruptor general',
  waiting: 'Activada, en espera',
  technical: 'Con fallo técnico',
}

/** Programación semanal asociada (solo las funciones editoriales): se gestiona en Comunidad → Contenido oficial. */
export function scheduleOf(purpose: string, c: AiCommunityState): boolean | null {
  if (purpose === 'editorial_article') return c.scheduleArticles
  if (purpose === 'editorial_poll') return c.schedulePolls
  if (purpose === 'editorial_menu') return c.scheduleMenu
  return null
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Periodos (días naturales de Madrid)
// ---------------------------------------------------------------------------------------------------------------------------------------------------
export type PeriodPreset = 'today' | '7d' | '30d' | 'month' | 'custom'
export const PERIOD_LABEL: Record<PeriodPreset, string> = { today: 'Hoy', '7d': 'Últimos 7 días', '30d': 'Últimos 30 días', month: 'Mes actual', custom: 'Intervalo' }
export const MAX_RANGE_DAYS = 400

export interface PeriodRange {
  from: Date
  to: Date
  days: number
}

const dayStart = (y: number, m: number, d: number): Date => madridWallToInstant(y, m, d, 0, 0)

/** Rango [from, to) en días de Madrid. `custom` recibe fechas «AAAA-MM-DD» (ambas incluidas). Devuelve null si el intervalo no es válido. */
export function periodRange(preset: PeriodPreset, now: Date, custom?: { from: string; to: string }): PeriodRange | null {
  const p = madridParts(now)
  const dateOf = (back: number): { y: number; m: number; d: number } => {
    const t = new Date(Date.UTC(p.year, p.month - 1, p.day - back))
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }
  }
  const tomorrow = dateOf(-1)
  const end = dayStart(tomorrow.y, tomorrow.m, tomorrow.d)
  let start: Date
  if (preset === 'today') {
    const t = dateOf(0)
    start = dayStart(t.y, t.m, t.d)
  } else if (preset === '7d') {
    const t = dateOf(6)
    start = dayStart(t.y, t.m, t.d)
  } else if (preset === '30d') {
    const t = dateOf(29)
    start = dayStart(t.y, t.m, t.d)
  } else if (preset === 'month') {
    start = dayStart(p.year, p.month, 1)
  } else {
    const f = parseDay(custom?.from)
    const t = parseDay(custom?.to)
    if (!f || !t) return null
    const next = new Date(Date.UTC(t.y, t.m - 1, t.d + 1))
    const from = dayStart(f.y, f.m, f.d)
    const to = dayStart(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate())
    return validRange(from, to)
  }
  return validRange(start, end)
}

function validRange(from: Date, to: Date): PeriodRange | null {
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000)
  if (!(to > from) || days > MAX_RANGE_DAYS) return null
  return { from, to, days }
}

function parseDay(v: string | undefined): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v ?? '')
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const t = new Date(Date.UTC(y, mo - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? { y, m: mo, d } : null
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Consumo
// ---------------------------------------------------------------------------------------------------------------------------------------------------
export interface AiTotals {
  cost: number
  calls: number
  failed: number
  tokensIn: number
  tokensOut: number
  unpricedCalls: number
  estimatedCalls: number
  confirmedCalls: number
  families: number
  users: number
  automaticCost: number
}

export interface AiFunctionUsage {
  purpose: string
  label: string
  module: AiModuleId
  calls: number
  failed: number
  tokensIn: number
  tokensOut: number
  cost: number
  prevCost: number
  prevCalls: number
}

export interface AiFamilyUsage {
  familyId: string
  name: string
  calls: number
  cost: number
  users: number
  functions: number
}

export interface AiOverview {
  totals: AiTotals
  previous: { cost: number; calls: number }
  byFunction: AiFunctionUsage[]
  byModule: { module: AiModuleId; calls: number; cost: number }[]
  byModel: { model: string; calls: number; cost: number }[]
  byDay: { day: string; calls: number; cost: number }[]
  byOrigin: { origin: string; calls: number; cost: number }[]
  topFamilies: AiFamilyUsage[]
}

export function toAiOverview(raw: unknown): AiOverview {
  const r = asRec(raw)
  const t = asRec(r.totals)
  const p = asRec(r.previous)
  return {
    totals: {
      cost: num(t.cost),
      calls: num(t.calls),
      failed: num(t.failed),
      tokensIn: num(t.tokens_in),
      tokensOut: num(t.tokens_out),
      unpricedCalls: num(t.unpriced_calls),
      estimatedCalls: num(t.estimated_calls),
      confirmedCalls: num(t.confirmed_calls),
      families: num(t.families),
      users: num(t.users),
      automaticCost: num(t.automatic_cost),
    },
    previous: { cost: num(p.cost), calls: num(p.calls) },
    byFunction: rows(r.by_function).map((f) => ({
      purpose: str(f.purpose),
      label: str(f.label, str(f.purpose)),
      module: asModule(f.module),
      calls: num(f.calls),
      failed: num(f.failed),
      tokensIn: num(f.tokens_in),
      tokensOut: num(f.tokens_out),
      cost: num(f.cost),
      prevCost: num(f.prev_cost),
      prevCalls: num(f.prev_calls),
    })),
    byModule: rows(r.by_module).map((m) => ({ module: asModule(m.module), calls: num(m.calls), cost: num(m.cost) })),
    byModel: rows(r.by_model).map((m) => ({ model: str(m.model, '—'), calls: num(m.calls), cost: num(m.cost) })),
    byDay: rows(r.by_day).map((d) => ({ day: str(d.day), calls: num(d.calls), cost: num(d.cost) })),
    byOrigin: rows(r.by_origin).map((o) => ({ origin: str(o.origin), calls: num(o.calls), cost: num(o.cost) })),
    topFamilies: rows(r.top_families).map(toFamilyUsage),
  }
}

function toFamilyUsage(f: Rec): AiFamilyUsage {
  return { familyId: str(f.family_id), name: str(f.name, 'Familia'), calls: num(f.calls), cost: num(f.cost), users: num(f.users), functions: num(f.functions) }
}

export interface AiFamilyRow extends AiFamilyUsage {
  prevCost: number
  hasLimit: boolean
  disabled: boolean
}

export function toAiFamilies(raw: unknown): AiFamilyRow[] {
  return rows(raw).map((f) => ({ ...toFamilyUsage(f), prevCost: num(f.prev_cost), hasLimit: bool(f.has_limit), disabled: bool(f.disabled) }))
}

export interface AiFamilyDetail {
  familyId: string
  name: string
  totals: { cost: number; calls: number; prevCost: number; prevCalls: number; individualCost: number; unattributedCost: number; automaticCost: number }
  byFunction: { purpose: string; label: string; calls: number; cost: number }[]
  byUser: { userId: string; name: string; calls: number; cost: number }[]
  byDay: { day: string; calls: number; cost: number }[]
  limits: AiLimit[]
  exceptions: AiException[]
}

export function toAiFamilyDetail(raw: unknown): AiFamilyDetail {
  const r = asRec(raw)
  const t = asRec(r.totals)
  return {
    familyId: str(r.family_id),
    name: str(r.name, 'Familia'),
    totals: {
      cost: num(t.cost),
      calls: num(t.calls),
      prevCost: num(t.prev_cost),
      prevCalls: num(t.prev_calls),
      individualCost: num(t.individual_cost),
      unattributedCost: num(t.unattributed_cost),
      automaticCost: num(t.automatic_cost),
    },
    byFunction: rows(r.by_function).map((f) => ({ purpose: str(f.purpose), label: str(f.label, str(f.purpose)), calls: num(f.calls), cost: num(f.cost) })),
    byUser: rows(r.by_user).map((u) => ({ userId: str(u.user_id), name: str(u.name, 'Sin identificar'), calls: num(u.calls), cost: num(u.cost) })),
    byDay: rows(r.by_day).map((d) => ({ day: str(d.day), calls: num(d.calls), cost: num(d.cost) })),
    limits: rows(r.limits).map(toLimit),
    exceptions: rows(r.exceptions).map(toException),
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Límites
// ---------------------------------------------------------------------------------------------------------------------------------------------------
export type LimitScope = 'global' | 'module' | 'function' | 'family' | 'user'
export type LimitPeriod = 'day' | 'month'
export type LimitMetric = 'cost' | 'calls'
export type LimitMode = 'observe' | 'warn' | 'block'

export const LIMIT_SCOPE_LABEL: Record<LimitScope, string> = { global: 'Toda la IA de PEPA', module: 'Un módulo', function: 'Una función', family: 'Una familia', user: 'Una persona' }
export const LIMIT_PERIOD_LABEL: Record<LimitPeriod, string> = { day: 'al día', month: 'al mes' }
export const LIMIT_METRIC_LABEL: Record<LimitMetric, string> = { cost: 'Presupuesto (US$ estimados)', calls: 'Número de llamadas' }
export const LIMIT_MODE_LABEL: Record<LimitMode, string> = { observe: 'Observación', warn: 'Aviso', block: 'Bloqueo' }
export const LIMIT_MODE_HELP: Record<LimitMode, string> = {
  observe: 'Solo registra el consumo; no avisa ni bloquea.',
  warn: 'Avisa en el Centro de Administración al llegar al umbral; no bloquea.',
  block: 'Impide NUEVAS operaciones al alcanzar el límite. Con costes estimados, una llamada en curso puede acabar pasándose un poco.',
}

export interface AiLimit {
  id: string
  scope: LimitScope
  scopeKey: string
  period: LimitPeriod
  metric: LimitMetric
  maxValue: number
  warnPct: number
  mode: LimitMode
  note: string | null
  label: string
  used: number
}

const pick = <T extends string>(v: unknown, all: readonly T[], d: T): T => all.find((x) => x === v) ?? d

function toLimit(l: Rec): AiLimit {
  const scope = pick(l.scope, ['global', 'module', 'function', 'family', 'user'] as const, 'global')
  const key = str(l.scope_key)
  return {
    id: str(l.id),
    scope,
    scopeKey: key,
    period: pick(l.period, ['day', 'month'] as const, 'month'),
    metric: pick(l.metric, ['cost', 'calls'] as const, 'calls'),
    maxValue: num(l.max_value),
    warnPct: num(l.warn_pct, 80),
    mode: pick(l.mode, ['observe', 'warn', 'block'] as const, 'observe'),
    note: strOrNull(l.note),
    label: scope === 'module' ? moduleLabel(key) : str(l.label, LIMIT_SCOPE_LABEL[scope]),
    used: num(l.used),
  }
}

export interface AiException {
  id: string
  familyId: string
  family: string
  purpose: string | null
  until: string | null
  note: string | null
}

function toException(e: Rec): AiException {
  return { id: str(e.id), familyId: str(e.family_id), family: str(e.family, 'Familia'), purpose: strOrNull(e.purpose), until: strOrNull(e.until), note: strOrNull(e.note) }
}

export interface AiLimitsData {
  limits: AiLimit[]
  exceptions: AiException[]
  communityCap: { cap: number; usedToday: number }
}

export function toAiLimits(raw: unknown): AiLimitsData {
  const r = asRec(raw)
  const c = asRec(r.community_daily_cap)
  return { limits: rows(r.limits).map(toLimit), exceptions: rows(r.exceptions).map(toException), communityCap: { cap: num(c.cap, 300), usedToday: num(c.used_today) } }
}

/** Porcentaje usado de un límite (0–100+). */
export function limitPct(l: AiLimit): number {
  return l.maxValue > 0 ? (l.used / l.maxValue) * 100 : 0
}

export type LimitState = 'ok' | 'near' | 'over'
export function limitState(l: AiLimit): LimitState {
  const pct = limitPct(l)
  return pct >= 100 ? 'over' : pct >= l.warnPct ? 'near' : 'ok'
}

export function limitStateText(l: AiLimit): string {
  const st = limitState(l)
  if (st === 'ok') return 'Dentro del límite'
  if (st === 'near') return l.mode === 'observe' ? 'Cerca del límite (solo observación)' : 'Cerca del límite'
  if (l.mode === 'block') return 'Límite alcanzado: nuevas operaciones bloqueadas'
  return l.mode === 'warn' ? 'Límite superado (solo aviso)' : 'Límite superado (solo observación: no bloquea)'
}

export function formatLimitValue(metric: LimitMetric, v: number): string {
  return metric === 'cost' ? formatMoney(v) : `${formatCount(v)} llamadas`
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Alertas
// ---------------------------------------------------------------------------------------------------------------------------------------------------
export type AlertStatus = 'open' | 'reviewed' | 'dismissed'
export interface AiAlert {
  id: string
  kind: string
  subject: string
  subjectLabel: string
  severity: 'info' | 'warning' | 'critical'
  details: Record<string, unknown>
  status: AlertStatus
  firstSeen: string
  lastSeen: string
  occurrences: number
}

export function toAiAlerts(raw: unknown): AiAlert[] {
  return rows(raw).map((a) => ({
    id: str(a.id),
    kind: str(a.kind),
    subject: str(a.subject),
    subjectLabel: str(a.subject_label, str(a.subject)),
    severity: pick(a.severity, ['info', 'warning', 'critical'] as const, 'info'),
    details: asRec(a.details),
    status: pick(a.status, ['open', 'reviewed', 'dismissed'] as const, 'open'),
    firstSeen: str(a.first_seen),
    lastSeen: str(a.last_seen),
    occurrences: num(a.occurrences, 1),
  }))
}

const d = (a: AiAlert, k: string): number => num(a.details[k])

/** Título y explicación en español. Una anomalía NO es un abuso: el texto siempre pide revisar antes de restringir. */
export function alertText(a: AiAlert): { title: string; body: string } {
  switch (a.kind) {
    case 'cost_spike':
      return { title: 'El coste ha subido de golpe', body: `En las últimas 24 horas el coste estimado es ${formatMoney(d(a, 'cost_24h'))}, frente a una media de ${formatMoney(d(a, 'daily_avg_prev7'))} al día la semana anterior.` }
    case 'calls_spike':
      return { title: 'Muchas más llamadas de lo normal', body: `En la última hora hubo ${d(a, 'calls_1h')} llamadas (media horaria anterior: ${formatCount(d(a, 'hourly_avg_prev24h'))}).` }
    case 'family_outlier':
      return { title: `Consumo excepcional de la familia ${a.subjectLabel}`, body: `${d(a, 'calls_24h')} llamadas en 24 horas: el ${d(a, 'share_pct')} % de todas las de PEPA.` }
    case 'function_growth':
      return { title: `Crece de golpe: ${a.subjectLabel}`, body: `${d(a, 'calls_24h')} llamadas en 24 horas (media diaria anterior: ${formatCount(d(a, 'daily_avg_prev7'))}).` }
    case 'excessive_retries':
      return { title: `Demasiados reintentos: ${a.subjectLabel}`, body: `${d(a, 'with_retries')} de ${d(a, 'calls_24h')} llamadas (${d(a, 'ratio_pct')} %) tuvieron que reintentarse.` }
    case 'possible_loop':
      return { title: `Posible bucle: ${a.subjectLabel}`, body: `${d(a, 'calls_10min')} llamadas de la misma función en 10 minutos. Revísalo antes de tomar ninguna medida: puede ser un uso legítimo.` }
    case 'provider_errors':
      return { title: `Errores repetidos del proveedor (${a.subjectLabel})`, body: `${d(a, 'failed_1h')} llamadas fallidas en la última hora.` }
    case 'near_limit': {
      const pct = d(a, 'pct')
      return { title: pct >= 100 ? 'Límite alcanzado' : 'Cerca de un límite', body: `Se ha usado el ${pct} % (${formatCount(d(a, 'used'))} de ${formatCount(d(a, 'max'))}). Modo: ${LIMIT_MODE_LABEL[pick(a.details.mode, ['observe', 'warn', 'block'] as const, 'warn')]}.` }
    }
    default:
      return { title: 'Aviso de consumo', body: 'Revisa el consumo de IA.' }
  }
}

export const ALERT_SEVERITY_LABEL: Record<AiAlert['severity'], string> = { info: 'Informativa', warning: 'Atención', critical: 'Importante' }

export const THRESHOLD_FIELDS: { key: string; label: string; help: string; unit: string }[] = [
  { key: 'cost_spike_factor', label: 'Subida de coste (veces la media)', help: 'Avisa si el coste de 24 h supera esta cantidad de veces la media diaria anterior.', unit: '×' },
  { key: 'cost_min_usd', label: 'Coste mínimo para avisar', help: 'No avisa de subidas por debajo de este coste (US$ estimados).', unit: 'US$' },
  { key: 'calls_spike_factor', label: 'Subida de llamadas (veces la media)', help: 'Avisa si las llamadas de la última hora superan esta cantidad de veces la media horaria.', unit: '×' },
  { key: 'calls_min', label: 'Llamadas mínimas para avisar', help: 'No avisa si en la última hora hay menos llamadas.', unit: 'llamadas' },
  { key: 'family_share_pct', label: 'Parte excepcional de una familia', help: 'Avisa si una familia concentra este porcentaje de las llamadas de 24 h.', unit: '%' },
  { key: 'family_min_calls', label: 'Llamadas mínimas de la familia', help: 'No avisa de familias con menos llamadas.', unit: 'llamadas' },
  { key: 'function_growth_factor', label: 'Crecimiento de una función (veces)', help: 'Avisa si una función multiplica su media diaria.', unit: '×' },
  { key: 'function_min_calls', label: 'Llamadas mínimas de la función', help: 'No avisa de funciones con menos llamadas.', unit: 'llamadas' },
  { key: 'retry_ratio_pct', label: 'Reintentos excesivos', help: 'Avisa si este porcentaje de las llamadas de una función se reintenta.', unit: '%' },
  { key: 'retry_min_calls', label: 'Llamadas mínimas para medir reintentos', help: 'No evalúa funciones con menos llamadas.', unit: 'llamadas' },
  { key: 'loop_calls_10min', label: 'Posible bucle (llamadas en 10 min)', help: 'Avisa si una misma función y familia llega a esta cifra en 10 minutos.', unit: 'llamadas' },
  { key: 'provider_errors_1h', label: 'Errores del proveedor en una hora', help: 'Avisa si el proveedor falla esta cantidad de veces en una hora.', unit: 'fallos' },
]

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Tarifas, planes, registro de cambios
// ---------------------------------------------------------------------------------------------------------------------------------------------------
export interface AiPrice {
  id: string
  provider: string
  model: string
  modality: string
  inputPerMtok: number
  outputPerMtok: number
  currency: string
  validFrom: string
  validTo: string | null
  kind: 'confirmed' | 'estimated'
  source: string
}

export function toAiPrices(raw: unknown): AiPrice[] {
  return rows(raw).map((p) => ({
    id: str(p.id),
    provider: str(p.provider),
    model: str(p.model),
    modality: str(p.modality, 'text'),
    inputPerMtok: num(p.input_per_mtok),
    outputPerMtok: num(p.output_per_mtok),
    currency: str(p.currency, 'USD'),
    validFrom: str(p.valid_from),
    validTo: strOrNull(p.valid_to),
    kind: p.kind === 'confirmed' ? 'confirmed' : 'estimated',
    source: str(p.source),
  }))
}

export interface AiPlan {
  id: string
  name: string
  monthlyPriceEur: number | null
  active: boolean
  note: string | null
  quotas: { purpose: string; period: LimitPeriod; metric: LimitMetric; maxValue: number }[]
  families: number
}

export function toAiPlans(raw: unknown): { enforced: boolean; plans: AiPlan[] } {
  const r = asRec(raw)
  return {
    enforced: bool(r.enforced),
    plans: rows(r.plans).map((p) => ({
      id: str(p.id),
      name: str(p.name),
      monthlyPriceEur: typeof p.monthly_price_eur === 'number' ? p.monthly_price_eur : p.monthly_price_eur !== null && p.monthly_price_eur !== undefined && Number.isFinite(Number(p.monthly_price_eur)) ? Number(p.monthly_price_eur) : null,
      active: p.active !== false,
      note: strOrNull(p.note),
      quotas: rows(p.quotas).map((q) => ({ purpose: str(q.purpose, '*'), period: pick(q.period, ['day', 'month'] as const, 'month'), metric: pick(q.metric, ['cost', 'calls'] as const, 'calls'), maxValue: num(q.max_value) })),
      families: num(p.families),
    })),
  }
}

export interface AiAuditRow {
  at: string
  admin: string
  action: string
  subject: string
  before: unknown
  after: unknown
}

export function toAiAudit(raw: unknown): AiAuditRow[] {
  return rows(raw).map((a) => ({ at: str(a.at), admin: str(a.admin, 'Administración'), action: str(a.action), subject: str(a.subject), before: a.before ?? null, after: a.after ?? null }))
}

const AUDIT_TEXT: Record<string, string> = {
  global: 'Interruptor general de la IA',
  function: 'Interruptor de una función',
  limit_set: 'Límite guardado',
  limit_delete: 'Límite eliminado',
  exception_set: 'Excepción de una familia guardada',
  exception_delete: 'Excepción de una familia eliminada',
  alert_reviewed: 'Alerta marcada como revisada',
  alert_dismissed: 'Alerta descartada',
  alert_open: 'Alerta reabierta',
  thresholds: 'Umbrales de alertas cambiados',
  price_add: 'Tarifa añadida',
  plan_upsert: 'Plan guardado',
  quota_set: 'Cuota de un plan guardada',
  quota_delete: 'Cuota de un plan eliminada',
}
export const auditActionText = (a: string): string => AUDIT_TEXT[a] ?? 'Cambio en el control de IA'

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Proyección
// ---------------------------------------------------------------------------------------------------------------------------------------------------
export interface ProjectionBase {
  days: number
  dataDays: number
  calls: number
  activeFamilies: number
  totalFamilies: number
  enough: boolean
  byModule: { module: AiModuleId; calls: number; cost: number; tokensIn: number; tokensOut: number }[]
}

export function toProjectionBase(raw: unknown): ProjectionBase {
  const r = asRec(raw)
  return {
    days: num(r.days, 30),
    dataDays: num(r.data_days),
    calls: num(r.calls),
    activeFamilies: num(r.active_families),
    totalFamilies: num(r.total_families),
    enough: bool(r.enough),
    byModule: rows(r.by_module).map((m) => ({ module: asModule(m.module), calls: num(m.calls), cost: num(m.cost), tokensIn: num(m.tokens_in), tokensOut: num(m.tokens_out) })),
  }
}

/** Coste mensual por familia ACTIVA y módulo observado (US$): cost / días medidos × 30 / familias activas. */
export function perActiveFamilyMonthly(base: ProjectionBase): Record<string, number> {
  const out: Record<string, number> = {}
  if (base.activeFamilies <= 0 || base.days <= 0) return out
  for (const m of base.byModule) out[m.module] = (m.cost / base.days) * 30 / base.activeFamilies
  return out
}

export type ScenarioId = 'low' | 'mid' | 'high'
export const SCENARIOS: { id: ScenarioId; label: string; multiplier: number; help: string }[] = [
  { id: 'low', label: 'Consumo bajo', multiplier: 0.5, help: 'Hipótesis: la mitad de lo observado.' },
  { id: 'mid', label: 'Consumo medio', multiplier: 1, help: 'Lo observado, sin cambios.' },
  { id: 'high', label: 'Consumo alto', multiplier: 2, help: 'Hipótesis: el doble de lo observado.' },
]

export const FAMILY_PRESETS = [1000, 10000, 100000]

export interface ProjectionInput {
  families: number
  /** Fracción de familias que usan IA (0–1). */
  activeShare: number
  /** Coste mensual por familia activa y módulo (US$) — real observado o hipótesis manual. */
  perActiveFamily: Record<string, number>
  multiplier: number
  /** Cambio de modelo: coste nuevo / coste actual (1 = sin cambio). */
  priceFactor: number
  /** Tope mensual por familia (US$) para ver su impacto; null = sin tope. Aproximación: aplica el tope a la media, no a cada familia. */
  capPerFamily: number | null
}

export interface ProjectionResult {
  monthly: number
  yearly: number
  perFamily: number
  perActiveFamily: number
  activeFamilies: number
  byModule: { module: string; monthly: number }[]
  capped: boolean
  savedByCap: number
}

export function projectCosts(i: ProjectionInput): ProjectionResult {
  const fin = (n: number, d: number): number => (Number.isFinite(n) ? n : d)
  const families = Math.max(0, Math.round(fin(i.families, 0)))
  const active = families * Math.min(Math.max(fin(i.activeShare, 0), 0), 1)
  const factor = Math.max(fin(i.multiplier, 0), 0) * Math.max(fin(i.priceFactor, 1), 0)
  const perModule = Object.entries(i.perActiveFamily).map(([module, c]) => ({ module, perFam: Math.max(c, 0) * factor }))
  const rawPerFam = perModule.reduce((s, m) => s + m.perFam, 0)
  const capped = i.capPerFamily !== null && i.capPerFamily >= 0 && rawPerFam > i.capPerFamily
  const scale = capped && rawPerFam > 0 ? (i.capPerFamily as number) / rawPerFam : 1
  const perFam = rawPerFam * scale
  const monthly = perFam * active
  return {
    monthly,
    yearly: monthly * 12,
    perFamily: families > 0 ? monthly / families : 0,
    perActiveFamily: perFam,
    activeFamilies: active,
    byModule: perModule.map((m) => ({ module: m.module, monthly: m.perFam * scale * active })),
    capped,
    savedByCap: (rawPerFam - perFam) * active,
  }
}

/** Factor de precio al cambiar de modelo, con la mezcla real de tokens (si no hay tokens, 1 token de entrada por 1 de salida). */
export function priceFactorFor(current: { in: number; out: number }, next: { in: number; out: number }, tokensIn: number, tokensOut: number): number {
  const tin = tokensIn > 0 || tokensOut > 0 ? tokensIn : 1
  const tout = tokensIn > 0 || tokensOut > 0 ? tokensOut : 1
  const cur = tin * current.in + tout * current.out
  const nxt = tin * next.in + tout * next.out
  return cur > 0 ? nxt / cur : 1
}

export interface MarginInput {
  /** Precio de la suscripción (EUR/mes): lo introduce una persona; PEPA no tiene tarifas comerciales definidas. */
  priceEur: number | null
  /** Porcentaje de familias que pagan (0–1). */
  payingShare: number | null
  /** EUR por 1 US$: lo introduce una persona (no se inventa ningún tipo de cambio). */
  eurPerUsd: number | null
  families: number
  monthlyCostUsd: number
}

/** Margen mensual de IA = ingresos − coste. Devuelve null mientras falte algún dato (no se inventa ninguno). */
export function marginOf(i: MarginInput): { revenueEur: number; costEur: number; marginEur: number; marginPct: number } | null {
  if (i.priceEur === null || i.payingShare === null || i.eurPerUsd === null || !(i.priceEur >= 0) || !(i.eurPerUsd > 0)) return null
  const revenueEur = i.priceEur * i.families * Math.min(Math.max(i.payingShare, 0), 1)
  const costEur = i.monthlyCostUsd * i.eurPerUsd
  const marginEur = revenueEur - costEur
  return { revenueEur, costEur, marginEur, marginPct: revenueEur > 0 ? (marginEur / revenueEur) * 100 : 0 }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------------------------------------------------------------------------------
export function formatMoney(v: number): string {
  const abs = Math.abs(v)
  const digits = abs === 0 ? 2 : abs < 0.01 ? 5 : abs < 1 ? 4 : 2
  return `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: digits === 5 ? 4 : Math.min(digits, 2), maximumFractionDigits: digits }).format(v)} US$`
}

export function formatEur(v: number): string {
  return `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)} €`
}

export function formatCount(v: number): string {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: v >= 100 ? 0 : 1 }).format(v)
}

export function formatTokens(v: number): string {
  if (v >= 1_000_000) return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(v / 1_000_000)} M`
  if (v >= 1_000) return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(v / 1_000)} k`
  return String(Math.round(v))
}

export interface Change {
  text: string
  dir: 'up' | 'down' | 'same' | 'new'
}

/** Variación respecto al periodo anterior, en texto. «Nuevo» si antes no había nada. */
export function changeOf(cur: number, prev: number): Change {
  if (prev <= 0) return cur > 0 ? { text: 'Nuevo', dir: 'new' } : { text: 'Sin cambios', dir: 'same' }
  const pct = ((cur - prev) / prev) * 100
  if (Math.abs(pct) < 1) return { text: 'Sin cambios', dir: 'same' }
  return { text: `${pct > 0 ? '+' : '−'}${Math.round(Math.abs(pct))} %`, dir: pct > 0 ? 'up' : 'down' }
}

export function shareOf(part: number, total: number): string {
  return total > 0 ? `${Math.round((part / total) * 100)} %` : '0 %'
}

export function costKindNote(t: AiTotals): string {
  if (t.calls === 0) return 'Todavía no hay llamadas en este periodo.'
  const parts: string[] = []
  if (t.confirmedCalls > 0) parts.push(`${t.confirmedCalls} con coste confirmado`)
  if (t.estimatedCalls > 0) parts.push(`${t.estimatedCalls} con coste estimado`)
  if (t.unpricedCalls > 0) parts.push(`${t.unpricedCalls} sin coste calculable`)
  return `${parts.join(' · ')}. Los importes son estimaciones a tarifa pública: no son la factura del proveedor.`
}

export function originLabel(o: string): string {
  return o === 'automatic' ? 'Procesos automáticos de PEPA' : o === 'admin' ? 'Administración' : 'Familias'
}

export function shortDay(day: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(day)
  return m ? `${m[2]}/${m[1]}` : day
}

export function aiErrorText(e: unknown): string {
  const raw = typeof e === 'object' && e !== null ? String((e as { message?: unknown }).message ?? '') : String(e ?? '')
  if (/NOT_ADMIN/.test(raw)) return 'Solo las personas administradoras de PEPA pueden hacer esto.'
  if (/BAD_RANGE/.test(raw)) return 'El intervalo de fechas no es válido (máximo 400 días).'
  if (/BAD_REQUEST/.test(raw)) return 'Los datos no son válidos. Revísalos.'
  if (/could not find the function|PGRST202|does not exist/i.test(raw)) return 'El Centro de Control de IA todavía no está disponible en la base de datos (falta aplicar la migración 0335).'
  return 'Algo ha fallado. Inténtalo de nuevo.'
}
