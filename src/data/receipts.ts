import { fetchAllRows } from '@/data/paginate'
import { supabase } from '@/data/supabaseClient'
import { compressImageFile } from '@/domain/imageCompression'
import { toDateStr } from '@/domain/dateRanges'
import type { Receipt } from '@/domain/types'

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00')
  d.setDate(d.getDate() + days)
  return toDateStr(d)
}

function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(a + 'T00:00').getTime() - new Date(b + 'T00:00').getTime()) / 86_400_000
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

export async function listReceipts(): Promise<Receipt[]> {
  const data = await fetchAllRows((from, to) =>
    supabase
      .from('receipts')
      .select('id, family_id, storage_path, store, receipt_date, total_amount, expense_id, notes, category, purchased_by_member_id')
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
  }))
}

// Sube el archivo (foto/PDF) al bucket privado "receipts" bajo
// <family_id>/, guarda sus datos a mano, y crea el gasto REAL asociado
// (Skill 17) para que aparezca también en Dinero → Gastos. No hay OCR:
// el usuario escribe establecimiento/fecha/importe él mismo.
export async function uploadReceipt(input: {
  file: File
  store: string
  receiptDate: string
  totalAmount: number | null
  // null = categoría todavía desconocida (pendiente de clasificar): el ticket es igualmente válido. Nunca se sustituye por una inventada.
  category: string | null
  purchasedByMemberId: string | null
}): Promise<string> {
  const familyId = await currentFamilyId()
  const file = await compressImageFile(input.file)
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${familyId}/${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await supabase.storage.from('receipts').upload(path, file)
  if (uploadError) throw uploadError

  let expenseId: string | null = null
  if (input.totalAmount != null) {
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
    const { data: candidates } = await supabase
      .from('expenses')
      .select('id, amount, expense_date')
      .eq('family_id', familyId)
      .eq('source', 'banco')
      .eq('is_income', false)
      .gte('expense_date', addDays(input.receiptDate, -7))
      .lte('expense_date', addDays(input.receiptDate, 7))
    // Con ±7 días cabe más de un candidato del mismo importe exacto —
    // se queda con el de fecha más cercana al ticket, no el primero que
    // devuelva la consulta (sin orden garantizado).
    const match = (candidates ?? [])
      .filter((c) => Math.abs(Number(c.amount) - input.totalAmount!) < 0.01)
      .sort((a, b) => daysBetween(a.expense_date, input.receiptDate) - daysBetween(b.expense_date, input.receiptDate))[0]

    if (match) {
      const { data: alreadyLinked } = await supabase.from('receipts').select('id').eq('expense_id', match.id).maybeSingle()
      if (!alreadyLinked) {
        const { error: updateExpenseError } = await supabase
          .from('expenses')
          // Sin categoría en el ticket (NULL) no se pisa la que ya tenga el gasto del banco.
          .update({ source: 'ticket_banco', ...(input.category != null ? { category: input.category } : {}), store: input.store || null })
          .eq('id', match.id)
        if (updateExpenseError) throw updateExpenseError
        expenseId = match.id
      }
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
          source: 'ticket',
        })
        .select('id')
        .single()
      if (expenseError) throw expenseError
      expenseId = expense.id
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
    })
    .select('id')
    .single()
  if (receiptError) throw receiptError
  return receiptRow.id
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
  },
): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from('receipts')
    .select('expense_id, category')
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
  } else if (expenseId) {
    const { error: deleteExpenseError } = await supabase.from('expenses').delete().eq('id', expenseId)
    if (deleteExpenseError) throw deleteExpenseError
    expenseId = null
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
export async function deleteReceipt(receipt: Receipt): Promise<void> {
  if (receipt.storagePath) await supabase.storage.from('receipts').remove([receipt.storagePath])
  const { error } = await supabase.from('receipts').delete().eq('id', receipt.id)
  if (error) throw error
  if (receipt.expenseId) {
    await supabase.from('expenses').delete().eq('id', receipt.expenseId)
  }
}
