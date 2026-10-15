import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { lazyCommunityAi } from "../_shared/communityAi.ts"
import { authenticateUser, createServiceClient } from "../_shared/communityRuntime.ts"
import { handleSummarize } from "./summarize.ts"

// «Resumen de Pepa» de una conversación larga de Comunidad. La llama la app con el JWT de una persona con alias (body {post_id, force?}).
// Toda la lógica está en summarize.ts (código puro, probado por simulación). NO usa ai_gate (es por familia): cuenta con los contadores de Comunidad.
// DESPLIEGUE: verify_jwt = true (la llama la app con la sesión de una persona); además la función comprueba el alias y que no esté sancionada.
const admin = createServiceClient()

// La IA se prepara POR PETICIÓN (no se guarda entre peticiones): así un cambio de modelo o el interruptor global se notan al momento.
Deno.serve((req) => handleSummarize(req, { authenticate: authenticateUser, admin, getAi: lazyCommunityAi(admin) }))
