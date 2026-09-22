import { serveAiPurpose } from "../_shared/ai/gateway.ts"
import { fridgePhotoSpec } from "../_shared/ai/purposes/fridgePhoto.ts"

// Reconoce alimentos en una foto del frigorífico/despensa con Gemini (nivel gratuito de Google AI Studio).
// FASE 7.1 (F7-001): toda la lógica común (sesión, interruptor/tope, cuenta adulta, proveedor y modelo,
// registro de uso) vive ahora en _shared/ai/gateway.ts; el prompt y el parseo (idénticos a los de siempre) en
// _shared/ai/purposes/fridgePhoto.ts.
serveAiPurpose(fridgePhotoSpec)
