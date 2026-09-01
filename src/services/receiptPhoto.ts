// Llama a la función de servidor "analyze-receipt-photo" (Gemini, nivel
// gratuito) para leer un ticket de compra — sustituye al OCR local
// (Tesseract), que se dejaba productos en tickets arrugados o con letra
// pequeña. La clave de Gemini nunca pasa por aquí: vive en Supabase
// Vault y solo la lee la función de servidor.
import { supabase } from '@/data/supabaseClient'

export interface ReceiptScanResult {
  store: string | null
  date: string | null // YYYY-MM-DD
  total: number | null
  // price es el importe TOTAL de la línea (cantidad × precio unitario),
  // no el precio por unidad — así "2 bolsas de patatas, 6,00€" se lee
  // como quantity=2, price=6.00, no como una sola bolsa a 6€.
  items: { name: string; quantity: number; price: number }[]
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

export async function analyzeReceiptPhoto(file: File): Promise<ReceiptScanResult> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('No autenticado')

  const imageBase64 = await fileToBase64(file)
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string

  const res = await fetch(`${supabaseUrl}/functions/v1/analyze-receipt-photo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ imageBase64, mimeType: file.type || 'image/jpeg' }),
  })

  if (!res.ok) {
    throw new Error('No se pudo leer el ticket')
  }
  const json = await res.json()
  return {
    store: typeof json.store === 'string' ? json.store : null,
    date: typeof json.date === 'string' ? json.date : null,
    total: typeof json.total === 'number' ? json.total : null,
    items: Array.isArray(json.items)
      ? json.items.map((it: { name: string; quantity?: number; price: number }) => ({
          name: it.name,
          quantity: typeof it.quantity === 'number' && it.quantity > 0 ? it.quantity : 1,
          price: it.price,
        }))
      : [],
  }
}
