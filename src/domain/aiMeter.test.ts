import { describe, expect, it, vi } from 'vitest'
import { modalityOfParts, recordAiCall, type AiCallRecord, type MeterClient } from '../../supabase/functions/_shared/ai/meter.ts'

const rec: AiCallRecord = {
  callId: '11111111-1111-4111-8111-111111111111',
  familyId: 'f1',
  userId: 'u1',
  purpose: 'analyze-receipt-photo',
  provider: 'gemini',
  model: 'm',
  modality: 'image',
  tokensIn: 100,
  tokensOut: 20,
  tokensExtra: 0,
  failed: false,
  retries: 0,
  durationMs: 800,
}

describe('medición del consumo', () => {
  it('la modalidad sale de lo que se envía', () => {
    expect(modalityOfParts([{ text: 'a' }])).toBe('text')
    expect(modalityOfParts([{ text: 'a' }, { inlineData: { mimeType: 'image/jpeg', data: 'x' } }])).toBe('image')
    expect(modalityOfParts([{ inlineData: { mimeType: 'application/pdf', data: 'x' } }])).toBe('image')
    expect(modalityOfParts([{ inlineData: { mimeType: 'audio/mp3', data: 'x' } }])).toBe('audio')
    expect(modalityOfParts([{ inlineData: { mimeType: 'audio/mp3', data: 'x' } }, { inlineData: { mimeType: 'image/png', data: 'x' } }])).toBe('mixed')
  })
  it('anota con una sola llamada y solo números (nunca texto ni imágenes)', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    await recordAiCall({ rpc } as MeterClient, rec)
    expect(rpc).toHaveBeenCalledTimes(1)
    const [fnName, args] = rpc.mock.calls[0]
    expect(fnName).toBe('ai_record_call')
    expect(args).toMatchObject({ p_call_id: rec.callId, p_family: 'f1', p_user: 'u1', p_purpose: 'analyze-receipt-photo', p_tokens_in: 100, p_tokens_out: 20, p_status: 'ok', p_modality: 'image' })
    for (const v of Object.values(args as Record<string, unknown>)) expect(typeof v === 'string' && v.length > 60).toBe(false)
  })
  it('un fallo se anota como failed y los números raros se limpian', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    await recordAiCall({ rpc } as MeterClient, { ...rec, failed: true, tokensIn: -5, tokensOut: Number.NaN, retries: 2.4 })
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_status: 'failed', p_tokens_in: 0, p_tokens_out: 0, p_retries: 2 })
  })
  it('sin la migración usa el contador de siempre; sin familia no lo intenta', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ error: { message: 'no existe' } }).mockResolvedValue({ error: null })
    await recordAiCall({ rpc } as MeterClient, rec)
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(['ai_record_call', 'ai_record_usage'])
    const rpc2 = vi.fn().mockResolvedValue({ error: { message: 'x' } })
    await recordAiCall({ rpc: rpc2 } as MeterClient, { ...rec, familyId: null })
    expect(rpc2).toHaveBeenCalledTimes(1)
  })
  it('medir nunca rompe la función medida', async () => {
    const rpc = vi.fn().mockRejectedValue(new Error('red caída'))
    await expect(recordAiCall({ rpc } as MeterClient, rec)).resolves.toBeUndefined()
  })
})
