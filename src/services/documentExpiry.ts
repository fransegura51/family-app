// Llama a la función de servidor "analyze-document-expiry" (Gemini,
// nivel gratuito) para detectar sola la fecha de caducidad de un
// documento (DNI, carnet, ITV, seguro...) — petición real: "que Pepa
// detecte automáticamente la fecha de caducidad y la anote". Mismo
// patrón que analyzeReceiptPhoto (src/services/receiptPhoto.ts); la
// clave de Gemini nunca pasa por aquí, vive en Supabase Vault.
import { supabase } from '@/data/supabaseClient'

export interface DocumentExpiryScanResult {
  expiryDate: string | null // YYYY-MM-DD
  documentType: string | null
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1] ?? '')
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export async function analyzeDocumentExpiry(file: File): Promise<DocumentExpiryScanResult> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('No autenticado')

  const fileBase64 = await fileToBase64(file)
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string

  const res = await fetch(`${supabaseUrl}/functions/v1/analyze-document-expiry`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ fileBase64, mimeType: file.type || 'image/jpeg' }),
  })

  if (!res.ok) {
    throw new Error('No se pudo leer el documento')
  }
  const json = await res.json()
  return {
    expiryDate: typeof json.expiryDate === 'string' ? json.expiryDate : null,
    documentType: typeof json.documentType === 'string' ? json.documentType : null,
  }
}
