import { supabase } from '@/data/supabaseClient'
import { errorMessage } from '@/domain/errorMessage'

export interface ClientErrorRow {
  id: string
  profileId: string | null
  familyId: string | null
  message: string
  stack: string | null
  componentStack: string | null
  url: string | null
  userAgent: string | null
  createdAt: string
}

// Tope por sesión: un error en bucle (p. ej. un render que falla en cada
// intento) no debe convertirse en miles de filas ni en tráfico infinito.
const MAX_REPORTS_PER_SESSION = 5
let reportsSent = 0

// Se llama desde ErrorBoundary, unhandledrejection y window 'error'. Regla
// de oro: NUNCA lanza ni rechaza — si el propio envío falla (sin sesión,
// sin red, tabla ausente), se traga el error en silencio. Lo último que
// queremos es que el sistema de avisos de fallos provoque otro fallo.
export async function reportClientError(error: unknown, extra: { componentStack?: string } = {}): Promise<void> {
  if (reportsSent >= MAX_REPORTS_PER_SESSION) return
  reportsSent++
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user.id
    if (!userId) return
    // Un error de Supabase es un objeto plano: String() daría
    // "[object Object]" y perderíamos el motivo (ver domain/errorMessage).
    const err = error instanceof Error ? error : new Error(errorMessage(error, String(error)))
    await supabase.from('client_errors').insert({
      profile_id: userId,
      message: err.message.slice(0, 1000),
      stack: err.stack?.slice(0, 4000) ?? null,
      component_stack: extra.componentStack?.slice(0, 4000) ?? null,
      url: window.location.href.slice(0, 500),
      user_agent: navigator.userAgent.slice(0, 300),
    })
  } catch {
    // Silencio a propósito (ver comentario de arriba).
  }
}

export async function listClientErrors(limit = 100): Promise<ClientErrorRow[]> {
  const { data, error } = await supabase
    .from('client_errors')
    .select('id, profile_id, family_id, message, stack, component_stack, url, user_agent, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    profileId: r.profile_id,
    familyId: r.family_id,
    message: r.message,
    stack: r.stack,
    componentStack: r.component_stack,
    url: r.url,
    userAgent: r.user_agent,
    createdAt: r.created_at,
  }))
}

export async function deleteClientErrors(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase.from('client_errors').delete().in('id', ids)
  if (error) throw error
}
