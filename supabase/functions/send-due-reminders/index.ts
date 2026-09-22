import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"
import webpush from "npm:web-push@3.6.7"

// Recordatorios con la app cerrada: pg_cron llama a esta función cada
// minuto (ver migración 0005_schedule_reminder_cron.sql). Autenticación
// propia por cabecera (no JWT de usuario, la llama pg_net) — el secreto
// compartido vive en Vault, nunca en el código.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// ============================================================
// Previsión de pagos (Economía) — pipeline de avisos financieros. Independiente del de arriba: nunca
// toca calendar_event_reminders/claim_due_reminders. El motor de recurrencia (stepMonthsClamped con
// recorte a fin de mes para MONTHLY/YEARLY, aritmética de días pura para WEEKLY/DAILY) es una copia
// deliberada de src/domain/forecast.ts — esta función Deno no puede importar código de src/ (mismo
// criterio ya usado en export-calendar-ics, que también reimplementa su propio recorrido de fechas en
// vez de compartir código con el cliente).
// ============================================================

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate()
}

function parseDateStr(dateStr: string): { year: number; monthIndex0: number; day: number } {
  const [y, m, d] = dateStr.split("-").map(Number)
  return { year: y, monthIndex0: m - 1, day: d }
}

function formatDateStr(year: number, monthIndex0: number, day: number): string {
  const d = new Date(year, monthIndex0, day)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function stepMonthsClamped(anchorDateStr: string, totalMonthsToAdd: number): string {
  const anchor = parseDateStr(anchorDateStr)
  const targetMonthAbs = anchor.year * 12 + anchor.monthIndex0 + totalMonthsToAdd
  const targetYear = Math.floor(targetMonthAbs / 12)
  const targetMonthIndex0 = ((targetMonthAbs % 12) + 12) % 12
  const targetDay = Math.min(anchor.day, daysInMonth(targetYear, targetMonthIndex0))
  return formatDateStr(targetYear, targetMonthIndex0, targetDay)
}

function stepDays(anchorDateStr: string, totalDays: number): string {
  const anchor = parseDateStr(anchorDateStr)
  const d = new Date(anchor.year, anchor.monthIndex0, anchor.day + totalDays)
  return formatDateStr(d.getFullYear(), d.getMonth(), d.getDate())
}

type ForecastFreq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY"
interface ForecastRule { freq: ForecastFreq; interval: number; until: string | null }

function parseForecastRecurrenceRule(rule: string): ForecastRule | null {
  const parts = Object.fromEntries(rule.split(";").map((p) => p.split("=") as [string, string]))
  const freq = parts.FREQ
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY" && freq !== "YEARLY") return null
  const interval = Number(parts.INTERVAL)
  return { freq, interval: Number.isFinite(interval) && interval > 1 ? interval : 1, until: parts.UNTIL ?? null }
}

function occurrenceForCycle(anchorDateStr: string, rule: ForecastRule, cycleN: number): string {
  switch (rule.freq) {
    case "DAILY":
      return stepDays(anchorDateStr, rule.interval * cycleN)
    case "WEEKLY":
      return stepDays(anchorDateStr, 7 * rule.interval * cycleN)
    case "MONTHLY":
      return stepMonthsClamped(anchorDateStr, rule.interval * cycleN)
    case "YEARLY":
      return stepMonthsClamped(anchorDateStr, 12 * rule.interval * cycleN)
  }
}

type ForecastReminderUnit = "minutes" | "hours" | "days" | "weeks" | "months"
const MINUTES_PER_DAY = 24 * 60

function computeForecastReminderDate(dueDate: string, value: number, unit: ForecastReminderUnit): string {
  if (unit === "months") return stepMonthsClamped(dueDate, -value)
  const days = unit === "weeks" ? value * 7 : unit === "days" ? value : unit === "hours" ? Math.ceil(value / 24) : Math.ceil(value / MINUTES_PER_DAY)
  return stepDays(dueDate, -days)
}

// Nunca se buscan avisos para ocurrencias con vencimiento a más de un año vista — un aviso configurado
// con más antelación que esto (p. ej. "6 meses antes" de un pago a 2 años) es un caso de uso extremo, no
// contemplado en esta fase; queda documentado, no oculto.
const FORECAST_LOOKAHEAD_DAYS = 400
const FORECAST_MAX_CYCLES_GUARD = 2000

interface DueForecastReminder { reminderId: string; occurrenceDate: string }

function collectDueForecastReminders(
  payments: { id: string; due_date: string; recurrence_rule: string | null; active: boolean }[],
  remindersByPayment: Map<string, { id: string; value: number; unit: ForecastReminderUnit }[]>,
  overridesByPayment: Map<string, Map<string, { due_date_override: string | null; skipped: boolean }>>,
  today: string,
): DueForecastReminder[] {
  const horizon = stepDays(today, FORECAST_LOOKAHEAD_DAYS)
  const due: DueForecastReminder[] = []

  for (const payment of payments) {
    if (!payment.active) continue
    const reminders = remindersByPayment.get(payment.id) ?? []
    if (reminders.length === 0) continue
    const overrides = overridesByPayment.get(payment.id) ?? new Map()

    const rule = payment.recurrence_rule ? parseForecastRecurrenceRule(payment.recurrence_rule) : null
    for (let n = 0; n < FORECAST_MAX_CYCLES_GUARD; n++) {
      const occurrenceDate = rule ? occurrenceForCycle(payment.due_date, rule, n) : payment.due_date
      if (rule?.until && occurrenceDate > rule.until) break
      if (occurrenceDate > horizon) break

      const override = overrides.get(occurrenceDate)
      if (!override?.skipped) {
        const effectiveDueDate = override?.due_date_override ?? occurrenceDate
        for (const reminder of reminders) {
          const reminderDate = computeForecastReminderDate(effectiveDueDate, reminder.value, reminder.unit)
          if (reminderDate === today) due.push({ reminderId: reminder.id, occurrenceDate })
        }
      }

      if (!rule) break
    }
  }

  return due
}

// ============================================================
// Avance automático de la proyección visual de Previsión en Calendario. Hallazgo de la certificación
// Fase 1B.1: data/forecast.ts solo (re)calcula el evento derivado al crear/editar/activar un
// forecast_payment — nada lo movía a la siguiente ocurrencia cuando la actual quedaba atrás en el
// tiempo. Se resuelve aquí, aprovechando este mismo cron (ya corre cada minuto) en vez de crear uno
// nuevo. Algoritmo idéntico ("primera ocurrencia con vencimiento >= hoy, saltando skipped, aplicando
// due_date_override") al de domain/forecast.ts::nextForecastOccurrence — cubierto por los tests
// "nextForecastOccurrence" de src/domain/forecast.test.ts (YEARLY normal, YEARLY 29/02, MONTHLY 31,
// MONTHLY 30, skipped, due_date_override). Nunca materializa la serie completa: solo recalcula UNA
// fecha y, si difiere de la que ya tiene el evento, actualiza ESE MISMO calendar_event (no crea uno
// nuevo, no toca sync_to_google ni ningún otro campo).
function findNextRecurringDueDateOnOrAfter(
  dueDateAnchor: string,
  rule: ForecastRule,
  overrides: Map<string, { due_date_override: string | null; skipped: boolean }>,
  today: string,
): string | null {
  for (let n = 0; n < FORECAST_MAX_CYCLES_GUARD; n++) {
    const occurrenceDate = occurrenceForCycle(dueDateAnchor, rule, n)
    if (rule.until && occurrenceDate > rule.until) return null
    const override = overrides.get(occurrenceDate)
    if (override?.skipped) continue
    const effectiveDueDate = override?.due_date_override ?? occurrenceDate
    if (effectiveDueDate >= today) return effectiveDueDate
  }
  return null
}

async function advanceForecastCalendarProjections(): Promise<{ checked: number; updated: number; retired: number }> {
  const today = new Date().toISOString().slice(0, 10)

  // Solo pagos activos, recurrentes, con proyección visual activa y ya vinculados a un evento — un pago
  // puntual (sin recurrence_rule) no tiene "siguiente ocurrencia" a la que avanzar, y active=false o
  // show_in_calendar=false ya se resuelven de forma síncrona en data/forecast.ts (el evento se borra en
  // el momento mismo de desactivar/ocultar, no hace falta que este cron lo repita).
  const { data: payments, error: paymentsError } = await supabaseAdmin
    .from("forecast_payments")
    .select("id, due_date, recurrence_rule, calendar_event_id")
    .eq("active", true)
    .eq("show_in_calendar", true)
    .not("recurrence_rule", "is", null)
    .not("calendar_event_id", "is", null)
  if (paymentsError) throw paymentsError
  if (!payments || payments.length === 0) return { checked: 0, updated: 0, retired: 0 }

  const paymentIds = payments.map((p) => p.id as string)
  const eventIds = payments.map((p) => p.calendar_event_id as string)
  const [{ data: overrides, error: overridesError }, { data: events, error: eventsError }] = await Promise.all([
    supabaseAdmin.from("forecast_occurrences").select("forecast_payment_id, occurrence_date, due_date_override, skipped").in("forecast_payment_id", paymentIds),
    supabaseAdmin.from("calendar_events").select("id, start_at").in("id", eventIds),
  ])
  if (overridesError) throw overridesError
  if (eventsError) throw eventsError

  const overridesByPayment = new Map<string, Map<string, { due_date_override: string | null; skipped: boolean }>>()
  for (const o of overrides ?? []) {
    const byDate = overridesByPayment.get(o.forecast_payment_id as string) ?? new Map()
    byDate.set(o.occurrence_date as string, { due_date_override: o.due_date_override as string | null, skipped: o.skipped as boolean })
    overridesByPayment.set(o.forecast_payment_id as string, byDate)
  }
  // Medianoche UTC explícita en ambos lados (ver data/forecast.ts) — slice(0, 10) recupera exactamente
  // la fecha que se escribió, sin ambigüedad de zona horaria.
  const eventStartDateById = new Map((events ?? []).map((e) => [e.id as string, (e.start_at as string).slice(0, 10)]))

  let updated = 0
  let retired = 0
  for (const payment of payments) {
    const rule = parseForecastRecurrenceRule(payment.recurrence_rule as string)
    if (!rule) continue
    const overridesForPayment = overridesByPayment.get(payment.id as string) ?? new Map()

    const nextDue = findNextRecurringDueDateOnOrAfter(payment.due_date as string, rule, overridesForPayment, today)
    if (!nextDue) {
      // La serie ya superó su UNTIL — certificación Fase 1B.1, hallazgo real: dejar el evento visual
      // con la última fecha (ya pasada) para siempre parecería "el próximo vencimiento" indefinidamente,
      // que es justo la fecha engañosa que esta fase prohíbe. Se retira la proyección (mismo borrado
      // simple que deleteEvent — las tablas hijas tienen ON DELETE CASCADE) y se limpia el puntero; el
      // historial de forecast_payments NUNCA se toca, solo su proyección puramente visual.
      const { error: deleteError } = await supabaseAdmin.from("calendar_events").delete().eq("id", payment.calendar_event_id as string)
      if (deleteError) {
        console.error("retire finished forecast projection failed", payment.id, deleteError)
        continue
      }
      const { error: clearError } = await supabaseAdmin.from("forecast_payments").update({ calendar_event_id: null }).eq("id", payment.id as string)
      if (clearError) console.error("clear calendar_event_id after retiring projection failed", payment.id, clearError)
      retired++
      continue
    }

    const currentStart = eventStartDateById.get(payment.calendar_event_id as string)
    if (currentStart === nextDue) continue // ya está en la ocurrencia correcta — idempotente, no reescribe sin necesidad

    const { error: updateError } = await supabaseAdmin
      .from("calendar_events")
      .update({ start_at: `${nextDue}T00:00:00.000Z`, end_at: null, updated_at: new Date().toISOString() })
      .eq("id", payment.calendar_event_id as string)
    if (updateError) {
      console.error("advance forecast projection failed", payment.id, updateError)
      continue
    }
    updated++
  }

  return { checked: payments.length, updated, retired }
}

async function sendDueForecastReminders(): Promise<{ checked: number; sent: number; expired: number }> {
  const today = new Date().toISOString().slice(0, 10)

  const { data: payments, error: paymentsError } = await supabaseAdmin
    .from("forecast_payments")
    .select("id, due_date, recurrence_rule, active")
    .eq("active", true)
  if (paymentsError) throw paymentsError
  if (!payments || payments.length === 0) return { checked: 0, sent: 0, expired: 0 }

  const paymentIds = payments.map((p) => p.id as string)
  const [{ data: reminders, error: remindersError }, { data: overrides, error: overridesError }] = await Promise.all([
    supabaseAdmin.from("forecast_reminders").select("id, forecast_payment_id, value, unit").in("forecast_payment_id", paymentIds),
    supabaseAdmin.from("forecast_occurrences").select("forecast_payment_id, occurrence_date, due_date_override, skipped").in("forecast_payment_id", paymentIds),
  ])
  if (remindersError) throw remindersError
  if (overridesError) throw overridesError

  const remindersByPayment = new Map<string, { id: string; value: number; unit: ForecastReminderUnit }[]>()
  for (const r of reminders ?? []) {
    const list = remindersByPayment.get(r.forecast_payment_id as string) ?? []
    list.push({ id: r.id as string, value: r.value as number, unit: r.unit as ForecastReminderUnit })
    remindersByPayment.set(r.forecast_payment_id as string, list)
  }
  const overridesByPayment = new Map<string, Map<string, { due_date_override: string | null; skipped: boolean }>>()
  for (const o of overrides ?? []) {
    const byDate = overridesByPayment.get(o.forecast_payment_id as string) ?? new Map()
    byDate.set(o.occurrence_date as string, { due_date_override: o.due_date_override as string | null, skipped: o.skipped as boolean })
    overridesByPayment.set(o.forecast_payment_id as string, byDate)
  }

  const dueReminders = collectDueForecastReminders(
    payments as { id: string; due_date: string; recurrence_rule: string | null; active: boolean }[],
    remindersByPayment,
    overridesByPayment,
    today,
  )
  if (dueReminders.length === 0) return { checked: 0, sent: 0, expired: 0 }

  const { data: claimed, error: claimError } = await supabaseAdmin.rpc("claim_due_forecast_reminders", {
    p_due: dueReminders.map((d) => ({ reminder_id: d.reminderId, occurrence_date: d.occurrenceDate })),
  })
  if (claimError) throw claimError

  let sent = 0
  let expired = 0
  for (const c of claimed ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: c.out_endpoint, keys: { p256dh: c.out_p256dh, auth: c.out_auth } },
        JSON.stringify({ title: `Previsión: ${c.out_title}`, body: "Vence pronto", url: "/dinero" }),
      )
      sent++
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) {
        await supabaseAdmin.rpc("delete_push_subscription", { p_endpoint: c.out_endpoint })
        expired++
      } else {
        console.error("push send failed (forecast)", status, err)
      }
    }
  }

  return { checked: claimed?.length ?? 0, sent, expired }
}

