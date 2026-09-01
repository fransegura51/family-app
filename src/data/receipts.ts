import { supabase } from '@/data/supabaseClient'
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
  const ext = input.file.name.split('.').pop() || 'jpg'
  const path = `${familyId}/${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await supabase.storage.from('receipts').upload(path, input.file)
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

export async function getReceiptUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('receipts').createSignedUrl(storagePath, 3600)
  if (error) throw error
  return data.signedUrl
}

export async function deleteReceipt(receipt: Receipt): Promise<void> {
  await supabase.storage.from('receipts').remove([receipt.storagePath])
  const { error } = await supabase.from('receipts').delete().eq('id', receipt.id)
  if (error) throw error
}
