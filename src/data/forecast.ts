// Previsión de pagos (Economía) — capa de datos mínima (Fase 1B: infraestructura, sin UI todavía).
import { supabase } from '@/data/supabaseClient'
import { createEvent, updateEvent, deleteEvent } from '@/data/calendar'
import { nextForecastOccurrence } from '@/domain/forecast'
import type {
  ForecastAmountStatus,
  ForecastLoanDetails,
  ForecastLoanInterestType,
  ForecastLoanType,
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
// Fase 1D-e (conciliación bancaria) — CORREGIDO: desde que matchForecastOccurrence puede escribir
// matched_expense_id en una fila de CICLO completo, un borra-y-reinserta puro aquí perdería en silencio
// cualquier conciliación ya hecha con solo reabrir y volver a guardar el formulario del plan (auditoría
// de esta fase, riesgo real de pérdida de dato detectado antes de escribir código). Ahora: nunca se borra
// una fila ya conciliada (matched_expense_id no nulo), y si esa fecha sigue en la lista nueva de
// `overrides`, esa línea en concreto se ignora al insertar (su fecha/importe ya conciliados no se tocan
// desde aquí — editarlos es responsabilidad de desconciliar primero, no de este reemplazo masivo).
export async function replaceForecastPlanOverrides(
  forecastPaymentId: string,
  overrides: { occurrenceDate: string; dueDateOverride: string | null; amountStatus: ForecastAmountStatus | null; amount: number | null; amountEstimatedBasis: string | null }[],
): Promise<void> {
  const { data: matchedRows, error: selectError } = await supabase
    .from('forecast_occurrences')
    .select('occurrence_date')
    .eq('forecast_payment_id', forecastPaymentId)
    .eq('installment_sequence_index', 0)
    .not('matched_expense_id', 'is', null)
  if (selectError) throw selectError
  const matchedDates = new Set((matchedRows ?? []).map((r) => r.occurrence_date as string))

  const { error: deleteError } = await supabase
    .from('forecast_occurrences')
    .delete()
    .eq('forecast_payment_id', forecastPaymentId)
    .eq('installment_sequence_index', 0)
    .is('matched_expense_id', null)
  if (deleteError) throw deleteError

  const rowsToInsert = overrides.filter((o) => !matchedDates.has(o.occurrenceDate))
  if (rowsToInsert.length > 0) {
    const { error: insertError } = await supabase.from('forecast_occurrences').insert(
      rowsToInsert.map((o) => ({
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

// ── Fase 1D-e — conciliación bancaria ──────────────────────────────────────────────────────────────
//
// matchForecastOccurrence: RPC atómica (ver migración 0157) — nunca un upsert de cliente normal, porque
// hace falta la protección real contra condiciones de carrera (doble clic, dos pestañas, reintento de
// sincronización) que un upsert de PostgREST no puede dar por sí solo: el índice único parcial de
// forecast_occurrences.matched_expense_id garantiza que un mismo expense nunca concilie dos ocurrencias, y
// la función rechaza con un error explícito (nunca en silencio) reconciliar una ocurrencia que YA estaba
// conciliada con OTRO expense distinto. Confirmar la MISMA pareja dos veces es idempotente sin error.
export interface ForecastReconciliationSnapshot {
  amountStatus: ForecastAmountStatus
  amount: number | null
  amountEstimatedBasis: string | null
}

const FORECAST_OCCURRENCE_ALREADY_MATCHED = 'forecast_occurrence_already_matched'

export async function matchForecastOccurrence(
  forecastPaymentId: string,
  occurrenceDate: string,
  installmentSequenceIndex: number | null,
  expenseId: string,
  snapshot: ForecastReconciliationSnapshot,
): Promise<void> {
  const { error } = await supabase.rpc('match_forecast_occurrence', {
    p_forecast_payment_id: forecastPaymentId,
    p_occurrence_date: occurrenceDate,
    p_installment_sequence_index: installmentSequenceIndex,
    p_expense_id: expenseId,
    p_amount_status: snapshot.amountStatus,
    p_amount: snapshot.amount,
    p_amount_estimated_basis: snapshot.amountEstimatedBasis,
  })
  if (error) {
    if (error.message?.includes(FORECAST_OCCURRENCE_ALREADY_MATCHED)) {
      throw new Error('Este pago ya se había conciliado con otro movimiento distinto — desconcílialo primero si quieres cambiarlo.')
    }
    throw error
  }
}

// Desconciliar: solo quita el vínculo (nunca borra bank_transactions/expenses/forecast_payments/la propia
// fila de override — el importe/fecha que ya tuviera esa ocurrencia, si los tenía, se conservan tal
// cual). Condicionado al expense que se cree desconciliar: si ya no coincide (alguien lo cambió o ya se
// había desconciliado), no hace nada — idempotente, nunca un error por reintentar.
export async function unmatchForecastOccurrence(
  forecastPaymentId: string,
  occurrenceDate: string,
  installmentSequenceIndex: number | null,
  expenseId: string,
): Promise<void> {
  const { error } = await supabase
    .from('forecast_occurrences')
    .update({ matched_expense_id: null, updated_at: new Date().toISOString() })
    .eq('forecast_payment_id', forecastPaymentId)
    .eq('occurrence_date', occurrenceDate)
    .eq('installment_sequence_index', installmentSequenceIndex ?? 0)
    .eq('matched_expense_id', expenseId)
  if (error) throw error
}

// Todos los expense_id ya usados por CUALQUIER ocurrencia de CUALQUIER previsión de la familia (RLS ya
// acota a la familia actual) — para que el motor de candidatos (domain/forecastReconciliation.ts) nunca
// proponga dos veces el mismo movimiento aunque encajara igual de bien con dos previsiones distintas.
export async function listAllMatchedForecastExpenseIds(): Promise<Set<string>> {
  const { data, error } = await supabase.from('forecast_occurrences').select('matched_expense_id').not('matched_expense_id', 'is', null)
  if (error) throw error
  return new Set((data ?? []).map((r) => r.matched_expense_id as string))
}

// ── Fase 1D-g — descartes de posibles pagos recurrentes ("No me interesa") ────────────────────────
//
// Clave `${accountId}::${merchantKey}` — la misma forma que ya usa domain/forecastRecurrenceDetection.ts
// para comparar contra los descartes guardados, así el dato de la BD y la clave del motor de detección
// nunca pueden desincronizarse por transformarse de dos formas distintas.
export async function listForecastRecurrenceDismissals(): Promise<Set<string>> {
  const { data, error } = await supabase.from('forecast_recurrence_dismissals').select('account_id, merchant_key')
  if (error) throw error
  return new Set((data ?? []).map((r) => `${r.account_id}::${r.merchant_key}`))
}

// Descartar el mismo patrón dos veces es idempotente (upsert por la unique de la migración 0158) —
// nunca un error por volver a pulsar "No me interesa" en la misma propuesta.
export async function dismissForecastRecurrence(accountId: string, merchantKey: string): Promise<void> {
  const { familyId, userId } = await currentFamilyAndUser()
  const { error } = await supabase
    .from('forecast_recurrence_dismissals')
    .upsert(
      { family_id: familyId, account_id: accountId, merchant_key: merchantKey, dismissed_by: userId },
      { onConflict: 'family_id,account_id,merchant_key' },
    )
  if (error) throw error
}

// ── Fase 1E.0/1E.1 — infraestructura de préstamos/hipotecas (forecast_loan_details) ────────────────
//
// Solo infraestructura: SIN UI todavía. La relación con forecast_payments es 1:1 opcional — un
// forecast_payment sin fila aquí es simplemente un pago recurrente normal.
interface ForecastLoanDetailsRow {
  id: string
  family_id: string
  forecast_payment_id: string
  loan_type: string | null
  bank_reference: string | null
  contract_reference: string | null
  original_principal_cents: number | null
  outstanding_principal_cents: number | null
  principal_as_of_date: string | null
  interest_rate_bps: number | null
  interest_type: string | null
  maturity_date: string | null
  remaining_installments: number | null
  last_verified_at: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

const FORECAST_LOAN_DETAILS_COLUMNS =
  'id, family_id, forecast_payment_id, loan_type, bank_reference, contract_reference, original_principal_cents, ' +
  'outstanding_principal_cents, principal_as_of_date, interest_rate_bps, interest_type, maturity_date, ' +
  'remaining_installments, last_verified_at, notes, created_by, created_at, updated_at'

function toForecastLoanDetails(row: ForecastLoanDetailsRow): ForecastLoanDetails {
  return {
    id: row.id,
    familyId: row.family_id,
    forecastPaymentId: row.forecast_payment_id,
    loanType: row.loan_type as ForecastLoanType | null,
    bankReference: row.bank_reference,
    contractReference: row.contract_reference,
    originalPrincipalCents: row.original_principal_cents,
    outstandingPrincipalCents: row.outstanding_principal_cents,
    principalAsOfDate: row.principal_as_of_date,
    interestRateBps: row.interest_rate_bps,
    interestType: row.interest_type as ForecastLoanInterestType | null,
    maturityDate: row.maturity_date,
    remainingInstallments: row.remaining_installments,
    lastVerifiedAt: row.last_verified_at,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export interface ForecastLoanDetailsInput {
  loanType: ForecastLoanType | null
  bankReference: string | null
  contractReference: string | null
  originalPrincipalCents: number | null
  outstandingPrincipalCents: number | null
  principalAsOfDate: string | null
  interestRateBps: number | null
  interestType: ForecastLoanInterestType | null
  maturityDate: string | null
  remainingInstallments: number | null
  lastVerifiedAt: string | null
  notes: string | null
}

// null si el pago previsto todavía no está clasificado como préstamo (caso normal, la inmensa mayoría).
export async function getLoanDetails(forecastPaymentId: string): Promise<ForecastLoanDetails | null> {
  const { data, error } = await supabase.from('forecast_loan_details').select(FORECAST_LOAN_DETAILS_COLUMNS).eq('forecast_payment_id', forecastPaymentId).maybeSingle()
  if (error) throw error
  return data ? toForecastLoanDetails(data as unknown as ForecastLoanDetailsRow) : null
}

// Todos los préstamos/hipotecas de la familia (RLS ya acota) — para una futura sección "🏦 Préstamos e
// hipotecas" que necesite listarlos todos de una vez, cruzados con sus forecast_payments.
export async function listLoanDetails(): Promise<ForecastLoanDetails[]> {
  const { data, error } = await supabase.from('forecast_loan_details').select(FORECAST_LOAN_DETAILS_COLUMNS)
  if (error) throw error
  return (data as unknown as ForecastLoanDetailsRow[] | null ?? []).map(toForecastLoanDetails)
}

// Marcar un pago previsto como préstamo — Nivel 1 (todos los campos de input en null, salvo quizá
// loanType) es una llamada perfectamente válida: "sabemos que es un préstamo, no sabemos más todavía".
export async function createLoanDetails(forecastPaymentId: string, input: ForecastLoanDetailsInput): Promise<string> {
  const { familyId, userId } = await currentFamilyAndUser()
  const { data, error } = await supabase
    .from('forecast_loan_details')
    .insert({
      family_id: familyId,
      forecast_payment_id: forecastPaymentId,
      loan_type: input.loanType,
      bank_reference: input.bankReference,
      contract_reference: input.contractReference,
      original_principal_cents: input.originalPrincipalCents,
      outstanding_principal_cents: input.outstandingPrincipalCents,
      principal_as_of_date: input.principalAsOfDate,
      interest_rate_bps: input.interestRateBps,
      interest_type: input.interestType,
      maturity_date: input.maturityDate,
      remaining_installments: input.remainingInstallments,
      last_verified_at: input.lastVerifiedAt,
      notes: input.notes,
      created_by: userId,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

// Actualización posterior de capital/interés/vencimiento/etc. — nunca resta la cuota del capital
// pendiente anterior (eso vive en la UI/dominio que llame a esto, nunca aquí: una cuota mezcla
// amortización de capital e interés en proporción variable, nunca calculable sin el cuadro de
// amortización real).
export async function updateLoanDetails(id: string, input: ForecastLoanDetailsInput): Promise<void> {
  const { error } = await supabase
    .from('forecast_loan_details')
    .update({
      loan_type: input.loanType,
      bank_reference: input.bankReference,
      contract_reference: input.contractReference,
      original_principal_cents: input.originalPrincipalCents,
      outstanding_principal_cents: input.outstandingPrincipalCents,
      principal_as_of_date: input.principalAsOfDate,
      interest_rate_bps: input.interestRateBps,
      interest_type: input.interestType,
      maturity_date: input.maturityDate,
      remaining_installments: input.remainingInstallments,
      last_verified_at: input.lastVerifiedAt,
      notes: input.notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error
}

// Quitar la clasificación de "préstamo" sin borrar el forecast_payment — el pago previsto sigue
// existiendo normal, solo deja de tener detalle de préstamo asociado.
export async function deleteLoanDetails(id: string): Promise<void> {
  const { error } = await supabase.from('forecast_loan_details').delete().eq('id', id)
  if (error) throw error
}
