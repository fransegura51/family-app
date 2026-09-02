import { supabase } from '@/data/supabaseClient'
import type { VoiceWebhookToken } from '@/domain/types'

export async function listVoiceWebhookTokens(): Promise<VoiceWebhookToken[]> {
  const { data, error } = await supabase
    .from('voice_webhook_tokens')
    .select('id, label, created_at, last_used_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map((r) => ({ id: r.id, label: r.label, createdAt: r.created_at, lastUsedAt: r.last_used_at }))
}

// El token completo solo se devuelve esta vez — a partir de aquí solo
// se puede consultar cuándo se creó y se usó por última vez, no volver
// a leerlo (si se pierde, hay que generar uno nuevo y revocar este).
export async function createVoiceWebhookToken(label: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_voice_webhook_token', { p_label: label })
  if (error) throw error
  return data as string
}

export async function deleteVoiceWebhookToken(id: string): Promise<void> {
  const { error } = await supabase.from('voice_webhook_tokens').delete().eq('id', id)
  if (error) throw error
}
