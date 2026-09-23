// Previsión de pagos (Economía) — capa de datos mínima (Fase 1B: infraestructura, sin UI todavía).
import { supabase } from '@/data/supabaseClient'
import { createEvent, updateEvent, deleteEvent } from '@/data/calendar'
import { nextForecastOccurrence } from '@/domain/forecast'
import type {
  ForecastAmountStatus,
  ForecastOccurrenceOverride,
  ForecastPayment,
  ForecastPaymentInstallment,
  ForecastReminder,
  ForecastReminderUnit,
} from '@/domain/forecast'

interface ForecastPaymentRow {
  id: string
  family_id: string
  title: string
  category_id: string | null
  provider: string | null
  notes: string | null
  amount_status: string
  amount: number | null
  amount_estimated_basis: string | null
  currency: string
  due_date: string
  expected_payment_date: string | null
  recurrence_rule: string | null
  bank_account_id: string | null
  owner_member_id: string | null
  show_in_calendar: boolean
  calendar_event_id: string | null
  active: boolean
  forecast_reminders: { id: string; value: number; unit: string }[]
  forecast_payment_installments: { id: string; sequence_index: number; offset_days: number; amount_status: string; amount: number | null; amount_estimated_basis: string | null }[]
}

const FORECAST_PAYMENT_COLUMNS =
  'id, family_id, title, category_id, provider, notes, amount_status, amount, amount_estimated_basis, currency, ' +
  'due_date, expected_payment_date, recurrence_rule, bank_account_id, owner_member_id, show_in_calendar, calendar_event_id, active, ' +
  'forecast_reminders(id, value, unit), ' +
  'forecast_payment_installments(id, sequence_index, offset_days, amount_status, amount, amount_estimated_basis)'

export type ForecastPaymentWithReminders = ForecastPayment & { reminders: ForecastReminder[]; installments: ForecastPaymentInstallment[] }

function toForecastPayment(row: ForecastPaymentRow): ForecastPaymentWithReminders {
  return {
    id: row.id,
    familyId: row.family_id,
    title: row.title,
    categoryId: row.category_id,
    provider: row.provider,
    notes: row.notes,
    amountStatus: row.amount_status as ForecastAmountStatus,
    amount: row.amount,
    amountEstimatedBasis: row.amount_estimated_basis,
    currency: row.currency,
    dueDate: row.due_date,
    expectedPaymentDate: row.expected_payment_date,
    recurrenceRule: row.recurrence_rule,
    bankAccountId: row.bank_account_id,
    ownerMemberId: row.owner_member_id,
    showInCalendar: row.show_in_calendar,
    calendarEventId: row.calendar_event_id,
    active: row.active,
    reminders: row.forecast_reminders.map((r) => ({ id: r.id, forecastPaymentId: row.id, value: r.value, unit: r.unit as ForecastReminderUnit })),
    installments: row.forecast_payment_installments
      .map((i) => ({
        id: i.id,
        forecastPaymentId: row.id,
        sequenceIndex: i.sequence_index,
        offsetDays: i.offset_days,
        amountStatus: i.amount_status as ForecastAmountStatus,
        amount: i.amount,
        amountEstimatedBasis: i.amount_estimated_basis,
      }))
      .sort((a, b) => a.sequenceIndex - b.sequenceIndex),
  }
}

export async function listForecastPayments(): Promise<ForecastPaymentWithReminders[]> {
  const { data, error } = await supabase.from('forecast_payments').select(FORECAST_PAYMENT_COLUMNS).order('due_date', { ascending: true })
  if (error) throw error
  return (data as unknown as ForecastPaymentRow[]).map(toForecastPayment)
}

export interface ForecastPaymentInput {
  title: string
  categoryId: string | null
  provider: string | null
  notes: string | null
  amountStatus: ForecastAmountStatus
  amount: number | null
  amountEstimatedBasis: string | null
  currency?: string
  dueDate: string
  expectedPaymentDate: string | null
  recurrenceRule: string | null
  bankAccountId: string | null
  ownerMemberId: string | null
  showInCalendar: boolean
}

async function currentFamilyAndUser(): Promise<{ familyId: string; userId: string }> {
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  const { data: profileRow, error } = await supabase.from('profiles').select('family_id').eq('id', userResult.user.id).single()
  if (error) throw error
  return { familyId: profileRow.family_id as string, userId: userResult.user.id }
}

