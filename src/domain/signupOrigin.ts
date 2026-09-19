// Origen de registro: medir cuánta gente llega a crear su familia desde
// la demo pública de la web (pepafamilyapp.es → "Crear mi familia"), que
// enlaza aquí con "?origen=demo".
//
// Solo se guarda una etiqueta de una lista cerrada ("demo"), sin datos
// personales: cualquier otro valor de la URL se ignora, así nadie puede
// meter texto libre. En el registro se anota como metadato del usuario
// de Supabase Auth (signup_origin), sin tablas ni migraciones nuevas. Para
// contarlo: select count(*) from auth.users where
// raw_user_meta_data->>'signup_origin' = 'demo';

export const SIGNUP_ORIGINS = ['demo'] as const
export type SignupOrigin = (typeof SIGNUP_ORIGINS)[number]

export const SIGNUP_ORIGIN_KEY = 'pepa_signup_origin'

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function isSignupOrigin(value: string | null): value is SignupOrigin {
  return value !== null && (SIGNUP_ORIGINS as readonly string[]).includes(value)
}

// "?origen=demo" → 'demo'; cualquier otra cosa → null.
export function parseSignupOrigin(search: string): SignupOrigin | null {
  const value = new URLSearchParams(search).get('origen')
  return isSignupOrigin(value) ? value : null
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    // Navegación privada o almacenamiento bloqueado: se ignora sin romper el login.
    return null
  }
}

// Guarda el origen si la URL lo trae (para sobrevivir a un recargado
// antes de pulsar "Crear cuenta").
export function rememberSignupOrigin(search: string, storage: StorageLike | null = defaultStorage()): void {
  const origin = parseSignupOrigin(search)
  if (!origin || !storage) return
  try {
    storage.setItem(SIGNUP_ORIGIN_KEY, origin)
  } catch {
    // sin almacenamiento: no pasa nada, solo se pierde la medición.
  }
}

export function recallSignupOrigin(storage: StorageLike | null = defaultStorage()): SignupOrigin | null {
  if (!storage) return null
  try {
    const value = storage.getItem(SIGNUP_ORIGIN_KEY)
    return isSignupOrigin(value) ? value : null
  } catch {
    return null
  }
}

// Tras registrarse se olvida, para no etiquetar a otra persona que use
// después el mismo navegador.
export function forgetSignupOrigin(storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return
  try {
    storage.removeItem(SIGNUP_ORIGIN_KEY)
  } catch {
    // ídem
  }
}
