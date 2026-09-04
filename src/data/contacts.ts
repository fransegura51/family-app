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
    .select('id, family_id, name, category, phone, email, notes, birth_date, birthday_favorite')
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
    birthDate: r.birth_date,
    birthdayFavorite: r.birthday_favorite,
  }))
}

export async function addContact(input: {
  name: string
  category: string
  phone: string
  email: string
  notes: string
  birthDate?: string | null
}): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('contacts').insert({
    family_id: familyId,
    name: input.name,
    category: input.category || null,
    phone: input.phone || null,
    email: input.email || null,
    notes: input.notes || null,
    birth_date: input.birthDate || null,
  })
  if (error) throw error
}

// Antes un contacto solo se podía borrar o llamar, nunca editar — si
// se equivocaba el teléfono o quería cambiar la categoría, había que
// borrarlo y crearlo de nuevo (bug/petición real: "hay que poder
// editarla").
export async function updateContact(
  id: string,
  input: { name: string; category: string; phone: string; email: string; notes: string; birthDate: string | null },
): Promise<void> {
  const { error } = await supabase
    .from('contacts')
    .update({
      name: input.name,
      category: input.category || null,
      phone: input.phone || null,
      email: input.email || null,
      notes: input.notes || null,
      birth_date: input.birthDate,
    })
    .eq('id', id)
  if (error) throw error
}

// Para poder ponerle cumpleaños a un contacto ya guardado (p. ej. uno
// importado del teléfono, que nunca trae fecha de nacimiento — la
// Contact Picker API no da esa propiedad) sin tener que borrarlo y
// crearlo de nuevo.
export async function updateContactBirthDate(id: string, birthDate: string | null): Promise<void> {
  const { error } = await supabase.from('contacts').update({ birth_date: birthDate }).eq('id', id)
  if (error) throw error
}

export async function setContactBirthdayFavorite(id: string, favorite: boolean): Promise<void> {
  const { error } = await supabase.from('contacts').update({ birthday_favorite: favorite }).eq('id', id)
  if (error) throw error
}

export async function deleteContact(id: string): Promise<void> {
  const { error } = await supabase.from('contacts').delete().eq('id', id)
  if (error) throw error
}
