import { serveAiPurpose } from "../_shared/ai/gateway.ts"
import { recipeGenerateSpec } from "../_shared/ai/purposes/recipeGenerate.ts"

// Propuesta de receta con IA (nunca se guarda desde aquí). Toda la lógica común
// (sesión, adultos, interruptor, contadores, proveedor y modelo) vive en
// _shared/ai; el propósito concreto en _shared/ai/purposes/recipeGenerate.ts.
serveAiPurpose(recipeGenerateSpec)