// Proyección visual (calendar_events derivado) — SOLO la próxima ocurrencia, como evento suelto (sin
// recurrence_rule propia). Decisión deliberada de Fase 1B, no un descuido: el motor de recurrencia de
// Calendario (domain/calendar.ts, expandOccurrences) tiene un desbordamiento verificado para FREQ=MONTHLY
// en día 29/30/31 y no expande FREQ=YEARLY anclado en 29/02 en absoluto (comparación exacta día+mes) —
// pasarle la recurrence_rule financiera tal cual mostraría fechas visuales DISTINTAS de las que Previsión
// calcula (domain/forecast.ts, que sí es correcto). Antes que enseñar una fecha falsa en el Calendario,
// se proyecta solo la ocurrencia siguiente (siempre exacta, recalculada en cada sincronización) — la
// serie completa recurrente como proyección visual queda pospuesta a una fase posterior. Nunca lleva
// calendar_event_reminders (los avisos financieros van por su propio pipeline) ni sync_to_google.
async function syncForecastCalendarProjection(
  payment: Pick<ForecastPayment, 'id' | 'title' | 'dueDate' | 'expectedPaymentDate' | 'recurrenceRule' | 'amountStatus' | 'amount' | 'currency' | 'categoryId' | 'showInCalendar' | 'active' | 'calendarEventId' | 'ownerMemberId'>,
): Promise<string | null> {
  if (!payment.showInCalendar || !payment.active) {
    if (payment.calendarEventId) await deleteEvent(payment.calendarEventId)
    return null
  }
  const today = new Date().toISOString().slice(0, 10)
  const next = nextForecastOccurrence(payment, [], today, 'dueDate')
  const targetDate = next?.dueDate ?? payment.dueDate
  const eventInput = {
    title: `Vence: ${payment.title}`,
    // Medianoche UTC explícita (no `new Date(\`${targetDate}T00:00:00\`)`, que se interpreta en la zona
    // local del navegador): send-due-reminders/index.ts (Deno, UTC) reprograma este mismo evento a la
    // siguiente ocurrencia cuando pasa la actual (ver advanceForecastCalendarProjections) y necesita
    // escribir/comparar exactamente el mismo formato — si un lado usara hora local y el otro UTC, la
    // fecha efectiva podría desincronizarse un día según la zona horaria de quien creó el evento.
    startAt: `${targetDate}T00:00:00.000Z`,
    endAt: null,
    allDay: true,
    recurrenceRule: null,
    reminders: [],
    memberIds: payment.ownerMemberId ? [payment.ownerMemberId] : [],
    syncToGoogle: false,
  }
  if (payment.calendarEventId) {
    await updateEvent(payment.calendarEventId, eventInput)
    return payment.calendarEventId
  }
  return createEvent(eventInput)
}

export async function createForecastPayment(input: ForecastPaymentInput): Promise<string> {
  const { familyId, userId } = await currentFamilyAndUser()
  const { data: row, error } = await supabase
    .from('forecast_payments')
    .insert({
      family_id: familyId,
      title: input.title,
      category_id: input.categoryId,
      provider: input.provider,
      notes: input.notes,
      amount_status: input.amountStatus,
      amount: input.amount,
      amount_estimated_basis: input.amountEstimatedBasis,
      currency: input.currency ?? 'EUR',
      due_date: input.dueDate,
      expected_payment_date: input.expectedPaymentDate,
      recurrence_rule: input.recurrenceRule,
      bank_account_id: input.bankAccountId,
      owner_member_id: input.ownerMemberId,
      show_in_calendar: input.showInCalendar,
      created_by: userId,
    })
    .select('id')
    .single()
  if (error) throw error
  const id = row.id as string

  const calendarEventId = await syncForecastCalendarProjection({
    id,
    title: input.title,
    dueDate: input.dueDate,
    expectedPaymentDate: input.expectedPaymentDate,
    recurrenceRule: input.recurrenceRule,
    amountStatus: input.amountStatus,
    amount: input.amount,
    currency: input.currency ?? 'EUR',
    categoryId: input.categoryId,
    showInCalendar: input.showInCalendar,
    active: true,
    calendarEventId: null,
    ownerMemberId: input.ownerMemberId,
  })
  if (calendarEventId) {
    const { error: linkError } = await supabase.from('forecast_payments').update({ calendar_event_id: calendarEventId }).eq('id', id)
    if (linkError) throw linkError
  }

  return id
}

