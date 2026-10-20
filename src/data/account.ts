import { supabase } from '@/data/supabaseClient'
import { normalizeEmail } from '@/domain/accountEmail'

// Cuenta de acceso (Supabase Auth): correo, contraseña, códigos de seis cifras y sesiones. Todo se apoya en Supabase Auth; no hay ningún sistema de códigos
// propio. El correo vive solo en Supabase Auth (auth.users), no en `profiles`: cambiarlo conserva el MISMO identificador de usuario, así que la familia,
// los permisos, el calendario, las tareas y la economía (todo cuelga de ese identificador) no se tocan.

export interface MyAccount {
  email: string | null
  /** El correo actual ya está confirmado. */
  confirmed: boolean
  /** Dirección nueva pedida y todavía sin confirmar (cambio de correo pendiente). */
  pendingEmail: string | null
}

export async function getMyAccount(): Promise<MyAccount> {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  const user = data.user
  return {
    email: user?.email ?? null,
    confirmed: Boolean(user?.email_confirmed_at),
    pendingEmail: user?.new_email ?? null,
  }
}

/**
 * Comprueba la contraseña ACTUAL volviendo a entrar con ella. Sirve de «identificación reciente»: la sesión nueva queda marcada como abierta ahora con
 * contraseña (es lo que mira reset_own_pin_after_recent_auth) y es la verificación que se pide antes de cambiar el correo o la contraseña.
 */
export async function confirmCurrentPassword(password: string): Promise<void> {
  const { email } = await getMyAccount()
  if (!email) throw new Error('Esta cuenta no tiene correo.')
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

// ---- Registro: confirmar el correo con el código
export async function verifySignupCode(email: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ email: normalizeEmail(email), token, type: 'signup' })
  if (error) throw error
}

export async function resendSignupCode(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({ type: 'signup', email: normalizeEmail(email) })
  if (error) throw error
}

// ---- Contraseña olvidada: código al correo y después contraseña nueva (ResetPasswordScreen)
export async function requestPasswordRecoveryCode(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email), {
    // Se mantiene la vuelta a la raíz de la app: los correos antiguos con enlace (ya enviados) siguen funcionando mientras no caduquen.
    redirectTo: window.location.origin + import.meta.env.BASE_URL,
  })
  if (error) throw error
}

export async function verifyPasswordRecoveryCode(email: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ email: normalizeEmail(email), token, type: 'recovery' })
  if (error) throw error
}

export async function setNewPassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw error
}

/** Cambiar la contraseña sabiendo la actual: se comprueba volviendo a entrar con ella y se guarda la nueva. */
export async function changePasswordWithCurrent(current: string, next: string): Promise<void> {
  await confirmCurrentPassword(current)
  await setNewPassword(next)
}

// ---- Código de identidad para una cuenta que ya existe (recuperar el PIN sin contraseña)
export async function requestIdentityCode(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({ email: normalizeEmail(email), options: { shouldCreateUser: false } })
  if (error) throw error
}

export async function verifyIdentityCode(email: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ email: normalizeEmail(email), token, type: 'email' })
  if (error) throw error
}

// ---- Cambio de correo: Supabase manda un código a la dirección nueva (y, con «cambio de correo seguro» activado en el proyecto, otro al correo actual:
// hacen falta los dos). El código se escribe junto al correo AL QUE LLEGÓ.
export async function requestEmailChange(newEmail: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ email: normalizeEmail(newEmail) }, { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL })
  if (error) throw error
}

export async function verifyEmailChangeCode(emailThatReceivedIt: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ email: normalizeEmail(emailThatReceivedIt), token, type: 'email_change' })
  if (error) throw error
}

// ---- Correos de las fichas de Familia
export interface FamilyAccountEmail {
  profileId: string
  email: string | null
  confirmed: boolean
  changePending: boolean
}

/** La administradora recibe los de toda su familia; el resto solo el suyo (lo decide la base de datos). */
export async function listFamilyAccountEmails(): Promise<FamilyAccountEmail[]> {
  const { data, error } = await supabase.rpc('list_family_account_emails')
  if (error) throw error
  return (data as { profile_id: string; email: string | null; email_confirmed: boolean; change_pending: boolean }[]).map((r) => ({
    profileId: r.profile_id,
    email: r.email,
    confirmed: r.email_confirmed,
    changePending: r.change_pending,
  }))
}
