import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"
import { createProvider, secretNameFor } from "./providers.ts"
import { AiProviderError, type AiPurposeSpec } from "./types.ts"

// Puerta única de la IA de PEPA en el servidor. Cada función (pepa-intent,
// split-grocery-list...) solo declara su propósito (AiPurposeSpec); todo lo
// demás vive aquí, una sola vez:
//
//   1. sesión válida (JWT del usuario)              -> 401
//   2. entrada válida según el propósito            -> 400
//   3. ai_gate: ¿puede usar la IA ahora? (adulta, interruptor global,
//      propósito apagado, familia apagada, tope diario)   -> 403
//   4. proveedor y modelo, leídos de ai_config (no escritos en el código)
//   5. llamada al proveedor, y contador de uso (SOLO números: nunca se
//      guarda ninguna frase, imagen ni respuesta)
//   6. la respuesta se valida de forma estricta antes de devolverla
//
// Regla de oro: si la parte de control (ai_gate / contadores) falla, PEPA
// sigue funcionando como antes — el control nunca puede romper una función
// que ya iba bien.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!

// Valores de siempre, por si la tabla de ajustes no respondiera.
const FALLBACK_PROVIDER = "gemini"
const FALLBACK_MODEL = "gemini-flash-lite-latest"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } })
}

export function createAiHandler<TInput, TOutput>(spec: AiPurposeSpec<TInput, TOutput>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS })

    try {
      const authHeader = req.headers.get("Authorization")
      if (!authHeader) return json({ error: "unauthorized" }, 401)

      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      })
      const { data: userData, error: userError } = await userClient.auth.getUser()
      if (userError || !userData.user) return json({ error: "unauthorized" }, 401)

      let body: Record<string, unknown>
      try {
        const parsedBody = await req.json()
        body = typeof parsedBody === "object" && parsedBody !== null ? parsedBody : {}
      } catch {
        return json({ error: "invalid body" }, 400)
      }
      const read = spec.readInput(body)
      if (!read.ok) return json({ error: read.error }, 400)

      const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

      let familyId: string | null = null
      let providerName = FALLBACK_PROVIDER
      let model = FALLBACK_MODEL
      const { data: gate, error: gateError } = await adminClient.rpc("ai_gate", {
        p_user: userData.user.id,
        p_purpose: spec.purpose,
      })
      if (gateError || !gate) {
        console.error("[ai] ai_gate no disponible, se sigue sin control:", spec.purpose)
      } else if (gate.allowed !== true) {
        return json({ error: "ai_not_allowed", reason: String(gate.reason ?? "unknown") }, 403)
      } else {
        familyId = typeof gate.family_id === "string" ? gate.family_id : null
        if (typeof gate.provider === "string" && gate.provider) providerName = gate.provider
        if (typeof gate.model === "string" && gate.model) model = gate.model
      }

      const { data: apiKey, error: keyError } = await adminClient.rpc("get_app_secret", {
        p_name: secretNameFor(providerName),
      })
      if (keyError || !apiKey) return json({ error: "service not configured" }, 500)

      const provider = createProvider(providerName, apiKey)

      let tokensIn = 0
      let tokensOut = 0
      let rawText = ""
      let failed = false
      try {
        const result = await provider.generate({
          model,
          parts: spec.buildParts(read.input),
          responseSchema: spec.responseSchema,
          maxOutputTokens: spec.maxOutputTokens,
        })
        rawText = result.text
        tokensIn = result.tokensIn
        tokensOut = result.tokensOut
      } catch (err) {
        failed = true
        console.error("[ai] fallo del proveedor:", spec.purpose, err instanceof AiProviderError ? err.status : "unknown")
      }

      if (familyId) {
        const { error: usageError } = await adminClient.rpc("ai_record_usage", {
          p_family: familyId,
          p_purpose: spec.purpose,
          p_tokens_in: tokensIn,
          p_tokens_out: tokensOut,
          p_error: failed,
        })
        if (usageError) console.error("[ai] no se pudo anotar el uso:", spec.purpose)
      }

      if (failed) return json({ error: "ai_provider_error" }, 502)

      // Un propósito que exige un formato estricto puede rechazar la respuesta:
      // se informa sin romper nada.
      try {
        return json(spec.parseOutput(rawText, read.input))
      } catch {
        return json({ error: "ai_invalid_output" }, 502)
      }
    } catch (err) {
      console.error("[ai] error inesperado:", spec.purpose, String(err))
      return json({ error: "internal_error" }, 500)
    }
  }
}

export function serveAiPurpose<TInput, TOutput>(spec: AiPurposeSpec<TInput, TOutput>) {
  Deno.serve(createAiHandler(spec))
}
