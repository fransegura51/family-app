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

// Cuentas y seguridad (0299). Cada persona gestiona SU PIN: la administradora ya no puede reiniciar el de otra (el botón «Reiniciar PIN» de Familia se
// quitó; la función de la base de datos se retira al aplicar supabase/pending-migrations/0303, cuando se haya comprobado la recuperación).
//
// Cambiar o quitar el PIN pide el actual. Un PIN actual mal NO es un error: devuelve «wrong_pin» y la base de datos ya ha contado el intento (si fuera un
// error se revertiría el contador y se podría probar sin límite). PIN_LOCKED sí es un error: demasiados intentos seguidos.
export type PinCheckResult = 'ok' | 'wrong_pin' | 'no_pin'

function asPinCheckResult(data: unknown): PinCheckResult {
  return data === 'ok' || data === 'no_pin' ? data : 'wrong_pin'
}

function throwPinError(error: { message?: string } | null): void {
  if (!error) return
  if (error.message?.includes('PIN_LOCKED')) throw new Error('PIN_LOCKED')
  throw error
}

export async function changeOwnPin(currentPin: string, newPin: string): Promise<PinCheckResult> {
  const { data, error } = await supabase.rpc('change_own_pin', { p_old: currentPin, p_new: newPin })
  throwPinError(error)
  return asPinCheckResult(data)
}

export async function clearOwnPinWithPin(pin: string): Promise<PinCheckResult> {
  const { data, error } = await supabase.rpc('clear_own_pin_with_pin', { p_pin: pin })
  throwPinError(error)
  return asPinCheckResult(data)
}

// «He olvidado mi PIN»: solo funciona si la persona se acaba de identificar (contraseña o código del correo, en los últimos 5 minutos). Quita el PIN y
// borra las huellas / Face ID anteriores, para que no vuelvan a valer cuando se cree un PIN nuevo.
export async function resetOwnPinAfterRecentAuth(): Promise<void> {
  const { error } = await supabase.rpc('reset_own_pin_after_recent_auth')
  if (error) {
    if (error.message?.includes('RECENT_AUTH_REQUIRED')) throw new Error('RECENT_AUTH_REQUIRED')
    throw error
  }
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
  const result = (await callWebauthn('registerVerify', { response, deviceLabel })) as { verified: boolean }
  if (!result.verified) throw new Error('No se pudo verificar la huella/Face ID')
}

// Ceremonia de comprobación: usada en la pantalla de bloqueo como
// alternativa al PIN.
export async function authenticateWithPasskey(): Promise<boolean> {
  const options = await callWebauthn('authOptions')
  const response = await startAuthentication(options as never)
  const result = (await callWebauthn('authVerify', { response })) as { verified: boolean }
  return result.verified
}
