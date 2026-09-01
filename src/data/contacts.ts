import { supabase } from '@/data/supabaseClient'
import type { Contact } from '@/domain/types'

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

export async function listContacts(): Promise<Contact[]> {
  const { data, error } = await supabase
    .from('contacts')
    .select('id, family_id, name, category, phone, email, notes')
    .order('name', { ascending: true })
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    familyId: r.family_id,
    name: r.name,
    category: r.category,
    phone: r.phone,
    email: r.email,
    notes: r.notes,
  }))
}

export async function addContact(input: {
  name: string
  category: string
  phone: string
  email: string
  notes: string
}): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('contacts').insert({
    family_id: familyId,
    name: input.name,
    category: input.category || null,
    phone: input.phone || null,
    email: input.email || null,
    notes: input.notes || null,
  })
  if (error) throw error
}

export async function deleteContact(id: string): Promise<void> {
  const { error } = await supabase.from('contacts').delete().eq('id', id)
  if (error) throw error
}
