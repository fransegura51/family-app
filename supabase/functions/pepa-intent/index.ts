import { serveAiPurpose } from "../_shared/ai/gateway.ts"
import { pepaIntentSpec } from "../_shared/ai/purposes/pepaIntent.ts"

// Respaldo con IA para el botón 🐣 Pepa. Toda la lógica común (sesión,
// control de uso, proveedor y modelo, validación) vive en _shared/ai; el
// propósito concreto (prompt y formato de respuesta) en
// _shared/ai/purposes/pepaIntent.ts.
serveAiPurpose(pepaIntentSpec)
