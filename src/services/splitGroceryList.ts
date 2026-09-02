// Respaldo con IA (Gemini, nivel gratuito) para separar una lista de la
// compra dictada de un tirón, sin comas ni pausas de por medio — ver
// supabase/functions/split-grocery-list para el porqué. Solo se llama
// cuando el troceo local por comas/"y" ya ha dejado un solo trozo.
import { supabase } from '@/data/supabaseClient'

export async function splitGroceryListWithAi(text: string): Promise<string[]> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('No autenticado')

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  const res = await fetch(`${supabaseUrl}/functions/v1/split-grocery-list`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) throw new Error('No se pudo separar la lista')
  const json = await res.json()
  return Array.isArray(json.items) && json.items.length > 0 ? (json.items as string[]) : [text]
}
