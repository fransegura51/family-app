// PEPA Eventos, prompt maestro — Fase 6, Parte B3: llama a la función de servidor
// "analyze-offer-budget-document" (Gemini, nivel gratuito) para leer un presupuesto/oferta de un
// proveedor (foto o PDF). Mismo patrón que providerContactDocument.ts/analyzeForecastDocument — la clave
// de Gemini nunca pasa por aquí, vive en Supabase Vault.
import { supabase } from '@/data/supabaseClient'

export interface OfferBudgetScanItem {
  name: string
  description: string | null
  quantity: number | null
  unit: string | null
  unitPrice: number | null
  subtotal: number | null
  isPackage: boolean
}

export interface OfferBudgetScanResult {
  providerName: string | null
  // Orden de recuperación de requisitos (Parte A5+B3) — número/referencia impreso en el presupuesto, para
  // proponer un nombre descriptivo de la oferta y del adjunto; nunca se usa como identificador interno.
  quoteNumber: string | null
  amount: number | null
  offerDate: string | null
  validUntil: string | null
  scopeExcluded: string | null
  conditions: string | null
  notes: string | null
  items: OfferBudgetScanItem[]
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

export async function analyzeOfferBudgetDocument(file: File): Promise<OfferBudgetScanResult> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('No autenticado')

  const fileBase64 = await fileToBase64(file)
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string

  const res = await fetch(`${supabaseUrl}/functions/v1/analyze-offer-budget-document`, {
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
  const asNumber = (v: unknown): number | null => (typeof v === 'number' ? v : null)
  const items: OfferBudgetScanItem[] = Array.isArray(json.items)
    ? json.items.map((it: Record<string, unknown>) => ({
        name: typeof it.name === 'string' ? it.name : '',
        description: asString(it.description),
        quantity: asNumber(it.quantity),
        unit: asString(it.unit),
        unitPrice: asNumber(it.unitPrice),
        subtotal: asNumber(it.subtotal),
        isPackage: it.isPackage === true,
      }))
    : []
  return {
    providerName: asString(json.providerName),
    quoteNumber: asString(json.quoteNumber),
    amount: asNumber(json.amount),
    offerDate: asString(json.offerDate),
    validUntil: asString(json.validUntil),
    scopeExcluded: asString(json.scopeExcluded),
    conditions: asString(json.conditions),
    notes: asString(json.notes),
    items,
  }
}
