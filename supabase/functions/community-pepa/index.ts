import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { lazyCommunityAi } from "../_shared/communityAi.ts"
import { createServiceClient } from "../_shared/communityRuntime.ts"
import { handlePepa } from "./pepa.ts"

// Pepa responde en Comunidad: menciones @pepa y preguntas sin respuesta humana tras 6 horas (máx. 3 por hora móvil). La llama pg_cron cada 10 minutos
// (migración 0275) con la cabecera x-cron-secret (no JWT de persona). Toda la lógica está en pepa.ts (código puro, probado por simulación).
// NO usa ai_gate (es por familia): cuenta con los contadores de Comunidad y respeta su tope diario.
// DESPLIEGUE: verify_jwt = false a propósito (la llama pg_net desde la base de datos, sin JWT de persona); se autentica con la cabecera x-cron-secret contra el
// secreto cron_shared_secret del Vault, igual que send-due-reminders y send-user-push.
const admin = createServiceClient()

// La IA se prepara POR EJECUCIÓN y solo si hay algo que responder.
Deno.serve((req) => handlePepa(req, { admin, getAi: lazyCommunityAi(admin) }))
