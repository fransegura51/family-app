import { createEvent } from '@/data/calendar'
import { addShoppingItem } from '@/data/shopping'
import { findScheduleWarnings, groupScheduleWarnings, type ScheduleWarning } from '@/domain/calendar'
import { kitchenDateLabel } from '@/domain/kitchenQuery'
import { recurrenceLabel } from '@/domain/recurrence'
import { reminderLabel } from '@/domain/reminders'
import { defineAction, type ActionContext, type Choice } from '@/pepa/actions/types'
import { asRecord, isRealIsoDate, unknownKeys } from '@/pepa/actions/validators'

// Acciones de "Hablar con PEPA": apuntar en la lista de la compra y crear un
// evento del calendario. Se proponen a partir de lo que se ha dicho, se
// enseñan en la tarjeta y solo se escriben al confirmar.

// ---------------------------------------------------------------------
// shopping.add
// ---------------------------------------------------------------------

export interface ShoppingAddParams {
  store: string | null
  items: string[]
  // Posiciones de `items` que se han desmarcado en la tarjeta y no se añaden.
  skipped: number[]
}

const SHOPPING_KEYS = ['store', 'items', 'skipped'] as const
const MAX_ITEMS = 30

export const shoppingAddAction = defineAction<ShoppingAddParams>({
  id: 'shopping.add',

  validate(raw) {
    const rec = asRecord(raw)
    if (!rec) return { ok: false, errors: ['Petición no válida'] }
    const extra = unknownKeys(rec, SHOPPING_KEYS)
    if (extra.length > 0) return { ok: false, errors: [`Campos no permitidos: ${extra.join(', ')}`] }
    const store = rec.store === null ? null : typeof rec.store === 'string' ? rec.store.trim() : undefined
    if (store === undefined || (store !== null && (store.length === 0 || store.length > 60))) return { ok: false, errors: ['La tienda no es válida'] }
    if (!Array.isArray(rec.items) || rec.items.length === 0 || rec.items.length > MAX_ITEMS) return { ok: false, errors: ['La lista de productos no es válida'] }
    const items: string[] = []
    for (const item of rec.items) {
      const name = typeof item === 'string' ? item.trim() : ''
      if (name.length === 0 || name.length > 100) return { ok: false, errors: ['Algún producto no es válido'] }
      items.push(name)
    }
    const skipped = rec.skipped === undefined ? [] : rec.skipped
    if (!Array.isArray(skipped) || !skipped.every((i) => Number.isInteger(i) && i >= 0 && i < items.length) || new Set(skipped).size !== skipped.length) {
      return { ok: false, errors: ['Los productos desmarcados no son válidos'] }
    }
    if (skipped.length >= items.length) return { ok: false, errors: ['Elige al menos un producto'] }
    return { ok: true, params: { store, items, skipped: skipped as number[] } }
  },

  initialSelection(params) {
    return { choices: {}, checked: params.items.map((_, i) => String(i)).filter((key) => !params.skipped.includes(Number(key))) }
  },

  applySelection(params, selection) {
    return { ...params, skipped: params.items.map((_, i) => i).filter((i) => !selection.checked.includes(String(i))) }
  },

  present(params) {
    return {
      title: '🛒 Añadir a la lista de la compra',
      lines: [params.store ? `Tienda: ${params.store}` : 'Sin tienda concreta'],
      warnings: [],
      choices: [],
      checks: params.items.map((name, i) => ({ key: String(i), label: name })),
      confirmLabel: 'Añadir a la lista',
    }
  },

  async execute(params) {
    const items = params.items.filter((_, i) => !params.skipped.includes(i))
    for (const name of items) {
      await addShoppingItem({ name, quantity: '', unit: '', priority: 'normal', tripId: null, store: params.store })
    }
    window.dispatchEvent(new CustomEvent('family-app:compras-changed'))
    const where = params.store ? ` (${params.store})` : ''
    return `Apuntado en la lista de la compra${where}: ${items.join(', ')}.`
  },
})

// ---------------------------------------------------------------------
// calendar.create
// ---------------------------------------------------------------------

export interface CalendarCreateParams {
  title: string
  date: string
  time: string | null
  endTime: string | null
  memberId: string | null
  recurrenceRule: string | null
  reminders: { minutesBefore: number; anchor: 'start' | 'end' }[]
  // Avisos solo para enseñar en la tarjeta (p. ej. "entendido como las 17:00"); no se guardan.
  notes: string[]
}