async function sendDueCalendarReminders(): Promise<{ checked: number; sent: number; expired: number }> {
  const { data: reminders, error } = await supabaseAdmin.rpc("claim_due_reminders")
  if (error) throw error

  let sent = 0
  let expired = 0

  for (const r of reminders ?? []) {
    const time = new Date(r.out_anchor_at).toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    })
    // Un recordatorio "de fin" (p. ej. "recógelo") tiene que decir
    // "Termina", no "Empieza" — si no, el aviso de ir a recoger a
    // alguien diría la hora de inicio y confundiría más que ayudar.
    const body = r.out_anchor === "end" ? `Termina a las ${time}` : `Empieza a las ${time}`
    try {
      await webpush.sendNotification(
        {
          endpoint: r.out_endpoint,
          keys: { p256dh: r.out_p256dh, auth: r.out_auth },
        },
        JSON.stringify({ title: r.out_event_title, body }),
      )
      sent++
    } catch (err) {
      // 404/410: la suscripción ya no es válida (navegador desinstalado,
      // permiso revocado, etc.) — la borramos para no reintentar en vano.
      const status = (err as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) {
        await supabaseAdmin.rpc("delete_push_subscription", { p_endpoint: r.out_endpoint })
        expired++
      } else {
        console.error("push send failed", status, err)
      }
    }
  }

  return { checked: reminders?.length ?? 0, sent, expired }
}

