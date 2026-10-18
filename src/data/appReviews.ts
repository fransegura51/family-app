// Reseñas y opiniones de la app (migración 0290). Cada persona ve y cambia solo las suyas; la dueña de la app las ve todas (lo decide la RLS, no el cliente).
import { supabase } from '@/data/supabaseClient'
import { cleanReviewText, isValidStars, type AppReview } from '@/domain/appReviews'

interface Row {
  id: string
  family_id: string
  profile_id: string
  section: string
  stars: number
  liked: string | null
  disliked: string | null
  updated_at: string
}

function mapRow(r: Row): AppReview {
  return { id: r.id, familyId: r.family_id, profileId: r.profile_id, section: r.section, stars: r.stars, liked: r.liked, disliked: r.disliked, updatedAt: r.updated_at }
}

const COLUMNS = 'id, family_id, profile_id, section, stars, liked, disliked, updated_at'

export async function listAppReviews(): Promise<AppReview[]> {
  const { data, error } = await supabase.from('app_reviews').select(COLUMNS).order('updated_at', { ascending: false })
  if (error) throw error
  return (data as Row[]).map(mapRow)
}

// Guarda o cambia mi valoración de una sección (una por persona y sección).
export async function saveAppReview(input: { section: string; stars: number; liked?: string | null; disliked?: string | null }): Promise<void> {
  if (!isValidStars(input.stars)) throw new Error('Elige de 1 a 5 estrellas')
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  const { data: profileRow, error: profileError } = await supabase.from('profiles').select('family_id').eq('id', userResult.user.id).single()
  if (profileError) throw profileError
  const { error } = await supabase.from('app_reviews').upsert(
    {
      family_id: profileRow.family_id,
      profile_id: userResult.user.id,
      section: input.section,
      stars: input.stars,
      liked: cleanReviewText(input.liked),
      disliked: cleanReviewText(input.disliked),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'profile_id,section' },
  )
  if (error) throw error
}

// ¿Esta persona ya valoró la app en general? (la invitación de Inicio solo se enseña a quien no)
export async function hasMyGeneralReview(profileId: string): Promise<boolean> {
  const { data, error } = await supabase.from('app_reviews').select('id').eq('profile_id', profileId).eq('section', 'general').limit(1)
  if (error) throw error
  return (data ?? []).length > 0
}

export async function deleteAppReview(section: string): Promise<void> {
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  const { error } = await supabase.from('app_reviews').delete().eq('profile_id', userResult.user.id).eq('section', section)
  if (error) throw error
}
