// Llama a la función de servidor "hevy-proxy" (Salud física) para leer
// los entrenamientos de Hevy. La clave de API de Hevy nunca pasa por
// aquí: vive en la tabla hevy_credentials (protegida por RLS, solo
// admin puede escribirla) y solo la lee la función de servidor.
import { supabase } from '@/data/supabaseClient'

export interface HevySet {
  index: number
  type: string
  weightKg: number | null
  reps: number | null
  distanceMeters: number | null
  durationSeconds: number | null
  rpe: number | null
}

export interface HevyExercise {
  title: string
  notes: string | null
  sets: HevySet[]
}

export interface HevyWorkout {
  id: string
  title: string
  startTime: string
  endTime: string | null
  exercises: HevyExercise[]
}

async function callHevy(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('No autenticado')

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  const res = await fetch(`${supabaseUrl}/functions/v1/hevy-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) {
    if (json.error === 'not_configured') throw new Error('Todavía no has guardado tu clave de Hevy.')
    if (json.error === 'invalid_key' || res.status === 401) throw new Error('La clave de Hevy no es válida — vuelve a generarla en hevy.com/settings?developer.')
    throw new Error('No se pudo consultar Hevy')
  }
  return json
}

export async function hasHevyApiKey(): Promise<boolean> {
  const { data, error } = await supabase.rpc('has_hevy_api_key')
  if (error) throw error
  return !!data
}

// Guarda o reemplaza la clave — insert/update, según si ya existe una
// fila para esta familia (la propia tabla tiene family_id como clave
// primaria, así que un upsert normal ya hace lo correcto).
export async function saveHevyApiKey(apiKey: string): Promise<void> {
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  const { data: profileRow, error: profileError } = await supabase
    .from('profiles')
    .select('family_id')
    .eq('id', userResult.user.id)
    .single()
  if (profileError) throw profileError

  const { error } = await supabase
    .from('hevy_credentials')
    .upsert({ family_id: profileRow.family_id, api_key: apiKey, updated_at: new Date().toISOString() })
  if (error) throw error
}

export async function deleteHevyApiKey(): Promise<void> {
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  const { data: profileRow, error: profileError } = await supabase
    .from('profiles')
    .select('family_id')
    .eq('id', userResult.user.id)
    .single()
  if (profileError) throw profileError

  const { error } = await supabase.from('hevy_credentials').delete().eq('family_id', profileRow.family_id)
  if (error) throw error
}

export async function testHevyConnection(): Promise<{ ok: boolean; name: string | null }> {
  const json = await callHevy({ action: 'test' })
  return { ok: !!json.ok, name: (json.name as string | null) ?? null }
}

function mapWorkout(w: Record<string, unknown>): HevyWorkout {
  const exercises = Array.isArray(w.exercises) ? (w.exercises as Record<string, unknown>[]) : []
  return {
    id: String(w.id),
    title: String(w.title ?? 'Entrenamiento'),
    startTime: String(w.start_time),
    endTime: w.end_time ? String(w.end_time) : null,
    exercises: exercises.map((ex) => {
      const sets = Array.isArray(ex.sets) ? (ex.sets as Record<string, unknown>[]) : []
      return {
        title: String(ex.title ?? ''),
        notes: ex.notes ? String(ex.notes) : null,
        sets: sets.map((s) => ({
          index: Number(s.index ?? 0),
          type: String(s.type ?? 'normal'),
          weightKg: s.weight_kg == null ? null : Number(s.weight_kg),
          reps: s.reps == null ? null : Number(s.reps),
          distanceMeters: s.distance_meters == null ? null : Number(s.distance_meters),
          durationSeconds: s.duration_seconds == null ? null : Number(s.duration_seconds),
          rpe: s.rpe == null ? null : Number(s.rpe),
        })),
      }
    }),
  }
}

export async function listHevyWorkouts(page = 1): Promise<{ workouts: HevyWorkout[]; page: number; pageCount: number }> {
  const json = await callHevy({ action: 'list_workouts', page })
  const workouts = Array.isArray(json.workouts) ? (json.workouts as Record<string, unknown>[]).map(mapWorkout) : []
  return { workouts, page: Number(json.page ?? page), pageCount: Number(json.pageCount ?? 1) }
}