export async function updateForecastPayment(id: string, input: ForecastPaymentInput & { active: boolean; calendarEventId: string | null }): Promise<void> {
  const { error } = await supabase
    .from('forecast_payments')
    .update({
      title: input.title,
      category_id: input.categoryId,
      provider: input.provider,
      notes: input.notes,
      amount_status: input.amountStatus,
      amount: input.amount,
      amount_estimated_basis: input.amountEstimatedBasis,
      currency: input.currency ?? 'EUR',
      due_date: input.dueDate,
      expected_payment_date: input.expectedPaymentDate,
      recurrence_rule: input.recurrenceRule,
      bank_account_id: input.bankAccountId,
      owner_member_id: input.ownerMemberId,
      show_in_calendar: input.showInCalendar,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error

  const calendarEventId = await syncForecastCalendarProjection({
    id,
    title: input.title,
    dueDate: input.dueDate,
    expectedPaymentDate: input.expectedPaymentDate,
    recurrenceRule: input.recurrenceRule,
    amountStatus: input.amountStatus,
    amount: input.amount,
    currency: input.currency ?? 'EUR',
    categoryId: input.categoryId,
    showInCalendar: input.showInCalendar,
    active: input.active,
    calendarEventId: input.calendarEventId,
    ownerMemberId: input.ownerMemberId,
  })
  if (calendarEventId !== input.calendarEventId) {
    const { error: linkError } = await supabase.from('forecast_payments').update({ calendar_event_id: calendarEventId }).eq('id', id)
    if (linkError) throw linkError
  }
}

// Desactivar/reactivar — nunca borra histórico/overrides ya existentes. Al desactivar, la proyección
// visual se retira (ya no es un vencimiento futuro real); al reactivar, se vuelve a sincronizar.
export async function setForecastPaymentActive(
  payment: Pick<ForecastPayment, 'id' | 'title' | 'dueDate' | 'expectedPaymentDate' | 'recurrenceRule' | 'amountStatus' | 'amount' | 'currency' | 'categoryId' | 'showInCalendar' | 'calendarEventId' | 'ownerMemberId'>,
  active: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('forecast_payments')
    .update({ active, deactivated_at: active ? null : new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', payment.id)
  if (error) throw error

  const calendarEventId = await syncForecastCalendarProjection({ ...payment, active })
  if (calendarEventId !== payment.calendarEventId) {
    const { error: linkError } = await supabase.from('forecast_payments').update({ calendar_event_id: calendarEventId }).eq('id', payment.id)
    if (linkError) throw linkError
  }
}

export async function deleteForecastPayment(calendarEventId: string | null, id: string): Promise<void> {
  if (calendarEventId) await deleteEvent(calendarEventId)
  const { error } = await supabase.from('forecast_payments').delete().eq('id', id)
  if (error) throw error
}

// Sustituye todos los recordatorios a la vez — mismo patrón que replaceReminders en data/calendar.ts.
export async function replaceForecastReminders(forecastPaymentId: string, reminders: { value: number; unit: ForecastReminderUnit }[]): Promise<void> {
  const { error: deleteError } = await supabase.from('forecast_reminders').delete().eq('forecast_payment_id', forecastPaymentId)
  if (deleteError) throw deleteError
  if (reminders.length > 0) {
    const { error: insertError } = await supabase
      .from('forecast_reminders')
      .insert(reminders.map((r) => ({ forecast_payment_id: forecastPaymentId, value: r.value, unit: r.unit })))
    if (insertError) throw insertError
  }
}

// Fase 1D-c: sustituye la plantilla de cargos por ciclo a la vez — mismo patrón que
// replaceForecastReminders. Lista vacía = "un solo pago" (sin fraccionar), comportamiento de siempre.
export async function replaceForecastPaymentInstallments(
  forecastPaymentId: string,
  installments: { sequenceIndex: number; offsetDays: number; amountStatus: ForecastAmountStatus; amount: number | null; amountEstimatedBasis: string | null }[],
): Promise<void> {
  const { error: deleteError } = await supabase.from('forecast_payment_installments').delete().eq('forecast_payment_id', forecastPaymentId)
  if (deleteError) throw deleteError
  if (installments.length > 0) {
    const { error: insertError } = await supabase.from('forecast_payment_installments').insert(
      installments.map((i) => ({
        forecast_payment_id: forecastPaymentId,
        sequence_index: i.sequenceIndex,
        offset_days: i.offsetDays,
        amount_status: i.amountStatus,
        amount: i.amount,
        amount_estimated_basis: i.amountEstimatedBasis,
      })),
    )
    if (insertError) throw insertError
  }
}

interface ForecastOccurrenceRow {
  id: string
  forecast_payment_id: string
  occurrence_date: string
  installment_sequence_index: number
  due_date_override: string | null
  expected_payment_date_override: string | null
  amount_status: string | null
  amount: number | null
  amount_estimated_basis: string | null
  skipped: boolean
  matched_expense_id: string | null
}

function toForecastOverride(row: ForecastOccurrenceRow): ForecastOccurrenceOverride {
  return {
    id: row.id,
    forecastPaymentId: row.forecast_payment_id,
    occurrenceDate: row.occurrence_date,
    // 0 en BD = el override es del ciclo completo (sin fraccionar) — se traduce a null en el dominio,
    // igual que el resto de campos "sin valor" de este mismo objeto.
    installmentSequenceIndex: row.installment_sequence_index === 0 ? null : row.installment_sequence_index,
    dueDateOverride: row.due_date_override,
    expectedPaymentDateOverride: row.expected_payment_date_override,
    amountStatus: row.amount_status as ForecastAmountStatus | null,
    amount: row.amount,
    amountEstimatedBasis: row.amount_estimated_basis,
    skipped: row.skipped,
    matchedExpenseId: row.matched_expense_id,
  }
}

export async function listForecastOccurrenceOverrides(forecastPaymentId: string): Promise<ForecastOccurrenceOverride[]> {
  const { data, error } = await supabase.from('forecast_occurrences').select('*').eq('forecast_payment_id', forecastPaymentId)
  if (error) throw error
  return (data as unknown as ForecastOccurrenceRow[]).map(toForecastOverride)
}

// Crea o sustituye el override de UNA ocurrencia concreta (importe distinto solo esa vez, saltarla,
// mover su fecha, o — Fase 1D-c — de un cargo concreto dentro del ciclo) — nunca toca la regla del
// padre ni las demás ocurrencias/cargos.
export async function upsertForecastOccurrenceOverride(input: {
  forecastPaymentId: string
  occurrenceDate: string
  installmentSequenceIndex?: number | null
  dueDateOverride?: string | null
  expectedPaymentDateOverride?: string | null
  amountStatus?: ForecastAmountStatus | null
  amount?: number | null
  amountEstimatedBasis?: string | null
  skipped?: boolean
  matchedExpenseId?: string | null
}): Promise<void> {
  const { error } = await supabase
    .from('forecast_occurrences')
    .upsert(
      {
        forecast_payment_id: input.forecastPaymentId,
        occurrence_date: input.occurrenceDate,
        installment_sequence_index: input.installmentSequenceIndex ?? 0,
        due_date_override: input.dueDateOverride ?? null,
        expected_payment_date_override: input.expectedPaymentDateOverride ?? null,
        amount_status: input.amountStatus ?? null,
        amount: input.amount ?? null,
        amount_estimated_basis: input.amountEstimatedBasis ?? null,
        skipped: input.skipped ?? false,
        matched_expense_id: input.matchedExpenseId ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'forecast_payment_id,occurrence_date,installment_sequence_index' },
    )
  if (error) throw error
}

// Ajuste UX tras certificación móvil — sustituye TODOS los overrides de CICLO completo (nunca los de un
// cargo suelto de Fase 1D-c: installment_sequence_index=0 exclusivamente) de un plan finito a la vez,
// igual que replaceForecastReminders/replaceForecastPaymentInstallments: borra y vuelve a insertar. Es
// lo que permite que "editar 6→8 cuotas" o "corregir un importe real del recibo" no deje overrides
// fantasma de una versión anterior del plan.
//
// LIMITACIÓN CONOCIDA: como no existe todavía ninguna UI de conciliación bancaria ni de "omitir esta
// cuota" para un plan finito, hoy es seguro borrar y reinsertar sin más — el único sitio que escribe
// estos overrides es este propio formulario. Si en el futuro se añade conciliación (matched_expense_id)
// u "omitir" (skipped) para un plan finito, esta función tendría que fusionar en vez de sustituir sin
// más, para no perder esas filas.
export async function replaceForecastPlanOverrides(
  forecastPaymentId: string,
  overrides: { occurrenceDate: string; dueDateOverride: string | null; amountStatus: ForecastAmountStatus | null; amount: number | null; amountEstimatedBasis: string | null }[],
): Promise<void> {
  const { error: deleteError } = await supabase
    .from('forecast_occurrences')
    .delete()
    .eq('forecast_payment_id', forecastPaymentId)
    .eq('installment_sequence_index', 0)
  if (deleteError) throw deleteError
  if (overrides.length > 0) {
    const { error: insertError } = await supabase.from('forecast_occurrences').insert(
      overrides.map((o) => ({
        forecast_payment_id: forecastPaymentId,
        occurrence_date: o.occurrenceDate,
        installment_sequence_index: 0,
        due_date_override: o.dueDateOverride,
        amount_status: o.amountStatus,
        amount: o.amount,
        amount_estimated_basis: o.amountEstimatedBasis,
      })),
    )
    if (insertError) throw insertError
  }
}
