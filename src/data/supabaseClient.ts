import { createClient } from '@supabase/supabase-js'
import { memoizeFamilyFetch, memoizeGetUser } from '@/data/authRequestCache'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copia .env.example a .env y rellénalas.',
  )
}

// Cliente único de Supabase. ui/ nunca importa esto directamente: pasa
// siempre por funciones de data/ para que RLS sea el único punto de verdad.
//
// Rendimiento (13/10/2026, «la respuesta es muy lenta»): cada función de datos empezaba preguntando al servidor «¿quién eres?» (auth.getUser) y «¿de qué
// familia?» (profiles), así que guardar una lista o contestar a Pepa encadenaba decenas de viajes de red. Aquí se recuerdan esas dos respuestas unos
// segundos (data/authRequestCache.ts); cada petición real sigue llevando su token y pasando por RLS.
const familyCache = memoizeFamilyFetch((input, init) => fetch(input, init))

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
  global: { fetch: familyCache.fetch },
})

const userCache = memoizeGetUser(
  () => originalGetUser(),
  async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
)
const originalGetUser = supabase.auth.getUser.bind(supabase.auth)
// Sin argumentos (lo habitual) se usa la memoria; con un token explícito, la consulta de siempre.
supabase.auth.getUser = ((jwt?: string) => (jwt ? originalGetUser(jwt) : userCache.call())) as typeof supabase.auth.getUser

// Al iniciar o cerrar sesión (o cambiar el usuario) se olvida todo lo recordado.
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
    userCache.clear()
    familyCache.clear()
  }
})
