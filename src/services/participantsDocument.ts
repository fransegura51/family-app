// Llama a la función de servidor «analyze-participants-document» (Gemini) para LEER una imagen con una lista de personas (la foto de una lista de clase o una página de PDF ya
// convertida en imagen en el móvil) y proponer filas. Nunca guarda nada: la pantalla de importación enseña una vista previa editable y solo al confirmar se crean las fichas.
import { supabase } from '@/data/supabaseClient'
import { fromAiRows, type AiParticipantRow, type ImportResult } from '@/domain/participantImport'

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(((reader.result as string) ?? '').split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export class ParticipantsReaderUnavailableError extends Error {}

/** Respuesta del servidor → filas de importación (con sus dudas). Tolera lo que no cuadre: nunca lanza por una fila rara. */
export function parseAiParticipants(json: unknown): ImportResult {
  const raw = json && typeof json === 'object' && Array.isArray((json as { rows?: unknown }).rows) ? ((json as { rows: unknown[] }).rows as Record<string, unknown>[]) : []
  const rows: AiParticipantRow[] = []
  for (const r of raw) {
    if (!r || typeof r.name !== 'string') continue
    rows.push({
      name: r.name,
      surname: typeof r.surname === 'string' ? r.surname : null,
      guardian: typeof r.guardian === 'string' ? r.guardian : null,
      phone: typeof r.phone === 'string' ? r.phone : null,
      email: typeof r.email === 'string' ? r.email : null,
      uncertain: r.uncertain === true,
    })
  }
  return fromAiRows(rows)
}

export async function analyzeParticipantsImage(image: Blob): Promise<ImportResult> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('No autenticado')
  const imageBase64 = await blobToBase64(image)
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  const res = await fetch(`${supabaseUrl}/functions/v1/analyze-participants-document`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ imageBase64, mimeType: image.type || 'image/jpeg' }),
  })
  if (res.status === 404 || res.status === 403 || res.status === 503) throw new ParticipantsReaderUnavailableError('El lector de listas de personas no está disponible ahora mismo.')
  if (!res.ok) throw new Error('No se pudo leer la imagen')
  return parseAiParticipants(await res.json())
}