const CALENDAR_KEYS = ['title', 'date', 'time', 'endTime', 'memberId', 'recurrenceRule', 'reminders', 'notes'] as const
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const DAY = '(?:MO|TU|WE|TH|FR|SA|SU)'
const RECURRENCE_RE = new RegExp(`^FREQ=WEEKLY;BYDAY=${DAY}(?:,${DAY})*$`)

function timeOrNull(value: unknown): string | null | undefined {
  if (value === null) return null
  return typeof value === 'string' && TIME_RE.test(value) ? value : undefined
}

// Texto de "para X"/"para toda la familia" a partir de los destinatarios de un evento YA EXISTENTE
// (el que causó el aviso) — no del candidato: el aviso habla de lo que ya había.
function whoLabel(memberIds: string[], ctx: ActionContext): string {
  return memberIds.length > 0
    ? ` para ${memberIds.map((id) => ctx.members.find((m) => m.id === id)?.name).filter((n): n is string => !!n).join(' y ')}`
    : ' para toda la familia'
}

// Posible duplicado/conflicto con lo que ya hay en el calendario — texto listo para enseñar en la
// tarjeta (view.warnings ya existente, sin bloquear nada). Agrupado: si "Saca basura" y "Sacar basura"
// ya existían las dos, es la MISMA acción dicha de formas ligeramente distintas — un solo aviso de
// duplicado, no uno por variante (findScheduleWarnings ya las marca todas como 'duplicate';
// groupScheduleWarnings las junta aquí). Un conflicto real con un evento DISTINTO nunca se oculta: sigue
// su propia línea, aparte del duplicado.
function formatScheduleWarnings(warnings: ScheduleWarning[], params: CalendarCreateParams, ctx: ActionContext): string[] {
  const { duplicateEvents, conflictEvents } = groupScheduleWarnings(warnings)
  const lines: string[] = []
  if (duplicateEvents.length > 0) {
    const representative = duplicateEvents[0] // el primero encontrado: elección simple y determinista, no se listan todas las variantes.
    const when = params.time ? `${kitchenDateLabel(params.date, ctx.today)} a las ${params.time}` : kitchenDateLabel(params.date, ctx.today)
    lines.push(`Parece que ya tienes «${representative.title}» ${when}${whoLabel(representative.memberIds, ctx)}.`)
  }
  // "Además tienes..." solo tiene sentido si ya se ha dicho el duplicado antes; sin duplicado, el
  // conflicto sigue con el texto de siempre ("Ya tienes...").
  const conflictVerb = duplicateEvents.length > 0 ? 'Además tienes' : 'Ya tienes'
  for (const ev of conflictEvents) lines.push(`${conflictVerb} «${ev.title}» a esa misma hora.`)
  return lines
}

// Se recalcula CADA VEZ que se enseña la tarjeta (present se llama en cada preview, también al
// cambiar el destinatario en "Para") — determinista, sin IA, sin volver a consultar Supabase: usa los
// mismos eventos ya cargados en ctx.calendarEvents (una sola vez, al construir la propuesta en
// pepa/talk.ts). Así un cambio de destinatario que deja de coincidir con lo existente hace desaparecer
// el aviso, y uno que pasa a coincidir lo hace aparecer, sin ninguna consulta nueva.
function scheduleWarningsFor(params: CalendarCreateParams, ctx: ActionContext): string[] {
  const candidate = { title: params.title, date: params.date, time: params.time, endTime: params.endTime, memberIds: params.memberId ? [params.memberId] : [] }
  return formatScheduleWarnings(findScheduleWarnings(candidate, ctx.calendarEvents ?? []), params, ctx)
}

