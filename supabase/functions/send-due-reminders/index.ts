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

    // Dos pipelines independientes, combinados en el mismo Promise.all: si uno falla, el otro no debe
    // quedarse sin correr — cada uno atrapa sus propios errores y se reporta por separado.
    const [calendarResult, forecastResult] = await Promise.all([
      sendDueCalendarReminders().catch((err) => {
        console.error("calendar reminders failed", err)
        return { checked: 0, sent: 0, expired: 0, error: true }
      }),
      sendDueForecastReminders().catch((err) => {
        console.error("forecast reminders failed", err)
        return { checked: 0, sent: 0, expired: 0, error: true }
      }),
    ])

    return Response.json({
      checked: calendarResult.checked + forecastResult.checked,
      sent: calendarResult.sent + forecastResult.sent,
      expired: calendarResult.expired + forecastResult.expired,
      calendar: calendarResult,
      forecast: forecastResult,
    })
  } catch (err) {
    console.error(err)
    return new Response("internal error", { status: 500 })
  }
})
