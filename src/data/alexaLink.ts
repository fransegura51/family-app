// Vincular Alexa a la familia (lectura por voz) — petición real: "¿Se puede integrar la app de
// Pepa con Alexa?... que cuando la vendamos, la familia se puedan conectar con Alexa si lo
// quieren". Ver migración 0180_alexa_account_linking.sql y supabase/functions/alexa-webhook.
import { supabase } from '@/data/supabaseClient'

// Crea (si hace falta) el code de un solo uso que AlexaLinkScreen manda de vuelta a Alexa — solo
// admin de familia, exigido también del lado de la base de datos.
export async function mintAlexaAuthCode(): Promise<string> {
  const { data, error } = await supabase.rpc('mint_alexa_auth_code')
  if (error) throw error
  return data as string
}

export interface AlexaLinkStatus {
  connected: boolean
  createdAt: string | null
}

// Lectura directa de la tabla (política RLS: solo la propia familia la ve) — no hace falta RPC
// para esto, igual que calendar_export_tokens.
export async function getAlexaLinkStatus(): Promise<AlexaLinkStatus> {
  const { data, error } = await supabase.from('alexa_links').select('created_at').maybeSingle()
  if (error) throw error
  return { connected: !!data, createdAt: data?.created_at ?? null }
}

export async function disconnectAlexa(): Promise<void> {
  const { error } = await supabase.rpc('disconnect_alexa')
  if (error) throw error
}
