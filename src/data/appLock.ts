import { startRegistration, startAuthentication } from '@simplewebauthn/browser'
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

// Huella dactilar / Face ID — capa opcional POR ENCIMA del PIN (ver
// supabase/functions/profile-webauthn). La verificación criptográfica
// real vive en el servidor; aquí solo se hace de puente entre el
// navegador (navigator.credentials, vía @simplewebauthn/browser) y esa
// función.
const WEBAUTHN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/profile-webauthn`

async function callWebauthn(action: string, payload: Record<string, unknown> = {}): Promise<unknown> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('No autenticado')

  const res = await fetch(WEBAUTHN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, ...payload }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'No se pudo comunicar con el servidor')
  return body
}

export interface WebauthnCredentialInfo {
  id: string
  deviceLabel: string | null
  createdAt: string
}

export async function listWebauthnCredentials(): Promise<WebauthnCredentialInfo[]> {
  const { data, error } = await supabase.rpc('list_own_webauthn_credentials')
  if (error) throw error
  return (data as { id: string; device_label: string | null; created_at: string }[]).map((r) => ({
    id: r.id,
    deviceLabel: r.device_label,
    createdAt: r.created_at,
  }))
}

export async function deleteWebauthnCredential(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_own_webauthn_credential', { p_id: id })
  if (error) throw error
}

// Ceremonia de registro: pide las opciones al servidor, dispara el
// diálogo nativo del móvil/ordenador (huella, Face ID, PIN de
// Windows...) y manda la respuesta a verificar. deviceLabel es solo
// para que la persona reconozca luego cuál es cuál en la lista.
export async function registerPasskey(deviceLabel: string): Promise<void> {
  const options = await callWebauthn('registerOptions')
  const response = await startRegistration(options as never)
  await callWebauthn('registerVerify', { response, deviceLabel })
}

// Ceremonia de comprobación: usada en la pantalla de bloqueo como
// alternativa al PIN.
export async function authenticateWithPasskey(): Promise<boolean> {
  const options = await callWebauthn('authOptions')
  const response = await startAuthentication(options as never)
  const result = (await callWebauthn('authVerify', { response })) as { verified: boolean }
  return result.verified
}
