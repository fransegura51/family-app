// Comunidad — programa editorial semanal con IA y «Rectificar con Pepa»: tipos, lectores de las respuestas del servidor, textos en español y diferencias
// (palabras, recetas, opciones de encuesta y platos del menú). Lógica PURA (sin red ni React) para poder probarla sin pantalla.
//
// Reglas que esta capa no puede romper: generar NO publica (solo crea borradores), aceptar una rectificación NO publica (crea una versión nueva y el
// elemento vuelve a «Pendiente de revisar») y todas las horas se enseñan en hora peninsular española (Europe/Madrid).
import { madridParts, madridWallToInstant, toDate } from '@/domain/communityAdmin'

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const asRec = (v: unknown): Rec => (isRec(v) ? v : {})
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d)
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const bool = (v: unknown): boolean => v === true
const rows = (v: unknown): Rec[] => asArr(v).filter(isRec)

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Los tres tipos del programa
// ---------------------------------------------------------------------------------------------------------------------------------------------------
// `toggle` = valor de p_kind del interruptor (la encuesta es 'polls'); `key` = clave en el estado devuelto (la encuesta es 'poll'); `generate` = tipo de «Generar ahora».
export type EditorialKey = 'articles' | 'poll' | 'menu'
export type EditorialToggleKind = 'articles' | 'polls' | 'menu'

export interface EditorialKindInfo {
  key: EditorialKey
  toggle: EditorialToggleKind
  generate: EditorialKey
  label: string
  icon: string
  expected: number
  /** Cuánto puede tardar «Generar ahora» (para avisar de la espera). */
  slow: boolean
  /** Qué se prepara, en una frase. */
  what: string
}

export const EDITORIAL_KINDS: EditorialKindInfo[] = [
  { key: 'articles', toggle: 'articles', generate: 'articles', label: 'Artículos', icon: '📰', expected: 7, slow: true, what: '7 artículos por semana, uno por día (lunes a domingo), que salen a las 10:00 de su día una vez aprobados.' },
  { key: 'poll', toggle: 'polls', generate: 'poll', label: 'Encuesta', icon: '🗳️', expected: 1, slow: false, what: '1 encuesta por semana: abre el sábado y cierra el domingo a las 17:00 (hora peninsular).' },
  { key: 'menu', toggle: 'menu', generate: 'menu', label: 'Menú semanal', icon: '🍽️', expected: 1, slow: true, what: '1 menú semanal, que se publica el sábado para la semana siguiente.' },
]

export const EDITORIAL_TEXT = {
  intro:
    'Cada miércoles a las 08:00 (hora de Madrid) Pepa prepara por adelantado, como BORRADORES, los artículos de la semana siguiente, la encuesta del sábado y el menú semanal. Generar nunca publica nada: solo una persona de la administración, aprobando, lo hace salir.',
  active: 'Activa: Pepa preparará borradores cada miércoles.',
  paused: 'En pausa: no se prepararán borradores nuevos; los que ya existen, y lo aprobado o programado, no cambian.',
  menuAutopublishTitle: 'Publicar a su hora el menú ya aprobado',
  menuAutopublishHelp:
    'Es distinto de la generación: la generación puede estar activa y esto desactivado, o al revés. Esto solo decide si un menú que YA has aprobado sale solo el sábado a las 10:00 (hora de Madrid) o se queda programado sin salir.',
  menuAutopublishOn: 'Activada: un menú aprobado sale solo el sábado a las 10:00 (hora de Madrid).',
  menuAutopublishOff: 'Desactivada: un menú aprobado queda programado pero no sale solo hasta que se active esto.',
  menuAutopublishConfirm: 'Un menú que apruebes saldrá solo el sábado a las 10:00 (hora de Madrid). Sigue necesitando tu aprobación antes; nada se publica sin revisión.',
  generateConfirm: 'Se prepararán borradores con IA; no se publica nada.',
  generateSlow: 'Puede tardar hasta unos 2 minutos. No cierres esta pantalla mientras trabaja.',
  generateWorking: 'Pepa está preparando los borradores… Puede tardar hasta unos 2 minutos. No cierres esta pantalla.',
  neverPublishes: 'Ningún botón de este panel publica: aprobar y publicar se hace, como siempre, en la tarjeta de cada borrador.',
  reviseNeverPublishes:
    'Aceptar una rectificación NUNCA publica: se guarda como versión nueva (la anterior se conserva) y el borrador vuelve a «Pendiente de revisar». Tendrás que aprobarlo de nuevo.',
} as const

