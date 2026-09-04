import { supabase } from '@/data/supabaseClient'
import { compressImageFile } from '@/domain/imageCompression'
import type { Receipt } from '@/domain/types'

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
  const { data, error } = await supabase
    .from('receipts')
    .select('id, family_id, storage_path, store, receipt_date, total_amount, expense_id, notes')
    .order('receipt_date', { ascending: false })
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    familyId: r.family_id,
    storagePath: r.storage_path,
    store: r.store,
    receiptDate: r.receipt_date,
    totalAmount: r.total_amount != null ? Number(r.total_amount) : null,
    expenseId: r.expense_id,
    notes: r.notes,
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
}): Promise<void> {
  const familyId = await currentFamilyId()
  const file = await compressImageFile(input.file)
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${familyId}/${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await supabase.storage.from('receipts').upload(path, file)
  if (uploadError) throw uploadError

  let expenseId: string | null = null
  if (input.totalAmount != null) {
    const { data: expense, error: expenseError } = await supabase
      .from('expenses')
      .insert({
        family_id: familyId,
        expense_date: input.receiptDate,
        amount: input.totalAmount,
        category: 'Alimentación',
        store: input.store || null,
        kind: 'real',
      })
      .select('id')
      .single()
    if (expenseError) throw expenseError
    expenseId = expense.id
  }

  const { error: receiptError } = await supabase.from('receipts').insert({
    family_id: familyId,
    storage_path: path,
    store: input.store || null,
    receipt_date: input.receiptDate,
    total_amount: input.totalAmount,
    expense_id: expenseId,
  })
  if (receiptError) throw receiptError
}

// Al editar, mantiene el gasto REAL enlazado al día — lo crea si el
// ticket no tenía importe al guardarlo la primera vez, lo actualiza si
// ya existía, y lo borra si se deja el importe en blanco (bug real: al
// editar el importe de un ticket ya guardado, ese cambio no se
// reflejaba en Gastos porque antes solo se tocaba la fila del ticket).
export async function updateReceipt(
  id: string,
  input: { store: string; receiptDate: string; totalAmount: number | null },
): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from('receipts')
    .select('expense_id')
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
          category: 'Alimentación',
          store: input.store || null,
          kind: 'real',
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
// repetido, el importe seguía contando de más).
export async function deleteReceipt(receipt: Receipt): Promise<void> {
  if (receipt.storagePath) await supabase.storage.from('receipts').remove([receipt.storagePath])
  const { error } = await supabase.from('receipts').delete().eq('id', receipt.id)
  if (error) throw error
  if (receipt.expenseId) {
    await supabase.from('expenses').delete().eq('id', receipt.expenseId)
  }
}
