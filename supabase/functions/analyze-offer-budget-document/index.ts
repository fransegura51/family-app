import { serveAiPurpose } from "../_shared/ai/gateway.ts"
import { offerBudgetDocumentSpec } from "../_shared/ai/purposes/offerBudgetDocument.ts"

// Lee un presupuesto/oferta de un proveedor (foto o PDF) con Gemini para PROPONER los datos de la oferta y
// sus servicios estructurados — Eventos → "📷 Importar presupuesto" (prompt maestro, Fase 6 / Parte B3).
// Toda la lógica común (sesión, interruptor/tope, cuenta adulta, proveedor y modelo, registro de uso) vive
// en _shared/ai/gateway.ts; el prompt y el parseo en _shared/ai/purposes/offerBudgetDocument.ts. La IA
// nunca guarda nada: el cliente enseña la propuesta, la familia la revisa/corrige y solo al confirmar se
// guarda como oferta (y sus líneas de servicio).
serveAiPurpose(offerBudgetDocumentSpec)
