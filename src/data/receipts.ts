import { deletePurchase } from '@/data/cash'
import { fetchAllRows } from '@/data/paginate'
import { supabase } from '@/data/supabaseClient'
import { compressImageFile } from '@/domain/imageCompression'
import { toDateStr } from '@/domain/dateRanges'
import { pickTicketExpenseMatch, sourceAfterTicketMatch, TICKET_MATCH_SOURCES, TICKET_MATCH_WINDOW_DAYS } from '@/domain/ticketExpenseMatch'
import type { Receipt } from '@/domain/types'

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00')
  d.setDate(d.getDate() + days)
  return toDateStr(d)
}

async function currentFamilyId(): Promise<string> {
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  const { data: profileRow, error } = await supabase
    .from('profiles')
    .select('family_id')
    .eq('id', userResult.user.id)
    .single()
  if (error) throw error
  return profileRow.family_id
}

// Id del perfil que está usando la app (= auth.uid); null si no hay sesión. Sirve para proponer «quién pagó» por defecto.
export async function currentProfileId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

// Compras apuntadas a mano que todavía no tienen justificante: candidatas a recibir un ticket que se sube después.
export async function listManualPurchasesWithoutTicket(): Promise<Receipt[]> {
  return (await listReceipts()).filter((r) => r.isManual && !r.storagePath)
}

export async function listReceipts(): Promise<Receipt[]> {
  const data = await fetchAllRows((from, to) =>
    supabase
      .from('receipts')
      .select('id, family_id, storage_path, store, receipt_date, total_amount, expense_id, notes, category, purchased_by_member_id, discount_total, is_manual, payment_method')
      .order('receipt_date', { ascending: false })
      .order('id')
      .range(from, to),
  )
  return data.map((r) => ({
    id: r.id,
    familyId: r.family_id,
    storagePath: r.storage_path,
    store: r.store,
    receiptDate: r.receipt_date,
    totalAmount: r.total_amount != null ? Number(r.total_amount) : null,
    expenseId: r.expense_id,
    notes: r.notes,
    category: r.category,
    purchasedByMemberId: r.purchased_by_member_id,
    discountTotal: r.discount_total != null ? Number(r.discount_total) : 0,
    isManual: r.is_manual === true,
    paymentMethod: r.payment_method ?? null,
  }))
}

// ¿Existe ya un gasto de esa misma compra (el del banco, uno ya enlazado al banco o apuntado a mano) al que unir este ticket, en vez de crear otro? Mismo criterio
// (importe exacto, ±7 días, sin ticket propio ya enlazado) en el alta y en la edición, para que ningún camino deje la compra contada dos veces.
async function findExistingExpenseForTicket(familyId: string, input: { amount: number; receiptDate: string; isManual: boolean }) {
  const { data: candidates } = await supabase
    .from('expenses')
    .select('id, amount, expense_date, source')
    .eq('family_id', familyId)
    .in('source', input.isManual ? ['banco'] : [...TICKET_MATCH_SOURCES])
    .eq('is_income', false)
    .gte('expense_date', addDays(input.receiptDate, -TICKET_MATCH_WINDOW_DAYS))
    .lte('expense_date', addDays(input.receiptDate, TICKET_MATCH_WINDOW_DAYS))
  const candidateIds = (candidates ?? []).map((c) => c.id as string)
  const { data: linkedRows } = candidateIds.length > 0 ? await supabase.from('receipts').select('expense_id').in('expense_id', candidateIds) : { data: [] }
  const linkedIds = new Set((linkedRows ?? []).map((r) => r.expense_id as string))
  return pickTicketExpenseMatch(
    (candidates ?? []).map((c) => ({ id: c.id as string, amount: c.amount as number, expense_date: c.expense_date as string, source: c.source as string })),
    { amount: input.amount, receiptDate: input.receiptDate },
    linkedIds,
  )
}

