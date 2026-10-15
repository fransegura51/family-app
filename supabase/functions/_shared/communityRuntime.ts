import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"
import type { ServiceClient } from "./communityServer.ts"

// ÚNICO punto de las funciones de Comunidad que toca el entorno de Deno y el cliente real de Supabase. Todo lo demás (las funciones en sí) es código
// puro que recibe estos clientes «por la puerta», y por eso se puede probar por simulación en Node.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!

// Cliente con la clave de servicio (solo en el servidor; nunca llega al navegador). Se crea una vez por instancia de la función.
export function createServiceClient(): ServiceClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY) as unknown as ServiceClient
}

// Comprueba el JWT de la persona y devuelve un acceso que actúa COMO ELLA (las funciones SQL de lectura aplican sus propias reglas), o null.
export async function authenticateUser(authorization: string): Promise<{ rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> } | null> {
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authorization } } })
  const { data, error } = await userClient.auth.getUser()
  if (error || !data.user) return null
  return { rpc: (fn, args) => userClient.rpc(fn, args) }
}
