import { supabase } from '@/data/supabaseClient'
import type { ContactPatch } from '@/domain/contactsModel'
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

const CONTACT_COLS =
  'id, family_id, name, category, phone, email, notes, birth_date, birthday_favorite, surname, nickname, whatsapp_name, extra_phones, extra_emails, extra_categories, address, source'

/* eslint-disable @typescript-eslint/no-explicit-any */
export const toContact = (r: any): Contact => ({
  id: r.id,
  familyId: r.family_id,
  name: r.name,
  category: r.category,
  phone: r.phone,
  email: r.email,
  notes: r.notes,
  birthDate: r.birth_date,
  birthdayFavorite: r.birthday_favorite,
  surname: r.surname ?? null,
  nickname: r.nickname ?? null,
  whatsappName: r.whatsapp_name ?? null,
  extraPhones: r.extra_phones ?? [],
  extraEmails: r.extra_emails ?? [],
  extraCategories: r.extra_categories ?? [],
  address: r.address ?? null,
  source: r.source ?? null,
})
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function listContacts(): Promise<Contact[]> {
  const { data, error } = await supabase.from('contacts').select(CONTACT_COLS).order('name', { ascending: true })
  if (error) throw error
  return data.map(toContact)
}

/** Datos opcionales de la ficha ampliada (0354). Todo es opcional: los contactos de siempre no necesitan nada de esto. */
export interface ContactExtras {
  surname?: string | null
  nickname?: string | null
  whatsappName?: string | null
  extraPhones?: string[]
  extraEmails?: string[]
  extraCategories?: string[]
  address?: string | null
  source?: { kind: string; at?: string; detail?: string } | null
}

const cleanList = (l: string[] | undefined) => (l ?? []).map((x) => x.trim()).filter(Boolean)
const orNull = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null)

function extrasRow(e: ContactExtras): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (e.surname !== undefined) row.surname = orNull(e.surname)
  if (e.nickname !== undefined) row.nickname = orNull(e.nickname)
  if (e.whatsappName !== undefined) row.whatsapp_name = orNull(e.whatsappName)
  if (e.extraPhones !== undefined) row.extra_phones = cleanList(e.extraPhones)
  if (e.extraEmails !== undefined) row.extra_emails = cleanList(e.extraEmails)
  if (e.extraCategories !== undefined) row.extra_categories = cleanList(e.extraCategories)
  if (e.address !== undefined) row.address = orNull(e.address)
  if (e.source !== undefined) row.source = e.source
  return row
}

/** Crea un contacto en la agenda de siempre y devuelve su id. */
export async function addContactReturningId(
  input: { name: string; category: string; phone: string; email: string; notes: string; birthDate?: string | null } & ContactExtras,
): Promise<string> {
  const familyId = await currentFamilyId()
  const { data, error } = await supabase
    .from('contacts')
    .insert({
      family_id: familyId,
      name: input.name,
      category: input.category || null,
      phone: input.phone || null,
      email: input.email || null,
      notes: input.notes || null,
      birth_date: input.birthDate || null,
      ...extrasRow({ source: { kind: 'manual', at: new Date().toISOString() }, ...input }),
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

export async function addContact(input: {
  name: string
  category: string
  phone: string
  email: string
  notes: string
  birthDate?: string | null
}): Promise<void> {
  await addContactReturningId(input)
}

// Antes un contacto solo se podía borrar o llamar, nunca editar — si
// se equivocaba el teléfono o quería cambiar la categoría, había que
// borrarlo y crearlo de nuevo (bug/petición real: "hay que poder
// editarla").
export async function updateContact(
  id: string,
  input: { name: string; category: string; phone: string; email: string; notes: string; birthDate: string | null } & ContactExtras,
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
      ...extrasRow(input),
    })
    .eq('id', id)
  if (error) throw error
}

/** Aplica el resultado de «incorporar datos nuevos» (ya decidido por la persona). Solo toca los campos que trae el parche. */
export async function applyContactPatch(id: string, patch: ContactPatch): Promise<void> {
  const row: Record<string, unknown> = {}
  if (patch.phone !== undefined) row.phone = orNull(patch.phone)
  if (patch.email !== undefined) row.email = orNull(patch.email)
  if (patch.extraPhones !== undefined) row.extra_phones = cleanList(patch.extraPhones)
  if (patch.extraEmails !== undefined) row.extra_emails = cleanList(patch.extraEmails)
  if (patch.surname !== undefined) row.surname = orNull(patch.surname)
  if (patch.nickname !== undefined) row.nickname = orNull(patch.nickname)
  if (patch.whatsappName !== undefined) row.whatsapp_name = orNull(patch.whatsappName)
  if (patch.address !== undefined) row.address = orNull(patch.address)
  if (patch.birthDate !== undefined) row.birth_date = patch.birthDate
  if (Object.keys(row).length === 0) return
  const { error } = await supabase.from('contacts').update(row).eq('id', id)
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