Deno.serve(async (req) => {
  try {
    const providedSecret = req.headers.get("x-cron-secret")
    const { data: expectedSecret, error: secretError } = await supabaseAdmin.rpc(
      "get_app_secret",
      { p_name: "cron_shared_secret" },
    )
    if (secretError || !providedSecret || providedSecret !== expectedSecret) {
      return new Response("unauthorized", { status: 401 })
    }

    const [{ data: vapidPublicKey }, { data: vapidPrivateKey }] = await Promise.all([
      supabaseAdmin.rpc("get_app_secret", { p_name: "vapid_public_key" }),
      supabaseAdmin.rpc("get_app_secret", { p_name: "vapid_private_key" }),
    ])

    webpush.setVapidDetails(
      "mailto:family-app@example.com",
      vapidPublicKey as string,
      vapidPrivateKey as string,
    )

    // Tres pipelines independientes, combinados en el mismo Promise.all: si uno falla, los demás no
    // deben quedarse sin correr — cada uno atrapa sus propios errores y se reporta por separado.
    const [calendarResult, forecastResult, forecastProjectionResult] = await Promise.all([
      sendDueCalendarReminders().catch((err) => {
        console.error("calendar reminders failed", err)
        return { checked: 0, sent: 0, expired: 0, error: true }
      }),
      sendDueForecastReminders().catch((err) => {
        console.error("forecast reminders failed", err)
        return { checked: 0, sent: 0, expired: 0, error: true }
      }),
      advanceForecastCalendarProjections().catch((err) => {
        console.error("advance forecast projections failed", err)
        return { checked: 0, updated: 0, retired: 0, error: true }
      }),
    ])

    return Response.json({
      checked: calendarResult.checked + forecastResult.checked,
      sent: calendarResult.sent + forecastResult.sent,
      expired: calendarResult.expired + forecastResult.expired,
      calendar: calendarResult,
      forecast: forecastResult,
      forecastProjection: forecastProjectionResult,
    })
  } catch (err) {
    console.error(err)
    return new Response("internal error", { status: 500 })
  }
})
