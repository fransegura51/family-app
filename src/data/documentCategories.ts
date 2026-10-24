import { supabase } from '@/data/supabaseClient'

export interface DocumentCategory {
  id: string
  familyId: string
  name: string
}

// Carpetas que trae toda familia (las mismas que la migración 0055 sembró a las familias que ya existían entonces).
export const DEFAULT_DOCUMENT_CATEGORIES = ['Privada', 'Educación', 'Casa', 'Familia'] as const

async function fetchDocumentCategories(): Promise<DocumentCategory[]> {
  const { data, error } = await supabase
    .from('document_categories')
    .select('id, family_id, name')
    .order('name', { ascending: true })
  if (error) throw error
  return data.map((r) => ({ id: r.id, familyId: r.family_id, name: r.name }))
}

// Una familia nueva no tiene ninguna carpeta: se le crean las de siempre la primera vez que abre Documentos (24/10/2026). Solo si NO tiene ninguna; no hay botón para borrar
// carpetas, así que no se las devolvemos a quien las hubiera quitado.
export async function listDocumentCategories(): Promise<DocumentCategory[]> {
  const first = await fetchDocumentCategories()
  if (first.length > 0) return first
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) return first
  const { data: profileRow } = await supabase.from('profiles').select('family_id').eq('id', userResult.user.id).single()
  if (!profileRow?.family_id) return first
  // Una a una: si otro dispositivo ya creó alguna, el índice único de la tabla rechaza solo esa y se sigue con las demás.
  for (const name of DEFAULT_DOCUMENT_CATEGORIES) {
    await supabase.from('document_categories').insert({ family_id: profileRow.family_id, name })
  }
  return fetchDocumentCategories()
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
