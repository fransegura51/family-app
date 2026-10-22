import { serveAiPurpose } from "../_shared/ai/gateway.ts"
import { helpSearchSpec } from "../_shared/ai/purposes/helpSearch.ts"

// Búsqueda con IA de la Ayuda «Pepa te acompaña»: solo ELIGE entre fichas verificadas (ver _shared/ai/purposes/helpSearch.ts). Sesión, control de uso, proveedor y modelo,
// y el tope diario de este propósito los pone la pasarela común (_shared/ai/gateway.ts). NO está desplegada hasta que se autorice (la web la usa solo con HELP_AI_ENABLED).
serveAiPurpose(helpSearchSpec)
