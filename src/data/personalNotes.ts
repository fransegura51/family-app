import { supabase } from '@/data/supabaseClient'

export interface PersonalNote {
  id: string
  noteDate: string
  text: string
  createdAt: string
}

// A diferencia del resto de calendar.ts (compartido por family_id),
// esto es privado de verdad: filtrado por user_id vía RLS, así que ni
// el resto de la familia puede leerlo aunque compartan cuenta — ver
// migración 0088.
export async function listPersonalNotes(): Promise<PersonalNote[]> {
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  const { data, error } = await supabase
    .from('personal_calendar_notes')
    .select('id, note_date, text, created_at')
    .eq('user_id', userResult.user.id)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data.map((r) => ({ id: r.id, noteDate: r.note_date, text: r.text, createdAt: r.created_at }))
}

export async function addPersonalNote(noteDate: string, text: string): Promise<void> {
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  const { error } = await supabase
    .from('personal_calendar_notes')
    .insert({ user_id: userResult.user.id, note_date: noteDate, text })
  if (error) throw error
}

export async function updatePersonalNote(id: string, text: string): Promise<void> {
  const { error } = await supabase.from('personal_calendar_notes').update({ text }).eq('id', id)
  if (error) throw error
}

export async function deletePersonalNote(id: string): Promise<void> {
  const { error } = await supabase.from('personal_calendar_notes').delete().eq('id', id)
  if (error) throw error
}
