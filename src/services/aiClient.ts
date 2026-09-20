// Cliente común de las funciones de IA de servidor: pone la sesión, llama y
// traduce los fallos. La clave del proveedor nunca pasa por aquí — vive en
// el servidor. Si la IA no está disponible por el motivo que sea (apagada,
// cuenta no adulta, sin red, cuota), se lanza AiUnavailableError y quien
// llama sigue con lo que hacía antes: PEPA no depende de la IA.
import { supabase } from '@/data/supabaseClient'
import { listFamilyMembers } from '@/data/family'
import { createAliasMap, type AliasMap } from '@/pepa/alias'

export class AiUnavailableError extends Error {
  readonly reason: string
  constructor(reason: string) {
    super(`IA no disponible (${reason})`)
    this.reason = reason
  }
}

export async function callAiFunction(name: string, body: Record<string, unknown>): Promise<unknown> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('No autenticado')

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  if (res.status === 403) {
    const detail = await res.json().catch(() => null)
    throw new AiUnavailableError(typeof detail?.reason === 'string' ? detail.reason : 'forbidden')
  }
  if (!res.ok) throw new AiUnavailableError(`http_${res.status}`)
  return res.json()
}

// Mapa de alias con los nombres de la familia — se pide justo antes de cada
// llamada a la IA (solo cuando las reglas locales han fallado).
export async function loadAliasMap(): Promise<AliasMap> {
  try {
    const members = await listFamilyMembers()
    return createAliasMap(members.map((m) => m.name))
  } catch {
    // Sin poder leer los miembros no se puede aliasar: mejor no enviar
    // nada que enviarlo con nombres reales.
    throw new AiUnavailableError('no_alias_map')
  }
}
