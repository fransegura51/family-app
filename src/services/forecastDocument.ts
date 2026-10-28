// Llama a la función de servidor "analyze-forecast-document" (Gemini, nivel gratuito) para leer un
// documento de financiación/préstamo/plan de cuotas y proponer una Previsión de pagos — petición real: "no
// debería tener que introducir manualmente todas las cuotas si PEPA puede extraerlas del documento". Mismo
// patrón que analyzeReceiptPhoto/analyzeDocumentExpiry; la clave de Gemini nunca pasa por aquí, vive en
// Supabase Vault. sha256HexOfFile/sha256HexOfText son las dos capas de la protección de duplicados (ver
// domain/forecastDocumentImport.ts y data/forecast.ts) — capa A antes de llamar a la IA (hash del archivo),
// capa B después de extraer (hash de la huella lógica).
import { supabase } from '@/data/supabaseClient'
import { isEmptyForecastDocumentScan, type ForecastDocumentScanResult } from '@/domain/forecastDocumentImport'
import { normalizedAiMimeType, prepareImageForAi } from '@/domain/imageCompression'

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

// Cuántas veces se llama a la IA por documento (28/10/2026), para no gastar de más:
//  · 1 llamada si la lectura sale bien (lo normal).
//  · +1 SOLO si el servicio falla por algo pasajero (502/503/504 o sin conexión): el mismo documento, una vez, tras una pausa.
//  · +1 SOLO si la respuesta llega pero vacía y el documento es una FOTO: se repite UNA vez con otro procesamiento (más resolución, escala de grises y contraste).
//  Nunca más, y un PDF no se repite con otro procesamiento (no hay nada que cambiar).
const TRANSIENT_STATUSES = new Set([502, 503, 504])
const RETRY_PAUSE_MS = 1500

export type ForecastDocumentReadErrorKind = 'not_allowed' | 'session' | 'too_large' | 'service' | 'network'

export class ForecastDocumentReadError extends Error {
  constructor(
    message: string,
    readonly kind: ForecastDocumentReadErrorKind,
  ) {
    super(message)
    this.name = 'ForecastDocumentReadError'
  }
}

const EMPTY_SCAN: ForecastDocumentScanResult = {
  provider: null,
  concept: null,
  totalAmount: null,
  installmentCount: null,
  installmentAmount: null,
  installmentAmounts: null,
  firstDueDate: null,
  periodicity: null,
  lastDueDate: null,
  paidInstallments: null,
  installmentDueDates: null,
}

function readScan(json: Record<string, unknown>): ForecastDocumentScanResult {
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

type RequestResult = { ok: true; scan: ForecastDocumentScanResult } | { ok: false; error: ForecastDocumentReadError; transient: boolean }

async function requestScan(file: File, token: string): Promise<RequestResult> {
  const fileBase64 = await fileToBase64(file)
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  let res: Response
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/analyze-forecast-document`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ fileBase64, mimeType: normalizedAiMimeType(file) }),
    })
  } catch {
    return { ok: false, transient: true, error: new ForecastDocumentReadError('No he podido conectar para leer el documento. Revisa tu conexión e inténtalo de nuevo.', 'network') }
  }
  if (res.ok) {
    let json: Record<string, unknown> = {}
    try {
      json = await res.json()
    } catch {
      // respuesta que no es JSON: se trata como lectura vacía
    }
    return { ok: true, scan: readScan(json) }
  }
  if (res.status === 401) return { ok: false, transient: false, error: new ForecastDocumentReadError('Tu sesión ha caducado: vuelve a entrar y repite la importación.', 'session') }
  if (res.status === 403) {
    return { ok: false, transient: false, error: new ForecastDocumentReadError('La lectura de documentos con IA no está disponible para tu cuenta ahora mismo (solo cuentas adultas y con la IA activa).', 'not_allowed') }
  }
  if (res.status === 413) return { ok: false, transient: false, error: new ForecastDocumentReadError('El documento es demasiado grande. Prueba con una foto más pequeña o con otra página.', 'too_large') }
  return {
    ok: false,
    transient: TRANSIENT_STATUSES.has(res.status),
    error: new ForecastDocumentReadError('El servicio de lectura no ha respondido bien. Inténtalo de nuevo en un momento.', 'service'),
  }
}

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export async function analyzeForecastDocument(file: File, deps: { prepare?: typeof prepareImageForAi; pauseMs?: number } = {}): Promise<ForecastDocumentScanResult> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new ForecastDocumentReadError('Tu sesión ha caducado: vuelve a entrar y repite la importación.', 'session')
  const prepare = deps.prepare ?? prepareImageForAi

  // Intento 1: la imagen preparada igual para todos los dispositivos (orientación aplicada, reducida, tipo correcto).
  const first = await prepare(file, 'standard')
  let result = await requestScan(first.file, token)
  if (!result.ok && result.transient) {
    await pause(deps.pauseMs ?? RETRY_PAUSE_MS)
    result = await requestScan(first.file, token)
  }
  if (!result.ok) throw result.error
  if (!isEmptyForecastDocumentScan(result.scan)) return result.scan

  // Respuesta vacía: solo una foto admite otro procesamiento. Un PDF se queda como está.
  if (!normalizedAiMimeType(file).startsWith('image/')) return result.scan
  const second = await prepare(file, 'enhanced')
  const retry = await requestScan(second.file, token)
  if (retry.ok && !isEmptyForecastDocumentScan(retry.scan)) return retry.scan
  return retry.ok ? retry.scan : EMPTY_SCAN
}