export function toggleStateText(enabled: boolean): string {
  return enabled ? EDITORIAL_TEXT.active : EDITORIAL_TEXT.paused
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Fechas con nombre de día (hora de Madrid)
// ---------------------------------------------------------------------------------------------------------------------------------------------------
const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
export const WEEKDAY_NAMES: readonly string[] = WEEKDAYS
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// «2026-11-03» → Date a mediodía UTC (un día de calendario sin zona horaria: nunca se corre de día).
export function parseDay(day: string | null | undefined): Date | null {
  if (!day || !/^\d{4}-\d{2}-\d{2}/.test(day)) return null
  const d = new Date(`${day.slice(0, 10)}T12:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function dayToIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function addDays(day: string, n: number): string {
  const d = parseDay(day)
  if (!d) return day
  d.setUTCDate(d.getUTCDate() + n)
  return dayToIso(d)
}

/** Lunes (AAAA-MM-DD) de la semana de un día de calendario. */
export function mondayOf(day: string): string {
  const d = parseDay(day)
  if (!d) return day
  const wd = (d.getUTCDay() + 6) % 7 // 0 = lunes
  return addDays(day, -wd)
}

/** Posición del día en la semana: 0 = lunes … 6 = domingo. */
export function weekdayIndex(day: string): number {
  const d = parseDay(day)
  return d ? (d.getUTCDay() + 6) % 7 : 0
}

/** «lunes 3 nov» (día de calendario, sin hora). */
export function dayShort(day: string | null): string {
  const d = day ? parseDay(day) : null
  if (!d) return 'sin fecha'
  return `${WEEKDAYS[(d.getUTCDay() + 6) % 7]} ${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`
}

/** «3 de noviembre» (sin año). */
export function dayLong(day: string | null): string {
  const d = day ? parseDay(day) : null
  return d ? `${d.getUTCDate()} de ${MONTHS_LONG[d.getUTCMonth()]}` : 'sin fecha'
}

/** «Semana del 9 al 15 de noviembre» a partir del lunes. */
export function weekRangeText(monday: string | null): string {
  const a = monday ? parseDay(monday) : null
  if (!a || !monday) return 'Semana sin fecha'
  const end = parseDay(addDays(monday, 6))!
  if (a.getUTCMonth() === end.getUTCMonth()) return `Semana del ${a.getUTCDate()} al ${end.getUTCDate()} de ${MONTHS_LONG[end.getUTCMonth()]}`
  return `Semana del ${a.getUTCDate()} de ${MONTHS_LONG[a.getUTCMonth()]} al ${end.getUTCDate()} de ${MONTHS_LONG[end.getUTCMonth()]}`
}

/** Instante → «miércoles 5 nov, 08:00» en hora de Madrid. */
export function formatMadridSlot(v: unknown): string {
  const d = toDate(v)
  if (!d) return 'sin fecha'
  const p = madridParts(d)
  const hh = String(p.hour).padStart(2, '0')
  const mm = String(p.minute).padStart(2, '0')
  return `${WEEKDAYS[p.isoWeekday - 1]} ${p.day} ${MONTHS_SHORT[p.month - 1]}, ${hh}:${mm}`
}

/** Instante → «lunes 3 de noviembre a las 10:00» (hora de Madrid). */
export function formatMadridAt(v: unknown): string {
  const d = toDate(v)
  if (!d) return 'sin fecha'
  const p = madridParts(d)
  return `${WEEKDAYS[p.isoWeekday - 1]} ${p.day} de ${MONTHS_LONG[p.month - 1]} a las ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}

/** Día de calendario de Madrid de un instante (AAAA-MM-DD). */
export function madridDay(v: unknown): string | null {
  const d = toDate(v)
  if (!d) return null
  const p = madridParts(d)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** Lo que se muestra al aprobar un artículo del programa: «Aprobado: se publicará el lunes 3 de noviembre a las 10:00 (hora de Madrid).» */
export function scheduledApprovalText(publishAt: unknown): string {
  return `Aprobado: se publicará el ${formatMadridAt(publishAt)} (hora de Madrid).`
}

// Fecha y hora (hora de pared de Madrid) → instante ISO, validando que cae entre ahora y 60 días (la misma regla que el servidor). Devuelve el mensaje si no vale.
export function parseScheduleInput(date: string, time: string, now: Date = new Date()): { ok: true; iso: string } | { ok: false; message: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const t = /^(\d{2}):(\d{2})$/.exec(time)
  if (!m || !t) return { ok: false, message: 'Elige el día y la hora.' }
  const at = madridWallToInstant(Number(m[1]), Number(m[2]), Number(m[3]), Number(t[1]), Number(t[2]))
  if (Number.isNaN(at.getTime())) return { ok: false, message: 'La fecha no es válida.' }
  if (at.getTime() < now.getTime() - 60_000) return { ok: false, message: 'Esa hora ya ha pasado. Elige una futura.' }
  if (at.getTime() > now.getTime() + 60 * 24 * 3600_000) return { ok: false, message: 'Solo se puede programar dentro de los próximos 60 días.' }
  return { ok: true, iso: at.toISOString() }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Estado del programa (community_admin_editorial_status)
// ---------------------------------------------------------------------------------------------------------------------------------------------------
export type RunStatus = 'running' | 'ok' | 'partial' | 'error' | 'skipped'
export type RunTrigger = 'schedule' | 'manual'

export const RUN_STATUS_TEXT: Record<RunStatus, string> = {
  running: 'En curso',
  ok: 'Correcta',
  partial: 'Parcial (faltan borradores)',
  error: 'Con error',
  skipped: 'Omitida (no había nada que preparar)',
}

const asRunStatus = (v: unknown): RunStatus => (v === 'running' || v === 'ok' || v === 'partial' || v === 'error' || v === 'skipped' ? v : 'error')

export interface EditorialRun {
  id: string
  kind: EditorialKey
  trigger: RunTrigger
  weekStart: string | null
  status: RunStatus
  startedAt: string | null
  finishedAt: string | null
  itemsCreated: number
  itemsExpected: number
  attempt: number
  error: string | null
}

const asKey = (v: unknown): EditorialKey => (v === 'poll' || v === 'menu' ? v : 'articles')

export function toRun(r: Rec): EditorialRun | null {
  if (str(r.id) === '') return null
  return {
    id: str(r.id),
    kind: asKey(r.kind),
    trigger: r.trigger === 'manual' ? 'manual' : 'schedule',
    weekStart: strOrNull(r.weekStart),
    status: asRunStatus(r.status),
    startedAt: strOrNull(r.startedAt),
    finishedAt: strOrNull(r.finishedAt),
    itemsCreated: num(r.itemsCreated),
    itemsExpected: num(r.itemsExpected),
    attempt: num(r.attempt, 1),
    error: strOrNull(r.error),
  }
}

export function toRuns(raw: unknown): EditorialRun[] {
  return rows(raw)
    .map(toRun)
    .filter((r): r is EditorialRun => r !== null)
}

// El servidor guarda un código y un motivo corto («TIMEOUT: la ejecución no terminó.»). Se enseña solo la frase y nunca más de 160 letras.
const RUN_ERROR_PHRASES: Record<string, string> = {
  TIMEOUT: 'La ejecución no terminó a tiempo.',
  AI_FAILED: 'La IA no ha podido preparar el contenido.',
  AI_NOT_ALLOWED: 'La IA no estaba disponible (apagada o tope diario alcanzado).',
  INVALID_OUTPUT: 'La IA devolvió un contenido que no era válido.',
}

export function runErrorText(error: string | null | undefined): string {
  const raw = (error ?? '').trim()
  if (!raw) return ''
  const m = /^([A-Z][A-Z_]{2,}):\s*(.*)$/s.exec(raw)
  if (m) {
    const known = RUN_ERROR_PHRASES[m[1]]
    if (known) return known
    return m[2].trim().slice(0, 160)
  }
  const known = RUN_ERROR_PHRASES[raw]
  if (known) return known
  return raw.slice(0, 160)
}

// «Correcta · miércoles 28 oct, 08:07 · 7 de 7 borradores · programada». Con motivo corto si lo hubo.
export function runSummary(run: EditorialRun): string {
  const parts = [RUN_STATUS_TEXT[run.status], run.startedAt ? formatMadridSlot(run.startedAt) : 'sin fecha']
  if (run.status !== 'running') parts.push(`${run.itemsCreated} de ${run.itemsExpected} borradores`)
  parts.push(run.trigger === 'manual' ? 'manual' : 'programada')
  const err = runErrorText(run.error)
  return `${parts.join(' · ')}${err ? `. Motivo: ${err}` : ''}`
}

export function runLine(run: EditorialRun): string {
  return `Última ejecución: ${runSummary(run)}`
}

export interface EditorialDrafts {
  proposed: number
  approved: number
  published: number
  inTargetWeek: number
}

export interface EditorialKindState {
  key: EditorialKey
  enabled: boolean
  weekStart: string | null
  nextRun: string | null
  dueNow: boolean
  cycleDone: boolean
  failedAttempts: number
  lastRun: EditorialRun | null
  expected: number
  drafts: EditorialDrafts
}

export interface EditorialRecentError {
  id: string
  kind: EditorialKey
  trigger: RunTrigger
  weekStart: string | null
  status: RunStatus
  startedAt: string | null
  error: string | null
  itemsCreated: number
  itemsExpected: number
}

export interface EditorialStatus {
  launched: boolean
  cycle: { runAt: string | null; due: boolean; monday: string | null }
  kinds: Record<EditorialKey, EditorialKindState>
  menuAutopublish: boolean
  ai: { enabled: boolean; dailyCap: number; usedToday: number }
  errors: EditorialRecentError[]
}

function toKindState(key: EditorialKey, raw: unknown): EditorialKindState {
  const r = asRec(raw)
  const d = asRec(r.drafts)
  const info = EDITORIAL_KINDS.find((k) => k.key === key)!
  const last = isRec(r.lastRun) ? toRun({ kind: key, ...asRec(r.lastRun) }) : null
  return {
    key,
    enabled: bool(r.enabled),
    weekStart: strOrNull(r.weekStart),
    nextRun: strOrNull(r.nextRun),
    dueNow: bool(r.dueNow),
    cycleDone: bool(r.cycleDone),
    failedAttempts: num(r.failedAttempts),
    lastRun: last,
    expected: num(r.expected, info.expected),
    drafts: { proposed: num(d.proposed), approved: num(d.approved), published: num(d.published), inTargetWeek: num(d.inTargetWeek) },
  }
}

export function toEditorialStatus(raw: unknown): EditorialStatus {
  const r = asRec(raw)
  const kinds = asRec(r.kinds)
  const cycle = asRec(r.cycle)
  const ai = asRec(r.ai)
  return {
    launched: bool(r.launched),
    cycle: { runAt: strOrNull(cycle.runAt), due: bool(cycle.due), monday: strOrNull(cycle.monday) },
    kinds: { articles: toKindState('articles', kinds.articles), poll: toKindState('poll', kinds.poll), menu: toKindState('menu', kinds.menu) },
    menuAutopublish: bool(r.menuAutopublish),
    // La IA se da por encendida salvo que el servidor diga lo contrario.
    ai: { enabled: ai.enabled !== false, dailyCap: num(ai.dailyCap), usedToday: num(ai.usedToday) },
    errors: rows(r.errors)
      .filter((e) => str(e.id) !== '')
      .map((e) => ({
        id: str(e.id),
        kind: asKey(e.kind),
        trigger: e.trigger === 'manual' ? ('manual' as const) : ('schedule' as const),
        weekStart: strOrNull(e.weekStart),
        status: asRunStatus(e.status),
        startedAt: strOrNull(e.startedAt),
        error: strOrNull(e.error),
        itemsCreated: num(e.itemsCreated),
        itemsExpected: num(e.itemsExpected),
      })),
  }
}

/** Texto de la próxima ejecución, con aviso de «toca ahora» y de pausa. */
export function nextRunLines(k: EditorialKindState): string[] {
  const lines: string[] = []
  if (k.cycleDone) lines.push(`Esta semana ya está preparado. Próxima ejecución programada: ${formatMadridSlot(k.nextRun)} (hora de Madrid).`)
  else if (k.failedAttempts >= 3) lines.push(`Tras ${k.failedAttempts} intentos fallidos no se reintenta hasta la próxima semana (${formatMadridSlot(k.nextRun)}, hora de Madrid). Puedes usar «Generar ahora».`)
  else lines.push(`Próxima ejecución programada: ${formatMadridSlot(k.nextRun)} (hora de Madrid).`)
  if (k.dueNow && k.enabled) lines.push('Toca ahora: se preparará en la próxima hora en punto y 7 minutos.')
  if (!k.enabled) lines.push('No se ejecutará mientras esté en pausa.')
  return lines
}

export function draftsLine(k: EditorialKindState): string {
  const n = k.drafts.inTargetWeek
  return `Borradores de la semana (${weekRangeText(k.weekStart).replace('Semana del ', 'del ')}): ${n} de ${k.expected}. En total generados por Pepa: ${k.drafts.proposed} pendientes de revisar, ${k.drafts.approved} aprobados, ${k.drafts.published} publicados.`
}

export function aiLine(ai: EditorialStatus['ai']): string {
  if (!ai.enabled) return 'La IA está apagada: «Generar ahora» y «Rectificar con Pepa» no funcionarán hasta que se encienda.'
  return `IA usada hoy: ${ai.usedToday} de ${ai.dailyCap} llamadas permitidas al día.`
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Programa de la semana (community_admin_editorial_items)
// ---------------------------------------------------------------------------------------------------------------------------------------------------
export type EditorialItemKind = 'article' | 'poll' | 'menu'
export type EditorialItemStatus = 'proposed' | 'approved' | 'published' | 'rejected'

export interface EditorialItemRow {
  id: string
  kind: EditorialItemKind
  title: string
  status: EditorialItemStatus
  version: number
  slotDate: string
  topicLabel: string | null
  publishAt: string | null
  publishError: string | null
  tier: number | null
}

export function toEditorialItems(raw: unknown): EditorialItemRow[] {
  return rows(raw)
    .filter((r) => str(r.id) !== '' && strOrNull(r.slotDate) !== null)
    .map((r) => ({
      id: str(r.id),
      kind: r.kind === 'poll' || r.kind === 'menu' ? (r.kind as EditorialItemKind) : ('article' as const),
      title: str(r.title),
      status: r.status === 'approved' || r.status === 'published' || r.status === 'rejected' ? (r.status as EditorialItemStatus) : ('proposed' as const),
      version: num(r.version, 1),
      slotDate: str(r.slotDate).slice(0, 10),
      topicLabel: strOrNull(r.topicLabel),
      publishAt: strOrNull(r.publishAt),
      publishError: strOrNull(r.publishError),
      tier: typeof r.tier === 'number' ? r.tier : null,
    }))
}

export function itemStatusText(i: Pick<EditorialItemRow, 'status' | 'publishAt' | 'publishError' | 'kind'>): string {
  if (i.publishError && i.status !== 'published') return 'Error de publicación'
  if (i.status === 'published') return 'Publicado'
  if (i.status === 'approved') return i.publishAt ? `Aprobado · programado para el ${formatMadridAt(i.publishAt)}` : 'Aprobado'
  if (i.status === 'rejected') return 'Rechazado'
  return 'Borrador (pendiente de revisar)'
}

export interface ProgramDay {
  date: string
  weekday: string
  articles: EditorialItemRow[]
  polls: EditorialItemRow[]
}

export interface ProgramWeek {
  monday: string
  title: string
  days: ProgramDay[]
  menus: EditorialItemRow[]
}

// Agrupa los huecos por semana (lunes a domingo): cada día con su artículo (y, el sábado, la encuesta) y el menú de la semana. Semanas en orden; una semana solo
// aparece si tiene algo. `fromMonday` oculta las anteriores.
export function buildProgram(items: EditorialItemRow[], fromMonday?: string | null): ProgramWeek[] {
  const byWeek = new Map<string, EditorialItemRow[]>()
  for (const i of items) {
    if (i.status === 'rejected') continue
    const mon = mondayOf(i.slotDate)
    if (fromMonday && mon < fromMonday) continue
    byWeek.set(mon, [...(byWeek.get(mon) ?? []), i])
  }
  return [...byWeek.keys()]
    .sort()
    .map((monday) => {
      const list = byWeek.get(monday) ?? []
      return {
        monday,
        title: weekRangeText(monday),
        menus: list.filter((i) => i.kind === 'menu'),
        days: WEEKDAYS.map((weekday, n) => {
          const date = addDays(monday, n)
          return { date, weekday, articles: list.filter((i) => i.kind === 'article' && i.slotDate === date), polls: list.filter((i) => i.kind === 'poll' && i.slotDate === date) }
        }),
      }
    })
}

export const TIER_TEXT: Record<number, string> = {
  1: 'Tema nuevo (aún sin publicaciones)',
  2: 'Idea de las familias',
  3: 'Tema con pocas publicaciones',
  4: 'Otro tema',
}

export function tierText(tier: number | null | undefined): string | null {
  return tier != null && TIER_TEXT[tier] ? TIER_TEXT[tier] : null
}

/** «Para el lunes 3 nov · Tema nuevo (aún sin publicaciones)». Vacío si no es del programa. */
export function slotLine(slotDate: string | null | undefined, tier: number | null | undefined, kind: string): string | null {
  if (!slotDate) return null
  const day = dayShort(slotDate)
  const label = kind === 'menu' ? `Para la semana del ${dayShort(slotDate)}` : kind === 'poll' ? `Para el ${day} (abre ese día)` : `Para el ${day}`
  const t = kind === 'article' ? tierText(tier) : null
  return t ? `${label} · ${t}` : label
}


// ---------------------------------------------------------------------------------------------------------------------------------------------------
// «Generar ahora»: respuesta de la función de servidor
// ---------------------------------------------------------------------------------------------------------------------------------------------------
export type GenerateErrorCode = 'unauthorized' | 'not_admin' | 'busy' | 'bad_request' | 'ai_not_allowed' | 'internal_error' | 'network' | 'timeout'

export const GENERATE_ERROR_TEXT: Record<GenerateErrorCode, string> = {
  unauthorized: 'Tu sesión ha caducado. Vuelve a entrar en PEPA e inténtalo de nuevo.',
  not_admin: 'Solo la administración de Comunidad puede preparar borradores.',
  busy: 'Ya hay una preparación en curso de este tipo. Espera a que termine y pulsa «Actualizar».',
  bad_request: 'No se ha podido enviar la petición. Recarga la página e inténtalo de nuevo.',
  ai_not_allowed: 'La IA no está disponible ahora mismo (está apagada o se ha alcanzado el tope diario). No se ha creado nada.',
  internal_error: 'Algo ha fallado al preparar los borradores. Inténtalo de nuevo más tarde; el historial de ejecuciones guarda el detalle.',
  network: 'No se ha podido conectar. Comprueba la conexión e inténtalo de nuevo.',
  timeout: 'La preparación está tardando más de lo normal. Puede que haya terminado: pulsa «Actualizar» o mira el historial antes de volver a intentarlo.',
}

export function generateErrorText(code: string | null | undefined): string {
  return GENERATE_ERROR_TEXT[(code ?? '') as GenerateErrorCode] ?? GENERATE_ERROR_TEXT.internal_error
}

export interface GenerateResult {
  runId: string | null
  status: RunStatus
  created: number
  expected: number
  itemIds: string[]
  errorCount: number
}

export function toGenerateResult(raw: unknown): GenerateResult {
  const r = asRec(raw)
  return {
    runId: strOrNull(r.runId) ?? strOrNull(r.run_id),
    status: asRunStatus(r.status),
    created: num(r.created),
    expected: num(r.expected),
    itemIds: asArr(r.itemIds ?? r.item_ids).filter((x): x is string => typeof x === 'string'),
    errorCount: asArr(r.errors).length,
  }
}

export function generateResultText(r: GenerateResult): string {
  if (r.status === 'skipped') return 'No había nada que preparar: ese programa ya tiene todos sus borradores. No se ha publicado nada.'
  if (r.status === 'error') return `No se ha podido preparar ningún borrador. No se ha publicado nada. Inténtalo de nuevo; el historial de ejecuciones guarda el detalle.`
  if (r.status === 'partial' || r.created < r.expected) {
    return `Se han preparado ${r.created} de ${r.expected} borradores. Los demás no se han podido generar${r.errorCount > 0 ? ` (${r.errorCount} ${r.errorCount === 1 ? 'fallo' : 'fallos'}, detallados en el historial)` : ''}: puedes volver a pulsar «Generar ahora» para completar los que faltan. No se ha publicado nada.`
  }
  return `Listo: se han preparado ${r.created} de ${r.expected} borradores. No se ha publicado nada: revísalos en «Programa de la semana».`
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// «Rectificar con Pepa»
// ---------------------------------------------------------------------------------------------------------------------------------------------------
export const REVISE_MIN = 3
export const REVISE_MAX = 1000

export const REVISE_SHORTCUTS: { id: string; label: string; text: string; kinds: EditorialItemKind[] }[] = [
  { id: 'basico', label: 'Demasiado básico', text: 'Este artículo es demasiado básico; añade trucos que realmente ayuden.', kinds: ['article'] },
  { id: 'repetido', label: 'Quitar repeticiones', text: 'Elimina las explicaciones repetidas.', kinds: ['article', 'poll', 'menu'] },
  { id: 'variantes', label: 'Tres variantes', text: 'Incluye tres variantes de esta receta.', kinds: ['article'] },
  { id: 'cercano', label: 'Introducción más cercana', text: 'Haz la introducción más cercana.', kinds: ['article', 'poll', 'menu'] },
  { id: 'cantidades', label: 'Cantidades para cuatro', text: 'Corrige las cantidades para cuatro personas.', kinds: ['article', 'menu'] },
  { id: 'opciones', label: 'Opciones más claras', text: 'Haz las opciones más claras y distintas entre sí.', kinds: ['poll'] },
  { id: 'sencillo', label: 'Más sencillo y barato', text: 'Hazlo más sencillo y económico, con ingredientes de supermercado.', kinds: ['menu'] },
]

export function shortcutsFor(kind: EditorialItemKind): typeof REVISE_SHORTCUTS {
  return REVISE_SHORTCUTS.filter((s) => s.kinds.includes(kind))
}

export function validateInstruction(text: string): string | null {
  const t = text.trim()
  if (t.length < REVISE_MIN) return 'Escribe qué quieres cambiar (al menos unas palabras).'
  if (t.length > REVISE_MAX) return `La instrucción es demasiado larga (máximo ${REVISE_MAX} letras).`
  return null
}

export type ReviseErrorCode = 'unauthorized' | 'not_admin' | 'ai_not_allowed' | 'ai_failed' | 'invalid_output' | 'rate_limit' | 'not_available' | 'bad_request' | 'internal_error' | 'network' | 'timeout'

export const REVISE_ERROR_TEXT: Record<ReviseErrorCode, string> = {
  unauthorized: 'Tu sesión ha caducado. Vuelve a entrar en PEPA e inténtalo de nuevo. Tu instrucción sigue aquí.',
  not_admin: 'Solo la administración de Comunidad puede pedir rectificaciones.',
  ai_not_allowed: 'La IA no está disponible ahora mismo (está apagada o se ha alcanzado el tope diario). No se ha cambiado nada y tu instrucción sigue aquí.',
  ai_failed: 'Pepa no ha podido preparar la nueva versión. No se ha cambiado nada: puedes reintentarlo con la misma instrucción.',
  invalid_output: 'Pepa ha devuelto una versión que no es válida (por ejemplo, un menú incompleto). No se ha cambiado nada: reintenta o escribe la instrucción de otra forma.',
  rate_limit: 'Has pedido demasiadas rectificaciones seguidas. Espera un poco y vuelve a intentarlo.',
  not_available: 'Este elemento ya no se puede rectificar (se ha publicado, rechazado o ya no existe).',
  bad_request: 'No se ha podido enviar la petición. Revisa la instrucción e inténtalo de nuevo.',
  internal_error: 'Algo ha fallado. Inténtalo de nuevo; tu instrucción sigue aquí.',
  network: 'No se ha podido conectar. Comprueba la conexión e inténtalo de nuevo: tu instrucción sigue aquí.',
  timeout: 'Pepa está tardando demasiado. Inténtalo de nuevo: tu instrucción sigue aquí y no se ha cambiado nada.',
}

export function reviseErrorText(code: string | null | undefined): string {
  return REVISE_ERROR_TEXT[(code ?? '') as ReviseErrorCode] ?? REVISE_ERROR_TEXT.internal_error
}

export interface ReviseContent {
  title: string
  body: string
  payload: Rec
}

export interface QualityNote {
  code: string
  severity: 'error' | 'warning'
  message: string
  day: string | null
  meal: string | null
}

export interface ReviseProposal {
  revisionId: string
  notes: string
  before: ReviseContent
  result: ReviseContent
  quality: QualityNote[]
}

function toContent(raw: unknown): ReviseContent {
  const r = asRec(raw)
  return { title: str(r.title), body: str(r.body), payload: asRec(r.payload) }
}

export function toQuality(raw: unknown): QualityNote[] {
  return rows(raw)
    .filter((q) => str(q.message) !== '')
    .map((q) => ({
      code: str(q.code),
      severity: q.severity === 'error' ? ('error' as const) : ('warning' as const),
      message: str(q.message),
      day: q.day == null ? null : String(q.day),
      meal: strOrNull(q.meal),
    }))
}

export function toReviseProposal(raw: unknown): ReviseProposal {
  const r = asRec(raw)
  return {
    revisionId: str(r.revisionId) || str(r.revision_id),
    notes: str(r.notes),
    before: toContent(r.before),
    result: toContent(r.result),
    quality: toQuality(r.quality),
  }
}

export interface RevisionRow {
  id: string
  itemId: string
  baseVersion: number
  scope: 'item' | 'dish'
  instruction: string
  status: 'proposed' | 'accepted' | 'rejected' | 'stale'
  notes: string
  createdAt: string | null
  decidedAt: string | null
  before: ReviseContent
  result: ReviseContent
}

export const REVISION_STATUS_TEXT: Record<RevisionRow['status'], string> = {
  proposed: 'Sin decidir',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  stale: 'Obsoleta (el borrador cambió)',
}

export function toRevisions(raw: unknown): RevisionRow[] {
  return rows(raw)
    .filter((r) => str(r.id) !== '')
    .map((r) => ({
      id: str(r.id),
      itemId: str(r.itemId),
      baseVersion: num(r.baseVersion, 1),
      scope: r.scope === 'dish' ? ('dish' as const) : ('item' as const),
      instruction: str(r.instruction),
      status: r.status === 'accepted' || r.status === 'rejected' || r.status === 'stale' ? (r.status as RevisionRow['status']) : ('proposed' as const),
      notes: str(r.notes),
      createdAt: strOrNull(r.createdAt),
      decidedAt: strOrNull(r.decidedAt),
      before: toContent(r.before),
      result: toContent(r.result),
    }))
}

export interface ItemVersion {
  version: number
  title: string
  body: string
  editedAt: string | null
}

export function toItemVersions(raw: unknown): ItemVersion[] {
  return rows(raw)
    .filter((v) => typeof v.version === 'number')
    .map((v) => ({ version: num(v.version), title: str(v.title), body: str(v.body), editedAt: strOrNull(v.editedAt) }))
}

export function decideResultText(accepted: boolean, version: number | null): string {
  if (!accepted) return 'Propuesta rechazada: el borrador no ha cambiado.'
  return `Aceptada: se ha guardado como versión ${version ?? 'nueva'} (la anterior se conserva en el historial). No se ha publicado nada: el borrador vuelve a «Pendiente de revisar» y hay que aprobarlo de nuevo.`
}

export function restoreResultText(from: number, to: number): string {
  return `Restaurada la versión ${from} como versión nueva ${to}. No se ha publicado nada: vuelve a «Pendiente de revisar» y hay que aprobarla de nuevo.`
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Diferencias
// ---------------------------------------------------------------------------------------------------------------------------------------------------
export type DiffKind = 'same' | 'add' | 'del'
export interface DiffSegment {
  type: DiffKind
  text: string
}

// Palabras con su espacio pegado detrás: «Hola mundo» → ['Hola ', 'mundo'].
function tokenize(text: string): string[] {
  return text.match(/\S+\s*|\s+/g) ?? []
}
const core = (t: string) => t.trimEnd()

// Tope de tamaño de la tabla de la subsecuencia común más larga (palabras × palabras): por encima se compara por bloques gruesos para no bloquear la pantalla.
const LCS_CELL_LIMIT = 4_000_000

/** Diferencias por palabras: lo igual, lo añadido y lo eliminado, con los tramos contiguos del mismo tipo unidos. */
export function diffWords(before: string, after: string): DiffSegment[] {
  const a = tokenize(before)
  const b = tokenize(after)
  const out: DiffSegment[] = []
  const push = (type: DiffKind, text: string) => {
    if (text === '') return
    const last = out[out.length - 1]
    if (last && last.type === type) last.text += text
    else out.push({ type, text })
  }
  if (a.length === 0 && b.length === 0) return []
  // Se recortan el principio y el final iguales (lo habitual: un cambio en medio).
  let start = 0
  while (start < a.length && start < b.length && core(a[start]) === core(b[start])) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && core(a[endA - 1]) === core(b[endB - 1])) {
    endA--
    endB--
  }
  for (let i = 0; i < start; i++) push('same', b[i])
  const ma = endA - start
  const mb = endB - start
  if (ma === 0 || mb === 0 || ma * mb > LCS_CELL_LIMIT) {
    for (let i = start; i < endA; i++) push('del', a[i])
    for (let j = start; j < endB; j++) push('add', b[j])
  } else {
    const w = mb + 1
    const dp = new Uint32Array((ma + 1) * w)
    for (let i = ma - 1; i >= 0; i--) {
      for (let j = mb - 1; j >= 0; j--) {
        dp[i * w + j] = core(a[start + i]) === core(b[start + j]) ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1])
      }
    }
    let i = 0
    let j = 0
    while (i < ma && j < mb) {
      if (core(a[start + i]) === core(b[start + j])) {
        push('same', b[start + j])
        i++
        j++
      } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) {
        push('del', a[start + i])
        i++
      } else {
        push('add', b[start + j])
        j++
      }
    }
    while (i < ma) push('del', a[start + i++])
    while (j < mb) push('add', b[start + j++])
  }
  for (let i = endB; i < b.length; i++) push('same', b[i])
  return out
}

export function hasChanges(segments: DiffSegment[]): boolean {
  return segments.some((s) => s.type !== 'same')
}

// ---- Recetas (payload.recipes)
export interface RecipeBrief {
  title: string
  servings: number | null
  ingredientCount: number
  stepCount: number
  signature: string
}

export function recipesOf(payload: Rec): RecipeBrief[] {
  return rows(payload.recipes).map((r) => ({
    title: str(r.title) || str(r.name) || 'Receta sin título',
    servings: typeof r.servings === 'number' ? r.servings : null,
    ingredientCount: asArr(r.ingredients).length,
    stepCount: asArr(r.steps).length,
    signature: JSON.stringify(r),
  }))
}

export interface RecipeChanges {
  added: RecipeBrief[]
  removed: RecipeBrief[]
  changed: { before: RecipeBrief; after: RecipeBrief }[]
}

const normTitle = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export function diffRecipes(before: Rec, after: Rec): RecipeChanges {
  const a = recipesOf(before)
  const b = recipesOf(after)
  const bMap = new Map(b.map((r) => [normTitle(r.title), r]))
  const aMap = new Map(a.map((r) => [normTitle(r.title), r]))
  const changed: RecipeChanges['changed'] = []
  const removed: RecipeBrief[] = []
  for (const r of a) {
    const match = bMap.get(normTitle(r.title))
    if (!match) removed.push(r)
    else if (match.signature !== r.signature) changed.push({ before: r, after: match })
  }
  return { added: b.filter((r) => !aMap.has(normTitle(r.title))), removed, changed }
}

export function recipeChangesText(c: RecipeChanges): string[] {
  const out: string[] = []
  for (const r of c.added) out.push(`Receta añadida: ${r.title} (${r.ingredientCount} ingredientes, ${r.stepCount} pasos).`)
  for (const r of c.removed) out.push(`Receta eliminada: ${r.title}.`)
  for (const r of c.changed) {
    const bits: string[] = []
    if (r.before.ingredientCount !== r.after.ingredientCount) bits.push(`ingredientes ${r.before.ingredientCount} → ${r.after.ingredientCount}`)
    if (r.before.stepCount !== r.after.stepCount) bits.push(`pasos ${r.before.stepCount} → ${r.after.stepCount}`)
    if (r.before.servings !== r.after.servings) bits.push(`raciones ${r.before.servings ?? '—'} → ${r.after.servings ?? '—'}`)
    out.push(`Receta cambiada: ${r.after.title}${bits.length > 0 ? ` (${bits.join(', ')})` : ' (cambian cantidades o textos)'}.`)
  }
  return out
}

// ---- Encuesta (payload.options)
export interface OptionChanges {
  added: string[]
  removed: string[]
  kept: string[]
}

export function optionsOf(payload: Rec): string[] {
  return asArr(payload.options).filter((o): o is string => typeof o === 'string')
}

export function diffOptions(before: Rec, after: Rec): OptionChanges {
  const a = optionsOf(before)
  const b = optionsOf(after)
  const aSet = new Set(a.map(normTitle))
  const bSet = new Set(b.map(normTitle))
  return { added: b.filter((o) => !aSet.has(normTitle(o))), removed: a.filter((o) => !bSet.has(normTitle(o))), kept: b.filter((o) => aSet.has(normTitle(o))) }
}

// ---- Menú (payload.menu.days[].meals.{comida,cena})
export type MealKind = 'comida' | 'cena'
export interface DishInfo {
  dayIndex: number
  day: string
  meal: MealKind
  title: string
  side: string | null
}

export function dishesOf(payload: Rec): DishInfo[] {
  const menu = asRec(payload.menu)
  const out: DishInfo[] = []
  rows(menu.days).forEach((d, dayIndex) => {
    const meals = asRec(d.meals)
    for (const meal of ['comida', 'cena'] as const) {
      const m = asRec(meals[meal])
      if (str(m.title) !== '') out.push({ dayIndex, day: str(d.day) || WEEKDAYS[dayIndex] || `Día ${dayIndex + 1}`, meal, title: str(m.title), side: strOrNull(m.side) })
    }
  })
  return out
}

export interface DishChange {
  dayIndex: number
  day: string
  meal: MealKind
  before: string | null
  after: string | null
  /** Aviso de calidad asociado a ese plato, si lo hay. */
  warnings: string[]
}

export function diffMenu(before: Rec, after: Rec, quality: QualityNote[] = []): DishChange[] {
  const a = dishesOf(before)
  const b = dishesOf(after)
  const key = (d: DishInfo) => `${d.dayIndex}:${d.meal}`
  const aMap = new Map(a.map((d) => [key(d), d]))
  const bMap = new Map(b.map((d) => [key(d), d]))
  const keys = [...new Set([...a, ...b].map(key))].sort((x, y) => {
    const [dx, mx] = x.split(':')
    const [dy, my] = y.split(':')
    return Number(dx) - Number(dy) || (mx === my ? 0 : mx === 'comida' ? -1 : 1)
  })
  const out: DishChange[] = []
  for (const k of keys) {
    const x = aMap.get(k)
    const y = bMap.get(k)
    const sx = x ? `${x.title}|${x.side ?? ''}` : null
    const sy = y ? `${y.title}|${y.side ?? ''}` : null
    if (sx === sy) continue
    const ref = (y ?? x)!
    const label = (d: DishInfo | undefined) => (d ? `${d.title}${d.side ? ` (+ ${d.side})` : ''}` : null)
    const warnings = quality.filter((q) => q.meal === ref.meal && q.day != null && (String(q.day) === String(ref.dayIndex) || normTitle(String(q.day)) === normTitle(ref.day))).map((q) => q.message)
    out.push({ dayIndex: ref.dayIndex, day: ref.day, meal: ref.meal, before: label(x), after: label(y), warnings })
  }
  return out
}

/** Avisos de calidad que no se pueden asociar a un plato concreto (se enseñan aparte). */
export function generalQuality(quality: QualityNote[]): QualityNote[] {
  return quality.filter((q) => q.day == null && q.meal == null)
}

/** ¿Hay algún error bloqueante entre los avisos de calidad? (Aceptar sigue siendo posible: el servidor valida el menú al guardar.) */
export function hasBlockingQuality(quality: QualityNote[]): boolean {
  return quality.some((q) => q.severity === 'error')
}

export const MEAL_TEXT: Record<MealKind, string> = { comida: 'Comida', cena: 'Cena' }

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// ¿Se puede rectificar? Solo borradores o aprobados aún sin publicar, y solo artículos, encuestas y menús.
// ---------------------------------------------------------------------------------------------------------------------------------------------------
export function canRevise(i: { kind: string; status: string; publishedPostId?: string | null }): boolean {
  return (i.kind === 'article' || i.kind === 'poll' || i.kind === 'menu') && (i.status === 'proposed' || i.status === 'approved') && !i.publishedPostId
}

export function madridTodayIso(now: Date = new Date()): string {
  return madridDay(now) ?? dayToIso(now)
}
