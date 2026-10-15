import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createServiceClient } from "../_shared/communityRuntime.ts"
import { handleMaintenance } from "./maintenance.ts"

// Mantenimiento de las fotos de Comunidad: borra del almacenamiento las de la cola de borrado y, una vez al día, busca fotos sueltas. La llama pg_cron cada
// 15 minutos (migración 0275) con la cabecera x-cron-secret. Toda la lógica está en maintenance.ts (código puro, probado por simulación). No usa IA.
// DESPLIEGUE: verify_jwt = false a propósito (la llama pg_net desde la base de datos, sin JWT de persona); se autentica con la cabecera x-cron-secret contra el
// secreto cron_shared_secret del Vault, igual que send-due-reminders y send-user-push.
const admin = createServiceClient()

Deno.serve((req) => handleMaintenance(req, { admin }))
