// Llama a la función de servidor «analyze-event-food-document» (Gemini) para LEER una foto o PDF de un menú y
// proponer los platos organizados por sección — Eventos → Comida y bebida. Un único lector genérico para
// cualquier documento de comida (menú principal, infantil, cóctel, bebidas, recena, propuesta de catering...).
// La clave de Gemini nunca pasa por aquí (vive en el Vault). El resultado es solo una PROPUESTA: la pantalla
// de revisión (FoodMenuImporter) la enseña, la familia la corrige y solo entonces se guarda.
import { supabase } from '@/data/supabaseClient'
import { sanitizeImportProposal, type MenuImportProposal } from '@/domain/eventFoodMenu'
import type { EventFoodDocumentKind } from '@/domain/types'

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(((reader.result as string) ?? '').split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export async function analyzeEventFoodDocument(file: File, kind: EventFoodDocumentKind): Promise<MenuImportProposal> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('No autenticado')

  const fileBase64 = await fileToBase64(file)
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  const res = await fetch(`${supabaseUrl}/functions/v1/analyze-event-food-document`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fileBase64, mimeType: file.type || 'image/jpeg', kind }),
  })
  if (!res.ok) throw new Error('No se pudo leer el documento')
  return sanitizeImportProposal(await res.json())
}
