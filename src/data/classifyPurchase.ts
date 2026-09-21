import { supabase } from '@/data/supabaseClient'
import { parseClassifyResult, type ClassifyResult } from '@/domain/classifyPurchase'

// Clasifica de forma ATÓMICA un gasto y su ticket vinculado (RPC classify_purchase, Fase 6C.2C). La base de datos hace todo en una sola
// transacción con los permisos del usuario; aquí solo se llama y se interpreta el resultado estructurado. Un error de red/permisos se
// lanza tal cual (quien llama muestra un mensaje genérico y lo registra); un conflicto o rechazo NO es una excepción: viene en el resultado.
export async function classifyPurchase(input: { expenseId?: string | null; receiptId?: string | null; category: string }): Promise<ClassifyResult> {
  const { data, error } = await supabase.rpc('classify_purchase', {
    p_expense_id: input.expenseId ?? null,
    p_receipt_id: input.receiptId ?? null,
    p_category: input.category,
  })
  if (error) throw error
  return parseClassifyResult(data)
}
