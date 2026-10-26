// Llama a la función de servidor «analyze-list-document» (Gemini) para LEER una imagen de una lista (la zona que la persona ha
// recortado, o una página de PDF ya convertida en imagen en el móvil) y proponer sus elementos. Nunca guarda nada: la pantalla de
// importación enseña una vista previa editable y solo al confirmar se guardan.
import { supabase } from '@/data/supabaseClient'
import { ITEM_TEXT_MAX, type ListKind } from '@/domain/lists'

export interface ProposedLine {
  text: string
  depth: 0 | 1
  /** true = la IA marcó la línea como dudosa o ilegible: se enseña en la vista previa, nunca se inventa. */
  uncertain?: boolean
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(((reader.result as string) ?? '').split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export class ListReaderUnavailableError extends Error {}

// Respuesta del servidor → líneas limpias (sin vacías, sin repetidas consecutivas, tope de 200, el primero nunca es subelemento).
export function parseProposedLines(json: unknown): ProposedLine[] {
  const raw = json && typeof json === 'object' && Array.isArray((json as { items?: unknown }).items) ? ((json as { items: unknown[] }).items as Record<string, unknown>[]) : []
  const out: ProposedLine[] = []
  for (const r of raw) {
    if (!r || typeof r.text !== 'string') continue
    const text = r.text.replace(/\s+/g, ' ').trim().slice(0, ITEM_TEXT_MAX)
    if (!text) continue
    if (out.length && out[out.length - 1].text === text) continue
    out.push({ text, depth: r.depth === 1 && out.length > 0 ? 1 : 0, uncertain: r.uncertain === true ? true : undefined })
    if (out.length >= 200) break
  }
  return out
}

export async function analyzeListImage(image: Blob, kind: ListKind): Promise<ProposedLine[]> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('No autenticado')
  const imageBase64 = await blobToBase64(image)
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  const res = await fetch(`${supabaseUrl}/functions/v1/analyze-list-document`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ imageBase64, mimeType: image.type || 'image/jpeg', kind }),
  })
  if (res.status === 404 || res.status === 403 || res.status === 503) throw new ListReaderUnavailableError('El lector de listas no está disponible ahora mismo.')
  if (!res.ok) throw new Error('No se pudo leer la imagen')
  return parseProposedLines(await res.json())
}
