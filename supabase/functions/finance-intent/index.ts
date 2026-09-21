import { serveAiPurpose } from "../_shared/ai/gateway.ts"
import { financeIntentSpec } from "../_shared/ai/purposes/financeIntent.ts"

// Interpretacion (no calculo) de preguntas de Economia que las reglas no entienden: recibe solo la frase con
// alias y la fecha, devuelve intencion, periodo y filtro validados. Toda la logica comun (sesion, adultos,
// interruptor, contadores, proveedor y modelo) vive en _shared/ai.
serveAiPurpose(financeIntentSpec)
