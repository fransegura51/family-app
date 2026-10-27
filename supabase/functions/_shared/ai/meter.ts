import type { AiPart } from './types.ts'

// Medición central del consumo de IA (Centro de Control de IA). Código puro (sin APIs de Deno): lo usan la puerta central, los webhooks y la IA de Comunidad, y se prueba con
// un cliente falso. SOLO números: nunca se envía una frase, una imagen ni una respuesta. Regla de oro: medir jamás rompe la función que se está midiendo.

export type AiOrigin = 'family' | 'automatic' | 'admin'
export type AiModality = 'text' | 'image' | 'audio' | 'video' | 'mixed'

export interface AiCallRecord {
  // Identificador de la llamada: anotar dos veces el mismo id cuenta una sola vez (idempotente).
  callId: string
  // Operación lógica a la que pertenece (una ejecución editorial, una petición...).
  runId?: string | null
  familyId: string | null
  userId: string | null
  origin?: AiOrigin
  purpose: string
  provider: string
  model: string
  modality: AiModality
  tokensIn: number
  tokensOut: number
  tokensExtra: number
  failed: boolean
  retries: number
  durationMs: number
}

export interface MeterClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ error: unknown }>
}

// Modalidad de lo que se envía: las imágenes y los PDF se facturan distinto del texto; el audio y el vídeo también.
export function modalityOfParts(parts: AiPart[]): AiModality {
  const kinds = new Set<AiModality>()
  for (const p of parts) {
    if (!('inlineData' in p)) {
      kinds.add('text')
      continue
    }
    const mime = p.inlineData.mimeType.toLowerCase()
    kinds.add(mime.startsWith('audio/') ? 'audio' : mime.startsWith('video/') ? 'video' : 'image')
  }
  kinds.delete('text')
  if (kinds.size === 0) return 'text'
  return kinds.size === 1 ? [...kinds][0] : 'mixed'
}

const num = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : 0)

// Anota la llamada. Si la función nueva de la base de datos todavía no está (migración sin aplicar) usa el contador de siempre: nada se pierde ni se rompe.
export async function recordAiCall(client: MeterClient, rec: AiCallRecord): Promise<void> {
  try {
    const { error } = await client.rpc('ai_record_call', {
      p_call_id: rec.callId,
      p_run_id: rec.runId ?? null,
      p_family: rec.familyId,
      p_user: rec.userId,
      p_origin: rec.origin ?? null,
      p_purpose: rec.purpose,
      p_provider: rec.provider,
      p_model: rec.model,
      p_modality: rec.modality,
      p_tokens_in: num(rec.tokensIn),
      p_tokens_out: num(rec.tokensOut),
      p_tokens_extra: num(rec.tokensExtra),
      p_status: rec.failed ? 'failed' : 'ok',
      p_retries: num(rec.retries),
      p_duration_ms: num(rec.durationMs),
    })
    if (error && rec.familyId) {
      await client.rpc('ai_record_usage', { p_family: rec.familyId, p_purpose: rec.purpose, p_tokens_in: num(rec.tokensIn), p_tokens_out: num(rec.tokensOut), p_error: rec.failed })
    }
  } catch {
    console.error('[ai] no se pudo anotar el consumo:', rec.purpose)
  }
}

export const newCallId = (): string => crypto.randomUUID()