export const calendarCreateAction = defineAction<CalendarCreateParams>({
  id: 'calendar.create',

  validate(raw, ctx) {
    const rec = asRecord(raw)
    if (!rec) return { ok: false, errors: ['Petición no válida'] }
    const errors: string[] = []
    const extra = unknownKeys(rec, CALENDAR_KEYS)
    if (extra.length > 0) errors.push(`Campos no permitidos: ${extra.join(', ')}`)

    const title = typeof rec.title === 'string' ? rec.title.trim() : ''
    if (title.length === 0 || title.length > 120) errors.push('El título no es válido')
    if (!isRealIsoDate(rec.date)) errors.push('La fecha no es válida')
    const time = timeOrNull(rec.time)
    const endTime = timeOrNull(rec.endTime)
    if (time === undefined) errors.push('La hora no es válida')
    if (endTime === undefined) errors.push('La hora de fin no es válida')
    if (endTime && !time) errors.push('Una hora de fin necesita hora de inicio')
    if (time && endTime && endTime <= time) errors.push('La hora de fin debe ser posterior a la de inicio')
    if (rec.memberId !== null && (typeof rec.memberId !== 'string' || !ctx.members.some((m) => m.id === rec.memberId))) errors.push('La persona no existe')
    if (rec.recurrenceRule !== null && (typeof rec.recurrenceRule !== 'string' || !RECURRENCE_RE.test(rec.recurrenceRule))) errors.push('La repetición no es válida')

    const reminders: CalendarCreateParams['reminders'] = []
    if (!Array.isArray(rec.reminders) || rec.reminders.length > 5) errors.push('Los avisos no son válidos')
    else {
      for (const r of rec.reminders) {
        const item = asRecord(r)
        const validItem =
          item !== null &&
          unknownKeys(item, ['minutesBefore', 'anchor']).length === 0 &&
          typeof item.minutesBefore === 'number' &&
          Number.isInteger(item.minutesBefore) &&
          item.minutesBefore >= 0 &&
          item.minutesBefore <= 60 * 24 * 365 &&
          (item.anchor === 'start' || item.anchor === 'end') &&
          !(item.anchor === 'end' && !endTime)
        if (!validItem) errors.push('Un aviso no es válido')
        else reminders.push({ minutesBefore: item.minutesBefore as number, anchor: item.anchor as 'start' | 'end' })
      }
    }
    const rawNotes = rec.notes === undefined ? [] : rec.notes
    const notes: string[] = []
    if (!Array.isArray(rawNotes) || rawNotes.length > 3 || !rawNotes.every((n) => typeof n === 'string' && n.length <= 200)) errors.push('Las notas no son válidas')
    else notes.push(...(rawNotes as string[]))
    if (errors.length > 0) return { ok: false, errors }
    return {
      ok: true,
      params: {
        title,
        date: rec.date as string,
        time: time as string | null,
        endTime: endTime as string | null,
        memberId: rec.memberId as string | null,
        recurrenceRule: rec.recurrenceRule as string | null,
        reminders,
        notes,
      },
    }
  },

  initialSelection(params) {
    return { choices: { member: params.memberId ?? 'none' }, checked: [] }
  },

  applySelection(params, selection) {
    const member = selection.choices.member
    return { ...params, memberId: member === undefined ? params.memberId : member === 'none' ? null : member }
  },

  present(params, ctx) {
    const timeLabel = params.time ? (params.endTime ? `${params.time} – ${params.endTime}` : params.time) : 'Todo el día'
    const lines = [`Título: ${params.title}`, `Día: ${kitchenDateLabel(params.date, ctx.today)}`, `Hora: ${timeLabel}`]
    if (params.recurrenceRule) lines.push(`Repite: ${recurrenceLabel(params.recurrenceRule)}`)
    if (params.reminders.length > 0) lines.push(`Aviso: ${params.reminders.map((r) => reminderLabel(r.minutesBefore, r.anchor)).join(', ')}`)
    const choices: Choice[] = [
      {
        id: 'member',
        label: 'Para',
        options: [{ key: 'none', label: 'Toda la familia' }, ...ctx.members.map((m) => ({ key: m.id, label: m.name }))],
      },
    ]
    return { title: '📅 Apuntar en el calendario', lines, warnings: [...params.notes, ...scheduleWarningsFor(params, ctx)], choices, checks: [], confirmLabel: 'Guardar en el calendario' }
  },

  async execute(params, ctx) {
    await createEvent({
      title: params.title,
      startAt: new Date(`${params.date}T${params.time ?? '09:00'}`).toISOString(),
      endAt: params.endTime ? new Date(`${params.date}T${params.endTime}`).toISOString() : null,
      allDay: params.time === null,
      recurrenceRule: params.recurrenceRule,
      reminders: params.reminders,
      memberIds: params.memberId ? [params.memberId] : [],
    })
    window.dispatchEvent(new CustomEvent('family-app:calendar-changed', { detail: { date: params.date } }))
    const member = params.memberId ? ctx.members.find((m) => m.id === params.memberId) : null
    const time = params.time ? ` a las ${params.time}` : ''
    return `Apuntado en el calendario: ${params.title} — ${kitchenDateLabel(params.date, ctx.today)}${time}${member ? ` · para ${member.name}` : ''}.`
  },
})
