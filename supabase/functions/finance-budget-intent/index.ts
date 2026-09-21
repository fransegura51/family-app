import { serveAiPurpose } from "../_shared/ai/gateway.ts"
import { financeBudgetIntentSpec } from "../_shared/ai/purposes/financeBudgetIntent.ts"

// Interpretacion (no ejecucion) de peticiones de presupuesto que las reglas no entienden: recibe solo la
// frase con alias y la fecha, devuelve categoria, importe y periodo validados. Toda la logica comun (sesion,
// adultos, interruptor, contadores, proveedor y modelo) vive en _shared/ai.
serveAiPurpose(financeBudgetIntentSpec)