// Sube el archivo (foto/PDF) al bucket privado "receipts" bajo
// <family_id>/, guarda sus datos a mano, y crea el gasto REAL asociado
// (Skill 17) para que aparezca también en Dinero → Gastos. No hay OCR:
// el usuario escribe establecimiento/fecha/importe él mismo.
export async function uploadReceipt(input: {
  // null = compra manual SIN ticket (el justificante se puede añadir después con attachReceiptFile).
  file: File | null
  store: string
  receiptDate: string
  totalAmount: number | null
  // null = categoría todavía desconocida (pendiente de clasificar): el ticket es igualmente válido. Nunca se sustituye por una inventada.
  category: string | null
  purchasedByMemberId: string | null
  // Suma (€, positiva) de las líneas de descuento del ticket; 0 si no hay.
  discountTotal?: number
  // Compra apuntada a mano: su gasto nace con source 'manual' (que el banco y los tickets posteriores ya concilian sin duplicar).
  isManual?: boolean
  paymentMethod?: string | null
  // Compra manual que YA existe como gasto apuntado a mano en Economía (elegido por la familia): se enlaza a él y NO se crea otro gasto.
  linkExpenseId?: string | null
}): Promise<string> {
  const familyId = await currentFamilyId()
  const path = input.file ? await uploadReceiptFile(familyId, input.file) : null
  // Un gasto que NO hemos creado nosotros (el del banco al que se une la compra) no se borra si falla el guardado; uno nuevo sí.
  let createdExpenseId: string | null = null

  let expenseId: string | null = null
  // Un pago en efectivo (o repartido entre varios medios) no se une a un apunte bancario por el total. Una compra manual solo se une a un gasto del banco aún sin
  // compra propia (nunca a otra compra manual: dos panes iguales en la misma semana son dos compras).
  const mayMatchExisting = !(input.paymentMethod === 'efectivo' || input.paymentMethod === 'mixto')
  if (input.linkExpenseId) {
    expenseId = input.linkExpenseId
    // El gasto ya existía: solo se le anota cómo se pagó (si no lo tenía), para que el efectivo no se concilie con el banco.
    if (input.paymentMethod) await supabase.from('expenses').update({ payment_method: input.paymentMethod }).eq('id', expenseId).is('payment_method', null)
  } else if (input.totalAmount != null) {
    // Bug real: "he mandado los tickets... pero no los ha conciliado
    // con las compras que ya estaban generadas, se han duplicado" — el
    // banco puede haber traído ya este mismo gasto antes de subir el
    // ticket (source 'banco', sin ticket propio todavía). Mismo
    // criterio ±7 días/importe exacto que usa
    // enable-banking-sync-transactions al revés (banco→ticket), para
    // enlazar el ticket a ESE gasto en vez de crear uno duplicado. Antes
    // era ±3 días, pero se vio en producción un ticket fotografiado 4
    // días después de la compra (fin de semana) que se coló como
    // duplicado por quedarse fuera del margen.
    // Orígenes: «banco», uno ya enlazado al banco sin ticket propio («ticket_banco», p. ej. un apunte a mano que el banco ya unió) o apuntado a mano
    // (ver domain/ticketExpenseMatch.ts). Se pide el conjunto de gastos que ya tienen ticket para no robarle el gasto a otro.
    const match = !mayMatchExisting ? null : await findExistingExpenseForTicket(familyId, { amount: input.totalAmount, receiptDate: input.receiptDate, isManual: input.isManual === true })

    if (match) {
      const { error: updateExpenseError } = await supabase
        .from('expenses')
        // Sin categoría en el ticket (NULL) no se pisa la que ya tenga el gasto.
        .update({ source: sourceAfterTicketMatch(match.source), ...(input.category != null ? { category: input.category } : {}), store: input.store || null })
        .eq('id', match.id)
      if (updateExpenseError) throw updateExpenseError
      expenseId = match.id
    }

    if (expenseId === null) {
      const { data: expense, error: expenseError } = await supabase
        .from('expenses')
        .insert({
          family_id: familyId,
          expense_date: input.receiptDate,
          amount: input.totalAmount,
          category: input.category,
          store: input.store || null,
          kind: 'real',
          source: input.isManual ? 'manual' : 'ticket',
          payment_method: input.paymentMethod || null,
        })
        .select('id')
        .single()
      if (expenseError) throw expenseError
      expenseId = expense.id
      createdExpenseId = expense.id
    }
  }

  const { data: receiptRow, error: receiptError } = await supabase
    .from('receipts')
    .insert({
      family_id: familyId,
      storage_path: path,
      store: input.store || null,
      receipt_date: input.receiptDate,
      total_amount: input.totalAmount,
      expense_id: expenseId,
      category: input.category,
      purchased_by_member_id: input.purchasedByMemberId,
      discount_total: input.discountTotal ?? 0,
      is_manual: input.isManual === true,
      payment_method: input.paymentMethod || null,
    })
    .select('id')
    .single()
  if (receiptError) {
    if (createdExpenseId) await supabase.from('expenses').delete().eq('id', createdExpenseId)
    if (path) await supabase.storage.from('receipts').remove([path])
    throw receiptError
  }
  return receiptRow.id
}

