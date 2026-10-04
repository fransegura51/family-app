import { serveAiPurpose } from "../_shared/ai/gateway.ts"
import { eventFoodDocumentSpec } from "../_shared/ai/purposes/eventFoodDocument.ts"

// Lee un menú (foto o PDF) con Gemini para PROPONER los platos organizados por sección — Eventos → Comida
// y bebida. Un solo lector genérico para cualquier documento de comida. Toda la lógica común (sesión,
// interruptor/tope, cuenta adulta, proveedor y modelo, registro de uso) vive en _shared/ai/gateway.ts; el
// prompt y el parseo en _shared/ai/purposes/eventFoodDocument.ts. La IA nunca guarda nada: el cliente
// enseña la propuesta, la familia la revisa/corrige y solo al confirmar se guardan los platos.
serveAiPurpose(eventFoodDocumentSpec)
