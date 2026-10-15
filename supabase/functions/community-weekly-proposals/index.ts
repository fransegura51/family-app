import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { lazyCommunityAi } from "../_shared/communityAi.ts"
import { createServiceClient } from "../_shared/communityRuntime.ts"
import { handleWeekly } from "./proposals.ts"

// Lote semanal de contenido oficial de Comunidad (2-3 consejos de Pepa, una encuesta y, solo con datos externos fiables de Eurostat, un artículo), SIEMPRE
// como PROPUESTA para revisión humana: nada se publica sin que una persona administradora lo apruebe. La llama pg_cron los miércoles a las 08:00 UTC
// (migración 0275) con la cabecera x-cron-secret. Toda la lógica está en proposals.ts y eurostat.ts (código puro, probado por simulación).
// DESPLIEGUE: verify_jwt = false a propósito (la llama pg_net desde la base de datos, sin JWT de persona); se autentica con la cabecera x-cron-secret contra el
// secreto cron_shared_secret del Vault, igual que send-due-reminders y send-user-push.
const admin = createServiceClient()

Deno.serve((req) => handleWeekly(req, { admin, getAi: lazyCommunityAi(admin) }))
