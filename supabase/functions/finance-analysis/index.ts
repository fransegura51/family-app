import { serveAiPurpose } from "../_shared/ai/gateway.ts"
import { financeAnalysisSpec } from "../_shared/ai/purposes/financeAnalysis.ts"

// Análisis de Economía con IA (solo lectura). Recibe únicamente hechos agregados con referencia; la
// respuesta es un JSON estructurado y validado donde las cifras son referencias, no números. Toda la
// lógica común (sesión, adultos, interruptor, contadores, proveedor y modelo) vive en _shared/ai.
serveAiPurpose(financeAnalysisSpec)
