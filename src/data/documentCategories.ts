import { supabase } from '@/data/supabaseClient'

export interface DocumentCategory {
  id: string
  familyId: string
  name: string
}

export async function listDocumentCategories(): Promise<DocumentCategory[]> {
  const { data, error } = await supabase
    .from('document_categories')
    .select('id, family_id, name')
    .order('name', { ascending: true })
  if (error) throw error
  return data.map((r) => ({ id: r.id, familyId: r.family_id, name: r.name }))
}

export async function createDocumentCategory(name: string): Promise<void> {
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  const { data: profileRow, error: profileError } = await supabase
    .from('profiles')
    .select('family_id')
    .eq('id', userResult.user.id)
    .single()
  if (profileError) throw profileError

  const { error } = await supabase.from('document_categories').insert({ family_id: profileRow.family_id, name: name.trim() })
  if (error) throw error
}
