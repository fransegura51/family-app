import type { AiRequest, CommunityAi, CommunityAiPurpose } from '../_shared/communityAi.ts'

// Llamada a la IA con reintentos y presupuesto. La validación devuelve el MOTIVO del rechazo (texto nuestro, nunca de personas) y ese motivo se da como
// pista en el reintento.

export type Validation<T> = { ok: true; value: T } | { ok: false; reason: string }
export type AttemptCode = 'AI_NOT_ALLOWED' | 'AI_FAILED' | 'INVALID_OUTPUT' | 'BUDGET'
export type AttemptResult<T> = { ok: true; value: T; calls: number } | { ok: false; code: AttemptCode; calls: number; reason: string }

// Tope de llamadas de una ejecución (se comparte entre los huecos).
export interface Budget {
  used: number
  max: number
}

export async function generateWithRetry<T>(
  ai: CommunityAi,
  purpose: CommunityAiPurpose,
  build: (hint: string | null) => AiRequest,
  validate: (raw: string) => Validation<T>,
  opts: { maxAttempts: number; budget?: Budget; initialHint?: string | null },
): Promise<AttemptResult<T>> {
  let hint: string | null = opts.initialHint ?? null
  let calls = 0
  let code: AttemptCode = 'AI_FAILED'
  let reason = ''
  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    if (opts.budget) {
      if (opts.budget.used >= opts.budget.max) return { ok: false, code: 'BUDGET', calls, reason: 'tope de llamadas' }
      opts.budget.used++
    }
    calls++
    let lastReason = ''
    const res = await ai.generate(purpose, build(hint), (raw) => {
      const v = validate(raw)
      if (v.ok) return v.value
      lastReason = v.reason
      return null
    })
    if (res.ok) return { ok: true, value: res.value, calls }
    if (res.reason === 'not_allowed') return { ok: false, code: 'AI_NOT_ALLOWED', calls, reason: '' }
    if (res.reason === 'invalid_output') {
      code = 'INVALID_OUTPUT'
      reason = lastReason || 'formato no válido'
      hint = reason
    } else {
      code = 'AI_FAILED'
      reason = 'fallo del proveedor'
    }
  }
  return { ok: false, code, calls, reason }
}