async function uploadReceiptFile(familyId: string, original: File): Promise<string> {
  const file = await compressImageFile(original)
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${familyId}/${crypto.randomUUID()}.${ext}`
  const { error: uploadError } = await supabase.storage.from('receipts').upload(path, file)
  if (uploadError) throw uploadError
  return path
}

// JUSTIFICANTE POSTERIOR: añade la foto/PDF a una compra YA guardada (p. ej. una compra manual). Es la MISMA fila y el MISMO gasto: no crea otra
// compra ni otro gasto, así que Economía no cuenta nada dos veces. Solo rellena lo que la compra aún no tenía (nunca pisa tienda, importe,
// categoría ni quién pagó). Si la compra ya tiene justificante no hace nada (devuelve false).
export async function attachReceiptFile(receiptId: string, file: File): Promise<boolean> {
  const familyId = await currentFamilyId()
  const { data: existing, error: fetchError } = await supabase.from('receipts').select('storage_path').eq('id', receiptId).single()
  if (fetchError) throw fetchError
  if (existing.storage_path) return false
  const path = await uploadReceiptFile(familyId, file)
  // Condición storage_path IS NULL: si otro dispositivo se adelantó, no se pisa su justificante.
  const { data: updated, error } = await supabase.from('receipts').update({ storage_path: path }).eq('id', receiptId).is('storage_path', null).select('id')
  if (error || !updated || updated.length === 0) {
    await supabase.storage.from('receipts').remove([path])
    if (error) throw error
    return false
  }
  return true
}

// Al editar, mantiene el gasto REAL enlazado al día — lo crea si el
// ticket no tenía importe al guardarlo la primera vez, lo actualiza si
// ya existía, y lo borra si se deja el importe en blanco (bug real: al
// editar el importe de un ticket ya guardado, ese cambio no se
// reflejaba en Gastos porque antes solo se tocaba la fila del ticket).
export async function updateReceipt(
  id: string,
  input: {
    store: string
    receiptDate: string
    totalAmount: number | null
    // `undefined` = NO tocar la categoría (ni la del ticket ni la de su gasto): la categoría de una compra solo cambia a través de
    // classify_purchase (atómica gasto ↔ ticket, Fase 6C.2C). null/string se conservan por compatibilidad con quien aún la manda.
    category?: string | null
    purchasedByMemberId: string | null
    // undefined = no tocar la forma de pago.
    paymentMethod?: string | null
  },
): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from('receipts')
    .select('expense_id, category, is_manual, payment_method')
    .eq('id', id)
    .single()
  if (fetchError) throw fetchError

  let expenseId: string | null = existing.expense_id

  if (input.totalAmount != null) {
    if (expenseId) {
      const { error: updateExpenseError } = await supabase
        .from('expenses')
        .update({
          expense_date: input.receiptDate,
          amount: input.totalAmount,
          // Sin categoría en el ticket (NULL) no se borra la categoría real que pueda tener su gasto.
          ...(input.category != null ? { category: input.category } : {}),
          store: input.store || null,
        })
        .eq('id', expenseId)
      if (updateExpenseError) throw updateExpenseError
    } else {
      const familyId = await currentFamilyId()
      // Antes de crear otro gasto: ¿ya existe el de esta compra (p. ej. el del banco)? Efectivo y pagos mixtos no se unen al banco por el total.
      const method = input.paymentMethod !== undefined ? input.paymentMethod : (existing.payment_method as string | null)
      const match = method === 'efectivo' || method === 'mixto' ? null : await findExistingExpenseForTicket(familyId, { amount: input.totalAmount, receiptDate: input.receiptDate, isManual: existing.is_manual === true })
      if (match) {
        const { error: matchError } = await supabase
          .from('expenses')
          .update({ source: sourceAfterTicketMatch(match.source), ...(input.category != null ? { category: input.category } : {}), store: input.store || null })
          .eq('id', match.id)
        if (matchError) throw matchError
        expenseId = match.id
      } else {
        const { data: expense, error: insertExpenseError } = await supabase
          .from('expenses')
          .insert({
            family_id: familyId,
            expense_date: input.receiptDate,
            amount: input.totalAmount,
            // Un gasto nuevo hereda la categoría del ticket (o la que se mande); un ticket pendiente (NULL) da un gasto pendiente, sin inventar nada.
            category: input.category !== undefined ? input.category : existing.category,
            store: input.store || null,
            kind: 'real',
            source: 'ticket',
          })
          .select('id')
          .single()
        if (insertExpenseError) throw insertExpenseError
        expenseId = expense.id
      }
    }
  } else if (expenseId) {
    const { error: deleteExpenseError } = await supabase.from('expenses').delete().eq('id', expenseId)
    if (deleteExpenseError) throw deleteExpenseError
    expenseId = null
  }

  if (expenseId && input.paymentMethod !== undefined) {
    const { error: pmError } = await supabase.from('expenses').update({ payment_method: input.paymentMethod || null }).eq('id', expenseId)
    if (pmError) throw pmError
  }

  const { error } = await supabase
    .from('receipts')
    .update({
      store: input.store || null,
      receipt_date: input.receiptDate,
      total_amount: input.totalAmount,
      expense_id: expenseId,
      ...(input.category !== undefined ? { category: input.category } : {}),
      purchased_by_member_id: input.purchasedByMemberId,
      ...(input.paymentMethod !== undefined ? { payment_method: input.paymentMethod || null } : {}),
    })
    .eq('id', id)
  if (error) throw error
}

export async function getReceiptUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('receipts').createSignedUrl(storagePath, 3600)
  if (error) throw error
  return data.signedUrl
}

// Borra también el gasto real enlazado, si lo hay — si no, borrar un
// ticket duplicado dejaba un "gasto fantasma" en Gastos que seguía
// sumando en el resumen del mes (bug real: al borrar un ticket
// repetido, el importe seguía contando de más). Los precios del
// Historial que vinieron de este ticket (product_prices.receipt_id)
// se borran solos por el ON DELETE CASCADE de la base de datos — así
// una lectura de OCR equivocada no se queda para siempre en el
// Historial tras borrar y volver a subir el ticket bien.
// Borrado SEGURO (migración 0312, delete_purchase): una sola operación en el servidor que deja las carteras coherentes, conserva siempre los
// movimientos bancarios originales y anota una foto para poder deshacerlo. La foto del ticket se borra DESPUÉS, solo si el servidor lo ha aceptado.
// Devuelve el id del registro para deshacer.
export async function deletePurchaseSafely(receipt: Receipt): Promise<string> {
  const logId = await deletePurchase(receipt.id)
  if (receipt.storagePath) await supabase.storage.from('receipts').remove([receipt.storagePath])
  return logId
}

export async function deleteReceipt(receipt: Receipt): Promise<void> {
  if (receipt.storagePath) await supabase.storage.from('receipts').remove([receipt.storagePath])
  const { error } = await supabase.from('receipts').delete().eq('id', receipt.id)
  if (error) throw error
  if (receipt.expenseId) {
    await supabase.from('expenses').delete().eq('id', receipt.expenseId)
  }
}
