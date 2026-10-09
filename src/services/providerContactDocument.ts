// PEPA Eventos, prompt maestro Parte A6 — "Importar datos con foto": llama a la función de servidor
// "analyze-provider-contact-document" (Gemini, nivel gratuito) para leer una tarjeta de visita, una
// captura de Google Maps o un documento similar de un proveedor. Mismo patrón que analyzeReceiptPhoto/
// analyzeForecastDocument — la clave de Gemini nunca pasa por aquí, vive en Supabase Vault.
import { supabase } from '@/data/supabaseClient'

export interface ProviderContactScanResult {
  name: string | null
  type: string | null
  contactPerson: string | null
  phone: string | null
  email: string | null
  website: string | null
  address: string | null
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

export async function analyzeProviderContactDocument(file: File): Promise<ProviderContactScanResult> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('No autenticado')

  const fileBase64 = await fileToBase64(file)
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string

  const res = await fetch(`${supabaseUrl}/functions/v1/analyze-provider-contact-document`, {
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
  const asString = (v: unknown): string | null => (typeof v === 'string' ? v : null)
  return {
    name: asString(json.name),
    type: asString(json.type),
    contactPerson: asString(json.contactPerson),
    phone: asString(json.phone),
    email: asString(json.email),
    website: asString(json.website),
    address: asString(json.address),
  }
}
