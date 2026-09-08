import { supabase } from '@/data/supabaseClient'

// Bloqueo de la app por PIN — ver 0083_profile_app_lock.sql. El PIN no
// se guarda ni se lee nunca en texto plano desde aquí, solo se manda al
// servidor para que compare/genere el hash; esta capa es puramente
// local a cada login (auth.uid()), no a family_members (ver esa
// migración para el porqué).

export async function hasOwnPin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('has_own_pin')
  if (error) throw error
  return data as boolean
}

export async function setOwnPin(pin: string): Promise<void> {
  const { error } = await supabase.rpc('set_own_pin', { p_pin: pin })
  if (error) throw error
}

export async function clearOwnPin(): Promise<void> {
  const { error } = await supabase.rpc('clear_own_pin')
  if (error) throw error
}

// PIN_LOCKED: demasiados intentos fallidos seguidos, bloqueado unos
// minutos — se distingue de "PIN incorrecto" para poder avisar mejor.
export async function verifyOwnPin(pin: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('verify_own_pin', { p_pin: pin })
  if (error) {
    if (error.message?.includes('PIN_LOCKED')) throw new Error('PIN_LOCKED')
    throw error
  }
  return data as boolean
}

// Solo admin — deja a otra persona sin PIN para que tenga que crear uno
// nuevo la próxima vez, sin que el admin llegue a ver el antiguo.
export async function adminResetProfilePin(profileId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_reset_profile_pin', { p_profile_id: profileId })
  if (error) throw error
}
