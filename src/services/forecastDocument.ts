// Llama a la función de servidor "analyze-forecast-document" (Gemini, nivel gratuito) para leer un
// documento de financiación/préstamo/plan de cuotas y proponer una Previsión de pagos — petición real: "no
// debería tener que introducir manualmente todas las cuotas si PEPA puede extraerlas del documento". Mismo
// patrón que analyzeReceiptPhoto/analyzeDocumentExpiry; la clave de Gemini nunca pasa por aquí, vive en
// Supabase Vault. sha256HexOfFile/sha256HexOfText son las dos capas de la protección de duplicados (ver
// domain/forecastDocumentImport.ts y data/forecast.ts) — capa A antes de llamar a la IA (hash del archivo),
// capa B después de extraer (hash de la huella lógica).
import { supabase } from '@/data/supabaseClient'
import type { ForecastDocumentScanResult } from '@/domain/forecastDocumentImport'

export type { ForecastDocumentScanResult }

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

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function sha256HexOfFile(file: File): Promise<string> {
  return sha256Hex(await file.arrayBuffer())
}

export async function sha256HexOfText(text: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(text).buffer as ArrayBuffer)
}

export async function analyzeForecastDocument(file: File): Promise<ForecastDocumentScanResult> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('No autenticado')

  const fileBase64 = await fileToBase64(file)
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string

  const res = await fetch(`${supabaseUrl}/functions/v1/analyze-forecast-document`, {
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
  const asNumber = (v: unknown): number | null => (typeof v === 'number' ? v : null)
  const asString = (v: unknown): string | null => (typeof v === 'string' ? v : null)
  return {
    provider: asString(json.provider),
    concept: asString(json.concept),
    totalAmount: asNumber(json.totalAmount),
    installmentCount: asNumber(json.installmentCount),
    installmentAmount: asNumber(json.installmentAmount),
    installmentAmounts: Array.isArray(json.installmentAmounts) ? json.installmentAmounts.filter((v: unknown) => typeof v === 'number') : null,
    firstDueDate: asString(json.firstDueDate),
    periodicity: asString(json.periodicity) as ForecastDocumentScanResult['periodicity'],
    lastDueDate: asString(json.lastDueDate),
    paidInstallments: asNumber(json.paidInstallments),
    installmentDueDates: Array.isArray(json.installmentDueDates) ? json.installmentDueDates.filter((v: unknown) => typeof v === 'string') : null,
  }
}
