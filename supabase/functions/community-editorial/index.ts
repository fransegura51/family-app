import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { lazyCommunityAi } from "../_shared/communityAi.ts"
import { authenticateUser, createServiceClient } from "../_shared/communityRuntime.ts"
import { handleEditorial } from "./editorial.ts"

// Programa editorial semanal de Comunidad PEPA: genera los BORRADORES de la semana con IA (artículos, encuesta y menú) y rectifica borradores a petición de un
// administrador. GENERAR NO ES PUBLICAR: solo crea elementos «proposed»; nada se aprueba ni se publica desde aquí. Toda la lógica está en editorial.ts y sus
// módulos (código puro, probado por simulación).
// DESPLIEGUE: verify_jwt = false a propósito. La función se autentica sola: cabecera x-cron-secret (la llama pg_cron/pg_net) o JWT de una persona
// administradora (comprobada con community_admin_can_generate). Con CORS para el navegador.
const admin = createServiceClient()

// La IA se prepara POR PETICIÓN (no se guarda entre peticiones).
Deno.serve((req) => handleEditorial(req, { admin, getAi: lazyCommunityAi(admin), authenticate: authenticateUser }))
