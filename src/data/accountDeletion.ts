// Borrar la cuenta (o la familia entera) desde dentro de la app: llama a la función de servidor «delete-account». La app nunca manda a quién borrar: el servidor lo
// decide con la sesión de quien llama.
import { supabase } from '@/data/supabaseClient'

export type DeletionScope = 'me' | 'family'

export const CONFIRM_WORD = 'BORRAR'

const MESSAGES: Record<string, string> = {
  last_admin: 'Eres la única administradora. Antes de borrar tu cuenta, nombra a otra administradora (en Familia, editando a esa persona).',
  only_account: 'Eres la única cuenta de esta familia, así que no queda nadie para llevarla. Si quieres borrarlo todo, usa «Borrar toda la familia».',
  admin_only: 'Solo las administradoras pueden borrar toda la familia.',
  confirm_required: 'Escribe BORRAR para confirmar.',
  delete_failed: 'No he podido borrarlo del todo. Inténtalo de nuevo; si sigue fallando, escríbenos y lo hacemos nosotros.',
}

export async function deleteAccount(scope: DeletionScope): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('No has iniciado sesión.')
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  const res = await fetch(`${supabaseUrl}/functions/v1/delete-account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ scope, confirm: CONFIRM_WORD }),
  })
  if (res.ok) return
  const detail = (await res.json().catch(() => null)) as { error?: string } | null
  throw new Error(MESSAGES[detail?.error ?? ''] ?? 'No he podido borrar la cuenta ahora mismo. Inténtalo de nuevo en un momento.')
}
