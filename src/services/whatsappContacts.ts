// Llama a la función de servidor «analyze-whatsapp-contacts» (Gemini) para LEER una captura de WhatsApp (lista de participantes de un grupo, información de un grupo…) y proponer
// contactos. Nunca guarda nada: la pantalla de importación enseña una vista previa editable y solo al confirmar se crean o vinculan contactos de la agenda.
import { supabase } from '@/data/supabaseClient'
import { fromWhatsappAi, type AiWhatsappRow, type WaRow } from '@/domain/whatsappImport'
import { ParticipantsReaderUnavailableError } from '@/services/participantsDocument'

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(((reader.result as string) ?? '').split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** Respuesta del servidor → filas de WhatsApp. Tolera lo que no cuadre: nunca lanza por una fila rara. */
export function parseAiWhatsapp(json: unknown): WaRow[] {
  const raw = json && typeof json === 'object' && Array.isArray((json as { rows?: unknown }).rows) ? ((json as { rows: unknown[] }).rows as Record<string, unknown>[]) : []
  const rows: AiWhatsappRow[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const s = (v: unknown) => (typeof v === 'string' ? v : null)
    rows.push({ whatsappName: s(r.whatsappName), phone: s(r.phone), guardian: s(r.guardian), student: s(r.student), uncertain: r.uncertain === true })
  }
  return fromWhatsappAi(rows)
}

export async function analyzeWhatsappImage(image: Blob): Promise<WaRow[]> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('No autenticado')
  const imageBase64 = await blobToBase64(image)
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  const res = await fetch(`${supabaseUrl}/functions/v1/analyze-whatsapp-contacts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ imageBase64, mimeType: image.type || 'image/jpeg' }),
  })
  if (res.status === 404 || res.status === 403 || res.status === 503) throw new ParticipantsReaderUnavailableError('La lectura de capturas no está disponible ahora mismo.')
  if (!res.ok) throw new Error('No se pudo leer la captura')
  return parseAiWhatsapp(await res.json())
}
