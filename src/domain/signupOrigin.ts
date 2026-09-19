// Origen de registro: medir cuánta gente llega a crear su familia desde
// la demo pública de la web (pepafamilyapp.es → "Crear mi familia"), que
// enlaza aquí con "?origen=demo" y, si la persona venía de una guía de la
// web, también "&guia=<slug-de-la-guía>".
//
// Solo se guardan etiquetas con formato estricto, sin datos personales:
//  - origen: lista cerrada ("demo").
//  - guia: un "slug" (minúsculas, números y guiones, máx. 60), y solo si
//    viene junto a origen=demo. Cualquier otra cosa de la URL se ignora,
//    así nadie puede meter texto libre.
// En el registro se anotan como metadatos del usuario de Supabase Auth
// (signup_origin y signup_guide), sin tablas ni migraciones nuevas. Para
// contarlo:
//   select raw_user_meta_data->>'signup_guide' as guia, count(*)
//   from auth.users where raw_user_meta_data->>'signup_origin' = 'demo'
//   group by 1 order by 2 desc;

export const SIGNUP_ORIGINS = ['demo'] as const
export type SignupOrigin = (typeof SIGNUP_ORIGINS)[number]

export const SIGNUP_ORIGIN_KEY = 'pepa_signup_origin'
export const SIGNUP_GUIDE_KEY = 'pepa_signup_guide'

const GUIDE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const MAX_GUIDE_LENGTH = 60

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function isSignupOrigin(value: string | null): value is SignupOrigin {
  return value !== null && (SIGNUP_ORIGINS as readonly string[]).includes(value)
}

function isGuideSlug(value: string | null): value is string {
  return value !== null && value.length <= MAX_GUIDE_LENGTH && GUIDE_RE.test(value)
}

// "?origen=demo" → 'demo'; cualquier otra cosa → null.
export function parseSignupOrigin(search: string): SignupOrigin | null {
  const value = new URLSearchParams(search).get('origen')
  return isSignupOrigin(value) ? value : null
}

// "?origen=demo&guia=mi-guia" → 'mi-guia'. Sin origen válido, o con un
// formato raro, → null.
export function parseSignupGuide(search: string): string | null {
  if (!parseSignupOrigin(search)) return null
  const value = new URLSearchParams(search).get('guia')
  return isGuideSlug(value) ? value : null
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    // Navegación privada o almacenamiento bloqueado: se ignora sin romper el login.
    return null
  }
}

// Guarda origen (y guía) si la URL los trae, para sobrevivir a un
// recargado antes de pulsar "Crear cuenta". Si llega con origen pero sin
// guía, se borra una guía antigua para no atribuirla mal.
export function rememberSignupOrigin(search: string, storage: StorageLike | null = defaultStorage()): void {
  const origin = parseSignupOrigin(search)
  if (!origin || !storage) return
  try {
    storage.setItem(SIGNUP_ORIGIN_KEY, origin)
    const guide = parseSignupGuide(search)
    if (guide) storage.setItem(SIGNUP_GUIDE_KEY, guide)
    else storage.removeItem(SIGNUP_GUIDE_KEY)
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

export function recallSignupGuide(storage: StorageLike | null = defaultStorage()): string | null {
  if (!storage) return null
  try {
    const value = storage.getItem(SIGNUP_GUIDE_KEY)
    return isGuideSlug(value) ? value : null
  } catch {
    return null
  }
}

// Metadatos para signUp({ options: { data } }); undefined si no hay origen.
export function signupMetadata(storage: StorageLike | null = defaultStorage()): { signup_origin: SignupOrigin; signup_guide?: string } | undefined {
  const origin = recallSignupOrigin(storage)
  if (!origin) return undefined
  const guide = recallSignupGuide(storage)
  return guide ? { signup_origin: origin, signup_guide: guide } : { signup_origin: origin }
}

// Tras registrarse se olvida, para no etiquetar a otra persona que use
// después el mismo navegador.
export function forgetSignupOrigin(storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return
  try {
    storage.removeItem(SIGNUP_ORIGIN_KEY)
    storage.removeItem(SIGNUP_GUIDE_KEY)
  } catch {
    // ídem
  }
}
